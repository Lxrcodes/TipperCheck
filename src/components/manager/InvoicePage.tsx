import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { Loader2, Printer, Share2, Check, CreditCard } from 'lucide-react';
import type { Invoice, InvoiceItem } from '@/types';

interface PublicInvoiceData {
  invoice: Invoice;
  items: InvoiceItem[];
  org_name: string;
  org_address: string | null;
  org_contact_email: string | null;
  org_contact_phone: string | null;
  org_company_number: string | null;
  org_vat_number: string | null;
  org_bank_name: string | null;
  org_bank_account_number: string | null;
  org_bank_sort_code: string | null;
  org_accepts_payments: boolean;
}

export function InvoicePage() {
  const { number } = useParams<{ number: string }>();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<PublicInvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const justPaid = searchParams.get('paid') === '1';

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `Invoice ${number}`, url });
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePay = async () => {
    if (!number) return;
    setPayLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('create-invoice-checkout', {
        body: { invoiceNumber: number.toUpperCase() },
      });
      if (error) throw error;
      if (result?.url) window.location.href = result.url;
    } catch (err) {
      console.error('Payment error:', err);
    } finally {
      setPayLoading(false);
    }
  };

  useEffect(() => {
    if (!number) { setNotFound(true); setLoading(false); return; }
    supabase
      .rpc('get_invoice_public', { p_number: number.toUpperCase() })
      .then(({ data: result }) => {
        if (result) setData(result as PublicInvoiceData);
        else setNotFound(true);
        setLoading(false);
      });
  }, [number]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-800 mb-2">Invoice not found</p>
          <p className="text-slate-500">This invoice may have been voided or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  const { invoice, items, org_name } = data;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Paid confirmation banner */}
        {justPaid && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl mb-4 print:hidden">
            <Check className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="font-bold text-green-800">Payment received</p>
              <p className="text-sm text-green-700">Thank you — your payment has been processed successfully.</p>
            </div>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-slate-600">{invoice.number}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              invoice.status === 'paid' ? 'bg-green-100 text-green-700' :
              invoice.status === 'sent' ? 'bg-blue-100 text-blue-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
            </span>
          </div>
          <div className="flex gap-2">
            {data.org_accepts_payments && invoice.status === 'sent' && (
              <button
                onClick={handlePay}
                disabled={payLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {payLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Pay Now
              </button>
            )}
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
              {copied ? 'Copied' : 'Share'}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print / PDF
            </button>
          </div>
        </div>

        {/* Invoice document */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 print:shadow-none print:border-none print:rounded-none">

          {/* Letterhead */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{org_name}</h1>
              {data.org_address && (
                <p className="text-sm text-slate-500 mt-1 whitespace-pre-line">{data.org_address}</p>
              )}
              {data.org_contact_phone && (
                <p className="text-sm text-slate-500 mt-0.5">{data.org_contact_phone}</p>
              )}
              {data.org_contact_email && (
                <p className="text-sm text-slate-500 mt-0.5">{data.org_contact_email}</p>
              )}
              {data.org_vat_number && (
                <p className="text-xs text-slate-400 mt-1">VAT No: {data.org_vat_number}</p>
              )}
              {data.org_company_number && (
                <p className="text-xs text-slate-400">Co. No: {data.org_company_number}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-orange-500">INVOICE</p>
              <p className="font-mono font-bold text-slate-700 text-lg mt-1">{invoice.number}</p>
            </div>
          </div>

          {/* Dates + Bill To */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bill To</p>
              <p className="font-bold text-slate-900">{invoice.client_name}</p>
              {invoice.client_address && (
                <p className="text-sm text-slate-600 whitespace-pre-line mt-0.5">{invoice.client_address}</p>
              )}
              {invoice.client_email && (
                <p className="text-sm text-slate-600 mt-0.5">{invoice.client_email}</p>
              )}
            </div>
            <div className="text-right">
              <div className="space-y-1.5">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Issue Date</p>
                  <p className="text-sm font-medium text-slate-800">
                    {new Date(invoice.issue_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                {invoice.due_date && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Due Date</p>
                    <p className="text-sm font-medium text-slate-800">
                      {new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Line items table */}
          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-slate-900">
                <th className="text-left py-2 text-xs font-bold text-slate-700 uppercase tracking-wider">Description</th>
                <th className="text-right py-2 text-xs font-bold text-slate-700 uppercase tracking-wider w-16">Qty</th>
                <th className="text-right py-2 text-xs font-bold text-slate-700 uppercase tracking-wider w-24">Unit Price</th>
                <th className="text-right py-2 text-xs font-bold text-slate-700 uppercase tracking-wider w-24">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(items ?? []).map((item) => (
                <tr key={item.id}>
                  <td className="py-3 text-sm text-slate-800">{item.description}</td>
                  <td className="py-3 text-sm text-slate-600 text-right">{Number(item.quantity)}</td>
                  <td className="py-3 text-sm text-slate-600 text-right">£{Number(item.unit_price).toFixed(2)}</td>
                  <td className="py-3 text-sm font-medium text-slate-800 text-right">£{Number(item.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-56 space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span>£{Number(invoice.total_net).toFixed(2)}</span>
              </div>
              {invoice.vat_enabled && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>VAT (20%)</span>
                  <span>£{Number(invoice.total_vat).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 text-lg border-t-2 border-slate-900 pt-2 mt-2">
                <span>Total</span>
                <span>£{Number(invoice.total_gross).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-slate-600 whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}

          {/* Bank details */}
          {(data.org_bank_name || data.org_bank_sort_code || data.org_bank_account_number) && (
            <div className="border-t border-slate-100 pt-4 mt-6">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Details</p>
              <div className="text-sm text-slate-600 space-y-0.5">
                {data.org_bank_name && <p>Bank: {data.org_bank_name}</p>}
                {data.org_bank_sort_code && <p>Sort Code: {data.org_bank_sort_code}</p>}
                {data.org_bank_account_number && <p>Account: {data.org_bank_account_number}</p>}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-slate-100 pt-4 mt-6">
            <p className="text-xs text-slate-400 text-center">
              Generated by CheckaTruck · checkatruck.co.uk
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
