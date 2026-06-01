import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';
import { X, Loader2, Truck, ChevronUp, Plus, Minus } from 'lucide-react';
import { AddressAutocomplete } from '@/components/shared/AddressAutocomplete';
import type { Job, JobStatus, JobDirection, MaterialType, Vehicle, User, JobAssignment } from '@/types';

interface JobModalProps {
  job: Job | null;
  orgId: string;
  userId: string;
  vehicles: Vehicle[];
  drivers: User[];
  onClose: () => void;
  onSaved: () => void;
}

type AssignmentRow = {
  id?: string;              // set if loaded from DB
  vehicleId: string;
  driverId: string;
  loadsAssigned: number;
};

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'pending',   label: 'Pending' },
  { value: 'active',    label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function fieldLabel(text: string, required?: boolean) {
  return (
    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
      {text}{required && ' *'}
    </label>
  );
}

export function JobModal({ job, orgId, userId, vehicles, drivers, onClose, onSaved }: JobModalProps) {
  const isEditing = !!job;

  // Job fields
  const [title,        setTitle]        = useState(job?.title ?? '');
  const [description,  setDescription]  = useState(job?.description ?? '');
  const [direction,    setDirection]    = useState<JobDirection | ''>(job?.direction ?? '');
  const [materialId,   setMaterialId]   = useState(job?.material_type_id ?? '');
  const [collectionAddr, setCollectionAddr] = useState(job?.collection_address ?? '');
  const [collectionLat,  setCollectionLat]  = useState<number | null>(job?.collection_lat ?? null);
  const [collectionLng,  setCollectionLng]  = useState<number | null>(job?.collection_lng ?? null);
  const [disposalAddr,   setDisposalAddr]   = useState(job?.disposal_address ?? '');
  const [disposalLat,    setDisposalLat]    = useState<number | null>(job?.disposal_lat ?? null);
  const [disposalLng,    setDisposalLng]    = useState<number | null>(job?.disposal_lng ?? null);
  const [ratePerLoad,  setRatePerLoad]  = useState(job?.rate_per_load?.toString() ?? '');
  const [startDate,    setStartDate]    = useState(job?.start_date ?? '');
  const [status,       setStatus]       = useState<JobStatus>(job?.status ?? 'pending');

  // Reference data
  const [materials,    setMaterials]    = useState<MaterialType[]>([]);

  // Assignments
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const activeVehicles = vehicles.filter((v) => v.status === 'active');
  const activeDrivers  = drivers.filter((u) => u.roles.includes('driver') && u.is_active);

  // Load material types once
  useEffect(() => {
    supabase
      .from('material_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (data) setMaterials(data as MaterialType[]);
      });
  }, []);

  // Load existing assignments when editing
  useEffect(() => {
    if (!isEditing || !job) return;
    supabase
      .from('job_assignments')
      .select('*')
      .eq('job_id', job.id)
      .then(({ data }) => {
        if (data) {
          setAssignments(
            (data as JobAssignment[]).map((a) => ({
              id: a.id,
              vehicleId: a.vehicle_id ?? '',
              driverId: a.driver_id ?? '',
              loadsAssigned: a.loads_assigned,
            }))
          );
        }
      });
  }, [isEditing, job]);

  // Reset material selection when direction changes and material no longer valid
  useEffect(() => {
    if (!materialId || !direction) return;
    const mat = materials.find((m) => m.id === materialId);
    if (mat && mat.direction !== direction && mat.direction !== 'both') {
      setMaterialId('');
    }
  }, [direction, materials, materialId]);

  const filteredMaterials = direction
    ? materials.filter((m) => m.direction === direction || m.direction === 'both')
    : materials;

  const assignedVehicleIds = new Set(assignments.map((a) => a.vehicleId).filter(Boolean));

  const totalLoads = assignments.reduce((sum, a) => sum + a.loadsAssigned, 0) || 1;

  function addVehicle(vehicleId: string) {
    setAssignments((prev) => [...prev, { vehicleId, driverId: '', loadsAssigned: 1 }]);
  }

  function removeAssignment(index: number) {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
  }

  function updateAssignment(index: number, patch: Partial<AssignmentRow>) {
    setAssignments((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError(null);

    try {
      if (isEditing) {
        const prevStatus = job.status;

        const { error: updateError } = await supabase
          .from('jobs')
          .update({
            title:              title.trim(),
            description:        description.trim() || null,
            direction:          direction || null,
            material_type_id:   materialId || null,
            collection_address: collectionAddr.trim() || null,
            collection_lat:     collectionLat,
            collection_lng:     collectionLng,
            disposal_address:   disposalAddr.trim() || null,
            disposal_lat:       disposalLat,
            disposal_lng:       disposalLng,
            total_loads:        totalLoads,
            rate_per_load:      ratePerLoad ? parseFloat(ratePerLoad) : null,
            start_date:         startDate || null,
            status,
          })
          .eq('id', job.id);

        if (updateError) throw updateError;

        if (status !== prevStatus) {
          await supabase.from('job_status_history').insert({
            job_id:     job.id,
            status,
            changed_by: userId,
          });
        }

        // Insert new assignments (those without an id)
        const newAssignments = assignments.filter((a) => !a.id && a.vehicleId);
        if (newAssignments.length > 0) {
          const { error: assignError } = await supabase.from('job_assignments').insert(
            newAssignments.map((a) => ({
              job_id:         job.id,
              vehicle_id:     a.vehicleId || null,
              driver_id:      a.driverId  || null,
              loads_assigned: a.loadsAssigned,
            }))
          );
          if (assignError) throw assignError;
        }

        // Update existing assignments' loads_assigned + driver_id
        for (const a of assignments.filter((a) => a.id)) {
          await supabase
            .from('job_assignments')
            .update({ driver_id: a.driverId || null, loads_assigned: a.loadsAssigned })
            .eq('id', a.id!);
        }
      } else {
        // Insert job — reference + job_code generated by DB trigger
        const { data: newJob, error: insertError } = await supabase
          .from('jobs')
          .insert({
            org_id:             orgId,
            created_by:         userId,
            title:              title.trim(),
            description:        description.trim() || null,
            direction:          direction || null,
            material_type_id:   materialId || null,
            collection_address: collectionAddr.trim() || null,
            collection_lat:     collectionLat,
            collection_lng:     collectionLng,
            disposal_address:   disposalAddr.trim() || null,
            disposal_lat:       disposalLat,
            disposal_lng:       disposalLng,
            total_loads:        totalLoads,
            rate_per_load:      ratePerLoad ? parseFloat(ratePerLoad) : null,
            start_date:         startDate || null,
            status:             'pending',
          })
          .select('id')
          .single();

        if (insertError) throw insertError;

        if (assignments.length > 0) {
          const { error: assignError } = await supabase.from('job_assignments').insert(
            assignments.filter((a) => a.vehicleId).map((a) => ({
              job_id:         newJob.id,
              vehicle_id:     a.vehicleId || null,
              driver_id:      a.driverId  || null,
              loads_assigned: a.loadsAssigned,
            }))
          );
          if (assignError) throw assignError;
        }
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save job.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-lg font-bold text-slate-900">
            {isEditing ? `Edit Job — ${job.reference}` : 'New Job'}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Reference badges (editing only) */}
          {isEditing && (
            <div className="flex gap-3">
              <div className="flex-1 bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-0.5">Reference</p>
                <p className="font-mono font-bold text-slate-900 text-sm">{job.reference}</p>
              </div>
              <div className="flex-1 bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-0.5">Job Code</p>
                <p className="font-mono font-bold text-slate-900 text-sm">{job.job_code}</p>
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            {fieldLabel('Job Title', true)}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Excavation waste removal — Site A"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Direction */}
          <div>
            {fieldLabel('Direction')}
            <div className="grid grid-cols-2 gap-2">
              {(['import', 'export'] as JobDirection[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    direction === d
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  {d === 'import' ? 'Import (IN)' : 'Export (OUT)'}
                </button>
              ))}
            </div>
          </div>

          {/* Material type */}
          <div>
            {fieldLabel('Material')}
            <select
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="">— Select material —</option>
              {filteredMaterials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
          </div>

          {/* Addresses */}
          <AddressAutocomplete
            label="Collection Address"
            value={collectionAddr}
            onChange={setCollectionAddr}
            onSelect={(r) => {
              setCollectionAddr(r.address);
              setCollectionLat(r.lat);
              setCollectionLng(r.lng);
            }}
            placeholder="Where to collect from…"
          />

          <AddressAutocomplete
            label="Disposal Address"
            value={disposalAddr}
            onChange={setDisposalAddr}
            onSelect={(r) => {
              setDisposalAddr(r.address);
              setDisposalLat(r.lat);
              setDisposalLng(r.lng);
            }}
            placeholder="Where to tip/deliver to…"
          />

          {/* Date + Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              {fieldLabel('Start Date')}
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              {fieldLabel('Rate / Load (£)')}
              <input
                type="number"
                min="0"
                step="0.01"
                value={ratePerLoad}
                onChange={(e) => setRatePerLoad(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            {fieldLabel('Notes')}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional notes"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* Vehicle Assignments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              {fieldLabel('Vehicles')}
              {totalLoads > 0 && (
                <span className="text-xs font-semibold text-orange-600">
                  {totalLoads} load{totalLoads !== 1 ? 's' : ''} total
                </span>
              )}
            </div>

            {/* Assigned vehicles */}
            <div className="space-y-2 mb-3">
              {assignments.map((a, i) => {
                const v = vehicles.find((v) => v.id === a.vehicleId);
                return (
                  <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-slate-500" />
                        <span className="font-semibold text-slate-800 text-sm">{v?.registration ?? a.vehicleId}</span>
                        {v?.make && <span className="text-xs text-slate-500">{v.make}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAssignment(i)}
                        className="text-slate-400 hover:text-red-500 p-0.5"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Driver</p>
                        <select
                          value={a.driverId}
                          onChange={(e) => updateAssignment(i, { driverId: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                        >
                          <option value="">— Unassigned —</option>
                          {activeDrivers.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Loads</p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateAssignment(i, { loadsAssigned: Math.max(1, a.loadsAssigned - 1) })}
                            className="p-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="flex-1 text-center text-sm font-bold text-slate-800">{a.loadsAssigned}</span>
                          <button
                            type="button"
                            onClick={() => updateAssignment(i, { loadsAssigned: a.loadsAssigned + 1 })}
                            className="p-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add vehicle dropdown */}
            {activeVehicles.filter((v) => !assignedVehicleIds.has(v.id)).length > 0 && (
              <div className="relative">
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) addVehicle(e.target.value); }}
                  className="w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none appearance-none"
                >
                  <option value="">+ Add vehicle…</option>
                  {activeVehicles
                    .filter((v) => !assignedVehicleIds.has(v.id))
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.registration}{v.make ? ` — ${v.make}` : ''}
                      </option>
                    ))}
                </select>
                <Plus className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Status (editing only) */}
          {isEditing && (
            <div>
              {fieldLabel('Status')}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as JobStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEditing ? 'Save Changes' : 'Create Job'}
          </button>
        </div>
      </div>
    </div>
  );
}
