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
// Billing Constants
// ============================================================================

export const PRICING = {
  // 70p per vehicle per week
  PRICE_PER_VEHICLE_WEEKLY: 0.70,
  // Approximately £3.03 per month (70p * 52 weeks / 12 months)
  PRICE_PER_VEHICLE_MONTHLY: 3.03,
  // First vehicle is free
  FREE_VEHICLES: 1,
  // Currency
  CURRENCY: 'gbp',
};

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
export async function createCheckoutSession(orgId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke<CheckoutResponse>('create-checkout', {
      body: { orgId },
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
