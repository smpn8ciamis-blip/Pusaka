import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import { paperFormat, type PdfPaper } from '@/lib/pdfPaper';
import { PRINT_CREDIT } from '@/lib/studentListPdf';
import { cellKey, teacherLoads, type Assignment, type InvSession, type InvTeacher } from '@/lib/examInvigilation';

export interface InvigilationPdfOptions {
  examName?: string | null;
  academicYear?: string | null;
  sessions: InvSession[];
  teachers: InvTeacher[];
  assignment: Assignment;
  rooms: number;
  perRoom: number;
  paper?: PdfPaper;
  /** Titimangsa + tanda tangan (kosong = diberi titik-titik untuk diisi tangan) */
  place?: string;
  signDate?: string; // yyyy-MM-dd
  chairName?: string | null;
  chairNip?: string | null;
  principalName?: string | null;
  principalNip?: string | null;
  printedAt?: Date;
}

type SchoolSettings = LetterheadSettings | null | undefined;

const clean = (v?: string | null) => (v ?? '').replace(/\s+/g, ' ').trim();
const idDate = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'd MMMM yyyy', { locale: localeId });
};

export const invigilationFileName = (paper: PdfPaper) => `jadwal-pengawas-ujian-${paper}.pdf`;

/**
 * Jadwal pengawas ujian (kertas A4/F4 lanskap): (1) matriks ruang × sesi, kolom sesi dipecah per halaman bila banyak,
 * (2) rekap tugas per guru, lalu titimangsa dan tanda tangan ketua panitia + kepala sekolah.
 * Blok tanda tangan tidak pernah terpotong: bila tidak muat, seluruh blok pindah ke halaman berikutnya.
 */
