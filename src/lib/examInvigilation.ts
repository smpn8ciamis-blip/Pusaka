// Jadwal pengawas ujian: penyusunan sesi, pembuatan jadwal otomatis, dan pemeriksaan bentrok.
// Murni (tanpa React/Supabase) agar mudah diuji. Satu "sel" = satu pengawas pada satu sesi, satu ruang, satu urutan (slot).
import { format } from 'date-fns';
import { sessionDate, type ExamSession } from '@/lib/examSchedule';

export interface InvTeacher {
  id: string;
  name: string;
  nip?: string | null;
  subject: string;
  jabatan?: string | null;
}

/** Satu sesi ujian (tanggal + jam mulai). Kunci `yyyy-MM-dd|HH:mm` dipakai juga di basis data. */
export interface InvSession {
  key: string;
  date: string;      // yyyy-MM-dd
  start: string;     // HH:mm
  end: string;       // HH:mm atau ''
  subject: string;
  day: string;       // "Senin"
  dateLabel: string; // "01 Desember 2026"
}

export interface InvConfig {
  rooms: number;
  perRoom: number;
  excluded: string[];
  avoidOwnSubject: boolean;
}

/** `${sessionKey}|${room}|${slot}` → id guru */
export type Assignment = Record<string, string>;

export interface InvRow {
  exam_date: string;
  start_time: string;
  end_time: string;
  subject: string;
  room_no: number;
  slot: number;
  teacher_id: string;
}

export const cellKey = (sessionKey: string, room: number, slot: number) => `${sessionKey}|${room}|${slot}`;
export const parseCellKey = (k: string) => {
  const [date, start, room, slot] = k.split('|');
  return { sessionKey: `${date}|${start}`, room: Number(room), slot: Number(slot) };
};

const TIME_RE = /^\d{2}:\d{2}$/;
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** Ubah jadwal ujian menjadi sesi pengawasan. Sesi tanpa tanggal/jam mulai dilewati (dihitung di `skipped`). */
export function buildInvSessions(schedule: ExamSession[]): { sessions: InvSession[]; skipped: number } {
  const map = new Map<string, InvSession>();
  let skipped = 0;
  for (const s of schedule) {
    const d = sessionDate(s);
    const start = (s.startTime || '').trim();
    if (!d || !TIME_RE.test(start)) { skipped++; continue; }
    const date = format(d, 'yyyy-MM-dd');
    const key = `${date}|${start}`;
    const end = TIME_RE.test((s.endTime || '').trim()) ? (s.endTime as string).trim() : '';
    const prev = map.get(key);
    if (prev) {
      // dua mapel pada tanggal + jam mulai yang sama berbagi pengawas yang sama
      if (s.subject && !prev.subject.split(' / ').includes(s.subject)) prev.subject = `${prev.subject} / ${s.subject}`;
      if (end && (!prev.end || mins(end) > mins(prev.end))) prev.end = end;
      continue;
    }
    map.set(key, { key, date, start, end, subject: s.subject || '', day: s.day || '', dateLabel: s.date || '' });
  }
  const sessions = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  return { sessions, skipped };
}

/** Dua sesi bertabrakan bila tanggal sama dan rentang jamnya beririsan (tanpa jam selesai dianggap 90 menit). */
export function sessionsOverlap(a: InvSession, b: InvSession): boolean {
  if (a.date !== b.date) return false;
  const ae = a.end ? mins(a.end) : mins(a.start) + 90;
  const be = b.end ? mins(b.end) : mins(b.start) + 90;
  return mins(a.start) < be && mins(b.start) < ae;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Perkiraan: apakah mapel guru sama dengan mapel sesi (mis. "IPA" ~ "Ilmu Pengetahuan Alam (IPA)"). */
export function isOwnSubject(teacherSubject: string, sessionSubject: string): boolean {
  const t = norm(teacherSubject);
  if (!t) return false;
  const parts = sessionSubject.split('/').map((x) => x.trim()).filter(Boolean);
  for (const p of parts) {
    const full = norm(p);
    const abbr = (p.match(/\(([^)]+)\)/)?.[1] ?? '');
    const a = norm(abbr);
    const base = norm(p.replace(/\([^)]*\)/g, ' '));
    if (!full) continue;
    if (t === full || t === base || (a && t === a)) return true;
    if (t.length >= 4 && (base.includes(t) || t.includes(base))) return true;
  }
  return false;
}

