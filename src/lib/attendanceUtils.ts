// src/lib/attendanceUtils.ts
//
// Helper murni (tanpa dependensi) untuk menghitung kehadiran di dashboard & ekspor.
// Satu sumber aturan supaya semua kartu, grafik, dan laporan memberi angka yang sama.
//
// ATURAN PENGGABUNGAN (satu siswa + satu tanggal = satu catatan):
//   1. Absensi manual diutamakan di atas RFID (sama seperti fungsi database
//      get_student_attendance_logs).
//   2. Absensi manual dicatat per jam pelajaran, jadi satu hari bisa punya banyak baris.
//      Hari itu dihitung dengan status yang paling "hadir":
//      hadir > terlambat > sakit > izin > alpa.
//      (Siswa yang hadir di salah satu jam dianggap hadir hari itu; sakit/izin
//      didahulukan dari alpa.)
//   3. Baris dengan status di luar lima status di atas diabaikan.

export type AttendanceStatus = "hadir" | "terlambat" | "sakit" | "izin" | "alpa";

export interface AttendanceRow {
  student_id: string;
  date: string;
  status: string | null;
  schedule_id?: string | null;
}

export interface DailyAttendance {
  student_id: string;
  date: string;
  status: AttendanceStatus;
  source: "manual" | "rfid";
  schedule_id?: string | null;
}

export interface AttendanceCounts {
  /** Hadir TERMASUK terlambat (terlambat tetap hadir, dihitung sekali). */
  hadir: number;
  /** Subset dari hadir: yang datang terlambat. */
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  /** hadir + izin + sakit + alpa. */
  total: number;
}

const STATUS_PRIORITY: Record<AttendanceStatus, number> = {
  hadir: 0,
  terlambat: 1,
  sakit: 2,
  izin: 3,
  alpa: 4,
};

export function normalizeStatus(status: string | null | undefined): AttendanceStatus | null {
  const s = String(status ?? "").toLowerCase().trim();
  return s in STATUS_PRIORITY ? (s as AttendanceStatus) : null;
}

/** Tanggal lokal (zona waktu perangkat) dalam format yyyy-MM-dd. Jangan pakai toISOString (UTC). */
export function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mergeAttendanceByStudentDay(
  manual: AttendanceRow[] | null | undefined,
  rfid: AttendanceRow[] | null | undefined
): DailyAttendance[] {
  const byKey = new Map<string, DailyAttendance>();

  const toRecord = (row: AttendanceRow, status: AttendanceStatus, source: "manual" | "rfid"): DailyAttendance => ({
    student_id: row.student_id,
    date: row.date,
    status,
    source,
    schedule_id: row.schedule_id ?? null,
  });

  for (const row of manual ?? []) {
    const status = normalizeStatus(row.status);
    if (!status || !row.student_id || !row.date) continue;
    const key = `${row.student_id}|${row.date}`;
    const existing = byKey.get(key);
    if (!existing || STATUS_PRIORITY[status] < STATUS_PRIORITY[existing.status]) {
      byKey.set(key, toRecord(row, status, "manual"));
    }
  }

  for (const row of rfid ?? []) {
    const status = normalizeStatus(row.status);
    if (!status || !row.student_id || !row.date) continue;
    const key = `${row.student_id}|${row.date}`;
    const existing = byKey.get(key);
    if (existing?.source === "manual") continue; // manual diutamakan
    if (!existing || STATUS_PRIORITY[status] < STATUS_PRIORITY[existing.status]) {
      byKey.set(key, toRecord(row, status, "rfid"));
    }
  }

  return Array.from(byKey.values());
}

export function summarizeDailyRecords(records: Array<{ status: AttendanceStatus }>): AttendanceCounts {
  const c: AttendanceCounts = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, total: 0 };
  for (const r of records) {
    if (r.status === "hadir") c.hadir++;
    else if (r.status === "terlambat") {
      c.hadir++;
      c.terlambat++;
    } else if (r.status === "izin") c.izin++;
    else if (r.status === "sakit") c.sakit++;
    else if (r.status === "alpa") c.alpa++;
  }
  c.total = c.hadir + c.izin + c.sakit + c.alpa;
  return c;
}

/** Persentase bulat 0–100. Tidak pernah lebih dari 100 atau kurang dari 0. */
export function percentOf(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}

/**
 * Ambil SEMUA baris dari query yang bisa dipaginasi dengan .range().
 * Server membatasi jumlah baris per permintaan (mis. 1000), jadi query harus diulang
 * sampai halaman kosong. Query HARUS punya urutan stabil (mis. .order("id")).
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Batas pengaman: 500 halaman (500.000 baris) supaya tidak berputar selamanya.
  for (let page = 0; page < 500; page++) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    from += data.length;
  }
  return all;
}
