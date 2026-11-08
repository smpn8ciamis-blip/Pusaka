/**
 * Penomoran surat berpola (Surat Pengantar).
 * Token: {URUT} / {URUT:n} (nomor urut, n digit), {TAHUN} (4 digit), {YY} (2 digit),
 *        {BULAN} (2 digit), {ROMAWI} (bulan romawi). Huruf, angka, spasi, titik, garis miring di luar token ditulis apa adanya.
 * Contoh: "800 / {URUT:3} / 426.101.03.SMK.1/{TAHUN}" -> "800 / 053 / 426.101.03.SMK.1/2026"
 */
export const DEFAULT_SURAT_PATTERN = '800/{URUT:3}/{TAHUN}';

const TOKEN_RE = /\{(URUT(?::(\d{1,2}))?|TAHUN|YY|BULAN|ROMAWI)\}/g;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export interface NumberContext {
  year: number;
  month: number; // 1-12
}

export function validateSuratPattern(pattern: string): string | null {
  const p = pattern.trim();
  if (!p) return 'Pola nomor wajib diisi';
  if (p.length > 80) return 'Pola nomor maksimal 80 karakter';
  const urut = p.match(/\{URUT(?::\d{1,2})?\}/g) ?? [];
  if (urut.length !== 1) return 'Pola harus memuat tepat satu {URUT} atau {URUT:3}';
  if (/[{}]/.test(p.replace(TOKEN_RE, ''))) return 'Ada token yang tidak dikenal. Gunakan {URUT:3}, {TAHUN}, {YY}, {BULAN}, {ROMAWI}';
  return null;
}

export function renderSuratNumber(pattern: string, ctx: NumberContext, seq: number): string {
  return pattern.trim().replace(TOKEN_RE, (_m, tok: string, width?: string) => {
    if (tok.startsWith('URUT')) return String(seq).padStart(width ? Number(width) : 1, '0');
    if (tok === 'TAHUN') return String(ctx.year);
    if (tok === 'YY') return String(ctx.year % 100).padStart(2, '0');
    if (tok === 'BULAN') return String(ctx.month).padStart(2, '0');
    return ROMAN[(ctx.month - 1 + 12) % 12];
  });
}

/** Membaca nomor urut dari nomor surat berdasarkan pola; null bila tidak cocok. */
export function parseSuratSequence(pattern: string, nomor: string, ctx: NumberContext): number | null {
  const p = pattern.trim();
  if (validateSuratPattern(p)) return null;
  let re = '';
  let last = 0;
  let m: RegExpExecArray | null;
  const rx = new RegExp(TOKEN_RE.source, 'g');
  while ((m = rx.exec(p))) {
    re += escapeRe(p.slice(last, m.index));
    const tok = m[1];
    if (tok.startsWith('URUT')) re += '(\\d+)';
    else if (tok === 'TAHUN') re += escapeRe(String(ctx.year));
    else if (tok === 'YY') re += escapeRe(String(ctx.year % 100).padStart(2, '0'));
    else if (tok === 'BULAN') re += escapeRe(String(ctx.month).padStart(2, '0'));
    else re += escapeRe(ROMAN[(ctx.month - 1 + 12) % 12]);
    last = m.index + m[0].length;
  }
  re += escapeRe(p.slice(last));
  const hit = new RegExp(`^${re}$`).exec(nomor.trim());
  if (!hit) return null;
  const n = Number(hit[1]);
  return Number.isSafeInteger(n) && n > 0 && n < 2_000_000_000 ? n : null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
