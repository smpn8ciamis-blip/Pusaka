// Absensi siswa oleh pengawas ruang ujian (murni, tanpa React agar mudah diuji).

export type AttStatus = 'hadir' | 'sakit' | 'izin' | 'alpa';
export const ATT_STATUSES: AttStatus[] = ['hadir', 'sakit', 'izin', 'alpa'];
export const ATT_LABEL: Record<AttStatus, string> = { hadir: 'Hadir', sakit: 'Sakit', izin: 'Izin', alpa: 'Alpa' };

export interface MyInvSession {
  start_time: string; end_time: string; subject: string; room_no: number;
  is_first: boolean; student_count: number; filled_count: number; recorded_at: string | null;
}
export interface RoomStudent {
  student_id: string; full_name: string; class_name: string; table_no: number | null; exam_number: string | null;
  saved_status: AttStatus | null; saved_notes: string | null; day_status: AttStatus | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Tanggal & menit hari ini menurut WIB (UTC+7), tidak bergantung zona waktu perangkat. */
export function wibNow(now: Date = new Date()): { date: string; minutes: number } {
  const w = new Date(now.getTime() + 7 * 3600_000);
  return { date: `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`, minutes: w.getUTCHours() * 60 + w.getUTCMinutes() };
}
export const hhmmToMin = (t: string) => { const [h, m] = String(t).split(':'); return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0); };

/** Absensi dibuka 30 menit sebelum sesi mulai (sama dengan aturan di basis data). */
export function sessionOpen(date: string, startTime: string, now: Date = new Date()): boolean {
  const n = wibNow(now);
  if (date !== n.date) return false;
  return n.minutes >= hhmmToMin(startTime) - 30;
}

/** Isian awal: status tersimpan pengawas → status hari itu dari absen lain → hadir. */
export function initialStatus(s: Pick<RoomStudent, 'saved_status' | 'day_status'>): AttStatus {
  return s.saved_status ?? s.day_status ?? 'hadir';
}

export function countStatuses(list: { status: AttStatus | null }[]): Record<AttStatus | 'belum', number> {
  const c = { hadir: 0, sakit: 0, izin: 0, alpa: 0, belum: 0 };
  for (const x of list) c[x.status ?? 'belum']++;
  return c;
}

export const fmtDateId = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};
