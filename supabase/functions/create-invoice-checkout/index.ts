// Deploy with: supabase functions deploy create-invoice-checkout

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { invoiceNumber } = await req.json();
    if (!invoiceNumber) {
      return new Response(
        JSON.stringify({ error: 'Missing invoiceNumber' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load invoice + items + org connect details
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*, organisations(stripe_connect_account_id, stripe_connect_onboarded)')
      .eq('number', invoiceNumber.toUpperCase())
      .single();

    if (invError || !invoice) {
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (invoice.status !== 'sent') {
      return new Response(
        JSON.stringify({ error: 'Invoice is not payable' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const org = invoice.organisations as { stripe_connect_account_id: string | null; stripe_connect_onboarded: boolean };
    if (!org.stripe_connect_onboarded || !org.stripe_connect_account_id) {
      return new Response(
        JSON.stringify({ error: 'Organisation has not connected Stripe' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('sort_order');

    const lineItems = (items ?? []).map((item) => ({
      price_data: {
        currency: 'gbp',
        product_data: { name: item.description },
        unit_amount: Math.round(Number(item.unit_price) * 100),
      },
      quantity: Number(item.quantity),
    }));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      ...(invoice.vat_enabled ? {
        automatic_tax: { enabled: false },
      } : {}),
      payment_intent_data: {
        transfer_data: {
          destination: org.stripe_connect_account_id,
        },
      },
      customer_email: invoice.client_email ?? undefined,
      success_url: `${appUrl}/invoice/${invoiceNumber}?paid=1`,
      cancel_url:  `${appUrl}/invoice/${invoiceNumber}`,
      metadata: {
        invoice_id:     invoice.id,
        invoice_number: invoice.number,
      },
    });

    // Save session ID on the invoice so we can match the webhook
    await supabase
      .from('invoices')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', invoice.id);

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Invoice checkout error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
