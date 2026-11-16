/**
 * Ambil data absensi untuk rentang tanggal panjang (berbulan-bulan) tanpa timeout.
 *
 * Masalah semula: satu permintaan dengan paginasi offset (.range) untuk rentang panjang makin lambat di halaman
 * dalam (offset puluhan ribu + join), sehingga kena batas waktu server dan seluruh perhitungan gagal.
 * Solusi: rentang dipecah menjadi potongan kecil (default 3 hari), tiap potongan dipaginasi sendiri
 * (offset kecil), dijalankan beberapa sekaligus, dan tiap potongan dicoba ulang bila gagal.
 */
export const ATTENDANCE_PAGE_SIZE = 1000;

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Pecah [start, end] (YYYY-MM-DD, inklusif) menjadi potongan berurutan menurun (tanggal terbaru dulu). */
export function splitDateRange(start: string, end: string, chunkDays = 3): Array<[string, string]> {
  if (!start || !end || start > end) return [];
  const out: Array<[string, string]> = [];
  const first = parseIso(start);
  let cursorEnd = parseIso(end);
  while (cursorEnd >= first) {
    const cursorStart = new Date(Math.max(first.getTime(), cursorEnd.getTime() - (chunkDays - 1) * 86400000));
    out.push([toIso(cursorStart), toIso(cursorEnd)]);
    cursorEnd = new Date(cursorStart.getTime() - 86400000);
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

export interface ChunkedFetchOptions {
  chunkDays?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * @param fetchPage  mengambil SATU halaman untuk potongan [chunkStart, chunkEnd]; kembalikan array baris.
 *                   Wajib mengurutkan stabil (mis. date lalu id) dan memakai .range(from, to).
 */
export async function fetchAttendanceChunked<T>(
  start: string,
  end: string,
  fetchPage: (chunkStart: string, chunkEnd: string, from: number, to: number) => Promise<T[]>,
  { chunkDays = 3, concurrency = 4, onProgress }: ChunkedFetchOptions = {},
): Promise<T[]> {
  const chunks = splitDateRange(start, end, chunkDays);
  const results: T[][] = new Array(chunks.length);
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= chunks.length) return;
      const [cs, ce] = chunks[i];
      const rows: T[] = [];
      for (let page = 0; page < 100; page++) {
        const from = page * ATTENDANCE_PAGE_SIZE;
        const data = await withRetry(() => fetchPage(cs, ce, from, from + ATTENDANCE_PAGE_SIZE - 1));
        rows.push(...data);
        if (data.length < ATTENDANCE_PAGE_SIZE) break;
      }
      results[i] = rows;
      onProgress?.(++done, chunks.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return results.flat();
}
