// Follow Supabase Edge Function conventions
// Deploy with: supabase functions deploy stripe-webhook

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.org_id || session.subscription_data?.metadata?.org_id;

        if (orgId && session.subscription) {
          // Update organisation with subscription ID
          await supabase
            .from('organisations')
            .update({
              subscription_id: session.subscription as string,
              subscription_status: 'active',
            })
            .eq('id', orgId);

          console.log(`Subscription created for org ${orgId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.org_id;

        if (orgId) {
          await supabase
            .from('organisations')
            .update({
              subscription_status: subscription.status as string,
            })
            .eq('id', orgId);

          console.log(`Subscription updated for org ${orgId}: ${subscription.status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.org_id;

        if (orgId) {
          await supabase
            .from('organisations')
            .update({
              subscription_status: 'canceled',
              subscription_id: null,
            })
            .eq('id', orgId);

          console.log(`Subscription cancelled for org ${orgId}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Find org by customer ID
        const { data: org } = await supabase
          .from('organisations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (org) {
          await supabase
            .from('organisations')
            .update({ subscription_status: 'past_due' })
            .eq('id', org.id);

          console.log(`Payment failed for org ${org.id}`);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Find org by customer ID
        const { data: org } = await supabase
          .from('organisations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (org) {
          await supabase
            .from('organisations')
            .update({ subscription_status: 'active' })
            .eq('id', org.id);

          console.log(`Invoice paid for org ${org.id}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
