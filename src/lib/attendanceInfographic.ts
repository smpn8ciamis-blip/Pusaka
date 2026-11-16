/**
 * Infografis absensi (Izin & Sakit, Alpa) dari data absensi pada filter yang sedang aktif.
 * Keluarannya berupa HTML mandiri (tanpa skrip) yang bisa dipratinjau, dicetak/disimpan PDF, atau diunduh.
 */

export type GenderKey = 'L' | 'P' | '?';

export interface InfoRecord {
  student_id: string;
  /** YYYY-MM-DD */
  date: string;
  /** hadir | terlambat | sakit | izin | alpa */
  status: string;
  name: string;
  className: string;
  gender: GenderKey;
}

export interface StudentLine { id: string; name: string; className: string; dates: string[] }

export interface KindStats {
  total: number;
  students: number;
  byClass: [string, number][];
  /** kelas yang tidak punya catatan jenis ini */
  zeroClasses: string[];
  gender: Record<GenderKey, number>;
  byDate: [string, number][];
  /** semua siswa, urut paling sering */
  lines: StudentLine[];
}

export interface InfographicData {
  startDate: string;
  endDate: string;
  scopeLabel: string;
  izin: KindStats;
  sakit: KindStats;
  alpa: KindStats;
  schoolDays: string[];
  /** siswa alpa berturut-turut di hari sekolah (>= 3 hari beruntun) */
  streaks: { name: string; className: string; from: string; to: string; length: number }[];
  multiMonth: boolean;
}

export interface InfographicOptions {
  /** Semua nama kelas (singkat) yang masuk cakupan, untuk menandai kelas tanpa catatan */
  allClasses: string[];
  startDate: string;
  endDate: string;
  scopeLabel?: string;
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const parts = (iso: string) => { const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10)); return { y, m, d }; };
const classCmp = (a: string, b: string) => a.localeCompare(b, 'id', { numeric: true });

export const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** "2026-11-02","2026-11-16" -> "2–16 November 2026" */
export function periodLabel(start: string, end: string): string {
  const a = parts(start), b = parts(end);
  if (start === end) return `${a.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${a.y}`;
  return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}
const monthYear = (iso: string) => { const p = parts(iso); return `${MONTHS_SHORT[p.m - 1]} ${p.y}`; };
const dayLabel = (iso: string, multiMonth: boolean) => { const p = parts(iso); return multiMonth ? `${p.d}/${p.m}` : String(p.d); };
const dayMonth = (iso: string) => { const p = parts(iso); return `${p.d} ${MONTHS_SHORT[p.m - 1]}`; };

