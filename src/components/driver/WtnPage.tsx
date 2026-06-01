import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { Loader2, MapPin, CheckCircle2, Truck } from 'lucide-react';

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
      {/* Header */}
      <div className="bg-slate-900 px-4 py-5 text-center">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
          Waste Transfer Note
        </p>
        <p className="text-3xl font-mono font-bold text-orange-500 tracking-widest">
          {ticket.wtn_reference}
        </p>
        <p className="text-slate-400 text-xs mt-1">{ticket.org_name}</p>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        {/* Status banner */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
          <div>
            <p className="font-semibold text-green-800 text-sm">Transfer Complete</p>
            <p className="text-green-600 text-xs mt-0.5">Issued {fmt(ticket.wtn_generated_at)}</p>
          </div>
        </div>

        {/* Job info */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-slate-900">{ticket.job_title}</p>
              <p className="text-xs text-slate-500 mt-0.5">Load #{ticket.load_number}</p>
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
            <div>
              <p className="text-xs text-slate-500 font-medium">Material</p>
              <p className="text-sm text-slate-800">{ticket.material_name}</p>
            </div>
          )}

          {ticket.vehicle_reg && (
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-slate-400" />
              <span className="font-mono font-bold text-slate-800 text-sm">{ticket.vehicle_reg}</span>
            </div>
          )}
        </div>

        {/* Route */}
        {(ticket.collection_address || ticket.disposal_address) && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase mb-3">Route</p>
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-0.5 shrink-0">
                <div className="w-3 h-3 rounded-full bg-green-500 ring-2 ring-green-200" />
                <div className="w-px border-l-2 border-dashed border-slate-300 my-1" style={{ minHeight: 28 }} />
                <div className="w-3 h-3 rounded-full bg-red-500 ring-2 ring-red-200" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-xs font-bold text-green-700 uppercase mb-0.5">Collection</p>
                  <p className="text-sm text-slate-700">{ticket.collection_address ?? '—'}</p>
                  {gpsLink(ticket.collection_lat, ticket.collection_lng) && (
                    <a href={gpsLink(ticket.collection_lat, ticket.collection_lng)!}
                       target="_blank" rel="noreferrer"
                       className="text-xs text-blue-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> View on map
                    </a>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">{fmt(ticket.collected_at)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-red-700 uppercase mb-0.5">Disposal</p>
                  <p className="text-sm text-slate-700">{ticket.disposal_address ?? '—'}</p>
                  {gpsLink(ticket.disposal_lat, ticket.disposal_lng) && (
                    <a href={gpsLink(ticket.disposal_lat, ticket.disposal_lng)!}
                       target="_blank" rel="noreferrer"
                       className="text-xs text-blue-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> View on map
                    </a>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">{fmt(ticket.disposed_at)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collection signature */}
        {(ticket.collection_signed_by || ticket.collection_signature) && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Collection Signature</p>
            {ticket.collection_signed_by && (
              <p className="text-sm font-semibold text-slate-800 mb-2">{ticket.collection_signed_by}</p>
            )}
            {ticket.collection_signature && (
              <img
                src={ticket.collection_signature}
                alt="Collection signature"
                className="w-full border border-slate-100 rounded-lg bg-slate-50"
                style={{ maxHeight: 120, objectFit: 'contain' }}
              />
            )}
          </div>
        )}

        {/* Disposal photo */}
        {ticket.disposal_photo_url && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Tip Ticket / Delivery Note</p>
            <img
              src={ticket.disposal_photo_url}
              alt="Tip ticket"
              className="w-full rounded-lg border border-slate-100 object-contain"
              style={{ maxHeight: 240 }}
            />
          </div>
        )}

        {/* Disposal signature */}
        {(ticket.disposal_signed_by || ticket.disposal_signature) && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Disposal Signature</p>
            {ticket.disposal_signed_by && (
              <p className="text-sm font-semibold text-slate-800 mb-2">{ticket.disposal_signed_by}</p>
            )}
            {ticket.disposal_signature && (
              <img
                src={ticket.disposal_signature}
                alt="Disposal signature"
                className="w-full border border-slate-100 rounded-lg bg-slate-50"
                style={{ maxHeight: 120, objectFit: 'contain' }}
              />
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-slate-400">
            This document is a digital Waste Transfer Note issued via CheckATruck.
          </p>
          <p className="text-xs text-slate-300 mt-0.5">checkatruck.co.uk</p>
        </div>
      </div>
    </div>
  );
}
