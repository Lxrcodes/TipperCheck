import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import type { Invoice, InvoiceItem, Job, MaterialType } from '@/types';

// ============================================================================
// Types
// ============================================================================

type JobWithMaterial = Job & { material_types: { name: string; code: string } | null };

interface DraftItem {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
}

interface InvoiceModalProps {
  invoice: Invoice | null;    // null = create new
  orgId: string;
  userId: string;
  prefillJob?: JobWithMaterial | null;
  onClose: () => void;
  onSaved: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function newDraftItem(): DraftItem {
  return { id: crypto.randomUUID(), description: '', quantity: '1', unit_price: '' };
}

function calcTotals(items: DraftItem[], vatEnabled: boolean) {
  const net = items.reduce((sum, it) => {
    const qty = parseFloat(it.quantity) || 0;
    const price = parseFloat(it.unit_price) || 0;
    return sum + qty * price;
  }, 0);
  const vat = vatEnabled ? net * 0.2 : 0;
  return { net, vat, gross: net + vat };
}

function itemsFromJob(job: JobWithMaterial): DraftItem[] {
  return [{
    id: crypto.randomUUID(),
    description: `${job.title}${job.material_types ? ' – ' + job.material_types.name : ''}`,
    quantity: String(job.total_loads || 1),
    unit_price: job.rate_per_load ? String(job.rate_per_load) : '',
  }];
}

function isItemsBlank(items: DraftItem[]) {
  return items.length === 1 && !items[0].description && !items[0].unit_price;
}

// ============================================================================
// Component
// ============================================================================

export function InvoiceModal({
  invoice,
  orgId,
  userId,
  prefillJob,
  onClose,
  onSaved,
}: InvoiceModalProps) {
  const isEdit = !!invoice;

  // Reference data
  const [availableJobs, setAvailableJobs] = useState<JobWithMaterial[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [refLoading, setRefLoading] = useState(true);

  // Job + material selectors
  const [selectedJobId, setSelectedJobId] = useState<string>(
    prefillJob?.id ?? invoice?.job_id ?? ''
  );
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(
    prefillJob?.material_type_id ?? invoice?.material_type_id ?? ''
  );
  // Track whether current selections were auto-filled from a job (so switching jobs updates them)
  const [autoFilledJobId, setAutoFilledJobId] = useState<string>(prefillJob?.id ?? '');
  const [materialAutoFilled, setMaterialAutoFilled] = useState<boolean>(
    !!(prefillJob?.material_type_id)
  );

  // Form state
  const [clientName, setClientName] = useState(invoice?.client_name ?? '');
  const [clientAddress, setClientAddress] = useState(invoice?.client_address ?? '');
  const [clientEmail, setClientEmail] = useState(invoice?.client_email ?? '');
  const [issueDate, setIssueDate] = useState(
    invoice?.issue_date ?? new Date().toISOString().split('T')[0]
  );
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? '');
  const [vatEnabled, setVatEnabled] = useState(invoice?.vat_enabled ?? true);
  const [notes, setNotes] = useState(invoice?.notes ?? '');
  const [items, setItems] = useState<DraftItem[]>([newDraftItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load jobs + material types in parallel
  useEffect(() => {
    Promise.all([
      supabase
        .from('jobs')
        .select('*, material_types(name, code)')
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }),
      supabase
        .from('material_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order'),
    ]).then(([jobsRes, matsRes]) => {
      setAvailableJobs((jobsRes.data ?? []) as JobWithMaterial[]);
      setMaterialTypes((matsRes.data ?? []) as MaterialType[]);
      setRefLoading(false);
    });
  }, [orgId]);

  // Load existing items when editing
  useEffect(() => {
    if (!invoice) return;
    supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('sort_order')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setItems(
            (data as InvoiceItem[]).map((it) => ({
              id: it.id,
              description: it.description,
              quantity: String(it.quantity),
              unit_price: String(it.unit_price),
            }))
          );
        }
      });
  }, [invoice?.id]);

  // Pre-fill items from prefillJob on first render (new invoice from job detail)
  useEffect(() => {
    if (!isEdit && prefillJob) {
      setItems(itemsFromJob(prefillJob));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user picks a job, update items (if auto-filled or blank) and material (if auto-filled or blank)
  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    if (!jobId) {
      setAutoFilledJobId('');
      return;
    }
    const job = availableJobs.find((j) => j.id === jobId);
    if (!job) return;

    // Update line items if still blank or previously auto-filled
    if (isItemsBlank(items) || autoFilledJobId) {
      setItems(itemsFromJob(job));
      setAutoFilledJobId(jobId);
    }

    // Update material if job has one and material is still auto-filled or blank
    if (job.material_type_id && (materialAutoFilled || !selectedMaterialId)) {
      setSelectedMaterialId(job.material_type_id);
      setMaterialAutoFilled(true);
    }
  };

  const handleMaterialSelect = (materialId: string) => {
    setSelectedMaterialId(materialId);
    setMaterialAutoFilled(false);
  };

  const { net, vat, gross } = calcTotals(items, vatEnabled);

  const updateItem = (id: string, field: keyof DraftItem, value: string) => {
    setAutoFilledJobId('');
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  };

  const addItem = () => {
    setAutoFilledJobId('');
    setItems((prev) => [...prev, newDraftItem()]);
  };

  const removeItem = (id: string) => {
    setAutoFilledJobId('');
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSave = async (saveStatus: 'draft' | 'sent') => {
    if (!clientName.trim()) { setError('Client name is required'); return; }
    const validItems = items.filter((it) => it.description.trim());
    if (validItems.length === 0) { setError('Add at least one line item'); return; }

    setSaving(true);
    setError(null);

    const jobId = selectedJobId || null;
    const materialTypeId = selectedMaterialId || null;

    try {
      const totals = calcTotals(validItems, vatEnabled);

      if (isEdit && invoice) {
        const { error: invErr } = await supabase
          .from('invoices')
          .update({
            job_id: jobId,
            material_type_id: materialTypeId,
            client_name: clientName.trim(),
            client_address: clientAddress.trim() || null,
            client_email: clientEmail.trim() || null,
            issue_date: issueDate,
            due_date: dueDate || null,
            vat_enabled: vatEnabled,
            total_net: totals.net,
            total_vat: totals.vat,
            total_gross: totals.gross,
            notes: notes.trim() || null,
            status: saveStatus,
          })
          .eq('id', invoice.id);

        if (invErr) throw invErr;

        await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id);
        const newItems = validItems.map((it, i) => ({
          invoice_id: invoice.id,
          sort_order: i,
          description: it.description.trim(),
          quantity: parseFloat(it.quantity) || 1,
          unit_price: parseFloat(it.unit_price) || 0,
          total: (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0),
        }));
        if (newItems.length > 0) {
          const { error: itemErr } = await supabase.from('invoice_items').insert(newItems);
          if (itemErr) throw itemErr;
        }
      } else {
        const { data: inv, error: invErr } = await supabase
          .from('invoices')
          .insert({
            org_id: orgId,
            created_by: userId,
            job_id: jobId,
            material_type_id: materialTypeId,
            client_name: clientName.trim(),
            client_address: clientAddress.trim() || null,
            client_email: clientEmail.trim() || null,
            issue_date: issueDate,
            due_date: dueDate || null,
            vat_enabled: vatEnabled,
            total_net: totals.net,
            total_vat: totals.vat,
            total_gross: totals.gross,
            notes: notes.trim() || null,
            status: saveStatus,
          })
          .select()
          .single();

        if (invErr || !inv) throw invErr ?? new Error('Failed to create invoice');

        const newItems = validItems.map((it, i) => ({
          invoice_id: (inv as Invoice).id,
          sort_order: i,
          description: it.description.trim(),
          quantity: parseFloat(it.quantity) || 1,
          unit_price: parseFloat(it.unit_price) || 0,
          total: (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0),
        }));
        if (newItems.length > 0) {
          const { error: itemErr } = await supabase.from('invoice_items').insert(newItems);
          if (itemErr) throw itemErr;
        }
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  // Group materials by direction for the select optgroups
  const importMats = materialTypes.filter((m) => m.direction === 'import' || m.direction === 'both');
  const exportMats = materialTypes.filter((m) => m.direction === 'export' || m.direction === 'both');

  // Preview what the invoice number will look like
  const selectedJob = availableJobs.find((j) => j.id === selectedJobId);
  const selectedMat = materialTypes.find((m) => m.id === selectedMaterialId);
  const numberPreview = selectedJob && selectedMat
    ? `${selectedJob.job_code}-${selectedMat.code}-XXXX`
    : 'INV-XXXX';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isEdit ? `Edit ${invoice!.number}` : 'New Invoice'}
            </h2>
            {!isEdit && (
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{numberPreview}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Job + Material selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Job
              </label>
              {refLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <select
                  value={selectedJobId}
                  onChange={(e) => handleJobSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none bg-white"
                >
                  <option value="">— None —</option>
                  {availableJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.reference} · {j.title}
                      {j.status !== 'completed' ? ` [${j.status}]` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Material
              </label>
              {refLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <select
                  value={selectedMaterialId}
                  onChange={(e) => handleMaterialSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none bg-white"
                >
                  <option value="">— None —</option>
                  {importMats.length > 0 && (
                    <optgroup label="Import (IN)">
                      {importMats.map((m) => (
                        <option key={m.id} value={m.id}>{m.code} · {m.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {exportMats.length > 0 && (
                    <optgroup label="Export (OUT)">
                      {exportMats.map((m) => (
                        <option key={m.id} value={m.id}>{m.code} · {m.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </div>
          </div>

          {/* Client details */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Client</p>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Client / company name *"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
              <input
                type="text"
                placeholder="Address (optional)"
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Issue Date</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Due Date (optional)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Line Items</p>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-5 shrink-0 text-center">{idx + 1}</span>
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none min-w-0"
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                    className="w-16 px-2 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-center"
                    min="0"
                    step="0.001"
                  />
                  <input
                    type="number"
                    placeholder="£ price"
                    value={item.unit_price}
                    onChange={(e) => updateItem(item.id, 'unit_price', e.target.value)}
                    className="w-24 px-2 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-right"
                    min="0"
                    step="0.01"
                  />
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addItem}
              className="mt-2 flex items-center gap-1.5 text-sm text-orange-500 hover:text-orange-600 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add line
            </button>
          </div>

          {/* Totals */}
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-600">VAT (20%)</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-slate-500">{vatEnabled ? 'Enabled' : 'Disabled'}</span>
                <button
                  onClick={() => setVatEnabled(!vatEnabled)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${vatEnabled ? 'bg-orange-500' : 'bg-slate-300'}`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${vatEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                  />
                </button>
              </label>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>£{net.toFixed(2)}</span>
              </div>
              {vatEnabled && (
                <div className="flex justify-between text-slate-600">
                  <span>VAT (20%)</span>
                  <span>£{vat.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 text-base border-t border-slate-200 pt-2 mt-2">
                <span>Total</span>
                <span>£{gross.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes (optional)</label>
            <textarea
              rows={2}
              placeholder="Payment terms, bank details, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => handleSave('draft')}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Draft'}
            </button>
            <button
              onClick={() => handleSave('sent')}
              disabled={saving}
              className="px-4 py-2 text-sm font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? 'Save' : 'Create Invoice')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
