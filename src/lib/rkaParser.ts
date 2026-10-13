/**
 * Parser RKA per penjab.
 * Format kolom: No | Nama Kegiatan | Uraian | Volume | Satuan | Harga Satuan | Jumlah | Bulan Kegiatan
 * Pemetaan kolom dicari dari baris judul (toleran urutan/penulisan); bila judul tidak
 * ditemukan dipakai urutan baku di atas.
 */

export interface RkaRow {
  line_no: number | null;
  activity_name: string;
  description: string;
  volume: number;
  unit: string;
  unit_price: number;
  amount: number;
  months: number[]; // 1-12
  month_label: string;
}

export interface RkaParseResult {
  rows: RkaRow[];
  skipped: number;
  warnings: string[];
}

export const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const MONTH_ALIASES: Record<string, number> = {
  januari: 1, jan: 1, january: 1,
  februari: 2, feb: 2, pebruari: 2, february: 2,
  maret: 3, mar: 3, march: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, jun: 6, june: 6,
  juli: 7, jul: 7, july: 7,
  agustus: 8, agu: 8, agt: 8, ags: 8, aug: 8, august: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, oct: 10, october: 10,
  november: 11, nov: 11, nop: 11,
  desember: 12, des: 12, dec: 12, december: 12,
};

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** "1.500.000", "Rp 1.500.000,50", "1,500,000.25", 1500000 → number */
export function parseNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').trim();
  if (!s) return 0;
  s = s.replace(/rp\.?/gi, '').replace(/\s+/g, '');
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()\-]/g, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // pemisah desimal = yang paling akhir
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    s = parts.length > 2 || parts[parts.length - 1].length === 3 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2 || parts[parts.length - 1].length === 3) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

