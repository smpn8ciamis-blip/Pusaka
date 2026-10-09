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
    if (!student_id) throw new HttpError(400, 'student_id wajib diisi');
    if (password && String(password).length < 6) throw new HttpError(400, 'Password minimal 6 karakter');

    await authorize(supabase, req, student_id);

    const { data: account } = await supabase.from('student_accounts').select('user_id').eq('student_id', student_id).maybeSingle();
    if (!account) throw new HttpError(404, 'Siswa ini belum memiliki akun');

    const attrs: Record<string, unknown> = {};
    if (email) { attrs.email = String(email).trim().toLowerCase(); attrs.email_confirm = true; }
    if (password) attrs.password = password;
    if (full_name) attrs.user_metadata = { full_name };

    if (Object.keys(attrs).length > 0) {
      const { error } = await supabase.auth.admin.updateUserById(account.user_id, attrs);
      if (error) throw new HttpError(/already|registered|exists/i.test(error.message) ? 409 : 400,
        /already|registered|exists/i.test(error.message) ? `Email ${email} sudah dipakai akun lain` : error.message);
    }
    if (email || full_name) {
      const patch: Record<string, unknown> = {};
      if (email) patch.email = String(email).trim().toLowerCase();
      if (full_name) patch.full_name = full_name;
      await supabase.from('profiles').update(patch).eq('id', account.user_id);
    }
    return json({ success: true });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Unknown error' }, e instanceof HttpError ? e.status : 400);
  }
});
