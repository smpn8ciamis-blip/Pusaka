import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import { formatMonths, formatRupiah, MONTH_NAMES } from '@/lib/rkaParser';
import { formatTanggalPanjang, PAPER_FORMAT, type PaperSize } from '@/lib/journalReport';

export interface RkaItemLite {
  id?: string;
  line_no: number | null;
  activity_name: string;
  description: string | null;
  volume: number | string;
  unit: string | null;
  unit_price: number | string;
  amount: number | string;
  months: number[] | null;
}

/** Indeks 0..11 = Januari..Desember, 12 = tanpa bulan. */
export const NO_MONTH = 12;
export const monthTitle = (idx: number) => (idx === NO_MONTH ? 'Tanpa Bulan' : MONTH_NAMES[idx]);

export interface MonthEntry {
  item: RkaItemLite;
  /** Bagian anggaran item yang jatuh pada bulan ini (dibagi rata bila kegiatan berlangsung beberapa bulan). */
  share: number;
  /** Jumlah bulan pelaksanaan item. */
  spread: number;
}

export function buildMonthEntries(items: RkaItemLite[]): MonthEntry[][] {
  const res: MonthEntry[][] = Array.from({ length: 13 }, () => []);
  for (const item of items) {
    const amount = Number(item.amount) || 0;
    const months = (item.months ?? []).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
    if (months.length === 0) { res[NO_MONTH].push({ item, share: amount, spread: 0 }); continue; }
    for (const m of months) res[m - 1].push({ item, share: amount / months.length, spread: months.length });
  }
  return res;
}

export interface MonthSummaryRow { idx: number; label: string; count: number; total: number; pct: number; cumulative: number }

export function summarizeMonths(entries: MonthEntry[][]): MonthSummaryRow[] {
  const grand = entries.reduce((a, list) => a + list.reduce((s, e) => s + e.share, 0), 0);
  let cum = 0;
  return entries
    .map((list, idx) => {
      const total = list.reduce((s, e) => s + e.share, 0);
      return { idx, label: monthTitle(idx), count: list.length, total, pct: grand > 0 ? (total / grand) * 100 : 0, cumulative: 0 };
    })
    .filter((r) => r.idx < 12 || r.count > 0)
    .map((r) => { cum += r.total; return { ...r, cumulative: cum }; });
}

const itemText = (i: RkaItemLite) => [i.activity_name, i.description].filter(Boolean).join(' — ');
const qtyText = (i: RkaItemLite) => `${Number(i.volume) || 0}${i.unit ? ' ' + i.unit : ''}`;
const idDate = () => new Date().toISOString().slice(0, 10);
const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

