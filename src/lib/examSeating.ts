// Logika penyusunan ruang, tempat duduk, dan nomor peserta ujian (murni, tanpa React/jsPDF agar mudah diuji).

export type SeatingMode = 'auto' | 'alternating' | 'by_class';

export interface SeatStudent {
  id: string;
  full_name: string;
  classes: { name: string; grade: number };
}

export interface Seat<S extends SeatStudent = SeatStudent> {
  tableNumber: number;
  examNumber: number;
  student: S;
}

export interface SeatRoom<S extends SeatStudent = SeatStudent> {
  roomNumber: number;
  seats: Seat<S>[];
}

export interface BuildOptions {
  /** Tingkat yang disertakan, mis. ['7','8','9'] */
  grades: string[];
  rows: number;
  cols: number;
  mode: SeatingMode;
  /** 5 digit awal nomor peserta per tingkat, mis. { '7': 25267, '8': 25268, '9': 25269 } */
  startNumbers: Record<string, number>;
}

export interface BuildResult<S extends SeatStudent = SeatStudent> {
  rooms: SeatRoom<S>[];
  warnings: string[];
}

export const DEFAULT_START_NUMBERS: Record<string, number> = { '7': 25267, '8': 25268, '9': 25269 };

const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });
export const naturalCompare = (a: string, b: string): number => collator.compare(a, b);

/** Nomor meja berpola ular: baris genap kiri→kanan, baris ganjil kanan→kiri (mulai 0). */
export function snakeTableNumber(row: number, col: number, cols: number): number {
  return row % 2 === 0 ? row * cols + col + 1 : (row + 1) * cols - col;
}

/** Kebalikan snakeTableNumber: posisi (baris, kolom) dari nomor meja. */
export function snakeCell(tableNumber: number, cols: number): { row: number; col: number } {
  const i = tableNumber - 1;
  const row = Math.floor(i / cols);
  const k = i % cols;
  return { row, col: row % 2 === 0 ? k : cols - 1 - k };
}

/** Nomor peserta = 5 digit awal tingkat + nomor urut (3 digit; otomatis 4 digit bila siswa satu tingkat > 999). */
export function formatExamNumber(prefix: number, seq: number, seqDigits = 3): number {
  return prefix * Math.pow(10, seqDigits) + seq;
}

/** Kesalahan isian nomor awal per tingkat (kunci = tingkat). Kosong = valid. */
export function validateStartNumbers(values: Record<string, string | number>, grades: string[]): Record<string, string> {
  const errs: Record<string, string> = {};
  const seen = new Map<number, string>();
  for (const g of grades) {
    const raw = String(values[g] ?? '').trim();
    if (!/^\d{5}$/.test(raw)) { errs[g] = 'Harus 5 digit angka'; continue; }
    const n = Number(raw);
    if (n < 10000) { errs[g] = 'Tidak boleh diawali 0'; continue; }
    const other = seen.get(n);
    if (other) { errs[g] = `Sama dengan kelas ${other} (nomor akan bentrok)`; continue; }
    seen.set(n, g);
  }
  return errs;
}

const byName = (a: SeatStudent, b: SeatStudent) => collator.compare(a.full_name || '', b.full_name || '');

/**
 * Susun urutan agar siswa sekelas tidak bersebelahan (kiri-kanan) maupun depan-belakang bila memungkinkan.
 * Greedy: untuk tiap kursi ambil siswa berikutnya yang tidak sekelas dengan tetangga kiri/atas (jendela terbatas);
 * bila tidak ada, pakai urutan semula.
 */
export function reduceAdjacency<S extends SeatStudent>(list: S[], cols: number): S[] {
  const rest = list.slice();
  const placed: S[] = [];
  const clsOf = (s?: S) => s?.classes.name;
  const WINDOW = rest.length; // seluruh sisa potongan: cari siswa pertama yang tidak sekelas dengan tetangga kiri/atas
  while (rest.length) {
    const i = placed.length;
    const col = i % cols;
    const left = col > 0 ? placed[i - 1] : undefined;
    const up = i >= cols ? placed[i - cols] : undefined;
    let pick = -1;
    for (let k = 0; k < Math.min(rest.length, WINDOW); k++) {
      const c = clsOf(rest[k]);
      if (c !== clsOf(left) && c !== clsOf(up)) { pick = k; break; }
    }
    if (pick < 0) pick = 0;
    placed.push(rest.splice(pick, 1)[0]);
  }
  return repairByLocalSwaps(placed, cols);
}

