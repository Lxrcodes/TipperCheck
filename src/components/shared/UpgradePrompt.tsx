import { Lock, ChevronRight } from 'lucide-react';
import { TIER_NAMES, TIER_FEATURES, getWeeklyRateForTier } from '@/services/stripeClient';
import type { Organisation } from '@/types';

interface UpgradePromptProps {
  org: Organisation;
  requiredTier: number;
  onUpgrade?: () => void;
}

export function UpgradePrompt({ org, requiredTier, onUpgrade }: UpgradePromptProps) {
  const currentTier = org.subscription_tier ?? 1;
  const vehicleCount = org.active_vehicle_count || 1;
  const weeklyRate = getWeeklyRateForTier(requiredTier, vehicleCount);
  const tierName = TIER_NAMES[requiredTier];
  const features = TIER_FEATURES[requiredTier] ?? [];

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-orange-100 rounded-full mb-4">
          <Lock className="w-7 h-7 text-orange-500" />
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-1">
          {tierName} plan required
        </h2>
        <p className="text-slate-500 text-sm mb-6">
          You're on the <span className="font-semibold">{TIER_NAMES[currentTier]}</span> plan.
          Upgrade to unlock this feature.
        </p>

        <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
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

        <div className="mb-6">
          <span className="text-3xl font-bold text-slate-900">£{weeklyRate.toFixed(2)}</span>
          <span className="text-slate-500 text-sm"> /vehicle/week + VAT</span>
          <p className="text-xs text-slate-400 mt-1">Billed annually — charged immediately, prorated from today</p>
        </div>

        {onUpgrade && (
          <button
            onClick={onUpgrade}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors"
          >
            Upgrade to {tierName}
          </button>
        )}
      </div>
    </div>
  );
}
