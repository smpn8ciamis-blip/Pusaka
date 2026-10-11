import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifyAdminAuth(req: Request, supabaseClient: any): Promise<{ user: any; error: string | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { user: null, error: 'No authorization header provided' };

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
  if (error || !user) return { user: null, error: 'Invalid or expired token' };

  // Jangan pakai .single(): user bisa punya lebih dari satu baris role
  const { data: roleRows, error: roleError } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  if (roleError || !(roleRows ?? []).some((r: any) => r.role === 'super_admin')) {
    return { user: null, error: 'Super admin access required' };
  }
  return { user, error: null };
}

function escapeString(v: string): string {
  return `'${v.replace(/\u0000/g, '').replace(/'/g, "''")}'`;
}

function escapeArrayElement(v: any): string {
  if (v === null || v === undefined) return 'NULL';
  if (Array.isArray(v)) return `{${v.map(escapeArrayElement).join(',')}}`;
  if (typeof v === 'object') v = JSON.stringify(v);
  return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// udtName: tipe kolom dari information_schema (awalan "_" = array Postgres)
function escapeValue(value: any, udtName?: string): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toString() : 'NULL';
  if (Array.isArray(value) && udtName && udtName.startsWith('_')) {
    return escapeString(`{${value.map(escapeArrayElement).join(',')}}`);
  }
  if (typeof value === 'object') return escapeString(JSON.stringify(value));
  return escapeString(value.toString());
}

function generateUpsertStatement(
  tableName: string,
  record: any,
  udt: Record<string, string>,
  pkCols: string[],
): string {
  const columns = Object.keys(record);
  const values = columns.map(col => escapeValue(record[col], udt[col]));
  const quotedCols = columns.map(c => `"${c}"`).join(', ');
  const base = `INSERT INTO public."${tableName}" (${quotedCols}) VALUES (${values.join(', ')})`;
  // Hanya pakai target konflik bila semua kolom PK ikut diekspor
  if (pkCols.length > 0 && pkCols.every(c => columns.includes(c))) {
    const updateCols = columns.filter(c => !pkCols.includes(c)).map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
    const target = pkCols.map(c => `"${c}"`).join(', ');
    return updateCols
      ? `${base} ON CONFLICT (${target}) DO UPDATE SET ${updateCols};`
      : `${base} ON CONFLICT (${target}) DO NOTHING;`;
  }
  return `${base} ON CONFLICT DO NOTHING;`;
}

// Query read-only via RPC. Dulu error ditelan (return []) sehingga backup bisa
// tampak sukses padahal isinya bolong. Sekarang di-retry lalu dilempar.
async function runSQL(supabaseClient: any, sql: string): Promise<any[]> {
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabaseClient.rpc('exec_sql_readonly', { sql_query: sql });
    if (!error) return data || [];
    lastErr = error.message;
    console.error('SQL error (attempt ' + (attempt + 1) + '):', error.message, 'Query:', sql.substring(0, 120));
    await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
  }
  throw new Error(`Query gagal: ${lastErr} -- ${sql.substring(0, 120)}`);
}


