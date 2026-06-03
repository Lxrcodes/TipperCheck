// Deploy with: supabase functions deploy send-invoice-email

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = 'invoices@checkatruck.co.uk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { invoiceNumber, clientName, clientEmail, orgName, invoiceUrl } = await req.json();

    if (!clientEmail || !invoiceUrl || !invoiceNumber) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const greeting = clientName ? `Hi ${clientName},` : 'Hi,';
    const sender = orgName ?? 'Your supplier';

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
        <img src="https://checkatruck.co.uk/logo.png" alt="CheckaTruck" style="height:36px;margin-bottom:28px" />
        <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 12px">Invoice ${invoiceNumber}</h1>
        <p style="color:#475569;margin:0 0 24px">${greeting}<br/><br/>${sender} has sent you an invoice. Click the button below to view and download it.</p>
        <a href="${invoiceUrl}" style="display:inline-block;background:#f97316;color:#fff;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-bottom:24px">
          View Invoice
        </a>
        <p style="color:#94a3b8;font-size:13px;margin:0">Or copy this link: ${invoiceUrl}</p>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [clientEmail],
        subject: `Invoice ${invoiceNumber} from ${sender}`,
        html,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error('Resend error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to send email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Send invoice email error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
