import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';
import {
  Plus,
  Loader2,
  FileText,
  ExternalLink,
  Share2,
  Check,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import type { Invoice, InvoiceItem, InvoiceStatus, Organisation } from '@/types';
import { InvoiceModal } from './InvoiceModal';

// ============================================================================
// Types
// ============================================================================

interface InvoicesViewProps {
  org: Organisation;
  userId: string;
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent:  'Sent',
  paid:  'Paid',
  void:  'Void',
};

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent:  'bg-blue-100 text-blue-700',
  paid:  'bg-green-100 text-green-700',
  void:  'bg-red-100 text-red-700',
};

const STATUS_TRANSITIONS: Partial<Record<InvoiceStatus, InvoiceStatus[]>> = {
  draft: ['sent'],
  sent:  ['paid'],
};

// ============================================================================
// Component
// ============================================================================

export function InvoicesView({ org, userId }: InvoicesViewProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsByInvoice, setItemsByInvoice] = useState<Record<string, InvoiceItem[]>>({});
  const [showModal, setShowModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  useEffect(() => { loadInvoices(); }, [org.id]);

  const loadInvoices = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false });
    setInvoices((data ?? []) as Invoice[]);
    setLoading(false);
  };

  const loadItems = async (invoiceId: string) => {
    if (itemsByInvoice[invoiceId]) return;
    const { data } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('sort_order');
    if (data) {
      setItemsByInvoice((prev) => ({ ...prev, [invoiceId]: data as InvoiceItem[] }));
    }
  };

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadItems(id);
    }
  };

  const handleStatusChange = async (invoice: Invoice, newStatus: InvoiceStatus) => {
    setStatusUpdating(invoice.id);
    await supabase
      .from('invoices')
      .update({ status: newStatus })
      .eq('id', invoice.id);
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === invoice.id ? { ...inv, status: newStatus } : inv))
    );
    setStatusUpdating(null);
  };

  const shareInvoice = async (number: string) => {
    const url = `${window.location.origin}/invoice/${number}`;
    if (navigator.share) {
      navigator.share({ title: `Invoice ${number}`, url });
    } else {
      await navigator.clipboard.writeText(url);
      setCopiedNumber(number);
      setTimeout(() => setCopiedNumber(null), 2000);
    }
  };

  const filtered = invoices.filter(
    (inv) => statusFilter === 'all' || inv.status === statusFilter
  );

  const totalOutstanding = invoices
    .filter((inv) => inv.status === 'sent')
    .reduce((sum, inv) => sum + Number(inv.total_gross), 0);

  const totalPaid = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + Number(inv.total_gross), 0);

  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl md:text-2xl font-heading text-slate-900">Invoices</h1>
        <button
          onClick={() => { setEditingInvoice(null); setShowModal(true); }}
          className="flex items-center gap-2 px-3 py-2 md:px-4 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors text-sm md:text-base"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">New Invoice</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Summary cards */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">Outstanding</p>
            <p className="text-xl font-bold text-slate-900">£{totalOutstanding.toFixed(2)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{invoices.filter((i) => i.status === 'sent').length} invoice(s)</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">Paid (all time)</p>
            <p className="text-xl font-bold text-green-600">£{totalPaid.toFixed(2)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{invoices.filter((i) => i.status === 'paid').length} invoice(s)</p>
          </div>
        </div>
      )}

      {/* Status filter */}
      {invoices.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {(['all', 'draft', 'sent', 'paid', 'void'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                statusFilter === s
                  ? 'bg-orange-500 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
              {s !== 'all' && (
                <span className="ml-1 opacity-60">
                  {invoices.filter((i) => i.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {invoices.length === 0 ? 'No invoices yet' : 'No invoices match this filter'}
          </p>
          {invoices.length === 0 && (
            <p className="text-slate-400 text-sm mt-1">Create your first invoice to get started</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((inv) => {
            const expanded = expandedId === inv.id;
            const items = itemsByInvoice[inv.id] ?? [];
            const transitions = STATUS_TRANSITIONS[inv.status] ?? [];

            return (
              <div key={inv.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Row header */}
                <button
                  onClick={() => handleExpand(inv.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-slate-800">{inv.number}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[inv.status]}`}>
                        {STATUS_LABEL[inv.status]}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 truncate mt-0.5">{inv.client_name}</p>
                  </div>
                  <div className="text-right shrink-0 mr-1">
                    <p className="font-bold text-slate-900 text-sm">£{Number(inv.total_gross).toFixed(2)}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(inv.issue_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </p>
                  </div>
                  {expanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {/* Expanded detail */}
                {expanded && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">

                    {/* Line items */}
                    {items.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-400 uppercase">
                            <th className="text-left pb-1 font-medium">Description</th>
                            <th className="text-right pb-1 font-medium w-12">Qty</th>
                            <th className="text-right pb-1 font-medium w-20">Price</th>
                            <th className="text-right pb-1 font-medium w-20">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {items.map((item) => (
                            <tr key={item.id}>
                              <td className="py-1.5 text-slate-700">{item.description}</td>
                              <td className="py-1.5 text-slate-600 text-right">{Number(item.quantity)}</td>
                              <td className="py-1.5 text-slate-600 text-right">£{Number(item.unit_price).toFixed(2)}</td>
                              <td className="py-1.5 font-medium text-slate-800 text-right">£{Number(item.total).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      </div>
                    )}

                    {/* Totals */}
                    <div className="border-t border-slate-100 pt-2 space-y-1 text-sm">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span>£{Number(inv.total_net).toFixed(2)}</span>
                      </div>
                      {inv.vat_enabled && (
                        <div className="flex justify-between text-slate-600">
                          <span>VAT (20%)</span>
                          <span>£{Number(inv.total_vat).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>Total</span>
                        <span>£{Number(inv.total_gross).toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Due date / notes */}
                    {(inv.due_date || inv.notes) && (
                      <div className="text-xs text-slate-500 space-y-1">
                        {inv.due_date && (
                          <p>Due: {new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        )}
                        {inv.notes && <p className="italic">{inv.notes}</p>}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {/* Status transitions */}
                      {transitions.map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(inv, s)}
                          disabled={statusUpdating === inv.id}
                          className="px-3 py-1.5 text-xs font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                        >
                          {statusUpdating === inv.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            `Mark ${STATUS_LABEL[s]}`
                          )}
                        </button>
                      ))}

                      {/* Edit (draft only) */}
                      {inv.status === 'draft' && (
                        <button
                          onClick={() => { setEditingInvoice(inv); setShowModal(true); }}
                          className="px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          Edit
                        </button>
                      )}

                      {/* View public link */}
                      <a
                        href={`/invoice/${inv.number}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View
                      </a>

                      {/* Share link */}
                      <button
                        onClick={() => shareInvoice(inv.number)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        {copiedNumber === inv.number ? (
                          <><Check className="w-3 h-3 text-green-500" /> Copied</>
                        ) : (
                          <><Share2 className="w-3 h-3" /> Share</>
                        )}
                      </button>

                      {/* Void (not already void/paid) */}
                      {(inv.status === 'draft' || inv.status === 'sent') && (
                        <button
                          onClick={() => handleStatusChange(inv, 'void')}
                          disabled={statusUpdating === inv.id}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Void
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <InvoiceModal
          invoice={editingInvoice}
          orgId={org.id}
          userId={userId}
          onClose={() => { setShowModal(false); setEditingInvoice(null); }}
          onSaved={() => { setShowModal(false); setEditingInvoice(null); loadInvoices(); }}
        />
      )}
    </div>
  );
}
