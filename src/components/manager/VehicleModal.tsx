import { useState } from 'react';
import { supabase } from '@/services/supabaseClient';
import { updateSubscriptionQuantity } from '@/services/stripeClient';
import { X, Loader2 } from 'lucide-react';
import type { Vehicle, VehicleType, VehicleStatus } from '@/types';
import { VEHICLE_TYPES, VEHICLE_STATUSES } from '@/types';

interface VehicleModalProps {
  vehicle: Vehicle | null;
  orgId: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function VehicleModal({ vehicle, orgId, userId, onClose, onSaved }: VehicleModalProps) {
  const isEditing = !!vehicle;

  const [registration, setRegistration] = useState(vehicle?.registration ?? '');
  const [vehicleType, setVehicleType] = useState<VehicleType>(vehicle?.vehicle_type ?? 'tipper');
  const [make, setMake] = useState(vehicle?.make ?? '');
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [vin, setVin] = useState(vehicle?.vin ?? '');
  const [registrationKeeper] = useState(vehicle?.registration_keeper ?? '');
  const [oLicenceNumber, setOLicenceNumber] = useState(vehicle?.o_licence_number ?? '');
  const [motDueDate, setMotDueDate] = useState(vehicle?.mot_due_date ?? '');
  const [lastPmiDate, setLastPmiDate] = useState(vehicle?.last_pmi_date ?? '');
  const [status, setStatus] = useState<VehicleStatus>(vehicle?.status ?? 'active');
  const [statusNotes, setStatusNotes] = useState(vehicle?.status_notes ?? '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registration.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const data = {
        org_id: orgId,
        registration: registration.trim().toUpperCase(),
        vehicle_type: vehicleType,
        make: make.trim() || null,
        model: model.trim() || null,
        vin: vin.trim() || null,
        registration_keeper: registrationKeeper.trim() || null,
        o_licence_number: oLicenceNumber.trim() || null,
        mot_due_date: motDueDate || null,
        last_pmi_date: lastPmiDate || null,
        status,
        status_notes: statusNotes.trim() || null,
        status_changed_at: vehicle?.status !== status ? new Date().toISOString() : vehicle?.status_changed_at,
        status_changed_by: vehicle?.status !== status ? userId : vehicle?.status_changed_by,
      };

      if (isEditing) {
        const { error: updateError } = await supabase
          .from('vehicles')
          .update(data)
          .eq('id', vehicle.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('vehicles').insert({
          ...data,
          created_by: userId,
        });

        if (insertError) throw insertError;
      }

      // Update subscription if vehicle count changed
      // (new vehicle added OR status changed to/from active)
      const statusChanged = isEditing && vehicle?.status !== status;
      const isNewActiveVehicle = !isEditing && status === 'active';

      if (statusChanged || isNewActiveVehicle) {
        // Get updated vehicle count
        const { count } = await supabase
          .from('vehicles')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('status', 'active');

        // Update subscription quantity (fire and forget - don't block UI)
        updateSubscriptionQuantity(orgId, count ?? 0).catch(console.error);
      }

      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save vehicle';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">
            {isEditing ? 'Edit Vehicle' : 'Add Vehicle'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Registration *
              </label>
              <input
                type="text"
                required
                value={registration}
                onChange={(e) => setRegistration(e.target.value.toUpperCase())}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg uppercase font-mono text-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                placeholder="AB12 CDE"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Vehicle Type *
              </label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              >
                {VEHICLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as VehicleStatus)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              >
                {VEHICLE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Make</label>
              <input
                type="text"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                placeholder="DAF"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                placeholder="CF 400"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">VIN</label>
              <input
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                placeholder="WVWZZZ3CZWE123456"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">MOT Due Date</label>
              <input
                type="date"
                value={motDueDate}
                onChange={(e) => setMotDueDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Last PMI Date</label>
              <input
                type="date"
                value={lastPmiDate}
                onChange={(e) => setLastPmiDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">O-Licence Number</label>
              <input
                type="text"
                value={oLicenceNumber}
                onChange={(e) => setOLicenceNumber(e.target.value.toUpperCase())}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                placeholder="OB1234567"
              />
            </div>

            {status !== 'active' && (
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Status Notes</label>
                <textarea
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="Reason for VOR / retirement..."
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Add Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
