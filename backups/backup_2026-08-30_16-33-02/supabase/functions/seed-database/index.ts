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

    const results: Record<string, any> = {};

    // ===== 1. Create Super Admin User =====
    const superAdminEmail = 'superadmin@sekolah.com';
    const superAdminPassword = 'SuperAdmin123!';
    
    let superAdminId: string;
    
    // Check if user exists
    const { data: existingUsers } = await supabaseClient.auth.admin.listUsers();
    const existingSuperAdmin = existingUsers?.users?.find(u => u.email === superAdminEmail);
    
    if (existingSuperAdmin) {
      superAdminId = existingSuperAdmin.id;
      results.super_admin = { status: 'already_exists', id: superAdminId };
    } else {
      const { data: saUser, error: saError } = await supabaseClient.auth.admin.createUser({
        email: superAdminEmail,
        password: superAdminPassword,
        email_confirm: true,
        user_metadata: { full_name: 'Super Administrator' },
      });
      if (saError) throw new Error('Failed to create super admin: ' + saError.message);
      superAdminId = saUser.user.id;
      results.super_admin = { status: 'created', id: superAdminId };
    }

    // Upsert super admin profile
    await supabaseClient.from('profiles').upsert({
      id: superAdminId,
      email: superAdminEmail,
      full_name: 'Super Administrator',
    }, { onConflict: 'id' });

    // Upsert super admin role (no school_id)
    const { data: existingRole } = await supabaseClient
      .from('user_roles')
      .select('id')
      .eq('user_id', superAdminId)
      .maybeSingle();
    
    if (!existingRole) {
      await supabaseClient.from('user_roles').insert({
        user_id: superAdminId,
        role: 'super_admin',
      });
    }

    // ===== 2. Create School =====
    const schoolId = '11111111-1111-1111-1111-111111111111';
    await supabaseClient.from('schools').upsert({
      id: schoolId,
      name: 'SMP Negeri 1 Contoh',
      npsn: '20100001',
      address: 'Jl. Pendidikan No. 1, Kota Contoh, Jawa Barat',
      phone: '022-1234567',
      email: 'smpn1contoh@sekolah.id',
      approval_status: 'approved',
      is_active: true,
    }, { onConflict: 'id' });
    results.school = { status: 'created' };

    // ===== 3. Create Admin User =====
    const adminEmail = 'admin@sekolah.com';
    const adminPassword = 'Admin123!';
    let adminId: string;
    
    const existingAdmin = existingUsers?.users?.find(u => u.email === adminEmail);
    if (existingAdmin) {
      adminId = existingAdmin.id;
    } else {
      const { data: adUser, error: adError } = await supabaseClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { full_name: 'Administrator Sekolah' },
      });
      if (adError) throw new Error('Failed to create admin: ' + adError.message);
      adminId = adUser.user.id;
    }

    await supabaseClient.from('profiles').upsert({
      id: adminId, email: adminEmail, full_name: 'Administrator Sekolah',
    }, { onConflict: 'id' });

    const { data: adminRole } = await supabaseClient.from('user_roles')
      .select('id').eq('user_id', adminId).maybeSingle();
    if (!adminRole) {
      await supabaseClient.from('user_roles').insert({
        user_id: adminId, role: 'admin', school_id: schoolId,
      });
    }
    results.admin = { status: 'created', id: adminId };

    // ===== 4. Create Teacher Users =====
    const teacherData = [
      { email: 'guru.matematika@sekolah.com', name: 'Budi Santoso, S.Pd.', subject: 'Matematika', nip: '198501012010011001' },
      { email: 'guru.bindo@sekolah.com', name: 'Siti Rahayu, S.Pd.', subject: 'Bahasa Indonesia', nip: '198602022011012002' },
      { email: 'guru.ipa@sekolah.com', name: 'Ahmad Fauzi, S.Si.', subject: 'IPA', nip: '198703032012011003' },
      { email: 'guru.ips@sekolah.com', name: 'Dewi Lestari, S.Pd.', subject: 'IPS', nip: '198804042013012004' },
      { email: 'guru.bing@sekolah.com', name: 'Rina Wati, S.Pd.', subject: 'Bahasa Inggris', nip: '198905052014012005' },
    ];

    const teacherIds: string[] = [];
    for (const t of teacherData) {
      const existing = existingUsers?.users?.find(u => u.email === t.email);
      let tid: string;
      if (existing) {
        tid = existing.id;
      } else {
        const { data: tUser, error: tError } = await supabaseClient.auth.admin.createUser({
          email: t.email, password: 'Guru123!', email_confirm: true,
          user_metadata: { full_name: t.name },
        });
        if (tError) { console.error('Teacher create error:', tError); continue; }
        tid = tUser.user.id;
      }
      teacherIds.push(tid);

      await supabaseClient.from('profiles').upsert({
        id: tid, email: t.email, full_name: t.name,
      }, { onConflict: 'id' });

      const { data: tRole } = await supabaseClient.from('user_roles')
        .select('id').eq('user_id', tid).maybeSingle();
      if (!tRole) {
        await supabaseClient.from('user_roles').insert({
          user_id: tid, role: 'teacher', school_id: schoolId,
        });
      }

      await supabaseClient.from('teachers').upsert({
        user_id: tid, subject: t.subject, nip: t.nip,
        is_homeroom_teacher: true, school_id: schoolId,
      }, { onConflict: 'user_id' });
    }
    results.teachers = { count: teacherIds.length };

    // Get teacher record IDs
    const { data: teacherRecords } = await supabaseClient
      .from('teachers').select('id, user_id, subject').eq('school_id', schoolId);
    const teacherMap = new Map(teacherRecords?.map(t => [t.user_id, t]) || []);

    // ===== 5. Create Bendahara User =====
    const bendaharaEmail = 'bendahara@sekolah.com';
    let bendaharaId: string;
    const existingBendahara = existingUsers?.users?.find(u => u.email === bendaharaEmail);
    if (existingBendahara) {
      bendaharaId = existingBendahara.id;
    } else {
      const { data: bUser } = await supabaseClient.auth.admin.createUser({
        email: bendaharaEmail, password: 'Bendahara123!', email_confirm: true,
        user_metadata: { full_name: 'Sri Mulyani, S.E.' },
      });
      bendaharaId = bUser!.user.id;
    }
    await supabaseClient.from('profiles').upsert({
      id: bendaharaId, email: bendaharaEmail, full_name: 'Sri Mulyani, S.E.',
    }, { onConflict: 'id' });
    const { data: bRole } = await supabaseClient.from('user_roles')
      .select('id').eq('user_id', bendaharaId).maybeSingle();
    if (!bRole) {
      await supabaseClient.from('user_roles').insert({
        user_id: bendaharaId, role: 'bendahara', school_id: schoolId,
      });
    }

    // ===== 6. Create Tata Usaha User =====
    const tuEmail = 'tatausaha@sekolah.com';
    let tuId: string;
    const existingTU = existingUsers?.users?.find(u => u.email === tuEmail);
    if (existingTU) {
      tuId = existingTU.id;
    } else {
      const { data: tuUser } = await supabaseClient.auth.admin.createUser({
        email: tuEmail, password: 'TataUsaha123!', email_confirm: true,
        user_metadata: { full_name: 'Joko Widodo' },
      });
      tuId = tuUser!.user.id;
    }
    await supabaseClient.from('profiles').upsert({
      id: tuId, email: tuEmail, full_name: 'Joko Widodo',
    }, { onConflict: 'id' });
    const { data: tuRole } = await supabaseClient.from('user_roles')
      .select('id').eq('user_id', tuId).maybeSingle();
    if (!tuRole) {
      await supabaseClient.from('user_roles').insert({
        user_id: tuId, role: 'tata_usaha', school_id: schoolId,
      });
    }

    // ===== 7. Academic Year =====
    const academicYearId = '22222222-2222-2222-2222-222222222222';
    await supabaseClient.from('academic_years').upsert({
      id: academicYearId, year: '2025/2026', is_active: true, school_id: schoolId,
    }, { onConflict: 'id' });

    // ===== 8. School Settings =====
    await supabaseClient.from('school_settings').upsert({
      id: '33333333-3333-3333-3333-333333333333',
      school_name: 'SMP Negeri 1 Contoh',
      headmaster_name: 'Dr. H. Suparman, M.Pd.',
      headmaster_nip: '197001011995011001',
      school_address: 'Jl. Pendidikan No. 1, Kota Contoh',
      school_phone: '022-1234567',
      district_name: 'DINAS PENDIDIKAN KOTA CONTOH',
      academic_year: '2025/2026',
      active_semester: 2,
      app_name: 'Sistem Manajemen Sekolah',
      bendahara_name: 'Sri Mulyani, S.E.',
      bendahara_nip: '198001012005012001',
      school_id: schoolId,
      enable_student_status_check: true,
      enable_graduation_check: true,
      enable_complaint_channel: true,
      show_address: true,
      show_phone: true,
    }, { onConflict: 'id' });

    // ===== 9. Classes =====
    const classData = [
      { id: 'c1111111-0001-0001-0001-000000000001', name: 'VII A', grade: 7, teacher_idx: 0 },
      { id: 'c1111111-0001-0001-0001-000000000002', name: 'VII B', grade: 7, teacher_idx: 1 },
      { id: 'c1111111-0001-0001-0001-000000000003', name: 'VIII A', grade: 8, teacher_idx: 2 },
      { id: 'c1111111-0001-0001-0001-000000000004', name: 'VIII B', grade: 8, teacher_idx: 3 },
      { id: 'c1111111-0001-0001-0001-000000000005', name: 'IX A', grade: 9, teacher_idx: 4 },
    ];

    for (const c of classData) {
      const teacherRecord = teacherRecords?.[c.teacher_idx];
      await supabaseClient.from('classes').upsert({
        id: c.id, name: c.name, grade: c.grade, academic_year: '2025/2026',
        homeroom_teacher_id: teacherRecord?.id || null, school_id: schoolId,
      }, { onConflict: 'id' });
    }
    results.classes = { count: classData.length };

    // ===== 10. Students =====
    const studentNames = [
      { name: 'Ahmad Rizki Pratama', gender: 'L', nisn: '0051234001', parent: 'Sugeng Pratama' },
      { name: 'Putri Ayu Lestari', gender: 'P', nisn: '0051234002', parent: 'Bambang Lestari' },
      { name: 'Muhammad Farhan', gender: 'L', nisn: '0051234003', parent: 'Hendra Farhan' },
      { name: 'Siti Nurhaliza', gender: 'P', nisn: '0051234004', parent: 'Abdul Halim' },
      { name: 'Dimas Arya Putra', gender: 'L', nisn: '0051234005', parent: 'Wahyu Putra' },
      { name: 'Anisa Fitri', gender: 'P', nisn: '0051234006', parent: 'Ridwan Fitri' },
      { name: 'Rafi Hidayat', gender: 'L', nisn: '0051234007', parent: 'Tono Hidayat' },
      { name: 'Dewi Safitri', gender: 'P', nisn: '0051234008', parent: 'Agus Safitri' },
      { name: 'Fajar Ramadhan', gender: 'L', nisn: '0051234009', parent: 'Ujang Ramadhan' },
      { name: 'Nisa Amelia', gender: 'P', nisn: '0051234010', parent: 'Dedi Amelia' },
      { name: 'Yoga Aditya', gender: 'L', nisn: '0051234011', parent: 'Slamet Aditya' },
      { name: 'Rani Oktaviani', gender: 'P', nisn: '0051234012', parent: 'Jajang Oktaviani' },
      { name: 'Bayu Setiawan', gender: 'L', nisn: '0051234013', parent: 'Eko Setiawan' },
      { name: 'Lina Marlina', gender: 'P', nisn: '0051234014', parent: 'Udin Marlina' },
      { name: 'Andi Prasetyo', gender: 'L', nisn: '0051234015', parent: 'Budi Prasetyo' },
      { name: 'Maya Sari', gender: 'P', nisn: '0051234016', parent: 'Asep Sari' },
      { name: 'Rizky Maulana', gender: 'L', nisn: '0051234017', parent: 'Cecep Maulana' },
      { name: 'Indah Permata', gender: 'P', nisn: '0051234018', parent: 'Dadang Permata' },
      { name: 'Galih Pratama', gender: 'L', nisn: '0051234019', parent: 'Edi Pratama' },
      { name: 'Wulan Dari', gender: 'P', nisn: '0051234020', parent: 'Firman Dari' },
      // Alumni
      { name: 'Rahmat Hidayatullah', gender: 'L', nisn: '0051234021', parent: 'Gani Hidayatullah', alumni: true },
      { name: 'Sinta Dewi', gender: 'P', nisn: '0051234022', parent: 'Hasan Dewi', alumni: true },
    ];

    const studentIds: string[] = [];
    for (let i = 0; i < studentNames.length; i++) {
      const s = studentNames[i];
      const sid = `s1111111-0001-0001-0001-${String(i + 1).padStart(12, '0')}`;
      const classIdx = s.alumni ? null : (i % 5);
      const classId = classIdx !== null ? classData[classIdx].id : null;

      await supabaseClient.from('students').upsert({
        id: sid,
        full_name: s.name,
        nis: `2025${String(i + 1).padStart(4, '0')}`,
        nisn: s.nisn,
        gender: s.gender,
        birth_place: 'Kota Contoh',
        birth_date: `200${8 + Math.floor(i / 7)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        class_id: classId,
        parent_name: s.parent,
        parent_phone: `0812${String(34560001 + i)}`,
        address: `Jl. Contoh No. ${i + 1}, RT 0${(i % 5) + 1}/RW 0${(i % 3) + 1}`,
        school_id: schoolId,
        is_alumni: s.alumni || false,
        graduation_date: s.alumni ? '2025-06-15' : null,
      }, { onConflict: 'id' });
      studentIds.push(sid);
    }
    results.students = { count: studentNames.length };

    // ===== 11. Schedules =====
    const subjects = ['Matematika', 'Bahasa Indonesia', 'IPA', 'IPS', 'Bahasa Inggris'];
    const scheduleIds: string[] = [];
    let schedIdx = 0;
    for (let ci = 0; ci < classData.length; ci++) {
      for (let day = 1; day <= 5; day++) {
        const subjectIdx = (ci + day) % 5;
        const teacherRecord = teacherRecords?.[subjectIdx];
        if (!teacherRecord) continue;
        const sid = `d1111111-0001-0001-0001-${String(++schedIdx).padStart(12, '0')}`;
        await supabaseClient.from('schedules').upsert({
          id: sid,
          class_id: classData[ci].id,
          teacher_id: teacherRecord.id,
          subject: subjects[subjectIdx],
          day_of_week: day,
          start_time: `0${7 + ci}:00`,
          end_time: `0${7 + ci}:45`,
          academic_year: '2025/2026',
          semester: 2,
          school_id: schoolId,
        }, { onConflict: 'id' });
        scheduleIds.push(sid);
      }
    }
    results.schedules = { count: scheduleIds.length };

    // ===== 12. Attendance (last 5 days) =====
    const today = new Date();
    let attCount = 0;
    const statuses = ['hadir', 'hadir', 'hadir', 'hadir', 'hadir', 'hadir', 'izin', 'sakit', 'alpa', 'hadir'];
    for (let d = 1; d <= 5; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      const dateStr = date.toISOString().split('T')[0];

      // Use first schedule for each class
      for (let ci = 0; ci < classData.length; ci++) {
        const schedId = scheduleIds[ci * 5]; // first schedule per class
        if (!schedId) continue;
        // students in this class
        const classStudents = studentNames
          .map((s, idx) => ({ ...s, idx, sid: studentIds[idx] }))
          .filter(s => !s.alumni && s.idx % 5 === ci);

        for (const st of classStudents) {
          const status = statuses[(st.idx + d) % statuses.length];
          await supabaseClient.from('attendance').upsert({
            id: `a${String(attCount++).padStart(7, '0')}-att-0001-0001-000000000001`,
            student_id: st.sid,
            schedule_id: schedId,
            date: dateStr,
            status,
            created_by: adminId,
            school_id: schoolId,
          }, { onConflict: 'id' });
        }
      }
    }
    results.attendance = { count: attCount };

    // ===== 13. Violation Types =====
    const violationTypes = [
      { id: 'v1111111-0001-0001-0001-000000000001', name: 'Terlambat', category: 'ringan', points: 5, desc: 'Terlambat masuk sekolah' },
      { id: 'v1111111-0001-0001-0001-000000000002', name: 'Tidak memakai seragam', category: 'sedang', points: 10, desc: 'Tidak memakai seragam lengkap' },
      { id: 'v1111111-0001-0001-0001-000000000003', name: 'Berkelahi', category: 'berat', points: 25, desc: 'Berkelahi di lingkungan sekolah' },
      { id: 'v1111111-0001-0001-0001-000000000004', name: 'Bolos', category: 'sedang', points: 15, desc: 'Bolos tanpa keterangan' },
      { id: 'v1111111-0001-0001-0001-000000000005', name: 'Rambut panjang', category: 'ringan', points: 5, desc: 'Rambut melebihi batas ketentuan' },
    ];
    for (const v of violationTypes) {
      await supabaseClient.from('violation_types').upsert({
        id: v.id, name: v.name, category: v.category, points: v.points,
        description: v.desc, school_id: schoolId, is_active: true,
      }, { onConflict: 'id' });
    }

    // ===== 14. Student Violations =====
    await supabaseClient.from('student_violations').upsert([
      { id: 'sv111111-0001-0001-0001-000000000001', student_id: studentIds[0], violation_type_id: violationTypes[0].id, points: 5, reported_by: adminId, school_id: schoolId, violation_date: today.toISOString().split('T')[0] },
      { id: 'sv111111-0001-0001-0001-000000000002', student_id: studentIds[2], violation_type_id: violationTypes[1].id, points: 10, reported_by: adminId, school_id: schoolId, violation_date: today.toISOString().split('T')[0] },
      { id: 'sv111111-0001-0001-0001-000000000003', student_id: studentIds[4], violation_type_id: violationTypes[3].id, points: 15, reported_by: adminId, school_id: schoolId, violation_date: today.toISOString().split('T')[0] },
    ], { onConflict: 'id' });
    results.violations = { count: 3 };

    // ===== 15. Grades =====
    let gradeCount = 0;
    for (let ci = 0; ci < classData.length; ci++) {
      const schedId = scheduleIds[ci * 5];
      if (!schedId) continue;
      const classStudents = studentNames
        .map((s, idx) => ({ ...s, idx, sid: studentIds[idx] }))
        .filter(s => !s.alumni && s.idx % 5 === ci);

      for (const st of classStudents) {
        await supabaseClient.from('grades').upsert({
          id: `g${String(gradeCount++).padStart(7, '0')}-grd-0001-0001-000000000001`,
          student_id: st.sid,
          schedule_id: schedId,
          uts: 70 + Math.floor(Math.random() * 25),
          uas: 65 + Math.floor(Math.random() * 30),
          tugas: 75 + Math.floor(Math.random() * 20),
          kuis: 60 + Math.floor(Math.random() * 35),
          praktik: 70 + Math.floor(Math.random() * 25),
          created_by: adminId,
          school_id: schoolId,
        }, { onConflict: 'id' });
      }
    }
    results.grades = { count: gradeCount };

    // ===== 16. Announcements =====
    await supabaseClient.from('announcements').upsert([
      { id: 'an111111-0001-0001-0001-000000000001', title: 'Pengumuman UTS Semester 2', content: 'UTS Semester 2 akan dilaksanakan tanggal 10-15 Maret 2026. Siswa diharapkan mempersiapkan diri dengan baik.', created_by: adminId, school_id: schoolId, is_active: true },
      { id: 'an111111-0001-0001-0001-000000000002', title: 'Libur Hari Raya Nyepi', content: 'Sekolah libur pada tanggal 19 Maret 2026 dalam rangka Hari Raya Nyepi.', created_by: adminId, school_id: schoolId, is_active: true },
    ], { onConflict: 'id' });
    results.announcements = { count: 2 };

    // ===== 17. Tax Types =====
    await supabaseClient.from('tax_types').upsert([
      { id: 'tt111111-0001-0001-0001-000000000001', code: 'PPH21', name: 'PPh Pasal 21', rate: 5, description: 'Pajak penghasilan atas honorarium', school_id: schoolId, is_active: true },
      { id: 'tt111111-0001-0001-0001-000000000002', code: 'PPH23', name: 'PPh Pasal 23', rate: 2, description: 'Pajak atas jasa', school_id: schoolId, is_active: true },
      { id: 'tt111111-0001-0001-0001-000000000003', code: 'PPN', name: 'PPN', rate: 11, description: 'Pajak pertambahan nilai', school_id: schoolId, is_active: true },
    ], { onConflict: 'id' });

    // ===== 18. Attendance Day Settings =====
    const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    for (let i = 0; i < 7; i++) {
      await supabaseClient.from('attendance_day_settings').upsert({
        id: `ds111111-0001-0001-0001-00000000000${i + 1}`,
        day_of_week: i + 1,
        day_name: dayNames[i],
        is_active: i < 5, // Mon-Fri active
        school_id: schoolId,
        updated_by: adminId,
      }, { onConflict: 'id' });
    }

    // ===== 19. Subscription Plans =====
    await supabaseClient.from('subscription_plans').upsert([
      { id: 'sp111111-0001-0001-0001-000000000001', plan_key: 'free', label: 'Gratis', description: 'Paket gratis untuk sekolah kecil', monthly_price: 0, max_students: 50, max_teachers: 5, duration_months: 12, features: ['Absensi', 'Jadwal', 'Nilai'], sort_order: 1, is_active: true },
      { id: 'sp111111-0001-0001-0001-000000000002', plan_key: 'basic', label: 'Basic', description: 'Paket dasar untuk sekolah menengah', monthly_price: 100000, max_students: 200, max_teachers: 20, duration_months: 12, features: ['Absensi', 'Jadwal', 'Nilai', 'Surat', 'Keuangan'], sort_order: 2, is_active: true },
      { id: 'sp111111-0001-0001-0001-000000000003', plan_key: 'premium', label: 'Premium', description: 'Paket premium lengkap', monthly_price: 250000, max_students: 1000, max_teachers: 100, duration_months: 12, features: ['Semua Fitur', 'Prioritas Support', 'Custom Branding'], sort_order: 3, is_active: true },
    ], { onConflict: 'id' });

    // ===== 20. School Subscription =====
    await supabaseClient.from('school_subscriptions').upsert({
      id: 'ss111111-0001-0001-0001-000000000001',
      school_id: schoolId,
      plan_name: 'Premium',
      status: 'active',
      start_date: '2025-01-01',
      end_date: '2026-12-31',
      max_students: 1000,
      max_teachers: 100,
    }, { onConflict: 'id' });

    // ===== 21. App Version =====
    await supabaseClient.from('app_versions').upsert({
      id: 'av111111-0001-0001-0001-000000000001',
      version: '3.0.0',
      revision: 'Rilis Awal VPS',
      is_current: true,
      release_date: new Date().toISOString(),
    }, { onConflict: 'id' });

    // ===== 22. Extracurricular Types =====
    await supabaseClient.from('extracurricular_types').upsert([
      { id: 'et111111-0001-0001-0001-000000000001', name: 'Pramuka', description: 'Kegiatan kepramukaan', school_id: schoolId, is_active: true },
      { id: 'et111111-0001-0001-0001-000000000002', name: 'Futsal', description: 'Olahraga futsal', school_id: schoolId, is_active: true },
      { id: 'et111111-0001-0001-0001-000000000003', name: 'Seni Tari', description: 'Seni tari tradisional', school_id: schoolId, is_active: true },
    ], { onConflict: 'id' });

    // ===== Summary =====
    const accountSummary = [
      { role: 'Super Admin', email: superAdminEmail, password: superAdminPassword },
      { role: 'Admin', email: adminEmail, password: adminPassword },
      { role: 'Guru (5 akun)', email: 'guru.matematika@sekolah.com', password: 'Guru123!' },
      { role: 'Bendahara', email: bendaharaEmail, password: 'Bendahara123!' },
      { role: 'Tata Usaha', email: tuEmail, password: 'TataUsaha123!' },
    ];

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Database dummy berhasil dibuat!',
        accounts: accountSummary,
        results,
        school: { id: schoolId, name: 'SMP Negeri 1 Contoh' },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error seeding database:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
