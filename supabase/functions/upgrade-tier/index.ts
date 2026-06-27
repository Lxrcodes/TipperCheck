// Deploy with: supabase functions deploy upgrade-tier

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIER_PRICE_ENV: Record<string, Record<number, string>> = {
  year: { 1: 'STRIPE_PRICE_T1', 2: 'STRIPE_PRICE_T2', 3: 'STRIPE_PRICE_T3' },
  month: { 1: 'STRIPE_PRICE_T1_MONTHLY', 2: 'STRIPE_PRICE_T2_MONTHLY', 3: 'STRIPE_PRICE_T3_MONTHLY' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { orgId, newTier } = await req.json();

    if (!orgId || !newTier) {
      return new Response(
        JSON.stringify({ error: 'Missing orgId or newTier' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (![1, 2, 3].includes(newTier)) {
      return new Response(
        JSON.stringify({ error: 'Invalid tier. Must be 1, 2, or 3' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .select('subscription_id, subscription_tier, billing_interval')
      .eq('id', orgId)
      .single();

    if (orgError || !org?.subscription_id) {
      return new Response(
        JSON.stringify({ error: 'No active subscription found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (org.subscription_tier === newTier) {
      return new Response(
        JSON.stringify({ error: 'Already on this tier' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const interval = org.billing_interval === 'month' ? 'month' : 'year';
    const newPriceId = Deno.env.get(TIER_PRICE_ENV[interval][newTier]);
    if (!newPriceId) {
      return new Response(
        JSON.stringify({ error: `Stripe price not configured for tier ${newTier}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const subscription = await stripe.subscriptions.retrieve(org.subscription_id);
    const subscriptionItem = subscription.items.data[0];

    // Switch price immediately with proration — Stripe charges the difference
    const updated = await stripe.subscriptions.update(org.subscription_id, {
      items: [{ id: subscriptionItem.id, price: newPriceId }],
      proration_behavior: 'create_prorations',
      metadata: { ...subscription.metadata, tier: String(newTier) },
    });

    const updatedPriceId = updated.items.data[0]?.price?.id ?? newPriceId;

    await supabase
      .from('organisations')
      .update({
        subscription_tier: newTier,
        stripe_price_id: updatedPriceId,
        current_period_end: new Date(updated.current_period_end * 1000).toISOString(),
      })
      .eq('id', orgId);

    return new Response(
      JSON.stringify({ success: true, tier: newTier }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Upgrade tier error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
