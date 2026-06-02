// Deploy with: supabase functions deploy send-notification-email

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
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
    const { type, orgId, payload } = await req.json() as {
      type: 'critical_defect' | 'job_completed';
      orgId: string;
      payload: Record<string, string>;
    };

    if (!type || !orgId) {
      return new Response(JSON.stringify({ error: 'Missing type or orgId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: managers } = await admin
      .from('users')
      .select(`
        email, name,
        notification_settings (
          email_enabled, notify_email,
          notify_critical_defect, notify_job_completed
        )
      `)
      .eq('org_id', orgId)
      .eq('is_active', true)
      .contains('roles', ['manager']);

    if (!managers || managers.length === 0) {
      return new Response(JSON.stringify({ success: true, sent_to: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Apply per-user preferences; no settings record = all defaults enabled
    type NotifSettings = { email_enabled: boolean; notify_email: string | null; notify_critical_defect: boolean; notify_job_completed: boolean };
    type Manager = { email: string; name: string; notification_settings: NotifSettings[] };

    const recipients = (managers as Manager[])
      .filter((m) => {
        const s = m.notification_settings?.[0];
        if (!s) return true; // defaults: all enabled
        if (!s.email_enabled) return false;
        if (type === 'critical_defect' && !s.notify_critical_defect) return false;
        if (type === 'job_completed' && !s.notify_job_completed) return false;
        return true;
      })
      .map((m) => ({
        email: m.notification_settings?.[0]?.notify_email ?? m.email,
        name: m.name,
      }));

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ success: true, sent_to: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = type === 'critical_defect'
      ? `⚠️ Critical Defect – ${payload.vehicleReg ?? 'Unknown Vehicle'}`
      : `✅ Job Completed – ${payload.jobReference ?? ''}`;

    const html = type === 'critical_defect'
      ? criticalDefectHtml(payload)
      : jobCompletedHtml(payload);

    await Promise.all(
      recipients.map(async (r) => {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: FROM_EMAIL, to: [r.email], subject, html }),
        });
        if (!res.ok) console.error('Resend error for', r.email, await res.text());
      })
    );

    return new Response(JSON.stringify({ success: true, sent_to: recipients.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Notification error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function criticalDefectHtml(p: Record<string, string>): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <img src="https://checkatruck.co.uk/logo.png" alt="CheckaTruck" style="height:40px;margin-bottom:24px" />
      <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="font-size:18px;font-weight:700;color:#dc2626;margin:0 0 4px">⚠️ Critical Defect Raised</p>
        <p style="color:#7f1d1d;margin:0;font-size:14px">Immediate attention required — this vehicle must not be driven</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px;width:40%">Vehicle</td>
          <td style="padding:8px 0;font-weight:700;color:#0f172a;font-family:monospace;font-size:16px">${p.vehicleReg ?? '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px">Driver</td>
          <td style="padding:8px 0;font-weight:600;color:#0f172a;font-size:14px">${p.driverName ?? '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px">Check Date</td>
          <td style="padding:8px 0;font-weight:600;color:#0f172a;font-size:14px">${p.checkDate ?? '—'}</td>
        </tr>
      </table>
      <a href="https://app.checkatruck.co.uk" style="display:inline-block;background:#f97316;color:#fff;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-bottom:24px">View in Dashboard</a>
      <p style="color:#94a3b8;font-size:13px;margin:0">Sent via CheckaTruck · checkatruck.co.uk</p>
    </div>
  `;
}

function jobCompletedHtml(p: Record<string, string>): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <img src="https://checkatruck.co.uk/logo.png" alt="CheckaTruck" style="height:40px;margin-bottom:24px" />
      <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="font-size:18px;font-weight:700;color:#16a34a;margin:0 0 4px">✅ Job Completed</p>
        <p style="color:#14532d;margin:0;font-size:14px">All loads have been delivered successfully</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px;width:40%">Job Reference</td>
          <td style="padding:8px 0;font-weight:700;color:#0f172a;font-family:monospace;font-size:16px">${p.jobReference ?? '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px">Title</td>
          <td style="padding:8px 0;font-weight:600;color:#0f172a;font-size:14px">${p.jobTitle ?? '—'}</td>
        </tr>
        ${p.completedAt ? `
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px">Completed</td>
          <td style="padding:8px 0;font-weight:600;color:#0f172a;font-size:14px">${p.completedAt}</td>
        </tr>` : ''}
      </table>
      <a href="https://app.checkatruck.co.uk" style="display:inline-block;background:#f97316;color:#fff;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-bottom:24px">View in Dashboard</a>
      <p style="color:#94a3b8;font-size:13px;margin:0">Sent via CheckaTruck · checkatruck.co.uk</p>
    </div>
  `;
}
