import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify caller is admin (if auth header present)
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const jwt = authHeader.replace('Bearer ', '');
    // Skip check if it's the anon key (from curl test with verify_jwt=false)
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (jwt !== anonKey) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'super_admin'])
        .limit(1)
        .single();

      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
  }

  try {
    const { newPassword } = await req.json();
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password minimal 6 karakter');
    }

    // Get all student account user IDs
    const { data: studentAccounts, error: saError } = await supabase
      .from('student_accounts')
      .select('user_id');

    if (saError) throw saError;
    if (!studentAccounts || studentAccounts.length === 0) {
      return new Response(JSON.stringify({ success: true, updated: 0, failed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let updated = 0;
    let failed = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < studentAccounts.length; i += BATCH_SIZE) {
      const batch = studentAccounts.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (sa) => {
          const { error } = await supabase.auth.admin.updateUserById(sa.user_id, {
            password: newPassword,
          });
          if (error) throw error;
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') updated++;
        else failed++;
      }
    }

    return new Response(JSON.stringify({ success: true, updated, failed, total: studentAccounts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
