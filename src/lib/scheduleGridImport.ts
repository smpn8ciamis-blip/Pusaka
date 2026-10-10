/**
 * Parser & pencocokan untuk impor jadwal dari Excel format Dinas:
 *  - Sheet "Pemetaan Guru"  : kode guru -> nama, mata pelajaran, jam per kelas
 *  - Sheet jadwal (grid)    : hari x jam ke x kelas, isi sel = KODE guru
 * Semua fungsi bekerja pada array-of-arrays (hasil XLSX.utils.sheet_to_json header:1)
 * sehingga mudah diuji tanpa library Excel.
 */

export type Cell = string | number | boolean | null | undefined;
export type Grid = Cell[][];

export interface FileTeacher {
  code: string;          // kode di file, mis. "7", "7a"
  name: string;          // nama guru (baris tambahan "7a" mewarisi nama baris sebelumnya)
  subject: string;       // mata pelajaran menurut file
}

export interface FileSlot {
  day: number;           // 1=Senin ... 7=Minggu
  jam: number;           // jam ke
  start: string;         // HH:MM
  end: string;           // HH:MM
  classLabel: string;    // mis. "VII A"
  code: string;
}

export interface ParsedWorkbook {
  teachers: FileTeacher[];
  slots: FileSlot[];
  classLabels: string[];
  warnings: string[];
}

const DAY_MAP: Record<string, number> = {
  senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6, minggu: 7, ahad: 7,
};

const text = (v: Cell) => (v === null || v === undefined ? '' : String(v)).trim();

export function normalizeCode(v: Cell): string {
  const s = text(v).toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  if (/^\d+(\.0+)?$/.test(s)) return String(parseInt(s, 10));
  const m = s.match(/^(\d+)(\.0+)?([a-z]+)$/);
  if (m) return `${parseInt(m[1], 10)}${m[3]}`;
  return s;
}

/** Label kelas dari baris tingkat (VII/VIII/IX) + baris huruf (A, B, ...) */
function buildClassColumns(gradeRow: Cell[], letterRow: Cell[], firstCol: number, lastCol: number) {
  const cols: Record<number, string> = {};
  let grade = '';
  for (let c = firstCol; c <= lastCol; c++) {
    const g = text(gradeRow[c]).toUpperCase();
    if (/^(VII|VIII|IX|7|8|9)$/.test(g)) grade = g;
    const letter = text(letterRow[c]).toUpperCase();
    if (grade && /^[A-Z]$/.test(letter)) cols[c] = `${grade} ${letter}`;
  }
  return cols;
}

function findRow(rows: Grid, pred: (r: Cell[], i: number) => boolean, from = 0, to = rows.length): number {
  for (let i = from; i < Math.min(rows.length, to); i++) if (pred(rows[i] || [], i)) return i;
  return -1;
}

const rowHas = (r: Cell[], re: RegExp) => r.some((c) => re.test(text(c)));

export function parsePemetaan(rows: Grid, warnings: string[]): FileTeacher[] {
  const hdr = findRow(rows, (r) => rowHas(r, /^NAMA$/i) && rowHas(r, /MATA\s*PELAJARAN/i), 0, 30);
  if (hdr < 0) throw new Error('Sheet pemetaan: baris judul (NAMA / MATA PELAJARAN) tidak ditemukan');
  const hr = rows[hdr];
  const nameCol = hr.findIndex((c) => /^NAMA$/i.test(text(c)));
  const subjCol = hr.findIndex((c) => /MATA\s*PELAJARAN/i.test(text(c)));
  // kolom KODE ada di baris judul berikutnya (sel gabungan "NOMOR" -> "URUT" | "KODE")
  let codeCol = -1;
  for (let i = hdr; i <= hdr + 2 && codeCol < 0; i++) {
    codeCol = (rows[i] || []).findIndex((c) => /^KODE$/i.test(text(c)));
  }
  if (codeCol < 0) throw new Error('Sheet pemetaan: kolom KODE tidak ditemukan');

  const teachers: FileTeacher[] = [];
  let lastName = '';
  let blank = 0;
  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const code = normalizeCode(r[codeCol]);
    // lewati baris judul turunan (VII/VIII/IX, A B C ...)
    if (!code || !/^\d+[a-z]*$/.test(code)) {
      if (!r.some((c) => text(c))) blank++;
      if (blank > 5 && teachers.length) break;
      continue;
    }
    blank = 0;
    const nm = text(r[nameCol]);
    const name = nm || lastName;
    if (nm) lastName = nm;
    if (!name) {
      warnings.push(`Kode ${code}: nama guru kosong`);
      continue;
    }
    teachers.push({ code, name: name.replace(/\s+/g, ' '), subject: text(r[subjCol]) });
  }
  return teachers;
}