export async function buildInvigilationPdf(opts: InvigilationPdfOptions, settings: SchoolSettings): Promise<jsPDF> {
  const paper = opts.paper ?? 'f4';
  const doc = new jsPDF({ unit: 'mm', format: paperFormat(paper), orientation: 'landscape' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 10, mr = 10;
  const avail = pw - ml - mr;
  const bottomLimit = ph - 13;
  const printedAt = opts.printedAt ?? new Date();
  const nameOf = new Map(opts.teachers.map((t) => [t.id, t.name]));

  const setFont = (style: 'normal' | 'bold' | 'italic' = 'normal', size = 10) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
  };

  // ---------- Kop & judul ----------
  const startY = await addLetterheadToPDF(doc, settings as LetterheadSettings);
  setFont('bold', 12);
  doc.text('JADWAL PENGAWAS UJIAN', pw / 2, startY, { align: 'center' });
  let y = startY + 5;
  const sub = [clean(opts.examName), clean(opts.academicYear) ? `Tahun Pelajaran ${clean(opts.academicYear)}` : ''].filter(Boolean).join(' - ');
  if (sub) {
    setFont('normal', 10);
    doc.text(sub, pw / 2, y, { align: 'center' });
    y += 5;
  }
  y += 2;

  // ---------- 1) Matriks ruang × sesi ----------
  const firstW = 16;
  const minCol = opts.perRoom > 1 ? 44 : 36;
  const perChunk = Math.max(1, Math.floor((avail - firstW) / minCol));
  const chunks: InvSession[][] = [];
  for (let i = 0; i < opts.sessions.length; i += perChunk) chunks.push(opts.sessions.slice(i, i + perChunk));
  if (chunks.length === 0) chunks.push([]);

  chunks.forEach((chunk, ci) => {
    if (ci > 0) { doc.addPage(); y = 16; }
    setFont('bold', 10);
    const from = ci * perChunk + 1;
    const to = ci * perChunk + chunk.length;
    doc.text(
      chunks.length > 1 ? `Matriks Pengawas per Ruang (sesi ${from}-${to} dari ${opts.sessions.length})` : 'Matriks Pengawas per Ruang',
      ml, y,
    );
    const colW = chunk.length ? Math.floor(((avail - firstW) / chunk.length) * 100) / 100 : avail - firstW;
    const head = [['Ruang', ...chunk.map((s) =>
      `${[clean(s.day), clean(s.dateLabel) || s.date].filter(Boolean).join(', ')}\n${s.start}${s.end ? ` - ${s.end}` : ''}\n${clean(s.subject)}`)]];
    const body: string[][] = [];
    for (let room = 1; room <= opts.rooms; room++) {
      body.push([String(room), ...chunk.map((s) => {
        const names: string[] = [];
        for (let slot = 1; slot <= opts.perRoom; slot++) {
          const n = nameOf.get(opts.assignment[cellKey(s.key, room, slot)] ?? '');
          if (n) names.push(opts.perRoom > 1 ? `${slot}. ${n}` : n);
        }
        return names.length ? names.join('\n') : '-';
      })]);
    }
    const columnStyles: Record<number, { cellWidth: number; halign?: 'left' | 'center' }> = { 0: { cellWidth: firstW, halign: 'center' } };
    chunk.forEach((_, i) => { columnStyles[1 + i] = { cellWidth: colW, halign: 'left' }; });
    autoTable(doc, {
      startY: y + 2,
      head,
      body,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], fontSize: 7.5, halign: 'center', valign: 'middle' },
      styles: { fontSize: 8, cellPadding: 1.4, lineColor: [150, 150, 150], lineWidth: 0.1, valign: 'middle' },
      columnStyles,
      margin: { left: ml, right: mr, top: 14, bottom: 14 },
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y + 10) + 6;
  });

  // ---------- 2) Rekap per guru ----------
  const loads = teacherLoads(opts.sessions, opts.teachers, opts.assignment).filter((l) => l.total > 0);
  if (loads.length > 0) {
    if (y + 30 > bottomLimit) { doc.addPage(); y = 16; }
    setFont('bold', 10);
    doc.text('Rekap Tugas per Guru', ml, y);
    autoTable(doc, {
      startY: y + 2,
      head: [['No', 'Nama Guru', 'Jml', 'Jadwal mengawas']],
      body: loads.map((l, i) => [
        String(i + 1),
        l.name,
        String(l.total),
        l.items.map((it) => `${clean(it.session.dateLabel) || it.session.date} ${it.session.start} (Ruang ${it.room})`).join('; '),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], fontSize: 8, halign: 'center' },
      styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: [150, 150, 150], lineWidth: 0.1, valign: 'top' },
      columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 58 }, 2: { cellWidth: 10, halign: 'center' }, 3: { cellWidth: avail - 77 } },
      margin: { left: ml, right: mr, top: 14, bottom: 14 },
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y + 10) + 6;
  }

  // ---------- Titimangsa + tanda tangan ----------
  const lineH = 4.6, sigGap = 16, sigW = 80;
  const blockH = lineH * 3 + sigGap + lineH * 2 + 2;
  if (y + blockH > bottomLimit) {
    doc.addPage();
    setFont('italic', 8);
    doc.setTextColor(90, 90, 90);
    doc.text('Lanjutan jadwal pengawas ujian', ml, 10);
    y = 16;
  }
  const dots = (w: number) => '.'.repeat(Math.max(3, Math.floor(w / Math.max(0.1, doc.getTextWidth('.')))));
  const place = clean(opts.place);
  const dateText = opts.signDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.signDate) ? idDate(opts.signDate) : '';
  const dateLine = `${place ? `${place}, ` : ''}${dateText || dots(34)}`;
  const sign = (x: number, title: string, name?: string | null, nip?: string | null, withDate = false) => {
    setFont('normal', 10);
    let sy = y;
    if (withDate) doc.text(dateLine, x, sy);
    sy += lineH;
    doc.text(title, x, sy);
    sy += lineH + sigGap + lineH;
    const n = clean(name);
    if (n) { setFont('bold', 10); doc.text(n, x, sy); setFont('normal', 10); } else doc.text(dots(sigW - 8), x, sy);
    sy += lineH;
    doc.text(`NIP. ${clean(nip) || dots(sigW - 16)}`, x, sy);
  };
  sign(ml + 14, 'Mengetahui, Kepala Sekolah', opts.principalName, opts.principalNip);
  sign(pw - mr - sigW, 'Ketua Panitia Ujian,', opts.chairName, opts.chairNip, true);

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
