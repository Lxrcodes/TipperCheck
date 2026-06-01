import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { Loader2, MapPin, Truck, Printer, Share2, Check } from 'lucide-react';

interface WtnTicket {
  wtn_reference: string;
  wtn_generated_at: string;
  load_number: number;
  collected_at: string | null;
  disposed_at: string | null;
  collection_signed_by: string | null;
  collection_signature: string | null;
  collection_lat: number | null;
  collection_lng: number | null;
  disposal_signed_by: string | null;
  disposal_signature: string | null;
  disposal_lat: number | null;
  disposal_lng: number | null;
  disposal_photo_url: string | null;
  job_title: string;
  direction: string | null;
  collection_address: string | null;
  disposal_address: string | null;
  material_name: string | null;
  material_code: string | null;
  vehicle_reg: string | null;
  org_name: string;
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function gpsLink(lat: number | null, lng: number | null) {
  if (!lat || !lng) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function WtnPage() {
  const { reference } = useParams<{ reference: string }>();
  const [ticket,  setTicket]  = useState<WtnTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: `WTN ${reference}`, url });
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    if (!reference) { setNotFound(true); setLoading(false); return; }
    supabase
      .rpc('get_wtn_ticket', { p_reference: reference.toUpperCase() })
      .then(({ data }) => {
        if (data) setTicket(data as WtnTicket);
        else setNotFound(true);
        setLoading(false);
      });
  }, [reference]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (notFound || !ticket) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-slate-600 font-semibold text-lg mb-1">Transfer Note Not Found</p>
        <p className="text-slate-400 text-sm">The reference <span className="font-mono">{reference}</span> does not match any record.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      {/* Header — compact, status + issued date inline */}
      <div className="bg-slate-900 px-4 py-3 text-center">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-0.5">
          Waste Transfer Note
        </p>
        <p className="text-xl font-mono font-bold text-orange-500 tracking-widest">
          {ticket.wtn_reference}
        </p>
        <p className="text-slate-400 text-xs mt-0.5">
          {ticket.org_name} · <span className="text-green-400">Transfer Complete</span> · Issued {fmt(ticket.wtn_generated_at)}
        </p>

        <div className="no-print flex items-center justify-center gap-3 mt-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-3">

        {/* Job info */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-slate-900">{ticket.job_title}</p>
              <p className="text-xs text-slate-500">Load #{ticket.load_number}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {ticket.direction && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  ticket.direction === 'import' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {ticket.direction === 'import' ? 'IN' : 'OUT'}
                </span>
              )}
              {ticket.material_code && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {ticket.material_code}
                </span>
              )}
            </div>
          </div>
          {ticket.material_name && (
            <p className="text-xs text-slate-500">
              <span className="font-medium">Material:</span> {ticket.material_name}
            </p>
          )}
          {ticket.vehicle_reg && (
            <div className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono font-bold text-slate-800 text-xs">{ticket.vehicle_reg}</span>
            </div>
          )}
        </div>

        {/* Route — compact, map links screen-only */}
        {(ticket.collection_address || ticket.disposal_address) && (
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Route</p>
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-0.5 shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-green-200" />
                <div className="w-px border-l-2 border-dashed border-slate-300 my-1" style={{ minHeight: 20 }} />
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-200" />
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-xs font-bold text-green-700 uppercase">Collection</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-slate-700">{ticket.collection_address ?? '—'}</p>
                    {gpsLink(ticket.collection_lat, ticket.collection_lng) && (
                      <a href={gpsLink(ticket.collection_lat, ticket.collection_lng)!}
                         target="_blank" rel="noreferrer"
                         className="no-print text-xs text-blue-500 flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" /> Map
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{fmt(ticket.collected_at)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-red-700 uppercase">Disposal</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-slate-700">{ticket.disposal_address ?? '—'}</p>
                    {gpsLink(ticket.disposal_lat, ticket.disposal_lng) && (
                      <a href={gpsLink(ticket.disposal_lat, ticket.disposal_lng)!}
                         target="_blank" rel="noreferrer"
                         className="no-print text-xs text-blue-500 flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" /> Map
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{fmt(ticket.disposed_at)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Disposal photo */}
        {ticket.disposal_photo_url && (
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Tip Ticket / Delivery Note</p>
            <img
              src={ticket.disposal_photo_url}
              alt="Tip ticket"
              className="w-full rounded-lg border border-slate-100 object-contain"
              style={{ maxHeight: 180 }}
            />
          </div>
        )}

        {/* Signatures — side by side */}
        {(ticket.collection_signed_by || ticket.collection_signature ||
          ticket.disposal_signed_by || ticket.disposal_signature) && (
          <div className="grid grid-cols-2 gap-3">
            {(ticket.collection_signed_by || ticket.collection_signature) && (
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Collection</p>
                {ticket.collection_signed_by && (
                  <p className="text-xs font-semibold text-slate-800 mb-1 truncate">{ticket.collection_signed_by}</p>
                )}
                {ticket.collection_signature && (
                  <img
                    src={ticket.collection_signature}
                    alt="Collection signature"
                    className="w-full border border-slate-100 rounded bg-slate-50"
                    style={{ height: 56, objectFit: 'contain' }}
                  />
                )}
              </div>
            )}
            {(ticket.disposal_signed_by || ticket.disposal_signature) && (
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Disposal</p>
                {ticket.disposal_signed_by && (
                  <p className="text-xs font-semibold text-slate-800 mb-1 truncate">{ticket.disposal_signed_by}</p>
                )}
                {ticket.disposal_signature && (
                  <img
                    src={ticket.disposal_signature}
                    alt="Disposal signature"
                    className="w-full border border-slate-100 rounded bg-slate-50"
                    style={{ height: 56, objectFit: 'contain' }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer — kept on page 1 */}
        <div className="text-center pt-1 pb-2">
          <p className="text-xs text-slate-400">
            Digital Waste Transfer Note issued via CheckATruck · checkatruck.co.uk
          </p>
        </div>
      </div>
    </div>
  );
}
