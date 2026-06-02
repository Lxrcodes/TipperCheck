// Deploy with: supabase functions deploy send-compliance-reminders
//
// Schedule via Supabase Dashboard → Edge Functions → send-compliance-reminders → Schedule
// Recommended: daily at 08:00 UTC  →  cron: "0 8 * * *"
//
// Or via SQL (requires pg_cron + pg_net enabled on your project):
//   select cron.schedule(
//     'compliance-reminders',
//     '0 8 * * *',
//     $$ select net.http_post(
//       url := current_setting('app.supabase_url') || '/functions/v1/send-compliance-reminders',
//       headers := jsonb_build_object(
//         'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
//         'Content-Type', 'application/json'
//       ),
//       body := '{}'::jsonb
//     ) $$
//   );

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FROM_EMAIL = 'noreply@checkatruck.co.uk';

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

serve(async (req) => {
  // Only accept requests with the service role key
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all non-demo orgs
    const { data: orgs } = await admin
      .from('organisations')
      .select('id')
      .eq('is_demo', false);

    if (!orgs || orgs.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let totalSent = 0;

    for (const org of orgs) {
      // Active vehicles with due dates set
      const { data: vehicles } = await admin
        .from('vehicles')
        .select('registration, mot_due_date, next_pmi_due_date')
        .eq('org_id', org.id)
        .eq('status', 'active');

      if (!vehicles || vehicles.length === 0) continue;

      // Managers in this org with their notification settings
      type NotifSettings = {
        email_enabled: boolean;
        notify_email: string | null;
        notify_mot_due: boolean;
        mot_reminder_days: number;
        notify_pmi_due: boolean;
        pmi_reminder_days: number;
      };
      type Manager = { email: string; name: string; notification_settings: NotifSettings[] };

      const { data: managers } = await admin
        .from('users')
        .select(`email, name, notification_settings(email_enabled, notify_email, notify_mot_due, mot_reminder_days, notify_pmi_due, pmi_reminder_days)`)
        .eq('org_id', org.id)
        .eq('is_active', true)
        .contains('roles', ['manager']);

      if (!managers || managers.length === 0) continue;

      for (const m of managers as Manager[]) {
        const s = m.notification_settings?.[0];
        // Defaults when no settings record exists
        const emailEnabled = s?.email_enabled ?? true;
        if (!emailEnabled) continue;

        const notifyMot = s?.notify_mot_due ?? true;
        const motDays = s?.mot_reminder_days ?? 30;
        const notifyPmi = s?.notify_pmi_due ?? true;
        const pmiDays = s?.pmi_reminder_days ?? 14;
        const recipientEmail = s?.notify_email ?? m.email;

        type ReminderItem = { reg: string; date: string; daysLeft: number };
        const motReminders: ReminderItem[] = [];
        const pmiReminders: ReminderItem[] = [];

        for (const v of vehicles) {
          if (notifyMot && v.mot_due_date) {
            const d = daysUntil(v.mot_due_date);
            if (d === motDays) {
              motReminders.push({ reg: v.registration, date: fmtDate(v.mot_due_date), daysLeft: d });
            }
          }
          if (notifyPmi && v.next_pmi_due_date) {
            const d = daysUntil(v.next_pmi_due_date);
            if (d === pmiDays) {
              pmiReminders.push({ reg: v.registration, date: fmtDate(v.next_pmi_due_date), daysLeft: d });
            }
          }
        }

        if (motReminders.length === 0 && pmiReminders.length === 0) continue;

        const html = reminderHtml(m.name, motReminders, pmiReminders);
        const totalItems = motReminders.length + pmiReminders.length;
        const subject = `📋 Compliance Reminder – ${totalItems} vehicle${totalItems > 1 ? 's' : ''} due soon`;

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: FROM_EMAIL, to: [recipientEmail], subject, html }),
        });

        if (res.ok) {
          totalSent++;
        } else {
          console.error('Resend error for', recipientEmail, await res.text());
        }
      }
    }

    return new Response(JSON.stringify({ success: true, sent: totalSent }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Compliance reminders error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

type ReminderItem = { reg: string; date: string; daysLeft: number };

function reminderHtml(name: string, motItems: ReminderItem[], pmiItems: ReminderItem[]): string {
  const rows = (items: ReminderItem[], label: string, color: string) =>
    items.map((i) => `
      <tr>
        <td style="padding:8px 12px;font-family:monospace;font-weight:700;color:#0f172a;font-size:14px">${i.reg}</td>
        <td style="padding:8px 12px;font-size:13px;color:#64748b">${label}</td>
        <td style="padding:8px 12px;font-size:13px;color:#0f172a">${i.date}</td>
        <td style="padding:8px 12px">
          <span style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px">${i.daysLeft}d</span>
        </td>
      </tr>`
    ).join('');

  const tableRows = [
    ...motItems.length > 0 ? [rows(motItems, 'MOT', motItems.some((i) => i.daysLeft <= 7) ? '#ef4444' : '#f97316')] : [],
    ...pmiItems.length > 0 ? [rows(pmiItems, 'PMI', pmiItems.some((i) => i.daysLeft <= 7) ? '#ef4444' : '#f97316')] : [],
  ].join('');

  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
      <img src="https://checkatruck.co.uk/logo.png" alt="CheckaTruck" style="height:40px;margin-bottom:24px" />
      <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 8px">📋 Compliance Reminder</h1>
      <p style="color:#475569;font-size:14px;margin:0 0 24px">Hi ${name}, the following vehicles have upcoming deadlines that need your attention.</p>

      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:24px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Vehicle</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Type</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Due Date</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Remaining</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <a href="https://app.checkatruck.co.uk" style="display:inline-block;background:#f97316;color:#fff;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-bottom:24px">Open Dashboard</a>
      <p style="color:#94a3b8;font-size:12px;margin:0">
        You can adjust notification preferences in Settings → Email Notifications.<br/>
        Sent via CheckaTruck · checkatruck.co.uk
      </p>
    </div>
  `;
}
