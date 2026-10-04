import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const email = 'billing@lovabel.com';
    const password = '123456';
    const fullName = 'Billing Manager';

    // Check if user already exists
    const { data: existingUsers } = await supabaseClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    
    if (existingUser) {
      console.log('Billing user already exists:', email);
      
      // Check if role is already assigned
      const { data: existingRole } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', existingUser.id)
        .single();
        
      if (!existingRole) {
        // Get the first school as default
        const { data: firstSchool } = await supabaseClient
          .from('schools')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)
          .single();

        // Assign billing role with school_id
        const { error: roleError } = await supabaseClient
          .from('user_roles')
          .insert({
            user_id: existingUser.id,
            role: 'billing',
            school_id: firstSchool?.id || null
          });
          
        if (roleError) {
          console.error('Error assigning role:', roleError);
        } else {
          console.log('Role assigned to existing user');
        }
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'User already exists',
          user: { id: existingUser.id, email: existingUser.email } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Get the first school as default
    const { data: firstSchool } = await supabaseClient
      .from('schools')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    // Create user with admin API
    console.log('Creating billing user:', email);
    const { data: userData, error: userError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (userError) {
      console.error('Error creating user:', userError);
      throw userError;
    }
    
    if (!userData.user) {
      throw new Error('User creation failed');
    }

    console.log('User created:', userData.user.id);

    // Assign billing role with school_id
    const { error: roleError } = await supabaseClient
      .from('user_roles')
      .insert({
        user_id: userData.user.id,
        role: 'billing',
        school_id: firstSchool?.id || null
      });

    if (roleError) {
      console.error('Error assigning role:', roleError);
      await supabaseClient.auth.admin.deleteUser(userData.user.id);
      throw roleError;
    }

    console.log('Billing user created successfully:', email);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Billing user created successfully',
        user: { 
          id: userData.user.id, 
          email: userData.user.email 
        } 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in setup-billing-user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
