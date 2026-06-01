import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/services/supabaseClient';
import {
  ArrowLeft, Loader2, MapPin, RefreshCw, Navigation,
  CheckCircle2, Camera, ChevronRight, Truck, Pen,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import type { Job, Load, JobAssignment, MaterialType } from '@/types';

interface DriverLoadViewProps {
  assignmentId: string;
  onClose: () => void;
}

type Screen =
  | 'job_detail'
  | 'traveling_collect'
  | 'collect_name'
  | 'collect_sig'
  | 'traveling_deliver'
  | 'deliver_name_photo'
  | 'deliver_sig'
  | 'load_complete';

type FullJob = Job & { material_types: Pick<MaterialType, 'name' | 'code'> | null };
type FullAssignment = JobAssignment & { vehicles: { registration: string } | null };

interface LoadProgress {
  loadId: string;
  screen: Screen;
  collectName: string;
  deliveryName: string;
  deliveryPhotoDataUrl: string | null;
}

const PROGRESS_KEY = (loadId: string) => `wtn_progress_${loadId}`;

function saveProgress(p: LoadProgress) {
  try { localStorage.setItem(PROGRESS_KEY(p.loadId), JSON.stringify(p)); } catch { /* quota */ }
}

function loadProgress(loadId: string): LoadProgress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY(loadId));
    return raw ? (JSON.parse(raw) as LoadProgress) : null;
  } catch { return null; }
}

function clearProgress(loadId: string) {
  try { localStorage.removeItem(PROGRESS_KEY(loadId)); } catch { /* ignore */ }
}

// ─── Open in Maps ─────────────────────────────────────────────────────────────
function openInMaps(address: string) {
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    '_blank',
  );
}

// ─── Signature pad ────────────────────────────────────────────────────────────
interface SigPadProps {
  signerName: string;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  title: string;
  subtitle: string;
}

function SigPad({ signerName, onSave, onCancel, title, subtitle }: SigPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const pt = (e: React.TouchEvent | React.MouseEvent, c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width, sy = c.height / r.height;
    if ('touches' in e)
      return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); drawing.current = true; last.current = pt(e, canvasRef.current!);
  };
  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!drawing.current || !canvasRef.current || !last.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const p = pt(e, canvasRef.current);
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
    last.current = p;
  };
  const endDraw = () => { drawing.current = false; last.current = null; };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  };
  const confirm = () => onSave(canvasRef.current!.toDataURL('image/png'));

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-100">
        <p className="font-bold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        {signerName && (
          <p className="mt-2 text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded inline-block">
            Signing: <span className="font-semibold">{signerName}</span>
          </p>
        )}
      </div>

      <div className="flex-1 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
            <Pen className="w-3 h-3" /> Sign below
          </label>
          <button onClick={clear} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Clear
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={600} height={240}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
          className="w-full border-2 border-slate-300 rounded-xl bg-white touch-none flex-1"
          style={{ height: '200px' }}
        />
      </div>

      <div className="flex gap-3 p-4 border-t border-slate-100">
        <button onClick={onCancel}
          className="flex-1 py-3 border border-slate-300 text-slate-700 rounded-xl font-medium text-sm">
          Back
        </button>
        <button onClick={confirm}
          className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold text-sm">
          Confirm
        </button>
      </div>
    </div>
  );
}

