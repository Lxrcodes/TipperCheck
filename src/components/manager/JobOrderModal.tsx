import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';
import { X, Loader2, Truck, Plus, Minus, ChevronUp } from 'lucide-react';
import type { JobOrder, JobDirection, MaterialType, Vehicle, JobAssignment } from '@/types';

interface JobOrderModalProps {
  order: JobOrder | null;
  jobId: string;
  jobCode: string;
  jobStartDate: string | null;
  orgId: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

type AssignmentRow = {
  id?: string;
  vehicleId: string;
  loadsAssigned: number;
};

function fieldLabel(text: string, required?: boolean) {
  return (
    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
      {text}{required && ' *'}
    </label>
  );
}

export function JobOrderModal({ order, jobId, jobCode, jobStartDate, orgId, userId, onClose, onSaved }: JobOrderModalProps) {
  const isEditing = !!order;

  const [direction,   setDirection]   = useState<JobDirection | ''>(order?.direction ?? '');
  const [materialId,  setMaterialId]  = useState(order?.material_type_id ?? '');
  const [orderDate,   setOrderDate]   = useState(order?.order_date ?? '');
  const [ratePerLoad, setRatePerLoad] = useState(order?.rate_per_load?.toString() ?? '');
  const [notes,       setNotes]       = useState(order?.notes ?? '');

  const [materials,  setMaterials]  = useState<MaterialType[]>([]);
  const [vehicles,   setVehicles]   = useState<Vehicle[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Load reference data
  useEffect(() => {
    Promise.all([
      supabase.from('material_types').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('vehicles').select('*').eq('org_id', orgId).eq('status', 'active').order('registration'),
    ]).then(([matsRes, vecsRes]) => {
      if (matsRes.data) setMaterials(matsRes.data as MaterialType[]);
      if (vecsRes.data)  setVehicles(vecsRes.data as Vehicle[]);
    });
  }, [orgId]);

  // Load existing assignments when editing
  useEffect(() => {
    if (!isEditing || !order) return;
    supabase
      .from('job_assignments')
      .select('*')
      .eq('job_order_id', order.id)
      .then(({ data }) => {
        if (data) {
          setAssignments(
            (data as JobAssignment[]).map((a) => ({
              id: a.id,
              vehicleId: a.vehicle_id ?? '',
              loadsAssigned: a.loads_assigned,
            }))
          );
        }
      });
  }, [isEditing, order]);

  // Reset material when direction changes and material no longer matches
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
    setAssignments((prev) => [...prev, { vehicleId, loadsAssigned: 1 }]);
  }

  function removeAssignment(index: number) {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
  }

  function updateAssignment(index: number, patch: Partial<AssignmentRow>) {
    setAssignments((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      if (isEditing) {
        const { error: updateError } = await supabase
          .from('job_orders')
          .update({
            material_type_id: materialId || null,
            direction:        direction || null,
            order_date:       orderDate || null,
            total_loads:      totalLoads,
            rate_per_load:    ratePerLoad ? parseFloat(ratePerLoad) : null,
            notes:            notes.trim() || null,
            updated_at:       new Date().toISOString(),
          })
          .eq('id', order.id);

        if (updateError) throw updateError;

        // Insert new assignments
        const newAssignments = assignments.filter((a) => !a.id && a.vehicleId);
        if (newAssignments.length > 0) {
          const { data: created, error: assignError } = await supabase
            .from('job_assignments')
            .insert(newAssignments.map((a) => ({
              job_id:         jobId,
              job_order_id:   order.id,
              vehicle_id:     a.vehicleId,
              loads_assigned: a.loadsAssigned,
            })))
            .select('id, loads_assigned');
          if (assignError) throw assignError;

          const loadRows = (created ?? []).flatMap((a) =>
            Array.from({ length: a.loads_assigned }, (_, i) => ({
              job_id:        jobId,
              assignment_id: a.id,
              org_id:        orgId,
              load_number:   i + 1,
            }))
          );
          if (loadRows.length > 0) {
            const { error: loadsError } = await supabase.from('loads').insert(loadRows);
            if (loadsError) throw loadsError;
          }
        }

        // Update existing assignments
        for (const a of assignments.filter((a) => a.id)) {
          await supabase
            .from('job_assignments')
            .update({ loads_assigned: a.loadsAssigned })
            .eq('id', a.id!);
        }
      } else {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase
          .from('job_orders')
          .insert({
            job_id:           jobId,
            org_id:           orgId,
            created_by:       userId,
            material_type_id: materialId || null,
            direction:        direction || null,
            order_date:       orderDate || null,
            total_loads:      totalLoads,
            rate_per_load:    ratePerLoad ? parseFloat(ratePerLoad) : null,
            notes:            notes.trim() || null,
          })
          .select('id')
          .single();

        if (orderError) throw orderError;

        const validAssignments = assignments.filter((a) => a.vehicleId);
        if (validAssignments.length > 0) {
          const { data: created, error: assignError } = await supabase
            .from('job_assignments')
            .insert(validAssignments.map((a) => ({
              job_id:         jobId,
              job_order_id:   newOrder.id,
              vehicle_id:     a.vehicleId,
              loads_assigned: a.loadsAssigned,
            })))
            .select('id, loads_assigned');
          if (assignError) throw assignError;

          const loadRows = (created ?? []).flatMap((a) =>
            Array.from({ length: a.loads_assigned }, (_, i) => ({
              job_id:        jobId,
              assignment_id: a.id,
              org_id:        orgId,
              load_number:   i + 1,
            }))
          );
          if (loadRows.length > 0) {
            const { error: loadsError } = await supabase.from('loads').insert(loadRows);
            if (loadsError) throw loadsError;
          }
        }
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isEditing ? 'Edit Order' : 'Add Order'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Job <span className="font-mono font-bold text-orange-500">{jobCode}</span></p>
          </div>
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

          {/* Date */}
          <div>
            {fieldLabel('Order Date')}
            <input
              type="date"
              value={orderDate}
              min={jobStartDate ?? new Date().toISOString().split('T')[0]}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Rate */}
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
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-500">Loads:</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateAssignment(i, { loadsAssigned: Math.max(1, a.loadsAssigned - 1) })}
                          className="p-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-slate-800">{a.loadsAssigned}</span>
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
                );
              })}
            </div>

            {vehicles.filter((v) => !assignedVehicleIds.has(v.id)).length > 0 && (
              <div className="relative">
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) addVehicle(e.target.value); }}
                  className="w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none appearance-none"
                >
                  <option value="">+ Add vehicle…</option>
                  {vehicles
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

          {/* Notes */}
          <div>
            {fieldLabel('Order Notes')}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes for this order"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
            />
          </div>
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
            disabled={saving}
            className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEditing ? 'Save Order' : 'Add Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
