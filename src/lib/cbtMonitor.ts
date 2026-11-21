/**
 * Logika murni untuk halaman Pantau CBT: menggabungkan sesi + daftar siswa kelas + pelanggaran menjadi baris tabel,
 * lalu menyaring, mengurutkan, dan memotong per halaman di sisi klien (ratusan baris, tanpa permintaan tambahan).
 */

export type MonStatus = 'belum' | 'mengerjakan' | 'jeda' | 'selesai';

export const STATUS_LABEL: Record<MonStatus, string> = {
  belum: 'Belum mulai',
  mengerjakan: 'Mengerjakan',
  jeda: 'Dijeda',
  selesai: 'Selesai',
};

/** Tanpa denyut selama ini = dianggap offline (sama dengan peringatan "Akhiri" di halaman ujian). */
export const OFFLINE_AFTER_MS = 90_000;

export interface RawSession {
  id: string;
  student_id: string;
  status: string | null;
  attempt_number?: number | null;
  is_remedial?: boolean | null;
  answered_count?: number | null;
  time_remaining_seconds?: number | null;
  last_activity_at?: string | null;
  start_time?: string | null;
  score?: number | null;
  grading_status?: string | null;
  students?: { full_name?: string | null; nis?: string | null; class_id?: string | null; classes?: { name?: string | null; grade?: string | number | null } | null } | null;
}
export interface RawStudent {
  id: string;
  full_name: string;
  nis: string | null;
  class_id: string | null;
  classes?: { name?: string | null; grade?: string | number | null } | null;
}
export interface ViolationInfo { total: number; lastType: string | null; lastAt: string | null }

export interface MonRow {
  key: string;
  sessionId: string | null;
  studentId: string;
  name: string;
  nis: string;
  classKey: string;
  classLabel: string;
  status: MonStatus;
  rawStatus: string;
  attempt: number;
  remedial: boolean;
  answered: number;
  progress: number; // 0-100
  timeLeft: number | null; // detik, dari denyut terakhir
  lastActivityMs: number | null;
  startMs: number | null;
  offline: boolean;
  violations: number;
  lastViolation: string | null;
  score: number | null;
  needsGrading: boolean;
}

export function normStatus(raw: string | null | undefined): MonStatus {
  if (raw === 'paused') return 'jeda';
  if (raw === 'completed' || raw === 'timeout') return 'selesai';
  return 'mengerjakan';
}

const classLabelOf = (c: { name?: string | null; grade?: string | number | null } | null | undefined): string => {
  if (!c) return '-';
  const g = c.grade != null && String(c.grade) !== '' ? String(c.grade) + ' ' : '';
  return (g + (c.name || '')).trim() || '-';
};

export function buildRows(
  sessions: RawSession[],
  roster: RawStudent[],
  violations: Map<string, ViolationInfo>,
  totalQuestions: number,
  nowMs: number,
): MonRow[] {
  const rows: MonRow[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    seen.add(s.student_id);
    const status = normStatus(s.status);
    const answered = Math.max(0, s.answered_count || 0);
    const progress = totalQuestions > 0 ? Math.min(100, Math.round((answered / totalQuestions) * 100)) : 0;
    const t = s.last_activity_at ? new Date(s.last_activity_at).getTime() : NaN;
    const lastActivityMs = Number.isFinite(t) ? t : null;
    const v = violations.get(s.id);
    rows.push({
      key: s.id,
      sessionId: s.id,
      studentId: s.student_id,
      name: s.students?.full_name || 'Tanpa nama',
      nis: s.students?.nis || '-',
      classKey: s.students?.class_id || '',
      classLabel: classLabelOf(s.students?.classes),
      status,
      rawStatus: s.status || '',
      attempt: s.attempt_number || 1,
      remedial: !!s.is_remedial,
      answered,
      progress: status === 'selesai' ? 100 : progress,
      timeLeft: s.time_remaining_seconds == null ? null : Math.max(0, s.time_remaining_seconds),
      lastActivityMs,
      startMs: s.start_time && Number.isFinite(new Date(s.start_time).getTime()) ? new Date(s.start_time).getTime() : null,
      offline: status !== 'selesai' && (lastActivityMs == null || nowMs - lastActivityMs > OFFLINE_AFTER_MS),
      violations: v?.total || 0,
      lastViolation: v?.lastType || null,
      score: s.score == null ? null : Number(s.score),
      needsGrading: status === 'selesai' && !!s.grading_status && s.grading_status !== 'fully_graded',
    });
  }
  for (const st of roster) {
    if (seen.has(st.id)) continue;
    rows.push({
      key: 'x-' + st.id,
      sessionId: null,
      studentId: st.id,
      name: st.full_name,
      nis: st.nis || '-',
      classKey: st.class_id || '',
      classLabel: classLabelOf(st.classes),
      status: 'belum',
      rawStatus: '',
      attempt: 0,
      remedial: false,
      answered: 0,
      progress: 0,
      timeLeft: null,
      lastActivityMs: null,
      startMs: null,
      offline: false,
      violations: 0,
      lastViolation: null,
      score: null,
      needsGrading: false,
    });
  }
  return rows;
}

