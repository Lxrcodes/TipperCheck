// Follow Supabase Edge Function conventions
// Deploy with: supabase functions deploy create-checkout

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

const TIER_PRICE_ENV: Record<number, string> = {
  1: 'STRIPE_PRICE_T1',
  2: 'STRIPE_PRICE_T2',
  3: 'STRIPE_PRICE_T3',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { orgId, tier = 1 } = await req.json();

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Missing orgId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const selectedTier = [1, 2, 3].includes(tier) ? tier : 1;
    const priceEnvKey = TIER_PRICE_ENV[selectedTier];
    const priceId = Deno.env.get(priceEnvKey);

    if (!priceId) {
      return new Response(
        JSON.stringify({ error: `Stripe price not configured for tier ${selectedTier}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .select('*, vehicles:vehicles(count)')
      .eq('id', orgId)
      .single();

    if (orgError || !org) {
      return new Response(
        JSON.stringify({ error: 'Organisation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get or create Stripe customer
    let customerId = org.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: org.contact_email,
        name: org.name,
        metadata: { org_id: orgId },
      });
      customerId = customer.id;

      await supabase
        .from('organisations')
        .update({ stripe_customer_id: customerId })
        .eq('id', orgId);
    }

    const { count: vehicleCount } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active');

    const billableVehicles = vehicleCount ?? 1;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: billableVehicles,
        },
      ],
      success_url: `${(Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')}/?billing=success&org_id=${orgId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${(Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')}/`,
      subscription_data: {
        trial_period_days: 7,
        metadata: { org_id: orgId, tier: String(selectedTier) },
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Checkout error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