export function parseGrid(rows: Grid, warnings: string[]): { slots: FileSlot[]; classLabels: string[] } {
  const hdr = findRow(rows, (r) => rowHas(r, /^Hari$/i) && rowHas(r, /^Waktu$/i), 0, 30);
  if (hdr < 0) throw new Error('Sheet jadwal: baris judul (Hari / Waktu / Jam Ke) tidak ditemukan');
  const kelasCol = rows[hdr].findIndex((c) => /^Kelas$/i.test(text(c)));
  const firstCol = kelasCol >= 0 ? kelasCol : 3;
  const gradeRow = rows[hdr + 1] || [];
  const letterRow = rows[hdr + 2] || [];
  const lastCol = Math.max(gradeRow.length, letterRow.length) - 1;
  const classCols = buildClassColumns(gradeRow, letterRow, firstCol, lastCol);
  if (!Object.keys(classCols).length) throw new Error('Sheet jadwal: kolom kelas (VII A, VII B, ...) tidak ditemukan');

  const slots: FileSlot[] = [];
  let day = 0;
  for (let i = hdr + 3; i < rows.length; i++) {
    const r = rows[i] || [];
    const a = text(r[0]).toLowerCase();
    if (a && DAY_MAP[a]) day = DAY_MAP[a];
    const jam = Number(text(r[2]));
    if (!day || !Number.isFinite(jam) || jam < 1) continue; // jam 0 = upacara/senam/istirahat
    const m = text(r[1]).match(/(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})/);
    if (!m) {
      warnings.push(`Baris ${i + 1}: waktu "${text(r[1])}" tidak terbaca`);
      continue;
    }
    const start = `${m[1].padStart(2, '0')}:${m[2]}`;
    const end = `${m[3].padStart(2, '0')}:${m[4]}`;
    for (const [col, classLabel] of Object.entries(classCols)) {
      const code = normalizeCode(r[Number(col)]);
      if (!code) continue;
      slots.push({ day, jam, start, end, classLabel, code });
    }
  }
  return { slots, classLabels: Array.from(new Set(Object.values(classCols))) };
}

/** Cari sheet pemetaan & sheet jadwal otomatis dari isi sheet. */
export function parseWorkbookSheets(sheets: Record<string, Grid>): ParsedWorkbook {
  const warnings: string[] = [];
  let pemetaan: Grid | null = null;
  const gridCandidates: Grid[] = [];
  for (const rows of Object.values(sheets)) {
    const head = rows.slice(0, 12).flat().map(text).join(' ').toUpperCase();
    if (/PEMETAAN GURU/.test(head)) pemetaan = rows;
    else if (/JADWAL PELAJARAN/.test(head)) gridCandidates.push(rows);
  }
  if (!pemetaan) throw new Error('Sheet "Pemetaan Guru" tidak ditemukan (judul "DAFTAR PEMETAAN GURU")');
  if (!gridCandidates.length) throw new Error('Sheet jadwal tidak ditemukan (judul "JADWAL PELAJARAN")');
  if (gridCandidates.length > 1) warnings.push(`Ada ${gridCandidates.length} sheet jadwal; yang pertama dipakai`);

  const teachers = parsePemetaan(pemetaan, warnings);
  const { slots, classLabels } = parseGrid(gridCandidates[0], warnings);

  const known = new Set(teachers.map((t) => t.code));
  const unknown = Array.from(new Set(slots.filter((s) => !known.has(s.code)).map((s) => s.code)));
  if (unknown.length) warnings.push(`Kode di jadwal yang tidak ada di pemetaan: ${unknown.join(', ')}`);
  return { teachers, slots: slots.filter((s) => known.has(s.code)), classLabels, warnings };
}

/* ----------------------------- Pencocokan nama ----------------------------- */

const TITLE_TOKENS = new Set([
  'dra', 'drs', 'dr', 'hj', 'ir', 'pd', 'kom', 'ag', 'si', 'se', 'mm', 'mpd', 'md', 'kes', 'sos', 'ed', 'hum', 'sh', 'st', 'mt',
  'spd', 'skom', 'sag', 'ssi', 'mpdi', 'mkom', 'msi', 'sst', 'amd', 'sap', 'spdi',
]);

/** Gabungkan huruf yang dieja terpisah ("E N T I N" -> "ENTIN"). */
function joinSpelledLetters(s: string): string {
  const parts = s.split(/\s+/);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) out.push(run.join(''));
    else out.push(...run);
    run = [];
  };
  for (const p of parts) {
    if (/^[A-Za-z],?$/.test(p)) run.push(p.replace(',', ''));
    else {
      flush();
      out.push(p);
    }
  }
  flush();
  return out.join(' ');
}