export function toRows(assign: Assignment, sessions: InvSession[]): InvRow[] {
  const by = new Map(sessions.map((s) => [s.key, s]));
  const rows: InvRow[] = [];
  for (const [k, teacherId] of Object.entries(assign)) {
    const { sessionKey, room, slot } = parseCellKey(k);
    const s = by.get(sessionKey);
    if (!s || !teacherId) continue;
    rows.push({ exam_date: s.date, start_time: s.start, end_time: s.end, subject: s.subject, room_no: room, slot, teacher_id: teacherId });
  }
  return rows.sort((a, b) => `${a.exam_date}${a.start_time}`.localeCompare(`${b.exam_date}${b.start_time}`) || a.room_no - b.room_no || a.slot - b.slot);
}

export function fromRows(rows: { exam_date: string; start_time: string; room_no: number; slot: number; teacher_id: string }[]): Assignment {
  const a: Assignment = {};
  for (const r of rows) a[cellKey(`${String(r.exam_date).slice(0, 10)}|${r.start_time}`, r.room_no, r.slot)] = r.teacher_id;
  return a;
}

export interface GenerateResult {
  assignment: Assignment;
  /** sel yang tidak bisa diisi karena guru tidak cukup */
  unfilled: number;
  /** penugasan yang terpaksa mengawas mapelnya sendiri karena tidak ada pilihan lain */
  relaxedOwnSubject: number;
}

/**
 * Susun jadwal otomatis. Aturan:
 *  1. satu guru tidak mengawas dua ruang pada sesi yang jamnya beririsan;
 *  2. guru yang dikecualikan tidak dipakai;
 *  3. (opsional) guru tidak mengawas sesi mapelnya sendiri, kecuali tidak ada pilihan lain;
 *  4. beban dibagi rata: yang tugasnya paling sedikit dipilih dulu, lalu yang paling sedikit hari itu,
 *     lalu yang paling lama beristirahat, lalu urutan nama (hasil selalu sama untuk masukan yang sama).
 * mode 'empty' menjaga sel yang sudah terisi dan hanya melengkapi yang kosong; 'all' menyusun ulang semuanya.
 */
