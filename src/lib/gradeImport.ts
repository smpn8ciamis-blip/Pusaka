// Impor nilai dari Excel/CSV dan tempel (paste) dari spreadsheet.
// Berkas dibaca menjadi baris-baris teks (string[][]); semua pencocokan ada di sini
// supaya bisa diuji tanpa browser.
import { LEGACY_LABEL, componentKey, type GradeComponent } from '@/lib/gradeComponents';

/** Parser teks berpembatas (CSV/TSV) yang mengerti tanda kutip. Pembatas dideteksi dari baris pertama. */
export function parseDelimited(text: string, forceDelimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim =
    forceDelimiter ??
    ([',', ';', '\t'] as const)
      .map((d) => ({ d, n: firstLine.split(d).length }))
      .sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delim) {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  // buang baris yang semuanya kosong
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Teks hasil copy dari Excel/Sheets (tab + baris baru). */
export function parseClipboardGrid(text: string): string[][] {
  const t = text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  return t.split('\n').map((line) => line.split('\t'));
}

/**
 * Nilai satu sel: '' = kosong (tidak mengubah), null = bukan angka valid.
 * Menerima koma desimal ("85,5") dan teks seperti "85 ".
 */
export function parseScore(raw: unknown): number | '' | null {
  if (raw === null || raw === undefined) return '';
  const t = String(raw).trim().replace(',', '.');
  if (t === '' || t === '-') return '';
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const norm = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // buang "(20%)"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** NIS dari Excel kadang berbentuk "1234.0", berawalan apostrof, atau bernotasi angka. */
export function normalizeNis(v: unknown): string {
  let t = String(v ?? '').trim().replace(/^'+/, '');
  if (/^\d+\.0+$/.test(t)) t = t.replace(/\.0+$/, '');
  return t;
}

export interface ImportStudent { id: string; nis: string | null; full_name: string }

export interface ImportRow {
  /** nomor baris pada berkas (1 = baris pertama) */
  line: number;
  studentId: string | null;
  nis: string;
  name: string;
  /** kunci kolom (componentKey) -> nilai; '' = kosong/tidak diubah */
  values: Record<string, number | ''>;
  errors: string[];
}

export interface ImportResult {
  fatal?: string;
  rows: ImportRow[];
  /** kolom berkas yang cocok dengan jenis penilaian */
  matchedColumns: { key: string; header: string; component: string }[];
  /** kolom berkas yang tidak dikenali (diabaikan) */
  ignoredHeaders: string[];
  /** jenis penilaian yang tidak ada kolomnya di berkas */
  missingComponents: string[];
  okCount: number;
  errorCount: number;
}

export function matchImport(
  table: string[][],
  students: ImportStudent[],
  components: GradeComponent[],
): ImportResult {
  const empty = (fatal: string): ImportResult => ({
    fatal, rows: [], matchedColumns: [], ignoredHeaders: [], missingComponents: [], okCount: 0, errorCount: 0,
  });
  if (table.length === 0) return empty('Berkas kosong');

  // baris judul = baris pertama yang memuat kolom NIS atau Nama
  const headerIdx = table.findIndex((r) => r.some((c) => ['nis', 'nisn', 'nama', 'nama siswa'].includes(norm(c))));
  if (headerIdx < 0) return empty('Baris judul tidak ditemukan. Kolom pertama harus bernama NIS atau Nama.');
  const header = table[headerIdx];
  const nisCol = header.findIndex((c) => ['nis', 'nisn'].includes(norm(c)));
  const nameCol = header.findIndex((c) => ['nama', 'nama siswa'].includes(norm(c)));
  if (nisCol < 0 && nameCol < 0) return empty('Kolom NIS atau Nama tidak ditemukan');

  // pencocokan kolom nilai -> jenis penilaian (nama sama, atau nama baku Tugas/Kuis/UTS/UAS/Praktik)
  const matchedColumns: ImportResult['matchedColumns'] = [];
  const colOf: { col: number; key: string }[] = [];
  const ignoredHeaders: string[] = [];
  const usedKeys = new Set<string>();
  header.forEach((h, col) => {
    if (col === nisCol || col === nameCol) return;
    const n = norm(h);
    if (!n) return;
    const free = (c: GradeComponent, i: number) => !usedKeys.has(componentKey(c, i));
    // utamakan nama jenis penilaian yang sama persis; cadangan: nama baku (Tugas/Kuis/UTS/UAS/Praktik)
    let idx = components.findIndex((c, i) => free(c, i) && norm(c.name) === n);
    if (idx < 0) idx = components.findIndex((c, i) => free(c, i) && c.legacy_key !== null && norm(LEGACY_LABEL[c.legacy_key]) === n);
    if (idx < 0) { ignoredHeaders.push(String(h).trim()); return; }
    const key = componentKey(components[idx], idx);
    usedKeys.add(key);
    colOf.push({ col, key });
    matchedColumns.push({ key, header: String(h).trim(), component: components[idx].name });
  });
  const missingComponents = components.filter((c, i) => !usedKeys.has(componentKey(c, i))).map((c) => c.name);
  if (matchedColumns.length === 0) {
    return { ...empty('Tidak ada kolom nilai yang cocok dengan jenis penilaian. Unduh templat agar nama kolom sesuai.'), ignoredHeaders, missingComponents };
  }

  const byNis = new Map<string, ImportStudent>();
  const byName = new Map<string, ImportStudent[]>();
  for (const s of students) {
    if (s.nis) byNis.set(normalizeNis(s.nis), s);
    const k = norm(s.full_name);
    byName.set(k, [...(byName.get(k) ?? []), s]);
  }

  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  for (let r = headerIdx + 1; r < table.length; r++) {
    const line = table[r];
    const nis = nisCol >= 0 ? normalizeNis(line[nisCol]) : '';
    const name = nameCol >= 0 ? String(line[nameCol] ?? '').trim() : '';
    if (!nis && !name && colOf.every((c) => String(line[c.col] ?? '').trim() === '')) continue;

    const errors: string[] = [];
    let student: ImportStudent | undefined;
    if (nis) student = byNis.get(nis);
    if (!student && name) {
      const cands = byName.get(norm(name)) ?? [];
      if (cands.length === 1 && (!nis || !byNis.has(nis))) student = cands[0];
      else if (cands.length > 1) errors.push('Nama kembar di kelas ini; isi kolom NIS');
    }
    if (!student && errors.length === 0) errors.push(nis ? `NIS ${nis} tidak ada di kelas ini` : `Siswa "${name}" tidak ditemukan`);
    if (student) {
      if (seen.has(student.id)) errors.push('Siswa muncul lebih dari sekali');
      seen.add(student.id);
    }

    const values: Record<string, number | ''> = {};
    for (const { col, key } of colOf) {
      const v = parseScore(line[col]);
      if (v === null) {
        errors.push(`Nilai "${String(line[col]).trim()}" bukan angka`);
        values[key] = '';
      } else if (v !== '' && (v < 0 || v > 100)) {
        errors.push(`Nilai ${v} di luar 0–100`);
        values[key] = '';
      } else values[key] = v;
    }
    rows.push({ line: r + 1, studentId: student?.id ?? null, nis: nis || student?.nis || '', name: name || student?.full_name || '', values, errors });
  }

  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  return { rows, matchedColumns, ignoredHeaders, missingComponents, okCount: rows.length - errorCount, errorCount };
}

/** Baris templat: judul + satu baris per siswa, terisi nilai yang sudah ada. */
export function buildTemplateRows(
  students: ImportStudent[],
  components: GradeComponent[],
  valueOf: (studentId: string, c: GradeComponent) => number | '' | undefined,
): (string | number)[][] {
  const head: (string | number)[] = ['NIS', 'Nama', ...components.map((c) => c.name)];
  const body = students.map((s) => [
    normalizeNis(s.nis),
    s.full_name,
    ...components.map((c) => {
      const v = valueOf(s.id, c);
      return v === undefined || v === '' || v === 0 ? '' : v;
    }),
  ]);
  return [head, ...body];
}