export function nameTokens(name: string): string[] {
  const t = joinSpelledLetters(String(name || '').replace(/ /g, ' '))
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return t.filter((w) => w.length > 1 && !TITLE_TOKENS.has(w));
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const tokenSim = (a: string, b: string) => 1 - levenshtein(a, b) / Math.max(a.length, b.length);

/** Skor 0..1 kemiripan dua nama (abaikan gelar, toleran salah ketik). */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const best = (xs: string[], ys: string[]) =>
    xs.reduce((sum, x) => sum + Math.max(...ys.map((y) => tokenSim(x, y))), 0) / xs.length;
  return best(ta, tb) * 0.65 + best(tb, ta) * 0.35;
}

export interface DbTeacher { id: string; name: string; nip?: string | null; subject?: string | null }

export type MatchStatus = 'cocok' | 'periksa' | 'tidak';

export interface TeacherMatch {
  teacherId: string;       // '' bila tidak ada
  score: number;
  status: MatchStatus;
  candidates: { id: string; name: string; score: number }[];
}

export function matchTeacher(fileName: string, db: DbTeacher[]): TeacherMatch {
  const ranked = db
    .map((t) => ({ id: t.id, name: t.name, score: nameSimilarity(fileName, t.name) }))
    .sort((x, y) => y.score - x.score);
  const top = ranked[0];
  const second = ranked[1];
  if (!top) return { teacherId: '', score: 0, status: 'tidak', candidates: [] };
  const unique = !second || top.score - second.score >= 0.08;
  let status: MatchStatus = 'tidak';
  if (top.score >= 0.9 && unique) status = 'cocok';
  else if (top.score >= 0.7) status = 'periksa';
  return {
    teacherId: status === 'tidak' ? '' : top.id,
    score: top.score,
    status,
    candidates: ranked.slice(0, 5),
  };
}

/* ----------------------------- Kelas & mapel ----------------------------- */

