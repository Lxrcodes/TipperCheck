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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { orgId } = await req.json();

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Missing orgId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get org details
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

      // Save customer ID
      await supabase
        .from('organisations')
        .update({ stripe_customer_id: customerId })
        .eq('id', orgId);
    }

    // Count active vehicles (excluding first free one)
    const { count: vehicleCount } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active');

    const billableVehicles = Math.max(0, (vehicleCount ?? 0) - 1);

    // Create checkout session with metered billing
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: Deno.env.get('STRIPE_PRICE_ID'), // Your price ID from Stripe
          quantity: billableVehicles || 1, // At least 1 for subscription
        },
      ],
      success_url: `${Deno.env.get('APP_URL')}/settings?billing=success`,
      cancel_url: `${Deno.env.get('APP_URL')}/settings?billing=cancelled`,
      subscription_data: {
        metadata: { org_id: orgId },
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
