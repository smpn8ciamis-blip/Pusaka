import { Apple, BookOpen, Dumbbell, Heart, Moon, Sunrise, Users, type LucideIcon } from 'lucide-react';

/** Gerakan 7 Kebiasaan Anak Indonesia Hebat (G7KAIH) */
export type HabitKey = 'wake' | 'worship' | 'exercise' | 'meal' | 'study' | 'social' | 'sleep';

export interface HabitDef {
  key: HabitKey;
  no: number;
  label: string;
  /** Singkatan untuk judul kolom sempit */
  short: string;
  /** Petunjuk singkat di formulir */
  hint: string;
  icon: LucideIcon;
  /** Warna tetap (hex) agar sama di layar dan PDF */
  color: string;
}

export const HABITS: HabitDef[] = [
  { key: 'wake', no: 1, label: 'Bangun Pagi', short: 'Bangun', hint: 'Bangun pagi dan bersiap memulai hari.', icon: Sunrise, color: '#f59e0b' },
  { key: 'worship', no: 2, label: 'Beribadah', short: 'Ibadah', hint: 'Beribadah sesuai agama dan kepercayaan masing-masing.', icon: Heart, color: '#10b981' },
  { key: 'exercise', no: 3, label: 'Berolahraga', short: 'Olahraga', hint: 'Bergerak aktif: senam, lari, bersepeda, olahraga permainan, dll.', icon: Dumbbell, color: '#ef4444' },
  { key: 'meal', no: 4, label: 'Makan Sehat dan Bergizi', short: 'Makan', hint: 'Makan makanan sehat dan bergizi (sarapan, buah, sayur, dll.).', icon: Apple, color: '#84cc16' },
  { key: 'study', no: 5, label: 'Gemar Belajar', short: 'Belajar', hint: 'Belajar, membaca, atau mengerjakan tugas dengan rasa ingin tahu.', icon: BookOpen, color: '#3b82f6' },
  { key: 'social', no: 6, label: 'Bermasyarakat', short: 'Masyarakat', hint: 'Membantu keluarga, kerja bakti, atau kegiatan sosial di rumah dan sekitar.', icon: Users, color: '#8b5cf6' },
  { key: 'sleep', no: 7, label: 'Tidur Cepat', short: 'Tidur', hint: 'Tidur lebih awal agar badan cukup istirahat.', icon: Moon, color: '#6366f1' },
];

export const HABIT_BY_KEY = Object.fromEntries(HABITS.map((h) => [h.key, h])) as Record<HabitKey, HabitDef>;

/** Siswa boleh mengisi/ubah/hapus jurnal sampai sekian hari ke belakang (harus sama dengan aturan RLS di migrasi) */
export const KAIH_EDIT_WINDOW_DAYS = 7;

export interface KaihEntry {
  id: string;
  student_id: string;
  class_id: string | null;
  entry_date: string; // YYYY-MM-DD
  wake_done: boolean;
  wake_time: string | null;
  worship_done: boolean;
  worship_note: string | null;
  exercise_done: boolean;
  exercise_note: string | null;
  exercise_minutes: number | null;
  meal_done: boolean;
  meal_note: string | null;
  study_done: boolean;
  study_note: string | null;
  study_minutes: number | null;
  social_done: boolean;
  social_note: string | null;
  sleep_done: boolean;
  sleep_time: string | null;
  notes: string | null;
  habit_count: number;
  created_at?: string;
  updated_at?: string;
}

/** Hasil RPC kaih_student_summary */
export interface KaihStudentSummary {
  student_id: string;
  full_name: string;
  nisn: string | null;
  class_id: string | null;
  class_name: string | null;
  entries: number;
  wake: number;
  worship: number;
  exercise: number;
  meal: number;
  study: number;
  social: number;
  sleep: number;
  last_entry: string | null;
}

export interface HabitStat {
  key: HabitKey;
  label: string;
  short: string;
  color: string;
  done: number;
  total: number;
  percent: number;
}

// ---------- tanggal (WIB) ----------
/** Hari ini menurut WIB (YYYY-MM-DD), tidak bergantung zona waktu perangkat. */
export const todayWib = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

