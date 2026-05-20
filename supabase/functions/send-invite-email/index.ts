// Deploy with: supabase functions deploy send-invite-email

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = 'noreply@checkatruck.co.uk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, name, inviteUrl } = await req.json();

    if (!email || !inviteUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing email or inviteUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const displayName = name ?? email;

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <img src="https://checkatruck.co.uk/logo.png" alt="CheckaTruck" style="height:40px;margin-bottom:24px" />
        <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 12px">You've been invited to CheckaTruck</h1>
        <p style="color:#475569;margin:0 0 24px">Hi ${displayName}, your manager has added you to their fleet. Click the button below to set up your account.</p>
        <a href="${inviteUrl}" style="display:inline-block;background:#f97316;color:#fff;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-bottom:24px">
          Set Up My Account
        </a>
        <p style="color:#94a3b8;font-size:13px;margin:0">This link expires in 7 days. If you weren't expecting this, you can ignore it.</p>
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
        to: [email],
        subject: "You've been invited to CheckaTruck",
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
    console.error('Send invite error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
