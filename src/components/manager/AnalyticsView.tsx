import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';
import { Loader2, TrendingUp, Truck, ClipboardCheck, Briefcase } from 'lucide-react';
import type { Organisation } from '@/types';
import { canAccessTier } from '@/types';

interface AnalyticsViewProps {
  org: Organisation;
}

interface InvoiceRow {
  id: string;
  status: string;
  total_gross: number;
  due_date: string | null;
  paid_at: string | null;
}

interface LoadRow {
  id: string;
  status: string;
  disposed_at: string | null;
}

interface JobRow {
  id: string;
  status: string;
}

interface VehicleRow {
  id: string;
  registration: string;
  status: string;
  mot_due_date: string | null;
  next_pmi_due_date: string | null;
}

interface CheckRow {
  id: string;
  check_date: string;
  overall_status: string;
}

interface DefectRow {
  id: string;
  severity: string;
  status: string;
}

function RevenueLineChart({ data }: { data: { label: string; value: number }[] }) {
  const W = 500;
  const H = 140;
  const PAD = { top: 16, right: 16, bottom: 28, left: 48 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(...data.map((d) => d.value), 1);
  const n = data.length;

  const px = (i: number) => PAD.left + (i / (n - 1)) * plotW;
  const py = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const points = data.map((d, i) => ({ x: px(i), y: py(d.value), ...d }));
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPoints = [
    `${PAD.left},${PAD.top + plotH}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${PAD.left + plotW},${PAD.top + plotH}`,
  ].join(' ');

  const midY = PAD.top + plotH / 2;
  const yLabels = [
    { y: PAD.top,        val: max },
    { y: midY,           val: max / 2 },
    { y: PAD.top + plotH, val: 0 },
  ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: 160 }}
      aria-label="Revenue line chart"
    >
      <defs>
        <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#f97316" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y axis gridlines + labels */}
      {yLabels.map(({ y, val }) => (
        <g key={y}>
          <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y} stroke="#f1f5f9" strokeWidth="1" />
          <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
            £{val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <polygon points={areaPoints} fill="url(#rev-fill)" />

      {/* Line */}
      <polyline points={linePoints} fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Data points + x labels */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#f97316" stroke="white" strokeWidth="2" />
          <text x={p.x} y={H - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">
            {p.label}
          </text>
          {/* Value tooltip on hover — show via title */}
          <title>£{p.value.toFixed(0)}</title>
        </g>
      ))}
    </svg>
  );
}

