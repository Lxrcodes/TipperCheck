import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/services/supabaseClient';
import { ToastProvider, useToast } from '@/components/shared/Toast';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { Login } from '@/components/auth/Login';
import { AcceptInvite } from '@/components/auth/AcceptInvite';
import { Onboarding } from '@/components/onboarding/Onboarding';
import { Dashboard } from '@/components/manager/Dashboard';
import { CheckWizard } from '@/components/driver/CheckWizard';
import { useOffline } from '@/hooks/useOffline';
import { refreshTemplateCache, refreshVehicleCache } from '@/services/syncManager';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import type { AuthUser, Organisation, Vehicle, VehicleType, CheckStatus } from '@/types';
import { isManager, isDriver, VEHICLE_TYPES } from '@/types';
import { Loader2, AlertTriangle, Truck, CreditCard, RefreshCw, LogOut, XCircle, Plus, Trash2, ChevronRight } from 'lucide-react';
import { createCheckoutSession } from '@/services/stripeClient';

// ============================================================================
// App Component
// ============================================================================

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

type AppView = 'loading' | 'login' | 'onboarding' | 'payment_required' | 'subscription_expired' | 'manager' | 'driver';

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [org, setOrg] = useState<Organisation | null>(null);
  const [view, setView] = useState<AppView>('loading');
  const [preferredView, setPreferredView] = useState<'manager' | 'driver' | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const offline = useOffline();
  const toast = useToast();
  const location = useLocation();

  // Handle billing return URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingStatus = params.get('billing');

    if (billingStatus === 'success') {
      // Clear URL params and reload profile to check subscription status
      window.history.replaceState({}, '', window.location.pathname);
      toast.showSuccess('Payment successful! Welcome to CheckaTruck.');
    } else if (billingStatus === 'cancelled') {
      // Clear URL params and show error
      window.history.replaceState({}, '', window.location.pathname);
      setPaymentError('Payment was cancelled. Please complete payment to continue.');
    }
  }, []);

  // Check for existing session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user);
      } else {
        setView('login');
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user);
      } else {
        setAuthUser(null);
        setOrg(null);
        setView('login');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load user profile and org
  const loadUserProfile = async (supabaseUser: SupabaseUser) => {
    try {
      // Get user record
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', supabaseUser.id)
        .single();

      if (userError || !user) {
        // User authenticated but no user record - needs onboarding
        setView('onboarding');
        return;
      }

      // Check if user is active
      if (!user.is_active) {
        toast.showError('Your account has been deactivated. Please contact your manager.');
        await supabase.auth.signOut();
        return;
      }

      // Get organisation
      const { data: orgData, error: orgError } = await supabase
        .from('organisations')
        .select('*')
        .eq('id', user.org_id)
        .single();

      if (orgError || !orgData) {
        console.error('Failed to load org:', orgError);
        setView('onboarding');
        return;
      }

      // Check for canceled subscription - block all users
      // Also check if subscription period has ended (fallback if webhook didn't fire)
      const isSubscriptionExpired =
        orgData.subscription_status === 'canceled' ||
        (orgData.cancel_at_period_end &&
         orgData.current_period_end &&
         new Date(orgData.current_period_end) < new Date());

      if (isSubscriptionExpired) {
        setOrg(orgData);
        setAuthUser({
          id: user.id,
          auth_user_id: supabaseUser.id,
          org_id: user.org_id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          is_billing_admin: user.is_billing_admin,
          is_active: user.is_active,
        });
        setView('subscription_expired');
        return;
      }

      // Check for incomplete payment (has org but no active subscription)
      // Only check if user is billing admin (the one who needs to pay)
      if (user.is_billing_admin && !orgData.subscription_status) {
        // Check if there are any active vehicles (meaning they started onboarding)
        const { count: vehicleCount } = await supabase
          .from('vehicles')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', user.org_id)
          .eq('status', 'active');

        if (vehicleCount && vehicleCount > 0) {
          // Has vehicles but no subscription - needs to complete payment
          setOrg(orgData);
          setAuthUser({
            id: user.id,
            auth_user_id: supabaseUser.id,
            org_id: user.org_id,
            email: user.email,
            name: user.name,
            roles: user.roles,
            is_billing_admin: user.is_billing_admin,
            is_active: user.is_active,
          });
          setView('payment_required');
          return;
        }
      }

      // Set auth user
      const authUserData: AuthUser = {
        id: user.id,
        auth_user_id: supabaseUser.id,
        org_id: user.org_id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        is_billing_admin: user.is_billing_admin,
        is_active: user.is_active,
      };

      setAuthUser(authUserData);
      setOrg(orgData);

      // Cache data for offline use
      if (!offline.isOffline) {
        await Promise.all([
          refreshTemplateCache(),
          refreshVehicleCache(user.org_id),
        ]);
      }

      // Determine initial view based on roles
      // Owner-operators (both roles) default to driver view
      // Managers default to manager view
      // Drivers default to driver view
      if (preferredView) {
        setView(preferredView);
      } else if (isDriver(authUserData) && !isManager(authUserData)) {
        setView('driver');
      } else if (isManager(authUserData) && !isDriver(authUserData)) {
        setView('manager');
      } else {
        // Has both roles - default to driver (owner-operator flow)
        setView('driver');
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
      toast.showError('Failed to load profile');
      setView('login');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setAuthUser(null);
    setOrg(null);
    setPreferredView(null);
    setView('login');
  };

  const handleOnboardingComplete = () => {
    // Reload to get the new user data
    if (session?.user) {
      loadUserProfile(session.user);
    }
  };

  const handleSwitchToManager = () => {
    setPreferredView('manager');
    setView('manager');
  };

  const handleSwitchToDriver = () => {
    setPreferredView('driver');
    setView('driver');
  };

  const handleCheckComplete = (status: CheckStatus) => {
    if (status === 'pass') {
      toast.showSuccess('Check completed successfully');
    } else if (status === 'defects') {
      toast.showWarning('Check completed with defects');
    } else {
      toast.showError('Critical defects found - Do Not Drive');
    }
    offline.refreshPendingCount();
  };

  // Check for public routes (no auth required)
  const isInviteRoute = location.pathname.startsWith('/invite/');

  // Show configuration warning if Supabase not set up
  if (!isSupabaseConfigured()) {
    return <ConfigurationWarning />;
  }

  // Handle invite route (public, no auth required)
  if (isInviteRoute) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
      </Routes>
    );
  }

  // Loading state
  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // Login
  if (view === 'login' || !session) {
    return <Login onSuccess={() => {}} />;
  }

  // Onboarding
  if (view === 'onboarding') {
    return (
      <Onboarding
        email={session.user.email ?? ''}
        onComplete={handleOnboardingComplete}
        onBack={handleLogout}
      />
    );
  }

  // Payment Required
  if (view === 'payment_required' && org) {
    return (
      <PaymentRequired
        org={org}
        loading={paymentLoading}
        error={paymentError}
        verifying={verifyingPayment}
        onRetryPayment={async () => {
          setPaymentLoading(true);
          setPaymentError(null);
          try {
            const checkoutUrl = await createCheckoutSession(org.id);
            if (checkoutUrl) {
              window.location.href = checkoutUrl;
            } else {
              setPaymentError('Failed to create checkout session. Please try again.');
            }
          } catch (err) {
            setPaymentError('Failed to start payment. Please try again.');
          } finally {
            setPaymentLoading(false);
          }
        }}
        onVerifyPayment={async () => {
          setVerifyingPayment(true);
          setPaymentError(null);
          try {
            // Reload the profile to check subscription status
            if (session?.user) {
              await loadUserProfile(session.user);
            }
          } finally {
            setVerifyingPayment(false);
          }
        }}
        onLogout={handleLogout}
      />
    );
  }

  // Subscription Expired
  if (view === 'subscription_expired' && org && authUser) {
    return (
      <SubscriptionExpired
        org={org}
        loading={paymentLoading}
        onResubscribe={async () => {
          setPaymentLoading(true);
          try {
            const checkoutUrl = await createCheckoutSession(org.id);
            if (checkoutUrl) {
              window.location.href = checkoutUrl;
            }
          } finally {
            setPaymentLoading(false);
          }
        }}
        onLogout={handleLogout}
      />
    );
  }

  // Manager Dashboard
  if (view === 'manager' && authUser && org) {
    return (
      <Dashboard
        user={authUser}
        org={org}
        onLogout={handleLogout}
        onSwitchToDriver={handleSwitchToDriver}
        onOrgReload={async () => {
          const { data: orgData } = await supabase
            .from('organisations')
            .select('*')
            .eq('id', authUser.org_id)
            .single();
          if (orgData) {
            setOrg(orgData);
          }
        }}
      />
    );
  }

  // Driver App
  if (view === 'driver' && authUser && org) {
    const showBanner = offline.isOffline || offline.pendingCount > 0;

    return (
      <div className="min-h-screen bg-slate-100">
        <OfflineBanner
          isOffline={offline.isOffline}
          wasOffline={offline.wasOffline}
          pendingCount={offline.pendingCount}
          isSyncing={offline.isSyncing}
          onRetrySync={offline.triggerSync}
          onRetryFailed={offline.retryFailedSyncs}
        />

        {/* Wrapper with padding when banner is shown */}
        <div className={showBanner ? 'pt-10' : ''}>
          {/* Header for drivers with role switch */}
          {isManager(authUser) && (
            <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-orange-500" />
                <span className="font-bold">CheckaTruck</span>
              </div>
              <button
                onClick={handleSwitchToManager}
                className="text-sm text-slate-300 hover:text-white"
              >
                Switch to Dashboard
              </button>
            </div>
          )}

          <Routes>
            <Route
              path="/"
              element={
                <DriverHome
                  user={authUser}
                  org={org}
                  onCheckComplete={handleCheckComplete}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================================
// DriverHome Component
// ============================================================================

interface DriverHomeProps {
  user: AuthUser;
  org: Organisation;
  onCheckComplete: (status: CheckStatus) => void;
}

function DriverHome({ user, org, onCheckComplete }: DriverHomeProps) {
  return (
    <CheckWizard
      driverId={user.id}
      driverName={user.name}
      driverEmail={user.email}
      orgId={org.id}
      onComplete={onCheckComplete}
    />
  );
}

// ============================================================================
// Payment Required Component
// ============================================================================

interface PaymentRequiredProps {
  org: Organisation;
  loading: boolean;
  error: string | null;
  verifying: boolean;
  onRetryPayment: () => void;
  onVerifyPayment: () => void;
  onLogout: () => void;
}

function PaymentRequired({
  org,
  loading,
  error,
  verifying,
  onRetryPayment,
  onVerifyPayment,
  onLogout,
}: PaymentRequiredProps) {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-500/10 rounded-full mb-6">
          <CreditCard className="w-10 h-10 text-orange-500" />
        </div>
        <h1 className="text-2xl font-heading text-white mb-2">Complete Your Subscription</h1>
        <p className="text-slate-400 mb-2">
          Welcome back, <span className="text-white font-medium">{org.name}</span>
        </p>
        <p className="text-slate-400 mb-6">
          Please complete your payment to start using CheckaTruck.
        </p>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-6">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={onRetryPayment}
            disabled={loading || verifying}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                Complete Payment
              </>
            )}
          </button>

          <button
            onClick={onVerifyPayment}
            disabled={loading || verifying}
            className="w-full py-3 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {verifying ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Already Paid? Refresh Status
              </>
            )}
          </button>
        </div>

        <div className="mt-8">
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Subscription Expired Component
// ============================================================================

interface SubscriptionExpiredProps {
  org: Organisation;
  loading: boolean;
  onResubscribe: () => void;
  onLogout: () => void;
}

function SubscriptionExpired({
  org,
  loading,
  onResubscribe,
  onLogout,
}: SubscriptionExpiredProps) {
  const [step, setStep] = useState<'intro' | 'fleet'>('intro');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newRegistration, setNewRegistration] = useState('');
  const [newVehicleType, setNewVehicleType] = useState<VehicleType>('tipper');
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch vehicles on mount
  useEffect(() => {
    const loadVehicles = async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('*')
        .eq('org_id', org.id)
        .order('registration');
      setVehicles(data || []);
      setVehiclesLoading(false);
    };
    loadVehicles();
  }, [org.id]);

  const activeVehicles = vehicles.filter((v) => v.status === 'active');
  const weeklyPrice = (activeVehicles.length * 0.7).toFixed(2);
  const monthlyPrice = (activeVehicles.length * 0.7 * 4.33).toFixed(2);

  const handleAddVehicle = async () => {
    if (!newRegistration.trim()) return;
    setAddingVehicle(true);
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .insert({
          org_id: org.id,
          registration: newRegistration.trim().toUpperCase(),
          vehicle_type: newVehicleType,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;
      setVehicles([...vehicles, data]);
      setNewRegistration('');
      setShowAddVehicle(false);
    } catch (err) {
      console.error('Failed to add vehicle:', err);
    } finally {
      setAddingVehicle(false);
    }
  };

  const handleDeleteVehicle = async (vehicleId: string) => {
    setDeletingId(vehicleId);
    try {
      await supabase.from('vehicles').delete().eq('id', vehicleId);
      setVehicles(vehicles.filter((v) => v.id !== vehicleId));
    } catch (err) {
      console.error('Failed to delete vehicle:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Intro step
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-500/10 rounded-full mb-6">
            <XCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-heading text-white mb-2">Subscription Ended</h1>
          <p className="text-slate-400 mb-2">
            <span className="text-white font-medium">{org.name}</span>
          </p>
          <p className="text-slate-400 mb-6">
            Your subscription has ended and access to CheckaTruck has been suspended.
          </p>

          <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4">
              <p className="text-slate-300 text-sm mb-2">
                Resubscribe to restore access for your entire team
              </p>
              <div className="text-white">
                <span className="text-2xl font-bold">70p</span>
                <span className="text-slate-400 text-sm"> per vehicle per week</span>
              </div>
            </div>

            <button
              onClick={() => setStep('fleet')}
              className="w-full py-4 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 text-lg"
            >
              <Truck className="w-5 h-5" />
              Review Fleet & Resubscribe
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-8">
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fleet management step
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col p-4">
      <div className="w-full max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-heading text-white mb-2">Your Fleet</h1>
          <p className="text-slate-400">
            Review your vehicles before resubscribing
          </p>
        </div>

        {/* Vehicle List */}
        <div className="bg-slate-800 rounded-lg overflow-hidden mb-4">
          {vehiclesLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto" />
            </div>
          ) : vehicles.length === 0 ? (
            <div className="p-8 text-center">
              <Truck className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400">No vehicles yet</p>
              <p className="text-slate-500 text-sm">Add at least one vehicle to continue</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className={`flex items-center justify-between p-4 ${
                    vehicle.status !== 'active' ? 'opacity-50' : ''
                  }`}
                >
                  <div>
                    <div className="font-mono font-bold text-white">
                      {vehicle.registration}
                    </div>
                    <div className="text-sm text-slate-400">
                      {VEHICLE_TYPES.find((t) => t.value === vehicle.vehicle_type)?.label}
                      {vehicle.status !== 'active' && (
                        <span className="ml-2 text-amber-500">({vehicle.status.toUpperCase()})</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteVehicle(vehicle.id)}
                    disabled={deletingId === vehicle.id}
                    className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-50"
                  >
                    {deletingId === vehicle.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Vehicle Form */}
          {showAddVehicle ? (
            <div className="p-4 border-t border-slate-700 bg-slate-700/50">
              <div className="space-y-3">
                <input
                  type="text"
                  value={newRegistration}
                  onChange={(e) => setNewRegistration(e.target.value.toUpperCase())}
                  placeholder="Registration (e.g. AB12 CDE)"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white font-mono placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
                <select
                  value={newVehicleType}
                  onChange={(e) => setNewVehicleType(e.target.value as VehicleType)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                >
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddVehicle(false)}
                    className="flex-1 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddVehicle}
                    disabled={!newRegistration.trim() || addingVehicle}
                    className="flex-1 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {addingVehicle && <Loader2 className="w-4 h-4 animate-spin" />}
                    Add
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddVehicle(true)}
              className="w-full p-4 border-t border-slate-700 text-orange-500 hover:bg-slate-700/50 flex items-center justify-center gap-2 font-medium"
            >
              <Plus className="w-5 h-5" />
              Add Vehicle
            </button>
          )}
        </div>

        {/* Pricing Summary */}
        <div className="bg-slate-800 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-400">Active Vehicles</span>
            <span className="text-white font-bold">{activeVehicles.length}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-400">Weekly Cost</span>
            <span className="text-white font-bold">£{weeklyPrice}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-700">
            <span className="text-slate-400">Estimated Monthly</span>
            <span className="text-orange-500 font-bold text-lg">£{monthlyPrice}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={onResubscribe}
            disabled={loading || activeVehicles.length === 0}
            className="w-full py-4 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-lg"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                Continue to Payment
              </>
            )}
          </button>

          {activeVehicles.length === 0 && (
            <p className="text-amber-500 text-sm text-center">
              Add at least one active vehicle to continue
            </p>
          )}

          <button
            onClick={() => setStep('intro')}
            className="w-full py-3 text-slate-400 hover:text-white transition-colors"
          >
            Back
          </button>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Configuration Warning
// ============================================================================

function ConfigurationWarning() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500 rounded-2xl mb-4">
          <AlertTriangle className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-xl font-heading text-white mb-2">
          Configuration Required
        </h1>
        <p className="text-slate-400 mb-6">
          CheckaTruck needs to be configured with your Supabase credentials.
        </p>
        <div className="bg-slate-800 rounded-lg p-4 text-left">
          <p className="text-sm text-slate-300 mb-2">
            Create a <code className="text-orange-400">.env</code> file with:
          </p>
          <pre className="text-xs text-slate-400 overflow-x-auto">
{`VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
        </div>
      </div>
    </div>
  );
}