/* ================= EXCEL ================= */
export function exportRkaXlsx(opts: { items: RkaItemLite[]; standardName: string; fiscalYear?: string | null }) {
  const { items, standardName, fiscalYear } = opts;
  const entries = buildMonthEntries(items);
  const summary = summarizeMonths(entries);
  const wb = XLSX.utils.book_new();
  const title = `RKA ${standardName}${fiscalYear ? ' TA ' + fiscalYear : ''}`;

  // 1. Ringkasan bulanan
  const s1: unknown[][] = [[title], [], ['Bulan', 'Jumlah Kegiatan', 'Anggaran', '% dari Total', 'Kumulatif']];
  summary.forEach((r) => s1.push([r.label, r.count, Math.round(r.total), Number(r.pct.toFixed(2)), Math.round(r.cumulative)]));
  const firstRow = 4;
  const lastRow = 3 + summary.length;
  const sumCnt = summary.reduce((x, r) => x + r.count, 0);
  const sumAmt = Math.round(summary.reduce((x, r) => x + r.total, 0));
  s1.push(['TOTAL', { t: 'n', v: sumCnt, f: `SUM(B${firstRow}:B${lastRow})` }, { t: 'n', v: sumAmt, f: `SUM(C${firstRow}:C${lastRow})` }, '', '']);
  const ws1 = XLSX.utils.aoa_to_sheet(s1);
  ws1['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan Bulanan');

  // 2. Matriks kegiatan × bulan
  const acts = new Map<string, number[]>();
  entries.forEach((list, idx) => list.forEach((e) => {
    const row = acts.get(e.item.activity_name) ?? new Array(13).fill(0);
    row[idx] += e.share;
    acts.set(e.item.activity_name, row);
  }));
  const hasNoMonth = entries[NO_MONTH].length > 0;
  const head = ['Kegiatan', ...MONTH_NAMES, ...(hasNoMonth ? ['Tanpa Bulan'] : []), 'Total'];
  const s2: unknown[][] = [head];
  Array.from(acts).forEach(([name, row], i) => {
    const r = i + 2;
    const vals = row.slice(0, hasNoMonth ? 13 : 12).map((v) => Math.round(v));
    s2.push([name, ...vals, { t: 'n', v: vals.reduce((a, b) => a + b, 0), f: `SUM(B${r}:${XLSX.utils.encode_col(vals.length)}${r})` }]);
  });
  const lastC = XLSX.utils.encode_col(head.length - 1);
  const totalRow: unknown[] = ['TOTAL'];
  for (let c = 1; c < head.length; c++) {
    const L = XLSX.utils.encode_col(c);
    const colSum = s2.slice(1).reduce((a, row) => { const c0 = row[c] as unknown; return a + (typeof c0 === 'object' && c0 ? Number((c0 as { v: number }).v) : Number(c0) || 0); }, 0);
    totalRow.push({ t: 'n', v: colSum, f: `SUM(${L}2:${L}${acts.size + 1})` });
  }
  s2.push(totalRow);
  const ws2 = XLSX.utils.aoa_to_sheet(s2);
  ws2['!cols'] = [{ wch: 36 }, ...new Array(head.length - 1).fill({ wch: 14 })];
  ws2['!ref'] = `A1:${lastC}${acts.size + 2}`;
  XLSX.utils.book_append_sheet(wb, ws2, 'Kegiatan x Bulan');

  // 3. Rincian per bulan (dikelompokkan)
  const s3: unknown[][] = [['Bulan', 'No', 'Kegiatan', 'Uraian', 'Volume', 'Satuan', 'Harga Satuan', 'Total Item', 'Anggaran Bulan Ini']];
  entries.forEach((list, idx) => {
    if (list.length === 0) return;
    list.forEach((e, i) => s3.push([monthTitle(idx), i + 1, e.item.activity_name, e.item.description ?? '', Number(e.item.volume) || 0, e.item.unit ?? '', Number(e.item.unit_price) || 0, Number(e.item.amount) || 0, Math.round(e.share)]));
    s3.push([`Subtotal ${monthTitle(idx)}`, '', '', '', '', '', '', '', Math.round(list.reduce((a, e) => a + e.share, 0))]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(s3);
  ws3['!cols'] = [{ wch: 16 }, { wch: 5 }, { wch: 30 }, { wch: 40 }, { wch: 9 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Rincian per Bulan');

  // 4. Rincian RKA (datar)
  const s4: unknown[][] = [['No', 'Nama Kegiatan', 'Uraian', 'Volume', 'Satuan', 'Harga Satuan', 'Jumlah', 'Bulan']];
  items.forEach((i, n) => s4.push([i.line_no ?? n + 1, i.activity_name, i.description ?? '', Number(i.volume) || 0, i.unit ?? '', Number(i.unit_price) || 0, Number(i.amount) || 0, formatMonths(i.months ?? [])]));
  const ws4 = XLSX.utils.aoa_to_sheet(s4);
  ws4['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 40 }, { wch: 9 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'Rincian RKA');

  XLSX.writeFile(wb, `rka-${safe(standardName)}${fiscalYear ? '-' + fiscalYear : ''}-${idDate()}.xlsx`);
}

export function exportRkaCsv(opts: { rows: Array<{ bulan: string; item: RkaItemLite; share: number }>; fileName: string }) {
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [['Bulan', 'Kegiatan', 'Uraian', 'Volume', 'Satuan', 'Harga Satuan', 'Total Item', 'Anggaran Bulan Ini'].join(',')];
  opts.rows.forEach((r) => lines.push([r.bulan, r.item.activity_name, r.item.description ?? '', r.item.volume, r.item.unit ?? '', r.item.unit_price, r.item.amount, Math.round(r.share)].map(esc).join(',')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = opts.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================= PDF ================= */
export type RkaPdfMode = 'bulan' | 'semua-bulan' | 'rincian';

export interface BuildRkaPdfOptions {
  mode: RkaPdfMode;
  items: RkaItemLite[];
  /** Bulan terpilih (0..12) untuk mode 'bulan' */
  monthIdx?: number;
  standardName: string;
  fiscalYear?: string | null;
  paper?: PaperSize;
  settings?: (LetterheadSettings & Record<string, any>) | null;
  /** Keterangan filter/pencarian yang sedang aktif */
  filterLines?: string[];
  penjabName?: string | null;
}

const rp = (n: number) => formatRupiah(Math.round(n));

export async function buildRkaPdf(opts: BuildRkaPdfOptions): Promise<jsPDF> {
  const { mode, items, standardName, fiscalYear, settings } = opts;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: PAPER_FORMAT[opts.paper || 'a4'] });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  let y = await addLetterheadToPDF(doc, settings as any);

  const entries = buildMonthEntries(items);
  const summary = summarizeMonths(entries);
  const grand = items.reduce((a, i) => a + (Number(i.amount) || 0), 0);

  const heading =
    mode === 'bulan' ? `RINCIAN RKA BULAN ${monthTitle(opts.monthIdx ?? 0).toUpperCase()}`
    : mode === 'semua-bulan' ? 'RINCIAN RKA PER BULAN'
    : 'RINCIAN RENCANA KEGIATAN DAN ANGGARAN';
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0, 0, 0);
  doc.text(heading, W / 2, y, { align: 'center' }); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
  doc.text(`${standardName}${fiscalYear ? ' · Tahun Anggaran ' + fiscalYear : ''}`, W / 2, y, { align: 'center' }); y += 6;
  doc.setFontSize(8.5);
  [...(opts.filterLines ?? []), `Dicetak: ${formatTanggalPanjang(new Date())}`].forEach((l) => { doc.text(l, M, y); y += 4; });
  y += 1;

  const base = {
    theme: 'grid' as const,
    margin: { left: M, right: M, bottom: 18 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, lineColor: [209, 213, 219] as [number, number, number], lineWidth: 0.1, textColor: [17, 24, 39] as [number, number, number], valign: 'middle' as const, overflow: 'linebreak' as const },
    headStyles: { fillColor: [31, 41, 55] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const, halign: 'center' as const },
    alternateRowStyles: { fillColor: [249, 250, 251] as [number, number, number] },
    showHead: 'everyPage' as const,
    rowPageBreak: 'avoid' as const,
  };
  const detailCols = {
    0: { halign: 'center' as const, cellWidth: 10 },
    3: { halign: 'right' as const, cellWidth: 24 },
    4: { halign: 'right' as const, cellWidth: 26 },
    5: { halign: 'right' as const, cellWidth: 28 },
    6: { halign: 'right' as const, cellWidth: 30 },
  };
  const lastY = () => (doc as any).lastAutoTable.finalY as number;

  const monthTable = (idx: number) => {
    const list = entries[idx];
    const total = list.reduce((a, e) => a + e.share, 0);
    autoTable(doc, {
      ...base,
      startY: y,
      head: [['No', 'Kegiatan', 'Uraian', 'Volume', 'Harga Satuan', 'Total Item', 'Anggaran Bulan Ini']],
      body: list.map((e, i) => [i + 1, e.item.activity_name, e.item.description || '-', qtyText(e.item), rp(Number(e.item.unit_price) || 0), rp(Number(e.item.amount) || 0), rp(e.share) + (e.spread > 1 ? `\n(1/${e.spread})` : '')]),
      foot: [[{ content: `Total ${monthTitle(idx)} (${list.length} kegiatan)`, colSpan: 6, styles: { halign: 'right' } }, { content: rp(total), styles: { halign: 'right' } }]],
      footStyles: { fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' },
      columnStyles: { ...detailCols, 1: { cellWidth: 52 } },
    });
    y = lastY() + 6;
  };

  if (mode === 'bulan') {
    if (entries[opts.monthIdx ?? 0].length === 0) {
      doc.setFont('helvetica', 'italic'); doc.text('Tidak ada kegiatan pada bulan ini.', W / 2, y + 6, { align: 'center' }); y += 12;
    } else monthTable(opts.monthIdx ?? 0);
  } else if (mode === 'semua-bulan') {
    autoTable(doc, {
      ...base, startY: y,
      head: [['Bulan', 'Jumlah Kegiatan', 'Anggaran', '% dari Total', 'Kumulatif']],
      body: summary.map((r) => [r.label, r.count, rp(r.total), `${r.pct.toFixed(1)}%`, rp(r.cumulative)]),
      foot: [[{ content: 'TOTAL', styles: { halign: 'right' } }, String(items.length), rp(grand), '100%', '']],
      footStyles: { fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right' } },
    });
    y = lastY() + 8;
    summary.forEach((r) => {
      if (entries[r.idx].length === 0) return;
      if (y > H - 50) { doc.addPage(); y = 16; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
      doc.text(`${r.label} — ${rp(r.total)}`, M, y); y += 2;
      monthTable(r.idx);
    });
  } else {
    autoTable(doc, {
      ...base, startY: y,
      head: [['No', 'Kegiatan', 'Uraian', 'Volume', 'Harga Satuan', 'Jumlah', 'Bulan']],
      body: items.map((i, n) => [i.line_no ?? n + 1, i.activity_name, i.description || '-', qtyText(i), rp(Number(i.unit_price) || 0), rp(Number(i.amount) || 0), formatMonths(i.months ?? [])]),
      foot: [[{ content: `Total (${items.length} rincian)`, colSpan: 5, styles: { halign: 'right' } }, { content: rp(grand), styles: { halign: 'right' } }, '']],
      footStyles: { fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' },
      columnStyles: { ...detailCols, 1: { cellWidth: 52 }, 5: { halign: 'right', cellWidth: 30 }, 6: { halign: 'center', cellWidth: 26 } },
    });
    y = lastY() + 6;
  }

  // Tanda tangan: Kepala Sekolah (kiri) · Penanggung Jawab (kanan)
  const sigH = 46;
  if (y + sigH > H - 16) { doc.addPage(); y = 20; }
  const colW = 64;
  const lx = M + colW / 2;
  const rx = W - M - colW / 2;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
  doc.text(formatTanggalPanjang(new Date()), rx, y, { align: 'center' });
  doc.text('Mengetahui,', lx, y + 5, { align: 'center' });
  doc.text(settings?.headmaster_position || 'Kepala Sekolah', lx, y + 10, { align: 'center' });
  doc.text(`Penanggung Jawab ${standardName}`.slice(0, 48), rx, y + 10, { align: 'center' });
  const ly = y + 34;
  doc.setLineWidth(0.3);
  doc.line(lx - 27, ly, lx + 27, ly); doc.line(rx - 27, ly, rx + 27, ly);
  doc.setFont('helvetica', 'bold');
  doc.text(settings?.headmaster_name || 'Nama Kepala Sekolah', lx, ly + 5, { align: 'center' });
  doc.text(opts.penjabName || '..............................', rx, ly + 5, { align: 'center' });
  if (settings?.headmaster_nip) { doc.setFont('helvetica', 'normal'); doc.text(`NIP. ${settings.headmaster_nip}`, lx, ly + 10, { align: 'center' }); }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(107, 114, 128);
    doc.text(`RKA ${standardName}`, M, H - 8);
    doc.text(`Halaman ${p} dari ${pages}`, W - M, H - 8, { align: 'right' });
  }
  return doc;
}

/* ================= REKAP SEMUA PENJAB (admin / bendahara) ================= */
export interface PenjabBudgetRow {
  code: string;
  name: string;
  penjab: string;
  version: string;
  count: number;
  total: number;
  /** anggaran per bulan, indeks 0..11, 12 = tanpa bulan */
  months: number[];
}

/** Penerimaan sekolah untuk dibandingkan dengan total anggaran belanja penjab. */
export interface RevenueSummary {
  items: Array<{ source: string; description: string | null; amount: number; month: number | null }>;
  total: number;
  /** penerimaan per bulan, indeks 0..11, 12 = tanpa bulan */
  months: number[];
}

export function exportAllRkaXlsx(opts: { rows: PenjabBudgetRow[]; fiscalYear?: string | null; revenue?: RevenueSummary | null }) {
  const { rows, fiscalYear, revenue } = opts;
  const grand = rows.reduce((a, r) => a + r.total, 0);
  const wb = XLSX.utils.book_new();
  const s1: unknown[][] = [[`Rekap Anggaran Penanggung Jawab Standar${fiscalYear ? ' TA ' + fiscalYear : ''}`], [], ['No', 'Standar', 'Penjab', 'Versi RKA', 'Jumlah Rincian', 'Total Anggaran', '% dari Total']];
  rows.forEach((r, i) => s1.push([i + 1, r.name, r.penjab || '-', r.version || '-', r.count, Math.round(r.total), grand > 0 ? Number(((r.total / grand) * 100).toFixed(2)) : 0]));
  const f = 4; const l = 3 + rows.length;
  s1.push(['', 'TOTAL', '', '', { t: 'n', v: rows.reduce((a, r) => a + r.count, 0), f: `SUM(E${f}:E${l})` }, { t: 'n', v: Math.round(grand), f: `SUM(F${f}:F${l})` }, '']);
  const ws1 = XLSX.utils.aoa_to_sheet(s1);
  ws1['!cols'] = [{ wch: 5 }, { wch: 36 }, { wch: 34 }, { wch: 26 }, { wch: 14 }, { wch: 18 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Rekap per Standar');

  const hasNo = rows.some((r) => r.months[12] > 0);
  const head = ['Standar', ...MONTH_NAMES, ...(hasNo ? ['Tanpa Bulan'] : []), 'Total'];
  const s2: unknown[][] = [head];
  rows.forEach((r, i) => {
    const vals = r.months.slice(0, hasNo ? 13 : 12).map((v) => Math.round(v));
    s2.push([r.name, ...vals, { t: 'n', v: vals.reduce((a, b) => a + b, 0), f: `SUM(B${i + 2}:${XLSX.utils.encode_col(vals.length)}${i + 2})` }]);
  });
  const tot: unknown[] = ['TOTAL'];
  for (let c = 1; c < head.length; c++) {
    const L = XLSX.utils.encode_col(c);
    const v = s2.slice(1).reduce((a, row) => { const x = row[c] as unknown; return a + (typeof x === 'object' && x ? Number((x as { v: number }).v) : Number(x) || 0); }, 0);
    tot.push({ t: 'n', v, f: `SUM(${L}2:${L}${rows.length + 1})` });
  }
  s2.push(tot);
  const ws2 = XLSX.utils.aoa_to_sheet(s2);
  ws2['!cols'] = [{ wch: 36 }, ...new Array(head.length - 1).fill({ wch: 14 })];
  XLSX.utils.book_append_sheet(wb, ws2, 'Standar x Bulan');

  if (revenue) {
    const s3: unknown[][] = [[`Penerimaan Sekolah${fiscalYear ? ' TA ' + fiscalYear : ''}`], [], ['No', 'Sumber', 'Keterangan', 'Bulan', 'Jumlah']];
    revenue.items.forEach((r, i) => s3.push([i + 1, r.source, r.description || '-', r.month ? MONTH_NAMES[r.month - 1] : '-', Math.round(r.amount)]));
    const a = 4; const b = 3 + revenue.items.length;
    s3.push(['', 'TOTAL PENERIMAAN', '', '', { t: 'n', v: Math.round(revenue.total), f: revenue.items.length ? `SUM(E${a}:E${b})` : undefined }]);
    s3.push(['', 'TOTAL ANGGARAN BELANJA PENJAB', '', '', Math.round(grand)]);
    const r1 = 4 + revenue.items.length;
    s3.push(['', 'SELISIH (PENERIMAAN - BELANJA)', '', '', { t: 'n', v: Math.round(revenue.total - grand), f: `E${r1}-E${r1 + 1}` }]);
    const ws3 = XLSX.utils.aoa_to_sheet(s3);
    ws3['!cols'] = [{ wch: 5 }, { wch: 36 }, { wch: 30 }, { wch: 14 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Penerimaan & Selisih');

    const s4: unknown[][] = [['Bulan', 'Penerimaan', 'Belanja', 'Selisih', 'Saldo Kumulatif']];
    const bel = new Array(13).fill(0);
    rows.forEach((r) => r.months.forEach((v, i) => { bel[i] += v; }));
    let cum = 0;
    for (let i = 0; i < 13; i++) {
      if (i === 12 && !revenue.months[12] && !bel[12]) continue;
      const net = revenue.months[i] - bel[i]; cum += net;
      s4.push([i === 12 ? 'Tanpa Bulan' : MONTH_NAMES[i], Math.round(revenue.months[i]), Math.round(bel[i]), Math.round(net), Math.round(cum)]);
    }
    const ws4 = XLSX.utils.aoa_to_sheet(s4);
    ws4['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Penerimaan vs Belanja');
  }
  XLSX.writeFile(wb, `rekap-anggaran-penjab${fiscalYear ? '-' + fiscalYear : ''}-${idDate()}.xlsx`);
}

export async function buildAllRkaPdf(opts: {
  rows: PenjabBudgetRow[]; fiscalYear?: string | null; paper?: PaperSize; revenue?: RevenueSummary | null;
  settings?: (LetterheadSettings & Record<string, any>) | null; signerName?: string | null; signerRole?: string;
}): Promise<jsPDF> {
  const { rows, fiscalYear, settings } = opts;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: PAPER_FORMAT[opts.paper || 'a4'] });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  let y = await addLetterheadToPDF(doc, settings as any);
  const grand = rows.reduce((a, r) => a + r.total, 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0, 0, 0);
  doc.text('REKAPITULASI ANGGARAN PENANGGUNG JAWAB STANDAR', W / 2, y, { align: 'center' }); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
  doc.text(`${fiscalYear ? 'Tahun Anggaran ' + fiscalYear + ' · ' : ''}Dicetak ${formatTanggalPanjang(new Date())}`, W / 2, y, { align: 'center' }); y += 6;
  const st = { font: 'helvetica', fontSize: 8, cellPadding: 1.8, lineColor: [209, 213, 219] as [number, number, number], lineWidth: 0.1, textColor: [17, 24, 39] as [number, number, number], valign: 'middle' as const };
  const hs = { fillColor: [31, 41, 55] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const, halign: 'center' as const };
  autoTable(doc, {
    startY: y, theme: 'grid', margin: { left: M, right: M, bottom: 18 }, styles: st, headStyles: hs,
    head: [['No', 'Standar', 'Penjab', 'Rincian', 'Total Anggaran', '%']],
    body: rows.map((r, i) => [i + 1, r.name, r.penjab || '-', r.count, rp(r.total), grand > 0 ? `${((r.total / grand) * 100).toFixed(1)}%` : '0%']),
    foot: [[{ content: 'TOTAL', colSpan: 3, styles: { halign: 'right' } }, String(rows.reduce((a, r) => a + r.count, 0)), rp(grand), '100%']],
    footStyles: { fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 3: { halign: 'center', cellWidth: 18 }, 4: { halign: 'right', cellWidth: 36 }, 5: { halign: 'center', cellWidth: 16 } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;
  if (y > H - 70) { doc.addPage(); y = 16; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
  doc.text('Sebaran Anggaran per Bulan (dalam ribuan rupiah)', M, y); y += 2;
  const k = (n: number) => (n ? Math.round(n / 1000).toLocaleString('id-ID') : '-');
  const colTot = new Array(13).fill(0);
  rows.forEach((r) => r.months.forEach((v, i) => { colTot[i] += v; }));
  autoTable(doc, {
    startY: y, theme: 'grid', margin: { left: M, right: M, bottom: 18 }, styles: { ...st, fontSize: 7, cellPadding: 1.4 }, headStyles: hs,
    head: [['Standar', ...MONTH_SHORT_PDF, 'Total']],
    body: rows.map((r) => [r.name, ...r.months.slice(0, 12).map(k), k(r.total)]),
    foot: [['TOTAL', ...colTot.slice(0, 12).map(k), k(grand)]],
    footStyles: { fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 44 }, ...Object.fromEntries(Array.from({ length: 13 }, (_, i) => [i + 1, { halign: 'right' as const }])) },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (opts.revenue) {
    const rev = opts.revenue;
    if (y > H - 80) { doc.addPage(); y = 16; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
    doc.text('Penerimaan Sekolah dan Selisih terhadap Anggaran Belanja Penjab', M, y); y += 2;
    const body: any[][] = rev.items.map((r, i) => [i + 1, r.source, r.description || '-', r.month ? MONTH_NAMES[r.month - 1] : '-', rp(r.amount)]);
    if (body.length === 0) body.push([{ content: 'Belum ada penerimaan tercatat', colSpan: 5, styles: { halign: 'center' } }]);
    autoTable(doc, {
      startY: y, theme: 'grid', margin: { left: M, right: M, bottom: 18 }, styles: st, headStyles: hs,
      head: [['No', 'Sumber Penerimaan', 'Keterangan', 'Bulan', 'Jumlah']],
      body,
      foot: [
        [{ content: 'TOTAL PENERIMAAN', colSpan: 4, styles: { halign: 'right' } }, rp(rev.total)],
        [{ content: 'TOTAL ANGGARAN BELANJA PENJAB', colSpan: 4, styles: { halign: 'right' } }, rp(grand)],
        [{ content: rev.total - grand >= 0 ? 'SELISIH (SURPLUS)' : 'SELISIH (DEFISIT)', colSpan: 4, styles: { halign: 'right' } }, rp(rev.total - grand)],
      ],
      footStyles: { fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 3: { cellWidth: 26 }, 4: { halign: 'right', cellWidth: 40 } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }
  const sigH = 46;
  if (y + sigH > H - 16) { doc.addPage(); y = 20; }
  const rx = W - M - 32;
  const lx = M + 32;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(formatTanggalPanjang(new Date()), rx, y, { align: 'center' });
  doc.text('Mengetahui,', lx, y + 5, { align: 'center' });
  doc.text(settings?.headmaster_position || 'Kepala Sekolah', lx, y + 10, { align: 'center' });
  doc.text(opts.signerRole || 'Bendahara', rx, y + 10, { align: 'center' });
  doc.setLineWidth(0.3); doc.line(lx - 27, y + 34, lx + 27, y + 34); doc.line(rx - 27, y + 34, rx + 27, y + 34);
  doc.setFont('helvetica', 'bold');
  doc.text(settings?.headmaster_name || 'Nama Kepala Sekolah', lx, y + 39, { align: 'center' });
  doc.text(opts.signerName || '..............................', rx, y + 39, { align: 'center' });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(107, 114, 128);
    doc.text('Rekap Anggaran Penjab', M, H - 8); doc.text(`Halaman ${p} dari ${pages}`, W - M, H - 8, { align: 'right' });
  }
  return doc;
}
const MONTH_SHORT_PDF = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
