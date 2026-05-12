import { useState } from 'react';
import { supabase } from '@/services/supabaseClient';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import type { Vehicle, DefectSeverity, PmiResult } from '@/types';

interface PmiIssue {
  description: string;
  severity: DefectSeverity;
}

interface PmiRecordModalProps {
  vehicle: Vehicle;
  orgId: string;
  userId: string;
  userName: string;
  onClose: () => void;
  onSaved: () => void;
}

function addWeeks(dateStr: string, weeks: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().split('T')[0];
}

export function PmiRecordModal({
  vehicle,
  orgId,
  userId,
  userName,
  onClose,
  onSaved,
}: PmiRecordModalProps) {
  const today = new Date().toISOString().split('T')[0];

  const [pmiDate, setPmiDate] = useState(today);
  const [result, setResult] = useState<PmiResult>('pass');
  const [advisoryNotes, setAdvisoryNotes] = useState('');
  const [issues, setIssues] = useState<PmiIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const intervalWeeks = vehicle.pmi_interval_weeks ?? 6;
  const nextDueDate = addWeeks(pmiDate, intervalWeeks);

  const addIssue = () => {
    setIssues([...issues, { description: '', severity: 'major' }]);
  };

  const updateIssue = (index: number, field: keyof PmiIssue, value: string) => {
    const updated = [...issues];
    updated[index] = { ...updated[index], [field]: value };
    setIssues(updated);
  };

  const removeIssue = (index: number) => {
    setIssues(issues.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validIssues = issues.filter((i) => i.description.trim());
    if (issues.length > 0 && validIssues.length < issues.length) {
      setError('All issues must have a description');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Insert PMI record
      const { data: pmiRecord, error: pmiError } = await supabase
        .from('pmi_records')
        .insert({
          org_id: orgId,
          vehicle_id: vehicle.id,
          vehicle_registration: vehicle.registration,
          pmi_date: pmiDate,
          next_due_date: nextDueDate,
          interval_weeks: intervalWeeks,
          result,
          advisory_notes: advisoryNotes.trim() || null,
          recorded_by: userId,
          recorded_by_name: userName,
        })
        .select()
        .single();

      if (pmiError) throw pmiError;

      // 2. Update vehicle PMI dates
      const { error: vehicleError } = await supabase
        .from('vehicles')
        .update({
          last_pmi_date: pmiDate,
          next_pmi_due_date: nextDueDate,
        })
        .eq('id', vehicle.id);

      if (vehicleError) throw vehicleError;

      // 3. Insert a defect for each issue found
      if (validIssues.length > 0) {
        const defectRows = validIssues.map((issue) => ({
          org_id: orgId,
          vehicle_id: vehicle.id,
          vehicle_registration: vehicle.registration,
          pmi_record_id: pmiRecord.id,
          check_run_id: null,
          mot_record_id: null,
          reported_by_name: userName,
          reported_at: new Date().toISOString(),
          item_id: `pmi_issue_${crypto.randomUUID()}`,
          item_label: issue.description.trim(),
          category: 'PMI',
          severity: issue.severity,
          status: 'raised',
          photo_urls: [],
          driver_notes: null,
          sms_sent: false,
        }));

        const { error: defectsError } = await supabase.from('defects').insert(defectRows);
        if (defectsError) throw defectsError;
      }

      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to record PMI';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Record PMI</h2>
            <p className="text-sm text-slate-500 font-mono">{vehicle.registration}</p>
          </div>
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

          {/* PMI Date */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">PMI Date</label>
            <input
              type="date"
              required
              value={pmiDate}
              max={today}
              onChange={(e) => setPmiDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Result */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Result</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setResult('pass')}
                className={`flex-1 py-2 px-4 rounded-lg font-bold border-2 transition-colors ${
                  result === 'pass'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                Pass
              </button>
              <button
                type="button"
                onClick={() => setResult('fail')}
                className={`flex-1 py-2 px-4 rounded-lg font-bold border-2 transition-colors ${
                  result === 'fail'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                Fail
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Next PMI due:{' '}
              <span className="font-medium text-slate-700">
                {new Date(nextDueDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              {' '}({intervalWeeks} week{intervalWeeks !== 1 ? 's' : ''} from test date)
            </p>
          </div>

          {/* Issues Found */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Issues Found {issues.length > 0 && `(${issues.length})`}
              </label>
              <button
                type="button"
                onClick={addIssue}
                className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-medium"
              >
                <Plus className="w-3 h-3" />
                Add Issue
              </button>
            </div>

            {issues.length === 0 && (
              <p className="text-xs text-slate-400 italic">
                No issues — add any defects or advisories found during the PMI
              </p>
            )}

            {issues.map((issue, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  <input
                    type="text"
                    value={issue.description}
                    onChange={(e) => updateIssue(index, 'description', e.target.value)}
                    placeholder="Describe the issue or advisory..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  />
                </div>
                <select
                  value={issue.severity}
                  onChange={(e) => updateIssue(index, 'severity', e.target.value)}
                  className="px-2 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                >
                  <option value="critical">Critical</option>
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeIssue(index)}
                  className="p-2 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Advisory Notes */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Notes / Advisories</label>
            <textarea
              value={advisoryNotes}
              onChange={(e) => setAdvisoryNotes(e.target.value)}
              rows={2}
              placeholder="General notes from the PMI inspector..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
            />
          </div>

          <div className="flex gap-3 pt-2">
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
              Record PMI
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
