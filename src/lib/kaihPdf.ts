import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import { paperFormat, type PdfPaper } from '@/lib/pdfPaper';
import { PRINT_CREDIT } from '@/lib/studentListPdf';
import {
  daysBetween, fmtDateLong, fmtDateShort, fmtPct, HABITS, habitDetail, hexToRgb, isDone, pct, rowAverage, rowPercent,
  statsFromEntries, statsFromSummary, todayWib, type HabitStat, type KaihEntry, type KaihStudentSummary,
} from '@/lib/kaih';

type SchoolSettings = LetterheadSettings | null | undefined;
type RGB = [number, number, number];

const clean = (v?: string | null) => (v ?? '').replace(/\s+/g, ' ').trim();
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const TITLE = 'JURNAL GERAKAN 7 KEBIASAAN ANAK INDONESIA HEBAT';

export const kaihRecapFileName = (scope: string, start: string, end: string) => `Rekap-7-Kebiasaan-${slug(scope) || 'Siswa'}-${start}-${end}.pdf`;
export const kaihStudentFileName = (name: string, start: string, end: string) => `Jurnal-7-Kebiasaan-${slug(name) || 'Siswa'}-${start}-${end}.pdf`;

/** Warna sel persentase: ≥80 hijau, 50–79 kuning, <50 merah muda. */
const pctFill = (v: number): RGB => (v >= 80 ? [187, 247, 208] : v >= 50 ? [254, 240, 138] : [254, 202, 202]);

interface Frame {
  doc: jsPDF;
  pw: number;
  ph: number;
  ml: number;
  mr: number;
  bottomLimit: number;
  setFont: (style?: 'normal' | 'bold' | 'italic', size?: number) => void;
}

