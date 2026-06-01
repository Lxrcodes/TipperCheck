import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';
import {
  LayoutDashboard,
  Truck,
  Users,
  AlertTriangle,
  Settings,
  LogOut,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Search,
  Menu,
  X,
  ChevronRight,
  Mail,
  Phone,
  User as UserIcon,
  AlertCircle,
  Eye,
  EyeOff,
  Check,
  Lock,
  History,
  Calendar,
  FileText,
  ClipboardCheck,
  Wrench,
  ArrowUpDown,
  Briefcase,
} from 'lucide-react';
import type {
  AuthUser,
  Organisation,
  Vehicle,
  User,
  CheckRun,
  Defect,
  VehicleStatus,
  Job,
  JobStatus,
} from '@/types';
import {
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  FUEL_LEVELS,
  getVehicleStatusColor,
  getVehicleStatusLabel,
  getSeverityColor,
  getDefectStatusLabel,
  isDriver,
  canAccessTier,
} from '@/types';
import { VehicleModal } from './VehicleModal';
import { UserModal } from './UserModal';
import { MotRecordModal } from './MotRecordModal';
import { PmiRecordModal } from './PmiRecordModal';
import { JobModal } from './JobModal';

type DashboardTab = 'today' | 'history' | 'jobs' | 'vehicles' | 'team' | 'defects' | 'settings';

interface DashboardProps {
  user: AuthUser;
  org: Organisation;
  onLogout: () => void;
  onSwitchToDriver: () => void;
  onOrgReload: () => Promise<void>;
}

export function Dashboard({ user, org, onLogout, onSwitchToDriver, onOrgReload }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('today');
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Data
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [todayChecks, setTodayChecks] = useState<CheckRun[]>([]);
  const [openDefects, setOpenDefects] = useState<Defect[]>([]);

  // Modals
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showMotModal, setShowMotModal] = useState(false);
  const [motVehicle, setMotVehicle] = useState<Vehicle | null>(null);
  const [showPmiModal, setShowPmiModal] = useState(false);
  const [pmiVehicle, setPmiVehicle] = useState<Vehicle | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const [vehiclesRes, usersRes, checksRes, defectsRes] = await Promise.all([
        supabase.from('vehicles').select('*').eq('org_id', org.id).order('registration'),
        supabase.from('users').select('*').eq('org_id', org.id).order('name'),
        supabase
          .from('check_runs')
          .select('*')
          .eq('org_id', org.id)
          .eq('check_date', today)
          .order('completed_at', { ascending: false }),
        supabase
          .from('defects')
          .select('*')
          .eq('org_id', org.id)
          .neq('status', 'resolved')
          .order('created_at', { ascending: false }),
      ]);

      if (vehiclesRes.data) setVehicles(vehiclesRes.data);
      if (usersRes.data) setUsers(usersRes.data);
      if (checksRes.data) setTodayChecks(checksRes.data);
      if (defectsRes.data) setOpenDefects(defectsRes.data);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVehicleSaved = () => {
    setShowVehicleModal(false);
    setEditingVehicle(null);
    loadData();
  };

  const handleUserSaved = () => {
    setShowUserModal(false);
    setEditingUser(null);
    loadData();
  };

  const handleMotSaved = () => {
    setShowMotModal(false);
    setMotVehicle(null);
    loadData();
  };

  const openMotModal = (vehicle: Vehicle) => {
    setMotVehicle(vehicle);
    setShowMotModal(true);
  };

  const handlePmiSaved = () => {
    setShowPmiModal(false);
    setPmiVehicle(null);
    loadData();
  };

  const handleJobSaved = () => {
    setShowJobModal(false);
    setEditingJob(null);
    loadData();
  };

  const openPmiModal = (vehicle: Vehicle) => {
    setPmiVehicle(vehicle);
    setShowPmiModal(true);
  };

  // Stats
  const activeVehicles = vehicles.filter((v) => v.status === 'active');
  const checkedToday = new Set(todayChecks.map((c) => c.vehicle_id));
  const uncheckedVehicles = activeVehicles.filter((v) => !checkedToday.has(v.id));
  const criticalDefects = openDefects.filter((d) => d.severity === 'critical');

  // Close mobile menu when changing tabs
  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const handleSwitchToDriverMobile = () => {
    setMobileMenuOpen(false);
    onSwitchToDriver();
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold">{org.name}</span>
          {org.is_demo && (
            <span className="text-xs font-semibold bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full">Demo</span>
          )}
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 hover:bg-slate-800 rounded-lg"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile unless menu is open */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-64 bg-slate-900 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold truncate">{org.name}</div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-slate-400 truncate">{user.name}</div>
                {org.is_demo && (
                  <span className="text-xs font-semibold bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full shrink-0">Demo</span>
                )}
              </div>
            </div>
            {/* Close button for mobile */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden p-1 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 p-2 overflow-y-auto">
          <NavItem
            icon={LayoutDashboard}
            label="Today"
            active={activeTab === 'today'}
            onClick={() => handleTabChange('today')}
            badge={uncheckedVehicles.length > 0 ? uncheckedVehicles.length : undefined}
          />
          <NavItem
            icon={History}
            label="History"
            active={activeTab === 'history'}
            onClick={() => handleTabChange('history')}
          />
          <NavItem
            icon={Briefcase}
            label="Jobs"
            active={activeTab === 'jobs'}
            onClick={() => handleTabChange('jobs')}
            locked={!canAccessTier(org, 2)}
          />
          <NavItem
            icon={Truck}
            label="Vehicles"
            active={activeTab === 'vehicles'}
            onClick={() => handleTabChange('vehicles')}
            badge={vehicles.length}
          />
          <NavItem
            icon={Users}
            label="Team"
            active={activeTab === 'team'}
            onClick={() => handleTabChange('team')}
            badge={users.length}
          />
          <NavItem
            icon={AlertTriangle}
            label="Defects"
            active={activeTab === 'defects'}
            onClick={() => handleTabChange('defects')}
            badge={openDefects.length > 0 ? openDefects.length : undefined}
            badgeColor={criticalDefects.length > 0 ? 'red' : 'amber'}
          />
          <NavItem
            icon={Settings}
            label="Settings"
            active={activeTab === 'settings'}
            onClick={() => handleTabChange('settings')}
          />
        </nav>

        <div className="p-2 border-t border-slate-800">
          {isDriver(user) && (
            <button
              onClick={handleSwitchToDriverMobile}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors mb-1"
            >
              <Truck className="w-5 h-5" />
              <span>Switch to Driver App</span>
            </button>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : (
          <>
            {activeTab === 'today' && (
              <TodayView
                vehicles={vehicles}
                checks={todayChecks}
                defects={openDefects}
                onRecordMot={openMotModal}
                onRecordPmi={openPmiModal}
              />
            )}
            {activeTab === 'history' && (
              <HistoryView
                orgId={org.id}
                vehicles={vehicles}
              />
            )}
            {activeTab === 'jobs' && (
              <JobsView
                org={org}
                onCreateJob={() => {
                  setEditingJob(null);
                  setShowJobModal(true);
                }}
                onEditJob={(j) => {
                  setEditingJob(j);
                  setShowJobModal(true);
                }}
              />
            )}
            {activeTab === 'vehicles' && (
              <VehiclesView
                vehicles={vehicles}
                onAdd={() => {
                  setEditingVehicle(null);
                  setShowVehicleModal(true);
                }}
                onEdit={(v) => {
                  setEditingVehicle(v);
                  setShowVehicleModal(true);
                }}
                onRecordMot={openMotModal}
                onRecordPmi={openPmiModal}
              />
            )}
            {activeTab === 'team' && (
              <TeamView
                users={users}
                currentUserId={user.id}
                onAdd={() => {
                  setEditingUser(null);
                  setShowUserModal(true);
                }}
                onEdit={(u) => {
                  setEditingUser(u);
                  setShowUserModal(true);
                }}
              />
            )}
            {activeTab === 'defects' && (
              <DefectsView defects={openDefects} onRefresh={loadData} />
            )}
            {activeTab === 'settings' && <SettingsView org={org} activeVehicleCount={activeVehicles.length} onOrgReload={onOrgReload} />}
          </>
        )}
      </main>

      {/* Modals */}
      {showJobModal && (
        <JobModal
          job={editingJob}
          orgId={org.id}
          userId={user.id}
          vehicles={vehicles}
          onClose={() => {
            setShowJobModal(false);
            setEditingJob(null);
          }}
          onSaved={handleJobSaved}
        />
      )}

      {showVehicleModal && (
        <VehicleModal
          vehicle={editingVehicle}
          orgId={org.id}
          userId={user.id}
          onClose={() => {
            setShowVehicleModal(false);
            setEditingVehicle(null);
          }}
          onSaved={handleVehicleSaved}
        />
      )}

      {showUserModal && (
        <UserModal
          user={editingUser}
          orgId={org.id}
          currentUserId={user.id}
          onClose={() => {
            setShowUserModal(false);
            setEditingUser(null);
          }}
          onSaved={handleUserSaved}
        />
      )}

      {showMotModal && motVehicle && (
        <MotRecordModal
          vehicle={motVehicle}
          orgId={org.id}
          userId={user.id}
          userName={user.name}
          onClose={() => {
            setShowMotModal(false);
            setMotVehicle(null);
          }}
          onSaved={handleMotSaved}
        />
      )}

      {showPmiModal && pmiVehicle && (
        <PmiRecordModal
          vehicle={pmiVehicle}
          orgId={org.id}
          userId={user.id}
          userName={user.name}
          onClose={() => {
            setShowPmiModal(false);
            setPmiVehicle(null);
          }}
          onSaved={handlePmiSaved}
        />
      )}
    </div>
  );
}

// ============================================================================
// NavItem Component
// ============================================================================

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  badgeColor?: 'orange' | 'red' | 'amber';
  locked?: boolean;
}

