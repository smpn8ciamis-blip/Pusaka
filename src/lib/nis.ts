/**
 * Pembuat NIS otomatis untuk Mutasi Masuk.
 *
 * Pola NIS memakai token:
 *   {TAHUN}   tahun masuk angkatan (4 digit, mis. 2025)
 *   {YY}      dua digit terakhir tahun masuk angkatan
 *   {TINGKAT} tingkat kelas siswa (mis. 7)
 *   {URUT:n}  nomor urut dengan n digit (mis. {URUT:3} -> 007); {URUT} tanpa lebar
 * Teks lain ditulis apa adanya. Contoh bawaan: {TAHUN}{URUT:3} -> 2025007.
 *
 * Saran NIS = NIS terakhir siswa AKTIF di tingkat yang sama + 1 (angkatan yang sama, lebar nomor sama).
 * Bila belum ada siswa di tingkat itu, NIS dibuat dari pola dengan nomor urut 1. NIS yang sudah dipakai dilewati.
 */

export const DEFAULT_NIS_PATTERN = '{TAHUN}{URUT:3}';
export const BASE_GRADE = 7; // tingkat pertama (SMP)

const TOKEN_RE = /\{(TAHUN|YY|TINGKAT|URUT)(?::(\d{1,2}))?\}/g;

export function validateNisPattern(pattern: string): string | null {
  const p = pattern.trim();
  if (!p) return 'Pola NIS tidak boleh kosong';
  if (p.length > 40) return 'Pola NIS maksimal 40 karakter';
  const leftover = p.replace(TOKEN_RE, '');
  if (/[{}]/.test(leftover)) return 'Ada token yang tidak dikenal. Gunakan {TAHUN}, {YY}, {TINGKAT}, {URUT:n}';
  const urut = [...p.matchAll(TOKEN_RE)].filter((m) => m[1] === 'URUT');
  if (urut.length !== 1) return 'Pola harus memuat tepat satu {URUT} atau {URUT:n}';
  if (urut[0][2] !== undefined && (Number(urut[0][2]) < 1 || Number(urut[0][2]) > 10)) return 'Lebar {URUT:n} harus 1–10';
  return null;
}

export interface NisContext {
  /** tahun masuk angkatan, mis. 2025 */
  cohortYear: number;
  /** tingkat kelas, mis. 7 */
  grade: number;
}

export function renderNis(pattern: string, ctx: NisContext, seq: number): string {
  return pattern.trim().replace(TOKEN_RE, (_m, name: string, width?: string) => {
    if (name === 'TAHUN') return String(ctx.cohortYear);
    if (name === 'YY') return String(ctx.cohortYear % 100).padStart(2, '0');
    if (name === 'TINGKAT') return String(ctx.grade);
    return width ? String(seq).padStart(Number(width), '0') : String(seq);
  });
}

/** Tahun awal dari "2026/2027" (atau "2026"); null bila tidak terbaca. */
export function academicYearStart(year: string | null | undefined): number | null {
  const m = String(year ?? '').match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

/** Tahun masuk angkatan untuk siswa di tingkat `grade` pada tahun ajaran berjalan. */
export function cohortYearFor(academicYear: string | null | undefined, grade: number): number {
  const start = academicYearStart(academicYear) ?? new Date().getFullYear();
  return start - (Number.isFinite(grade) ? Math.max(0, grade - BASE_GRADE) : 0);
}

interface Parsed { prefix: string; suffix: string; width: number; seq: number }

function patternRegex(pattern: string): RegExp {
  let src = '';
  let last = 0;
  const p = pattern.trim();
  for (const m of p.matchAll(TOKEN_RE)) {
    src += p.slice(last, m.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    last = (m.index ?? 0) + m[0].length;
    if (m[1] === 'TAHUN') src += '\\d{4}';
    else if (m[1] === 'YY') src += '\\d{2}';
    else if (m[1] === 'TINGKAT') src += '\\d{1,2}';
    else src += m[2] ? `(\\d{${m[2]}})` : '(\\d+)';
  }
  src += p.slice(last).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${src}$`);
}

/** Pecah NIS menjadi (awalan, akhiran, lebar nomor, nomor urut) menurut pola; null bila tidak cocok. */
function parseWithPattern(nis: string, pattern: string): Parsed | null {
  const re = patternRegex(pattern);
  const m = nis.match(re);
  if (!m || m[1] === undefined) return null;
  // posisi nomor urut = posisi grup tangkap satu-satunya; hitung lewat pencocokan ulang dengan indeks
  const withIdx = new RegExp(re.source, 'd');
  const mm = withIdx.exec(nis) as (RegExpExecArray & { indices?: [number, number][] }) | null;
  const idx = mm?.indices?.[1];
  if (!idx) return null;
  return { prefix: nis.slice(0, idx[0]), suffix: nis.slice(idx[1]), width: m[1].length, seq: Number(m[1]) };
}

/** Cadangan bila NIS tidak sesuai pola: angka di ujung NIS dianggap nomor urut. */
function parseTrailingDigits(nis: string): Parsed | null {
  const m = nis.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], suffix: '', width: m[2].length, seq: Number(m[2]) };
}

export interface PeerStudent { nis: string; name: string }

export interface NisSuggestion {
  suggested: string;
  /** NIS terakhir (nomor urut terbesar) siswa aktif di tingkat yang sama; null bila belum ada */
  last: PeerStudent | null;
  source: 'lanjutan' | 'pola';
  /** jumlah siswa aktif di tingkat tsb yang dipakai sebagai acuan */
  peers: number;
}

export function suggestNis(opts: {
  pattern: string;
  ctx: NisContext;
  /** siswa AKTIF di tingkat kelas yang sama */
  peers: PeerStudent[];
  /** semua NIS yang sudah dipakai (aktif maupun tidak) */
  usedNis: Iterable<string>;
}): NisSuggestion {
  const pattern = validateNisPattern(opts.pattern) ? DEFAULT_NIS_PATTERN : opts.pattern.trim();
  const used = new Set<string>();
  for (const n of opts.usedNis) used.add(String(n).trim());

  const parsed = opts.peers
    .map((p) => ({ p, r: parseWithPattern(p.nis.trim(), pattern) ?? parseTrailingDigits(p.nis.trim()) }))
    .filter((x): x is { p: PeerStudent; r: Parsed } => !!x.r);

  let make: (seq: number) => string;
  let start = 1;
  let last: PeerStudent | null = null;
  let source: NisSuggestion['source'] = 'pola';

  if (parsed.length) {
    // angkatan dominan = kelompok (awalan, akhiran, lebar) dengan siswa terbanyak
    const groups = new Map<string, typeof parsed>();
    for (const x of parsed) {
      const k = `${x.r.prefix}\u0000${x.r.suffix}\u0000${x.r.width}`;
      groups.set(k, [...(groups.get(k) ?? []), x]);
    }
    const best = [...groups.values()].sort((a, b) => b.length - a.length || b[0].r.prefix.localeCompare(a[0].r.prefix))[0];
    const top = best.reduce((a, b) => (b.r.seq > a.r.seq ? b : a));
    last = top.p;
    start = top.r.seq + 1;
    source = 'lanjutan';
    make = (seq) => `${top.r.prefix}${String(seq).padStart(top.r.width, '0')}${top.r.suffix}`;
  } else {
    make = (seq) => renderNis(pattern, opts.ctx, seq);
  }

  let seq = start;
  let candidate = make(seq);
  for (let i = 0; i < 100000 && used.has(candidate); i++) candidate = make(++seq);
  return { suggested: candidate, last, source, peers: opts.peers.length };
}