// ------------------------------------------------------------------ ringkasan
export interface MonSummary {
  total: number; belum: number; mengerjakan: number; jeda: number; selesai: number;
  offline: number; pelanggaran: number; avgProgress: number; perluKoreksi: number;
}
export function summarize(rows: MonRow[]): MonSummary {
  const s: MonSummary = { total: rows.length, belum: 0, mengerjakan: 0, jeda: 0, selesai: 0, offline: 0, pelanggaran: 0, avgProgress: 0, perluKoreksi: 0 };
  let sum = 0;
  for (const r of rows) {
    s[r.status]++;
    if (r.offline) s.offline++;
    if (r.violations > 0) s.pelanggaran++;
    if (r.needsGrading) s.perluKoreksi++;
    if (r.status === 'mengerjakan') sum += r.progress;
  }
  s.avgProgress = s.mengerjakan ? Math.round(sum / s.mengerjakan) : 0;
  return s;
}

// ------------------------------------------------------------------ filter
export interface MonFilter {
  q: string;
  status: MonStatus | 'all';
  classKey: string; // 'all' = semua
  onlyOffline: boolean;
  onlyViolations: boolean;
}
export const EMPTY_FILTER: MonFilter = { q: '', status: 'all', classKey: 'all', onlyOffline: false, onlyViolations: false };
export const isFilterActive = (f: MonFilter): boolean =>
  !!f.q.trim() || f.status !== 'all' || f.classKey !== 'all' || f.onlyOffline || f.onlyViolations;

export function applyFilter(rows: MonRow[], f: MonFilter): MonRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.classKey !== 'all' && r.classKey !== f.classKey) return false;
    if (f.onlyOffline && !r.offline) return false;
    if (f.onlyViolations && r.violations <= 0) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.nis.toLowerCase().includes(q))) return false;
    return true;
  });
}

// ------------------------------------------------------------------ urut
export type SortKey = 'attention' | 'name' | 'class' | 'status' | 'progress' | 'time' | 'activity' | 'violations' | 'score';
export interface MonSort { key: SortKey; dir: 'asc' | 'desc' }
export const DEFAULT_SORT: MonSort = { key: 'attention', dir: 'asc' };

const STATUS_ORDER: Record<MonStatus, number> = { mengerjakan: 0, jeda: 1, belum: 2, selesai: 3 };
const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });

/** Makin kecil makin perlu perhatian: offline saat mengerjakan, lalu banyak pelanggaran, dijeda, mengerjakan, belum mulai, selesai. */
export function attentionRank(r: MonRow): number {
  if (r.status === 'mengerjakan' && r.offline) return 0;
  if (r.status !== 'selesai' && r.violations > 0) return 1;
  if (r.status === 'jeda') return 2;
  if (r.status === 'mengerjakan') return 3;
  if (r.status === 'belum') return 4;
  if (r.needsGrading) return 5;
  return 6;
}

type Cmp = (a: MonRow, b: MonRow) => number;
const num = (a: number | null, b: number | null, dirMul: number): number => {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // kosong selalu di bawah, apa pun arahnya
  if (b == null) return -1;
  return (a - b) * dirMul;
};

export function sortRows(rows: MonRow[], s: MonSort): MonRow[] {
  const m = s.dir === 'asc' ? 1 : -1;
  const byName: Cmp = (a, b) => collator.compare(a.name, b.name);
  const cmp: Cmp = (() => {
    switch (s.key) {
      case 'name': return (a, b) => byName(a, b) * m;
      case 'class': return (a, b) => collator.compare(a.classLabel, b.classLabel) * m || byName(a, b);
      case 'status': return (a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * m || byName(a, b);
      case 'progress': return (a, b) => (a.progress - b.progress) * m || byName(a, b);
      case 'time': return (a, b) => num(a.timeLeft, b.timeLeft, m) || byName(a, b);
      case 'activity': return (a, b) => num(a.lastActivityMs, b.lastActivityMs, m) || byName(a, b);
      case 'violations': return (a, b) => (a.violations - b.violations) * m || byName(a, b);
      case 'score': return (a, b) => num(a.score, b.score, m) || byName(a, b);
      case 'attention':
      default: return (a, b) => (attentionRank(a) - attentionRank(b)) * m || (b.violations - a.violations) || byName(a, b);
    }
  })();
  return rows.slice().sort(cmp);
}

// ------------------------------------------------------------------ halaman
export const clampPage = (page: number, total: number, size: number): number => Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / size)));
export const pageSlice = <T,>(items: T[], page: number, size: number): T[] => items.slice((page - 1) * size, page * size);

// ------------------------------------------------------------------ pembantu
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Jalankan fn untuk tiap item dengan paling banyak `concurrency` yang berjalan bersamaan; galat satu item tidak menghentikan yang lain. */
export async function runLimited<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>, onProgress?: (done: number, failed: number) => void): Promise<{ done: number; failed: number }> {
  let i = 0; let done = 0; let failed = 0;
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++];
      try { await fn(item); } catch { failed++; }
      done++;
      onProgress?.(done, failed);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return { done, failed };
}

export function formatClock(sec: number | null): string {
  if (sec == null) return '-';
  const m = Math.floor(sec / 60);
  return String(m).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}

export function formatAgo(ms: number | null, nowMs: number): string {
  if (ms == null) return 'belum ada';
  const d = Math.max(0, Math.round((nowMs - ms) / 1000));
  if (d < 15) return 'baru saja';
  if (d < 60) return d + ' dtk lalu';
  if (d < 3600) return Math.floor(d / 60) + ' mnt lalu';
  return Math.floor(d / 3600) + ' jam lalu';
}
