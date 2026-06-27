import { loadStripe, Stripe } from '@stripe/stripe-js';

// ============================================================================
// Stripe Client - Frontend SDK
// ============================================================================

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise && STRIPE_PUBLISHABLE_KEY) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise ?? Promise.resolve(null);
}

export function isStripeConfigured(): boolean {
  return !!STRIPE_PUBLISHABLE_KEY;
}

// ============================================================================
// Pricing
// ============================================================================

export const TIER_NAMES: Record<number, string> = {
  1: 'Comply',
  2: 'Manage',
  3: 'Control',
};

// Weekly per-vehicle rates per tier per volume band (pence)
// Band thresholds: 1-10, 11-25, 26-50, 51+
export const TIER_WEEKLY_RATES: Record<number, number[]> = {
  1: [0.70, 0.63, 0.60, 0.56],
  2: [1.50, 1.35, 1.28, 1.20],
  3: [2.50, 2.25, 2.13, 2.00],
};

// Monthly per-vehicle rates per tier (pence). No volume bands — flat rate.
export const TIER_MONTHLY_RATES: Record<number, number> = {
  1: 3.55,
  2: 7.65,
  3: 12.70,
};

export function getMonthlyRateForTier(tier: number): number {
  return TIER_MONTHLY_RATES[tier] ?? TIER_MONTHLY_RATES[1];
}

export const TIER_FEATURES: Record<number, string[]> = {
  1: ['DVSA-compliant daily checks', 'Defect management', 'Audit trail', 'Manager dashboard'],
  2: ['Everything in Comply', 'Job management', 'MOT & service date tracking', 'Compliance notifications'],
  3: ['Everything in Manage', 'Invoicing', 'Analytics dashboard'],
};

export function getVolumeBandIndex(vehicleCount: number): number {
  if (vehicleCount <= 10) return 0;
  if (vehicleCount <= 25) return 1;
  if (vehicleCount <= 50) return 2;
  return 3;
}

export function getWeeklyRateForTier(tier: number, vehicleCount: number): number {
  const rates = TIER_WEEKLY_RATES[tier] ?? TIER_WEEKLY_RATES[1];
  return rates[getVolumeBandIndex(vehicleCount)];
}

export function getAnnualTotalForTier(tier: number, vehicleCount: number): number {
  return getWeeklyRateForTier(tier, vehicleCount) * 52 * vehicleCount;
}

// ============================================================================
// Billing API Calls (via Supabase Edge Functions)
// ============================================================================

import { supabase } from './supabaseClient';

interface CheckoutResponse {
  url: string;
}

interface PortalResponse {
  url: string;
}

/**
 * Create a Stripe Checkout session for initial subscription
 */
export async function createCheckoutSession(orgId: string, tier = 1, billingInterval: 'year' | 'month' = 'year'): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke<CheckoutResponse>('create-checkout', {
      body: { orgId, tier, billingInterval },
    });

    if (error) {
      console.error('Checkout error:', error);
      return null;
    }

    return data?.url ?? null;
  } catch (err) {
    console.error('Failed to create checkout session:', err);
    return null;
  }
}

/**
 * Upgrade an org to a higher tier immediately with proration
 */
export async function upgradeTier(orgId: string, newTier: number): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke<{ success: boolean }>('upgrade-tier', {
      body: { orgId, newTier },
    });

    if (error) {
      console.error('Upgrade tier error:', error);
      return false;
    }

    return data?.success ?? false;
  } catch (err) {
    console.error('Failed to upgrade tier:', err);
    return false;
  }
}

/**
 * Create a Stripe Customer Portal session for managing subscription
 */
export async function createPortalSession(orgId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke<PortalResponse>('create-portal-session', {
      body: { orgId },
    });

    if (error) {
      console.error('Portal error:', error);
      return null;
    }

    return data?.url ?? null;
  } catch (err) {
    console.error('Failed to create portal session:', err);
    return null;
  }
}

/**
 * Update subscription quantity (called when vehicles are added/removed)
 */
export async function updateSubscriptionQuantity(
  orgId: string,
  vehicleCount: number
): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('update-subscription', {
      body: { orgId, vehicleCount },
    });

    if (error) {
      console.error('Update subscription error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Failed to update subscription:', err);
    return false;
  }
}

interface CancelSubscriptionResponse {
  success: boolean;
  cancel_at_period_end: boolean;
  current_period_end: string;
}

/**
 * Cancel subscription at end of billing period
 */
export async function cancelSubscription(orgId: string): Promise<CancelSubscriptionResponse | null> {
  try {
    const { data, error } = await supabase.functions.invoke<CancelSubscriptionResponse>('cancel-subscription', {
      body: { orgId, action: 'cancel' },
    });

    if (error) {
      console.error('Cancel subscription error:', error);
      return null;
    }

    return data ?? null;
  } catch (err) {
    console.error('Failed to cancel subscription:', err);
    return null;
  }
}

/**
 * Reactivate a subscription that was set to cancel at period end
 */
export async function reactivateSubscription(orgId: string): Promise<CancelSubscriptionResponse | null> {
  try {
    const { data, error } = await supabase.functions.invoke<CancelSubscriptionResponse>('cancel-subscription', {
      body: { orgId, action: 'reactivate' },
    });

    if (error) {
      console.error('Reactivate subscription error:', error);
      return null;
    }

    return data ?? null;
  } catch (err) {
    console.error('Failed to reactivate subscription:', err);
    return null;
  }
}

/**
 * Immediately cancel a subscription — used when deleting an account
 */
export async function cancelSubscriptionImmediately(orgId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke<{ success: boolean }>('cancel-subscription', {
      body: { orgId, action: 'cancel_immediately' },
    });

    if (error) {
      console.error('Immediate cancel error:', error);
      return false;
    }

    return data?.success ?? false;
  } catch (err) {
    console.error('Failed to immediately cancel subscription:', err);
    return false;
  }
}
