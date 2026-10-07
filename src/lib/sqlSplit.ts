/**
 * Memecah file SQL menjadi pernyataan terpisah.
 * Aman terhadap titik-koma di dalam string '...', "..." , komentar (-- dan blok),
 * dan dollar-quoting ($$...$$ / $tag$...$tag$) yang dipakai fungsi & blok DO.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  const n = sql.length;

  const flush = () => {
    const s = buf.trim();
    if (s) out.push(s);
    buf = '';
  };

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];

    // komentar baris
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    // komentar blok
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // string / identifier berkutip (kutip ganda di dalamnya ditulis dua kali)
    if (c === "'" || c === '"') {
      const q = c;
      buf += c;
      i++;
      while (i < n) {
        buf += sql[i];
        if (sql[i] === q) {
          if (sql[i + 1] === q) { buf += sql[i + 1]; i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    // dollar quoting
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        buf += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === ';') {
      buf += c;
      i++;
      flush();
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

/** Kelompokkan pernyataan menjadi potongan berukuran <= maxBytes (kira-kira, berdasar jumlah karakter). */
export function chunkStatements(statements: string[], maxChars = 900_000, maxCount = 2000): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let size = 0;
  for (const s of statements) {
    if (cur.length > 0 && (size + s.length > maxChars || cur.length >= maxCount)) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(s);
    size += s.length;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