// =====================================================================
// MODE TEMPLATE: skema + RLS + bucket + akun super admin + DATA DUMMY
// Data dummy dibuat otomatis dari skema database yang sedang berjalan,
// sehingga selalu cocok dengan struktur tabel terbaru.
// =====================================================================
function h53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function fakeUuid(seed: string): string {
  const hex = [0, 1, 2, 3].map(k => (h53(seed, k) % 0x100000000).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const q = (v: string) => `'${v.replace(/\u0000/g, '').replace(/'/g, "''")}'`;

const DUMMY_NAMES = ['Ahmad Fauzi', 'Siti Nurhaliza', 'Budi Santoso', 'Dewi Lestari', 'Rizky Pratama', 'Anisa Rahma', 'Dimas Saputra', 'Putri Ayu', 'Fajar Nugraha', 'Nadia Safitri', 'Agus Setiawan', 'Rina Marlina'];
const DUMMY_MAPEL = ['Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'IPA', 'IPS', 'PJOK', 'Seni Budaya', 'Informatika', 'PKN', 'Pendidikan Agama'];
const dummyPerson = (i: number, offset = 0) => {
  const idx = i + offset;
  const base = DUMMY_NAMES[idx % DUMMY_NAMES.length];
  const round = Math.floor(idx / DUMMY_NAMES.length);
  return round > 0 ? `${base} ${round + 1}` : base;
};

// Jumlah baris dummy per tabel (default 5)
const DUMMY_COUNTS: Record<string, number> = {
  schools: 1, school_settings: 1, school_subscriptions: 1, classes: 6, students: 30, teachers: 8,
  profiles: 10, user_roles: 10, schedules: 24, attendance: 30, teaching_journals: 12, grades: 30,
};
// Tabel yang tidak diisi data dummy (log, token, antrean, konfigurasi bot, dsb.)
const DUMMY_SKIP = /(_logs?$|^logs?_|audit|webhook|fcm|push_sub|token|session|queue|jobs?$|^wa_|^card_templates$|rate_limit|^exec_)/;

interface TplCol {
  name: string; udt: string; dataType: string; nullable: boolean; hasDefault: boolean;
  generated: boolean; maxLen: number | null; prec: number | null; scale: number | null;
}
interface TplFk { col: string; ftable: string; fcol: string; fschema: string }

async function emitDummyData(
  client: any,
  tableNames: string[],
  enumMap: Map<string, string[]>,
  pool: { id: string; email: string; role: string | null }[],
  push: (x: string) => void,
) {
  const colRows = await runSQL(client, `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, is_generated, character_maximum_length, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`);
  const cols = new Map<string, TplCol[]>();
  for (const c of colRows) {
    const arr = cols.get(c.table_name) ?? [];
    arr.push({
      name: c.column_name, udt: c.udt_name, dataType: c.data_type, nullable: c.is_nullable === 'YES',
      hasDefault: !!c.column_default, generated: c.is_generated === 'ALWAYS',
      maxLen: c.character_maximum_length, prec: c.numeric_precision, scale: c.numeric_scale,
    });
    cols.set(c.table_name, arr);
  }

  const pkRows = await runSQL(client, `SELECT cl.relname AS tbl, a.attname AS col FROM pg_index i JOIN pg_class cl ON cl.oid = i.indrelid JOIN pg_namespace n ON n.oid = cl.relnamespace JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE n.nspname = 'public' AND i.indisprimary`);
  const pks = new Map<string, Set<string>>();
  for (const r of pkRows) { const st = pks.get(r.tbl) ?? new Set<string>(); st.add(r.col); pks.set(r.tbl, st); }

  const fkRows = await runSQL(client, `SELECT cl.relname AS tbl, a.attname AS col, fn.nspname AS fschema, fcl.relname AS ftable, fa.attname AS fcol FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace JOIN pg_class fcl ON fcl.oid = c.confrelid JOIN pg_namespace fn ON fn.oid = fcl.relnamespace JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = c.confkey[1] WHERE c.contype = 'f' AND n.nspname = 'public' AND array_length(c.conkey, 1) = 1`);
  const fks = new Map<string, Map<string, TplFk>>();
  for (const r of fkRows) {
    const m = fks.get(r.tbl) ?? new Map<string, TplFk>();
    m.set(r.col, { col: r.col, ftable: r.ftable, fcol: r.fcol, fschema: r.fschema });
    fks.set(r.tbl, m);
  }

  // CHECK (kolom IN ('a','b')) -> daftar nilai yang diizinkan
  const allowed = new Map<string, string[]>();
  try {
    const chk = await runSQL(client, `SELECT cl.relname AS tbl, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE c.contype = 'c' AND n.nspname = 'public'`);
    for (const r of chk) {
      const def: string = r.def || '';
      if (!/ANY|\sIN\s|=\s*'/.test(def)) continue;
      const lits = Array.from(def.matchAll(/'([^']*)'::/g)).map(m => m[1]);
      if (lits.length === 0) continue;
      const tcols = (cols.get(r.tbl) ?? []).map(c => c.name).filter(n => new RegExp(`\\b${n}\\b`).test(def));
      if (tcols.length === 1) allowed.set(`${r.tbl}.${tcols[0]}`, lits);
    }
  } catch (_) { /* opsional */ }

  // Urutan tabel: induk dulu
  const names = tableNames.filter(t => cols.has(t));
  const deps = new Map<string, Set<string>>();
  for (const t of names) {
    const st = new Set<string>();
    for (const fk of (fks.get(t) ?? new Map()).values()) if (fk.fschema === 'public' && fk.ftable !== t && names.includes(fk.ftable)) st.add(fk.ftable);
    deps.set(t, st);
  }
  const order: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (t: string) => {
    if (done.has(t) || visiting.has(t)) return;
    visiting.add(t);
    for (const d of deps.get(t) ?? []) visit(d);
    visiting.delete(t);
    done.add(t);
    order.push(t);
  };
  names.forEach(visit);

  // Jumlah baris per tabel (0 bila dilewati / induk wajib kosong)
  const counts = new Map<string, number>();
  for (const t of order) {
    let n = DUMMY_SKIP.test(t) ? 0 : (DUMMY_COUNTS[t] ?? 5);
    for (const fk of (fks.get(t) ?? new Map()).values()) {
      const col = cols.get(t)!.find(c => c.name === fk.col)!;
      if (fk.fschema === 'public' && fk.ftable !== t && !col.nullable && (counts.get(fk.ftable) ?? 0) === 0) n = 0;
    }
    counts.set(t, n);
  }

  const authFkValue = (t: string, i: number) => pool[(i + (t === 'teachers' ? 2 : 0)) % pool.length].id;

  const valueOf = (t: string, c: TplCol, i: number): string | null => {
    const fk = fks.get(t)?.get(c.name);
    if (fk) {
      if (fk.fschema === 'auth') return q(authFkValue(t, i));
      if (fk.fschema === 'public') {
        if (fk.ftable === t) return null; // referensi ke diri sendiri: kosongkan
        const pc = counts.get(fk.ftable) ?? 0;
        if (pc === 0) return null;
        const pcol = cols.get(fk.ftable)?.find(x => x.name === fk.fcol);
        return pcol ? valueOf(fk.ftable, pcol, i % pc) : null;
      }
    }
    const n = c.name.toLowerCase();
    const al = allowed.get(`${t}.${c.name}`);
    const isText = ['text', 'varchar', 'bpchar', 'citext'].includes(c.udt);
    const isInt = ['int2', 'int4', 'int8'].includes(c.udt);
    const lim = (v: string) => (c.maxLen && v.length > c.maxLen ? v.slice(0, c.maxLen) : v);

    // kolom enum Postgres
    if (enumMap.has(c.udt)) {
      const labels = enumMap.get(c.udt)!;
      if (c.udt === 'app_role' && t === 'user_roles') return q(pool[i % pool.length].role ?? labels[0]);
      return q(labels[i % labels.length]);
    }
    if (t === 'user_roles' && n === 'role') return q(pool[i % pool.length].role ?? 'teacher');

    if (c.udt === 'uuid') return q(fakeUuid(`${t}.${c.name}.${i}`));
    if (al && isText) return q(lim(al[0]));

    if (isText) {
      if (n === 'email') return q(t === 'profiles' ? pool[i % pool.length].email : `${t}${i + 1}@dummy.test`);
      if (n === 'full_name' || n === 'student_name' || n === 'teacher_name' || n === 'nama_lengkap') return q(lim(t === 'profiles' ? (i === 0 ? 'Super Admin' : dummyPerson(i)) : dummyPerson(i)));
      if (n === 'parent_name' || n === 'father_name' || n === 'mother_name' || n === 'guardian_name') return q(lim(dummyPerson(i, 5)));
      if (n === 'name') {
        if (t === 'classes') return q(`${7 + (Math.floor(i / 2) % 3)}${'AB'[i % 2]}`);
        if (t === 'schools') return q('SMP Negeri Contoh');
        if (/subject|mapel/.test(t)) return q(DUMMY_MAPEL[i % DUMMY_MAPEL.length]);
        return q(lim(`${t.replace(/_/g, ' ')} ${i + 1}`));
      }
      if (n === 'school_name') return q('SMP Negeri Contoh');
      if (n === 'headmaster_name') return q('Drs. Contoh Kepala Sekolah, M.Pd');
      if (n === 'nis') return q(`2026${pad(i + 1, 4)}`);
      if (n === 'nisn') return q(`00${pad(51234500 + i, 8)}`);
      if (n === 'nip' || n === 'headmaster_nip') return q(`19800101 200501 1 ${pad(i + 1, 3)}`);
      if (n === 'npsn') return q(`2020${pad(i + 1, 4)}`);
      if (/phone|no_hp|whatsapp|telepon/.test(n)) return q(`0812345${pad(i, 5)}`);
      if (/address|alamat/.test(n)) return q(`Jl. Contoh No. ${i + 1}, Ciamis`);
      if (n === 'birth_place') return q('Ciamis');
      if (n === 'gender' || n === 'jenis_kelamin') return q(['L', 'P'][i % 2]);
      if (/^(subject|mapel|mata_pelajaran)$/.test(n)) return q(DUMMY_MAPEL[i % DUMMY_MAPEL.length]);
      if (n === 'academic_year' || n === 'tahun_ajaran' || n.endsWith('_academic_year')) return q('2026/2027');
      if (n === 'status') return q(t === 'attendance' ? 'hadir' : 'aktif');
      if (/description|notes?|keterangan|catatan|content|message|isi/.test(n)) return q(lim('Data contoh'));
      if (/title|judul/.test(n)) return q(lim(`Contoh ${i + 1}`));
      return q(lim(`${c.name} ${i + 1}`));
    }
    if (c.udt === 'bool') return n === 'is_alumni' ? 'FALSE' : 'TRUE';
    if (isInt || c.udt === 'numeric' || c.udt === 'float4' || c.udt === 'float8') {
      let v = i + 1;
      if (n === 'semester' || n === 'active_semester') v = 1;
      else if ((n === 'grade' || n === 'tingkat') && t === 'classes') v = 7 + (Math.floor(i / 2) % 3); // selaras dengan nama kelas 7A,7B,8A,...
      else if (n === 'grade' || n === 'tingkat') v = 7 + (i % 3);
      else if (n === 'day_of_week') v = (i % 5) + 1;
      else if (/amount|nominal|price|harga|total|biaya/.test(n)) v = 100000 * (i + 1);
      else if (/score|nilai|point|poin/.test(n)) v = 70 + ((i * 3) % 30);
      else if (!isInt) v = 1 + (i % 3);
      if (c.udt === 'numeric' && c.prec) {
        const maxAbs = Math.pow(10, c.prec - (c.scale || 0)) - 1;
        v = Math.min(v, maxAbs);
      }
      if (c.udt === 'int2') v = Math.min(v, 32000);
      return String(v);
    }
    if (c.udt === 'date') {
      if (n === 'birth_date') return q(`2011-0${1 + (i % 9)}-1${i % 9}`);
      return q(`2026-08-${pad(1 + (i % 28), 2)}`);
    }
    if (c.udt === 'timestamptz' || c.udt === 'timestamp') return q(`2026-08-${pad(1 + (i % 28), 2)}T07:00:00+00:00`);
    if (c.udt === 'time' || c.udt === 'timetz') {
      const hh = 7 + (i % 6);
      return q(n.startsWith('end') || n.includes('selesai') ? `${pad(hh, 2)}:40:00` : `${pad(hh, 2)}:00:00`);
    }
    if (c.udt === 'jsonb' || c.udt === 'json') return q('{}');
    if (c.udt.startsWith('_')) return q('{}');
    if (c.udt === 'bytea') return q('\\x');
    return null;
  };

  const KNOWN = /^(name|full_name|student_name|teacher_name|nama_lengkap|parent_name|email|nis|nisn|nip|npsn|phone|parent_phone|address|birth_place|birth_date|gender|subject|academic_year|semester|active_semester|grade|day_of_week|start_time|end_time|status|is_active|is_alumni|school_name|headmaster_name|date|role)$/;

  push(`-- Data dummy dibuat otomatis dari skema. Baris yang melanggar constraint dilewati (NOTICE), tidak menghentikan script.\n\n`);
  let totalRows = 0;
  for (const t of order) {
    const n = counts.get(t) ?? 0;
    if (n === 0) continue;
    const tc = cols.get(t)!;
    const pk = pks.get(t) ?? new Set<string>();
    const tfk = fks.get(t) ?? new Map<string, TplFk>();
    const useCols = tc.filter(c => {
      if (c.generated) return false;
      if (t === 'user_roles' && c.name === 'role') return true;
      if (pk.has(c.name) || tfk.has(c.name)) return true;
      if (!c.nullable && !c.hasDefault) return true;
      return KNOWN.test(c.name.toLowerCase());
    });
    if (useCols.length === 0) continue;
    push(`-- Dummy: ${t} (${n} baris)\n`);
    for (let i = 0; i < n; i++) {
      const names: string[] = [];
      const vals: string[] = [];
      for (const c of useCols) {
        const v = valueOf(t, c, i);
        if (v === null) {
          if (!c.nullable && !c.hasDefault) { names.length = 0; break; }
          continue;
        }
        names.push(`"${c.name}"`);
        vals.push(v);
      }
      if (names.length === 0) continue;
      push(`DO $d$ BEGIN INSERT INTO public."${t}" (${names.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'dummy ${t} dilewati: %', SQLERRM; END $d$;\n`);
      totalRows++;
    }
    push('\n');
  }
  push(`-- Total statement dummy: ${totalRows}\n\n`);
}

function emitTemplateAuth(
  push: (x: string) => void,
  pool: { id: string; email: string; role: string | null; hash: string; name: string }[],
) {
  push(`-- Akun: [0] = SUPER ADMIN. Akun dummy lain memakai password acak (tidak bisa login, reset lewat super admin).\n\n`);
  for (const u of pool) {
    const meta = JSON.stringify({ full_name: u.name });
    push(`DO $a$ BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  VALUES ('00000000-0000-0000-0000-000000000000', '${u.id}', 'authenticated', 'authenticated', ${q(u.email)}, ${q(u.hash)}, now(), '{"provider":"email","providers":["email"]}'::jsonb, ${q(meta)}::jsonb, now(), now(), '', '', '', '')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()), raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = now();
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Gagal membuat auth.users ${u.email}: %', SQLERRM; END $a$;\n`);
    push(`DO $a$ BEGIN
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES ('${u.id}', '${u.id}', ${q(JSON.stringify({ sub: u.id, email: u.email, email_verified: true }))}::jsonb, 'email', '${u.id}', now(), now(), now())
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_column THEN
  BEGIN
    INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES ('${u.id}', '${u.id}', ${q(JSON.stringify({ sub: u.id, email: u.email }))}::jsonb, 'email', now(), now(), now())
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Gagal membuat auth.identities ${u.email}: %', SQLERRM; END;
WHEN OTHERS THEN RAISE WARNING 'Gagal membuat auth.identities ${u.email}: %', SQLERRM; END $a$;\n`);
  }
  push('\n');
  const root = pool[0];
  // Pastikan profil & role super admin ada walau trigger handle_new_user berbeda
  push(`DO $a$ BEGIN
  INSERT INTO public.profiles (id, full_name, email) VALUES ('${root.id}', ${q(root.name)}, ${q(root.email)}) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
EXCEPTION WHEN OTHERS THEN
  BEGIN INSERT INTO public.profiles (id, full_name) VALUES ('${root.id}', ${q(root.name)}) ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'profil super admin dilewati: %', SQLERRM; END;
END $a$;\n`);
  for (const u of pool) {
    if (!u.role) continue;
    push(`DO $a$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '${u.id}' AND role::text = '${u.role}') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES ('${u.id}', '${u.role}');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Gagal memberi role ${u.role} ke ${u.email}: %', SQLERRM; END $a$;\n`);
  }
  push(`\nDO $a$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = '${root.id}') AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '${root.id}' AND role::text = 'super_admin') THEN
    RAISE NOTICE 'OK: akun super admin % siap dipakai login.', ${q(root.email)};
  ELSE
    RAISE WARNING 'PERHATIAN: akun super admin belum lengkap, periksa pesan WARNING di atas.';
  END IF;
END $a$;\n\n`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { user, error: authError } = await verifyAdminAuth(req, supabaseClient);
    if (authError) {
      return new Response(
        JSON.stringify({ error: authError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Opsi (hanya dipakai mode template): { mode: 'template', admin: { useCurrent | email, password, full_name } }
    let opts: any = {};
    try { opts = await req.json(); } catch (_) { opts = {}; }
    const template = opts?.mode === 'template';
    let tplPool: { id: string; email: string; role: string | null; hash: string; name: string }[] = [];
    if (template) {
      const a = opts.admin || {};
      let rootId = fakeUuid('template-super-admin');
      let rootEmail = String(a.email || '').trim().toLowerCase();
      let rootHash = '';
      let rootName = String(a.full_name || 'Super Admin').trim() || 'Super Admin';
      if (a.useCurrent) {
        const rows = await runSQL(supabaseClient, `SELECT id, email, encrypted_password, raw_user_meta_data FROM auth.users WHERE id = '${String(user.id).replace(/'/g, '')}'`);
        if (rows.length === 0) throw new Error('Akun super admin saat ini tidak ditemukan di auth.users');
        rootId = rows[0].id; rootEmail = rows[0].email; rootHash = rows[0].encrypted_password || '';
        rootName = rows[0].raw_user_meta_data?.full_name || rootName;
      } else {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rootEmail)) throw new Error('Email super admin tidak valid');
        const pw = String(a.password || '');
        if (pw.length < 8) throw new Error('Password super admin minimal 8 karakter');
        rootHash = bcrypt.hashSync(pw, 10).replace(/^\$2b\$/, () => '$2a$'); // $2a$ kompatibel dengan pgcrypto & GoTrue
      }
      const randomHash = () => bcrypt.hashSync(crypto.randomUUID() + crypto.randomUUID(), 6);
      tplPool = [{ id: rootId, email: rootEmail, role: 'super_admin', hash: rootHash, name: rootName }];
      tplPool.push({ id: fakeUuid('template-admin'), email: 'admin@dummy.test', role: 'admin', hash: randomHash(), name: 'Admin Contoh' });
      for (let k = 1; k <= 8; k++) tplPool.push({ id: fakeUuid(`template-teacher-${k}`), email: `guru${k}@dummy.test`, role: 'teacher', hash: randomHash(), name: dummyPerson(k + 1) });
    }

    console.log((template ? 'Template database export' : 'Full database export') + ' initiated by admin:', user.email);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
    const enc = new TextEncoder();
    const parts = { push: (x: string) => controller.enqueue(enc.encode(x)) };
    try {

    if (template) parts.push(`-- =====================================================================
-- TEMPLATE DATABASE (SKEMA + RLS + BUCKET + AKUN SUPER ADMIN + DATA DUMMY)
-- Generated: ${new Date().toISOString()}
--
-- CARA PAKAI
--  * Supabase online : buka Dashboard > SQL Editor > New query > tempel isi file ini > Run.
--                      (jika editor menolak ukuran file, tempel per bagian "SECTION" secara berurutan)
--  * Self-hosted     : psql -U postgres -d postgres -f file.sql
--                      atau tempel di SQL Editor Supabase Studio self-hosted.
--
-- File ini TIDAK berisi data asli sekolah. Seluruh data hanyalah contoh (dummy).
-- Aman dijalankan berulang kali (idempotent).
-- Login super admin: lihat bagian "SECTION 12" (email di bawah, password sesuai yang Anda isi saat export).
-- Super admin: ${tplPool[0]?.email}
-- =====================================================================

SET check_function_bodies = off;
SET client_min_messages = notice;
DO $x$ BEGIN PERFORM set_config('session_replication_role', 'replica', false); EXCEPTION WHEN OTHERS THEN NULL; END $x$;
SET search_path TO public, auth, storage, extensions;

`);
    else parts.push(`-- =============================================
-- FULL DATABASE MIGRATION EXPORT (IDEMPOTENT)
-- Generated: ${new Date().toISOString()}
-- Exported by: ${user.email}
-- 
-- CATATAN: File ini AMAN dijalankan berulang kali.
-- Semua DDL di-wrap dengan exception handler sehingga
-- tidak akan error meskipun objek sudah ada.
-- =============================================

-- INSTRUCTIONS:
-- 1. Upload file ini ke VPS
-- 2. Jalankan: docker cp migration.sql DB_CONTAINER:/tmp/migration.sql
-- 3. Jalankan: docker exec DB_CONTAINER psql -U postgres -d postgres -f /tmp/migration.sql
-- 4. Atau gunakan ~/deploy.sh yang sudah otomatis menjalankan migrasi

-- Disable foreign key checks during import
SET session_replication_role = 'replica';

-- Ensure search_path
SET search_path TO public, auth, storage, extensions;

`);

    // Template: tiap statement dibungkus agar satu kegagalan tidak membatalkan seluruh script di SQL Editor
    const safe = (stmt: string, label: string) =>
      template ? `DO $s$ BEGIN ${stmt}; EXCEPTION WHEN OTHERS THEN RAISE NOTICE '${label.replace(/'/g, '')} dilewati: %', SQLERRM; END $s$;\n` : `${stmt};\n`;
    // ========== 1. EXTENSIONS ==========
    parts.push(`-- =============================================\n-- SECTION 1: EXTENSIONS\n-- =============================================\n\n`);
    const extensions = await runSQL(supabaseClient, `SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql','pg_stat_statements','pgcrypto','pgjwt','uuid-ossp','supabase_vault','pgsodium')`);
    for (const ext of extensions) {
      if (template) parts.push(safe(`CREATE EXTENSION IF NOT EXISTS "${ext.extname}"`, 'extension ' + ext.extname));
      else parts.push(`CREATE EXTENSION IF NOT EXISTS "${ext.extname}";\n`);
    }
    parts.push('\n');

    // ========== 2. ENUMS ==========
    parts.push(`-- =============================================\n-- SECTION 2: CUSTOM TYPES / ENUMS\n-- =============================================\n\n`);
    const enumRows = await runSQL(supabaseClient, `SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder`);
    const enumMap = new Map<string, string[]>();
    for (const r of enumRows) enumMap.set(r.typname, [...(enumMap.get(r.typname) ?? []), r.enumlabel]);
    for (const [typname, labelList] of enumMap) {
      const labels = labelList.map((l: string) => escapeString(l)).join(', ');
      parts.push(`DO $$ BEGIN CREATE TYPE public."${typname}" AS ENUM (${labels}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;\n`);
      // ADD VALUE tidak boleh dalam blok transaksi yang sama dengan pemakaiannya; IF NOT EXISTS aman diulang
      for (const label of labelList) {
        parts.push(`DO $$ BEGIN ALTER TYPE public."${typname}" ADD VALUE IF NOT EXISTS ${escapeString(label)}; EXCEPTION WHEN OTHERS THEN NULL; END $$;\n`);
      }
    }
    parts.push('\n');

    // Sequence dibuat SEBELUM tabel (DEFAULT nextval(...) butuh sequence sudah ada)
    const sequences = await runSQL(supabaseClient, `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`);
    for (const seq of sequences) {
      parts.push(`CREATE SEQUENCE IF NOT EXISTS public."${seq.sequence_name}";\n`);
    }
    parts.push('\n');

    // Template: fungsi dibuat 2x. Pass 1 (sebelum tabel) agar DEFAULT yang memanggil fungsi tidak gagal;
    // gagal diabaikan karena sebagian fungsi SQL butuh tabel yang belum ada. Pass 2 (SECTION 6) membuat ulang semuanya.
    const wrapFn = (def: string, name: string) =>
      `DO $fnw$ BEGIN EXECUTE $fnbody$${def}$fnbody$; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'fungsi ${name} ditunda: %', SQLERRM; END $fnw$;\n`;
    if (template) {
      parts.push(`-- =============================================\n-- SECTION 2b: FUNCTIONS (PASS 1, sebelum tabel)\n-- =============================================\n\n`);
      const fnPass1 = await runSQL(supabaseClient, `SELECT p.proname, pg_get_functiondef(p.oid) as funcdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY p.proname`);
      for (const fn of fnPass1) parts.push(wrapFn(fn.funcdef, fn.proname));
      parts.push('\n');
    }

    // ========== 3. TABLE SCHEMAS ==========
    parts.push(`-- =============================================\n-- SECTION 3: TABLE SCHEMAS\n-- =============================================\n\n`);

    const tables = await runSQL(supabaseClient, `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
    const tableNames = tables.map((t: any) => t.table_name).filter((n: string) => n !== 'processing_jobs');

    for (const tableName of tableNames) {
      const columns = await runSQL(supabaseClient, `SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale, is_generated, generation_expression FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' ORDER BY ordinal_position`);
      if (columns.length === 0) continue;

      parts.push(`-- Table: ${tableName}\n`);
      parts.push(`CREATE TABLE IF NOT EXISTS public."${tableName}" (\n`);

      const colDefs: string[] = [];
      for (const col of columns) {
        let colType = col.data_type;
        if (col.data_type === 'USER-DEFINED') colType = col.udt_name;
        else if (col.data_type === 'character varying') colType = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'text';
        else if (col.data_type === 'ARRAY') colType = col.udt_name.replace(/^_/, '') + '[]';
        else if (col.data_type === 'numeric' && col.numeric_precision) colType = `numeric(${col.numeric_precision},${col.numeric_scale || 0})`;
        else if (col.data_type === 'timestamp with time zone') colType = 'timestamptz';
        else if (col.data_type === 'timestamp without time zone') colType = 'timestamp';

        let def = `  "${col.column_name}" ${colType}`;
        if (col.is_nullable === 'NO') def += ' NOT NULL';
        if (col.is_generated === 'ALWAYS' && col.generation_expression) {
          def += ` GENERATED ALWAYS AS (${col.generation_expression}) STORED`;
        } else if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }
        colDefs.push(def);
      }

      parts.push(colDefs.join(',\n'));
      parts.push('\n);\n\n');

      // Primary keys - wrapped in exception handler
      const pks = await runSQL(supabaseClient, `SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_schema = 'public' AND tc.table_name = '${tableName}' AND tc.constraint_type = 'PRIMARY KEY'`);
      if (pks.length > 0) {
        const pkCols = pks.map((p: any) => `"${p.column_name}"`).join(', ');
        parts.push(`DO $$ BEGIN ALTER TABLE public."${tableName}" ADD PRIMARY KEY (${pkCols}); EXCEPTION WHEN invalid_table_definition OR duplicate_table THEN NULL; END $$;\n\n`);
      }

      // Unique constraints - wrapped in exception handler
      const uniques = await runSQL(supabaseClient, `SELECT tc.constraint_name, string_agg(kcu.column_name, ', ') as cols FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_schema = 'public' AND tc.table_name = '${tableName}' AND tc.constraint_type = 'UNIQUE' GROUP BY tc.constraint_name`);
      for (const u of uniques) {
        const quotedCols = u.cols.split(', ').map((c: string) => `"${c.trim()}"`).join(', ');
        parts.push(`DO $$ BEGIN ALTER TABLE public."${tableName}" ADD CONSTRAINT "${u.constraint_name}" UNIQUE (${quotedCols}); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;\n`);
      }
      if (uniques.length > 0) parts.push('\n');

      // Add missing columns (for tables that already exist but might be outdated)
      for (const col of columns) {
        let colType = col.data_type;
        if (col.data_type === 'USER-DEFINED') colType = col.udt_name;
        else if (col.data_type === 'character varying') colType = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'text';
        else if (col.data_type === 'ARRAY') colType = col.udt_name.replace(/^_/, '') + '[]';
        else if (col.data_type === 'numeric' && col.numeric_precision) colType = `numeric(${col.numeric_precision},${col.numeric_scale || 0})`;
        else if (col.data_type === 'timestamp with time zone') colType = 'timestamptz';
        else if (col.data_type === 'timestamp without time zone') colType = 'timestamp';

        let defaultClause = '';
        if (col.column_default && col.is_generated !== 'ALWAYS') {
          defaultClause = ` DEFAULT ${col.column_default}`;
        }
        parts.push(`DO $$ BEGIN ALTER TABLE public."${tableName}" ADD COLUMN IF NOT EXISTS "${col.column_name}" ${colType}${defaultClause}; EXCEPTION WHEN duplicate_column OR others THEN NULL; END $$;\n`);
      }
      parts.push('\n');
    }

    // ========== 4. FOREIGN KEYS ==========
    parts.push(`-- =============================================\n-- SECTION 4: FOREIGN KEYS\n-- =============================================\n\n`);

    const fks = await runSQL(supabaseClient, `SELECT tc.constraint_name, tc.table_name, kcu.column_name, ccu.table_schema AS foreign_table_schema, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name, rc.delete_rule, rc.update_rule FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY' ORDER BY tc.table_name`);

    for (const fk of fks) {
      if (!tableNames.includes(fk.table_name)) continue;
      const foreignRef = fk.foreign_table_schema === 'public'
        ? `public."${fk.foreign_table_name}"`
        : `${fk.foreign_table_schema}."${fk.foreign_table_name}"`;
      let stmt = `ALTER TABLE public."${fk.table_name}" ADD CONSTRAINT "${fk.constraint_name}" FOREIGN KEY ("${fk.column_name}") REFERENCES ${foreignRef}("${fk.foreign_column_name}")`;
      if (fk.delete_rule && fk.delete_rule !== 'NO ACTION') stmt += ` ON DELETE ${fk.delete_rule}`;
      if (fk.update_rule && fk.update_rule !== 'NO ACTION') stmt += ` ON UPDATE ${fk.update_rule}`;
      if (template) parts.push(safe(stmt, 'fk ' + fk.constraint_name));
      else parts.push(`DO $$ BEGIN ${stmt}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;\n`);
    }
    parts.push('\n');

    // ========== 5. INDEXES ==========
    parts.push(`-- =============================================\n-- SECTION 5: INDEXES\n-- =============================================\n\n`);

    const indexes = await runSQL(supabaseClient, `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey' AND indexname NOT LIKE 'pg_%' ORDER BY tablename, indexname`);
    for (const idx of indexes) {
      if (!tableNames.some((tn: string) => idx.indexdef.includes(` ON public.${tn} `) || idx.indexdef.includes(` ON public."${tn}" `))) continue;
      // Replace CREATE INDEX with CREATE INDEX IF NOT EXISTS
      const idxDef = idx.indexdef.replace(/^CREATE INDEX/, 'CREATE INDEX IF NOT EXISTS').replace(/^CREATE UNIQUE INDEX/, 'CREATE UNIQUE INDEX IF NOT EXISTS');
      parts.push(safe(idxDef, 'index ' + idx.indexname));
    }
    parts.push('\n');

    // ========== 6. FUNCTIONS (before RLS, triggers need functions) ==========
    parts.push(`-- =============================================\n-- SECTION 6: DATABASE FUNCTIONS\n-- =============================================\n\n`);

    const functions = await runSQL(supabaseClient, `SELECT p.proname, pg_get_functiondef(p.oid) as funcdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY p.proname`);
    for (const fn of functions) {
      parts.push(`-- Function: ${fn.proname}\n`);
      if (template) parts.push(wrapFn(fn.funcdef, fn.proname) + '\n');
      else parts.push(`${fn.funcdef};\n\n`);
    }

    // ========== 7. RLS POLICIES ==========
    parts.push(`-- =============================================\n-- SECTION 7: ROW LEVEL SECURITY\n-- =============================================\n\n`);

    const rlsTables = await runSQL(supabaseClient, `SELECT relname FROM pg_class JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND relrowsecurity = true`);
    const exportedTables = new Set<string>(tableNames);
    for (const t of rlsTables) {
      if (!exportedTables.has(t.relname)) continue; // tabel yang tidak diekspor (mis. processing_jobs)
      parts.push(safe(`ALTER TABLE public."${t.relname}" ENABLE ROW LEVEL SECURITY`, 'rls ' + t.relname));
    }
    parts.push('\n');

    const policies = await runSQL(supabaseClient, `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`);
    for (const p of policies) {
      if (!exportedTables.has(p.tablename)) continue;
      // DROP first, then CREATE — fully idempotent
      const dropStmt = `DROP POLICY IF EXISTS "${p.policyname}" ON public."${p.tablename}"`;
      if (!template) parts.push(dropStmt + ';\n');
      const permissive = p.permissive === 'PERMISSIVE' ? 'PERMISSIVE' : 'RESTRICTIVE';
      const roles = p.roles ? `TO ${p.roles}` : '';
      let stmt = `CREATE POLICY "${p.policyname}" ON public."${p.tablename}" AS ${permissive} FOR ${p.cmd} ${roles}`;
      if (p.qual) stmt += ` USING (${p.qual})`;
      if (p.with_check) stmt += ` WITH CHECK (${p.with_check})`;
      if (template) parts.push(safe(`${dropStmt}; ${stmt}`, 'policy ' + p.policyname) + '\n');
      else parts.push(`${stmt};\n\n`);
    }

    // ========== 8. TRIGGERS ==========
    parts.push(`-- =============================================\n-- SECTION 8: TRIGGERS\n-- =============================================\n\n`);

    const triggers = await runSQL(supabaseClient, `SELECT trigger_name, event_manipulation, event_object_table, action_statement, action_timing, action_orientation FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY event_object_table, trigger_name`);
    
    // Deduplicate triggers (same trigger can appear multiple times for different events)
    const triggerMap = new Map<string, any>();
    for (const tr of triggers) {
      const key = `${tr.trigger_name}_${tr.event_object_table}`;
      if (triggerMap.has(key)) {
        // Combine events (INSERT OR UPDATE OR DELETE)
        const existing = triggerMap.get(key);
        if (!existing.event_manipulation.includes(tr.event_manipulation)) {
          existing.event_manipulation += ` OR ${tr.event_manipulation}`;
        }
      } else {
        triggerMap.set(key, { ...tr });
      }
    }

    for (const [, tr] of triggerMap) {
      if (!exportedTables.has(tr.event_object_table)) continue;
      if (template) {
        parts.push(safe(`DROP TRIGGER IF EXISTS "${tr.trigger_name}" ON public."${tr.event_object_table}"; CREATE TRIGGER "${tr.trigger_name}" ${tr.action_timing} ${tr.event_manipulation} ON public."${tr.event_object_table}" FOR EACH ${tr.action_orientation} ${tr.action_statement}`, 'trigger ' + tr.trigger_name));
      } else {
        parts.push(`DROP TRIGGER IF EXISTS "${tr.trigger_name}" ON public."${tr.event_object_table}";\n`);
        parts.push(`CREATE TRIGGER "${tr.trigger_name}" ${tr.action_timing} ${tr.event_manipulation} ON public."${tr.event_object_table}" FOR EACH ${tr.action_orientation} ${tr.action_statement};\n\n`);
      }
    }

    // ========== 10. REALTIME ==========
    parts.push(`-- =============================================\n-- SECTION 10: REALTIME PUBLICATIONS\n-- =============================================\n\n`);

    const realtimeTables = await runSQL(supabaseClient, `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`);
    for (const rt of realtimeTables) {
      if (!tableNames.includes(rt.tablename)) continue;
      if (template) parts.push(safe(`ALTER PUBLICATION supabase_realtime ADD TABLE public."${rt.tablename}"`, 'realtime ' + rt.tablename));
      else parts.push(`DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."${rt.tablename}"; EXCEPTION WHEN duplicate_object THEN NULL; END $$;\n`);
    }
    parts.push('\n');

    if (template) {
      // ========== 11. DATA DUMMY ==========
      parts.push(`-- =============================================\n-- SECTION 11: DATA DUMMY\n-- =============================================\n\n`);
      // Akun auth dibuat DULU karena banyak tabel mereferensikan auth.users
      parts.push(`-- =============================================\n-- SECTION 12: AKUN SUPER ADMIN & AKUN DUMMY (auth.users)\n-- =============================================\n\n`);
      emitTemplateAuth((x) => parts.push(x), tplPool);
      await emitDummyData(supabaseClient, tableNames, enumMap, tplPool, (x) => parts.push(x));
    } else {
    // ========== 11. DATA ==========
    parts.push(`-- =============================================\n-- SECTION 11: TABLE DATA\n-- =============================================\n\n`);
    parts.push(`-- Data akan di-upsert (insert atau update yang sudah ada) - tidak ada data yang dihapus\n\n`);

    console.log(`Exporting data for ${tableNames.length} tables...`);

    // Data ditulis langsung ke stream per halaman (tidak ditampung di memori)
    const BATCH = 1000;
    for (let i = 0; i < tableNames.length; i++) {
      const tableName = tableNames[i];

      const colMeta = await runSQL(supabaseClient, `SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' AND (is_generated IS NULL OR is_generated = 'NEVER') ORDER BY ordinal_position`);
      if (colMeta.length === 0) continue;
      const udt: Record<string, string> = {};
      colMeta.forEach((c: any) => { udt[c.column_name] = c.udt_name; });
      const selectCols = colMeta.map((c: any) => `"${c.column_name}"`).join(', ');

      const pkRows = await runSQL(supabaseClient, `SELECT a.attname AS column_name FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = 'public."${tableName}"'::regclass AND i.indisprimary ORDER BY array_position(i.indkey::int2[], a.attnum)`);
      const pkCols: string[] = pkRows.map((r: any) => r.column_name);
      // Urutan stabil agar paging OFFSET tidak melewatkan / menggandakan baris
      const orderBy = pkCols.length > 0 ? pkCols.map(c => `"${c}"`).join(', ') : 'ctid';

      let offset = 0;
      let total = 0;
      while (true) {
        const rows = await runSQL(supabaseClient, `SELECT ${selectCols} FROM public."${tableName}" ORDER BY ${orderBy} LIMIT ${BATCH} OFFSET ${offset}`);
        if (!rows || rows.length === 0) break;
        if (total === 0) parts.push(`-- Data: ${tableName}\n`);
        for (const record of rows) {
          parts.push(generateUpsertStatement(tableName, record, udt, pkCols) + '\n');
        }
        total += rows.length;
        if (rows.length < BATCH) break;
        offset += BATCH;
      }

      if (total === 0) {
        parts.push(`-- No data in ${tableName}\n\n`);
      } else {
        parts.push(`-- (${total} records)\n\n`);
        console.log(`  ${tableName}: ${total} records exported`);
      }
    }

    // ========== 12. AUTH USERS ==========
    parts.push(`-- =============================================\n-- SECTION 12: AUTH USERS\n-- =============================================\n\n`);
    parts.push(`-- Password di-export sebagai bcrypt hash. User tetap bisa login dengan password lama.\n\n`);

    try {
      // Baca langsung dari auth.users supaya hash password ikut ter-export.
      // (auth.admin.listUsers() TIDAK mengembalikan encrypted_password.)
      const userCols = `id, aud, role, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at`;
      const USER_BATCH = 500;
      let userOffset = 0;
      let userTotal = 0;
      const allUserRows: any[] = [];

      while (true) {
        const rows = await runSQL(supabaseClient, `SELECT ${userCols} FROM auth.users ORDER BY id LIMIT ${USER_BATCH} OFFSET ${userOffset}`);
        if (!rows || rows.length === 0) break;
        allUserRows.push(...rows);
        if (rows.length < USER_BATCH) break;
        userOffset += USER_BATCH;
      }

      if (allUserRows.length > 0) {
        parts.push(`-- Auth Users (${allUserRows.length} accounts)\n`);
        for (const u of allUserRows) {
          userTotal++;
          parts.push(`INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) VALUES ('00000000-0000-0000-0000-000000000000', ${escapeValue(u.id)}, ${escapeValue(u.aud || 'authenticated')}, ${escapeValue(u.role || 'authenticated')}, ${escapeValue(u.email)}, ${escapeValue(u.encrypted_password)}, ${escapeValue(u.email_confirmed_at)}, ${escapeValue(u.phone)}, ${escapeValue(u.phone_confirmed_at)}, ${escapeValue(u.raw_app_meta_data)}, ${escapeValue(u.raw_user_meta_data)}, ${escapeValue(u.is_super_admin)}, ${escapeValue(u.created_at)}, ${escapeValue(u.updated_at)}, '', '', '', '') ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = COALESCE(EXCLUDED.encrypted_password, auth.users.encrypted_password), email_confirmed_at = EXCLUDED.email_confirmed_at, raw_app_meta_data = EXCLUDED.raw_app_meta_data, raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = EXCLUDED.updated_at;\n`);
        }

        parts.push(`\n-- Auth Identities\n`);
        let identOffset = 0;
        while (true) {
          const idents = await runSQL(supabaseClient, `SELECT id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at FROM auth.identities ORDER BY id LIMIT ${USER_BATCH} OFFSET ${identOffset}`);
          if (!idents || idents.length === 0) break;
          for (const it of idents) {
            parts.push(`INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) VALUES (${escapeValue(it.id)}, ${escapeValue(it.user_id)}, ${escapeValue(it.identity_data)}, ${escapeValue(it.provider)}, ${escapeValue(it.provider_id)}, ${escapeValue(it.last_sign_in_at)}, ${escapeValue(it.created_at)}, ${escapeValue(it.updated_at)}) ON CONFLICT (provider, provider_id) DO NOTHING;\n`);
          }
          if (idents.length < USER_BATCH) break;
          identOffset += USER_BATCH;
        }
      } else {
        parts.push(`-- No auth users found\n`);
      }
    } catch (authExportError) {
      // Auth gagal tidak boleh membuat backup tabel ikut gagal, tapi harus terlihat jelas
      parts.push(`-- WARNING: gagal mengekspor auth users: ${String((authExportError as Error).message).replace(/\n/g, ' ')}\n`);
    }
    parts.push('\n');

    }

    // ========== 13. STORAGE BUCKETS ==========
    parts.push(`-- =============================================\n-- SECTION 13: STORAGE BUCKETS & POLICIES\n-- =============================================\n\n`);

    const { data: buckets } = await supabaseClient.storage.listBuckets();
    if (buckets && buckets.length > 0) {
      for (const bucket of buckets) {
        if (template) {
          const sizeLimit = (bucket as any).file_size_limit ?? null;
          const mimes = (bucket as any).allowed_mime_types as string[] | null | undefined;
          const mimeSql = mimes && mimes.length ? `ARRAY[${mimes.map((m: string) => escapeString(m)).join(',')}]::text[]` : 'NULL';
          parts.push(`DO $b$ BEGIN INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (${escapeString(bucket.id)}, ${escapeString(bucket.name)}, ${bucket.public ? 'TRUE' : 'FALSE'}, ${sizeLimit ?? 'NULL'}, ${mimeSql}) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types; EXCEPTION WHEN undefined_column THEN INSERT INTO storage.buckets (id, name, public) VALUES (${escapeString(bucket.id)}, ${escapeString(bucket.name)}, ${bucket.public ? 'TRUE' : 'FALSE'}) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public; END $b$;\n`);
        } else {
          parts.push(`INSERT INTO storage.buckets (id, name, public) VALUES ('${bucket.id}', '${bucket.name}', ${bucket.public}) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;\n`);
        }
      }
    }
    parts.push('\n');

    const storagePolicies = await runSQL(supabaseClient, `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'storage' ORDER BY tablename, policyname`);
    if (storagePolicies.length > 0) {
      parts.push(`-- Storage Policies\n`);
      for (const p of storagePolicies) {
        const dropSt = `DROP POLICY IF EXISTS "${p.policyname}" ON storage."${p.tablename}"`;
        if (!template) parts.push(dropSt + ';\n');
        const roles = p.roles ? `TO ${p.roles}` : '';
        let stmt = `CREATE POLICY "${p.policyname}" ON storage."${p.tablename}" FOR ${p.cmd} ${roles}`;
        if (p.qual) stmt += ` USING (${p.qual})`;
        if (p.with_check) stmt += ` WITH CHECK (${p.with_check})`;
        if (template) parts.push(safe(`${dropSt}; ${stmt}`, 'storage policy ' + p.policyname) + '\n');
        else parts.push(`${stmt};\n\n`);
      }
    }

    // ========== 14. RESET SEQUENCES ==========
    parts.push(`-- =============================================\n-- SECTION 14: RESET SEQUENCES TO MAX VALUES\n-- =============================================\n\n`);
    parts.push(`-- Reset semua sequence agar tidak konflik saat insert data baru\n`);

    // Get columns with sequences (serial/bigserial columns)
    const seqCols = await runSQL(supabaseClient, `SELECT table_name, column_name, replace(replace(column_default, 'nextval(''', ''), '''::regclass)', '') as seq_name FROM information_schema.columns WHERE table_schema = 'public' AND column_default LIKE 'nextval%' ORDER BY table_name`);
    for (const sc of seqCols) {
      parts.push(`DO $$ BEGIN PERFORM setval('${sc.seq_name}', COALESCE((SELECT MAX("${sc.column_name}") FROM public."${sc.table_name}"), 1)); EXCEPTION WHEN others THEN NULL; END $$;\n`);
    }
    parts.push('\n');

    // ========== FINALIZE ==========
    parts.push(`\n-- Re-enable foreign key checks\nDO $x$ BEGIN PERFORM set_config('session_replication_role', 'origin', false); EXCEPTION WHEN OTHERS THEN NULL; END $x$;\n\n`);
    parts.push(`-- =============================================\n-- MIGRATION COMPLETE\n-- File ini bisa dijalankan berulang kali tanpa error.\n-- =============================================\n`);

    console.log('Export completed');
    } catch (genError) {
      // Tandai file TIDAK lengkap supaya tidak dikira backup valid
      console.error('Export generation failed:', genError);
      try { parts.push(`\n-- EXPORT ERROR: ${String((genError as Error).message).replace(/\n/g, ' ')}\n`); } catch (_) { /* ignore */ }
    } finally {
      try { controller.close(); } catch (_) { /* ignore */ }
    }
      },
    });

    const filename = `${template ? 'template-database' : 'full-migration'}-${new Date().toISOString().split('T')[0]}.sql`;
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('Error in export-database:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
