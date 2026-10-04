import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Database, CheckCircle, Download, Users, BookOpen, GraduationCap, Calendar, FileDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const generateSeedSQL = (): string => {
  const schoolId = '11111111-1111-1111-1111-111111111111';
  const academicYearId = '22222222-2222-2222-2222-222222222222';
  const today = new Date().toISOString().split('T')[0];

  const teacherData = [
    { email: 'guru.matematika@sekolah.com', name: 'Budi Santoso, S.Pd.', subject: 'Matematika', nip: '198501012010011001' },
    { email: 'guru.bindo@sekolah.com', name: 'Siti Rahayu, S.Pd.', subject: 'Bahasa Indonesia', nip: '198602022011012002' },
    { email: 'guru.ipa@sekolah.com', name: 'Ahmad Fauzi, S.Si.', subject: 'IPA', nip: '198703032012011003' },
    { email: 'guru.ips@sekolah.com', name: 'Dewi Lestari, S.Pd.', subject: 'IPS', nip: '198804042013012004' },
    { email: 'guru.bing@sekolah.com', name: 'Rina Wati, S.Pd.', subject: 'Bahasa Inggris', nip: '198905052014012005' },
  ];

  const classData = [
    { id: 'c1111111-0001-0001-0001-000000000001', name: 'VII A', grade: 7, teacher_idx: 0 },
    { id: 'c1111111-0001-0001-0001-000000000002', name: 'VII B', grade: 7, teacher_idx: 1 },
    { id: 'c1111111-0001-0001-0001-000000000003', name: 'VIII A', grade: 8, teacher_idx: 2 },
    { id: 'c1111111-0001-0001-0001-000000000004', name: 'VIII B', grade: 8, teacher_idx: 3 },
    { id: 'c1111111-0001-0001-0001-000000000005', name: 'IX A', grade: 9, teacher_idx: 4 },
  ];

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
    { name: 'Rahmat Hidayatullah', gender: 'L', nisn: '0051234021', parent: 'Gani Hidayatullah', alumni: true },
    { name: 'Sinta Dewi', gender: 'P', nisn: '0051234022', parent: 'Hasan Dewi', alumni: true },
  ];

  const violationTypes = [
    { id: 'v1111111-0001-0001-0001-000000000001', name: 'Terlambat', category: 'ringan', points: 5, desc: 'Terlambat masuk sekolah' },
    { id: 'v1111111-0001-0001-0001-000000000002', name: 'Tidak memakai seragam', category: 'sedang', points: 10, desc: 'Tidak memakai seragam lengkap' },
    { id: 'v1111111-0001-0001-0001-000000000003', name: 'Berkelahi', category: 'berat', points: 25, desc: 'Berkelahi di lingkungan sekolah' },
    { id: 'v1111111-0001-0001-0001-000000000004', name: 'Bolos', category: 'sedang', points: 15, desc: 'Bolos tanpa keterangan' },
    { id: 'v1111111-0001-0001-0001-000000000005', name: 'Rambut panjang', category: 'ringan', points: 5, desc: 'Rambut melebihi batas ketentuan' },
  ];

  const e = (s: string) => s.replace(/'/g, "''");

  // Use placeholder UUIDs for user IDs - these will be replaced after auth users are created
  const superAdminId = 'aaaaaaaa-0001-0001-0001-000000000001';
  const adminId = 'aaaaaaaa-0001-0001-0001-000000000002';
  const bendaharaId = 'aaaaaaaa-0001-0001-0001-000000000003';
  const tuId = 'aaaaaaaa-0001-0001-0001-000000000004';
  const teacherIds = teacherData.map((_, i) => `aaaaaaaa-0001-0001-0001-${String(10 + i).padStart(12, '0')}`);
  const teacherRecordIds = teacherData.map((_, i) => `bbbbbbbb-0001-0001-0001-${String(i + 1).padStart(12, '0')}`);

  let sql = `-- =============================================
-- SEED DATABASE - Data Dummy Lengkap
-- Sistem Manajemen Sekolah
-- Generated: ${new Date().toISOString()}
-- =============================================
-- PETUNJUK PENGGUNAAN:
-- 1. Buat auth users terlebih dahulu via Edge Function atau Supabase Dashboard
-- 2. Ganti placeholder UUID di bawah dengan UUID user yang sebenarnya
-- 3. Jalankan SQL ini di database PostgreSQL
-- =============================================

-- Disable triggers sementara untuk menghindari error foreign key
SET session_replication_role = 'replica';

-- =============================================
-- PLACEHOLDER USER IDs - GANTI DENGAN UUID ASLI
-- =============================================
-- Super Admin : ${superAdminId}
-- Admin       : ${adminId}  
-- Bendahara   : ${bendaharaId}
-- Tata Usaha  : ${tuId}
-- Guru 1-5    : ${teacherIds.join(', ')}
-- =============================================

-- ===== AUTH USERS (via psql langsung ke database) =====
-- Buat user auth menggunakan SQL langsung
DO $$
DECLARE
  v_superadmin_id uuid := '${superAdminId}';
  v_admin_id uuid := '${adminId}';
  v_bendahara_id uuid := '${bendaharaId}';
  v_tu_id uuid := '${tuId}';
BEGIN
  -- Super Admin
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  VALUES (v_superadmin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@sekolah.com', crypt('SuperAdmin123!', gen_salt('bf')), now(), '{"full_name":"Super Administrator"}'::jsonb, now(), now(), '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), 'superadmin@sekolah.com', v_superadmin_id, json_build_object('sub', v_superadmin_id, 'email', 'superadmin@sekolah.com')::jsonb, 'email', now(), now(), now())
  ON CONFLICT DO NOTHING;

  -- Admin
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  VALUES (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@sekolah.com', crypt('Admin123!', gen_salt('bf')), now(), '{"full_name":"Administrator Sekolah"}'::jsonb, now(), now(), '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), 'admin@sekolah.com', v_admin_id, json_build_object('sub', v_admin_id, 'email', 'admin@sekolah.com')::jsonb, 'email', now(), now(), now())
  ON CONFLICT DO NOTHING;

  -- Bendahara
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  VALUES (v_bendahara_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bendahara@sekolah.com', crypt('Bendahara123!', gen_salt('bf')), now(), '{"full_name":"Sri Mulyani, S.E."}'::jsonb, now(), now(), '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), 'bendahara@sekolah.com', v_bendahara_id, json_build_object('sub', v_bendahara_id, 'email', 'bendahara@sekolah.com')::jsonb, 'email', now(), now(), now())
  ON CONFLICT DO NOTHING;

  -- Tata Usaha
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
  VALUES (v_tu_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tatausaha@sekolah.com', crypt('TataUsaha123!', gen_salt('bf')), now(), '{"full_name":"Joko Widodo"}'::jsonb, now(), now(), '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), 'tatausaha@sekolah.com', v_tu_id, json_build_object('sub', v_tu_id, 'email', 'tatausaha@sekolah.com')::jsonb, 'email', now(), now(), now())
  ON CONFLICT DO NOTHING;

END $$;

-- ===== GURU AUTH USERS =====
`;

  teacherData.forEach((t, i) => {
    sql += `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token)
VALUES ('${teacherIds[i]}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${t.email}', crypt('Guru123!', gen_salt('bf')), now(), '{"full_name":"${e(t.name)}"}'::jsonb, now(), now(), '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (gen_random_uuid(), '${t.email}', '${teacherIds[i]}', json_build_object('sub', '${teacherIds[i]}', 'email', '${t.email}')::jsonb, 'email', now(), now(), now())
ON CONFLICT DO NOTHING;

`;
  });

  // School
  sql += `
-- ===== SEKOLAH =====
INSERT INTO public.schools (id, name, npsn, address, phone, email, approval_status, is_active)
VALUES ('${schoolId}', 'SMP Negeri 1 Contoh', '20100001', 'Jl. Pendidikan No. 1, Kota Contoh, Jawa Barat', '022-1234567', 'smpn1contoh@sekolah.id', 'approved', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, approval_status = 'approved', is_active = true;

-- ===== PROFILES =====
INSERT INTO public.profiles (id, email, full_name) VALUES
('${superAdminId}', 'superadmin@sekolah.com', 'Super Administrator'),
('${adminId}', 'admin@sekolah.com', 'Administrator Sekolah'),
('${bendaharaId}', 'bendahara@sekolah.com', 'Sri Mulyani, S.E.'),
('${tuId}', 'tatausaha@sekolah.com', 'Joko Widodo')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

`;

  teacherData.forEach((t, i) => {
    sql += `INSERT INTO public.profiles (id, email, full_name) VALUES ('${teacherIds[i]}', '${t.email}', '${e(t.name)}') ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;\n`;
  });

  // User roles
  sql += `
-- ===== USER ROLES =====
INSERT INTO public.user_roles (user_id, role) VALUES ('${superAdminId}', 'super_admin') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role, school_id) VALUES ('${adminId}', 'admin', '${schoolId}') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role, school_id) VALUES ('${bendaharaId}', 'bendahara', '${schoolId}') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role, school_id) VALUES ('${tuId}', 'tata_usaha', '${schoolId}') ON CONFLICT DO NOTHING;
`;

  teacherData.forEach((_, i) => {
    sql += `INSERT INTO public.user_roles (user_id, role, school_id) VALUES ('${teacherIds[i]}', 'teacher', '${schoolId}') ON CONFLICT DO NOTHING;\n`;
  });

  // Teachers table
  sql += `\n-- ===== TEACHERS =====\n`;
  teacherData.forEach((t, i) => {
    sql += `INSERT INTO public.teachers (id, user_id, subject, nip, is_homeroom_teacher, school_id) VALUES ('${teacherRecordIds[i]}', '${teacherIds[i]}', '${t.subject}', '${t.nip}', true, '${schoolId}') ON CONFLICT (user_id) DO UPDATE SET subject = EXCLUDED.subject, nip = EXCLUDED.nip;\n`;
  });

  // Academic year
  sql += `
-- ===== TAHUN AJARAN =====
INSERT INTO public.academic_years (id, year, is_active, school_id) VALUES ('${academicYearId}', '2025/2026', true, '${schoolId}') ON CONFLICT (id) DO UPDATE SET is_active = true;

-- ===== SCHOOL SETTINGS =====
INSERT INTO public.school_settings (id, school_name, headmaster_name, headmaster_nip, school_address, school_phone, district_name, academic_year, active_semester, app_name, bendahara_name, bendahara_nip, school_id, enable_student_status_check, enable_graduation_check, enable_complaint_channel, show_address, show_phone)
VALUES ('33333333-3333-3333-3333-333333333333', 'SMP Negeri 1 Contoh', 'Dr. H. Suparman, M.Pd.', '197001011995011001', 'Jl. Pendidikan No. 1, Kota Contoh', '022-1234567', 'DINAS PENDIDIKAN KOTA CONTOH', '2025/2026', 2, 'Sistem Manajemen Sekolah', 'Sri Mulyani, S.E.', '198001012005012001', '${schoolId}', true, true, true, true, true)
ON CONFLICT (id) DO UPDATE SET school_name = EXCLUDED.school_name;

`;

  // Classes
  sql += `-- ===== KELAS =====\n`;
  classData.forEach(c => {
    sql += `INSERT INTO public.classes (id, name, grade, academic_year, homeroom_teacher_id, school_id) VALUES ('${c.id}', '${c.name}', ${c.grade}, '2025/2026', '${teacherRecordIds[c.teacher_idx]}', '${schoolId}') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;\n`;
  });

  // Students
  sql += `\n-- ===== SISWA =====\n`;
  const studentIds: string[] = [];
  studentNames.forEach((s, i) => {
    const sid = `s1111111-0001-0001-0001-${String(i + 1).padStart(12, '0')}`;
    studentIds.push(sid);
    const classIdx = (s as any).alumni ? null : (i % 5);
    const classId = classIdx !== null ? classData[classIdx].id : null;
    const birthDate = `200${8 + Math.floor(i / 7)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
    const isAlumni = (s as any).alumni || false;
    sql += `INSERT INTO public.students (id, full_name, nis, nisn, gender, birth_place, birth_date, class_id, parent_name, parent_phone, address, school_id, is_alumni${isAlumni ? ', graduation_date' : ''}) VALUES ('${sid}', '${e(s.name)}', '2025${String(i + 1).padStart(4, '0')}', '${s.nisn}', '${s.gender}', 'Kota Contoh', '${birthDate}', ${classId ? `'${classId}'` : 'NULL'}, '${e(s.parent)}', '0812${String(34560001 + i)}', 'Jl. Contoh No. ${i + 1}', '${schoolId}', ${isAlumni}${isAlumni ? ", '2025-06-15'" : ''}) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;\n`;
  });

  // Schedules
  sql += `\n-- ===== JADWAL =====\n`;
  const subjects = ['Matematika', 'Bahasa Indonesia', 'IPA', 'IPS', 'Bahasa Inggris'];
  const scheduleIds: string[] = [];
  let schedIdx = 0;
  for (let ci = 0; ci < classData.length; ci++) {
    for (let day = 1; day <= 5; day++) {
      const subjectIdx = (ci + day) % 5;
      const sid = `d1111111-0001-0001-0001-${String(++schedIdx).padStart(12, '0')}`;
      scheduleIds.push(sid);
      sql += `INSERT INTO public.schedules (id, class_id, teacher_id, subject, day_of_week, start_time, end_time, academic_year, semester, school_id) VALUES ('${sid}', '${classData[ci].id}', '${teacherRecordIds[subjectIdx]}', '${subjects[subjectIdx]}', ${day}, '0${7 + ci}:00', '0${7 + ci}:45', '2025/2026', 2, '${schoolId}') ON CONFLICT (id) DO UPDATE SET subject = EXCLUDED.subject;\n`;
    }
  }

  // Attendance
  sql += `\n-- ===== ABSENSI (5 hari terakhir) =====\n`;
  const statusList = ['hadir', 'hadir', 'hadir', 'hadir', 'hadir', 'hadir', 'izin', 'sakit', 'alpa', 'hadir'];
  let attCount = 0;
  const nowDate = new Date();
  for (let d = 1; d <= 5; d++) {
    const date = new Date(nowDate);
    date.setDate(date.getDate() - d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const dateStr = date.toISOString().split('T')[0];
    for (let ci = 0; ci < classData.length; ci++) {
      const schedId = scheduleIds[ci * 5];
      if (!schedId) continue;
      studentNames.forEach((s, idx) => {
        if ((s as any).alumni || idx % 5 !== ci) return;
        const status = statusList[(idx + d) % statusList.length];
        const aid = `a${String(attCount++).padStart(7, '0')}-att-0001-0001-000000000001`;
        sql += `INSERT INTO public.attendance (id, student_id, schedule_id, date, status, created_by, school_id) VALUES ('${aid}', '${studentIds[idx]}', '${schedId}', '${dateStr}', '${status}', '${adminId}', '${schoolId}') ON CONFLICT (id) DO NOTHING;\n`;
      });
    }
  }

  // Violation types
  sql += `\n-- ===== JENIS PELANGGARAN =====\n`;
  violationTypes.forEach(v => {
    sql += `INSERT INTO public.violation_types (id, name, category, points, description, school_id, is_active) VALUES ('${v.id}', '${e(v.name)}', '${v.category}', ${v.points}, '${e(v.desc)}', '${schoolId}', true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;\n`;
  });

  // Violations
  sql += `\n-- ===== PELANGGARAN SISWA =====\n`;
  sql += `INSERT INTO public.student_violations (id, student_id, violation_type_id, points, reported_by, school_id, violation_date) VALUES ('sv111111-0001-0001-0001-000000000001', '${studentIds[0]}', '${violationTypes[0].id}', 5, '${adminId}', '${schoolId}', '${today}') ON CONFLICT (id) DO NOTHING;\n`;
  sql += `INSERT INTO public.student_violations (id, student_id, violation_type_id, points, reported_by, school_id, violation_date) VALUES ('sv111111-0001-0001-0001-000000000002', '${studentIds[2]}', '${violationTypes[1].id}', 10, '${adminId}', '${schoolId}', '${today}') ON CONFLICT (id) DO NOTHING;\n`;
  sql += `INSERT INTO public.student_violations (id, student_id, violation_type_id, points, reported_by, school_id, violation_date) VALUES ('sv111111-0001-0001-0001-000000000003', '${studentIds[4]}', '${violationTypes[3].id}', 15, '${adminId}', '${schoolId}', '${today}') ON CONFLICT (id) DO NOTHING;\n`;

  // Grades
  sql += `\n-- ===== NILAI =====\n`;
  let gradeCount = 0;
  for (let ci = 0; ci < classData.length; ci++) {
    const schedId = scheduleIds[ci * 5];
    if (!schedId) continue;
    studentNames.forEach((s, idx) => {
      if ((s as any).alumni || idx % 5 !== ci) return;
      const gid = `g${String(gradeCount++).padStart(7, '0')}-grd-0001-0001-000000000001`;
      const uts = 70 + (idx * 3) % 25;
      const uas = 65 + (idx * 7) % 30;
      const tugas = 75 + (idx * 5) % 20;
      const kuis = 60 + (idx * 11) % 35;
      const praktik = 70 + (idx * 9) % 25;
      sql += `INSERT INTO public.grades (id, student_id, schedule_id, uts, uas, tugas, kuis, praktik, created_by, school_id) VALUES ('${gid}', '${studentIds[idx]}', '${schedId}', ${uts}, ${uas}, ${tugas}, ${kuis}, ${praktik}, '${adminId}', '${schoolId}') ON CONFLICT (id) DO NOTHING;\n`;
    });
  }

  // Announcements
  sql += `\n-- ===== PENGUMUMAN =====
INSERT INTO public.announcements (id, title, content, created_by, school_id, is_active) VALUES ('an111111-0001-0001-0001-000000000001', 'Pengumuman UTS Semester 2', 'UTS Semester 2 akan dilaksanakan tanggal 10-15 Maret 2026.', '${adminId}', '${schoolId}', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.announcements (id, title, content, created_by, school_id, is_active) VALUES ('an111111-0001-0001-0001-000000000002', 'Libur Hari Raya Nyepi', 'Sekolah libur pada tanggal 19 Maret 2026.', '${adminId}', '${schoolId}', true) ON CONFLICT (id) DO NOTHING;

-- ===== JENIS PAJAK =====
INSERT INTO public.tax_types (id, code, name, rate, description, school_id, is_active) VALUES ('tt111111-0001-0001-0001-000000000001', 'PPH21', 'PPh Pasal 21', 5, 'Pajak penghasilan atas honorarium', '${schoolId}', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.tax_types (id, code, name, rate, description, school_id, is_active) VALUES ('tt111111-0001-0001-0001-000000000002', 'PPH23', 'PPh Pasal 23', 2, 'Pajak atas jasa', '${schoolId}', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.tax_types (id, code, name, rate, description, school_id, is_active) VALUES ('tt111111-0001-0001-0001-000000000003', 'PPN', 'PPN', 11, 'Pajak pertambahan nilai', '${schoolId}', true) ON CONFLICT (id) DO NOTHING;

-- ===== PENGATURAN HARI ABSENSI =====
`;
  const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  dayNames.forEach((dn, i) => {
    sql += `INSERT INTO public.attendance_day_settings (id, day_of_week, day_name, is_active, school_id, updated_by) VALUES ('ds111111-0001-0001-0001-00000000000${i + 1}', ${i + 1}, '${dn}', ${i < 5}, '${schoolId}', '${adminId}') ON CONFLICT (id) DO UPDATE SET is_active = EXCLUDED.is_active;\n`;
  });

  sql += `
-- ===== PAKET LANGGANAN =====
INSERT INTO public.subscription_plans (id, plan_key, label, description, monthly_price, max_students, max_teachers, duration_months, features, sort_order, is_active) VALUES
('sp111111-0001-0001-0001-000000000001', 'free', 'Gratis', 'Paket gratis', 0, 50, 5, 12, '["Absensi","Jadwal","Nilai"]'::jsonb, 1, true),
('sp111111-0001-0001-0001-000000000002', 'basic', 'Basic', 'Paket dasar', 100000, 200, 20, 12, '["Absensi","Jadwal","Nilai","Surat","Keuangan"]'::jsonb, 2, true),
('sp111111-0001-0001-0001-000000000003', 'premium', 'Premium', 'Paket premium', 250000, 1000, 100, 12, '["Semua Fitur","Prioritas Support","Custom Branding"]'::jsonb, 3, true)
ON CONFLICT (id) DO NOTHING;

-- ===== LANGGANAN SEKOLAH =====
INSERT INTO public.school_subscriptions (id, school_id, plan_name, status, start_date, end_date, max_students, max_teachers) VALUES
('ss111111-0001-0001-0001-000000000001', '${schoolId}', 'Premium', 'active', '2025-01-01', '2026-12-31', 1000, 100)
ON CONFLICT (id) DO NOTHING;

-- ===== VERSI APLIKASI =====
INSERT INTO public.app_versions (id, version, revision, is_current, release_date) VALUES
('av111111-0001-0001-0001-000000000001', '3.0.0', 'Rilis Awal VPS', true, now())
ON CONFLICT (id) DO UPDATE SET is_current = true;

-- ===== TIPE EKSTRAKURIKULER =====
INSERT INTO public.extracurricular_types (id, name, description, school_id, is_active) VALUES
('et111111-0001-0001-0001-000000000001', 'Pramuka', 'Kegiatan kepramukaan', '${schoolId}', true),
('et111111-0001-0001-0001-000000000002', 'Futsal', 'Olahraga futsal', '${schoolId}', true),
('et111111-0001-0001-0001-000000000003', 'Seni Tari', 'Seni tari tradisional', '${schoolId}', true)
ON CONFLICT (id) DO NOTHING;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- =============================================
-- SELESAI! Akun Login:
-- =============================================
-- Super Admin : superadmin@sekolah.com / SuperAdmin123!
-- Admin       : admin@sekolah.com / Admin123!
-- Guru (5)    : guru.matematika@sekolah.com / Guru123!  (dll.)
-- Bendahara   : bendahara@sekolah.com / Bendahara123!
-- Tata Usaha  : tatausaha@sekolah.com / TataUsaha123!
-- =============================================
`;

  return sql;
};

interface AccountInfo {
  role: string;
  email: string;
  password: string;
}

export default function SeedDatabase() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const navigate = useNavigate();

  const handleSeed = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-database', {
        body: {}
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setResult(data);
      toast.success('Database dummy berhasil dibuat!');
    } catch (error: any) {
      toast.error('Gagal: ' + error.message);
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadSQL = () => {
    const sql = generateSeedSQL();
    const blob = new Blob([sql], { type: 'application/sql' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seed-database-${new Date().toISOString().split('T')[0]}.sql`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('File SQL berhasil didownload!');
  };

  const stats = result?.results;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Seed Database - Data Dummy Lengkap
          </CardTitle>
          <CardDescription>
            Buat semua data contoh untuk menjalankan aplikasi di VPS (akun, sekolah, kelas, siswa, jadwal, dll.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!result ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ... keep existing code (account info cards) */}
                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold text-primary flex items-center gap-2">
                    <Users className="h-4 w-4" /> Akun yang Dibuat
                  </h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>🔑 <span className="font-mono text-foreground">superadmin@sekolah.com</span> / SuperAdmin123!</li>
                    <li>👤 <span className="font-mono text-foreground">admin@sekolah.com</span> / Admin123!</li>
                    <li>👨‍🏫 5 Akun Guru / Guru123!</li>
                    <li>💰 <span className="font-mono text-foreground">bendahara@sekolah.com</span> / Bendahara123!</li>
                    <li>📋 <span className="font-mono text-foreground">tatausaha@sekolah.com</span> / TataUsaha123!</li>
                  </ul>
                </div>

                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold text-primary flex items-center gap-2">
                    <BookOpen className="h-4 w-4" /> Data Sekolah
                  </h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>🏫 1 Sekolah (SMP Negeri 1 Contoh)</li>
                    <li>📅 Tahun Ajaran 2025/2026</li>
                    <li>🏗️ 5 Kelas (VII A/B, VIII A/B, IX A)</li>
                    <li>📖 Pengaturan Sekolah Lengkap</li>
                  </ul>
                </div>

                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold text-primary flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" /> Data Siswa & Akademik
                  </h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>👦👧 22 Siswa (20 aktif + 2 alumni)</li>
                    <li>📊 Nilai UTS, UAS, Tugas, Kuis</li>
                    <li>⚠️ Jenis Pelanggaran & Data Pelanggaran</li>
                    <li>🏅 Jenis Ekstrakurikuler</li>
                  </ul>
                </div>

                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold text-primary flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> Data Operasional
                  </h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>📅 25 Jadwal Pelajaran</li>
                    <li>✅ Absensi 5 hari terakhir</li>
                    <li>📢 2 Pengumuman</li>
                    <li>💵 3 Jenis Pajak & Langganan Premium</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleSeed}
                  disabled={isLoading}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Membuat Database Dummy... (30-60 detik)
                    </>
                  ) : (
                    <>
                      <Database className="mr-2 h-4 w-4" />
                      Buat Database Dummy Sekarang (via API)
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleDownloadSQL}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Download File SQL (untuk VPS / psql)
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="text-center py-4">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold">Database Dummy Berhasil Dibuat!</h3>
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold">📊 Ringkasan Data:</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {stats?.teachers && <div>👨‍🏫 Guru: {stats.teachers.count}</div>}
                  {stats?.classes && <div>🏫 Kelas: {stats.classes.count}</div>}
                  {stats?.students && <div>👦 Siswa: {stats.students.count}</div>}
                  {stats?.schedules && <div>📅 Jadwal: {stats.schedules.count}</div>}
                  {stats?.attendance && <div>✅ Absensi: {stats.attendance.count}</div>}
                  {stats?.grades && <div>📊 Nilai: {stats.grades.count}</div>}
                  {stats?.violations && <div>⚠️ Pelanggaran: {stats.violations.count}</div>}
                  {stats?.announcements && <div>📢 Pengumuman: {stats.announcements.count}</div>}
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <h3 className="font-semibold">🔑 Akun Login:</h3>
                <div className="space-y-1 text-sm font-mono">
                  {result.accounts?.map((acc: AccountInfo, i: number) => (
                    <div key={i} className="flex justify-between items-center bg-muted/50 px-3 py-1.5 rounded">
                      <span className="text-muted-foreground">{acc.role}</span>
                      <span>{acc.email} / {acc.password}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={() => navigate('/auth')} size="lg" className="flex-1">
                  Login Sekarang
                </Button>
                <Button onClick={() => { setResult(null); }} variant="outline" size="lg">
                  Ulangi
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
