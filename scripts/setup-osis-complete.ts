/**
 * SCRIPT OTOMATIS LENGKAP: Setup User OSIS
 * 
 * Jalankan: npx tsx scripts/setup-osis-complete.ts
 * 
 * Prasyarat .env:
 *   VITE_SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJxxx    (dari Settings → API → service_role)
 *   SUPABASE_DB_URL=postgresql://...    (dari Settings → Database → Connection string → URI)
 */

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'readline';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;

// ============ KONFIGURASI ============
const OSIS_EMAIL = 'osis@nedelcis.com';
const OSIS_PASSWORD = '123456';
const OSIS_FULL_NAME = 'OSIS Sekolah';
const OSIS_ROLE = 'osis';

function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}

function log(step: string, msg: string, icon = '•') {
  console.log(`   ${icon} [${step}] ${msg}`);
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   SETUP OTOMATIS USER OSIS — Sistem Manajemen Sekolah ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ VITE_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diset di .env');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // =====================================================
  // PHASE 1: MIGRASI DATABASE (via koneksi Postgres langsung)
  // =====================================================
  if (DB_URL) {
    console.log('📦 PHASE 1: Migrasi database (enum + RLS)...\n');

    const pg = new Client({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await pg.connect();
      log('DB', 'Terhubung ke PostgreSQL');

      // -------- STEP 1: Tambah enum osis --------
      log('DB', 'Menambah enum osis...');
      await pg.query(`ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'osis';`);
      log('DB', 'Enum osis ditambahkan (atau sudah ada)', '✅');

      // ⚠️ WAJIB: commit & reconnect sebelum pakai enum baru
      // Dengan pg client di mode default (autocommit), tiap query = 1 transaksi.
      // Untuk aman, kita pakai koneksi terpisah untuk step berikutnya.

    } catch (err: any) {
      console.error('❌ Gagal migrasi DB:', err.message);
      // Lanjut saja ke Phase 2, karena enum mungkin sudah ada
    } finally {
      await pg.end();
    }

    // Tunggu 1 detik supaya enum benar-benar committed
    console.log('   ⏳ Menunggu 1 detik agar enum commit...\n');
    await new Promise((r) => setTimeout(r, 1000));

    // -------- STEP 2: Buat function & policy (koneksi baru) --------
    const pg2 = new Client({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await pg2.connect();
      log('DB', 'Koneksi baru untuk function & policy');

      const sql = `
        -- Function helper
        CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
        AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

        CREATE OR REPLACE FUNCTION public.is_osis(_user_id uuid)
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
        AS $$ SELECT public.has_role(_user_id, 'osis'::app_role) $$;

        -- RLS: student_violations
        ALTER TABLE public.student_violations ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "osis_view_violations" ON public.student_violations;
        DROP POLICY IF EXISTS "osis_insert_violations" ON public.student_violations;
        DROP POLICY IF EXISTS "admin_update_violations" ON public.student_violations;
        DROP POLICY IF EXISTS "admin_delete_violations" ON public.student_violations;

        CREATE POLICY "osis_view_violations" ON public.student_violations FOR SELECT TO authenticated
        USING (public.has_role(auth.uid(),'osis') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kesiswaan') OR public.has_role(auth.uid(),'guru_piket') OR public.has_role(auth.uid(),'teacher'));

        CREATE POLICY "osis_insert_violations" ON public.student_violations FOR INSERT TO authenticated
        WITH CHECK (public.has_role(auth.uid(),'osis') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kesiswaan') OR public.has_role(auth.uid(),'guru_piket') OR public.has_role(auth.uid(),'teacher'));

        CREATE POLICY "admin_update_violations" ON public.student_violations FOR UPDATE TO authenticated
        USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kesiswaan'));

        CREATE POLICY "admin_delete_violations" ON public.student_violations FOR DELETE TO authenticated
        USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kesiswaan'));

        -- RLS: violation_types
        ALTER TABLE public.violation_types ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "staff_view_violation_types" ON public.violation_types;
        DROP POLICY IF EXISTS "admin_manage_violation_types" ON public.violation_types;

        CREATE POLICY "staff_view_violation_types" ON public.violation_types FOR SELECT TO authenticated
        USING (public.has_role(auth.uid(),'osis') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kesiswaan') OR public.has_role(auth.uid(),'guru_piket') OR public.has_role(auth.uid(),'teacher'));

        CREATE POLICY "admin_manage_violation_types" ON public.violation_types FOR ALL TO authenticated
        USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kesiswaan'))
        WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kesiswaan'));

        -- RLS: students
        ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "osis_view_students" ON public.students;
        CREATE POLICY "osis_view_students" ON public.students FOR SELECT TO authenticated
        USING (public.has_role(auth.uid(),'osis') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kesiswaan') OR public.has_role(auth.uid(),'guru_piket') OR public.has_role(auth.uid(),'teacher'));

        -- RLS: classes
        ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "osis_view_classes" ON public.classes;
        CREATE POLICY "osis_view_classes" ON public.classes FOR SELECT TO authenticated
        USING (public.has_role(auth.uid(),'osis') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kesiswaan') OR public.has_role(auth.uid(),'guru_piket') OR public.has_role(auth.uid(),'teacher'));

        -- RLS: profiles
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "osis_view_profiles" ON public.profiles;
        CREATE POLICY "osis_view_profiles" ON public.profiles FOR SELECT TO authenticated
        USING (auth.uid() = id OR public.has_role(auth.uid(),'osis') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'kesiswaan') OR public.has_role(auth.uid(),'teacher'));
      `;

      await pg2.query(sql);
      log('DB', 'Semua function & RLS policy dibuat', '✅');

    } catch (err: any) {
      console.error('❌ Gagal buat policy:', err.message);
      console.error('   ℹ️  Coba jalankan manual lewat SQL Editor (lihat File 1B)');
    } finally {
      await pg2.end();
    }
  } else {
    console.log('⚠️  SUPABASE_DB_URL tidak diset — lewati migrasi otomatis.');
    console.log('   Jalankan manual File 1A & 1B di SQL Editor.\n');
  }

  // =====================================================
  // PHASE 2: BUAT USER OSIS
  // =====================================================
  console.log('\n📦 PHASE 2: Membuat user OSIS...\n');

  // -------- Pilih sekolah --------
  const { data: schools, error: schoolErr } = await supabase
    .from('schools')
    .select('id, name, npsn')
    .order('name');

  if (schoolErr) {
    console.error('❌ Gagal ambil daftar sekolah:', schoolErr.message);
    process.exit(1);
  }

  if (!schools || schools.length === 0) {
    console.error('❌ Tidak ada sekolah terdaftar.');
    process.exit(1);
  }

  let schoolId: string;
  if (schools.length === 1) {
    schoolId = schools[0].id;
    console.log(`   ✅ Sekolah: ${schools[0].name}`);
  } else {
    console.log('\n   Daftar sekolah:');
    schools.forEach((s, i) => console.log(`     [${i + 1}] ${s.name} (NPSN: ${s.npsn || '-'})`));
    const pick = await ask('\n   Pilih nomor sekolah: ');
    const idx = parseInt(pick) - 1;
    if (isNaN(idx) || !schools[idx]) {
      console.error('❌ Pilihan tidak valid.');
      process.exit(1);
    }
    schoolId = schools[idx].id;
    console.log(`   ✅ Dipilih: ${schools[idx].name}`);
  }

  // -------- Cek / buat auth user --------
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listErr) {
    console.error('❌ Gagal list users:', listErr.message);
    process.exit(1);
  }

  let userId: string;
  const existing = listData.users.find((u) => u.email === OSIS_EMAIL);

  if (existing) {
    userId = existing.id;
    console.log(`   ⚠️  User sudah ada (ID: ${userId}). Update password...`);
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: OSIS_PASSWORD,
      email_confirm: true,
    });
    if (error) {
      console.error('❌', error.message);
      process.exit(1);
    }
    console.log('   ✅ Password diperbarui.');
  } else {
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: OSIS_EMAIL,
      password: OSIS_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: OSIS_FULL_NAME },
    });
    if (createErr || !newUser.user) {
      console.error('❌ Gagal buat user:', createErr?.message);
      process.exit(1);
    }
    userId = newUser.user.id;
    console.log(`   ✅ User baru dibuat (ID: ${userId})`);
  }

  // -------- Upsert profile --------
  const { error: profErr } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        full_name: OSIS_FULL_NAME,
        email: OSIS_EMAIL,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (profErr) {
    console.error('❌ Gagal upsert profile:', profErr.message);
    process.exit(1);
  }
  console.log('   ✅ Profile tersimpan.');

  // -------- Bersihkan role lama --------
  await supabase.from('user_roles').delete().eq('user_id', userId);
  console.log('   ✅ Role lama dibersihkan.');

  // -------- Insert role osis --------
  const { error: roleErr } = await supabase
    .from('user_roles')
    .insert({
      user_id: userId,
      role: OSIS_ROLE,
      school_id: schoolId,
    });

  if (roleErr) {
    console.error('❌ Gagal set role:', roleErr.message);
    console.error('   ℹ️  Pastikan enum osis sudah ditambahkan (Phase 1 / manual).');
    process.exit(1);
  }
  console.log(`   ✅ Role '${OSIS_ROLE}' ditetapkan.`);

  // -------- Verifikasi --------
  const { data: verifyRole } = await supabase
    .from('user_roles')
    .select('role, school_id')
    .eq('user_id', userId)
    .single();

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║           ✅ SETUP OSIS SELESAI                       ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║  Email    : ${OSIS_EMAIL.padEnd(40)}║`);
  console.log(`║  Password : ${OSIS_PASSWORD.padEnd(40)}║`);
  console.log(`║  Role     : ${(verifyRole?.role || OSIS_ROLE).padEnd(40)}║`);
  console.log(`║  Nama     : ${OSIS_FULL_NAME.padEnd(40)}║`);
  console.log(`║  User ID  : ${userId.padEnd(40)}║`);
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log('║  HAK AKSES:                                           ║');
  console.log('║  ✅ Menambah catatan pelanggaran                      ║');
  console.log('║  ✅ Melihat daftar & rekap pelanggaran                ║');
  console.log('║  ❌ Edit / hapus pelanggaran                          ║');
  console.log('║  ❌ Kelola jenis pelanggaran                          ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
}

main().catch((e) => {
  console.error('❌ FATAL:', e);
  process.exit(1);
});