// ─── Route card (two pins joined by dashed line) ──────────────────────────────
function RouteCard({ from, to }: { from: string | null; to: string | null }) {
  if (!from && !to) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex gap-3">
        <div className="flex flex-col items-center pt-0.5 shrink-0">
          <div className="w-3 h-3 rounded-full bg-green-500 ring-2 ring-green-200" />
          <div className="w-px flex-1 border-l-2 border-dashed border-slate-300 my-1" style={{ minHeight: 32 }} />
          <div className="w-3 h-3 rounded-full bg-red-500 ring-2 ring-red-200" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs font-bold text-green-700 uppercase mb-0.5">Collection</p>
            <p className="text-sm text-slate-700">{from ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-red-700 uppercase mb-0.5">Disposal</p>
            <p className="text-sm text-slate-700">{to ?? '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function DriverLoadView({ assignmentId, onClose }: DriverLoadViewProps) {
  const [job,        setJob]        = useState<FullJob | null>(null);
  const [assignment, setAssignment] = useState<FullAssignment | null>(null);
  const [loads,      setLoads]      = useState<Load[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [screen,     setScreen]     = useState<Screen>('job_detail');
  const [activeLoad, setActiveLoad] = useState<Load | null>(null);
  const [saving,     setSaving]     = useState(false);

  // Per-step form state
  const [collectName,          setCollectName]          = useState('');
  const [deliveryName,         setDeliveryName]         = useState('');
  const [deliveryPhotoDataUrl, setDeliveryPhotoDataUrl] = useState<string | null>(null);
  const [deliveryPhotoUrl,     setDeliveryPhotoUrl]     = useState<string | null>(null);
  const [uploadingPhoto,       setUploadingPhoto]       = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const isOffline = !navigator.onLine;

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: assgn }, { data: loadsData }] = await Promise.all([
      supabase
        .from('job_assignments')
        .select('*, vehicles(registration)')
        .eq('id', assignmentId)
        .single(),
      supabase
        .from('loads')
        .select('*')
        .eq('assignment_id', assignmentId)
        .order('load_number'),
    ]);

    if (!assgn) { setLoading(false); return; }
    setAssignment(assgn as FullAssignment);

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*, material_types(name, code)')
      .eq('id', assgn.job_id)
      .single();

    if (jobData) setJob(jobData as FullJob);
    if (loadsData) setLoads(loadsData as Load[]);
    setLoading(false);
  }, [assignmentId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Restore in-progress load from localStorage on mount
  useEffect(() => {
    if (!loads.length) return;
    const inProgress = loads.find((l) =>
      ['collecting', 'collected', 'delivering'].includes(l.status)
    );
    if (!inProgress) return;
    const saved = loadProgress(inProgress.id);
    if (saved) {
      setActiveLoad(inProgress);
      setCollectName(saved.collectName);
      setDeliveryName(saved.deliveryName);
      setDeliveryPhotoDataUrl(saved.deliveryPhotoDataUrl);
      setScreen(saved.screen);
    }
  }, [loads]);

  const getGps = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 8000, enableHighAccuracy: true },
      );
    });

  const save = (p: Partial<LoadProgress>) => {
    if (!activeLoad) return;
    const next: LoadProgress = {
      loadId: activeLoad.id,
      screen,
      collectName,
      deliveryName,
      deliveryPhotoDataUrl,
      ...p,
    };
    saveProgress(next);
  };

  // ── Step transitions ──────────────────────────────────────────────────────

  const startLoad = async (load: Load) => {
    setSaving(true);
    await supabase.from('loads').update({ status: 'collecting' }).eq('id', load.id);
    await loadData();
    setActiveLoad(load);
    const s: Screen = 'traveling_collect';
    saveProgress({ loadId: load.id, screen: s, collectName: '', deliveryName: '', deliveryPhotoDataUrl: null });
    setScreen(s);
    setSaving(false);
  };

  const arrivedAtCollection = () => {
    const s: Screen = 'collect_name';
    save({ screen: s });
    setScreen(s);
  };

  const continueToCollectSig = () => {
    if (!collectName.trim()) return;
    const s: Screen = 'collect_sig';
    save({ screen: s });
    setScreen(s);
  };

  const submitCollectionSig = async (sigDataUrl: string) => {
    if (!activeLoad) return;
    setSaving(true);
    const gps = await getGps();
    await supabase.from('loads').update({
      status:               'collected',
      collection_signed_by: collectName.trim(),
      collection_signature: sigDataUrl,
      collection_lat:       gps?.lat ?? null,
      collection_lng:       gps?.lng ?? null,
      collected_at:         new Date().toISOString(),
    }).eq('id', activeLoad.id);
    await loadData();
    const s: Screen = 'traveling_deliver';
    save({ screen: s });
    setScreen(s);
    setSaving(false);
  };

  const arrivedAtDelivery = () => {
    const s: Screen = 'deliver_name_photo';
    save({ screen: s });
    setScreen(s);
  };

  const continueToDeliverSig = () => {
    if (!deliveryName.trim()) return;
    const s: Screen = 'deliver_sig';
    save({ screen: s });
    setScreen(s);
  };

  const submitDeliverySig = async (sigDataUrl: string) => {
    if (!activeLoad) return;
    setSaving(true);
    const gps = await getGps();
    const { data: wtnRef } = await supabase.rpc('generate_wtn_reference');

    await supabase.from('loads').update({
      status:              'completed',
      disposal_signed_by:  deliveryName.trim(),
      disposal_signature:  sigDataUrl,
      disposal_lat:        gps?.lat ?? null,
      disposal_lng:        gps?.lng ?? null,
      disposed_at:         new Date().toISOString(),
      wtn_reference:       wtnRef ?? null,
      wtn_generated_at:    new Date().toISOString(),
      disposal_photo_url:  deliveryPhotoUrl ?? null,
    }).eq('id', activeLoad.id);

    // Increment loads_completed on assignment
    const { data: curr } = await supabase
      .from('job_assignments')
      .select('loads_completed')
      .eq('id', assignmentId)
      .single();
    if (curr) {
      await supabase
        .from('job_assignments')
        .update({ loads_completed: curr.loads_completed + 1 })
        .eq('id', assignmentId);
    }

    clearProgress(activeLoad.id);
    await loadData();
    setScreen('load_complete');
    setSaving(false);
  };

  // ── Photo capture ─────────────────────────────────────────────────────────
  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeLoad) return;

    // Immediate local preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setDeliveryPhotoDataUrl(dataUrl);
      save({ deliveryPhotoDataUrl: dataUrl });
    };
    reader.readAsDataURL(file);

    // Upload in background
    setUploadingPhoto(true);
    const path = `${assignmentId}/${activeLoad.id}.jpg`;
    const { data } = await supabase.storage
      .from('disposal-tickets')
      .upload(path, file, { upsert: true });
    if (data) {
      const { data: { publicUrl } } = supabase.storage
        .from('disposal-tickets')
        .getPublicUrl(path);
      setDeliveryPhotoUrl(publicUrl);
    }
    setUploadingPhoto(false);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const nextPendingLoad = loads.find((l) => l.status === 'pending');
  const completedCount  = loads.filter((l) => l.status === 'completed').length;
  const remaining       = loads.length - completedCount;

  const completedLoad = activeLoad
    ? (loads.find((l) => l.id === activeLoad.id) ?? activeLoad)
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
      </div>
    );
  }

  // ── Offline banner ────────────────────────────────────────────────────────
  const OfflinePill = isOffline ? (
    <div className="bg-amber-500 text-white text-xs font-bold text-center py-1.5 px-4">
      No connection — progress saved locally
    </div>
  ) : null;

  // ── Screen: job_detail ────────────────────────────────────────────────────
  if (screen === 'job_detail') {
    const firstPending = loads.find((l) => l.status === 'pending');
    const inProgress   = loads.find((l) =>
      ['collecting', 'collected', 'delivering'].includes(l.status)
    );

    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {OfflinePill}
        <div className="bg-slate-900 flex items-center gap-3 px-4 py-3 shrink-0">
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold truncate">{job?.title ?? 'Job'}</p>
            {job?.material_types && (
              <p className="text-slate-400 text-xs">{job.material_types.name}</p>
            )}
          </div>
          {job?.direction && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              job.direction === 'import' ? 'bg-blue-900 text-blue-300' : 'bg-amber-900 text-amber-300'
            }`}>
              {job.direction === 'import' ? 'IN' : 'OUT'}
            </span>
          )}
        </div>

        <div className="flex-1 p-4 space-y-3 overflow-y-auto">
          {/* Assignment info */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
            <Truck className="w-8 h-8 text-orange-500 shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Vehicle</p>
              <p className="font-mono font-bold text-slate-900 text-lg">
                {assignment?.vehicles?.registration ?? '—'}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-slate-500">Loads</p>
              <p className="font-bold text-slate-900">
                {completedCount} / {loads.length}
              </p>
            </div>
          </div>

          {/* Route card */}
          <RouteCard from={job?.collection_address ?? null} to={job?.disposal_address ?? null} />

          {/* Site notes */}
          {job?.description && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-700 uppercase mb-1">Site Notes</p>
              <p className="text-sm text-amber-800">{job.description}</p>
            </div>
          )}

          {/* Load list */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase px-1 mb-2">Loads</p>
            <div className="space-y-2">
              {loads.map((load) => (
                <div key={load.id}
                  className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    load.status === 'completed' ? 'bg-green-500' :
                    load.status === 'pending'   ? 'bg-slate-300' : 'bg-orange-400'
                  }`} />
                  <span className="text-sm font-semibold text-slate-800">Load {load.load_number}</span>
                  {load.wtn_reference && (
                    <span className="text-xs font-mono text-slate-400 ml-1">{load.wtn_reference}</span>
                  )}
                  <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
                    load.status === 'completed' ? 'bg-green-100 text-green-700' :
                    load.status === 'pending'   ? 'bg-slate-100 text-slate-600' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {load.status === 'completed' ? 'Done' :
                     load.status === 'pending'   ? 'Waiting' : 'In Progress'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="p-4 bg-white border-t border-slate-200 shrink-0">
          {inProgress ? (
            <button
              onClick={() => {
                setActiveLoad(inProgress);
                const saved = loadProgress(inProgress.id);
                if (saved) {
                  setCollectName(saved.collectName);
                  setDeliveryName(saved.deliveryName);
                  setDeliveryPhotoDataUrl(saved.deliveryPhotoDataUrl);
                  setScreen(saved.screen);
                } else {
                  const s: Screen =
                    inProgress.status === 'collecting' ? 'collect_name' :
                    inProgress.status === 'collected'  ? 'traveling_deliver' : 'deliver_name_photo';
                  setScreen(s);
                }
              }}
              className="w-full py-4 bg-orange-500 text-white font-bold rounded-xl text-base"
            >
              Continue Load {inProgress.load_number}
            </button>
          ) : firstPending ? (
            <button
              onClick={() => startLoad(firstPending)}
              disabled={saving}
              className="w-full py-4 bg-green-500 text-white font-bold rounded-xl text-base flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              Start Load #{firstPending.load_number}
            </button>
          ) : (
            <div className="text-center py-3">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-1" />
              <p className="text-sm font-semibold text-slate-700">All loads complete</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Screen: traveling_collect ─────────────────────────────────────────────
  if (screen === 'traveling_collect' && activeLoad) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col text-white">
        {OfflinePill}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <button onClick={() => setScreen('job_detail')} className="p-1 text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-slate-400 text-sm font-medium">
            Load {activeLoad.load_number} of {loads.length}
          </span>
          <span className="ml-auto text-xs font-bold bg-blue-800 text-blue-300 px-3 py-1 rounded-full">
            In Transit
          </span>
        </div>

        <div className="flex-1 p-4 flex flex-col gap-4">
          <div className="bg-slate-800 rounded-xl p-5">
            <p className="text-xs font-bold text-green-400 uppercase mb-2 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> Collection Point
            </p>
            <p className="text-white text-base font-semibold leading-snug">
              {job?.collection_address ?? 'Address not set'}
            </p>
            {job?.collection_address && (
              <button
                onClick={() => openInMaps(job.collection_address!)}
                className="mt-3 flex items-center gap-2 text-sm text-blue-400 font-semibold hover:text-blue-300"
              >
                <Navigation className="w-4 h-4" />
                Open in Maps
              </button>
            )}
          </div>

          {job?.material_types && (
            <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
                <span className="text-xs font-mono font-bold text-slate-300">
                  {job.material_types.code}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-400">Material</p>
                <p className="text-white font-semibold text-sm">{job.material_types.name}</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 shrink-0">
          <button
            onClick={arrivedAtCollection}
            className="w-full py-4 bg-green-500 text-white font-bold rounded-xl text-base"
          >
            I've Arrived
          </button>
        </div>
      </div>
    );
  }

  // ── Screen: collect_name ──────────────────────────────────────────────────
  if (screen === 'collect_name' && activeLoad) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {OfflinePill}
        <div className="bg-slate-900 flex items-center gap-3 px-4 py-3">
          <button onClick={() => setScreen('traveling_collect')} className="p-1 text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-white font-bold">Load {activeLoad.load_number} — Collection</span>
        </div>

        <div className="bg-green-500 px-4 py-3 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
          <div>
            <p className="text-white font-bold text-sm">Arrived at Collection</p>
            <p className="text-green-100 text-xs truncate">{job?.collection_address}</p>
          </div>
        </div>

        <div className="flex-1 p-4 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              Site Representative Name *
            </label>
            <input
              type="text"
              autoFocus
              value={collectName}
              onChange={(e) => {
                setCollectName(e.target.value);
                save({ collectName: e.target.value });
              }}
              placeholder="Full name of person signing"
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-base focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={continueToCollectSig}
            disabled={!collectName.trim()}
            className="w-full py-4 bg-orange-500 text-white font-bold rounded-xl text-base disabled:opacity-50"
          >
            Continue to Signature
          </button>
        </div>
      </div>
    );
  }

  // ── Screen: collect_sig ───────────────────────────────────────────────────
  if (screen === 'collect_sig' && activeLoad) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {OfflinePill}
        <div className="bg-slate-900 flex items-center gap-3 px-4 py-3 shrink-0">
          <button onClick={() => setScreen('collect_name')} className="p-1 text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-white font-bold">Collection Signature</span>
        </div>
        {saving ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : (
          <SigPad
            signerName={collectName}
            title="Collection Confirmation"
            subtitle="Site representative confirms material has been loaded."
            onCancel={() => setScreen('collect_name')}
            onSave={submitCollectionSig}
          />
        )}
      </div>
    );
  }

  // ── Screen: traveling_deliver ─────────────────────────────────────────────
  if (screen === 'traveling_deliver' && activeLoad) {
    const collectedLoad = loads.find((l) => l.id === activeLoad.id);
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col text-white">
        {OfflinePill}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <button onClick={() => setScreen('job_detail')} className="p-1 text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-slate-400 text-sm font-medium">
            Load {activeLoad.load_number} of {loads.length}
          </span>
          <span className="ml-auto text-xs font-bold bg-orange-800 text-orange-300 px-3 py-1 rounded-full">
            Loaded
          </span>
        </div>

        {collectedLoad?.collection_signed_by && (
          <div className="bg-green-600 px-4 py-2.5 flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
            <p className="text-white text-sm font-medium">
              Collection Complete — Signed by {collectedLoad.collection_signed_by}
            </p>
          </div>
        )}

        <div className="flex-1 p-4 flex flex-col gap-4">
          <div className="bg-slate-800 rounded-xl p-5">
            <p className="text-xs font-bold text-red-400 uppercase mb-2 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> Disposal Point
            </p>
            <p className="text-white text-base font-semibold leading-snug">
              {job?.disposal_address ?? 'Address not set'}
            </p>
            {job?.disposal_address && (
              <button
                onClick={() => openInMaps(job.disposal_address!)}
                className="mt-3 flex items-center gap-2 text-sm text-blue-400 font-semibold hover:text-blue-300"
              >
                <Navigation className="w-4 h-4" />
                Open in Maps
              </button>
            )}
          </div>

          {job?.material_types && (
            <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
                <span className="text-xs font-mono font-bold text-slate-300">
                  {job.material_types.code}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-400">Material</p>
                <p className="text-white font-semibold text-sm">{job.material_types.name}</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 shrink-0">
          <button
            onClick={arrivedAtDelivery}
            className="w-full py-4 bg-green-500 text-white font-bold rounded-xl text-base"
          >
            I've Arrived
          </button>
        </div>
      </div>
    );
  }

  // ── Screen: deliver_name_photo ────────────────────────────────────────────
  if (screen === 'deliver_name_photo' && activeLoad) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {OfflinePill}
        <div className="bg-slate-900 flex items-center gap-3 px-4 py-3 shrink-0">
          <button onClick={() => setScreen('traveling_deliver')} className="p-1 text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-white font-bold">Load {activeLoad.load_number} — Disposal</span>
        </div>

        <div className="bg-green-500 px-4 py-3 flex items-center gap-2 shrink-0">
          <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
          <div>
            <p className="text-white font-bold text-sm">Arrived at Disposal</p>
            <p className="text-green-100 text-xs truncate">{job?.disposal_address}</p>
          </div>
        </div>

        <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Photo capture */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              Tip Ticket / Delivery Note (optional)
            </label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhoto}
            />
            {deliveryPhotoDataUrl ? (
              <div className="relative">
                <img
                  src={deliveryPhotoDataUrl}
                  alt="Tip ticket"
                  className="w-full rounded-xl border border-slate-200 object-cover"
                  style={{ maxHeight: 180 }}
                />
                {uploadingPhoto && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center rounded-xl">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                  </div>
                )}
                <button
                  onClick={() => { setDeliveryPhotoDataUrl(null); setDeliveryPhotoUrl(null); }}
                  className="absolute top-2 right-2 bg-white rounded-full p-1 shadow text-slate-500 hover:text-red-500"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => photoInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center gap-2 text-slate-400 hover:border-orange-400 hover:text-orange-400 transition-colors"
              >
                <Camera className="w-8 h-8" />
                <span className="text-sm font-medium">Take Photo</span>
              </button>
            )}
          </div>

          {/* Delivery rep name */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              Site Representative Name *
            </label>
            <input
              type="text"
              value={deliveryName}
              onChange={(e) => {
                setDeliveryName(e.target.value);
                save({ deliveryName: e.target.value });
              }}
              placeholder="Full name of person signing"
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-base focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 shrink-0">
          <button
            onClick={continueToDeliverSig}
            disabled={!deliveryName.trim()}
            className="w-full py-4 bg-orange-500 text-white font-bold rounded-xl text-base disabled:opacity-50"
          >
            Continue to Signature
          </button>
        </div>
      </div>
    );
  }

  // ── Screen: deliver_sig ───────────────────────────────────────────────────
  if (screen === 'deliver_sig' && activeLoad) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {OfflinePill}
        <div className="bg-slate-900 flex items-center gap-3 px-4 py-3 shrink-0">
          <button onClick={() => setScreen('deliver_name_photo')} className="p-1 text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-white font-bold">Disposal Signature</span>
        </div>
        {saving ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : (
          <SigPad
            signerName={deliveryName}
            title="Disposal Confirmation"
            subtitle="Site representative confirms material has been received/disposed."
            onCancel={() => setScreen('deliver_name_photo')}
            onSave={submitDeliverySig}
          />
        )}
      </div>
    );
  }

  // ── Screen: load_complete ─────────────────────────────────────────────────
  if (screen === 'load_complete' && completedLoad) {
    const wtnRef = completedLoad.wtn_reference;
    const wtnUrl = wtnRef ? `${window.location.origin}/wtn/${wtnRef}` : null;
    const afterRemaining = remaining - 1; // remaining was counted before this load completed

    return (
      <div className="min-h-screen bg-green-500 flex flex-col">
        {OfflinePill}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-green-400">
          <button onClick={() => setScreen('job_detail')} className="p-1 text-green-200 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col items-center gap-5">
          {/* Tick */}
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Load Complete!</h1>
            <p className="text-green-100 mt-1">
              Load #{completedLoad.load_number} delivered successfully
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-6 bg-white/20 rounded-xl px-8 py-4 w-full justify-around">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{completedCount}</p>
              <p className="text-green-100 text-xs mt-0.5">Completed</p>
            </div>
            <div className="w-px bg-white/30" />
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{Math.max(0, afterRemaining)}</p>
              <p className="text-green-100 text-xs mt-0.5">Remaining</p>
            </div>
          </div>

          {/* WTN panel */}
          {wtnRef && wtnUrl && (
            <div className="bg-white rounded-2xl p-5 w-full">
              <p className="text-xs font-bold text-slate-500 uppercase mb-3 text-center">
                Waste Transfer Note
              </p>
              <div className="flex justify-center mb-3">
                <div className="p-3 border border-slate-200 rounded-xl bg-white">
                  <QRCode value={wtnUrl} size={130} />
                </div>
              </div>
              <p className="text-center text-2xl font-mono font-bold text-orange-500 tracking-widest mb-1">
                {wtnRef}
              </p>
              <p className="text-center text-xs text-slate-400 mb-3">For receiver to scan</p>
              <button
                onClick={() => window.open(wtnUrl, '_blank')}
                className="w-full py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-50"
              >
                <ChevronRight className="w-4 h-4" />
                View Transfer Note
              </button>
            </div>
          )}
        </div>

        <div className="p-4 shrink-0 space-y-2">
          {nextPendingLoad ? (
            <button
              onClick={() => {
                setActiveLoad(nextPendingLoad);
                setCollectName('');
                setDeliveryName('');
                setDeliveryPhotoDataUrl(null);
                setDeliveryPhotoUrl(null);
                startLoad(nextPendingLoad);
              }}
              disabled={saving}
              className="w-full py-4 bg-white text-green-600 font-bold rounded-xl text-base flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Loader2 className="w-5 h-5 animate-spin" />}
              Start Next Load
            </button>
          ) : (
            <div className="bg-white/20 rounded-xl p-4 text-center">
              <p className="text-white font-bold">All done for today!</p>
              <p className="text-green-100 text-sm mt-0.5">
                Great work completing all your loads.
              </p>
            </div>
          )}
          <button
            onClick={() => setScreen('job_detail')}
            className="w-full py-3 text-green-100 text-sm font-medium"
          >
            Back to Job
          </button>
        </div>
      </div>
    );
  }

  return null;
}
