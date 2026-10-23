#!/usr/bin/env node
// Uji beban CBT PUSAKA: mensimulasikan banyak siswa mengerjakan ujian bersamaan.
// Butuh Node 18+ (tanpa paket tambahan). Lihat README.md.
//
//   node loadtest.mjs seed    --students 200 --questions 40
//   node loadtest.mjs run     --students 200 --duration 180 --save-every 30
//   node loadtest.mjs cleanup
//
// Env: SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY (SERVICE_ROLE_KEY hanya untuk seed & cleanup)
import fs from 'node:fs';

const STATE_FILE = process.env.STATE_FILE || new URL('./.state.json', import.meta.url).pathname;
const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.ANON_KEY || '';
const SERVICE = process.env.SERVICE_ROLE_KEY || '';
const PASSWORD = 'LoadTest#2026';

const [cmd, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']] : a), []));
const num = (k, d) => (args[k] !== undefined ? Number(args[k]) : d);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);

function need(names) {
  const miss = names.filter((n) => !process.env[n]);
  if (miss.length) { console.error('Env belum diisi: ' + miss.join(', ')); process.exit(1); }
}

async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  });
  await Promise.all(workers);
}

// ---------- HTTP ----------
async function api(method, path, { token, key = ANON, body, prefer } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: {
      apikey: key, Authorization: 'Bearer ' + (token || key), 'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* bukan JSON */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return { json, bytes: text.length };
}
const svc = (method, path, body, prefer) => api(method, path, { key: SERVICE, body, prefer });

// ---------- SEED ----------
async function seed() {
  need(['SUPABASE_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']);
  if (fs.existsSync(STATE_FILE)) { console.error('Sudah ada data uji (' + STATE_FILE + '). Jalankan "cleanup" dulu.'); process.exit(1); }
  const nStudents = num('students', 100), nQuestions = num('questions', 40);
  const state = { users: [], students: [], questions: 0 };
  const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state));

  // sekolah & pemilik ujian: admin pertama yang punya school_id (atau lewat env)
  let schoolId = process.env.SCHOOL_ID, owner = process.env.OWNER_USER_ID;
  if (!schoolId || !owner) {
    const { json } = await svc('GET', '/rest/v1/user_roles?select=user_id,school_id&role=eq.admin&school_id=not.is.null&limit=1');
    if (!json?.length) { console.error('Admin tidak ditemukan. Isi SCHOOL_ID dan OWNER_USER_ID.'); process.exit(1); }
    schoolId = schoolId || json[0].school_id; owner = owner || json[0].user_id;
  }
  const { json: ss } = await svc('GET', '/rest/v1/school_settings?select=academic_year&limit=1');
  const year = ss?.[0]?.academic_year || '2026/2027';
  Object.assign(state, { schoolId, owner, year });

  const cls = await svc('POST', '/rest/v1/classes', { name: 'LOADTEST-CBT', grade: 7, academic_year: year }, 'return=representation');
  state.classId = cls.json[0].id; save();

  const exam = await svc('POST', '/rest/v1/cbt_exams', {
    teacher_id: owner, created_by: owner, school_id: schoolId, title: 'LOADTEST ujian uji beban', subject: 'LOADTEST',
    academic_year: year, class_id: state.classId, class_ids: [state.classId], duration_minutes: 120, total_questions: nQuestions,
    is_active: true, max_attempts: 1, allow_resume: true, require_token: false, exam_type: 'multiple_choice',
  }, 'return=representation');
  state.examId = exam.json[0].id; save();

  const para = '<p>' + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(6) + '</p>';
  const qs = Array.from({ length: nQuestions }, (_, i) => ({
    exam_id: state.examId, question_number: i + 1, question_text: `<p><b>Soal ${i + 1}</b></p>${para}`,
    option_a: 'Pilihan A panjang untuk uji', option_b: 'Pilihan B panjang untuk uji', option_c: 'Pilihan C panjang untuk uji',
    option_d: 'Pilihan D panjang untuk uji', correct_answer: 'ABCD'[rand(4)], points: 1, school_id: schoolId,
  }));
  await svc('POST', '/rest/v1/cbt_questions', qs);
  state.questions = nQuestions; save();
  console.log(`Ujian uji dibuat (${nQuestions} soal). Membuat ${nStudents} siswa uji…`);

  const stamp = Date.now().toString(36);
  const idx = Array.from({ length: nStudents }, (_, i) => i + 1);
  await pool(idx, 8, async (i) => {
    const email = `loadtest${stamp}-${i}@loadtest.invalid`;
    const st = await svc('POST', '/rest/v1/students', { nis: `LT${stamp}${i}`, full_name: `Siswa Uji ${i}`, class_id: state.classId, school_id: schoolId }, 'return=representation');
    const studentId = st.json[0].id; state.students.push(studentId);
    const u = await svc('POST', '/auth/v1/admin/users', { email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `Siswa Uji ${i}` } });
    const userId = u.json.id; state.users.push({ id: userId, email });
    await svc('POST', '/rest/v1/profiles', { id: userId, email, full_name: `Siswa Uji ${i}` }, 'resolution=merge-duplicates');
    await svc('POST', '/rest/v1/user_roles', { user_id: userId, role: 'siswa', school_id: schoolId });
    await svc('POST', '/rest/v1/student_accounts', { user_id: userId, student_id: studentId, school_id: schoolId });
    if (state.users.length % 25 === 0) { save(); process.stdout.write(`  ${state.users.length}/${nStudents}\r`); }
  }).catch((e) => { save(); console.error('\nGagal di tengah jalan: ' + e.message + '\nData yang sudah terbuat tercatat; jalankan "cleanup" untuk membersihkan.'); process.exit(1); });
  save();
  console.log(`\nSelesai: ${state.users.length} siswa uji. Jalankan "run" untuk memulai uji.`);
}

