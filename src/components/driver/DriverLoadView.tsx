import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/services/supabaseClient';
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Pen,
  CheckCircle2,
  ChevronRight,
  Truck,
  RefreshCw,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import type { Job, Load, LoadStatus, MaterialType } from '@/types';

interface DriverLoadViewProps {
  assignmentId: string;
  onClose: () => void;
}

type Screen =
  | 'list'
  | 'start_load'
  | 'collection_sig'
  | 'delivering'
  | 'disposal_sig'
  | 'wtn';

// ─── Simple canvas signature pad ─────────────────────────────────────────────

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  signerName: string;
  onSignerNameChange: (v: string) => void;
  label: string;
}

function SignaturePad({ onSave, onCancel, signerName, onSignerNameChange, label }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    drawing.current = true;
    const canvas = canvasRef.current!;
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!drawing.current || !canvasRef.current || !lastPos.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = () => { drawing.current = false; lastPos.current = null; };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const save = () => {
    if (!signerName.trim()) return;
    const dataUrl = canvasRef.current!.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
          {label} — Signer's Name *
        </label>
        <input
          type="text"
          value={signerName}
          onChange={(e) => onSignerNameChange(e.target.value)}
          placeholder="Full name"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold text-slate-500 uppercase">Signature *</label>
          <button type="button" onClick={clear} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Clear
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          className="w-full border-2 border-slate-300 rounded-lg bg-white touch-none"
          style={{ height: '140px' }}
        />
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
          <Pen className="w-3 h-3" /> Draw your signature above
        </p>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!signerName.trim()}
          className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-bold disabled:opacity-50">
          Confirm Signature
        </button>
      </div>
    </div>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const LOAD_STATUS_LABEL: Record<LoadStatus, string> = {
  pending:    'Not started',
  collecting: 'At collection',
  collected:  'Collected — en route',
  delivering: 'At disposal',
  completed:  'Completed',
};

const LOAD_STATUS_COLOR: Record<LoadStatus, string> = {
  pending:    'bg-slate-100 text-slate-600',
  collecting: 'bg-blue-100 text-blue-700',
  collected:  'bg-amber-100 text-amber-700',
  delivering: 'bg-purple-100 text-purple-700',
  completed:  'bg-green-100 text-green-700',
};

// ─── Main component ───────────────────────────────────────────────────────────

export function DriverLoadView({ assignmentId, onClose }: DriverLoadViewProps) {
  const [job,     setJob]     = useState<(Job & { material_types: Pick<MaterialType,'name'|'code'> | null }) | null>(null);
  const [loads,   setLoads]   = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen,  setScreen]  = useState<Screen>('list');
  const [activeLoad, setActiveLoad] = useState<Load | null>(null);

  // Signature state
  const [signerName, setSignerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: assgn } = await supabase
      .from('job_assignments')
      .select('job_id')
      .eq('id', assignmentId)
      .single();

    if (!assgn) { setLoading(false); return; }

    const [{ data: jobData }, { data: loadsData }] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, material_types(name, code)')
        .eq('id', assgn.job_id)
        .single(),
      supabase
        .from('loads')
        .select('*')
        .eq('assignment_id', assignmentId)
        .order('load_number'),
    ]);

    if (jobData)   setJob(jobData as Job & { material_types: Pick<MaterialType,'name'|'code'> | null });
    if (loadsData) setLoads(loadsData as Load[]);
    setLoading(false);
  }, [assignmentId]);

  useEffect(() => { loadData(); }, [loadData]);

  const getGps = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 8000 }
      );
    });

  // ── Transition: pending → collecting ────────────────────────────────────────
  const startLoad = async (load: Load) => {
    setSaving(true);
    await supabase.from('loads').update({ status: 'collecting' }).eq('id', load.id);
    await loadData();
    setActiveLoad((prev) => loads.find((l) => l.id === load.id) ?? prev);
    setScreen('collection_sig');
    setSignerName('');
    setSaving(false);
  };

  // ── Transition: collecting → collected (after collection signature) ──────────
  const submitCollectionSig = async (sigDataUrl: string) => {
    if (!activeLoad) return;
    setSaving(true);
    setGpsError(null);
    const gps = await getGps();
    const { error } = await supabase.from('loads').update({
      status:                  'collected',
      collection_signed_by:    signerName.trim(),
      collection_signature:    sigDataUrl,
      collection_lat:          gps?.lat ?? null,
      collection_lng:          gps?.lng ?? null,
      collected_at:            new Date().toISOString(),
    }).eq('id', activeLoad.id);
    if (error) { setSaving(false); return; }
    await loadData();
    setScreen('delivering');
    setSaving(false);
  };

  // ── Transition: collected → delivering ──────────────────────────────────────
  const departForDisposal = async () => {
    if (!activeLoad) return;
    setSaving(true);
    await supabase.from('loads').update({ status: 'delivering' }).eq('id', activeLoad.id);
    await loadData();
    setScreen('disposal_sig');
    setSignerName('');
    setSaving(false);
  };

  // ── Transition: delivering → completed (after disposal signature) ───────────
  const submitDisposalSig = async (sigDataUrl: string) => {
    if (!activeLoad) return;
    setSaving(true);
    setGpsError(null);
    const gps = await getGps();

    // Generate WTN reference via DB function
    const { data: wtnRef } = await supabase.rpc('generate_wtn_reference');

    const { error } = await supabase.from('loads').update({
      status:               'completed',
      disposal_signed_by:   signerName.trim(),
      disposal_signature:   sigDataUrl,
      disposal_lat:         gps?.lat ?? null,
      disposal_lng:         gps?.lng ?? null,
      disposed_at:          new Date().toISOString(),
      wtn_reference:        wtnRef ?? null,
      wtn_generated_at:     new Date().toISOString(),
    }).eq('id', activeLoad.id);

    if (error) { setSaving(false); return; }

    // Increment loads_completed on the assignment
    const { data: assgn } = await supabase
      .from('job_assignments')
      .select('loads_completed')
      .eq('id', assignmentId)
      .single();
    if (assgn) {
      await supabase
        .from('job_assignments')
        .update({ loads_completed: assgn.loads_completed + 1 })
        .eq('id', assignmentId);
    }

    await loadData();
    // Refresh activeLoad from updated loads
    setActiveLoad((prev) => loads.find((l) => l.id === prev?.id) ?? prev);
    setScreen('wtn');
    setSaving(false);
  };

  const openLoad = (load: Load) => {
    setActiveLoad(load);
    setSignerName('');
    setGpsError(null);
    if (load.status === 'pending')    { setScreen('start_load'); return; }
    if (load.status === 'collecting') { setScreen('collection_sig'); return; }
    if (load.status === 'collected')  { setScreen('delivering'); return; }
    if (load.status === 'delivering') { setScreen('disposal_sig'); return; }
    if (load.status === 'completed' && load.wtn_reference) { setScreen('wtn'); return; }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-slate-600 font-medium">Job not found.</p>
        <button onClick={onClose} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold">Back</button>
      </div>
    );
  }

  const completedLoads = loads.filter((l) => l.status === 'completed').length;

  // ── Job header (shown on all screens) ─────────────────────────────────────
  const jobHeader = (
    <div className="bg-white border-b border-slate-200 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-xs font-bold text-slate-500">{job.reference}</span>
            {job.direction && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${job.direction === 'import' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                {job.direction === 'import' ? 'IN' : 'OUT'}
              </span>
            )}
            {job.material_types && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {job.material_types.code}
              </span>
            )}
          </div>
          <p className="font-semibold text-slate-900 text-sm truncate">{job.title}</p>
          {(job.collection_address || job.disposal_address) && (
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {job.collection_address?.split(',')[0]}
                {job.collection_address && job.disposal_address && <span className="mx-1 text-slate-300">→</span>}
                {job.disposal_address?.split(',')[0]}
              </span>
            </p>
          )}
        </div>
        <span className="text-xs font-semibold text-slate-500 shrink-0">
          {completedLoads}/{loads.length}
        </span>
      </div>
    </div>
  );

  // ── List screen ─────────────────────────────────────────────────────────────
  if (screen === 'list') {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <div className="bg-slate-900 flex items-center gap-3 px-4 py-3">
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white font-bold">Loads</h1>
        </div>

        {jobHeader}

        <div className="flex-1 p-4 space-y-2">
          {loads.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
              <Truck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No loads created yet.</p>
              <p className="text-xs text-slate-400 mt-1">Your manager will create loads for this job.</p>
            </div>
          ) : (
            loads.map((load) => (
              <button
                key={load.id}
                onClick={() => openLoad(load)}
                className="w-full bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-orange-300 transition-all flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-800">Load {load.load_number}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LOAD_STATUS_COLOR[load.status]}`}>
                      {LOAD_STATUS_LABEL[load.status]}
                    </span>
                  </div>
                  {load.wtn_reference && (
                    <p className="text-xs font-mono text-slate-500">WTN: {load.wtn_reference}</p>
                  )}
                </div>
                {load.status !== 'completed' ? (
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // ── Shared screen wrapper (non-list screens) ─────────────────────────────
  const screenBack = () => setScreen('list');

  const screenHeader = (title: string) => (
    <div className="bg-slate-900 flex items-center gap-3 px-4 py-3 shrink-0">
      <button onClick={screenBack} className="p-1 text-slate-400 hover:text-white">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <h1 className="text-white font-bold">{title}</h1>
    </div>
  );

  // ── Start load screen ────────────────────────────────────────────────────
  if (screen === 'start_load' && activeLoad) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {screenHeader(`Load ${activeLoad.load_number}`)}
        {jobHeader}
        <div className="flex-1 p-6 flex flex-col items-center justify-center gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 w-full text-center">
            <Truck className="w-12 h-12 text-orange-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900 mb-1">Ready to start?</h2>
            <p className="text-sm text-slate-500">
              Heading to collect from{' '}
              <span className="font-semibold text-slate-700">
                {job.collection_address?.split(',')[0] ?? 'collection point'}
              </span>
            </p>
          </div>
          <button
            onClick={() => startLoad(activeLoad)}
            disabled={saving}
            className="w-full py-4 bg-orange-500 text-white font-bold rounded-xl text-base flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Truck className="w-5 h-5" />}
            Start Load
          </button>
        </div>
      </div>
    );
  }

  // ── Collection signature screen ───────────────────────────────────────────
  if (screen === 'collection_sig' && activeLoad) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {screenHeader(`Load ${activeLoad.load_number} — Collection`)}
        {jobHeader}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-500" />
              At collection point
            </p>
            <p className="text-xs text-slate-500 mb-4">
              {job.collection_address ?? 'Collection address not set'}
            </p>
            {gpsError && <p className="text-xs text-amber-600 mb-3">{gpsError}</p>}
            {saving ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            ) : (
              <SignaturePad
                label="Collection"
                signerName={signerName}
                onSignerNameChange={setSignerName}
                onCancel={screenBack}
                onSave={submitCollectionSig}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Delivering screen ─────────────────────────────────────────────────────
  if (screen === 'delivering' && activeLoad) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {screenHeader(`Load ${activeLoad.load_number} — En Route`)}
        {jobHeader}
        <div className="flex-1 p-6 flex flex-col items-center justify-center gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 w-full text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900 mb-1">Collection signed</h2>
            <p className="text-sm text-slate-500">
              Now heading to{' '}
              <span className="font-semibold text-slate-700">
                {job.disposal_address?.split(',')[0] ?? 'disposal point'}
              </span>
            </p>
          </div>
          <button
            onClick={departForDisposal}
            disabled={saving}
            className="w-full py-4 bg-orange-500 text-white font-bold rounded-xl text-base flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
            Arrived at Disposal
          </button>
        </div>
      </div>
    );
  }

  // ── Disposal signature screen ─────────────────────────────────────────────
  if (screen === 'disposal_sig' && activeLoad) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {screenHeader(`Load ${activeLoad.load_number} — Disposal`)}
        {jobHeader}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-500" />
              At disposal point
            </p>
            <p className="text-xs text-slate-500 mb-4">
              {job.disposal_address ?? 'Disposal address not set'}
            </p>
            {gpsError && <p className="text-xs text-amber-600 mb-3">{gpsError}</p>}
            {saving ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            ) : (
              <SignaturePad
                label="Disposal"
                signerName={signerName}
                onSignerNameChange={setSignerName}
                onCancel={screenBack}
                onSave={submitDisposalSig}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── WTN screen ────────────────────────────────────────────────────────────
  if (screen === 'wtn') {
    // Use latest load data from state
    const completedLoad = loads.find((l) => l.id === activeLoad?.id) ?? activeLoad;
    const wtnRef = completedLoad?.wtn_reference;
    const wtnUrl = wtnRef ? `https://checkatruck.com/wtn/${wtnRef}` : '';

    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {screenHeader('Waste Transfer Note')}
        {jobHeader}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {wtnRef ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-slate-900 mb-1">Load Complete</h2>
              <p className="text-slate-500 text-sm mb-4">Waste Transfer Note issued</p>

              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">WTN Reference</p>
                <p className="text-3xl font-mono font-bold text-orange-500 tracking-widest">{wtnRef}</p>
              </div>

              <div className="flex justify-center mb-4">
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <QRCode value={wtnUrl || wtnRef} size={140} />
                </div>
              </div>

              <div className="text-left space-y-2 text-sm border-t border-slate-100 pt-4">
                <div className="flex justify-between">
                  <span className="text-slate-500">Material</span>
                  <span className="font-semibold text-slate-800">
                    {job.material_types ? `${job.material_types.name} (${job.material_types.code})` : '—'}
                  </span>
                </div>
                {completedLoad?.collection_signed_by && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Collected by</span>
                    <span className="font-semibold text-slate-800">{completedLoad.collection_signed_by}</span>
                  </div>
                )}
                {completedLoad?.disposal_signed_by && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Received by</span>
                    <span className="font-semibold text-slate-800">{completedLoad.disposal_signed_by}</span>
                  </div>
                )}
                {completedLoad?.collected_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Collected</span>
                    <span className="font-semibold text-slate-800">
                      {new Date(completedLoad.collected_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                )}
                {completedLoad?.disposed_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Disposed</span>
                    <span className="font-semibold text-slate-800">
                      {new Date(completedLoad.disposed_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setScreen('list')}
                className="mt-6 w-full py-3 bg-slate-900 text-white font-bold rounded-xl text-sm"
              >
                Back to Loads
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
              <p className="text-slate-500">WTN not available.</p>
              <button onClick={() => setScreen('list')} className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold">
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