/** Jumlah tetangga (kiri, kanan, atas, bawah) sekelas dengan kursi idx. */
function conflictsAt<S extends SeatStudent>(arr: S[], idx: number, cols: number): number {
  const c = arr[idx].classes.name;
  const col = idx % cols;
  let n = 0;
  if (col > 0 && arr[idx - 1].classes.name === c) n++;
  if (col < cols - 1 && idx + 1 < arr.length && arr[idx + 1].classes.name === c) n++;
  if (idx - cols >= 0 && arr[idx - cols].classes.name === c) n++;
  if (idx + cols < arr.length && arr[idx + cols].classes.name === c) n++;
  return n;
}

/** Perbaikan akhir: tukar dua kursi bila total tetangga sekelas berkurang (beberapa putaran). */
function repairByLocalSwaps<S extends SeatStudent>(list: S[], cols: number): S[] {
  const a = list.slice();
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (let i = 0; i < a.length; i++) {
      if (conflictsAt(a, i, cols) === 0) continue;
      for (let j = 0; j < a.length; j++) {
        if (j === i || a[j].classes.name === a[i].classes.name) continue;
        const before = conflictsAt(a, i, cols) + conflictsAt(a, j, cols);
        [a[i], a[j]] = [a[j], a[i]];
        const after = conflictsAt(a, i, cols) + conflictsAt(a, j, cols);
        if (after < before) { improved = true; break; }
        [a[i], a[j]] = [a[j], a[i]];
      }
    }
    if (!improved) break;
  }
  return a;
}

/** Jumlah pasangan bersebelahan (kiri-kanan / depan-belakang) yang sekelas. */
export function countSameClassNeighbors(room: SeatRoom, cols: number): number {
  const byTable = new Map(room.seats.map((s) => [s.tableNumber, s]));
  let n = 0;
  for (const s of room.seats) {
    const { row, col } = snakeCell(s.tableNumber, cols);
    const right = col + 1 < cols ? byTable.get(snakeTableNumber(row, col + 1, cols)) : undefined;
    const down = byTable.get(snakeTableNumber(row + 1, col, cols));
    if (right && right.student.classes.name === s.student.classes.name) n++;
    if (down && down.student.classes.name === s.student.classes.name) n++;
  }
  return n;
}

