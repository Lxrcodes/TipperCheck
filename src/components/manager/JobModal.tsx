import { useState } from 'react';
import { supabase } from '@/services/supabaseClient';
import { X, Loader2 } from 'lucide-react';
import { AddressAutocomplete } from '@/components/shared/AddressAutocomplete';
import type { Job, JobStatus } from '@/types';

interface JobModalProps {
  job: Job | null;
  orgId: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

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

export function JobModal({ job, orgId, userId, onClose, onSaved }: JobModalProps) {
  const isEditing = !!job;

  const [title,        setTitle]        = useState(job?.title ?? '');
  const [description,  setDescription]  = useState(job?.description ?? '');
  const [collectionAddr, setCollectionAddr] = useState(job?.collection_address ?? '');
  const [collectionLat,  setCollectionLat]  = useState<number | null>(job?.collection_lat ?? null);
  const [collectionLng,  setCollectionLng]  = useState<number | null>(job?.collection_lng ?? null);
  const [disposalAddr,   setDisposalAddr]   = useState(job?.disposal_address ?? '');
  const [disposalLat,    setDisposalLat]    = useState<number | null>(job?.disposal_lat ?? null);
  const [disposalLng,    setDisposalLng]    = useState<number | null>(job?.disposal_lng ?? null);
  const [startDate,    setStartDate]    = useState(job?.start_date ?? '');
  const [status,       setStatus]       = useState<JobStatus>(job?.status ?? 'pending');

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

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
            collection_address: collectionAddr.trim() || null,
            collection_lat:     collectionLat,
            collection_lng:     collectionLng,
            disposal_address:   disposalAddr.trim() || null,
            disposal_lat:       disposalLat,
            disposal_lng:       disposalLng,
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
      } else {
        const { error: insertError } = await supabase
          .from('jobs')
          .insert({
            org_id:             orgId,
            created_by:         userId,
            title:              title.trim(),
            description:        description.trim() || null,
            collection_address: collectionAddr.trim() || null,
            collection_lat:     collectionLat,
            collection_lng:     collectionLng,
            disposal_address:   disposalAddr.trim() || null,
            disposal_lat:       disposalLat,
            disposal_lng:       disposalLng,
            start_date:         startDate || null,
            status:             'pending',
          });

        if (insertError) throw insertError;
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

          {/* Start Date */}
          <div>
            {fieldLabel('Start Date')}
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Notes */}
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