export function generateInvigilation(
  sessions: InvSession[],
  teachers: InvTeacher[],
  cfg: InvConfig,
  existing: Assignment = {},
  mode: 'all' | 'empty' = 'all',
): GenerateResult {
  const pool = teachers
    .filter((t) => !cfg.excluded.includes(t.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const byId = new Map(teachers.map((t) => [t.id, t]));
  const sIndex = new Map(sessions.map((s, i) => [s.key, i]));

  const assign: Assignment = {};
  if (mode === 'empty') {
    for (const [k, v] of Object.entries(existing)) {
      const { sessionKey, room, slot } = parseCellKey(k);
      if (sIndex.has(sessionKey) && room >= 1 && room <= cfg.rooms && slot >= 1 && slot <= cfg.perRoom && byId.has(v)) assign[k] = v;
    }
  }

  const load = new Map<string, number>();
  const dayLoad = new Map<string, number>();       // `${teacher}|${date}`
  const lastIdx = new Map<string, number>();       // sesi terakhir yang diawasi
  const taught = new Map<string, number[]>();      // guru → indeks sesi yang sudah ditugaskan
  const note = (teacherId: string, si: number) => {
    load.set(teacherId, (load.get(teacherId) || 0) + 1);
    const dk = `${teacherId}|${sessions[si].date}`;
    dayLoad.set(dk, (dayLoad.get(dk) || 0) + 1);
    lastIdx.set(teacherId, Math.max(lastIdx.get(teacherId) ?? -1, si));
    const l = taught.get(teacherId) || []; l.push(si); taught.set(teacherId, l);
  };
  for (const [k, v] of Object.entries(assign)) note(v, sIndex.get(parseCellKey(k).sessionKey)!);

  let unfilled = 0;
  let relaxed = 0;
  sessions.forEach((s, si) => {
    for (let slot = 1; slot <= cfg.perRoom; slot++) {
      for (let room = 1; room <= cfg.rooms; room++) {
        const k = cellKey(s.key, room, slot);
        if (assign[k]) continue;
        const free = pool.filter((t) => !(taught.get(t.id) || []).some((oi) => oi === si || sessionsOverlap(sessions[oi], s)));
        const strict = cfg.avoidOwnSubject ? free.filter((t) => !isOwnSubject(t.subject, s.subject)) : free;
        const from = strict.length ? strict : free;
        if (!from.length) { unfilled++; continue; }
        if (!strict.length && cfg.avoidOwnSubject) relaxed++;
        from.sort((a, b) =>
          (load.get(a.id) || 0) - (load.get(b.id) || 0)
          || (dayLoad.get(`${a.id}|${s.date}`) || 0) - (dayLoad.get(`${b.id}|${s.date}`) || 0)
          || (lastIdx.get(a.id) ?? -1) - (lastIdx.get(b.id) ?? -1)
          || a.name.localeCompare(b.name, 'id'));
        assign[k] = from[0].id;
        note(from[0].id, si);
      }
    }
  });
  return { assignment: assign, unfilled, relaxedOwnSubject: relaxed };
}

export type ProblemKind = 'bentrok' | 'kosong' | 'mapel_sendiri' | 'dikecualikan' | 'guru_hilang';
export interface Problem { kind: ProblemKind; message: string; cell?: string }

/** Periksa jadwal yang sedang disusun (dipakai untuk peringatan di layar sebelum disimpan). */
export function findProblems(sessions: InvSession[], teachers: InvTeacher[], cfg: InvConfig, assign: Assignment): Problem[] {
  const out: Problem[] = [];
  const byId = new Map(teachers.map((t) => [t.id, t]));
  const sBy = new Map(sessions.map((s) => [s.key, s]));
  const label = (s: InvSession) => `${s.day ? `${s.day}, ` : ''}${s.dateLabel || s.date} ${s.start}`;

  const entries = Object.entries(assign).filter(([k]) => sBy.has(parseCellKey(k).sessionKey));
  const perTeacher = new Map<string, { cell: string; session: InvSession; room: number }[]>();
  for (const [k, tid] of entries) {
    const { sessionKey, room } = parseCellKey(k);
    const s = sBy.get(sessionKey)!;
    const t = byId.get(tid);
    if (!t) { out.push({ kind: 'guru_hilang', message: `${label(s)} Ruang ${room}: guru tidak ditemukan lagi`, cell: k }); continue; }
    if (cfg.excluded.includes(tid)) out.push({ kind: 'dikecualikan', message: `${t.name} ditandai tidak mengawas, tetapi masih dijadwalkan (${label(s)} Ruang ${room})`, cell: k });
    if (isOwnSubject(t.subject, s.subject)) out.push({ kind: 'mapel_sendiri', message: `${t.name} mengawas mapelnya sendiri (${s.subject}) — ${label(s)} Ruang ${room}`, cell: k });
    const l = perTeacher.get(tid) || []; l.push({ cell: k, session: s, room }); perTeacher.set(tid, l);
  }
  for (const [tid, list] of perTeacher) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (list[i].session.key === list[j].session.key || sessionsOverlap(list[i].session, list[j].session)) {
        out.push({ kind: 'bentrok', message: `${byId.get(tid)?.name ?? 'Guru'} bertugas di dua tempat sekaligus: ${label(list[i].session)} Ruang ${list[i].room} dan ${label(list[j].session)} Ruang ${list[j].room}`, cell: list[j].cell });
      }
    }
  }
  let empty = 0;
  for (const s of sessions) for (let room = 1; room <= cfg.rooms; room++) for (let slot = 1; slot <= cfg.perRoom; slot++) if (!assign[cellKey(s.key, room, slot)]) empty++;
  if (empty) out.push({ kind: 'kosong', message: `${empty} tempat pengawas masih kosong` });
  return out;
}

export interface TeacherLoad { id: string; name: string; total: number; days: number; items: { session: InvSession; room: number; slot: number }[] }

export function teacherLoads(sessions: InvSession[], teachers: InvTeacher[], assign: Assignment): TeacherLoad[] {
  const sBy = new Map(sessions.map((s) => [s.key, s]));
  const map = new Map<string, TeacherLoad>(teachers.map((t) => [t.id, { id: t.id, name: t.name, total: 0, days: 0, items: [] }]));
  for (const [k, tid] of Object.entries(assign)) {
    const { sessionKey, room, slot } = parseCellKey(k);
    const s = sBy.get(sessionKey); const l = map.get(tid);
    if (s && l) l.items.push({ session: s, room, slot });
  }
  for (const l of map.values()) {
    l.items.sort((a, b) => a.session.key.localeCompare(b.session.key) || a.room - b.room);
    l.total = l.items.length;
    l.days = new Set(l.items.map((i) => i.session.date)).size;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'));
}
