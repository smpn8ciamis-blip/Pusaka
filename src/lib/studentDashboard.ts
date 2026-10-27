// src/lib/studentDashboard.ts
// Fungsi bantu bersama untuk dashboard siswa (tampilan mobile dan desktop).
import { format, isValid } from "date-fns";
import { id as localeId } from "date-fns/locale";

export interface AttendanceSummary {
  total: number;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
}

export interface HeroNews {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  website_news_categories?: { name: string } | null;
}

export const safeFormatDate = (date: any, fmt: string, fallback = '-'): string => {
  if (!date) return fallback;
  const d = new Date(date);
  return isValid(d) ? format(d, fmt, { locale: localeId }) : fallback;
};

export const calcPercent = (value: number, total: number): number => {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
};

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const toMinutes = (t?: string | null): number | null => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export const greetingFor = (d: Date) => {
  const h = d.getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
};

export type LessonState =
  | { kind: 'none' }
  | { kind: 'done'; count: number }
  | { kind: 'now'; lesson: any; elapsed: number; total: number; minsLeft: number; next?: any }
  | { kind: 'next'; lesson: any; minsUntil: number };

/** Tentukan pelajaran yang sedang berlangsung / berikutnya dari jadwal hari ini. */
export const resolveLesson = (schedules: any[] | undefined, now: Date): LessonState => {
  if (!schedules || schedules.length === 0) return { kind: 'none' };
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const sorted = [...schedules].sort((a, b) => (toMinutes(a.start_time) ?? 0) - (toMinutes(b.start_time) ?? 0));
  for (let i = 0; i < sorted.length; i++) {
    const st = toMinutes(sorted[i].start_time);
    const en = toMinutes(sorted[i].end_time);
    if (st == null || en == null) continue;
    if (nowMin >= st && nowMin < en) {
      return { kind: 'now', lesson: sorted[i], elapsed: nowMin - st, total: en - st, minsLeft: Math.ceil(en - nowMin), next: sorted[i + 1] };
    }
    if (nowMin < st) return { kind: 'next', lesson: sorted[i], minsUntil: Math.ceil(st - nowMin) };
  }
  return { kind: 'done', count: sorted.length };
};

export const humanMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} jam ${m % 60 ? `${m % 60} menit` : ''}`.trim() : `${m} menit`);