function createFrame(paper: PdfPaper): Frame {
  const doc = new jsPDF({ unit: 'mm', format: paperFormat(paper), orientation: 'landscape' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const setFont = (style: 'normal' | 'bold' | 'italic' = 'normal', size = 10) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
  };
  return { doc, pw, ph, ml: 10, mr: 10, bottomLimit: ph - 13, setFont };
}

/** Grafik batang persentase 7 kebiasaan; mengembalikan koordinat y di bawah grafik. */
function drawBarChart(f: Frame, x: number, y: number, w: number, stats: HabitStat[], total: number): number {
  const { doc, setFont } = f;
  const rowH = 4.7;
  const labelW = 50;
  const pctW = 16;
  setFont('bold', 9);
  doc.text('Grafik Persentase Tiap Kebiasaan', x, y);
  let cy = y + 3.5;
  if (total === 0) {
    setFont('italic', 8);
    doc.text('Belum ada jurnal pada periode ini.', x, cy + 3);
    return cy + 7;
  }
  const barX = x + labelW;
  const barW = w - labelW - pctW;
  stats.forEach((s, i) => {
    const ry = cy + i * rowH;
    setFont('normal', 8);
    doc.text(`${i + 1}. ${s.label}`, x, ry + 3.3);
    doc.setFillColor(229, 231, 235);
    doc.rect(barX, ry + 0.6, barW, 3.2, 'F');
    if (s.percent > 0) {
      doc.setFillColor(...hexToRgb(s.color));
      doc.rect(barX, ry + 0.6, Math.max(0.6, (barW * Math.min(100, s.percent)) / 100), 3.2, 'F');
    }
    setFont('bold', 8);
    doc.text(fmtPct(s.percent), barX + barW + 2, ry + 3.3);
  });
  return cy + stats.length * rowH + 1;
}

interface SigBlock {
  title: string;
  name?: string | null;
  nip?: string | null;
  /** Hanya blok kanan: baris titimangsa di atas jabatan */
  dateLine?: string;
}

const SIG_LINE_H = 4.6;
const SIG_GAP = 16;
/** Tinggi blok tanda tangan (selalu sama untuk kiri dan kanan agar sejajar). */
const sigBlockHeight = () => SIG_LINE_H * 4 + SIG_GAP + 1;

function drawSignatures(f: Frame, top: number, left: SigBlock | null, right: SigBlock, sigW = 70): void {
  const { doc, pw, mr, ml, setFont } = f;
  const dots = (w: number) => '.'.repeat(Math.max(3, Math.floor(w / Math.max(0.1, doc.getTextWidth('.')))));
  const draw = (b: SigBlock, x: number) => {
    setFont('normal', 10);
    let y = top + 3;
    if (b.dateLine) doc.text(b.dateLine, x, y);
    y += SIG_LINE_H;
    doc.text(b.title, x, y);
    y += SIG_GAP + SIG_LINE_H;
    const name = clean(b.name);
    if (name) {
      setFont('bold', 10);
      doc.text(name, x, y);
      setFont('normal', 10);
    } else {
      doc.text(dots(sigW - 6), x, y);
    }
    if (b.nip !== undefined) {
      y += SIG_LINE_H;
      doc.text(`NIP. ${clean(b.nip) || dots(sigW - 12)}`, x, y);
    }
  };
  if (left) draw(left, ml + 4);
  draw(right, pw - mr - sigW);
}

/** Pindah halaman bila blok setinggi `needed` tidak muat di sisa halaman; mengembalikan y baru. */
function ensureSpace(f: Frame, y: number, needed: number, continueText: string): number {
  if (y + needed <= f.bottomLimit) return y;
  f.doc.addPage();
  f.setFont('italic', 8);
  f.doc.setTextColor(90, 90, 90);
  f.doc.text(continueText, f.ml, 10);
  f.doc.setTextColor(0, 0, 0);
  return 16;
}

function finishPages(f: Frame, printedAt: Date) {
  const { doc, ml, mr, pw, ph, setFont } = f;
  const total = doc.getNumberOfPages();
  const printedText = `${PRINT_CREDIT}, ${format(printedAt, 'd MMMM yyyy', { locale: localeId })}`;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    setFont('italic', 8);
    doc.setTextColor(90, 90, 90);
    doc.text(printedText, ml, ph - 8);
    if (total > 1) doc.text(`Halaman ${p} dari ${total}`, pw - mr, ph - 8, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
}

const dateLineOf = (place: string, signDate: string): string => {
  const p = clean(place);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(signDate) ? fmtDateLong(signDate) : '';
  return `${p ? `${p}, ` : ''}${d || '..............................'}`;
};

// =====================================================================================
// 1. Rekap per siswa (wali kelas / kesiswaan)
// =====================================================================================
export interface KaihRecapPdfOptions {
  /** "Kelas 7A", "Semua Kelas", dst. */
  scopeLabel: string;
  startDate: string;
  endDate: string;
  /** Siswa dalam urutan yang akan dicetak */
  rows: KaihStudentSummary[];
  /** Tampilkan kolom kelas (bila memuat lebih dari satu kelas) */
  showClass: boolean;
  signerTitle: string;
  signerName?: string | null;
  signerNip?: string | null;
  place: string;
  signDate: string;
  paper?: PdfPaper;
  printedAt?: Date;
  note?: string;
}

export async function buildKaihRecapPdf(opts: KaihRecapPdfOptions, settings: SchoolSettings): Promise<jsPDF> {
  const f = createFrame(opts.paper ?? 'a4');
  const { doc, pw, ml, mr, setFont } = f;
  const avail = pw - ml - mr;
  const printedAt = opts.printedAt ?? new Date();

  const startY = await addLetterheadToPDF(doc, settings as LetterheadSettings);
  setFont('bold', 12);
  doc.text(`REKAP ${TITLE}`, pw / 2, startY, { align: 'center' });
  setFont('normal', 10);
  doc.text(`Cakupan: ${clean(opts.scopeLabel) || '-'}`, 14, startY + 8);
  doc.text(`Periode: ${fmtDateLong(opts.startDate)} s/d ${fmtDateLong(opts.endDate)}`, 14, startY + 14);

  const effectiveEnd = opts.endDate > todayWib() ? todayWib() : opts.endDate;
  const periodDays = daysBetween(opts.startDate, effectiveEnd);
  const agg = statsFromSummary(opts.rows);

  let y = drawBarChart(f, 14, startY + 21, Math.min(150, avail - 8), agg.stats, agg.total) + 3;

  // ---------- tabel ----------
  const wNo = 8, wNisn = 21, wKelas = 14, wIsi = 15, wPctIsi = 12, wHab = 15.5, wAvg = 14;
  const wNameMax = 64;
  const fixed = wNo + wNisn + (opts.showClass ? wKelas : 0) + wIsi + wPctIsi + wHab * 7 + wAvg;
  const wName = Math.max(38, Math.min(wNameMax, avail - fixed));

  const head = ['No', 'NISN', 'Nama Siswa', ...(opts.showClass ? ['Kelas'] : []), 'Hari Terisi', '% Isi', ...HABITS.map((h) => `${h.no}. ${h.short}`), 'Rata-rata'];
  const body = opts.rows.map((r, i) => [
    String(i + 1),
    clean(r.nisn),
    clean(r.full_name),
    ...(opts.showClass ? [clean(r.class_name) || '-'] : []),
    `${r.entries}/${periodDays}`,
    periodDays > 0 ? fmtPct(pct(r.entries, periodDays)) : '-',
    ...HABITS.map((h) => (r.entries > 0 ? fmtPct(rowPercent(r, h.key)) : '-')),
    r.entries > 0 ? fmtPct(rowAverage(r)) : '-',
  ]);
  const totalEntries = opts.rows.reduce((a, r) => a + r.entries, 0);
  const foot = [[
    { content: `Rata-rata ${opts.rows.length} siswa`, colSpan: 3 + (opts.showClass ? 1 : 0), styles: { halign: 'right' as const } },
    `${totalEntries}/${opts.rows.length * periodDays}`,
    opts.rows.length * periodDays > 0 ? fmtPct(pct(totalEntries, opts.rows.length * periodDays)) : '-',
    ...agg.stats.map((s) => (agg.total > 0 ? fmtPct(s.percent) : '-')),
    agg.total > 0 ? fmtPct(agg.overall) : '-',
  ]];

  const firstHabitCol = 3 + (opts.showClass ? 1 : 0) + 2;
  const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' }> = { 0: { cellWidth: wNo }, 1: { cellWidth: wNisn }, 2: { cellWidth: wName, halign: 'left' } };
  let c = 3;
  if (opts.showClass) columnStyles[c++] = { cellWidth: wKelas };
  columnStyles[c++] = { cellWidth: wIsi };
  columnStyles[c++] = { cellWidth: wPctIsi };
  for (let i = 0; i < 7; i++) columnStyles[c++] = { cellWidth: wHab };
  columnStyles[c++] = { cellWidth: wAvg };

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    foot,
    showFoot: 'lastPage',
    theme: 'grid',
    headStyles: { fillColor: [139, 92, 246], fontSize: 7, halign: 'center', valign: 'middle' },
    footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    styles: { fontSize: 7, cellPadding: 1, halign: 'center', lineColor: [150, 150, 150], lineWidth: 0.1 },
    columnStyles,
    margin: { left: ml, right: mr, top: 14, bottom: 14 },
    rowPageBreak: 'avoid',
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const idx = data.column.index;
      const row = opts.rows[data.row.index];
      if (!row || idx < firstHabitCol - 1) return;
      if (idx === firstHabitCol - 1) return; // % Isi: tanpa warna
      if (row.entries === 0) { data.cell.styles.textColor = [120, 120, 120]; return; }
      const habit = idx >= firstHabitCol && idx < firstHabitCol + 7 ? HABITS[idx - firstHabitCol] : null;
      const value = habit ? rowPercent(row, habit.key) : idx === firstHabitCol + 7 ? rowAverage(row) : null;
      if (value !== null) data.cell.styles.fillColor = pctFill(value);
    },
  });

  // ---------- keterangan + titimangsa + tanda tangan ----------
  const legend = [
    `Persentase tiap kebiasaan = jumlah hari kebiasaan terlaksana ÷ jumlah jurnal yang diisi siswa. "% Isi" = jumlah jurnal ÷ jumlah hari pada periode (${periodDays} hari, sampai hari ini).`,
    `Kebiasaan: ${HABITS.map((h) => `${h.no} ${h.label}`).join(', ')}.`,
    'Warna sel: hijau ≥ 80%, kuning 50–79%, merah < 50%.',
  ];
  if (clean(opts.note)) legend.push(clean(opts.note));
  setFont('normal', 7.5);
  const legendLines = legend.flatMap((t) => doc.splitTextToSize(t, avail - 80) as string[]);
  const legendH = 5 + legendLines.length * 3.4;
  const blockH = Math.max(sigBlockHeight(), legendH);
  y = ensureSpace(f, ((doc as any).lastAutoTable?.finalY ?? y) + 6, blockH, `Lanjutan rekap jurnal 7 kebiasaan — ${clean(opts.scopeLabel)}`);

  setFont('bold', 8);
  doc.text('Keterangan:', 14, y + 3);
  setFont('normal', 7.5);
  legendLines.forEach((line, i) => doc.text(line, 14, y + 7 + i * 3.4));
  drawSignatures(f, y, null, { title: `${clean(opts.signerTitle) || 'Wali Kelas'},`, name: opts.signerName, nip: opts.signerNip ?? '', dateLine: dateLineOf(opts.place, opts.signDate) });

  finishPages(f, printedAt);
  return doc;
}