// ---------- CLEANUP ----------
async function cleanup() {
  need(['SUPABASE_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']);
  if (!fs.existsSync(STATE_FILE)) { console.log('Tidak ada data uji.'); return; }
  const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const safe = async (fn) => { try { await fn(); } catch (e) { console.error('  ! ' + e.message); } };
  console.log('Membersihkan data uji…');
  if (st.examId) await safe(() => svc('DELETE', `/rest/v1/cbt_exams?id=eq.${st.examId}`)); // soal, sesi, jawaban ikut terhapus
  await pool(st.users || [], 8, async (u) => {
    await safe(() => svc('DELETE', `/rest/v1/student_accounts?user_id=eq.${u.id}`));
    await safe(() => svc('DELETE', `/rest/v1/user_roles?user_id=eq.${u.id}`));
    await safe(() => svc('DELETE', `/rest/v1/profiles?id=eq.${u.id}`));
    await safe(() => svc('DELETE', `/auth/v1/admin/users/${u.id}`));
  });
  await pool(st.students || [], 8, (id) => safe(() => svc('DELETE', `/rest/v1/students?id=eq.${id}`)));
  if (st.classId) await safe(() => svc('DELETE', `/rest/v1/classes?id=eq.${st.classId}`));
  fs.unlinkSync(STATE_FILE);
  console.log('Selesai. Data uji dihapus.');
}

// ---------- RUN ----------
const metrics = new Map(); // nama -> { n, err, ms: [], bytes }
function rec(name, ms, ok, bytes = 0) {
  const m = metrics.get(name) || { n: 0, err: 0, ms: [], bytes: 0, firstErr: '' };
  m.n++; if (!ok) m.err++; m.ms.push(ms); m.bytes += bytes; metrics.set(name, m);
}
async function timed(name, fn) {
  const t0 = performance.now();
  try { const r = await fn(); rec(name, performance.now() - t0, true, r?.bytes || 0); return r; }
  catch (e) { rec(name, performance.now() - t0, false); const m = metrics.get(name); if (!m.firstErr) m.firstErr = e.message; throw e; }
}
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

async function student(u, o) {
  const rpc = (fn, body, name) => timed(name || fn, () => api('POST', '/rest/v1/rpc/' + fn, { token: u.token, body }));
  try {
    await sleep(o.ramp * 1000 * Math.random());
    await rpc('cbt_student_exams', {});
    const s = await rpc('cbt_start_session', { p_exam_id: o.examId, p_token: null });
    const sessionId = s.json.session.id;
    const paper = await rpc('cbt_exam_paper', { p_session_id: sessionId });
    const qids = paper.json.questions.map((q) => q.id);
    const answers = {};
    const endAt = Date.now() + o.duration * 1000;
    const pending = {};
    let nextSave = Date.now() + o.saveEvery * 1000 * (0.7 + Math.random() * 0.6);
    while (Date.now() < endAt) {
      await sleep(1000 + rand(2500)); // membaca & memilih jawaban
      if (Math.random() < 0.7) { const q = qids[rand(qids.length)]; const v = 'ABCD'[rand(4)]; answers[q] = v; pending[q] = v; }
      if (Date.now() >= nextSave) {
        const sent = { ...pending };
        await rpc('cbt_save_progress', { p_session_id: sessionId, p_answers: sent, p_essays: {}, p_time_remaining: Math.max(0, Math.round((endAt - Date.now()) / 1000)) });
        for (const k of Object.keys(sent)) delete pending[k];
        nextSave = Date.now() + o.saveEvery * 1000 * (0.7 + Math.random() * 0.6);
      }
    }
    if (!o.syncSubmit) await sleep(rand(o.submitSpread * 1000));
    await rpc('cbt_submit_session', { p_session_id: sessionId, p_answers: answers, p_essays: {}, p_timeout: false });
  } catch { /* sudah tercatat sebagai error di metrik */ }
}

