import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to verify admin authentication
async function verifyAdminAuth(req: Request, supabaseClient: any): Promise<{ user: any; error: string | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { user: null, error: 'No authorization header provided' };
  }

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
  
  if (error || !user) {
    return { user: null, error: 'Invalid or expired token' };
  }

  // Check if user has admin role
  const { data: roleData, error: roleError } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleError || roleData?.role !== 'admin') {
    return { user: null, error: 'Admin access required' };
  }

  return { user, error: null };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
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
    const { user, error: authError } = await verifyAdminAuth(req, supabaseClient);
    if (authError) {
      console.log('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: authError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Setup sample data initiated by admin:', user.email);

    // Check if teacher user exists
    const { data: existingUser } = await supabaseClient.auth.admin.listUsers();
    const teacherUser = existingUser?.users?.find(u => u.email === 'guru@sekolah.com');
    
    let teacherId: string;
    let teacherUserId: string;

    if (teacherUser) {
      // User exists, check if teacher profile exists
      const { data: existingTeacher } = await supabaseClient
        .from('teachers')
        .select('id')
        .eq('user_id', teacherUser.id)
        .single();

      if (existingTeacher) {
        teacherId = existingTeacher.id;
      } else {
        // Create teacher profile and role for existing user
        const { error: roleError } = await supabaseClient
          .from('user_roles')
          .upsert({
            user_id: teacherUser.id,
            role: 'teacher'
          });

        if (roleError) throw roleError;

        const { data: teacherProfile, error: teacherProfileError } = await supabaseClient
          .from('teachers')
          .insert({
            user_id: teacherUser.id,
            subject: 'Matematika',
            nip: '198501012010011001',
            is_homeroom_teacher: true
          })
          .select('id')
          .single();

        if (teacherProfileError) throw teacherProfileError;
        teacherId = teacherProfile.id;
      }
    } else {
      // Create new teacher user
      const { data: newTeacherUser, error: teacherError } = await supabaseClient.auth.admin.createUser({
        email: 'guru@sekolah.com',
        password: 'Guru123!',
        email_confirm: true,
        user_metadata: { full_name: 'Guru Matematika' }
      });

      if (teacherError) throw teacherError;
      if (!newTeacherUser.user) throw new Error('Failed to create teacher user');

      teacherUserId = newTeacherUser.user.id;

      // Assign teacher role
      const { error: roleError } = await supabaseClient
        .from('user_roles')
        .insert({
          user_id: teacherUserId,
          role: 'teacher'
        });

      if (roleError) throw roleError;

      // Create teacher profile
      const { data: teacherProfile, error: teacherProfileError } = await supabaseClient
        .from('teachers')
        .insert({
          user_id: teacherUserId,
          subject: 'Matematika',
          nip: '198501012010011001',
          is_homeroom_teacher: true
        })
        .select('id')
        .single();

      if (teacherProfileError) throw teacherProfileError;
      teacherId = teacherProfile.id;
    }

    // Delete existing sample data first
    await supabaseClient.from('attendance').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseClient.from('teaching_journals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseClient.from('schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseClient.from('students').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabaseClient.from('classes').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert sample classes
    const { data: classes, error: classesError } = await supabaseClient
      .from('classes')
      .insert([
        { name: 'VII A', grade: 7, academic_year: '2024/2025', homeroom_teacher_id: teacherId },
        { name: 'VII B', grade: 7, academic_year: '2024/2025', homeroom_teacher_id: null },
        { name: 'VIII A', grade: 8, academic_year: '2024/2025', homeroom_teacher_id: null },
        { name: 'VIII B', grade: 8, academic_year: '2024/2025', homeroom_teacher_id: null },
        { name: 'IX A', grade: 9, academic_year: '2024/2025', homeroom_teacher_id: null }
      ])
      .select('id, name');

    if (classesError) throw classesError;

    const class7A = classes?.find(c => c.name === 'VII A')?.id;
    const class7B = classes?.find(c => c.name === 'VII B')?.id;
    const class8A = classes?.find(c => c.name === 'VIII A')?.id;
    const class8B = classes?.find(c => c.name === 'VIII B')?.id;
    const class9A = classes?.find(c => c.name === 'IX A')?.id;

    // Insert sample students
    const { error: studentsError } = await supabaseClient
      .from('students')
      .insert([
        { nis: '2024001', nisn: '0123456789', full_name: 'Ahmad Rizki Pratama', gender: 'L', birth_place: 'Jakarta', birth_date: '2010-01-15', address: 'Jl. Merdeka No. 10, Jakarta', parent_name: 'Budi Pratama', parent_phone: '081234567890', class_id: class7A },
        { nis: '2024002', nisn: '0123456790', full_name: 'Siti Nurhaliza', gender: 'P', birth_place: 'Bandung', birth_date: '2010-02-20', address: 'Jl. Asia Afrika No. 25, Bandung', parent_name: 'Ahmad Nurdin', parent_phone: '081234567891', class_id: class7A },
        { nis: '2024003', nisn: '0123456791', full_name: 'Budi Santoso', gender: 'L', birth_place: 'Surabaya', birth_date: '2010-03-10', address: 'Jl. Pemuda No. 5, Surabaya', parent_name: 'Santoso Wijaya', parent_phone: '081234567892', class_id: class7A },
        { nis: '2024004', nisn: '0123456792', full_name: 'Dewi Lestari', gender: 'P', birth_place: 'Yogyakarta', birth_date: '2010-04-05', address: 'Jl. Malioboro No. 15, Yogyakarta', parent_name: 'Lestari Utomo', parent_phone: '081234567893', class_id: class7B },
        { nis: '2024005', nisn: '0123456793', full_name: 'Eko Prasetyo', gender: 'L', birth_place: 'Semarang', birth_date: '2010-05-12', address: 'Jl. Pandanaran No. 20, Semarang', parent_name: 'Prasetyo Hadi', parent_phone: '081234567894', class_id: class7B },
        { nis: '2023001', nisn: '0123456794', full_name: 'Fitria Rahmawati', gender: 'P', birth_place: 'Malang', birth_date: '2009-06-18', address: 'Jl. Ijen No. 8, Malang', parent_name: 'Rahman Wijaya', parent_phone: '081234567895', class_id: class8A },
        { nis: '2023002', nisn: '0123456795', full_name: 'Gilang Ramadhan', gender: 'L', birth_place: 'Surabaya', birth_date: '2009-07-22', address: 'Jl. Pahlawan No. 12, Surabaya', parent_name: 'Ramadhan Saputra', parent_phone: '081234567896', class_id: class8A },
        { nis: '2023003', nisn: '0123456796', full_name: 'Hana Safitri', gender: 'P', birth_place: 'Jakarta', birth_date: '2009-08-30', address: 'Jl. Sudirman No. 30, Jakarta', parent_name: 'Safitri Kusuma', parent_phone: '081234567897', class_id: class8B },
        { nis: '2022001', nisn: '0123456797', full_name: 'Indra Gunawan', gender: 'L', birth_place: 'Bandung', birth_date: '2008-09-14', address: 'Jl. Braga No. 18, Bandung', parent_name: 'Gunawan Santoso', parent_phone: '081234567898', class_id: class9A },
        { nis: '2022002', nisn: '0123456798', full_name: 'Jasmine Putri', gender: 'P', birth_place: 'Jakarta', birth_date: '2008-10-25', address: 'Jl. Gatot Subroto No. 40, Jakarta', parent_name: 'Putri Maharani', parent_phone: '081234567899', class_id: class9A }
      ]);

    if (studentsError) throw studentsError;

    // Insert sample schedules
    const { data: schedules, error: schedulesError } = await supabaseClient
      .from('schedules')
      .insert([
        { day_of_week: 1, start_time: '07:00', end_time: '08:30', subject: 'Matematika', class_id: class7A, teacher_id: teacherId, academic_year: '2024/2025', semester: 1 },
        { day_of_week: 1, start_time: '08:30', end_time: '10:00', subject: 'Bahasa Indonesia', class_id: class7A, teacher_id: teacherId, academic_year: '2024/2025', semester: 1 },
        { day_of_week: 1, start_time: '10:15', end_time: '11:45', subject: 'IPA', class_id: class7B, teacher_id: teacherId, academic_year: '2024/2025', semester: 1 },
        { day_of_week: 2, start_time: '07:00', end_time: '08:30', subject: 'IPS', class_id: class8A, teacher_id: teacherId, academic_year: '2024/2025', semester: 1 },
        { day_of_week: 2, start_time: '08:30', end_time: '10:00', subject: 'Matematika', class_id: class8A, teacher_id: teacherId, academic_year: '2024/2025', semester: 1 },
        { day_of_week: 3, start_time: '07:00', end_time: '08:30', subject: 'Bahasa Inggris', class_id: class9A, teacher_id: teacherId, academic_year: '2024/2025', semester: 1 },
        { day_of_week: 3, start_time: '08:30', end_time: '10:00', subject: 'Matematika', class_id: class9A, teacher_id: teacherId, academic_year: '2024/2025', semester: 1 }
      ])
      .select('id');

    if (schedulesError) throw schedulesError;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Sample data created successfully',
        data: {
          teacherId,
          classesCount: classes?.length || 0,
          schedulesCount: schedules?.length || 0
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage, error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
