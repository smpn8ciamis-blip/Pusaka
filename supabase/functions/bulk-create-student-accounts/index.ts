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

  // Verify caller is admin
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role, school_id')
    .eq('user_id', user.id)
    .in('role', ['admin', 'super_admin'])
    .limit(1)
    .single();

  if (!roleData) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const schoolId = roleData.school_id;

  try {
    const { studentIds, emailDomain } = await req.json();

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      throw new Error('studentIds array is required');
    }

    const domain = emailDomain || 'siswa.sekolah.id';

    // Fetch students in chunks of 100 to avoid query limits
    const allStudents: any[] = [];
    for (let i = 0; i < studentIds.length; i += 100) {
      const chunk = studentIds.slice(i, i + 100);
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, full_name, nis, nisn')
        .in('id', chunk);
      if (studentsError) throw studentsError;
      if (students) allStudents.push(...students);
    }

    // Get existing student accounts in chunks
    const existingSet = new Set<string>();
    for (let i = 0; i < studentIds.length; i += 100) {
      const chunk = studentIds.slice(i, i + 100);
      const { data: existingAccounts } = await supabase
        .from('student_accounts')
        .select('student_id')
        .in('student_id', chunk);
      existingAccounts?.forEach(a => existingSet.add(a.student_id));
    }

    const results: { studentName: string; email: string; status: string; error?: string }[] = [];

    // Process in batches of 5 concurrently
    const BATCH_SIZE = 5;
    const studentsToProcess = allStudents.filter(s => !existingSet.has(s.id));
    
    // Add skipped results
    for (const student of allStudents) {
      if (existingSet.has(student.id)) {
        results.push({
          studentName: student.full_name,
          email: '',
          status: 'skipped',
          error: 'Sudah memiliki akun'
        });
      }
    }

    for (let i = 0; i < studentsToProcess.length; i += BATCH_SIZE) {
      const batch = studentsToProcess.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (student) => {
          const password = student.nisn || student.nis;
          if (!password || password.length < 6) {
            return {
              studentName: student.full_name,
              email: '',
              status: 'failed',
              error: 'NISN/NIS kosong atau kurang dari 6 karakter'
            };
          }

          const email = `${student.nis}@${domain}`;

          try {
            const { data: authData, error: createError } = await supabase.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { full_name: student.full_name }
            });

            if (createError) throw createError;

            // Insert profile, role, and link in parallel
            await Promise.all([
              supabase.from('profiles').upsert({
                id: authData.user.id,
                email,
                full_name: student.full_name,
              }),
              supabase.from('user_roles').insert({
                user_id: authData.user.id,
                role: 'siswa',
                school_id: schoolId,
              }),
              supabase.from('student_accounts').insert({
                user_id: authData.user.id,
                student_id: student.id,
              }),
            ]);

            return {
              studentName: student.full_name,
              email,
              status: 'success'
            };
          } catch (err: any) {
            return {
              studentName: student.full_name,
              email,
              status: 'failed',
              error: err.message
            };
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            studentName: 'Unknown',
            email: '',
            status: 'failed',
            error: result.reason?.message || 'Unknown error'
          });
        }
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    return new Response(JSON.stringify({
      success: true,
      summary: { total: results.length, success: successCount, failed: failedCount, skipped: skippedCount },
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Bulk create error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