async function run() {
  need(['SUPABASE_URL', 'ANON_KEY']);
  if (!fs.existsSync(STATE_FILE)) { console.error('Belum ada data uji. Jalankan "seed" dulu.'); process.exit(1); }
  const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const n = Math.min(num('students', st.users.length), st.users.length);
  const o = {
    examId: st.examId, duration: num('duration', 180), saveEvery: num('save-every', 30),
    ramp: args['sync-start'] ? 0 : num('ramp', 20), syncSubmit: !!args['sync-submit'], submitSpread: num('submit-spread', 20),
  };
  const users = st.users.slice(0, n).map((u) => ({ ...u, token: null }));
  console.log(`Login ${n} siswa uji (maks ${num('login-rate', 5)}/detik)…`);
  const gap = 1000 / num('login-rate', 5);
  let failedLogin = 0;
  await pool(users, 4, async (u) => {
    const t0 = Date.now();
    try { const r = await timed('login', () => api('POST', '/auth/v1/token?grant_type=password', { body: { email: u.email, password: PASSWORD } })); u.token = r.json.access_token; }
    catch { failedLogin++; }
    await sleep(Math.max(0, gap * 4 - (Date.now() - t0)));
  });
  const ready = users.filter((u) => u.token);
  if (!ready.length) { console.error('Semua login gagal. Pesan: ' + (metrics.get('login')?.firstErr || '?')); process.exit(1); }
  if (failedLogin) console.warn(`  ! ${failedLogin} login gagal (kemungkinan batas laju GoTrue); lanjut dengan ${ready.length} siswa.`);
  console.log(`Mulai uji: ${ready.length} siswa, ${o.duration}s, simpan tiap ~${o.saveEvery}s, ` + (args['sync-start'] ? 'MULAI SERENTAK' : `ramp ${o.ramp}s`) + (o.syncSubmit ? ', KUMPUL SERENTAK' : '') + '\n');
  const t0 = performance.now();
  await Promise.all(ready.map((u) => student(u, o)));
  const total = (performance.now() - t0) / 1000;

  const rows = [['Endpoint', 'jumlah', 'galat', 'p50 ms', 'p95 ms', 'p99 ms', 'maks ms', 'KB/resp']];
  let verdict = true;
  for (const [name, m] of metrics) {
    rows.push([name, m.n, m.err, Math.round(pct(m.ms, 50)), Math.round(pct(m.ms, 95)), Math.round(pct(m.ms, 99)), Math.round(Math.max(...m.ms)), (m.bytes / Math.max(1, m.n - m.err) / 1024).toFixed(1)]);
    if (m.err / m.n > 0.01 || (name !== 'cbt_exam_paper' && name !== 'login' && pct(m.ms, 95) > 2000)) verdict = false;
  }
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  console.log(rows.map((r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ')).join('\n'));
  const reqs = [...metrics.values()].reduce((a, m) => a + m.n, 0);
  console.log(`\nTotal ${reqs} permintaan dalam ${total.toFixed(0)} detik (rata-rata ${(reqs / total).toFixed(1)}/detik).`);
  for (const [name, m] of metrics) if (m.firstErr) console.log(`Galat pertama ${name}: ${m.firstErr}`);
  console.log(verdict ? '\nHASIL: LOLOS (galat < 1% dan p95 < 2 detik).' : '\nHASIL: PERLU PERHATIAN (galat ≥ 1% atau p95 ≥ 2 detik). Lihat tabel; pantau CPU/RAM server saat uji.');
}

const cmds = { seed, run, cleanup };
if (!cmds[cmd]) { console.log('Perintah: seed | run | cleanup\nLihat README.md'); process.exit(cmd ? 1 : 0); }
cmds[cmd]().catch((e) => { console.error(e.message); process.exit(1); });