/** "Januari", "Jan-Mar", "Jan, Mar, Mei", "1-3", "7", "Juli s/d Desember", "Setiap bulan" → [1..12] */
export function parseMonths(v: unknown): number[] {
  if (typeof v === 'number') return v >= 1 && v <= 12 ? [Math.floor(v)] : [];
  const raw = String(v ?? '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\bs\s*\/\s*d\b|\bs\.d\.?|\bsd\b|\bsampai( dengan)?\b|\bhingga\b/g, '-')
    .replace(/\bdan\b/g, ',')
    .replace(/[^a-z0-9 ,;&\-\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return [];
  if (/(setiap|tiap|semua|sepanjang|sebulan) ?(bulan|tahun)?|^12 bulan|tahunan|^all/.test(raw)) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const tokens = raw.split(/[,;/&]+/);
  const out = new Set<number>();
  const monthOf = (t: string): number | null => {
    t = t.trim();
    if (!t) return null;
    if (MONTH_ALIASES[t]) return MONTH_ALIASES[t];
    if (/^\d{1,2}$/.test(t)) { const n = parseInt(t, 10); return n >= 1 && n <= 12 ? n : null; }
    return null;
  };
  for (const tok of tokens) {
    const parts = tok.split(/\s*-\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    // "juli desember" tanpa pemisah → anggap daftar
    const flat = parts.flatMap((p) => (p.includes(' ') ? p.split(' ') : [p]));
    const nums = flat.map(monthOf).filter((n): n is number => n !== null);
    if (nums.length === 0) continue;
    if (tok.includes('-') && nums.length >= 2) {
      let a = nums[0];
      const b = nums[nums.length - 1];
      // rentang melewati akhir tahun (mis. Nov-Feb)
      for (let guard = 0; guard < 12; guard++) {
        out.add(a);
        if (a === b) break;
        a = a === 12 ? 1 : a + 1;
      }
    } else {
      nums.forEach((n) => out.add(n));
    }
  }
  return Array.from(out).sort((x, y) => x - y);
}

export const formatMonths = (months: number[]): string => {
  if (months.length === 0) return '-';
  if (months.length === 12) return 'Setiap bulan';
  return months.map((m) => MONTH_SHORT[m - 1]).join(', ');
};

type ColKey = 'no' | 'name' | 'desc' | 'volume' | 'unit' | 'price' | 'amount' | 'month';

const HEADER_RULES: Array<[ColKey, RegExp]> = [
  ['month', /\bbulan\b|\bwaktu\b|\bpelaksanaan\b/],
  ['price', /harga|tarif/],
  ['amount', /^(jumlah|total|nilai|anggaran|biaya)( rp)?$|jumlah (biaya|anggaran|rp)|^jumlah$/],
  ['volume', /volume|vol\b|kuantitas|qty|banyak/],
  ['unit', /satuan|sat\b|unit/],
  ['name', /nama kegiatan|kegiatan|program/],
  ['desc', /uraian|rincian|keterangan|deskripsi/],
  ['no', /^(no|nomor|no urut)$/],
];

function detectColumns(rows: unknown[][]): { map: Partial<Record<ColKey, number>>; headerRow: number } {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r] || [];
    const map: Partial<Record<ColKey, number>> = {};
    row.forEach((cell, c) => {
      const t = norm(cell);
      if (!t) return;
      for (const [key, re] of HEADER_RULES) {
        if (map[key] === undefined && re.test(t)) { map[key] = c; break; }
      }
    });
    if (map.name !== undefined && (map.amount !== undefined || map.price !== undefined)) {
      return { map, headerRow: r };
    }
  }
  return { map: { no: 0, name: 1, desc: 2, volume: 3, unit: 4, price: 5, amount: 6, month: 7 }, headerRow: -1 };
}

export function parseRkaRows(rows: unknown[][]): RkaParseResult {
  const { map, headerRow } = detectColumns(rows);
  const warnings: string[] = [];
  if (headerRow < 0) warnings.push('Baris judul tidak dikenali; dipakai urutan kolom baku (No, Nama Kegiatan, Uraian, Volume, Satuan, Harga Satuan, Jumlah, Bulan).');
  const cell = (row: unknown[], k: ColKey) => (map[k] === undefined ? undefined : row[map[k] as number]);

  const out: RkaRow[] = [];
  let skipped = 0;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (row.every((c) => String(c ?? '').trim() === '')) continue;

    const name = String(cell(row, 'name') ?? '').trim();
    const desc = String(cell(row, 'desc') ?? '').trim();
    const volume = parseNumber(cell(row, 'volume'));
    const price = parseNumber(cell(row, 'price'));
    let amount = parseNumber(cell(row, 'amount'));
    if (!amount && volume && price) amount = Math.round(volume * price * 100) / 100;

    // Baris subtotal / total tanpa kegiatan
    if (!name && !desc) { skipped++; continue; }
    if (/^(jumlah|total|sub ?total)\b/.test(norm(name || desc)) && !volume && !price) { skipped++; continue; }
    if (!amount && !volume && !price) { skipped++; continue; } // judul bagian

    const monthRaw = cell(row, 'month');
    const months = parseMonths(monthRaw);
    const noRaw = cell(row, 'no');
    const noN = parseNumber(noRaw);
    out.push({
      line_no: noRaw !== undefined && String(noRaw).trim() !== '' && Number.isFinite(noN) ? Math.floor(noN) : null,
      activity_name: name || desc,
      description: name ? desc : '',
      volume,
      unit: String(cell(row, 'unit') ?? '').trim(),
      unit_price: price,
      amount,
      months,
      month_label: String(monthRaw ?? '').trim(),
    });
  }
  if (out.some((x) => x.months.length === 0)) warnings.push('Sebagian baris tidak memiliki bulan kegiatan yang terbaca; dihitung sebagai "Tanpa bulan" pada grafik.');
  return { rows: out, skipped, warnings };
}

/** Sebar anggaran per bulan (dibagi rata bila kegiatan berlangsung beberapa bulan). Indeks 0 = Januari, 12 = tanpa bulan. */
export function amountPerMonth(items: Array<{ amount: number; months: number[] }>): number[] {
  const res = new Array(13).fill(0);
  for (const it of items) {
    if (!it.months || it.months.length === 0) { res[12] += it.amount; continue; }
    const share = it.amount / it.months.length;
    it.months.forEach((m) => { res[m - 1] += share; });
  }
  return res;
}

export const formatRupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
