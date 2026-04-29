// Follow Supabase Edge Function conventions
// Deploy with: supabase functions deploy cancel-subscription

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
    const { orgId, action } = await req.json();

    if (!orgId || !action) {
      return new Response(
        JSON.stringify({ error: 'Missing orgId or action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action !== 'cancel' && action !== 'reactivate') {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Must be "cancel" or "reactivate"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get org details
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .select('subscription_id')
      .eq('id', orgId)
      .single();

    if (orgError || !org?.subscription_id) {
      return new Response(
        JSON.stringify({ error: 'No active subscription found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update subscription in Stripe
    const cancelAtPeriodEnd = action === 'cancel';
    const subscription = await stripe.subscriptions.update(org.subscription_id, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    // Update database with cancellation status
    await supabase
      .from('organisations')
      .update({
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      })
      .eq('id', orgId);

    return new Response(
      JSON.stringify({
        success: true,
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
