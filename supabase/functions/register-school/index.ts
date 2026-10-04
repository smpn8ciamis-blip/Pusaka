import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { school, admin } = await req.json();

    if (!school?.name || !admin?.email || !admin?.password || !admin?.fullName) {
      return new Response(
        JSON.stringify({ error: 'Data sekolah dan admin wajib diisi' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Create school with pending approval status
    const { data: schoolData, error: schoolError } = await supabaseClient
      .from('schools')
      .insert({
        name: school.name,
        address: school.address,
        phone: school.phone,
        email: school.email,
        npsn: school.npsn,
        approval_status: 'pending',
        selected_plan_key: school.selected_plan_key || null,
      })
      .select()
      .single();

    if (schoolError) throw schoolError;

    // 2. Create admin user
    const { data: userData, error: userError } = await supabaseClient.auth.admin.createUser({
      email: admin.email,
      password: admin.password,
      email_confirm: true,
      user_metadata: { full_name: admin.fullName },
    });

    if (userError) {
      await supabaseClient.from('schools').delete().eq('id', schoolData.id);
      throw userError;
    }

    // 3. Create profile
    await supabaseClient.from('profiles').insert({
      id: userData.user.id,
      email: admin.email,
      full_name: admin.fullName,
    });

    // 4. Assign admin role with school_id
    await supabaseClient.from('user_roles').insert({
      user_id: userData.user.id,
      role: 'admin',
      school_id: schoolData.id,
    });

    // 5. Create default school_settings
    await supabaseClient.from('school_settings').insert({
      school_name: school.name,
      school_address: school.address || '',
      school_phone: school.phone || '',
      headmaster_name: '',
      headmaster_nip: '',
      school_id: schoolData.id,
    });

    return new Response(
      JSON.stringify({ success: true, school_id: schoolData.id, status: 'pending' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error registering school:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
