import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import { paperFormat, type PdfPaper } from '@/lib/pdfPaper';
import { PRINT_CREDIT } from '@/lib/studentListPdf';
import { ellipsize } from '@/lib/examPdf';
import { cellKey, numberedTeachers, type Assignment, type InvSession, type InvTeacher } from '@/lib/examInvigilation';

export interface InvigilationPdfOptions {
  examName?: string | null;
  academicYear?: string | null;
  sessions: InvSession[];
  teachers: InvTeacher[];
  assignment: Assignment;
  /** Guru pengawas terpilih berurutan: urutannya menentukan nomor guru di matriks dan daftar nama. */
  pool: string[];
  rooms: number;
  perRoom: number;
  paper?: PdfPaper;
  place?: string;
  signDate?: string; // yyyy-MM-dd
  principalTitle?: string | null;
  principalName?: string | null;
  principalNip?: string | null;
  /** Baris "Keterangan" di kiri bawah (kosong = tidak dicetak) */
  notes?: string[];
  printedAt?: Date;
}

type SchoolSettings = LetterheadSettings | null | undefined;

export const DEFAULT_INVIGILATION_NOTES = [
  'Pengawas ruang wajib datang 30 menit sebelum jam pertama dimulai.',
  'Pengawas ruang wajib melaporkan diri kepada Wakil Kepala Sekolah Bidang Kurikulum apabila berhalangan hadir sehari sebelum mengawas.',
  'Pengawas ruang yang berhalangan hadir wajib mencari pengganti jika berhalangan hadir.',
];

const clean = (v?: string | null) => (v ?? '').replace(/\s+/g, ' ').trim();
const idDate = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'd MMMM yyyy', { locale: localeId });
};
const dotTime = (t: string) => t.replace(':', '.');
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const dayLabel = (s: InvSession) => {
  const date = clean(s.dateLabel).replace(/^0/, '') || s.date;
  return [clean(s.day), date].filter(Boolean).join(', ');
};

export const invigilationFileName = (paper: PdfPaper) => `jadwal-pengawas-ujian-${paper}.pdf`;

/**
 * Jadwal pengawas ujian format sekolah (kertas A4/F4 lanskap), lengkap dengan kop:
 *  - tabel utama: NO | HARI / TANGGAL | MATA PELAJARAN | WAKTU | RUANG 1..n, sel ruang berisi NOMOR guru;
 *    jeda antar sesi pada hari yang sama ditulis "Istirahat";
 *  - tabel NO | NAMA di kanan (nomor guru sesuai urutan guru pengawas terpilih);
 *  - keterangan di kiri bawah, titimangsa + tanda tangan kepala sekolah di kanan bawah.
 * Blok keterangan/tanda tangan tidak pernah terpotong: bila tidak muat, seluruhnya pindah ke halaman berikutnya.
 */