/** "VII A" / "7A" / "VII-A" / "7 A" -> "7A" */
export function classKey(label: string): string {
  const s = String(label || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = s.match(/^(VIII|VII|IX|7|8|9)([A-Z])$/);
  if (!m) return s;
  const g = { VII: '7', VIII: '8', IX: '9' }[m[1] as 'VII' | 'VIII' | 'IX'] || m[1];
  return g + m[2];
}

const SUBJECT_DEFAULTS: Record<string, string> = {
  'mat': 'Matematika', 'matematika': 'Matematika',
  'ipa': 'IPA', 'ips': 'IPS',
  'pai': 'Pendidikan Agama', 'agama': 'Pendidikan Agama',
  'b. inggris': 'Bahasa Inggris', 'b.inggris': 'Bahasa Inggris', 'bing': 'Bahasa Inggris',
  'b. indonesia': 'Bahasa Indonesia', 'b.indonesia': 'Bahasa Indonesia', 'bind': 'Bahasa Indonesia',
  'b. sunda': 'Bahasa Sunda', 'b.sunda': 'Bahasa Sunda',
  'sbk': 'Seni Budaya', 'sbdp': 'Seni Budaya',
  'penjaskes': 'PJOK', 'pjok': 'PJOK',
  'pkn': 'PKN', 'ppkn': 'PKN',
  'tik': 'Informatika', 'informatika': 'Informatika',
  'prakarya': 'Prakarya',
};

export function defaultSubject(fileSubject: string): string {
  const k = String(fileSubject || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return SUBJECT_DEFAULTS[k] || String(fileSubject || '').trim();
}

/* ----------------------------- Susun jadwal ----------------------------- */

const toMin = (t: string) => {
  const [h, m] = String(t).split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export interface ExistingSchedule {
  id: string;
  class_id: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: string;
}

export interface PlannedRow {
  class_id: string;
  teacher_id: string;
  day_of_week: number;
  start: string;   // HH:MM
  end: string;
  subject: string;
  classLabel: string;
  teacherName: string;
  jamFrom: number;
  jamTo: number;
}

export interface Conflict {
  classLabel: string;
  day: number;
  start: string;
  end: string;
  teacherName: string;
  reason: string;
}

export interface BuildResult {
  rows: PlannedRow[];
  alreadyExists: number;     // slot (per jam) yang sudah tercakup jadwal di database
  conflicts: Conflict[];
  skippedNoTeacher: number;
  skippedNoClass: number;
}

export interface BuildInput {
  slots: FileSlot[];
  teachers: FileTeacher[];
  /** kode guru file -> id guru database ('' = lewati) */
  teacherIdByCode: Record<string, string>;
  teacherNameById: Record<string, string>;
  /** label kelas file -> id kelas database ('' = lewati) */
  classIdByLabel: Record<string, string>;
  /** kode guru file -> nama mapel yang disimpan */
  subjectByCode: Record<string, string>;
  existing: ExistingSchedule[];
  mergeContiguous: boolean;
}

const overlaps = (s1: number, e1: number, s2: number, e2: number) => s1 < e2 && s2 < e1;

export function buildPlan(inp: BuildInput): BuildResult {
  let alreadyExists = 0, skippedNoTeacher = 0, skippedNoClass = 0;
  const conflicts: Conflict[] = [];
  const fresh: (PlannedRow & { key: string })[] = [];

  const existingByClassDay = new Map<string, ExistingSchedule[]>();
  const existingByTeacherDay = new Map<string, ExistingSchedule[]>();
  for (const e of inp.existing) {
    const k1 = `${e.class_id}|${e.day_of_week}`;
    const k2 = `${e.teacher_id}|${e.day_of_week}`;
    (existingByClassDay.get(k1) || existingByClassDay.set(k1, []).get(k1)!).push(e);
    (existingByTeacherDay.get(k2) || existingByTeacherDay.set(k2, []).get(k2)!).push(e);
  }

  // jadwal yang direncanakan, untuk mendeteksi guru ganda di file sendiri
  const claimed = new Set<string>();

  for (const s of inp.slots) {
    const teacherId = inp.teacherIdByCode[s.code];
    const classId = inp.classIdByLabel[s.classLabel];
    if (!teacherId) { skippedNoTeacher++; continue; }
    if (!classId) { skippedNoClass++; continue; }
    const st = toMin(s.start), en = toMin(s.end);
    const teacherName = inp.teacherNameById[teacherId] || s.code;

    const sameClass = (existingByClassDay.get(`${classId}|${s.day}`) || []).filter(
      (e) => overlaps(st, en, toMin(e.start_time), toMin(e.end_time)),
    );
    if (sameClass.length) {
      if (sameClass.some((e) => e.teacher_id === teacherId)) { alreadyExists++; continue; }
      const other = sameClass[0];
      conflicts.push({
        classLabel: s.classLabel, day: s.day, start: s.start, end: s.end, teacherName,
        reason: `Kelas sudah punya jadwal ${String(other.start_time).slice(0, 5)}-${String(other.end_time).slice(0, 5)} (${other.subject}) dengan guru lain`,
      });
      continue;
    }
    const clash = (existingByTeacherDay.get(`${teacherId}|${s.day}`) || []).find(
      (e) => e.class_id !== classId && overlaps(st, en, toMin(e.start_time), toMin(e.end_time)),
    );
    if (clash) {
      conflicts.push({
        classLabel: s.classLabel, day: s.day, start: s.start, end: s.end, teacherName,
        reason: `Guru sudah mengajar di kelas lain pada ${String(clash.start_time).slice(0, 5)}-${String(clash.end_time).slice(0, 5)}`,
      });
      continue;
    }
    const ck = `${teacherId}|${s.day}|${s.start}`;
    if (claimed.has(ck)) {
      conflicts.push({ classLabel: s.classLabel, day: s.day, start: s.start, end: s.end, teacherName, reason: 'Guru ganda di file pada jam yang sama' });
      continue;
    }
    claimed.add(ck);
    fresh.push({
      key: `${classId}|${s.day}|${teacherId}|${inp.subjectByCode[s.code] || ''}`,
      class_id: classId, teacher_id: teacherId, day_of_week: s.day, start: s.start, end: s.end,
      subject: inp.subjectByCode[s.code] || '', classLabel: s.classLabel, teacherName,
      jamFrom: s.jam, jamTo: s.jam,
    });
  }

  fresh.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : toMin(a.start) - toMin(b.start)));
  const rows: PlannedRow[] = [];
  for (const r of fresh) {
    const last = rows[rows.length - 1];
    const lastKey = last ? `${last.class_id}|${last.day_of_week}|${last.teacher_id}|${last.subject}` : '';
    if (inp.mergeContiguous && last && lastKey === r.key && toMin(last.end) === toMin(r.start)) {
      last.end = toHHMM(toMin(r.end));
      last.jamTo = r.jamTo;
    } else {
      const { key: _k, ...row } = r;
      rows.push(row);
    }
  }
  rows.sort((a, b) => a.day_of_week - b.day_of_week || toMin(a.start) - toMin(b.start) || a.classLabel.localeCompare(b.classLabel));
  return { rows, alreadyExists, conflicts, skippedNoTeacher, skippedNoClass };
}