export const parseIso = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
};
export const addDaysIso = (iso: string, days: number): string => {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const firstOfMonthIso = (iso: string): string => `${iso.slice(0, 7)}-01`;
/** Jumlah hari (inklusif) antara dua tanggal; 0 bila mulai > akhir. */
export const daysBetween = (start: string, end: string): number =>
  start > end ? 0 : Math.round((parseIso(end).getTime() - parseIso(start).getTime()) / 86400000) + 1;
/** Jurnal tanggal ini masih boleh diubah/dihapus siswa? */
export const isEditableDate = (entryDate: string, today = todayWib()): boolean =>
  entryDate >= addDaysIso(today, -KAIH_EDIT_WINDOW_DAYS) && entryDate <= today;

export const hhmm = (t?: string | null): string => (t ? t.slice(0, 5) : '');

/** "2026-11-15" -> "15 November 2026" */
export const fmtDateLong = (iso: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? parseIso(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : iso;
/** "2026-11-15" -> "Min, 15 Nov 2026" */
export const fmtDateShort = (iso: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? parseIso(iso).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : iso;

// ---------- perhitungan ----------
export const pct = (done: number, total: number): number => (total > 0 ? Math.round((done / total) * 1000) / 10 : 0);
export const fmtPct = (v: number): string => `${String(v).replace('.', ',')}%`;

export const isDone = (e: KaihEntry, key: HabitKey): boolean => Boolean(e[`${key}_done` as const]);

/** Keterangan singkat kebiasaan pada satu jurnal (untuk daftar dan PDF). */
export function habitDetail(e: KaihEntry, key: HabitKey): string {
  const join = (...p: (string | null | undefined)[]) => p.map((x) => (x ?? '').trim()).filter(Boolean).join(', ');
  switch (key) {
    case 'wake':
      return e.wake_time ? `Jam ${hhmm(e.wake_time)}` : '';
    case 'sleep':
      return e.sleep_time ? `Jam ${hhmm(e.sleep_time)}` : '';
    case 'worship':
      return e.worship_done ? join(e.worship_note) : '';
    case 'exercise':
      return e.exercise_done ? join(e.exercise_note, e.exercise_minutes != null ? `${e.exercise_minutes} menit` : '') : '';
    case 'study':
      return e.study_done ? join(e.study_note, e.study_minutes != null ? `${e.study_minutes} menit` : '') : '';
    case 'meal':
      return e.meal_done ? join(e.meal_note) : '';
    case 'social':
      return e.social_done ? join(e.social_note) : '';
  }
}

export function countEntries(entries: Pick<KaihEntry, `${HabitKey}_done`>[]): Record<HabitKey, number> {
  const c: Record<HabitKey, number> = { wake: 0, worship: 0, exercise: 0, meal: 0, study: 0, social: 0, sleep: 0 };
  entries.forEach((e) => HABITS.forEach((h) => { if (e[`${h.key}_done` as const]) c[h.key]++; }));
  return c;
}

export function makeStats(counts: Record<HabitKey, number>, total: number): { stats: HabitStat[]; overall: number } {
  const stats = HABITS.map((h) => ({ key: h.key, label: h.label, short: h.short, color: h.color, done: counts[h.key], total, percent: pct(counts[h.key], total) }));
  const sum = stats.reduce((a, s) => a + s.done, 0);
  return { stats, overall: pct(sum, total * HABITS.length) };
}

/** Persentase tiap kebiasaan dari kumpulan jurnal: hari terlaksana ÷ jumlah jurnal. */
export const statsFromEntries = (entries: KaihEntry[]) => makeStats(countEntries(entries), entries.length);

/** Persentase tiap kebiasaan dari rekap per siswa (jumlah semua siswa). */
export function statsFromSummary(rows: KaihStudentSummary[]) {
  const counts: Record<HabitKey, number> = { wake: 0, worship: 0, exercise: 0, meal: 0, study: 0, social: 0, sleep: 0 };
  let total = 0;
  rows.forEach((r) => {
    total += r.entries;
    HABITS.forEach((h) => { counts[h.key] += r[h.key]; });
  });
  return { ...makeStats(counts, total), total };
}

export const rowPercent = (r: KaihStudentSummary, key: HabitKey): number => pct(r[key], r.entries);
export const rowAverage = (r: KaihStudentSummary): number => pct(HABITS.reduce((a, h) => a + r[h.key], 0), r.entries * HABITS.length);

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// ---------- akses data ----------
/** Mengambil semua baris (PostgREST membatasi 1000 baris per permintaan). */
export async function fetchAllRows<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxPages = 50,
): Promise<T[]> {
  const all: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const { data, error } = await make(p * pageSize, p * pageSize + pageSize - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

/** Pesan kesalahan simpan yang mudah dipahami siswa. */
export function kaihErrorMessage(err: { code?: string; message?: string } | null | undefined): string {
  const msg = err?.message ?? 'Terjadi kesalahan.';
  if (err?.code === '23505' || /uq_kaih_student_date|duplicate key/i.test(msg)) return 'Jurnal untuk tanggal itu sudah ada. Pilih "Ubah" pada daftar jurnal.';
  if (err?.code === '42501' || /row-level security|violates row/i.test(msg)) return `Tanggal di luar batas pengisian (maksimal ${KAIH_EDIT_WINDOW_DAYS} hari ke belakang sampai hari ini).`;
  if (/masa depan/i.test(msg)) return 'Tanggal jurnal tidak boleh di masa depan.';
  if (err?.code === '23514') return 'Isian tidak valid (periksa durasi dan panjang teks).';
  return msg;
}