export async function buildInvigilationPdf(opts: InvigilationPdfOptions, settings: SchoolSettings): Promise<jsPDF> {
  const paper = opts.paper ?? 'f4';
  const doc = new jsPDF({ unit: 'mm', format: paperFormat(paper), orientation: 'landscape' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 10, mr = 10, topMargin = 14;
  const avail = pw - ml - mr;
  const bottomLimit = ph - 13;
  const printedAt = opts.printedAt ?? new Date();
  const R = Math.max(1, opts.rooms);

  const numbered = numberedTeachers(opts.teachers, opts.pool, opts.assignment);
  const numOf = new Map(numbered.map((t, i) => [t.id, i + 1]));

  const setFont = (style: 'normal' | 'bold' | 'italic' = 'normal', size = 10) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
  };

  // ---------- Kop & judul ----------
  let y = await addLetterheadToPDF(doc, settings as LetterheadSettings);
  const exam = clean(opts.examName).toUpperCase();
  setFont('bold', 12);
  doc.text(exam.includes('PENGAWAS') ? exam : `JADWAL PENGAWAS ${exam || 'UJIAN'}`, pw / 2, y, { align: 'center' });
  y += 5;
  if (clean(opts.academicYear)) {
    doc.text(`TAHUN PELAJARAN ${clean(opts.academicYear).replace(/\s*\/\s*/, ' / ')}`, pw / 2, y, { align: 'center' });
    y += 5;
  }
  const tableTop = y + 2;

  // ---------- Lebar kolom ----------
  const legendW = 58, gap = 5;
  const tableW = avail - legendW - gap;
  let wNo = 8, wDay = 30, wSub = 34, wTime = 21;
  let wRoom = (tableW - (wNo + wDay + wSub + wTime)) / R;
  if (wRoom < 5.2) { wDay = 25; wSub = 28; wTime = 18; wRoom = (tableW - (wNo + wDay + wSub + wTime)) / R; }
  wRoom = Math.max(3.2, Math.floor(wRoom * 100) / 100);
  const fs = wRoom >= 6.5 ? 7 : wRoom >= 5 ? 6.5 : 5.5;

  // ---------- Baris tabel: per hari, sesi + "Istirahat" ----------
  type Cell = string | { content: string; rowSpan?: number; colSpan?: number; styles?: Record<string, unknown> };
  const roomText = (s: InvSession, room: number) => {
    const parts: string[] = [];
    for (let slot = 1; slot <= opts.perRoom; slot++) {
      const n = numOf.get(opts.assignment[cellKey(s.key, room, slot)] ?? '');
      if (n) parts.push(String(n));
    }
    return parts.join('\n');
  };
  const byDate = new Map<string, InvSession[]>();
  [...opts.sessions].sort((a, b) => a.key.localeCompare(b.key)).forEach((s) => byDate.set(s.date, [...(byDate.get(s.date) || []), s]));

  const body: Cell[][] = [];
  let dayNo = 0;
  for (const list of byDate.values()) {
    dayNo++;
    const rows: Cell[][] = [];
    list.forEach((s, i) => {
      rows.push([
        { content: clean(s.subject), styles: { halign: 'left' } },
        `${dotTime(s.start)}${s.end ? ` - ${dotTime(s.end)}` : ''}`,
        ...Array.from({ length: R }, (_, r) => roomText(s, r + 1)),
      ]);
      const next = list[i + 1];
      if (next && s.end && mins(next.start) - mins(s.end) >= 15) {
        rows.push([
          { content: 'Istirahat', styles: { halign: 'left', fontStyle: 'italic', fillColor: [230, 230, 230] } },
          { content: `${dotTime(s.end)} - ${dotTime(next.start)}`, styles: { fillColor: [230, 230, 230] } },
          { content: '', colSpan: R, styles: { fillColor: [230, 230, 230] } },
        ]);
      }
    });
    rows[0] = [
      { content: String(dayNo), rowSpan: rows.length, styles: { valign: 'middle' } },
      { content: dayLabel(list[0]), rowSpan: rows.length, styles: { valign: 'middle', fontStyle: 'bold' } },
      ...rows[0],
    ];
    body.push(...rows);
  }

  const head: Cell[][] = [
    [
      { content: 'NO', rowSpan: 2 }, { content: 'HARI / TANGGAL', rowSpan: 2 },
      { content: 'MATA PELAJARAN', rowSpan: 2 }, { content: 'WAKTU', rowSpan: 2 },
      { content: 'RUANG', colSpan: R },
    ],
    Array.from({ length: R }, (_, r) => String(r + 1)),
  ];
  const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' }> = {
    0: { cellWidth: wNo }, 1: { cellWidth: wDay }, 2: { cellWidth: wSub, halign: 'left' }, 3: { cellWidth: wTime },
  };
  for (let r = 0; r < R; r++) columnStyles[4 + r] = { cellWidth: wRoom };

  // ---------- Daftar nama (kanan), digambar di halaman tabel; lanjut ke halaman berikut bila sangat panjang ----------
  const lx = ml + tableW + gap;
  const wLNo = 9;
  const hdrH = 5;
  const rowH = Math.max(3.6, Math.min(4.8, (bottomLimit - tableTop - hdrH - 4) / Math.max(1, numbered.length)));
  let legendNext = 0;
  let legendEndY = tableTop;
  let legendEndPage = 1;
  const drawLegendChunk = (top: number) => {
    if (numbered.length === 0) return;
    const cap = Math.max(1, Math.floor((bottomLimit - top - hdrH) / rowH));
    const take = numbered.slice(legendNext, legendNext + cap);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.setFillColor(235, 235, 235);
    doc.rect(lx, top, wLNo, hdrH, 'FD');
    doc.rect(lx + wLNo, top, legendW - wLNo, hdrH, 'FD');
    setFont('bold', 7);
    doc.text('NO', lx + wLNo / 2, top + 3.5, { align: 'center' });
    doc.text('NAMA', lx + wLNo + (legendW - wLNo) / 2, top + 3.5, { align: 'center' });
    setFont('normal', rowH >= 4.4 ? 7 : 6.2);
    take.forEach((t, i) => {
      const ry = top + hdrH + i * rowH;
      doc.rect(lx, ry, wLNo, rowH, 'S');
      doc.rect(lx + wLNo, ry, legendW - wLNo, rowH, 'S');
      doc.text(String(legendNext + i + 1), lx + wLNo / 2, ry + rowH * 0.72, { align: 'center' });
      doc.text(ellipsize(doc, t.name, legendW - wLNo - 2), lx + wLNo + 1, ry + rowH * 0.72);
    });
    legendNext += take.length;
    legendEndY = top + hdrH + take.length * rowH;
    legendEndPage = doc.getNumberOfPages();
  };

  autoTable(doc, {
    startY: tableTop,
    head: head as any,
    body: body as any,
    theme: 'grid',
    tableWidth: tableW,
    headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: fs, halign: 'center', valign: 'middle' },
    styles: { fontSize: fs, cellPadding: 0.9, halign: 'center', valign: 'middle', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.15, minCellHeight: 5 },
    columnStyles,
    margin: { left: ml, right: mr + legendW + gap, top: topMargin, bottom: 14 },
    showHead: 'everyPage',
    didDrawPage: (data: any) => { drawLegendChunk(data.pageNumber === 1 ? tableTop : topMargin); },
  });
  let leftEndY = (doc as any).lastAutoTable?.finalY ?? tableTop;
  const leftEndPage = doc.getNumberOfPages();
  if (legendNext === 0 && numbered.length > 0) drawLegendChunk(tableTop); // tabel kosong: tetap cetak daftar nama
  while (legendNext < numbered.length) { doc.addPage(); drawLegendChunk(topMargin); }

  const endPage = Math.max(leftEndPage, legendEndPage);
  doc.setPage(endPage);
  if (endPage > leftEndPage) leftEndY = topMargin - 6;
  const rightEndY = endPage === legendEndPage ? legendEndY : topMargin - 6;
  let blockTop = Math.max(leftEndY, rightEndY) + 6;

  // ---------- Keterangan (kiri) + titimangsa & tanda tangan (kanan) ----------
  const lineH = 4.6, sigGap = 16, sigW = 70;
  const notes = (opts.notes ?? []).map(clean).filter(Boolean);
  const notesW = Math.max(60, avail - sigW - 12);
  setFont('normal', 8);
  const noteLines = notes.map((n) => doc.splitTextToSize(`*  ${n}`, notesW) as string[]);
  const notesH = notes.length ? 5 + noteLines.reduce((s, l) => s + l.length * 3.8, 0) : 0;
  const sigH = lineH * 2 + sigGap + lineH * 2 + 1;
  const blockH = Math.max(notesH, sigH);
  if (blockTop + blockH > bottomLimit) {
    doc.addPage();
    setFont('italic', 8);
    doc.setTextColor(90, 90, 90);
    doc.text('Lanjutan jadwal pengawas ujian', ml, 10);
    blockTop = 16;
  }
  if (notes.length) {
    setFont('bold', 8);
    doc.text('Keterangan:', ml, blockTop + 3);
    setFont('normal', 8);
    let ny = blockTop + 7.5;
    noteLines.forEach((lines) => { doc.text(lines, ml + 2, ny); ny += lines.length * 3.8; });
  }
  const sx = pw - mr - sigW;
  const dots = (w: number) => '.'.repeat(Math.max(3, Math.floor(w / Math.max(0.1, doc.getTextWidth('.')))));
  setFont('normal', 10);
  const place = clean(opts.place);
  const dateText = opts.signDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.signDate) ? idDate(opts.signDate) : '';
  let sy = blockTop + 3;
  doc.text(`${place ? `${place}, ` : ''}${dateText || dots(34)}`, sx, sy);
  sy += lineH;
  doc.text(`${clean(opts.principalTitle) || 'Kepala Sekolah'},`, sx, sy);
  sy += sigGap + lineH;
  const name = clean(opts.principalName);
  if (name) { setFont('bold', 10); doc.text(name, sx, sy); setFont('normal', 10); } else doc.text(dots(sigW - 6), sx, sy);
  sy += lineH;
  doc.text(`NIP. ${clean(opts.principalNip) || dots(sigW - 12)}`, sx, sy);

  // ---------- Catatan cetak & nomor halaman ----------
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
  return doc;
}
