import jsPDF from 'jspdf';
import autoTable, { type CellDef } from 'jspdf-autotable';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import type { EkskulSigner } from '@/lib/ekskulJournalPdf';
import { paperFormat, type PdfOrientation, type PdfPaper } from '@/lib/pdfPaper';

export interface AttendanceMeeting {
  id: string;
  meeting_date: string; // yyyy-MM-dd, sesuai tanggal di jurnal
}

export interface AttendancePerson {
  name: string;
  /** Pembina: jabatan; anggota: kelas */
  role: string;
  isInstructor: boolean;
}

export interface EkskulAttendancePdfInput {
  schoolSettings: (LetterheadSettings & { academic_year?: string | null }) | null;
  ekskulName: string;
  periodLabel: string;
  meetings: AttendanceMeeting[];
  /** Pembimbing lebih dulu, lalu anggota */
  people: AttendancePerson[];
  wakasek: EkskulSigner | null;
  place: string;
  printDate: Date;
  /** Default landscape */
  orientation?: PdfOrientation;
  /** Default A4 */
  paper?: PdfPaper;
}

const NO_COL_W = 9;
const ROLE_COL_W = 32;
const MIN_NAME_COL_W = 50;

/**
 * Daftar hadir ekskul: No | Nama | Jabatan/Kelas | Pertemuan 1..n (tanggal dari jurnal).
 * Baris paling atas pembimbing, diikuti anggota. Kolom pertemuan dikosongkan untuk paraf/centang.
 * Ditandatangani Wakasek Kesiswaan.
 */
export async function generateEkskulAttendancePdf(input: EkskulAttendancePdfInput): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: input.orientation ?? 'landscape',
    unit: 'mm',
    format: paperFormat(input.paper ?? 'a4'),
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Lebar kolom pertemuan & jumlah kolom per tabel menyesuaikan lebar kertas
  const isLandscape = pageW > pageH;
  const meetingColW = isLandscape ? 14 : 13;
  const meetingsPerTable = Math.max(
    1,
    Math.floor((pageW - margin * 2 - NO_COL_W - ROLE_COL_W - MIN_NAME_COL_W) / meetingColW),
  );

  let y = await addLetterheadToPDF(doc, input.schoolSettings);

  // ---- Judul & identitas ---------------------------------------------------
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('DAFTAR HADIR EKSTRAKURIKULER', pageW / 2, y, { align: 'center' });
  y += 7;

  doc.setFontSize(10);
  const info: Array<[string, string]> = [['Ekstrakurikuler', input.ekskulName]];
  if (input.schoolSettings?.academic_year) info.push(['Tahun Pelajaran', input.schoolSettings.academic_year]);
  info.push(['Periode', input.periodLabel]);
  info.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.text(label, margin, y);
    doc.text(':', margin + 36, y);
    doc.setFont('helvetica', 'bold');
    doc.text(value, margin + 40, y);
    y += 5.2;
  });
  y += 1.5;

  // ---- Tabel (dipecah per 12 pertemuan) -----------------------------------
  const chunks: AttendanceMeeting[][] = [];
  for (let i = 0; i < input.meetings.length; i += meetingsPerTable) {
    chunks.push(input.meetings.slice(i, i + meetingsPerTable));
  }
  if (chunks.length === 0) chunks.push([]);

  let finalY = y;
  chunks.forEach((chunk, ci) => {
    const offset = ci * meetingsPerTable;
    let startY = y;

    if (ci > 0) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(
        `${input.ekskulName} — lanjutan (pertemuan ${offset + 1}–${offset + chunk.length})`,
        margin,
        16,
      );
      startY = 20;
    }

    const head: CellDef[][] = [
      [
        { content: 'No', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Nama', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        { content: 'Jabatan / Kelas', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        ...(chunk.length
          ? [{ content: 'Pertemuan ke- / Tanggal', colSpan: chunk.length, styles: { halign: 'center' as const } }]
          : []),
      ],
      chunk.map((m, i) => ({
        content: `${offset + i + 1}\n${format(new Date(`${m.meeting_date}T00:00:00`), 'dd/MM/yy', { locale: idLocale })}`,
        styles: { halign: 'center' as const, fontSize: 7, cellPadding: 0.8 },
      })),
    ];

    const body = input.people.map((p, i) => [
      String(i + 1),
      p.name,
      p.role,
      ...chunk.map(() => ''),
    ]);

    const columnStyles: Record<number, Record<string, unknown>> = {
      0: { cellWidth: NO_COL_W, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: ROLE_COL_W },
    };
    chunk.forEach((_, i) => {
      columnStyles[3 + i] = { cellWidth: meetingColW };
    });

    autoTable(doc, {
      startY,
      margin: { left: margin, right: margin, bottom: 14 },
      head,
      body,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 1.8,
        minCellHeight: 7,
        valign: 'middle',
        lineColor: [60, 60, 60],
        lineWidth: 0.2,
        textColor: 20,
      },
      headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold', minCellHeight: 6 },
      columnStyles,
      // Pembimbing ditebalkan agar terlihat di antara anggota
      didParseCell: (data) => {
        if (data.section === 'body' && input.people[data.row.index]?.isInstructor) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [248, 248, 248];
        }
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finalY = (doc as any).lastAutoTable?.finalY ?? startY;
  });

  // ---- Tanda tangan Wakasek Kesiswaan -------------------------------------
  const blockH = 44;
  let signY = finalY + 9;
  if (signY + blockH > pageH - 10) {
    doc.addPage();
    signY = 24;
  }
  const signX = pageW - margin - 55;
  const dateStr = format(input.printDate, 'd MMMM yyyy', { locale: idLocale });
  const placeDate = input.place.trim() ? `${input.place.trim()}, ${dateStr}` : dateStr;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(placeDate, signX, signY, { align: 'center' });
  doc.text('Mengetahui,', signX, signY + 5.2, { align: 'center' });
  doc.text('Wakil Kepala Sekolah Bidang Kesiswaan,', signX, signY + 10.2, { align: 'center' });

  const nameY = signY + 33;
  const name = input.wakasek?.name?.trim() || '(................................)';
  doc.setFont('helvetica', 'bold');
  doc.text(name, signX, nameY, { align: 'center' });
  if (input.wakasek?.name) {
    const w = doc.getTextWidth(name);
    doc.setLineWidth(0.3);
    doc.line(signX - w / 2, nameY + 0.8, signX + w / 2, nameY + 0.8);
  }
  const idLine = input.wakasek?.nip ? `NIP. ${input.wakasek.nip}` : input.wakasek?.nuptk ? `NUPTK. ${input.wakasek.nuptk}` : '';
  if (idLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(idLine, signX, nameY + 5, { align: 'center' });
  }

  // ---- Nomor halaman -------------------------------------------------------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Halaman ${p} dari ${total}`, pageW - margin, pageH - 6, { align: 'right' });
    doc.setTextColor(0);
  }

  return doc;
}