// =====================================================================================
// 2. Jurnal harian satu siswa
// =====================================================================================
export interface KaihStudentPdfOptions {
  studentName: string;
  nisn?: string | null;
  className?: string | null;
  startDate: string;
  endDate: string;
  /** Jurnal pada periode (urutan bebas; dicetak menurut tanggal naik) */
  entries: KaihEntry[];
  place: string;
  signDate: string;
  paper?: PdfPaper;
  printedAt?: Date;
}

export async function buildKaihStudentPdf(opts: KaihStudentPdfOptions, settings: SchoolSettings): Promise<jsPDF> {
  const f = createFrame(opts.paper ?? 'a4');
  const { doc, pw, ml, mr, setFont } = f;
  const avail = pw - ml - mr;
  const printedAt = opts.printedAt ?? new Date();
  const entries = opts.entries.filter((e) => e.entry_date >= opts.startDate && e.entry_date <= opts.endDate).sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1));
  const { stats, overall } = statsFromEntries(entries);

  const startY = await addLetterheadToPDF(doc, settings as LetterheadSettings);
  setFont('bold', 12);
  doc.text(TITLE, pw / 2, startY, { align: 'center' });
  setFont('normal', 10);
  doc.text(`Nama: ${clean(opts.studentName) || '-'}`, 14, startY + 8);
  doc.text(`NISN: ${clean(opts.nisn) || '-'}      Kelas: ${clean(opts.className) || '-'}`, 14, startY + 14);
  doc.text(`Periode: ${fmtDateLong(opts.startDate)} s/d ${fmtDateLong(opts.endDate)}`, 14, startY + 20);

  let y = drawBarChart(f, 14, startY + 27, Math.min(150, avail - 8), stats, entries.length) + 3;

  const wNo = 8, wDate = 27, wCount = 12;
  const wHab = Math.floor(((avail - wNo - wDate - wCount) / 7) * 100) / 100;
  const head = ['No', 'Tanggal', ...HABITS.map((h) => `${h.no}. ${h.label}`), 'Jumlah'];
  const cell = (e: KaihEntry, key: (typeof HABITS)[number]['key']) => {
    const done = isDone(e, key);
    const d = habitDetail(e, key);
    return `${done ? 'Ya' : 'Tidak'}${d ? `\n${d}` : ''}`;
  };
  const body = entries.map((e, i) => [String(i + 1), fmtDateShort(e.entry_date), ...HABITS.map((h) => cell(e, h.key)), `${e.habit_count}/7`]);
  const foot = [[
    { content: 'Persentase terlaksana', colSpan: 2, styles: { halign: 'right' as const } },
    ...stats.map((s) => (entries.length ? `${fmtPct(s.percent)}\n(${s.done}/${s.total})` : '-')),
    entries.length ? fmtPct(overall) : '-',
  ]];
  const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' }> = { 0: { cellWidth: wNo }, 1: { cellWidth: wDate, halign: 'left' } };
  for (let i = 0; i < 7; i++) columnStyles[2 + i] = { cellWidth: wHab, halign: 'left' };
  columnStyles[9] = { cellWidth: wCount };

  autoTable(doc, {
    startY: y,
    head: [head],
    body: body.length ? body : [[{ content: 'Belum ada jurnal pada periode ini.', colSpan: 10, styles: { halign: 'center', fontStyle: 'italic' } } as any]],
    foot: body.length ? foot : undefined,
    showFoot: 'lastPage',
    theme: 'grid',
    headStyles: { fillColor: [139, 92, 246], fontSize: 7, halign: 'center', valign: 'middle' },
    footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    styles: { fontSize: 7, cellPadding: 1.2, halign: 'center', lineColor: [150, 150, 150], lineWidth: 0.1, overflow: 'linebreak' },
    columnStyles,
    margin: { left: ml, right: mr, top: 14, bottom: 14 },
    rowPageBreak: 'avoid',
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index < 2 || data.column.index > 8 || body.length === 0) return;
      const raw = String(data.cell.raw ?? '');
      data.cell.styles.fillColor = raw.startsWith('Ya') ? [220, 252, 231] : [254, 226, 226];
    },
  });

  // ---------- titimangsa + tanda tangan (orang tua/wali kiri, siswa kanan) ----------
  const blockH = sigBlockHeight();
  y = ensureSpace(f, ((doc as any).lastAutoTable?.finalY ?? y) + 8, blockH, `Lanjutan jurnal 7 kebiasaan — ${clean(opts.studentName)}`);
  drawSignatures(
    f,
    y,
    { title: 'Mengetahui, Orang Tua/Wali', name: '' },
    { title: 'Siswa,', name: opts.studentName, dateLine: dateLineOf(opts.place, opts.signDate) },
  );

  finishPages(f, printedAt);
  return doc;
}
