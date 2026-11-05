import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to verify admin authentication and get school_id
async function verifyAdminAuth(req: Request, supabaseClient: any): Promise<{ user: any; schoolId: string | null; callerRole: string | null; error: string | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { user: null, schoolId: null, callerRole: null, error: 'No authorization header provided' };
  }

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
  
  if (error || !user) {
    return { user: null, schoolId: null, callerRole: null, error: 'Invalid or expired token' };
  }

  // Check if user has admin role and get school_id
  const { data: roleData, error: roleError } = await supabaseClient
    .from('user_roles')
    .select('role, school_id')
    .eq('user_id', user.id)
    .single();

  // admin, super_admin, dan tata_usaha (master data) boleh; tata_usaha dibatasi di bawah
  if (roleError || !['admin', 'super_admin', 'tata_usaha'].includes(roleData?.role)) {
    return { user: null, schoolId: null, callerRole: null, error: 'Admin or tata usaha access required' };
  }

  return { user, schoolId: roleData?.school_id || null, callerRole: roleData.role, error: null };
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
    const { user: adminUser, schoolId, callerRole, error: authError } = await verifyAdminAuth(req, supabaseClient);
    if (authError) {
      console.log('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: authError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Create staff initiated by admin:', adminUser.email, 'school_id:', schoolId);

    const { email, password, fullName, role } = await req.json();

    if (!email || !password || !fullName || !role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, password, fullName, role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validRoles = ['bendahara', 'tata_usaha', 'kesiswaan', 'polling', 'billing', 'guru_piket', 'pembina_ekskul', 'staf'];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role. Must be bendahara, tata_usaha, kesiswaan, polling, billing, guru_piket, pembina_ekskul, or staf' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tata usaha tidak boleh membuat akun billing (langganan/penagihan aplikasi)
    if (callerRole === 'tata_usaha' && role === 'billing') {
      return new Response(
        JSON.stringify({ error: 'Tata usaha tidak boleh membuat akun dengan role billing' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user with admin API
    const { data: userData, error: userError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (userError) throw userError;
    if (!userData.user) throw new Error('User creation failed');

    // Assign role with school_id
    const { error: roleError } = await supabaseClient
      .from('user_roles')
      .insert({
        user_id: userData.user.id,
        role,
        school_id: schoolId
      });

    if (roleError) {
      // Batalkan akun yang sudah terbuat agar tidak menjadi akun yatim (email "sudah terdaftar" saat dicoba ulang)
      await supabaseClient.auth.admin.deleteUser(userData.user.id);
      throw roleError;
    }

    console.log('Staff created successfully:', email, 'with role:', role, 'school_id:', schoolId);

    return new Response(
      JSON.stringify({ success: true, user: userData.user }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating staff:', errorMessage, error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
