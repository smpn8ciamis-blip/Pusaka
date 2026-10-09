import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Pemanggil harus: admin / super_admin / kesiswaan (sekolah yang sama), atau
 * guru yang menjadi wali kelas dari kelas siswa tersebut.
 */
async function authorize(supabase: any, req: Request, studentId: string) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new HttpError(401, 'Unauthorized');
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) throw new HttpError(401, 'Sesi tidak valid, silakan login ulang');

  const { data: student, error: stErr } = await supabase
    .from('students')
    .select('id, school_id, class_id, full_name, nis')
    .eq('id', studentId)
    .maybeSingle();
  if (stErr) throw new HttpError(400, stErr.message);
  if (!student) throw new HttpError(404, 'Siswa tidak ditemukan');

  const { data: roles } = await supabase.from('user_roles').select('role, school_id').eq('user_id', user.id);
  const privileged = (roles ?? []).some((r: any) =>
    r.role === 'super_admin' ||
    (['admin', 'kesiswaan'].includes(r.role) && (!r.school_id || !student.school_id || r.school_id === student.school_id)));

  if (!privileged) {
    let isHomeroom = false;
    if (student.class_id) {
      const { data: teacher } = await supabase.from('teachers').select('id').eq('user_id', user.id).maybeSingle();
      if (teacher) {
        const { data: cls } = await supabase
          .from('classes').select('id').eq('id', student.class_id).eq('homeroom_teacher_id', teacher.id).maybeSingle();
        isHomeroom = !!cls;
      }
    }
    if (!isHomeroom) throw new HttpError(403, 'Anda tidak berwenang mengelola akun siswa ini');
  }
  return { user, student };
}

const makeClient = () =>
  createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = makeClient();
  try {
    const { student_id, email, password, full_name } = await req.json();
    if (!student_id || !email || !password) throw new HttpError(400, 'student_id, email, dan password wajib diisi');
    if (String(password).length < 6) throw new HttpError(400, 'Password minimal 6 karakter');

    const { student } = await authorize(supabase, req, student_id);

    const { data: existing } = await supabase.from('student_accounts').select('id').eq('student_id', student_id).maybeSingle();
    if (existing) throw new HttpError(409, 'Siswa ini sudah memiliki akun');

    const name = full_name || student.full_name;
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (createError || !created?.user) {
      const msg = createError?.message ?? 'Gagal membuat akun';
      throw new HttpError(/already|registered|exists/i.test(msg) ? 409 : 400,
        /already|registered|exists/i.test(msg) ? `Email ${email} sudah dipakai akun lain` : msg);
    }
    const userId = created.user.id;

    try {
      const { error: pErr } = await supabase.from('profiles').upsert({ id: userId, email: String(email).trim().toLowerCase(), full_name: name });
      if (pErr) throw pErr;
      const { error: rErr } = await supabase.from('user_roles').insert({ user_id: userId, role: 'siswa', school_id: student.school_id });
      if (rErr) throw rErr;
      const { error: aErr } = await supabase.from('student_accounts').insert({ user_id: userId, student_id, school_id: student.school_id });
      if (aErr) throw aErr;
    } catch (e: any) {
      // Gagal di tengah jalan: hapus akun auth supaya tidak menyisakan data setengah jadi
      await supabase.from('user_roles').delete().eq('user_id', userId);
      await supabase.from('profiles').delete().eq('id', userId);
      await supabase.auth.admin.deleteUser(userId);
      throw new HttpError(400, e?.message ?? 'Gagal menyimpan data akun');
    }

    return json({ success: true, user_id: userId, email });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Unknown error' }, e instanceof HttpError ? e.status : 400);
  }
});