function StatCard({ label, value, sub, accent }: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'green' | 'red' | 'amber' | 'blue';
}) {
  const colors = {
    green: 'text-green-600',
    red:   'text-red-600',
    amber: 'text-amber-600',
    blue:  'text-blue-600',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? colors[accent] : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-slate-400" />
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function LockedSection({ tierName }: { tierName: string }) {
  return (
    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
      <p className="text-sm font-medium text-slate-500">Upgrade to {tierName} to see this data</p>
    </div>
  );
}

export function AnalyticsView({ org }: AnalyticsViewProps) {
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'bar' | 'line'>('line');
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [defects, setDefects] = useState<DefectRow[]>([]);

  useEffect(() => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queries: any[] = [
      supabase.from('vehicles').select('id, registration, status, mot_due_date, next_pmi_due_date').eq('org_id', org.id),
      supabase.from('check_runs').select('id, check_date, overall_status').eq('org_id', org.id).gte('check_date', thirtyDaysAgo),
      supabase.from('defects').select('id, severity, status').eq('org_id', org.id).neq('status', 'resolved'),
    ];

    if (canAccessTier(org, 2)) {
      queries.push(
        supabase.from('jobs').select('id, status').eq('org_id', org.id).neq('status', 'cancelled'),
        supabase.from('loads').select('id, status, disposed_at').eq('org_id', org.id)
      );
    }

    if (canAccessTier(org, 3)) {
      queries.push(
        supabase.from('invoices').select('id, status, total_gross, due_date, paid_at').eq('org_id', org.id).neq('status', 'void')
      );
    }

    Promise.all(queries).then((results) => {
      const [vecsRes, checksRes, defectsRes, ...rest] = results as { data: unknown[] | null }[];

      if (vecsRes.data)    setVehicles(vecsRes.data as VehicleRow[]);
      if (checksRes.data)  setChecks(checksRes.data as CheckRow[]);
      if (defectsRes.data) setDefects(defectsRes.data as DefectRow[]);

      let i = 0;
      if (canAccessTier(org, 2)) {
        if (rest[i]?.data)   setJobs(rest[i].data as JobRow[]);   i++;
        if (rest[i]?.data)   setLoads(rest[i].data as LoadRow[]); i++;
      }
      if (canAccessTier(org, 3)) {
        if (rest[i]?.data)   setInvoices(rest[i].data as InvoiceRow[]);
      }

      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  // ── Money ──────────────────────────────────────────────────────────────────
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

  const revenueThisMonth = invoices
    .filter((i) => i.status === 'paid' && i.paid_at && i.paid_at >= thisMonthStart)
    .reduce((s, i) => s + Number(i.total_gross), 0);

  const revenueLastMonth = invoices
    .filter((i) => i.status === 'paid' && i.paid_at && i.paid_at >= lastMonthStart && i.paid_at <= lastMonthEnd)
    .reduce((s, i) => s + Number(i.total_gross), 0);

  const outstanding = invoices
    .filter((i) => i.status === 'sent')
    .reduce((s, i) => s + Number(i.total_gross), 0);

  const overdue = invoices
    .filter((i) => i.status === 'sent' && i.due_date && i.due_date < today)
    .reduce((s, i) => s + Number(i.total_gross), 0);

  // Revenue by month — last 6 months
  const monthlyRevenue: { label: string; value: number }[] = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const start = d.toISOString().split('T')[0];
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    const total = invoices
      .filter((i) => i.status === 'paid' && i.paid_at && i.paid_at >= start && i.paid_at <= end)
      .reduce((s, i) => s + Number(i.total_gross), 0);
    monthlyRevenue.push({
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      value: total,
    });
  }
  const maxMonthly = Math.max(...monthlyRevenue.map((m) => m.value), 1);

  // ── Jobs & Loads ───────────────────────────────────────────────────────────
  const activeJobs    = jobs.filter((j) => j.status === 'active').length;
  const completedJobs = jobs.filter((j) => j.status === 'completed').length;

  const weekStart = new Date(Date.now() - 7 * 864e5).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const loadsThisMonth = loads.filter((l) => l.status === 'completed' && l.disposed_at && l.disposed_at >= monthStart).length;
  const loadsThisWeek  = loads.filter((l) => l.status === 'completed' && l.disposed_at && l.disposed_at >= weekStart).length;

  // ── Fleet ──────────────────────────────────────────────────────────────────
  const activeVehicles  = vehicles.filter((v) => v.status === 'active').length;
  const vorVehicles     = vehicles.filter((v) => v.status === 'vor').length;

  const in30Days = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];
  const motDueSoon = vehicles.filter((v) => v.mot_due_date && v.mot_due_date <= in30Days && v.mot_due_date >= today);
  const pmiDueSoon = vehicles.filter((v) => v.next_pmi_due_date && v.next_pmi_due_date <= in30Days && v.next_pmi_due_date >= today);

  // ── Compliance ─────────────────────────────────────────────────────────────
  const checksToday  = checks.filter((c) => c.check_date === today);
  const passToday    = checksToday.filter((c) => c.overall_status === 'pass').length;
  const defectsToday = checksToday.filter((c) => c.overall_status === 'defects').length;
  const dndToday     = checksToday.filter((c) => c.overall_status === 'do_not_drive').length;

  const checksThisWeek = checks.filter((c) => c.check_date >= new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0]);
  const weekPassRate   = checksThisWeek.length > 0
    ? Math.round((checksThisWeek.filter((c) => c.overall_status === 'pass').length / checksThisWeek.length) * 100)
    : null;

  const criticalDefects = defects.filter((d) => d.severity === 'critical').length;
  const majorDefects    = defects.filter((d) => d.severity === 'major').length;
  const minorDefects    = defects.filter((d) => d.severity === 'minor').length;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-8">
      <h1 className="text-xl md:text-2xl font-heading text-slate-900">Analytics</h1>

      {/* ── Revenue ─────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={TrendingUp} label="Revenue" />
        {!canAccessTier(org, 3) ? <LockedSection tierName="Control" /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label="This month" value={`£${revenueThisMonth.toFixed(0)}`} accent="green" />
              <StatCard label="Last month"  value={`£${revenueLastMonth.toFixed(0)}`} />
              <StatCard label="Outstanding" value={`£${outstanding.toFixed(0)}`}      accent={outstanding > 0 ? 'blue' : undefined} />
              <StatCard label="Overdue"     value={`£${overdue.toFixed(0)}`}           accent={overdue > 0 ? 'red' : undefined} />
            </div>

            {/* Revenue chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase">Revenue — last 6 months</p>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => setChartType('line')}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${chartType === 'line' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    Line
                  </button>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors border-l border-slate-200 ${chartType === 'bar' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    Bar
                  </button>
                </div>
              </div>

              {chartType === 'bar' ? (
                <div className="space-y-2">
                  {monthlyRevenue.map((m) => (
                    <div key={m.label} className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 w-8 shrink-0">{m.label}</span>
                      <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-orange-400 rounded transition-all duration-500"
                          style={{ width: `${(m.value / maxMonthly) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-700 w-16 text-right shrink-0">
                        {m.value > 0 ? `£${m.value.toFixed(0)}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <RevenueLineChart data={monthlyRevenue} />
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Jobs & Loads ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={Briefcase} label="Jobs & Loads" />
        {!canAccessTier(org, 2) ? <LockedSection tierName="Manage" /> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Active jobs"       value={activeJobs}    accent={activeJobs > 0 ? 'blue' : undefined} />
            <StatCard label="Completed jobs"    value={completedJobs} />
            <StatCard label="Loads this week"   value={loadsThisWeek} />
            <StatCard label="Loads this month"  value={loadsThisMonth} />
          </div>
        )}
      </section>

      {/* ── Fleet ────────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={Truck} label="Fleet" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <StatCard label="Active vehicles" value={activeVehicles} accent={activeVehicles > 0 ? 'green' : undefined} />
          <StatCard label="Off road (VOR)"  value={vorVehicles}    accent={vorVehicles > 0 ? 'amber' : undefined} />
          <StatCard label="Open defects"    value={defects.length} accent={criticalDefects > 0 ? 'red' : defects.length > 0 ? 'amber' : undefined} />
        </div>

        {(motDueSoon.length > 0 || pmiDueSoon.length > 0) && (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {motDueSoon.map((v) => (
              <div key={v.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="font-mono font-bold text-sm text-slate-800">{v.registration}</span>
                  <span className="ml-2 text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-bold">MOT due</span>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(v.mot_due_date! + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))}
            {pmiDueSoon.map((v) => (
              <div key={v.id + '-pmi'} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="font-mono font-bold text-sm text-slate-800">{v.registration}</span>
                  <span className="ml-2 text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-bold">PMI due</span>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(v.next_pmi_due_date! + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        )}

        {defects.length > 0 && (
          <div className="mt-3 flex gap-2">
            {criticalDefects > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                {criticalDefects} Critical
              </span>
            )}
            {majorDefects > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                {majorDefects} Major
              </span>
            )}
            {minorDefects > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                {minorDefects} Minor
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Compliance ───────────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={ClipboardCheck} label="Compliance" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Checks today"
            value={checksToday.length}
            sub={checksToday.length > 0 ? `${passToday} pass${defectsToday > 0 ? `, ${defectsToday} defects` : ''}${dndToday > 0 ? `, ${dndToday} DND` : ''}` : undefined}
          />
          <StatCard
            label="Pass rate (7 days)"
            value={weekPassRate !== null ? `${weekPassRate}%` : '—'}
            accent={weekPassRate !== null ? (weekPassRate >= 90 ? 'green' : weekPassRate >= 70 ? 'amber' : 'red') : undefined}
          />
          <StatCard label="Checks this month" value={checks.filter((c) => c.check_date >= thisMonthStart).length} />
          <StatCard
            label="Do Not Drive (30d)"
            value={checks.filter((c) => c.overall_status === 'do_not_drive').length}
            accent={checks.filter((c) => c.overall_status === 'do_not_drive').length > 0 ? 'red' : undefined}
          />
        </div>
      </section>
    </div>
  );
}