function NavItem({ icon: Icon, label, active, onClick, badge, badgeColor = 'orange', locked }: NavItemProps) {
  const badgeColors = {
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        locked
          ? 'text-slate-600 cursor-pointer'
          : active
          ? 'bg-orange-500 text-white'
          : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="flex-1 text-left">{label}</span>
      {locked && <Lock className="w-3.5 h-3.5 text-slate-500" />}
      {!locked && badge !== undefined && (
        <span
          className={`px-2 py-0.5 text-xs font-bold rounded-full ${
            active ? 'bg-white/20 text-white' : `${badgeColors[badgeColor]} text-white`
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// TodayView Component
// ============================================================================

interface TodayViewProps {
  vehicles: Vehicle[];
  checks: CheckRun[];
  defects: Defect[];
  onRecordMot: (vehicle: Vehicle) => void;
  onRecordPmi: (vehicle: Vehicle) => void;
}

function getMotDaysUntil(motDueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(motDueDate);
  due.setHours(0, 0, 0, 0);
  return Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

type MotAlertLevel = 'overdue' | 'critical' | 'urgent' | 'warning' | 'notice';

function getMotAlertLevel(daysUntil: number): MotAlertLevel {
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 10) return 'critical';
  if (daysUntil <= 14) return 'urgent';
  if (daysUntil <= 21) return 'warning';
  return 'notice';
}

function getMotAlertLabel(daysUntil: number): string {
  if (daysUntil < 0) return `MOT overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''}`;
  if (daysUntil === 0) return 'MOT due today';
  if (daysUntil === 1) return 'MOT due tomorrow';
  if (daysUntil <= 10) return `MOT due in ${daysUntil} days`;
  if (daysUntil <= 14) return 'MOT due in 2 weeks';
  if (daysUntil <= 21) return 'MOT due in 3 weeks';
  return 'MOT due in ~1 month';
}

const MOT_ALERT_STYLES: Record<MotAlertLevel, { border: string; bg: string; text: string; badge: string }> = {
  overdue: { border: 'border-red-500', bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-500 text-white' },
  critical: { border: 'border-red-400', bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-500 text-white' },
  urgent: { border: 'border-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-500 text-white' },
  warning: { border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-500 text-white' },
  notice: { border: 'border-yellow-400', bg: 'bg-yellow-50', text: 'text-yellow-700', badge: 'bg-yellow-500 text-white' },
};

// PMI alerts: threshold is 7 days (1 week), levels at 1, 3, 5, 7 days
type PmiAlertLevel = 'overdue' | 'critical' | 'urgent' | 'warning' | 'notice';

function getPmiAlertLevel(daysUntil: number): PmiAlertLevel {
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 1) return 'critical';
  if (daysUntil <= 3) return 'urgent';
  if (daysUntil <= 5) return 'warning';
  return 'notice';
}

function getPmiAlertLabel(daysUntil: number): string {
  if (daysUntil < 0) return `PMI overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''}`;
  if (daysUntil === 0) return 'PMI due today';
  if (daysUntil === 1) return 'PMI due tomorrow';
  return `PMI due in ${daysUntil} days`;
}

const PMI_ALERT_STYLES: Record<PmiAlertLevel, { border: string; bg: string; text: string; badge: string }> = {
  overdue: { border: 'border-red-500', bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-500 text-white' },
  critical: { border: 'border-red-400', bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-500 text-white' },
  urgent: { border: 'border-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-500 text-white' },
  warning: { border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-500 text-white' },
  notice: { border: 'border-yellow-400', bg: 'bg-yellow-50', text: 'text-yellow-700', badge: 'bg-yellow-500 text-white' },
};

function TodayView({ vehicles, checks, defects, onRecordMot, onRecordPmi }: TodayViewProps) {
  const activeVehicles = vehicles.filter((v) => v.status === 'active');
  const checkedVehicleIds = new Set(checks.map((c) => c.vehicle_id));

  const getVehicleCheck = (vehicleId: string) => {
    return checks.find((c) => c.vehicle_id === vehicleId);
  };

  // Compute MOT alerts: show for any vehicle (active or not) within 30 days or overdue
  const motAlerts = vehicles
    .filter((v) => v.mot_due_date && v.status !== 'retired')
    .map((v) => ({ vehicle: v, daysUntil: getMotDaysUntil(v.mot_due_date!) }))
    .filter(({ daysUntil }) => daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // Compute PMI alerts: show within 7 days or overdue
  const pmiAlerts = vehicles
    .filter((v) => v.next_pmi_due_date && v.status !== 'retired')
    .map((v) => ({ vehicle: v, daysUntil: getMotDaysUntil(v.next_pmi_due_date!) }))
    .filter(({ daysUntil }) => daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-heading text-slate-900 mb-6">Today's Overview</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Vehicles Checked"
          value={`${checkedVehicleIds.size} / ${activeVehicles.length}`}
          icon={CheckCircle2}
          color="green"
        />
        <StatCard
          label="Awaiting Check"
          value={activeVehicles.length - checkedVehicleIds.size}
          icon={Clock}
          color="amber"
        />
        <StatCard
          label="Open Defects"
          value={defects.length}
          icon={AlertTriangle}
          color={defects.some((d) => d.severity === 'critical') ? 'red' : 'slate'}
        />
      </div>

      {/* MOT Alerts */}
      {motAlerts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-amber-500" />
            MOT Alerts
          </h2>
          <div className="space-y-2">
            {motAlerts.map(({ vehicle, daysUntil }) => {
              const level = getMotAlertLevel(daysUntil);
              const styles = MOT_ALERT_STYLES[level];
              return (
                <div
                  key={vehicle.id}
                  className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${styles.border} ${styles.bg}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded ${styles.badge}`}>
                      {level === 'overdue' ? 'OVERDUE' : level.toUpperCase()}
                    </span>
                    <span className="font-mono font-bold text-slate-900">{vehicle.registration}</span>
                    <span className={`text-sm ${styles.text}`}>{getMotAlertLabel(daysUntil)}</span>
                  </div>
                  <button
                    onClick={() => onRecordMot(vehicle)}
                    className="px-3 py-1 text-xs font-bold bg-white border border-slate-300 text-slate-700 rounded hover:bg-slate-50 whitespace-nowrap"
                  >
                    Record MOT
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PMI Alerts */}
      {pmiAlerts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-500" />
            PMI Alerts
          </h2>
          <div className="space-y-2">
            {pmiAlerts.map(({ vehicle, daysUntil }) => {
              const level = getPmiAlertLevel(daysUntil);
              const styles = PMI_ALERT_STYLES[level];
              return (
                <div
                  key={vehicle.id}
                  className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${styles.border} ${styles.bg}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded ${styles.badge}`}>
                      {level === 'overdue' ? 'OVERDUE' : level.toUpperCase()}
                    </span>
                    <span className="font-mono font-bold text-slate-900">{vehicle.registration}</span>
                    <span className={`text-sm ${styles.text}`}>{getPmiAlertLabel(daysUntil)}</span>
                  </div>
                  <button
                    onClick={() => onRecordPmi(vehicle)}
                    className="px-3 py-1 text-xs font-bold bg-white border border-slate-300 text-slate-700 rounded hover:bg-slate-50 whitespace-nowrap"
                  >
                    Record PMI
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vehicle Grid */}
      <h2 className="text-lg font-bold text-slate-900 mb-4">Vehicle Status</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {activeVehicles.map((vehicle) => {
          const check = getVehicleCheck(vehicle.id);
          return (
            <VehicleStatusCard key={vehicle.id} vehicle={vehicle} check={check} />
          );
        })}
      </div>

      {activeVehicles.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No active vehicles. Add your first vehicle to get started.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// StatCard Component
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: 'green' | 'amber' | 'red' | 'slate';
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  const colors = {
    green: 'bg-green-50 text-green-600 border-green-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  };

  return (
    <div className={`p-4 rounded-lg border ${colors[color]}`}>
      <div className="flex items-center gap-3">
        <Icon className="w-8 h-8" />
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm opacity-75">{label}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// VehicleStatusCard Component
// ============================================================================

interface VehicleStatusCardProps {
  vehicle: Vehicle;
  check?: CheckRun;
}

function VehicleStatusCard({ vehicle, check }: VehicleStatusCardProps) {
  let bgColor = 'bg-slate-200';
  let statusIcon = <Clock className="w-5 h-5 text-slate-500" />;
  let statusText = 'Not checked';

  if (check) {
    if (check.overall_status === 'pass') {
      bgColor = 'bg-green-500';
      statusIcon = <CheckCircle2 className="w-5 h-5 text-white" />;
      statusText = 'Pass';
    } else if (check.overall_status === 'defects') {
      bgColor = 'bg-amber-500';
      statusIcon = <AlertTriangle className="w-5 h-5 text-white" />;
      statusText = 'Defects';
    } else {
      bgColor = 'bg-red-500';
      statusIcon = <XCircle className="w-5 h-5 text-white" />;
      statusText = 'Do Not Drive';
    }
  }

  return (
    <div className={`${bgColor} rounded-lg p-4 ${check ? 'text-white' : 'text-slate-700'}`}>
      <div className="text-lg font-bold font-mono">{vehicle.registration}</div>
      <div className="text-sm opacity-75 mb-2">
        {vehicle.make} {vehicle.model}
      </div>
      <div className="flex items-center gap-2">
        {statusIcon}
        <span className="text-sm font-medium">{statusText}</span>
      </div>
      {check && (
        <div className="text-xs opacity-75 mt-1">
          {new Date(check.completed_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VehiclesView Component
// ============================================================================

type VehicleSort = 'registration' | 'mot_due' | 'pmi_due' | 'status';

interface VehiclesViewProps {
  vehicles: Vehicle[];
  onAdd: () => void;
  onEdit: (vehicle: Vehicle) => void;
  onRecordMot: (vehicle: Vehicle) => void;
  onRecordPmi: (vehicle: Vehicle) => void;
}

function VehiclesView({ vehicles, onAdd, onEdit, onRecordMot, onRecordPmi }: VehiclesViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<VehicleSort>('registration');
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);

  const nullLast = (a: string | null, b: string | null): number => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  };

  const sorted = [...vehicles].sort((a, b) => {
    switch (sortBy) {
      case 'mot_due':
        return nullLast(a.mot_due_date, b.mot_due_date);
      case 'pmi_due':
        return nullLast(a.next_pmi_due_date, b.next_pmi_due_date);
      case 'status': {
        const order = { active: 0, vor: 1, retired: 2 };
        return order[a.status] - order[b.status];
      }
      default:
        return a.registration.localeCompare(b.registration);
    }
  });

  const filtered = sorted.filter((v) => {
    const matchesSearch =
      v.registration.toLowerCase().includes(search.toLowerCase()) ||
      (v.make?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (v.model?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleExpand = (vehicleId: string) => {
    setExpandedVehicleId(expandedVehicleId === vehicleId ? null : vehicleId);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl md:text-2xl font-heading text-slate-900">Vehicles</h1>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 px-3 py-2 md:px-4 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors text-sm md:text-base"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Add Vehicle</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* Search, Filter and Sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search registration, make, model..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VehicleStatus | 'all')}
          className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none bg-white"
        >
          <option value="all">All Status</option>
          {VEHICLE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as VehicleSort)}
            className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none bg-white"
          >
            <option value="registration">Registration A–Z</option>
            <option value="mot_due">MOT Due</option>
            <option value="pmi_due">PMI Due</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {/* Vehicle Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg p-12 text-center">
          <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">
            {search || statusFilter !== 'all' ? 'No vehicles match your search' : 'No vehicles yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((vehicle) => {
            const isExpanded = expandedVehicleId === vehicle.id;
            const vehicleTypeLabel = VEHICLE_TYPES.find((t) => t.value === vehicle.vehicle_type)?.label;

            return (
              <div
                key={vehicle.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden"
              >
                {/* Vehicle Header - Always visible */}
                <button
                  onClick={() => toggleExpand(vehicle.id)}
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
                >
                  {/* Vehicle icon with status color */}
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    vehicle.status === 'active'
                      ? 'bg-green-100'
                      : vehicle.status === 'vor'
                      ? 'bg-amber-100'
                      : 'bg-slate-100'
                  }`}>
                    <Truck className={`w-6 h-6 ${
                      vehicle.status === 'active'
                        ? 'text-green-600'
                        : vehicle.status === 'vor'
                        ? 'text-amber-600'
                        : 'text-slate-400'
                    }`} />
                  </div>

                  {/* Registration and type */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">
                        {vehicle.registration}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs font-bold rounded ${getVehicleStatusColor(vehicle.status)}`}
                      >
                        {getVehicleStatusLabel(vehicle.status)}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500 truncate">
                      {vehicleTypeLabel}
                      {(vehicle.make || vehicle.model) && ` • ${vehicle.make} ${vehicle.model}`.trim()}
                    </div>
                  </div>

                  {/* Expand indicator */}
                  <ChevronRight
                    className={`w-5 h-5 text-slate-400 transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100">
                    <div className="pt-3 space-y-3">
                      {/* Type */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Type</span>
                        <span className="text-slate-900">{vehicleTypeLabel}</span>
                      </div>

                      {/* Make / Model */}
                      {(vehicle.make || vehicle.model) && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Make / Model</span>
                          <span className="text-slate-900">{vehicle.make} {vehicle.model}</span>
                        </div>
                      )}

                      {/* VIN */}
                      {vehicle.vin && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">VIN</span>
                          <span className="text-slate-900 font-mono text-xs">{vehicle.vin}</span>
                        </div>
                      )}

                      {/* MOT Due */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">MOT Due</span>
                        {vehicle.mot_due_date ? (() => {
                          const d = getMotDaysUntil(vehicle.mot_due_date);
                          const cls = d < 0 ? 'text-red-600 font-medium' : d <= 14 ? 'text-amber-600 font-medium' : 'text-slate-900';
                          return <span className={cls}>{new Date(vehicle.mot_due_date).toLocaleDateString('en-GB')}</span>;
                        })() : <span className="text-slate-400">Not set</span>}
                      </div>

                      {/* PMI Interval */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">PMI Interval</span>
                        <span className="text-slate-900">Every {vehicle.pmi_interval_weeks ?? 6} weeks</span>
                      </div>

                      {/* Next PMI Due */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Next PMI Due</span>
                        {vehicle.next_pmi_due_date ? (() => {
                          const d = getMotDaysUntil(vehicle.next_pmi_due_date);
                          const cls = d < 0 ? 'text-red-600 font-medium' : d <= 7 ? 'text-amber-600 font-medium' : 'text-slate-900';
                          return <span className={cls}>{new Date(vehicle.next_pmi_due_date).toLocaleDateString('en-GB')}</span>;
                        })() : <span className="text-slate-400">Not set</span>}
                      </div>

                      {/* Status Notes */}
                      {vehicle.status_notes && (
                        <div className="text-sm">
                          <span className="text-slate-500 block mb-1">Notes</span>
                          <p className="text-slate-700 bg-slate-50 p-2 rounded">
                            {vehicle.status_notes}
                          </p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button
                          onClick={() => onEdit(vehicle)}
                          className="flex-1 py-2 px-3 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onRecordMot(vehicle)}
                          className="flex-1 py-2 px-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors text-sm flex items-center justify-center gap-1"
                        >
                          <ClipboardCheck className="w-3 h-3" />
                          MOT
                        </button>
                        <button
                          onClick={() => onRecordPmi(vehicle)}
                          className="flex-1 py-2 px-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors text-sm flex items-center justify-center gap-1"
                        >
                          <Wrench className="w-3 h-3" />
                          PMI
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TeamView Component
// ============================================================================

interface TeamViewProps {
  users: User[];
  currentUserId: string;
  onAdd: () => void;
  onEdit: (user: User) => void;
}

function TeamView({ users, currentUserId, onAdd, onEdit }: TeamViewProps) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const toggleExpand = (userId: string) => {
    setExpandedUserId(expandedUserId === userId ? null : userId);
  };

  const filtered = users.filter((u) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(searchLower) ||
      u.email.toLowerCase().includes(searchLower) ||
      (u.phone?.toLowerCase().includes(searchLower) ?? false)
    );
  });

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl md:text-2xl font-heading text-slate-900">Team</h1>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 px-3 py-2 md:px-4 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors text-sm md:text-base"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Invite User</span>
          <span className="sm:hidden">Invite</span>
        </button>
      </div>

      {/* Search */}
      {users.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none bg-white"
          />
        </div>
      )}

      {users.length === 0 ? (
        <div className="bg-white rounded-lg p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No team members yet</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No team members match your search</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((user) => {
            const isExpanded = expandedUserId === user.id;
            const isCurrentUser = user.id === currentUserId;

            return (
              <div
                key={user.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden"
              >
                {/* Profile Header - Always visible */}
                <button
                  onClick={() => toggleExpand(user.id)}
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
                >
                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    user.is_active ? 'bg-orange-100' : 'bg-slate-100'
                  }`}>
                    <UserIcon className={`w-6 h-6 ${
                      user.is_active ? 'text-orange-600' : 'text-slate-400'
                    }`} />
                  </div>

                  {/* Name and roles */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 truncate">
                        {user.name}
                      </span>
                      {isCurrentUser && (
                        <span className="text-xs text-slate-400">(you)</span>
                      )}
                      {!user.is_active && (
                        <span className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-500 rounded">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {user.roles.map((role) => (
                        <span
                          key={role}
                          className={`px-2 py-0.5 text-xs font-bold rounded ${
                            role === 'manager'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Expand indicator */}
                  <ChevronRight
                    className={`w-5 h-5 text-slate-400 transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100">
                    <div className="pt-3 space-y-3">
                      {/* Email */}
                      <div className="flex items-center gap-3 text-sm">
                        <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <a
                          href={`mailto:${user.email}`}
                          className="text-blue-600 hover:underline truncate"
                        >
                          {user.email}
                        </a>
                      </div>

                      {/* Phone */}
                      {user.phone && (
                        <div className="flex items-center gap-3 text-sm">
                          <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <a
                            href={`tel:${user.phone}`}
                            className="text-blue-600 hover:underline"
                          >
                            {user.phone}
                          </a>
                        </div>
                      )}

                      {/* Status */}
                      <div className="flex items-center gap-3 text-sm">
                        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${
                          user.is_active ? 'text-green-500' : 'text-slate-300'
                        }`} />
                        <span className={user.is_active ? 'text-green-600' : 'text-slate-500'}>
                          {user.is_active ? 'Active' : 'Deactivated'}
                        </span>
                      </div>

                      {/* Edit Button */}
                      <button
                        onClick={() => onEdit(user)}
                        className="w-full mt-2 py-2 px-4 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors text-sm"
                      >
                        Edit Profile
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// StorageImage Component
// Tries the stored URL first; on 403/error generates a signed URL via the
// authenticated Supabase session so it works regardless of bucket visibility.
// ============================================================================

function StorageImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [src, setSrc] = useState(url);
  const [gone, setGone] = useState(false);

  const handleError = async () => {
    // Extract the path inside the bucket from the public URL
    // e.g. https://xxx.supabase.co/storage/v1/object/public/check-photos/reg-photos/abc.jpg
    //      → reg-photos/abc.jpg
    const match = src.match(/\/storage\/v1\/object\/(?:public|sign)\/check-photos\/(.+?)(?:\?|$)/);
    if (!match) { setGone(true); return; }

    try {
      const { data } = await supabase.storage
        .from('check-photos')
        .createSignedUrl(match[1], 3600);
      if (data?.signedUrl) {
        setSrc(data.signedUrl);
      } else {
        setGone(true);
      }
    } catch {
      setGone(true);
    }
  };

  if (gone) return null;
  return <img src={src} alt={alt} className={className} onError={handleError} />;
}

// ============================================================================
// JobsView Component — Tier 2 (Manage) feature
// ============================================================================

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  pending:   'Pending',
  active:    'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const JOB_STATUS_COLOR: Record<JobStatus, string> = {
  pending:   'bg-slate-100 text-slate-700',
  active:    'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

interface JobsViewProps {
  org: Organisation;
  onCreateJob: () => void;
  onEditJob: (job: Job) => void;
}

type JobWithMaterial = Job & { material_types: { name: string; code: string } | null };

function JobsView({ org, onCreateJob, onEditJob }: JobsViewProps) {
  const [jobs, setJobs] = useState<JobWithMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');

  useEffect(() => {
    loadJobs();
  }, [org.id]);

  const loadJobs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('jobs')
      .select('*, material_types(name, code)')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false });
    setJobs((data ?? []) as JobWithMaterial[]);
    setLoading(false);
  };

  if (!canAccessTier(org, 2)) {
    return (
      <UpgradePromptInline
        tierName="Manage"
        features={['Create and assign haulage jobs', 'Track job status and load progress', 'Multi-vehicle assignments', 'WTN (Waste Transfer Notes) with signatures']}
      />
    );
  }

  const filtered = statusFilter === 'all' ? jobs : jobs.filter((j) => j.status === statusFilter);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
          <p className="text-sm text-slate-500 mt-0.5">{jobs.length} total</p>
        </div>
        <button
          onClick={onCreateJob}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          New Job
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'pending', 'active', 'completed', 'cancelled'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-orange-500 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s === 'all' ? 'All' : JOB_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {statusFilter === 'all' ? 'No jobs yet' : `No ${JOB_STATUS_LABEL[statusFilter].toLowerCase()} jobs`}
          </p>
          {statusFilter === 'all' && (
            <button
              onClick={onCreateJob}
              className="mt-4 px-4 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 text-sm"
            >
              Create first job
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((job) => (
            <button
              key={job.id}
              onClick={() => onEditJob(job)}
              className="w-full bg-white rounded-xl border border-slate-200 p-4 hover:border-orange-300 hover:shadow-sm transition-all text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-500">{job.reference}</span>
                    <span className="font-mono text-xs font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">
                      {job.job_code}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${JOB_STATUS_COLOR[job.status]}`}>
                      {JOB_STATUS_LABEL[job.status]}
                    </span>
                    {job.direction && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${job.direction === 'import' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                        {job.direction === 'import' ? 'IN' : 'OUT'}
                      </span>
                    )}
                    {job.material_types && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {job.material_types.code}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-slate-900 truncate">{job.title}</p>
                  {(job.collection_address || job.disposal_address) && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {job.collection_address && <span>{job.collection_address.split(',')[0]}</span>}
                      {job.collection_address && job.disposal_address && <span className="mx-1 text-slate-300">→</span>}
                      {job.disposal_address && <span>{job.disposal_address.split(',')[0]}</span>}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-slate-400 shrink-0 space-y-0.5">
                  <p className="font-semibold text-slate-700">{job.total_loads} load{job.total_loads !== 1 ? 's' : ''}</p>
                  {job.rate_per_load && <p>£{Number(job.rate_per_load).toFixed(2)}/load</p>}
                  {job.start_date && <p>{new Date(job.start_date).toLocaleDateString('en-GB')}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Inline upgrade prompt (lighter than UpgradePrompt component — no org/Stripe context needed here)
function UpgradePromptInline({ tierName, features }: { tierName: string; features: string[] }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-orange-100 rounded-full mb-4">
          <Lock className="w-7 h-7 text-orange-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">{tierName} plan required</h2>
        <p className="text-slate-500 text-sm mb-6">Upgrade your plan to unlock this feature.</p>
        <div className="bg-slate-50 rounded-lg p-4 text-left">
          <p className="text-xs font-bold text-slate-400 uppercase mb-3">What you'll get</p>
          <ul className="space-y-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                <ChevronRight className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-400 mt-6">Contact us to upgrade your plan.</p>
      </div>
    </div>
  );
}

// ============================================================================
// HistoryView Component
// ============================================================================

interface HistoryViewProps {
  orgId: string;
  vehicles: Vehicle[];
}

function HistoryView({ orgId, vehicles }: HistoryViewProps) {
  const [checks, setChecks] = useState<CheckRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('7');
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [checkDefects, setCheckDefects] = useState<Record<string, Defect[]>>({});
  const [loadingDefects, setLoadingDefects] = useState<Record<string, boolean>>({});

  // Load checks on mount and when filters change
  useEffect(() => {
    loadChecks();
  }, [orgId, dateFilter]);

  const loadChecks = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('check_runs')
        .select('*')
        .eq('org_id', orgId)
        .order('completed_at', { ascending: false });

      // Apply date filter
      if (dateFilter !== 'all') {
        const daysAgo = parseInt(dateFilter);
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - daysAgo);
        query = query.gte('check_date', fromDate.toISOString().split('T')[0]);
      }

      const { data, error } = await query;

      if (error) throw error;
      setChecks(data || []);
    } catch (err) {
      console.error('Failed to load check history:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter checks
  const filteredChecks = checks.filter((check) => {
    // Vehicle filter
    if (vehicleFilter !== 'all' && check.vehicle_id !== vehicleFilter) {
      return false;
    }

    // Driver filter
    if (driverFilter !== 'all' && check.user_id !== driverFilter) {
      return false;
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const matchesReg = check.vehicle_registration?.toLowerCase().includes(searchLower);
      const matchesDriver = check.driver_name?.toLowerCase().includes(searchLower);
      if (!matchesReg && !matchesDriver) {
        return false;
      }
    }

    return true;
  });

  const toggleExpand = (checkId: string) => {
    const isOpening = expandedCheckId !== checkId;
    setExpandedCheckId(isOpening ? checkId : null);
    if (isOpening && !checkDefects[checkId]) {
      setLoadingDefects((prev) => ({ ...prev, [checkId]: true }));
      supabase
        .from('defects')
        .select('*')
        .eq('check_run_id', checkId)
        .order('created_at', { ascending: true })
        .then(({ data }) => {
          setCheckDefects((prev) => ({ ...prev, [checkId]: data || [] }));
          setLoadingDefects((prev) => ({ ...prev, [checkId]: false }));
        });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass':
        return 'bg-green-100 text-green-700';
      case 'defects':
        return 'bg-amber-100 text-amber-700';
      case 'do_not_drive':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pass':
        return 'Pass';
      case 'defects':
        return 'Defects';
      case 'do_not_drive':
        return 'Do Not Drive';
      default:
        return status;
    }
  };

  const formatDuration = (startedAt: string, completedAt: string) => {
    const start = new Date(startedAt);
    const end = new Date(completedAt);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    return `${diffMins}m ${diffSecs}s`;
  };

  // Get unique drivers from checks
  const driversInChecks = Array.from(
    new Map(
      checks
        .filter((c) => c.user_id && c.driver_name)
        .map((c) => [c.user_id, { id: c.user_id, name: c.driver_name }])
    ).values()
  );

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl md:text-2xl font-heading text-slate-900">Check History</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search registration or driver..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none bg-white text-sm"
            />
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none bg-white text-sm"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>

          {/* Vehicle Filter */}
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none bg-white text-sm"
          >
            <option value="all">All Vehicles</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.registration}
              </option>
            ))}
          </select>

          {/* Driver Filter */}
          <select
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none bg-white text-sm"
          >
            <option value="all">All Drivers</option>
            {driversInChecks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : filteredChecks.length === 0 ? (
        <div className="bg-white rounded-lg p-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">
            {search || vehicleFilter !== 'all' || driverFilter !== 'all'
              ? 'No checks match your filters'
              : 'No checks recorded yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary */}
          <div className="text-sm text-slate-500 mb-2">
            Showing {filteredChecks.length} check{filteredChecks.length !== 1 ? 's' : ''}
          </div>

          {filteredChecks.map((check) => {
            const isExpanded = expandedCheckId === check.id;

            return (
              <div
                key={check.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden"
              >
                {/* Check Header - Always visible */}
                <button
                  onClick={() => toggleExpand(check.id)}
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
                >
                  {/* Status indicator */}
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      check.overall_status === 'pass'
                        ? 'bg-green-100'
                        : check.overall_status === 'defects'
                        ? 'bg-amber-100'
                        : 'bg-red-100'
                    }`}
                  >
                    {check.overall_status === 'pass' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : check.overall_status === 'defects' ? (
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-slate-900">
                        {check.vehicle_registration}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs font-bold rounded ${getStatusColor(
                          check.overall_status
                        )}`}
                      >
                        {getStatusLabel(check.overall_status)}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {check.driver_name} •{' '}
                      {new Date(check.check_date).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>

                  {/* Time */}
                  <div className="text-right flex-shrink-0 hidden sm:block">
                    <div className="text-sm font-medium text-slate-900">
                      {new Date(check.completed_at).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatDuration(check.started_at, check.completed_at)}
                    </div>
                  </div>

                  {/* Expand indicator */}
                  <ChevronRight
                    className={`w-5 h-5 text-slate-400 transition-transform flex-shrink-0 ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    <div className="p-4 space-y-5">
                      {/* Core info grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">Vehicle</div>
                          <div className="font-mono font-bold text-slate-900">{check.vehicle_registration}</div>
                          <div className="text-xs text-slate-400 capitalize">{check.vehicle_type?.replace(/_/g, ' ')}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">Driver</div>
                          <div className="font-medium text-slate-900">{check.driver_name}</div>
                          <div className="text-xs text-slate-400">{check.driver_email}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">Duration</div>
                          <div className="font-medium text-slate-900">{formatDuration(check.started_at, check.completed_at)}</div>
                          <div className="text-xs text-slate-400">
                            {new Date(check.started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            {' – '}
                            {new Date(check.completed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        {check.gps_start && (
                          <div className="col-span-2 sm:col-span-3">
                            <div className="text-xs text-slate-500 mb-0.5">Location</div>
                            <div className="text-slate-700 text-sm">
                              {check.location_address || `${check.gps_start.lat.toFixed(4)}, ${check.gps_start.lng.toFixed(4)}`}
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs text-slate-500 mb-0.5">Template</div>
                          <div className="text-slate-700 text-sm">{check.template_name || 'Standard Check'} v{check.template_version}</div>
                        </div>
                      </div>

                      {/* Reg photo */}
                      {check.reg_photo_url && (
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-2">Registration Plate Photo</div>
                          <StorageImage
                            url={check.reg_photo_url}
                            alt="Registration plate"
                            className="w-full max-w-xs rounded-lg border border-slate-200"
                          />
                        </div>
                      )}

                      {/* Confirmations */}
                      <div>
                        <div className="text-xs font-bold text-slate-500 uppercase mb-2">Declarations</div>
                        <div className="flex gap-4 text-sm">
                          <div className="flex items-center gap-1.5">
                            {check.vehicle_fit_confirmed
                              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                              : <XCircle className="w-4 h-4 text-red-500" />}
                            <span className="text-slate-600">Vehicle Fit</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {check.driver_fit_confirmed
                              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                              : <XCircle className="w-4 h-4 text-red-500" />}
                            <span className="text-slate-600">Driver Fit</span>
                          </div>
                        </div>
                      </div>

                      {/* Notes */}
                      {(check.defect_repair_notes || check.head_office_notes) && (
                        <div className="space-y-2">
                          <div className="text-xs font-bold text-slate-500 uppercase">Notes</div>
                          {check.defect_repair_notes && (
                            <div className="text-sm">
                              <div className="text-xs text-slate-500 mb-1">Repair Notes</div>
                              <p className="text-slate-700 bg-slate-50 p-2 rounded">{check.defect_repair_notes}</p>
                            </div>
                          )}
                          {check.head_office_notes && (
                            <div className="text-sm">
                              <div className="text-xs text-slate-500 mb-1">Head Office Notes</div>
                              <p className="text-slate-700 bg-slate-50 p-2 rounded">{check.head_office_notes}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Check items with defect detail */}
                      {check.results && check.results.length > 0 && (() => {
                        const failedResults = check.results.filter((r: { status: string }) => r.status === 'fail');
                        if (failedResults.length === 0) return null;
                        return (
                          <div>
                            <div className="text-xs font-bold text-slate-500 uppercase mb-2">
                              Defects at Time of Check ({failedResults.length})
                            </div>
                            <div className="space-y-2">
                              {failedResults.map((r: { item_id: string; note?: string | null; photo_urls?: string[] }) => (
                                <div key={r.item_id} className="border-l-2 border-red-400 pl-3 py-1">
                                  <div className="text-sm font-medium text-slate-900">{r.item_id.replace(/_/g, ' ')}</div>
                                  {r.note && <p className="text-xs text-slate-500 mt-0.5">{r.note}</p>}
                                  {r.photo_urls && r.photo_urls.length > 0 && (
                                    <div className="flex gap-2 mt-1 flex-wrap">
                                      {r.photo_urls.map((url: string, i: number) => (
                                        <StorageImage key={i} url={url} alt={`Defect photo ${i + 1}`} className="w-16 h-16 object-cover rounded border border-slate-200" />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Defect workflow history */}
                      {loadingDefects[check.id] ? (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading defect history...
                        </div>
                      ) : checkDefects[check.id] && checkDefects[check.id].length > 0 ? (
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-2">Defect Workflow History</div>
                          <div className="space-y-3">
                            {checkDefects[check.id].map((defect) => (
                              <div key={defect.id} className="bg-slate-50 rounded-lg p-3 text-sm">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div>
                                    <span className="font-medium text-slate-900">{defect.item_label}</span>
                                    <span className="text-xs text-slate-500 ml-2">{defect.category}</span>
                                  </div>
                                  <div className="flex gap-1.5 flex-shrink-0">
                                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${getSeverityColor(defect.severity)}`}>
                                      {defect.severity}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                                      defect.status === 'resolved'
                                        ? 'bg-green-100 text-green-700'
                                        : defect.status === 'assigned'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-amber-100 text-amber-700'
                                    }`}>
                                      {getDefectStatusLabel(defect.status)}
                                    </span>
                                  </div>
                                </div>
                                {defect.driver_notes && (
                                  <p className="text-xs text-slate-500 mb-1">Driver: {defect.driver_notes}</p>
                                )}
                                {defect.photo_urls && defect.photo_urls.length > 0 && (
                                  <div className="flex gap-2 mb-1 flex-wrap">
                                    {defect.photo_urls.map((url, i) => (
                                      <StorageImage key={i} url={url} alt={`Defect ${i + 1}`} className="w-14 h-14 object-cover rounded border border-slate-200" />
                                    ))}
                                  </div>
                                )}
                                {defect.status === 'resolved' && defect.resolved_at && (
                                  <div className="mt-2 pt-2 border-t border-slate-200">
                                    <div className="text-xs font-medium text-green-700 mb-0.5">
                                      Resolved {new Date(defect.resolved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                      {defect.resolved_by && ` by ${defect.resolved_by}`}
                                    </div>
                                    {defect.resolution_notes && (
                                      <p className="text-xs text-slate-600">{defect.resolution_notes}</p>
                                    )}
                                  </div>
                                )}
                                {defect.assigned_to && defect.status !== 'resolved' && (
                                  <div className="text-xs text-blue-600 mt-1">Assigned to {defect.assigned_to}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : checkDefects[check.id] && check.overall_status !== 'pass' ? (
                        <div className="text-xs text-slate-400">No defect records found for this check.</div>
                      ) : null}

                      {/* Results summary */}
                      {check.results && check.results.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-slate-500 uppercase mb-2">Results Summary</div>
                          <div className="flex gap-4 text-sm">
                            <span className="text-green-600 font-medium">
                              {check.results.filter((r: { status: string }) => r.status === 'pass').length} Pass
                            </span>
                            <span className="text-red-600 font-medium">
                              {check.results.filter((r: { status: string }) => r.status === 'fail').length} Fail
                            </span>
                            <span className="text-slate-400">
                              {check.results.filter((r: { status: string }) => r.status === 'na').length} N/A
                            </span>
                          </div>
                          {/* Per-item detail */}
                          {check.results
                            .filter((r: { status: string }) => r.status !== 'fail')
                            .slice(0, 5).length > 0 && (
                            <details className="mt-2">
                              <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                                Show all {check.results.length} items
                              </summary>
                              <div className="mt-2 space-y-1">
                                {check.results.map((r: { item_id: string; status: string; fuel_level?: string }) => (
                                  <div key={r.item_id} className="flex items-center justify-between text-xs py-0.5">
                                    <span className="text-slate-600">{r.item_id.replace(/_/g, ' ')}</span>
                                    <span className={`font-medium ${
                                      r.status === 'pass' ? 'text-green-600' :
                                      r.status === 'fail' ? 'text-red-600' : 'text-slate-400'
                                    }`}>
                                      {r.status === 'pass'
                                        ? (r.fuel_level ? FUEL_LEVELS.find(f => f.value === r.fuel_level)?.label : 'OK')
                                        : r.status === 'fail' ? 'DEFECT' : 'N/A'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DefectsView Component
// ============================================================================

interface DefectsViewProps {
  defects: Defect[];
  onRefresh: () => void;
}

function DefectsView({ defects, onRefresh }: DefectsViewProps) {
  const handleResolve = async (defect: Defect) => {
    const notes = prompt('Resolution notes:');
    if (notes === null) return;

    await supabase
      .from('defects')
      .update({
        status: 'resolved',
        resolution_notes: notes,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', defect.id);

    onRefresh();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-heading text-slate-900 mb-6">Open Defects</h1>

      {defects.length === 0 ? (
        <div className="bg-white rounded-lg p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-slate-600">No open defects</p>
        </div>
      ) : (
        <div className="space-y-4">
          {defects.map((defect) => (
            <div
              key={defect.id}
              className="bg-white rounded-lg shadow-sm p-4 border-l-4"
              style={{
                borderLeftColor:
                  defect.severity === 'critical'
                    ? '#ef4444'
                    : defect.severity === 'major'
                    ? '#f59e0b'
                    : '#3b82f6',
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 text-xs font-bold rounded ${getSeverityColor(
                        defect.severity
                      )}`}
                    >
                      {defect.severity.toUpperCase()}
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {defect.vehicle_registration}
                    </span>
                  </div>
                  <div className="text-slate-900 font-medium">{defect.item_label}</div>
                  <div className="text-sm text-slate-500">{defect.category}</div>
                  {defect.driver_notes && (
                    <div className="text-sm text-slate-600 mt-2 p-2 bg-slate-50 rounded">
                      "{defect.driver_notes}"
                    </div>
                  )}
                  <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                    {defect.mot_record_id ? (
                      <>
                        <ClipboardCheck className="w-3 h-3" />
                        MOT Issue — recorded by {defect.reported_by_name}
                      </>
                    ) : defect.pmi_record_id ? (
                      <>
                        <Wrench className="w-3 h-3" />
                        PMI Issue — recorded by {defect.reported_by_name}
                      </>
                    ) : (
                      <>Reported by {defect.reported_by_name}</>
                    )}
                    {' • '}{new Date(defect.reported_at).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => handleResolve(defect)}
                  className="px-3 py-1 bg-green-500 text-white text-sm font-bold rounded hover:bg-green-600"
                >
                  Resolve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SettingsView Component
// ============================================================================

interface SettingsViewProps {
  org: Organisation;
  activeVehicleCount: number;
  onOrgReload: () => Promise<void>;
}

function SettingsView({ org, activeVehicleCount, onOrgReload }: SettingsViewProps) {
  const [billingLoading, setBillingLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [reactivateLoading, setReactivateLoading] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Calculate billing - all vehicles are billed at £36.40/year
  const PRICE_PER_VEHICLE_YEARLY = 36.40;
  const billableVehicles = activeVehicleCount;
  const yearlyTotal = billableVehicles * PRICE_PER_VEHICLE_YEARLY;
  const yearlyTotalWithVat = yearlyTotal * 1.20;

  const periodEndDate = org.current_period_end
    ? new Date(org.current_period_end).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const handleSetupBilling = async () => {
    setBillingLoading(true);
    try {
      const { createCheckoutSession } = await import('@/services/stripeClient');
      const url = await createCheckoutSession(org.id);
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error('Failed to create checkout session:', err);
    } finally {
      setBillingLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setBillingLoading(true);
    try {
      const { createPortalSession } = await import('@/services/stripeClient');
      const url = await createPortalSession(org.id);
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error('Failed to create portal session:', err);
    } finally {
      setBillingLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordLoading(true);

    try {
      // First verify current password by signing in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No user found');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setPasswordError('Current password is incorrect');
        return;
      }

      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      // Clear form and show success
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password';
      setPasswordError(message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      // Immediately cancel any active or trialing subscription so they aren't charged after leaving
      if (org.subscription_id) {
        const { cancelSubscriptionImmediately } = await import('@/services/stripeClient');
        await cancelSubscriptionImmediately(org.id);
      }

      // Deactivate all users in the organisation
      const { error: usersError } = await supabase
        .from('users')
        .update({ is_active: false, deactivated_at: new Date().toISOString() })
        .eq('org_id', org.id);

      if (usersError) throw usersError;

      // Mark organisation as deleted (soft delete)
      const { error: orgError } = await supabase
        .from('organisations')
        .update({
          subscription_status: 'canceled',
          name: `[DELETED] ${org.name}`,
        })
        .eq('id', org.id);

      if (orgError) throw orgError;

      // Sign out the user
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete account';
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCancelLoading(true);
    setCancelError(null);
    try {
      const { cancelSubscription } = await import('@/services/stripeClient');
      const result = await cancelSubscription(org.id);
      if (result?.success) {
        setShowCancelModal(false);
        await onOrgReload();
      } else {
        setCancelError('Cancellation failed. Please try using the Manage Billing button to cancel via the Stripe portal instead.');
      }
    } catch (err) {
      console.error('Failed to cancel subscription:', err);
      setCancelError('Something went wrong. Please use the Manage Billing button to cancel via the Stripe portal.');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleReactivateSubscription = async () => {
    setReactivateLoading(true);
    try {
      const { reactivateSubscription } = await import('@/services/stripeClient');
      const result = await reactivateSubscription(org.id);
      if (result?.success) {
        await onOrgReload();
      }
    } catch (err) {
      console.error('Failed to reactivate subscription:', err);
    } finally {
      setReactivateLoading(false);
    }
  };

  const getStatusBadge = () => {
    // If no vehicles, show as no vehicles yet
    if (billableVehicles === 0) {
      return <span className="px-2 py-1 text-xs font-bold rounded bg-slate-100 text-slate-700">No Vehicles</span>;
    }

    // Check if subscription is set to cancel at period end
    if (org.cancel_at_period_end && org.subscription_status === 'active') {
      return <span className="px-2 py-1 text-xs font-bold rounded bg-amber-100 text-amber-700">Cancelling</span>;
    }

    switch (org.subscription_status) {
      case 'active':
        return <span className="px-2 py-1 text-xs font-bold rounded bg-green-100 text-green-700">Active</span>;
      case 'past_due':
        return <span className="px-2 py-1 text-xs font-bold rounded bg-red-100 text-red-700">Past Due</span>;
      case 'canceled':
        return <span className="px-2 py-1 text-xs font-bold rounded bg-slate-100 text-slate-700">Cancelled</span>;
      default:
        return <span className="px-2 py-1 text-xs font-bold rounded bg-amber-100 text-amber-700">Payment Required</span>;
    }
  };

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl md:text-2xl font-heading text-slate-900 mb-6">Settings</h1>

      <div className="max-w-2xl space-y-6">
        {/* Cancellation Warning Banner */}
        {org.cancel_at_period_end && org.subscription_status === 'active' && periodEndDate && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-amber-800">Your subscription will end on {periodEndDate}</h3>
                <p className="text-sm text-amber-700 mt-1">
                  After this date, all users in your organisation will lose access to CheckaTruck.
                </p>
                <button
                  onClick={handleReactivateSubscription}
                  disabled={reactivateLoading}
                  className="mt-3 px-4 py-2 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                >
                  {reactivateLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  Keep My Subscription
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Organisation Info */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Organisation</h2>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase">Name</div>
              <div className="text-slate-900">{org.name}</div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase">Contact Email</div>
              <div className="text-slate-900">{org.contact_email || '-'}</div>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Change Password</h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{passwordError}</p>
              </div>
            )}
            {passwordSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <p className="text-sm text-green-600">Password changed successfully</p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Current Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="Min 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={passwordLoading}
              className="w-full py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {passwordLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Change Password'
              )}
            </button>
          </form>
        </div>

        {/* Billing Section */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Billing</h2>
            {getStatusBadge()}
          </div>

          {/* Pricing Info */}
          <div className="bg-slate-50 rounded-lg p-4 mb-4">
            <div className="text-sm text-slate-600">
              <span className="font-bold text-slate-900">£36.40</span> per vehicle per year
            </div>
          </div>

          {/* Current Usage */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Active Vehicles</span>
              <span className="font-bold text-slate-900">{activeVehicleCount}</span>
            </div>
            {billableVehicles > 0 && (
              <>
                <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                  <span className="text-sm text-slate-600">Yearly Total (ex. VAT)</span>
                  <span className="font-bold text-slate-900">£{yearlyTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-sm">Yearly Total (inc. VAT)</span>
                  <span className="text-sm">£{yearlyTotalWithVat.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>

          {/* Action Button */}
          {org.subscription_id ? (
            <button
              onClick={handleManageBilling}
              disabled={billingLoading}
              className="w-full py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {billingLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Manage Billing'
              )}
            </button>
          ) : billableVehicles > 0 ? (
            <button
              onClick={handleSetupBilling}
              disabled={billingLoading}
              className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {billingLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Set Up Billing'
              )}
            </button>
          ) : (
            <div className="text-center text-sm text-slate-500 py-3 bg-slate-50 rounded-lg">
              No payment required - you're on the free plan
            </div>
          )}

          {/* Cancel subscription link */}
          {org.subscription_id && org.subscription_status === 'active' && !org.cancel_at_period_end && (
            <div className="mt-4 text-center">
              <button
                onClick={() => { setCancelError(null); setShowCancelModal(true); }}
                className="text-sm text-red-600 hover:text-red-700 hover:underline"
              >
                Cancel subscription
              </button>
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-red-200">
          <h2 className="text-lg font-bold text-red-600 mb-4">Danger Zone</h2>
          <p className="text-sm text-slate-600 mb-4">
            Permanently delete your organisation and all associated data. This action cannot be undone.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors"
          >
            Delete Organisation
          </button>
        </div>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-red-600 mb-4">Delete Organisation?</h2>
            <div className="space-y-3 mb-6">
              <p className="text-slate-600">
                This will permanently delete <span className="font-bold">{org.name}</span> and all associated data:
              </p>
              <ul className="list-disc list-inside text-slate-600 space-y-1">
                <li>All user accounts will be deactivated</li>
                <li>All vehicle check history will be deleted</li>
                <li>Your subscription will be cancelled immediately</li>
              </ul>
              <p className="text-sm text-red-600 font-bold">
                This action cannot be undone.
              </p>
              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{deleteError}</p>
                </div>
              )}
              <div className="pt-2">
                <label className="text-sm text-slate-600 block mb-2">
                  Type <span className="font-mono font-bold bg-slate-100 px-1">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                  placeholder="DELETE"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                  setDeleteError(null);
                }}
                disabled={deleteLoading}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading || deleteConfirmText !== 'DELETE'}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {deleteLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Delete Forever'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Subscription Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Cancel Subscription?</h2>
            <div className="space-y-3 mb-6">
              <p className="text-slate-600">
                Your subscription will remain active until <span className="font-bold">{periodEndDate || 'the end of your billing period'}</span>.
              </p>
              <p className="text-slate-600">
                After that date:
              </p>
              <ul className="list-disc list-inside text-slate-600 space-y-1">
                <li>All users in your organisation will lose access</li>
                <li>Drivers won't be able to submit vehicle checks</li>
                <li>Your data will be retained for 30 days</li>
              </ul>
              <p className="text-sm text-slate-500">
                You can reactivate your subscription at any time before it ends.
              </p>
            </div>
            {cancelError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {cancelError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelModal(false); setCancelError(null); }}
                disabled={cancelLoading}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelLoading}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {cancelLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Cancel Subscription'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
