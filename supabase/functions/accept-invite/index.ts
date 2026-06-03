// Deploy with: supabase functions deploy accept-invite

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
    const { token, password } = await req.json();

    if (!token || !password) {
      return new Response(
        JSON.stringify({ error: 'Missing token or password' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Re-validate token
    const { data: pendingUser, error: userError } = await supabase
      .from('users')
      .select('id, email, invite_sent_at, invite_accepted_at')
      .eq('invite_token', token)
      .single();

    if (userError || !pendingUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired invite token.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (pendingUser.invite_accepted_at) {
      return new Response(
        JSON.stringify({ error: 'This invite has already been used.' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create auth user with email already confirmed (skip confirmation email)
    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email: pendingUser.email,
      password,
      email_confirm: true,
    });

    if (createError) throw createError;

    // Link auth user to the existing users record
    const { error: updateError } = await supabase
      .from('users')
      .update({
        auth_user_id: authData.user.id,
        invite_accepted_at: new Date().toISOString(),
        invite_token: null,
        is_active: true,
      })
      .eq('id', pendingUser.id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ email: pendingUser.email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Accept invite error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