function kindStats(records: InfoRecord[], status: string, allClasses: string[]): KindStats {
  const seen = new Set<string>();
  const rows = records.filter((r) => r.status === status).filter((r) => { const k = `${r.student_id}|${r.date}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const byClassMap = new Map<string, number>();
  const gender: Record<GenderKey, number> = { L: 0, P: 0, '?': 0 };
  const byDateMap = new Map<string, number>();
  const lineMap = new Map<string, StudentLine>();
  rows.forEach((r) => {
    byClassMap.set(r.className, (byClassMap.get(r.className) || 0) + 1);
    gender[r.gender]++;
    byDateMap.set(r.date, (byDateMap.get(r.date) || 0) + 1);
    const l = lineMap.get(r.student_id) ?? { id: r.student_id, name: r.name, className: r.className, dates: [] };
    l.dates.push(r.date);
    lineMap.set(r.student_id, l);
  });
  const lines = [...lineMap.values()].map((l) => ({ ...l, dates: [...l.dates].sort() }))
    .sort((a, b) => b.dates.length - a.dates.length || a.name.localeCompare(b.name, 'id'));
  const byClass = [...byClassMap.entries()].sort((a, b) => b[1] - a[1] || classCmp(a[0], b[0]));
  const zeroClasses = allClasses.filter((c) => !byClassMap.has(c)).sort(classCmp);
  return { total: rows.length, students: lineMap.size, byClass, zeroClasses, gender, byDate: [...byDateMap.entries()].sort((a, b) => a[0].localeCompare(b[0])), lines };
}

export function computeInfographic(records: InfoRecord[], opts: InfographicOptions): InfographicData {
  const schoolDays = [...new Set(records.map((r) => r.date))].sort();
  const izin = kindStats(records, 'izin', opts.allClasses);
  const sakit = kindStats(records, 'sakit', opts.allClasses);
  const alpa = kindStats(records, 'alpa', opts.allClasses);

  // alpa berturut-turut pada hari sekolah (hari yang punya data absensi), minimal 3 hari beruntun
  const idx = new Map(schoolDays.map((d, i) => [d, i]));
  const streaks: InfographicData['streaks'] = [];
  alpa.lines.forEach((l) => {
    const ix = l.dates.map((d) => idx.get(d)).filter((n): n is number => n != null).sort((a, b) => a - b);
    let best: { s: number; e: number } | null = null;
    let s = 0;
    for (let i = 1; i <= ix.length; i++) {
      if (i === ix.length || ix[i] !== ix[i - 1] + 1) {
        if (!best || i - s > best.e - best.s + 1) best = { s, e: i - 1 };
        s = i;
      }
    }
    if (best && best.e - best.s + 1 >= 3) {
      streaks.push({ name: l.name, className: l.className, from: schoolDays[ix[best.s]], to: schoolDays[ix[best.e]], length: best.e - best.s + 1 });
    }
  });
  streaks.sort((a, b) => b.length - a.length || a.name.localeCompare(b.name, 'id'));

  const a = parts(opts.startDate), b = parts(opts.endDate);
  return {
    startDate: opts.startDate, endDate: opts.endDate, scopeLabel: opts.scopeLabel || '',
    izin, sakit, alpa, schoolDays, streaks,
    multiMonth: a.y !== b.y || a.m !== b.m,
  };
}

// ------------------------------------------------------------------ penyusun kalimat
const listId = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} dan ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, dan ${xs[xs.length - 1]}`);
const firstName = (n: string) => n.split(/\s+/)[0] || n;

function zeroNote(kind: string, zero: string[]): string {
  if (zero.length === 0) return `Semua kelas ada catatan ${kind}.`;
  if (zero.length > 8) return `${zero.length} kelas tidak ada ${kind}.`;
  return `Kelas ${listId(zero)} tidak ada ${kind}.`;
}
function topClassNote(by: [string, number][]): string {
  if (by.length === 0) return '';
  const [a, b, c] = by;
  let t = `${a[0]} paling banyak (${a[1]})`;
  if (b && c) t += `, disusul ${b[0]} (${b[1]}) dan ${c[0]} (${c[1]})`;
  else if (b) t += `, disusul ${b[0]} (${b[1]})`;
  return t + '.';
}
function genderNote(g: Record<GenderKey, number>): string {
  const t = `Laki-laki ${g.L} catatan, perempuan ${g.P} catatan`;
  return g['?'] > 0 ? `${t}, belum diketahui ${g['?']} catatan.` : `${t}.`;
}
function peakNote(by: [string, number][]): string {
  if (by.length === 0) return '';
  const max = Math.max(...by.map((x) => x[1]));
  const peaks = by.filter((x) => x[1] === max).map((x) => dayMonth(x[0]));
  const shown = peaks.length > 4 ? `${peaks.slice(0, 4).join(', ')} dan ${peaks.length - 4} tanggal lain` : listId(peaks);
  return `Puncaknya ${shown} (${peaks.length > 1 ? 'masing-masing ' : ''}${max} catatan).`;
}

// ------------------------------------------------------------------ HTML
const CSS_COMMON = `
html{scroll-padding-top:env(safe-area-inset-top,0px)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Segoe UI",system-ui,-apple-system,Helvetica,Arial,sans-serif;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{max-width:860px;margin:0 auto;padding:24px 16px 40px}
h1{font-size:clamp(26px,5vw,38px);line-height:1.1;margin:0 0 6px;letter-spacing:-.5px}
.sub{color:var(--mute);margin:0 0 20px;font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;break-inside:avoid}
h2{font-size:20px;margin:32px 0 4px;break-after:avoid}
h3{font-size:16px;margin:20px 0 4px;break-after:avoid}
.note{color:var(--mute);font-size:13px;margin:0 0 10px}
.row{display:grid;grid-template-columns:44px 1fr 32px;gap:10px;align-items:center;margin:7px 0;font-size:14px}
.bar{height:18px;border-radius:4px;overflow:hidden}
.bar i{display:block;height:100%}
.row b{text-align:right}
.st{display:grid;grid-template-columns:42px 1fr;gap:12px;padding:12px 0;border-top:1px solid var(--line);break-inside:avoid}
.st:first-child{border-top:0}
.cnt{font-size:28px;font-weight:800;line-height:1;text-align:center}
.cnt small{display:block;font-size:11px;font-weight:400;color:var(--mute)}
.nm{font-weight:700}.nm span{font-weight:400;color:var(--mute);font-size:13px;margin-left:6px}
.chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.chips em{font-style:normal;border-radius:5px;padding:1px 7px;font-size:12px;font-weight:600}
.gen{display:flex;height:34px;border-radius:6px;overflow:hidden;font-size:13px;font-weight:700;color:#fff}
.gen div{display:flex;align-items:center;justify-content:center;white-space:nowrap}
.empty{color:var(--mute);font-size:14px;padding:6px 0}
.foot{margin-top:28px;color:var(--mute);font-size:12px}
.table{width:100%;border-collapse:collapse;font-size:13px}
.table td{padding:6px 4px;border-top:1px solid var(--line);vertical-align:top}
.table tr:first-child td{border-top:0}
.table td:first-child{width:46%}.table td:nth-child(2){width:48px;color:var(--mute)}
@media print{body{background:#fff}.wrap{padding:0}}
`;

const THEME_IS = `:root{--bg:#f3f1ec;--card:#fff;--ink:#1d2433;--mute:#69707f;--line:#e1ddd3;--iz:#2f6fd0;--iz2:#d9e6f8;--sk:#d98200;--sk2:#fbe8c8}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171d;--card:#1d222b;--ink:#eceae4;--mute:#9aa1ae;--line:#2d3440;--iz:#6ea2f2;--iz2:#22344f;--sk:#f2a33a;--sk2:#4a3818}}
.big{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.big .card{color:#fff;border:0}
.big .a{background:var(--iz)}.big .b{background:var(--sk)}
.big .n{font-size:56px;font-weight:800;line-height:1}
.big .l{font-size:13px;opacity:.95}
.sec-i h2{color:var(--iz)}.sec-s h2{color:var(--sk)}
.sec-i .bar{background:var(--iz2)}.sec-i .bar i{background:var(--iz)}
.sec-s .bar{background:var(--sk2)}.sec-s .bar i{background:var(--sk)}
.sec-i .cnt{color:var(--iz)}.sec-s .cnt{color:var(--sk)}
.sec-i .chips em{background:var(--iz2);color:var(--iz)}.sec-s .chips em{background:var(--sk2);color:var(--sk)}`;

const THEME_ALPA = `:root{--bg:#f3f1ec;--card:#fff;--ink:#1d2433;--mute:#69707f;--line:#e1ddd3;--red:#c8372d;--red2:#f4d6d2;--chip:#fbe9e6}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171d;--card:#1d222b;--ink:#eceae4;--mute:#9aa1ae;--line:#2d3440;--red:#ff6b5e;--red2:#4a2a28;--chip:#3a2422}}
.big{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:12px;margin-bottom:12px}
@media(max-width:600px){.big{grid-template-columns:1fr 1fr}.big .hero{grid-column:1/-1}}
.hero{background:var(--red);color:#fff;border-color:var(--red)}
.hero .n{font-size:64px;font-weight:800;line-height:1}
.n{font-size:36px;font-weight:800;line-height:1.1}
.l{font-size:13px;color:var(--mute)}.hero .l{color:#fff;opacity:.9}
.bar{background:var(--red2)}.bar i{background:var(--red)}
.days{display:flex;gap:6px;align-items:flex-end;height:150px;padding-top:8px}
.d{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;font-size:12px;color:var(--mute);min-width:0}
.d i{display:block;width:100%;background:var(--red);border-radius:4px 4px 0 0;min-height:3px}
.d b{color:var(--ink);font-size:13px}
.cnt{color:var(--red)}
.chips em{background:var(--chip);color:var(--red)}
h2{font-size:18px;margin:28px 0 4px}`;

const NAVY = '#1f3a5f';
const PINK = '#8a4f7d';

const bars = (rows: [string, number][]): string => {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><div class="bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div><b>${v}</b></div>`).join('');
};

const genderBar = (g: Record<GenderKey, number>, pColor = PINK): string => {
  const total = g.L + g.P + g['?'];
  if (total === 0) return '';
  const seg = (n: number, label: string, color: string) => (n > 0 ? `<div style="width:${(n / total * 100).toFixed(1)}%;background:${color}">${label} ${n}</div>` : '');
  return `<div class="gen">${seg(g.L, 'Laki-laki', NAVY)}${seg(g.P, 'Perempuan', pColor)}${seg(g['?'], 'Lainnya', '#7a808c')}</div>`;
};

const MAX_LINES = 60;
const studs = (lines: StudentLine[], multiMonth: boolean): string => {
  const shown = lines.slice(0, MAX_LINES);
  const more = lines.length > shown.length ? `<p class="note" style="margin-top:8px">+ ${lines.length - shown.length} siswa lainnya tidak ditampilkan.</p>` : '';
  return shown.map((l) => `<div class="st"><div class="cnt">${l.dates.length}<small>kali</small></div><div><div class="nm">${esc(l.name)}<span>Kelas ${esc(l.className)}</span></div><div class="chips">${l.dates.map((d) => `<em>${esc(dayLabel(d, multiMonth))}</em>`).join('')}</div></div></div>`).join('') + more;
};

const page = (title: string, theme: string, body: string): string => `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<style>${CSS_COMMON}${theme}</style>
</head>
<body>
<div class="wrap">
${body}
</div>
</body>
</html>`;

const chipNote = (d: InfographicData) => (d.multiMonth ? 'Angka di chip adalah tanggal/bulan.' : `Angka di chip adalah tanggal (${monthYear(d.startDate)}).`);

export interface RenderOptions { schoolName: string; printedAt: string; minIzin: number; minSakit: number; minAlpa: number }

export function renderIzinSakitHtml(d: InfographicData, o: RenderOptions): string {
  const scope = d.scopeLabel ? ` · ${esc(d.scopeLabel)}` : '';
  const sub = `${esc(o.schoolName)}${scope} · Sumber: data absensi Pusaka, dicetak ${esc(o.printedAt)}`;
  const section = (cls: 'sec-i' | 'sec-s', label: string, k: KindStats, min: number, idPrefix: string) => {
    const lines = k.lines.filter((l) => l.dates.length >= min);
    const lower = label.toLowerCase();
    if (k.total === 0) return `<div class="${cls}"><h2>${label}</h2><div class="card"><div class="empty">Tidak ada catatan ${lower} pada periode ini.</div></div></div>`;
    return `<div class="${cls}">
<h2>${label}</h2>
<h3>Per kelas</h3>
<p class="note">${esc(topClassNote(k.byClass))} ${esc(zeroNote(lower, k.zeroClasses))}</p>
<div class="card" id="${idPrefix}-kelas">${bars(k.byClass)}</div>
<h3>Jenis kelamin</h3>
<p class="note">${esc(genderNote(k.gender))}</p>
${genderBar(k.gender)}
<h3>Siswa dengan ${lower} ${min} kali atau lebih</h3>
<p class="note">${esc(chipNote(d))} ${lines.length} siswa.</p>
<div class="card">${lines.length ? studs(lines, d.multiMonth) : `<div class="empty">Tidak ada siswa dengan ${lower} ${min} kali atau lebih.</div>`}</div>
</div>`;
  };
  const body = `<h1>Siswa Izin dan Sakit, ${esc(periodLabel(d.startDate, d.endDate))}</h1>
<p class="sub">${sub}</p>
<div class="big">
<div class="card a"><div class="n">${d.izin.total}</div><div class="l">catatan izin</div></div>
<div class="card b"><div class="n">${d.sakit.total}</div><div class="l">catatan sakit</div></div>
</div>
${section('sec-i', 'Izin', d.izin, o.minIzin, 'iz')}
${section('sec-s', 'Sakit', d.sakit, o.minSakit, 'sk')}
<p class="foot">Hitungan per catatan absensi (satu siswa satu hari satu catatan); siswa yang sama bisa tercatat beberapa hari.</p>`;
  return page(`Infografis Siswa Izin dan Sakit – ${o.schoolName}, ${periodLabel(d.startDate, d.endDate)}`, THEME_IS, body);
}

export function renderAlpaHtml(d: InfographicData, o: RenderOptions): string {
  const a = d.alpa;
  const scope = d.scopeLabel ? ` · ${esc(d.scopeLabel)}` : '';
  const sub = `${esc(o.schoolName)}${scope} · Sumber: data absensi Pusaka, dicetak ${esc(o.printedAt)}`;
  const title = `Siswa Alpa, ${periodLabel(d.startDate, d.endDate)}`;
  if (a.total === 0) {
    return page(`Infografis ${title} – ${o.schoolName}`, THEME_ALPA, `<h1>${esc(title)}</h1><p class="sub">${sub}</p><div class="card"><div class="empty">Tidak ada catatan alpa pada periode ini.</div></div>`);
  }
  const topClass = a.byClass[0];
  const topStudent = a.lines[0];
  const multi = a.lines.filter((l) => l.dates.length >= Math.max(2, o.minAlpa));
  const once = a.lines.filter((l) => l.dates.length < Math.max(2, o.minAlpa));
  const maxDay = Math.max(...a.byDate.map((x) => x[1]));
  const days = a.byDate.map(([dt, n]) => `<div class="d"><b>${n}</b><i style="height:${(n / maxDay * 75).toFixed(1)}%"></i><span>${esc(dayLabel(dt, d.multiMonth))}</span></div>`).join('');
  const onceRows = once.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.className)}</td><td>${esc(l.dates.map(dayMonth).join(', '))}</td></tr>`).join('');
  const streakTxt = d.streaks.length
    ? `${listId(d.streaks.slice(0, 5).map((s) => `${firstName(s.name)} (${dayMonth(s.from)}–${dayMonth(s.to)})`))} alpa berturut-turut di setiap hari sekolah dalam rentang itu (${d.streaks.length > 5 ? 'lima teratas' : `${d.streaks.length} siswa`}), jadi layak jadi prioritas tindak lanjut wali kelas/BK.`
    : '';
  const body = `<h1>${esc(title)}</h1>
<p class="sub">${sub}</p>
<div class="big">
<div class="card hero"><div class="n">${a.total}</div><div class="l">catatan alpa dari ${a.students} siswa</div></div>
<div class="card"><div class="n">${topClass[1]}</div><div class="l">alpa terbanyak per kelas: ${esc(topClass[0])}</div></div>
<div class="card"><div class="n">${topStudent.dates.length}</div><div class="l">hari alpa ${esc(topStudent.name)} (${esc(topStudent.className)}), tertinggi</div></div>
</div>

<h2>Alpa per kelas</h2>
<p class="note">Jumlah catatan alpa. ${esc(zeroNote('alpa', a.zeroClasses))}</p>
<div class="card">${bars(a.byClass)}</div>

<h2>Alpa per tanggal</h2>
<p class="note">${esc(peakNote(a.byDate))}</p>
<div class="card"><div class="days">${days}</div></div>

<h2>Berdasarkan jenis kelamin</h2>
<p class="note">${esc(genderNote(a.gender))}</p>
${genderBar(a.gender, '#c8372d')}

<h2>Rincian per siswa</h2>
<p class="note">Urut dari yang paling sering alpa. ${esc(chipNote(d))}</p>
<div class="card">${multi.length ? studs(multi, d.multiMonth) : '<div class="empty">Tidak ada siswa dengan alpa berulang.</div>'}</div>
${once.length ? `<h2>Siswa dengan ${Math.max(2, o.minAlpa) - 1 === 1 ? '1 kali' : `kurang dari ${Math.max(2, o.minAlpa)} kali`} alpa</h2>
<div class="card"><table class="table">${onceRows}</table></div>` : ''}
<p class="foot">${esc(streakTxt)}${streakTxt ? ' ' : ''}Hitungan per catatan absensi (satu siswa satu hari satu catatan).</p>`;
  return page(`Infografis ${title} – ${o.schoolName}`, THEME_ALPA, body);
}
