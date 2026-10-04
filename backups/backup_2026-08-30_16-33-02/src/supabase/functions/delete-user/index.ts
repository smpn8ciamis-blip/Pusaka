import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to verify admin authentication and get school_id
async function verifyAdminAuth(req: Request, supabaseClient: any): Promise<{ user: any; schoolId: string | null; isSuperAdmin: boolean; error: string | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { user: null, schoolId: null, isSuperAdmin: false, error: 'No authorization header provided' };
  }

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
  
  if (error || !user) {
    return { user: null, schoolId: null, isSuperAdmin: false, error: 'Invalid or expired token' };
  }

  // Check if user has admin role and get school_id
  const { data: roleData, error: roleError } = await supabaseClient
    .from('user_roles')
    .select('role, school_id')
    .eq('user_id', user.id)
    .single();

  if (roleError || (roleData?.role !== 'admin' && roleData?.role !== 'super_admin')) {
    return { user: null, schoolId: null, isSuperAdmin: false, error: 'Admin access required' };
  }

  return { user, schoolId: roleData?.school_id || null, isSuperAdmin: roleData?.role === 'super_admin', error: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verify admin authentication
    const { user: adminUser, schoolId, isSuperAdmin, error: authError } = await verifyAdminAuth(req, supabaseClient);
    if (authError) {
      console.log('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: authError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prevent admin from deleting themselves
    if (userId === adminUser.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Non-super-admin can only delete users from their own school
    if (!isSuperAdmin && schoolId) {
      const { data: targetRole } = await supabaseClient
        .from('user_roles')
        .select('school_id')
        .eq('user_id', userId)
        .single();

      if (targetRole?.school_id !== schoolId) {
        return new Response(
          JSON.stringify({ error: 'Cannot delete users from other schools' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Delete user initiated by admin:', adminUser.email, 'Target user:', userId);

    // Delete user (will cascade to teachers and user_roles)
    const { error } = await supabaseClient.auth.admin.deleteUser(userId);
    
    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error deleting user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
