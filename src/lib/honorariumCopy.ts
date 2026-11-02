/** Logika murni "Salin Kwitansi" honorarium GTT/PTT (bisa diuji tanpa React/Supabase). */

export interface CopySource {
  id: string;
  teacher_id: string | null;
  staff_id: string | null;
  honorarium_amount: number;
  tax_percentage: number;
  payment_month: number;
  payment_year: number;
  description: string | null;
}

export const recipientKey = (h: Pick<CopySource, 'teacher_id' | 'staff_id'>) =>
  h.staff_id ? `staff:${h.staff_id}` : `teacher:${h.teacher_id}`;

/** Periode berikutnya (Desember → Januari tahun depan). */
export const nextPeriod = (month: number, year: number) =>
  month >= 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };

/** Periode sebelumnya (Januari → Desember tahun lalu). */
export const prevPeriod = (month: number, year: number) =>
  month <= 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** Nomor kwitansi `HON/<tahun>/<bulan>/<4 digit>` yang tidak bentrok dengan `used` (ditambah otomatis). */
export function uniqueReceiptNumber(year: number, month: number, used: Set<string>, rand: () => number = Math.random) {
  for (let i = 0; i < 200; i++) {
    const n = `HON/${year}/${pad(month, 2)}/${pad(Math.floor(rand() * 10000), 4)}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  // sangat jarang: ruang 10.000 nomor/bulan penuh → beri akhiran urut
  const base = `HON/${year}/${pad(month, 2)}/${pad(Math.floor(rand() * 10000), 4)}`;
  for (let k = 2; ; k++) {
    const n = `${base}-${k}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
}

export interface CopyRow {
  teacher_id: string | null;
  staff_id: string | null;
  honorarium_amount: number;
  tax_percentage: number;
  tax_amount: number;
  net_amount: number;
  payment_month: number;
  payment_year: number;
  receipt_number: string;
  receipt_date: string;
  description: string | null;
  created_by: string | undefined;
}

/**
 * Susun baris kwitansi baru untuk periode tujuan dari kwitansi sumber.
 * Penerima yang SUDAH punya kwitansi di periode tujuan dilewati (tidak dobel).
 */
export function buildCopyRows(opts: {
  sources: CopySource[];
  targetMonth: number;
  targetYear: number;
  receiptDate: string;
  existing: Pick<CopySource, 'teacher_id' | 'staff_id' | 'payment_month' | 'payment_year'>[];
  usedReceiptNumbers: Iterable<string>;
  userId: string | undefined;
  rand?: () => number;
}) {
  const { sources, targetMonth, targetYear, receiptDate, userId, rand } = opts;
  const have = new Set(
    opts.existing.filter((e) => e.payment_month === targetMonth && e.payment_year === targetYear).map(recipientKey),
  );
  const used = new Set(opts.usedReceiptNumbers);
  const rows: CopyRow[] = [];
  const skipped: CopySource[] = [];
  for (const s of sources) {
    const k = recipientKey(s);
    if (have.has(k)) { skipped.push(s); continue; }
    have.add(k); // satu penerima hanya sekali per periode tujuan
    const amount = Number(s.honorarium_amount) || 0;
    const pct = Number(s.tax_percentage) || 0;
    const tax = amount * (pct / 100);
    rows.push({
      teacher_id: s.staff_id ? null : s.teacher_id,
      staff_id: s.staff_id ?? null,
      honorarium_amount: amount,
      tax_percentage: pct,
      tax_amount: tax,
      net_amount: amount - tax,
      payment_month: targetMonth,
      payment_year: targetYear,
      receipt_number: uniqueReceiptNumber(targetYear, targetMonth, used, rand),
      receipt_date: receiptDate,
      description: s.description,
      created_by: userId,
    });
  }
  return { rows, skipped };
}
