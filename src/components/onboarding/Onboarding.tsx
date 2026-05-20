import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';
import { createCheckoutSession } from '@/services/stripeClient';
import {
  Truck,
  Users,
  User,
  ChevronRight,
  ChevronLeft,
  Building2,
  Loader2,
  Check,
  LogOut,
  CreditCard,
  RefreshCw,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import type { OnboardingType, VehicleType, CheckStatus } from '@/types';
import { VEHICLE_TYPES } from '@/types';
import { DemoCheckWizard } from '@/components/onboarding/DemoCheckWizard';

interface OnboardingProps {
  email: string;
  onComplete: () => void;
  onBack: () => void;
}

type OnboardingStep = 'type' | 'org' | 'vehicle' | 'first_check' | 'add_vehicles' | 'payment' | 'complete';

interface AdditionalVehicle {
  registration: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  motDueDate: string;
  nextPmiDueDate: string;
  pmiIntervalWeeks: number;
}

export function Onboarding({ email, onComplete, onBack }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>('type');
  const [type, setType] = useState<OnboardingType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  // Created IDs (after org/user/vehicle creation)
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);

  // Form data
  const [orgName, setOrgName] = useState('');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');

  // First vehicle
  const [vehicleReg, setVehicleReg] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('tipper');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleMotDue, setVehicleMotDue] = useState('');
  const [vehicleNextPmi, setVehicleNextPmi] = useState('');

  // Additional vehicles
  const [additionalVehicles, setAdditionalVehicles] = useState<AdditionalVehicle[]>([]);
  const [showAddVehicleForm, setShowAddVehicleForm] = useState(false);
  const [newVehicleReg, setNewVehicleReg] = useState('');
  const [newVehicleType, setNewVehicleType] = useState<VehicleType>('tipper');
  const [newVehicleMake, setNewVehicleMake] = useState('');
  const [newVehicleModel, setNewVehicleModel] = useState('');
  const [newVehicleMotDue, setNewVehicleMotDue] = useState('');
  const [newVehicleNextPmi, setNewVehicleNextPmi] = useState('');
  const [newVehiclePmiInterval, setNewVehiclePmiInterval] = useState(6);

  // Handle return from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingStatus = params.get('billing');
    const orgIdParam = params.get('org_id');

    if (billingStatus === 'success' && orgIdParam) {
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
      // Verify payment and complete onboarding
      verifyPaymentAndComplete(orgIdParam);
    } else if (billingStatus === 'cancelled') {
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
      setError('Payment was cancelled. Please try again to complete your subscription.');
      setStep('payment');
      // Try to get org ID from localStorage
      const storedOrgId = localStorage.getItem('pending_org_id');
      if (storedOrgId) {
        setCreatedOrgId(storedOrgId);
      }
    }
  }, []);

  // Verify payment status and complete onboarding
  const verifyPaymentAndComplete = async (orgId: string) => {
    setVerifyingPayment(true);
    setStep('payment');
    setError(null);

    try {
      // Poll for subscription status (webhook may have delay)
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        const { data: org, error: orgError } = await supabase
          .from('organisations')
          .select('subscription_status')
          .eq('id', orgId)
          .single();

        if (orgError) {
          throw new Error('Failed to verify subscription');
        }

        if (org?.subscription_status === 'active' || org?.subscription_status === 'trialing') {
          // Payment verified - clear stored org ID and complete
          localStorage.removeItem('pending_org_id');
          setStep('complete');
          setTimeout(() => {
            onComplete();
          }, 1500);
          return;
        }

        // Wait before next attempt
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      }

      // If we get here, webhook hasn't processed yet
      setError('Payment is being processed. Please wait a moment and try again.');
      setCreatedOrgId(orgId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify payment';
      setError(message);
      setCreatedOrgId(orgId);
    } finally {
      setVerifyingPayment(false);
    }
  };

  // Retry checkout for pending payment
  const retryCheckout = async () => {
    if (!createdOrgId) return;

    setLoading(true);
    setError(null);

    try {
      const checkoutUrl = await createCheckoutSession(createdOrgId);

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        setError('Failed to create checkout session. Please try again.');
      }
    } catch (err) {
      setError('Failed to start payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTypeSelect = (selectedType: OnboardingType) => {
    setType(selectedType);
    setStep('org');
  };

  const handleOrgSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !userName.trim()) return;
    setStep('vehicle');
  };

  // Create org, user, and first vehicle - then proceed to first check
  const handleVehicleSubmit = async () => {
    if (!type || !orgName.trim() || !userName.trim() || !vehicleReg.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Get current auth user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Generate IDs client-side
      const orgId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const vehicleId = crypto.randomUUID();

      // Both owner-operators and fleet managers get both roles
      const roles = ['manager', 'driver'];

      // Create organisation
      const { error: orgError } = await supabase
        .from('organisations')
        .insert({
          id: orgId,
          name: orgName.trim(),
          contact_email: email,
          contact_phone: userPhone || null,
          subscription_status: null,
        });

      if (orgError) throw orgError;

      // Create user record
      const { error: userError } = await supabase
        .from('users')
        .insert({
          id: userId,
          auth_user_id: authUser.id,
          org_id: orgId,
          email: email,
          name: userName.trim(),
          phone: userPhone || null,
          roles,
          is_billing_admin: true,
          invite_accepted_at: new Date().toISOString(),
        });

      if (userError) throw userError;

      // Create first vehicle
      const { error: vehicleError } = await supabase
        .from('vehicles')
        .insert({
          id: vehicleId,
          org_id: orgId,
          registration: vehicleReg.trim().toUpperCase(),
          vehicle_type: vehicleType,
          make: vehicleMake.trim() || null,
          model: vehicleModel.trim() || null,
          mot_due_date: vehicleMotDue || null,
          next_pmi_due_date: vehicleNextPmi || null,
          status: 'active',
          created_by: userId,
        });

      if (vehicleError) throw vehicleError;

      // Store created IDs
      setCreatedOrgId(orgId);
      setCreatedUserId(userId);

      // Store org ID for recovery
      localStorage.setItem('pending_org_id', orgId);

      // Proceed to first check
      setStep('first_check');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      setError(message);
      console.error('Onboarding error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle first check completion
  const handleFirstCheckComplete = (status: CheckStatus) => {
    console.log('First check completed with status:', status);
    setStep('add_vehicles');
  };

  // Add additional vehicle
  const handleAddVehicle = async () => {
    if (!newVehicleReg.trim() || !createdOrgId || !createdUserId) return;

    setLoading(true);
    setError(null);

    try {
      const vehicleId = crypto.randomUUID();

      const { error: vehicleError } = await supabase
        .from('vehicles')
        .insert({
          id: vehicleId,
          org_id: createdOrgId,
          registration: newVehicleReg.trim().toUpperCase(),
          vehicle_type: newVehicleType,
          make: newVehicleMake.trim() || null,
          model: newVehicleModel.trim() || null,
          mot_due_date: newVehicleMotDue || null,
          next_pmi_due_date: newVehicleNextPmi || null,
          status: 'active',
          created_by: createdUserId,
        });

      if (vehicleError) throw vehicleError;

      // Add to local list
      setAdditionalVehicles([
        ...additionalVehicles,
        {
          registration: newVehicleReg.trim().toUpperCase(),
          vehicleType: newVehicleType,
          make: newVehicleMake.trim(),
          model: newVehicleModel.trim(),
          motDueDate: newVehicleMotDue,
          nextPmiDueDate: newVehicleNextPmi,
          pmiIntervalWeeks: newVehiclePmiInterval,
        },
      ]);

      // Reset form
      setNewVehicleReg('');
      setNewVehicleType('tipper');
      setNewVehicleMake('');
      setNewVehicleModel('');
      setNewVehicleMotDue('');
      setNewVehicleNextPmi('');
      setNewVehiclePmiInterval(6);
      setShowAddVehicleForm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add vehicle';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Proceed to payment
  const handleProceedToPayment = async () => {
    if (!createdOrgId) return;

    setLoading(true);
    setError(null);

    try {
      const checkoutUrl = await createCheckoutSession(createdOrgId);

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        setError('Failed to create checkout session. Please try again.');
        setStep('payment');
      }
    } catch (err) {
      setError('Failed to start payment. Please try again.');
      setStep('payment');
    } finally {
      setLoading(false);
    }
  };

  // Calculate total vehicles and pricing with VAT
  const totalVehicles = 1 + additionalVehicles.length;
  const yearlySubtotal = totalVehicles * 36.40;
  const yearlyVat = yearlySubtotal * 0.20;
  const yearlyTotal = (yearlySubtotal + yearlyVat).toFixed(2);

  // ============================================================================
  // Step: Type Selection
  // ============================================================================
  if (step === 'type') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl mb-4">
              <Truck className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-heading text-white">Welcome to CheckaTruck</h1>
            <p className="text-slate-400 mt-2">Let's get your account set up</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => handleTypeSelect('owner_operator')}
              className="w-full p-6 bg-slate-800 border-2 border-slate-700 rounded-xl text-left hover:border-orange-500 transition-colors group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-orange-500/10 rounded-lg group-hover:bg-orange-500/20 transition-colors">
                  <User className="w-6 h-6 text-orange-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">One-Person Operation</h3>
                  <p className="text-slate-400 text-sm mt-1">
                    I'm the manager and the driver. Get me straight to checking vehicles.
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-orange-500" />
              </div>
            </button>

            <button
              onClick={() => handleTypeSelect('fleet')}
              className="w-full p-6 bg-slate-800 border-2 border-slate-700 rounded-xl text-left hover:border-orange-500 transition-colors group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                  <Users className="w-6 h-6 text-blue-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">Fleet with Drivers</h3>
                  <p className="text-slate-400 text-sm mt-1">
                    I manage a team. I'll invite my drivers separately.
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-orange-500" />
              </div>
            </button>
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={onBack}
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
  // Step: Organisation Details
  // ============================================================================
  if (step === 'org') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <button
            onClick={() => setStep('type')}
            className="flex items-center gap-1 text-slate-400 hover:text-white mb-6"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Building2 className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h1 className="text-xl font-heading text-white">
                {type === 'owner_operator' ? 'Your Details' : 'Organisation Details'}
              </h1>
              <p className="text-sm text-slate-400">
                {type === 'owner_operator'
                  ? 'Tell us about yourself'
                  : 'Tell us about your company'}
              </p>
            </div>
          </div>

          <form onSubmit={handleOrgSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase">
                {type === 'owner_operator' ? 'Business Name' : 'Company Name'}
              </label>
              <input
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                placeholder={type === 'owner_operator' ? "Dave's Tipper Services" : 'Smith Haulage Ltd'}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase">
                Your Name
              </label>
              <input
                type="text"
                required
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                placeholder="John Smith"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase">
                Phone Number <span className="text-slate-500">(optional)</span>
              </label>
              <input
                type="tel"
                value={userPhone}
                onChange={(e) => setUserPhone(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                placeholder="07700 900000"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
            >
              Continue
              <ChevronRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Step: First Vehicle
  // ============================================================================
  if (step === 'vehicle') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <button
            onClick={() => setStep('org')}
            className="flex items-center gap-1 text-slate-400 hover:text-white mb-6"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Truck className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h1 className="text-xl font-heading text-white">Add Your First Vehicle</h1>
              <p className="text-sm text-slate-400">
                You'll do a free trial check on this vehicle
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVehicleSubmit();
            }}
            className="space-y-4"
          >
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase">
                Registration
              </label>
              <input
                type="text"
                value={vehicleReg}
                onChange={(e) => setVehicleReg(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none uppercase text-center text-xl font-mono tracking-wider"
                placeholder="AB12 CDE"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase">
                Vehicle Type
              </label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              >
                {VEHICLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">
                  Make <span className="text-slate-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={vehicleMake}
                  onChange={(e) => setVehicleMake(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="DAF"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">
                  Model <span className="text-slate-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="CF 400"
                />
              </div>
            </div>

            {/* MOT & PMI — optional, can be set later */}
            <div className="border-t border-slate-700 pt-4">
              <p className="text-xs font-bold text-slate-400 uppercase mb-3">
                MOT & PMI <span className="text-slate-600 normal-case font-normal">(optional — can be set later)</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">MOT Due Date</label>
                  <input
                    type="date"
                    value={vehicleMotDue}
                    onChange={(e) => setVehicleMotDue(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Next PMI Due</label>
                  <input
                    type="date"
                    value={vehicleNextPmi}
                    onChange={(e) => setVehicleNextPmi(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <button
                type="submit"
                disabled={loading || !vehicleReg.trim()}
                className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Start Your First Check
                  </>
                )}
              </button>

              <p className="text-center text-slate-500 text-xs">
                Try out the check process before you pay
              </p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Step: First Vehicle Check (Demo - no database)
  // ============================================================================
  if (step === 'first_check') {
    return (
      <DemoCheckWizard
        vehicleReg={vehicleReg}
        vehicleType={vehicleType}
        driverName={userName}
        onComplete={handleFirstCheckComplete}
      />
    );
  }

  // ============================================================================
  // Step: Add More Vehicles
  // ============================================================================
  if (step === 'add_vehicles') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-full mb-4">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-heading text-white mb-2">Check Complete!</h1>
            <p className="text-slate-400">
              That's how easy it is. Now let's set up your subscription.
            </p>
          </div>

          {/* Current vehicles */}
          <div className="bg-slate-800 rounded-lg p-4 mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Your Vehicles</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <Truck className="w-5 h-5 text-orange-500" />
                  <span className="font-mono font-bold text-white">{vehicleReg.toUpperCase()}</span>
                </div>
                <span className="text-slate-400 text-sm">First vehicle</span>
              </div>
              {additionalVehicles.map((v, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-700">
                  <div className="flex items-center gap-3">
                    <Truck className="w-5 h-5 text-blue-500" />
                    <span className="font-mono font-bold text-white">{v.registration}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add vehicle form */}
          {showAddVehicleForm ? (
            <div className="bg-slate-800 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-bold text-white mb-3">Add Another Vehicle</h3>
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
              <div className="space-y-3">
                <input
                  type="text"
                  value={newVehicleReg}
                  onChange={(e) => setNewVehicleReg(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none uppercase font-mono"
                  placeholder="Registration"
                />
                <select
                  value={newVehicleType}
                  onChange={(e) => setNewVehicleType(e.target.value as VehicleType)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                >
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newVehicleMake}
                    onChange={(e) => setNewVehicleMake(e.target.value)}
                    className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    placeholder="Make (optional)"
                  />
                  <input
                    type="text"
                    value={newVehicleModel}
                    onChange={(e) => setNewVehicleModel(e.target.value)}
                    className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    placeholder="Model (optional)"
                  />
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">MOT Due Date</label>
                    <input
                      type="date"
                      value={newVehicleMotDue}
                      onChange={(e) => setNewVehicleMotDue(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Next PMI Due</label>
                    <input
                      type="date"
                      value={newVehicleNextPmi}
                      onChange={(e) => setNewVehicleNextPmi(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddVehicleForm(false)}
                    className="flex-1 py-2 bg-slate-600 text-white font-medium rounded-lg hover:bg-slate-500 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddVehicle}
                    disabled={loading || !newVehicleReg.trim()}
                    className="flex-1 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddVehicleForm(true)}
              className="w-full py-3 mb-4 bg-slate-800 text-slate-300 font-medium rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Another Vehicle
            </button>
          )}

          {/* Pricing summary */}
          <div className="bg-slate-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Vehicles</span>
              <span className="text-white font-bold">{totalVehicles}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Price per vehicle</span>
              <span className="text-white">£36.40/year</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">Subtotal</span>
              <span className="text-white">£{yearlySubtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400">VAT (20%)</span>
              <span className="text-white">£{yearlyVat.toFixed(2)}</span>
            </div>
            <div className="border-t border-slate-700 pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-white font-bold">Yearly total</span>
                <span className="text-orange-500 font-bold text-lg">£{yearlyTotal}</span>
              </div>
              <p className="text-slate-500 text-xs mt-1">Inc. VAT</p>
            </div>
          </div>

          {/* Continue to payment */}
          <button
            onClick={handleProceedToPayment}
            disabled={loading}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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

          <p className="text-center text-slate-500 text-xs mt-3">
            You can add more vehicles anytime from the dashboard
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Step: Payment (handling Stripe return or retry)
  // ============================================================================
  if (step === 'payment') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          {verifyingPayment ? (
            <>
              <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-500/10 rounded-full mb-6">
                <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
              </div>
              <h1 className="text-2xl font-heading text-white mb-2">Verifying Payment</h1>
              <p className="text-slate-400">
                Please wait while we confirm your subscription...
              </p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-500/10 rounded-full mb-6">
                <CreditCard className="w-10 h-10 text-orange-500" />
              </div>
              <h1 className="text-2xl font-heading text-white mb-2">Complete Your Subscription</h1>
              <p className="text-slate-400 mb-6">
                Your account is ready. Complete payment to start using CheckaTruck.
              </p>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-6">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                onClick={retryCheckout}
                disabled={loading || !createdOrgId}
                className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Try Payment Again
                  </>
                )}
              </button>

              <div className="mt-8">
                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // Step: Complete
  // ============================================================================
  if (step === 'complete') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500 rounded-full mb-6">
            <Check className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-heading text-white mb-2">You're All Set!</h1>
          <p className="text-slate-400">
            {type === 'owner_operator'
              ? 'Start your first vehicle check'
              : 'Add your drivers and vehicles from the dashboard'}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
