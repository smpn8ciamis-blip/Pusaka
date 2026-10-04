import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Public helper to bootstrap the default "adminweb" account for the school website.
// Idempotent: if the user already exists, ensures the role is admin_web and updates the password.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* allow empty body -> defaults */ }

    const email: string = (body.email ?? 'adminweb@nedelcis.local').toLowerCase();
    const password: string = body.password ?? '123456';
    const fullName: string = body.fullName ?? 'Admin Website';

    // Try to find existing user by listing (workaround for admin API)
    const { data: existingUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let user = existingUsers?.users?.find((u: any) => (u.email ?? '').toLowerCase() === email) ?? null;

    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) throw error;
      user = data.user;
    } else {
      // Update password so credentials always match what the user expects
      await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    }

    if (!user) throw new Error('Failed to create/find user');

    // Ensure profile exists
    await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName,
      email,
    });

    // Ensure role is admin_web (remove other roles for this user then insert)
    await supabase.from('user_roles').delete().eq('user_id', user.id);
    const { error: roleError } = await supabase.from('user_roles').insert({
      user_id: user.id,
      role: 'admin_web',
    });
    if (roleError) throw roleError;

    return new Response(
      JSON.stringify({
        success: true,
        email,
        password,
        message: 'Akun admin web siap digunakan',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('create-web-admin error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
