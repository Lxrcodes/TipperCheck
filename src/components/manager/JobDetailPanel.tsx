import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';
import {
  ChevronLeft,
  Edit2,
  Loader2,
  ExternalLink,
  MapPin,
  Truck,
  RefreshCw,
  Share2,
  Check,
  Receipt,
  Plus,
  Package,
} from 'lucide-react';
import type { Job, JobAssignment, Load, JobStatus, Vehicle, JobOrder } from '@/types';
import { InvoiceModal } from './InvoiceModal';
import { JobOrderModal } from './JobOrderModal';

// ============================================================================
// Types
// ============================================================================

type JobWithMaterial = Job & { material_types: { name: string; code: string } | null };

type AssignmentWithVehicle = JobAssignment & {
  vehicles: Pick<Vehicle, 'registration' | 'vehicle_type'> | null;
};

type OrderRow = JobOrder & {
  material_types: { name: string; code: string } | null;
  job_assignments: AssignmentWithVehicle[];
};

type LoadStatus = Load['status'];

// ============================================================================
// Constants
// ============================================================================

const STATUS_LABEL: Record<JobStatus, string> = {
  pending:   'Pending',
  active:    'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<JobStatus, string> = {
  pending:   'bg-slate-100 text-slate-700',
  active:    'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  pending:   ['active', 'cancelled'],
  active:    ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const LOAD_STATUS: Record<LoadStatus, { label: string; color: string }> = {
  pending:    { label: 'Pending',    color: 'text-slate-400' },
  collecting: { label: 'Collecting', color: 'text-amber-500' },
  collected:  { label: 'Collected',  color: 'text-amber-600' },
  delivering: { label: 'Delivering', color: 'text-blue-500' },
  completed:  { label: 'Complete',   color: 'text-green-500' },
};

const IN_PROGRESS: LoadStatus[] = ['collecting', 'collected', 'delivering'];

// ============================================================================
// Component
// ============================================================================

interface JobDetailPanelProps {
  job: JobWithMaterial;
  userId: string;
  onBack: () => void;
  onEdit: () => void;
}

export function JobDetailPanel({ job, userId, onBack, onEdit }: JobDetailPanelProps) {
  const [orders,          setOrders]          = useState<OrderRow[]>([]);
  const [loadsByAssignment, setLoadsByAssignment] = useState<Record<string, Load[]>>({});
  const [loading,         setLoading]         = useState(true);
  const [statusUpdating,  setStatusUpdating]  = useState(false);
  const [currentStatus,   setCurrentStatus]   = useState<JobStatus>(job.status);
  const [copiedRef,       setCopiedRef]       = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showOrderModal,  setShowOrderModal]  = useState(false);
  const [editingOrder,    setEditingOrder]    = useState<OrderRow | null>(null);

  const shareWtn = async (ref: string) => {
    const url = `${window.location.origin}/wtn/${ref}`;
    if (navigator.share) {
      navigator.share({ title: `WTN ${ref}`, url });
    } else {
      await navigator.clipboard.writeText(url);
      setCopiedRef(ref);
      setTimeout(() => setCopiedRef(null), 2000);
    }
  };

  useEffect(() => {
    loadDetail();
    if (job.status === 'active') {
      const interval = setInterval(loadDetail, 30000);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const loadDetail = async () => {
    const [ordersRes, loadsRes] = await Promise.all([
      supabase
        .from('job_orders')
        .select('*, material_types(name, code), job_assignments(*, vehicles(registration, vehicle_type))')
        .eq('job_id', job.id)
        .order('created_at'),
      supabase
        .from('loads')
        .select('*')
        .eq('job_id', job.id)
        .order('load_number'),
    ]);

    if (ordersRes.data) setOrders(ordersRes.data as OrderRow[]);

    if (loadsRes.data) {
      const grouped: Record<string, Load[]> = {};
      for (const load of loadsRes.data as Load[]) {
        if (!grouped[load.assignment_id]) grouped[load.assignment_id] = [];
        grouped[load.assignment_id].push(load);
      }
      setLoadsByAssignment(grouped);
    }

    setLoading(false);
  };

  const handleStatusChange = async (newStatus: JobStatus) => {
    setStatusUpdating(true);
    const { error } = await supabase
      .from('jobs')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', job.id);
    if (!error) setCurrentStatus(newStatus);
    setStatusUpdating(false);
  };

  const transitions = STATUS_TRANSITIONS[currentStatus];

  const allAssignments = orders.flatMap((o) => o.job_assignments);
  const allLoads = Object.values(loadsByAssignment).flat();
  const totalCompleted = allLoads.filter((l) => l.status === 'completed').length;
  const totalAssigned  = allAssignments.reduce((s, a) => s + a.loads_assigned, 0);
  const hasActiveLoad  = allLoads.some((l) => IN_PROGRESS.includes(l.status));

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">

      {/* Header row */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-xs font-bold text-slate-400">{job.reference}</span>
            <span className="font-mono text-xs font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">
              {job.job_code}
            </span>
          </div>
          <h1 className="font-bold text-slate-900 text-lg leading-tight truncate">{job.title}</h1>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shrink-0"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Edit
        </button>
        {currentStatus === 'completed' && (
          <button
            onClick={() => setShowInvoiceModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors shrink-0"
          >
            <Receipt className="w-3.5 h-3.5" />
            Invoice
          </button>
        )}
      </div>

      {/* Job info card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 space-y-3">

        {/* Status + transitions */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[currentStatus]}`}>
            {STATUS_LABEL[currentStatus]}
          </span>
          {hasActiveLoad && (
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Loads active
            </span>
          )}
          {transitions.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              disabled={statusUpdating}
              className="text-xs font-medium px-2.5 py-1 border border-slate-200 rounded-full hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Mark {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {/* Route */}
        {(job.collection_address || job.disposal_address) && (
          <div className="flex items-start gap-2 text-sm text-slate-600">
            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              {job.collection_address && (
                <p className="truncate">
                  <span className="text-xs font-bold text-green-700 uppercase mr-1.5">From</span>
                  {job.collection_address.split(',').slice(0, 2).join(',')}
                </p>
              )}
              {job.disposal_address && (
                <p className="truncate mt-0.5">
                  <span className="text-xs font-bold text-red-700 uppercase mr-1.5">To</span>
                  {job.disposal_address.split(',').slice(0, 2).join(',')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="flex gap-5 text-sm border-t border-slate-100 pt-3">
          {totalAssigned > 0 && (
            <div>
              <p className="text-xs text-slate-400">Loads</p>
              <p className="font-bold text-slate-800">{totalCompleted} / {totalAssigned}</p>
            </div>
          )}
          {job.start_date && (
            <div>
              <p className="text-xs text-slate-400">Start date</p>
              <p className="font-bold text-slate-800">
                {new Date(job.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Orders section */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Orders</p>
        <button
          onClick={() => { setEditingOrder(null); setShowOrderModal(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-600 border border-orange-200 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Order
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No orders yet</p>
          <p className="text-xs text-slate-400 mt-1">Add an order to assign vehicles and track loads</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const assignments = order.job_assignments;
            const orderLoads  = assignments.flatMap((a) => loadsByAssignment[a.id] ?? []);
            const completed   = orderLoads.filter((l) => l.status === 'completed').length;
            const assigned    = assignments.reduce((s, a) => s + a.loads_assigned, 0);

            return (
              <div key={order.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">

                {/* Order header */}
                <div className="px-4 py-3 flex items-center gap-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    {order.direction && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        order.direction === 'import' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {order.direction === 'import' ? 'IN' : 'OUT'}
                      </span>
                    )}
                    {order.material_types && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">
                        {order.material_types.name}
                      </span>
                    )}
                    {!order.material_types && !order.direction && (
                      <span className="text-xs text-slate-400 italic">No material set</span>
                    )}
                    {order.order_date && (
                      <span className="text-xs font-semibold text-slate-600 shrink-0">
                        {new Date(order.order_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    {order.rate_per_load && (
                      <span className="text-xs text-slate-500 ml-auto shrink-0">
                        £{Number(order.rate_per_load).toFixed(2)}/load
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {assigned > 0 && (
                      <span className="text-xs font-bold text-slate-600">
                        {completed}/{assigned}
                        <span className="font-normal text-slate-400 ml-0.5">loads</span>
                      </span>
                    )}
                    <button
                      onClick={() => { setEditingOrder(order); setShowOrderModal(true); }}
                      className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {/* Assignments */}
                {assignments.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-400">No vehicles assigned</div>
                ) : (
                  <div>
                    {assignments.map((a) => {
                      const loads = loadsByAssignment[a.id] ?? [];
                      const vCompleted = loads.filter((l) => l.status === 'completed').length;
                      const progressPct = a.loads_assigned > 0 ? (vCompleted / a.loads_assigned) * 100 : 0;
                      const activeLoad = loads.find((l) => IN_PROGRESS.includes(l.status));

                      return (
                        <div key={a.id} className="border-t border-slate-50">
                          {/* Vehicle row */}
                          <div className="px-4 py-2.5 flex items-center gap-3">
                            <Truck className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="font-mono font-bold text-slate-800 text-sm">
                              {a.vehicles?.registration ?? '—'}
                            </span>
                            {activeLoad && (
                              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                {LOAD_STATUS[activeLoad.status].label}
                              </span>
                            )}
                            <div className="ml-auto text-sm font-bold text-slate-700">
                              {vCompleted}/{a.loads_assigned}
                              <span className="text-xs font-normal text-slate-400 ml-1">loads</span>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="h-1 bg-slate-100 mx-4 rounded-full mb-1">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all duration-500"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>

                          {/* Load rows */}
                          <div className="pb-1">
                            {loads.map((load) => {
                              const cfg = LOAD_STATUS[load.status];
                              return (
                                <div
                                  key={load.id}
                                  className="px-4 py-1.5 flex items-center gap-3"
                                >
                                  <span className="text-xs font-bold text-slate-400 w-14 shrink-0">
                                    Load {load.load_number}
                                  </span>
                                  <span className={`text-xs font-semibold ${cfg.color}`}>
                                    {cfg.label}
                                  </span>
                                  {load.status === 'completed' && load.disposed_at && (
                                    <span className="text-xs text-slate-400">
                                      {new Date(load.disposed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  )}
                                  {load.wtn_reference && (
                                    <div className="ml-auto flex items-center gap-2">
                                      <a
                                        href={`/wtn/${load.wtn_reference}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-mono font-bold"
                                      >
                                        {load.wtn_reference}
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); shareWtn(load.wtn_reference!); }}
                                        className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                                        title="Share WTN"
                                      >
                                        {copiedRef === load.wtn_reference
                                          ? <Check className="w-3.5 h-3.5 text-green-500" />
                                          : <Share2 className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showInvoiceModal && (
        <InvoiceModal
          invoice={null}
          orgId={job.org_id}
          userId={userId}
          prefillJob={job}
          onClose={() => setShowInvoiceModal(false)}
          onSaved={() => setShowInvoiceModal(false)}
        />
      )}

      {showOrderModal && (
        <JobOrderModal
          order={editingOrder as JobOrder | null}
          jobId={job.id}
          jobCode={job.job_code}
          jobStartDate={job.start_date}
          orgId={job.org_id}
          userId={userId}
          onClose={() => setShowOrderModal(false)}
          onSaved={() => { setShowOrderModal(false); loadDetail(); }}
        />
      )}
    </div>
  );
}
