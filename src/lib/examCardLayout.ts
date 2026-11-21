// Pembantu tata letak teks kartu peserta ujian (jsPDF). Murni: hanya butuh fungsi pengukur lebar teks.

export type Measure = (text: string) => number;

/**
 * Pecah teks menjadi paling banyak `maxLines` baris selebar `maxW`.
 * Kata dipecah di spasi; kata yang lebih panjang dari satu baris (mis. email) dipecah per huruf,
 * sehingga tidak pernah meluber keluar kolom. Sisa yang tidak muat diganti "…" pada baris terakhir.
 */
export function wrapLines(measure: Measure, text: string, maxW: number, maxLines = 2): string[] {
  const src = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!src) return [''];
  if (maxW <= 0) return [src];
  const lines: string[] = [];
  let cur = '';
  const push = (s: string) => { lines.push(s); cur = ''; };
  const words = src.split(' ');
  for (const word of words) {
    let w = word;
    const trial = cur ? cur + ' ' + w : w;
    if (measure(trial) <= maxW) { cur = trial; continue; }
    if (cur) push(cur);
    // kata sendiri terlalu panjang: pecah per huruf
    while (measure(w) > maxW && w.length > 1) {
      let n = w.length - 1;
      while (n > 1 && measure(w.slice(0, n)) > maxW) n--;
      push(w.slice(0, n));
      w = w.slice(n);
    }
    cur = w;
  }
  if (cur) push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  // semua sisa digabung ke baris terakhir lalu dipotong dengan "…"
  let last = kept[maxLines - 1] + ' ' + lines.slice(maxLines).join(' ');
  last = last.trimEnd();
  while (last.length > 1 && measure(last + '…') > maxW) last = last.slice(0, -1);
  kept[maxLines - 1] = last.trimEnd() + '…';
  return kept;
}

export interface IdRow { label: string; value: string; maxLines?: number }
export interface PlacedRow { label: string; lines: string[]; y: number }

/**
 * Letakkan baris identitas. Baris yang dimulai di atas `photoBottom` memakai kolom sempit (di kiri foto),
 * baris di bawah foto memakai lebar penuh — jadi nilai panjang (TTL, username) tidak menabrak foto.
 * `y` adalah garis dasar baris pertama tiap item; `endY` adalah garis dasar berikutnya.
 */
export function layoutIdentityRows(
  measure: Measure, rows: IdRow[],
  o: { startY: number; rowH: number; narrowW: number; fullW: number; photoBottom: number },
): { placed: PlacedRow[]; endY: number } {
  const placed: PlacedRow[] = [];
  let y = o.startY;
  for (const r of rows) {
    const w = y < o.photoBottom ? o.narrowW : o.fullW;
    const lines = wrapLines(measure, r.value, w, r.maxLines ?? 2);
    placed.push({ label: r.label, lines, y });
    y += o.rowH * lines.length;
  }
  return { placed, endY: y };
}
