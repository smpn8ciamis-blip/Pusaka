import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifySuperAdmin(req: Request, supabaseClient: any) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: 'No authorization header' };

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
  if (error || !user) return { error: 'Invalid token' };

  const { data: roleData } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .single();

  if (!roleData) return { error: 'Super admin access required' };
  return { user };
}

async function verifyAdminOrSuperAdmin(req: Request, supabaseClient: any) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: 'No authorization header' };

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
  if (error || !user) return { error: 'Invalid token' };

  const { data: roleData } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['admin', 'super_admin'])
    .limit(1)
    .single();

  if (!roleData) return { error: 'Admin access required' };
  return { user, role: roleData.role };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const { action, ...params } = await req.json();

    // Actions that require super_admin
    const superAdminActions = ['list', 'create', 'update_profile', 'update_role', 'delete', 'update_school'];
    // Actions that admin can also do
    const adminActions = ['change_password', 'reset_single_password'];

    if (superAdminActions.includes(action)) {
      const { error: authError } = await verifySuperAdmin(req, supabaseClient);
      if (authError) {
        return new Response(JSON.stringify({ error: authError }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else if (adminActions.includes(action)) {
      const { error: authError } = await verifyAdminOrSuperAdmin(req, supabaseClient);
      if (authError) {
        return new Response(JSON.stringify({ error: authError }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else {
      // Unknown action still requires super_admin
      const { error: authError } = await verifySuperAdmin(req, supabaseClient);
      if (authError) {
        return new Response(JSON.stringify({ error: authError }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // LIST ALL USERS
    if (action === 'list') {
      const { data: roles, error: rolesErr } = await supabaseClient
        .from('user_roles')
        .select('user_id, role, school_id');
      if (rolesErr) throw rolesErr;

      const userIds = roles?.map((r: any) => r.user_id) || [];
      if (userIds.length === 0) {
        return new Response(JSON.stringify({ users: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('id, full_name, email, phone')
        .in('id', userIds);

      // Also fetch auth users to get email when profiles are incomplete
      let authUsersMap: Record<string, any> = {};
      try {
        const { data: authData } = await supabaseClient.auth.admin.listUsers({ perPage: 1000 });
        if (authData?.users) {
          authData.users.forEach((u: any) => {
            authUsersMap[u.id] = {
              email: u.email,
              full_name: u.user_metadata?.full_name || u.email,
            };
          });
        }
      } catch (e) {
        console.log('Could not fetch auth users:', e);
      }

      const { data: schools } = await supabaseClient
        .from('schools')
        .select('id, name');

      const schoolMap: Record<string, string> = {};
      schools?.forEach((s: any) => { schoolMap[s.id] = s.name; });

      const users = roles?.map((r: any) => {
        const profile = profiles?.find((p: any) => p.id === r.user_id);
        const authUser = authUsersMap[r.user_id];
        return {
          user_id: r.user_id,
          role: r.role,
          school_id: r.school_id,
          school_name: r.school_id ? schoolMap[r.school_id] || null : null,
          full_name: profile?.full_name || authUser?.full_name || null,
          email: profile?.email || authUser?.email || null,
          phone: profile?.phone || null,
        };
      }) || [];

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // CREATE USER
    if (action === 'create') {
      const { email, password, fullName, role, schoolId } = params;
      if (!email || !password || !fullName || !role) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: userData, error: userError } = await supabaseClient.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: fullName }
      });
      if (userError) throw userError;

      await supabaseClient.from('profiles').insert({
        id: userData.user.id, email, full_name: fullName,
      });

      await supabaseClient.from('user_roles').insert({
        user_id: userData.user.id, role, school_id: schoolId || null,
      });

      return new Response(JSON.stringify({ success: true, user_id: userData.user.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // UPDATE USER PROFILE
    if (action === 'update_profile') {
      const { userId, fullName, phone } = params;
      if (!userId) throw new Error('userId required');

      const updates: any = {};
      if (fullName !== undefined) updates.full_name = fullName;
      if (phone !== undefined) updates.phone = phone;

      const { error } = await supabaseClient
        .from('profiles')
        .update(updates)
        .eq('id', userId);
      if (error) throw error;

      if (fullName) {
        await supabaseClient.auth.admin.updateUserById(userId, {
          user_metadata: { full_name: fullName }
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // UPDATE ROLE
    if (action === 'update_role') {
      const { userId, role, schoolId } = params;
      if (!userId || !role) throw new Error('userId and role required');

      const { error } = await supabaseClient
        .from('user_roles')
        .update({ role, school_id: schoolId ?? null })
        .eq('user_id', userId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // CHANGE PASSWORD (super_admin or admin)
    if (action === 'change_password') {
      const { userId, newPassword } = params;
      if (!userId || !newPassword) throw new Error('userId and newPassword required');
      if (newPassword.length < 6) throw new Error('Password minimal 6 karakter');

      const { error } = await supabaseClient.auth.admin.updateUserById(userId, {
        password: newPassword
      });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // RESET SINGLE PASSWORD (admin can use this for student accounts)
    if (action === 'reset_single_password') {
      const { userId, newPassword } = params;
      if (!userId || !newPassword) throw new Error('userId and newPassword required');
      if (newPassword.length < 6) throw new Error('Password minimal 6 karakter');

      const { error } = await supabaseClient.auth.admin.updateUserById(userId, {
        password: newPassword
      });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // DELETE USER
    if (action === 'delete') {
      const { userId } = params;
      if (!userId) throw new Error('userId required');

      const { error } = await supabaseClient.auth.admin.deleteUser(userId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // UPDATE SCHOOL
    if (action === 'update_school') {
      const { schoolId, name, address, phone, email, npsn } = params;
      if (!schoolId) throw new Error('schoolId required');

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (address !== undefined) updates.address = address;
      if (phone !== undefined) updates.phone = phone;
      if (email !== undefined) updates.email = email;
      if (npsn !== undefined) updates.npsn = npsn;

      const { error } = await supabaseClient
        .from('schools')
        .update(updates)
        .eq('id', schoolId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('manage-users error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
