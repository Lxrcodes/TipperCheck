// Deploy with: supabase functions deploy validate-invite

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, name, org_id, invite_sent_at, invite_accepted_at')
      .eq('invite_token', token)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'This invite link is invalid or has expired.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (user.invite_accepted_at) {
      return new Response(
        JSON.stringify({ error: 'This invite has already been used. Please log in instead.' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const daysSinceInvite = (Date.now() - new Date(user.invite_sent_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceInvite > 7) {
      return new Response(
        JSON.stringify({ error: 'This invite link has expired. Please ask your manager to send a new one.' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: org } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', user.org_id)
      .single();

    return new Response(
      JSON.stringify({ email: user.email, name: user.name, orgName: org?.name ?? 'your company' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Validate invite error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
