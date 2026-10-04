import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to verify admin authentication and get school_id
async function verifyAdminAuth(req: Request, supabaseClient: any): Promise<{ user: any; schoolId: string | null; error: string | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { user: null, schoolId: null, error: 'No authorization header provided' };
  }

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
  
  if (error || !user) {
    return { user: null, schoolId: null, error: 'Invalid or expired token' };
  }

  // Check if user has admin role and get school_id
  const { data: roleData, error: roleError } = await supabaseClient
    .from('user_roles')
    .select('role, school_id')
    .eq('user_id', user.id)
    .single();

  if (roleError || (roleData?.role !== 'admin' && roleData?.role !== 'super_admin')) {
    return { user: null, schoolId: null, error: 'Admin access required' };
  }

  return { user, schoolId: roleData?.school_id || null, error: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
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
    const { user, schoolId, error: authError } = await verifyAdminAuth(req, supabaseAdmin);
    if (authError) {
      console.log('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: authError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Setup demo users initiated by admin:', user.email, 'school_id:', schoolId);

    // Create Admin user
    const { data: adminUser, error: adminError } = await supabaseAdmin.auth.admin.createUser({
      email: 'admin@sekolah.com',
      password: 'Admin123!',
      email_confirm: true,
      user_metadata: {
        full_name: 'Administrator Sekolah'
      }
    });

    if (adminError) throw adminError;

    // Assign admin role with school_id
    const { error: adminRoleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: adminUser.user.id,
        role: 'admin',
        school_id: schoolId
      });

    if (adminRoleError) throw adminRoleError;

    // Create Teacher user
    const { data: teacherUser, error: teacherError } = await supabaseAdmin.auth.admin.createUser({
      email: 'guru@sekolah.com',
      password: 'Guru123!',
      email_confirm: true,
      user_metadata: {
        full_name: 'Guru Matematika'
      }
    });

    if (teacherError) throw teacherError;

    // Assign teacher role with school_id
    const { error: teacherRoleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: teacherUser.user.id,
        role: 'teacher',
        school_id: schoolId
      });

    if (teacherRoleError) throw teacherRoleError;

    // Create teacher profile in teachers table with school_id
    const { error: teacherProfileError } = await supabaseAdmin
      .from('teachers')
      .insert({
        user_id: teacherUser.user.id,
        subject: 'Matematika',
        nip: '198501012010011001',
        is_homeroom_teacher: false,
        school_id: schoolId
      });

    if (teacherProfileError) throw teacherProfileError;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Demo users created successfully',
        users: {
          admin: {
            email: 'admin@sekolah.com',
            id: adminUser.user.id
          },
          teacher: {
            email: 'guru@sekolah.com',
            id: teacherUser.user.id
          }
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: error
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    );
  }
});