/** Bagi n siswa ke k ruang selisih paling banyak 1 (ruang awal mendapat sisa). */
function balancedSizes(n: number, cap: number): number[] {
  const k = Math.max(1, Math.ceil(n / cap));
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

export function buildRooms<S extends SeatStudent>(students: S[], opts: BuildOptions): BuildResult<S> {
  const warnings: string[] = [];
  const rows = Math.max(1, Math.floor(opts.rows) || 1);
  const cols = Math.max(1, Math.floor(opts.cols) || 1);
  const cap = rows * cols;
  const grades = Array.from(new Set(opts.grades)).sort((a, b) => Number(a) - Number(b));

  const pool = students.filter((s) => grades.includes(String(s.classes?.grade)));
  if (pool.length === 0) return { rooms: [], warnings };

  // kelompokkan per rombel berdasarkan TINGKAT sebenarnya (bukan huruf pertama nama kelas)
  const byClass = new Map<string, S[]>();
  for (const s of pool) {
    const key = s.classes.name;
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key)!.push(s);
  }
  byClass.forEach((list) => list.sort(byName));
  const classNamesOfGrade = (g: string) =>
    Array.from(byClass.keys())
      .filter((n) => String(byClass.get(n)![0].classes.grade) === g)
      .sort(naturalCompare);

  const singleMode = opts.mode === 'by_class' || (opts.mode === 'auto' && grades.length === 1);

  // 1) bentuk potongan siswa per ruang
  const chunks: S[][] = [];
  if (singleMode) {
    for (const g of grades) {
      for (const cn of classNamesOfGrade(g)) {
        const list = byClass.get(cn)!;
        let at = 0;
        for (const size of balancedSizes(list.length, cap)) { chunks.push(list.slice(at, at + size)); at += size; }
      }
    }
  } else {
    const perGrade = grades.map((g) => classNamesOfGrade(g));
    const maxLen = Math.max(...perGrade.map((c) => c.length));
    const groups: string[][] = [];
    for (let i = 0; i < maxLen; i++) {
      const grp = perGrade.map((c) => c[i]).filter(Boolean) as string[];
      if (grp.length) groups.push(grp);
    }
    // gabungkan kelompok tunggal berurutan yang setingkat (mis. [8F],[8G] -> [8F,8G])
    const merged: string[][] = [];
    for (let i = 0; i < groups.length;) {
      if (groups[i].length === 1) {
        const g0 = String(byClass.get(groups[i][0])![0].classes.grade);
        const m = [groups[i][0]];
        let j = i + 1;
        while (j < groups.length && groups[j].length === 1 && String(byClass.get(groups[j][0])![0].classes.grade) === g0) { m.push(groups[j][0]); j++; }
        merged.push(m); i = j;
      } else { merged.push(groups[i]); i++; }
    }
    const ordered: S[] = [];
    for (const grp of merged) {
      const idx = grp.map(() => 0);
      let left = grp.reduce((n, c) => n + byClass.get(c)!.length, 0);
      let r = 0;
      while (left > 0) {
        const c = grp[r % grp.length];
        const list = byClass.get(c)!;
        if (idx[r % grp.length] < list.length) { ordered.push(list[idx[r % grp.length]++]); left--; }
        r++;
      }
    }
    for (let at = 0; at < ordered.length; at += cap) chunks.push(ordered.slice(at, at + cap));
  }

  // 2) tempatkan ke kursi, beri nomor meja (ular) dan nomor peserta (urut per tingkat menurut nomor meja)
  const gradeCount: Record<string, number> = {};
  for (const s of pool) { const g = String(s.classes.grade); gradeCount[g] = (gradeCount[g] || 0) + 1; }
  const seqDigits: Record<string, number> = {};
  for (const g of grades) {
    seqDigits[g] = (gradeCount[g] || 0) > 999 ? 4 : 3;
    if (seqDigits[g] === 4) warnings.push(`Kelas ${g} memiliki lebih dari 999 siswa: nomor urut memakai 4 digit.`);
  }
  const counters: Record<string, number> = {};
  const prefixOf = (g: string) => opts.startNumbers[g] ?? DEFAULT_START_NUMBERS[g] ?? 0;

  const rooms: SeatRoom<S>[] = [];
  chunks.forEach((chunk, ci) => {
    const arranged = singleMode ? chunk : reduceAdjacency(chunk, cols);
    const seats: Seat<S>[] = arranged.map((student, i) => ({
      tableNumber: snakeTableNumber(Math.floor(i / cols), i % cols, cols),
      examNumber: 0,
      student,
    }));
    seats.sort((a, b) => a.tableNumber - b.tableNumber);
    for (const seat of seats) {
      const g = String(seat.student.classes.grade);
      counters[g] = (counters[g] || 0) + 1;
      seat.examNumber = formatExamNumber(prefixOf(g), counters[g], seqDigits[g] || 3);
    }
    const room = { roomNumber: ci + 1, seats };
    rooms.push(room);
    if (!singleMode && new Set(chunk.map((x) => x.classes.name)).size > 1) {
      const n = countSameClassNeighbors(room, cols);
      if (n > 0) warnings.push(`Ruang ${room.roomNumber}: ${n} pasang siswa sekelas bersebelahan (sisa kelompok kelas tidak bisa dipisah).`);
    }
  });

  return { rooms, warnings };
}

/** Saring kursi (mis. untuk cetak kartu sebagian siswa) TANPA mengubah ruang, meja, dan nomor peserta. */
export function filterRoomsKeepNumbers<S extends SeatStudent>(rooms: SeatRoom<S>[], keep: (s: S) => boolean): SeatRoom<S>[] {
  return rooms
    .map((r) => ({ roomNumber: r.roomNumber, seats: r.seats.filter((x) => keep(x.student)) }))
    .filter((r) => r.seats.length > 0);
}
