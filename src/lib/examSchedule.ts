// Jadwal ujian (school_settings.exam_schedule, JSONB). Bentuk data sama dengan yang disimpan halaman Pengaturan
// dan dibaca Administrasi Ujian (kartu ujian), sehingga ketiganya saling kompatibel.
import { format, isValid, parse } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

export interface ExamSession {
  no: number;
  day: string;          // "Senin"
  date: string;         // "19 November 2026"
  subject: string;
  time: string;         // "07:30 - 09:00"
  duration: string;     // menit, mis. "90"
  startTime?: string;   // "07:30"
  endTime?: string;     // "09:00"
  selectedDate?: string | null; // ISO (tengah malam lokal), dipakai Pengaturan Sekolah
}

export const EXAM_SUBJECT_SUGGESTIONS = [
  'Pendidikan Agama dan Budi Pekerti', 'Pendidikan Pancasila', 'Bahasa Indonesia', 'Matematika',
  'Ilmu Pengetahuan Alam (IPA)', 'Ilmu Pengetahuan Sosial (IPS)', 'Bahasa Inggris',
  'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)', 'Seni Musik', 'Seni Rupa', 'Seni Budaya',
  'Prakarya', 'Informatika', 'Bahasa Daerah',
];

export function calculateDuration(start?: string, end?: string): string {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return '';
  const d = eh * 60 + em - (sh * 60 + sm);
  return d > 0 ? String(d) : '';
}

/** Tanggal sesi sebagai Date lokal (null bila belum diisi). */
export function sessionDate(s: Pick<ExamSession, 'selectedDate' | 'date'>): Date | null {
  if (s.selectedDate) {
    const d = new Date(s.selectedDate);
    if (isValid(d)) return d;
  }
  if (s.date) {
    const d = parse(s.date, 'dd MMMM yyyy', new Date(), { locale: localeId });
    if (isValid(d)) return d;
  }
  return null;
}

/** "yyyy-MM-dd" untuk <input type="date">. */
export const toDateInput = (d: Date | null): string => (d ? format(d, 'yyyy-MM-dd') : '');

/** Terapkan tanggal dari <input type="date"> ke sesi (mengisi hari & tanggal berbahasa Indonesia). */
export function withDate(s: ExamSession, value: string): ExamSession {
  if (!value) return { ...s, selectedDate: null, day: '', date: '' };
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  if (!isValid(dt)) return s;
  return {
    ...s,
    selectedDate: dt.toISOString(),
    day: format(dt, 'EEEE', { locale: localeId }),
    date: format(dt, 'dd MMMM yyyy', { locale: localeId }),
  };
}

export function withTimes(s: ExamSession, start: string, end: string): ExamSession {
  return {
    ...s,
    startTime: start,
    endTime: end,
    time: start && end ? `${start} - ${end}` : '',
    duration: calculateDuration(start, end),
  };
}

export const emptySession = (no: number): ExamSession => ({
  no, day: '', date: '', subject: '', time: '', duration: '', startTime: '', endTime: '', selectedDate: null,
});

export const renumber = (list: ExamSession[]): ExamSession[] => list.map((s, i) => ({ ...s, no: i + 1 }));

/** Ubah data mentah dari server menjadi daftar sesi yang aman dipakai editor. */
export function normalizeSchedule(raw: unknown): ExamSession[] {
  if (!Array.isArray(raw)) return [];
  return renumber(raw.map((r: any) => {
    const s: ExamSession = {
      no: Number(r?.no) || 0,
      day: String(r?.day ?? ''),
      date: String(r?.date ?? ''),
      subject: String(r?.subject ?? ''),
      time: String(r?.time ?? ''),
      duration: String(r?.duration ?? ''),
      startTime: r?.startTime ? String(r.startTime) : '',
      endTime: r?.endTime ? String(r.endTime) : '',
      selectedDate: r?.selectedDate ? String(r.selectedDate) : null,
    };
    // jadwal lama tanpa startTime/endTime: coba urai dari "07:30 - 09:00"
    if ((!s.startTime || !s.endTime) && /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(s.time)) {
      const [a, b] = s.time.split('-').map((x) => x.trim());
      s.startTime = a.padStart(5, '0'); s.endTime = b.padStart(5, '0');
    }
    const d = sessionDate(s);
    if (d && !s.selectedDate) s.selectedDate = d.toISOString();
    return s;
  }));
}

/** Urut berdasarkan tanggal lalu jam mulai; sesi tanpa tanggal di paling akhir. */
export function sortSchedule(list: ExamSession[]): ExamSession[] {
  const key = (s: ExamSession) => {
    const d = sessionDate(s);
    return `${d ? format(d, 'yyyyMMdd') : '99999999'}${s.startTime || '99:99'}`;
  };
  return renumber([...list].sort((a, b) => key(a).localeCompare(key(b))));
}

/** Daftar kesalahan yang harus diperbaiki sebelum disimpan (kosong = valid). */
export function validateSchedule(list: ExamSession[]): string[] {
  const errs: string[] = [];
  list.forEach((s, i) => {
    const n = `Sesi ${i + 1}`;
    if (!sessionDate(s)) errs.push(`${n}: tanggal belum diisi`);
    if (!s.subject.trim()) errs.push(`${n}: mata pelajaran belum diisi`);
    if (!s.startTime || !s.endTime) errs.push(`${n}: jam mulai dan selesai belum lengkap`);
    else if (!calculateDuration(s.startTime, s.endTime)) errs.push(`${n}: jam selesai harus setelah jam mulai`);
  });
  return errs;
}

/** Mulai sesi (Date) untuk pengurutan "berikutnya". */
export function sessionStart(s: ExamSession): Date | null {
  const d = sessionDate(s);
  if (!d) return null;
  const [h, m] = (s.startTime || '00:00').split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0);
}

export function upcomingSessions(list: ExamSession[], now = new Date()): ExamSession[] {
  return list
    .map((s) => ({ s, at: sessionStart(s) }))
    .filter((x): x is { s: ExamSession; at: Date } => !!x.at && x.at.getTime() >= now.getTime() - 3 * 3600_000)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((x) => x.s);
}
