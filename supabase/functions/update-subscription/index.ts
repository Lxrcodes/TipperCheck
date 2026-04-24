// Follow Supabase Edge Function conventions
// Deploy with: supabase functions deploy update-subscription

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
    const { orgId, vehicleCount } = await req.json();

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
      .select('subscription_id')
      .eq('id', orgId)
      .single();

    if (orgError || !org?.subscription_id) {
      // No subscription yet - that's OK, they're still on free tier
      return new Response(
        JSON.stringify({ message: 'No subscription to update' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate billable vehicles (first one is free)
    const billableVehicles = Math.max(0, vehicleCount - 1);

    // Get subscription
    const subscription = await stripe.subscriptions.retrieve(org.subscription_id);

    if (subscription.status === 'canceled') {
      return new Response(
        JSON.stringify({ message: 'Subscription is cancelled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update subscription quantity
    const subscriptionItem = subscription.items.data[0];

    if (billableVehicles === 0) {
      // Cancel the subscription if no billable vehicles
      // Or keep it at 1 minimum - depends on your business logic
      await stripe.subscriptions.update(org.subscription_id, {
        items: [
          {
            id: subscriptionItem.id,
            quantity: 1, // Keep minimum 1 to maintain subscription
          },
        ],
        proration_behavior: 'create_prorations',
      });
    } else {
      await stripe.subscriptions.update(org.subscription_id, {
        items: [
          {
            id: subscriptionItem.id,
            quantity: billableVehicles,
          },
        ],
        proration_behavior: 'create_prorations',
      });
    }

    // Update vehicle count in database
    await supabase
      .from('organisations')
      .update({ active_vehicle_count: vehicleCount })
      .eq('id', orgId);

    return new Response(
      JSON.stringify({ success: true, billableVehicles }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Update subscription error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
