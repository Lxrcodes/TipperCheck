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
} from 'lucide-react';
import type {
  AuthUser,
  Organisation,
  Vehicle,
  User,
  CheckRun,
  Defect,
  VehicleStatus,
} from '@/types';
import {
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  getVehicleStatusColor,
  getVehicleStatusLabel,
  getSeverityColor,
  isDriver,
} from '@/types';
import { VehicleModal } from './VehicleModal';
import { UserModal } from './UserModal';

type DashboardTab = 'today' | 'vehicles' | 'team' | 'defects' | 'settings';

interface DashboardProps {
  user: AuthUser;
  org: Organisation;
  onLogout: () => void;
  onSwitchToDriver: () => void;
}

export function Dashboard({ user, org, onLogout, onSwitchToDriver }: DashboardProps) {
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
              <div className="text-xs text-slate-400 truncate">{user.name}</div>
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
            {activeTab === 'settings' && <SettingsView org={org} />}
          </>
        )}
      </main>

      {/* Modals */}
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
}

function NavItem({ icon: Icon, label, active, onClick, badge, badgeColor = 'orange' }: NavItemProps) {
  const badgeColors = {
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        active
          ? 'bg-orange-500 text-white'
          : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && (
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
}

function TodayView({ vehicles, checks, defects }: TodayViewProps) {
  const activeVehicles = vehicles.filter((v) => v.status === 'active');
  const checkedVehicleIds = new Set(checks.map((c) => c.vehicle_id));

  const getVehicleCheck = (vehicleId: string) => {
    return checks.find((c) => c.vehicle_id === vehicleId);
  };

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

interface VehiclesViewProps {
  vehicles: Vehicle[];
  onAdd: () => void;
  onEdit: (vehicle: Vehicle) => void;
}

function VehiclesView({ vehicles, onAdd, onEdit }: VehiclesViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | 'all'>('all');
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);

  const filtered = vehicles.filter((v) => {
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

      {/* Search and Filter */}
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
                        <span className={`${
                          vehicle.mot_due_date && new Date(vehicle.mot_due_date) < new Date()
                            ? 'text-red-600 font-medium'
                            : 'text-slate-900'
                        }`}>
                          {vehicle.mot_due_date
                            ? new Date(vehicle.mot_due_date).toLocaleDateString()
                            : 'Not set'}
                        </span>
                      </div>

                      {/* Next PMI */}
                      {vehicle.next_pmi_due_date && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Next PMI</span>
                          <span className="text-slate-900">
                            {new Date(vehicle.next_pmi_due_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}

                      {/* Status Notes */}
                      {vehicle.status_notes && (
                        <div className="text-sm">
                          <span className="text-slate-500 block mb-1">Notes</span>
                          <p className="text-slate-700 bg-slate-50 p-2 rounded">
                            {vehicle.status_notes}
                          </p>
                        </div>
                      )}

                      {/* Edit Button */}
                      <button
                        onClick={() => onEdit(vehicle)}
                        className="w-full mt-2 py-2 px-4 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors text-sm"
                      >
                        Edit Vehicle
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
                  <div className="text-xs text-slate-400 mt-2">
                    Reported by {defect.reported_by_name} •{' '}
                    {new Date(defect.reported_at).toLocaleString()}
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
}

function SettingsView({ org }: SettingsViewProps) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-heading text-slate-900 mb-6">Settings</h1>

      <div className="max-w-2xl space-y-6">
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
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase">Subscription</div>
              <div className="text-slate-900 capitalize">{org.subscription_status}</div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase">Active Vehicles</div>
              <div className="text-slate-900">{org.active_vehicle_count}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Billing</h2>
          <p className="text-slate-600 text-sm mb-4">
            First vehicle free, then £3.50/vehicle/month for active vehicles.
          </p>
          <button className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800">
            Manage Billing
          </button>
        </div>
      </div>
    </div>
  );
}
