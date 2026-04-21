import { useState } from 'react';
import { supabase } from '@/services/supabaseClient';
import {
  Truck,
  Users,
  User,
  ChevronRight,
  ChevronLeft,
  Building2,
  Loader2,
  Check,
  Plus,
  LogOut,
} from 'lucide-react';
import type { OnboardingType, VehicleType } from '@/types';
import { VEHICLE_TYPES } from '@/types';

interface OnboardingProps {
  email: string;
  onComplete: () => void;
  onBack: () => void;
}

type OnboardingStep = 'type' | 'org' | 'vehicle' | 'complete';

export function Onboarding({ email, onComplete, onBack }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>('type');
  const [type, setType] = useState<OnboardingType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [orgName, setOrgName] = useState('');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');

  // First vehicle
  const [vehicleReg, setVehicleReg] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('tipper');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');

  const handleTypeSelect = (selectedType: OnboardingType) => {
    setType(selectedType);
    setStep('org');
  };

  const handleOrgSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !userName.trim()) return;
    setStep('vehicle');
  };

  const handleComplete = async (skipVehicle = false) => {
    if (!type || !orgName.trim() || !userName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Get current auth user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Generate IDs client-side to avoid needing SELECT after INSERT
      const orgId = crypto.randomUUID();
      const userId = crypto.randomUUID();

      // Both owner-operators and fleet managers get both roles
      // This allows the first user to perform checks themselves if needed
      const roles = ['manager', 'driver'];

      // Create organisation (no .select() needed - we have the ID)
      const { error: orgError } = await supabase
        .from('organisations')
        .insert({
          id: orgId,
          name: orgName.trim(),
          contact_email: email,
          contact_phone: userPhone || null,
          subscription_status: 'trialing',
        });

      if (orgError) throw orgError;

      // Create user record (no .select() needed - we have the ID)
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

      // Create first vehicle if provided
      if (!skipVehicle && vehicleReg.trim()) {
        const { error: vehicleError } = await supabase
          .from('vehicles')
          .insert({
            org_id: orgId,
            registration: vehicleReg.trim().toUpperCase(),
            vehicle_type: vehicleType,
            make: vehicleMake.trim() || null,
            model: vehicleModel.trim() || null,
            status: 'active',
            created_by: userId,
          });

        if (vehicleError) throw vehicleError;
      }

      setStep('complete');

      // Brief delay to show success, then redirect
      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      setError(message);
      console.error('Onboarding error:', err);
    } finally {
      setLoading(false);
    }
  };

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
            <h1 className="text-2xl font-heading text-white">Welcome to TipperCheck</h1>
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
                Your first vehicle is free - no credit card needed
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleComplete(false);
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
                    <Plus className="w-5 h-5" />
                    Add Vehicle & Continue
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleComplete(true)}
                disabled={loading}
                className="w-full py-3 text-slate-400 hover:text-white transition-colors text-sm"
              >
                Skip for now - I'll add vehicles later
              </button>
            </div>
          </form>
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
