/**
 * PDF "Daftar Hasil Ujian CBT" dari halaman Pantau CBT: isi mengikuti saringan yang aktif, urut kelas lalu nama (atau nama saja).
 * Kertas A4 / F4, kop sekolah, rekap nilai, dan blok tanda tangan yang tidak terpotong (pindah halaman bila tidak muat).
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import { paperFormat, type PdfPaper } from '@/lib/pdfPaper';
import { STATUS_LABEL, type MonFilter, type MonRow } from '@/lib/cbtMonitor';

export type ReportOrder = 'kelas-nama' | 'nama';
export const ORDER_LABEL: Record<ReportOrder, string> = { 'kelas-nama': 'Kelas lalu Nama', nama: 'Nama saja' };

export interface ReportExam {
  title: string;
  subject?: string | null;
  pass_score?: number | null;
  total_questions?: number | null;
  duration_minutes?: number | null;
  start_datetime?: string | null;
  anti_cheat_enabled?: boolean | null;
}

export interface CbtResultPdfOptions {
  exam: ReportExam;
  rows: MonRow[];
  /** Keterangan saringan (lihat describeFilter). */
  filterText: string;
  order: ReportOrder;
  paper: PdfPaper;
  place: string;
  /** yyyy-mm-dd; kosong = titik-titik untuk diisi tangan */
  signDate: string;
  printedAt?: Date;
}

export interface ReportSettings extends LetterheadSettings {
  headmaster_name?: string | null;
  headmaster_nip?: string | null;
}

const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });

/** Urutan laporan: kelas (7 A, 7 B, …, 8 A) lalu nama; atau nama saja. */
export function sortForReport(rows: MonRow[], order: ReportOrder): MonRow[] {
  return rows.slice().sort((a, b) => {
    if (order === 'kelas-nama') {
      const c = collator.compare(a.classLabel, b.classLabel);
      if (c) return c;
    }
    return collator.compare(a.name, b.name) || collator.compare(a.nis, b.nis);
  });
}

/** Kalimat pendek tentang saringan yang aktif, dicetak di bawah judul. */
export function describeFilter(f: MonFilter, classLabelOf: (key: string) => string | undefined): string {
  const parts: string[] = [];
  if (f.classKey !== 'all') parts.push(`Kelas ${classLabelOf(f.classKey) || '-'}`);
  if (f.status !== 'all') parts.push(`Status ${STATUS_LABEL[f.status]}`);
  if (f.onlyOffline) parts.push('Hanya yang offline');
  if (f.onlyViolations) parts.push('Hanya yang melanggar');
  if (f.q.trim()) parts.push(`Pencarian "${f.q.trim()}"`);
  return parts.length ? parts.join(' • ') : 'Semua peserta';
}

export interface ReportStats {
  peserta: number; selesai: number; belumMulai: number; berlangsung: number;
  dinilai: number; rata: number | null; tertinggi: number | null; terendah: number | null; tuntas: number; belumTuntas: number;
}
export function reportStats(rows: MonRow[], passScore: number): ReportStats {
  const st: ReportStats = { peserta: rows.length, selesai: 0, belumMulai: 0, berlangsung: 0, dinilai: 0, rata: null, tertinggi: null, terendah: null, tuntas: 0, belumTuntas: 0 };
  let sum = 0;
  for (const r of rows) {
    if (r.status === 'belum') st.belumMulai++;
    else if (r.status === 'selesai') st.selesai++;
    else st.berlangsung++;
    if (r.status === 'selesai' && r.score != null) {
      st.dinilai++;
      sum += r.score;
      st.tertinggi = st.tertinggi == null ? r.score : Math.max(st.tertinggi, r.score);
      st.terendah = st.terendah == null ? r.score : Math.min(st.terendah, r.score);
      if (r.score >= passScore) st.tuntas++; else st.belumTuntas++;
    }
  }
  st.rata = st.dinilai ? sum / st.dinilai : null;
  return st;
}

export const fmtScore = (n: number | null | undefined): string => (n == null ? '-' : (Math.round(n * 10) / 10).toFixed(1).replace('.', ','));

const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const formatIdDateLong = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}` : '';
};

const slug = (s: string): string => clean(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'ujian';
export const reportFileName = (exam: ReportExam, d = new Date()): string =>
  `Hasil_CBT_${slug(exam.title)}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.pdf`;

export async function buildCbtResultPdf(opts: CbtResultPdfOptions, settings: ReportSettings | null | undefined): Promise<jsPDF> {
  const { exam } = opts;
  const pass = exam.pass_score ?? 70;
  const antiCheat = !!exam.anti_cheat_enabled;
  const rows = sortForReport(opts.rows, opts.order);
  const stats = reportStats(rows, pass);
  const printedAt = opts.printedAt ?? new Date();

  const doc = new jsPDF({ unit: 'mm', format: paperFormat(opts.paper), orientation: 'portrait' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 14;
  const mr = 14;
  const bottomLimit = ph - 14;

  const setFont = (style: 'normal' | 'bold' | 'italic' = 'normal', size = 10) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
  };

  // ---------- Kop & judul ----------
  const startY = await addLetterheadToPDF(doc, settings as LetterheadSettings);
  setFont('bold', 12);
  doc.text('DAFTAR HASIL UJIAN CBT', pw / 2, startY, { align: 'center' });

  const dateText = exam.start_datetime ? new Date(exam.start_datetime).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const info: [string, string][] = [
    ['Ujian', clean(exam.title) || '-'],
    ['Mata Pelajaran', clean(exam.subject) || '-'],
    ['Tanggal', dateText || '-'],
    ['Jumlah Soal / Durasi', `${exam.total_questions ?? '-'} soal / ${exam.duration_minutes ?? '-'} menit`],
    ['KKM', String(pass)],
    ['Daftar', opts.filterText],
    ['Urutan', ORDER_LABEL[opts.order]],
  ];
  setFont('normal', 9.5);
  let y = startY + 7;
  for (const [k, v] of info) {
    doc.text(k, ml, y);
    doc.text(':', ml + 42, y);
    const lines = doc.splitTextToSize(v, pw - ml - mr - 46) as string[];
    doc.text(lines, ml + 45, y);
    y += 4.8 * Math.max(1, lines.length);
  }
  y += 2;

  // ---------- Tabel ----------
  const head = ['No', 'NIS', 'Nama Siswa', 'Kelas', 'Status', 'Benar', 'Salah', 'Nilai', 'Keterangan', ...(antiCheat ? ['Lgr'] : [])];
  let provisional = false;
  const body = rows.map((r, i) => {
    const sementara = r.status === 'selesai' && r.needsGrading;
    if (sementara) provisional = true;
    const nilai = r.status === 'selesai' && r.score != null ? fmtScore(r.score) + (sementara ? '*' : '') : '-';
    const ket = r.status === 'selesai' && r.score != null ? (r.score >= pass ? 'Tuntas' : 'Belum Tuntas') : '-';
    return [
      String(i + 1),
      clean(r.nis),
      clean(r.name),
      clean(r.classLabel),
      STATUS_LABEL[r.status] + (r.remedial ? ' (R)' : ''),
      r.status === 'selesai' && r.correct != null ? String(r.correct) : '-',
      r.status === 'selesai' && r.wrong != null ? String(r.wrong) : '-',
      nilai,
      ket,
      ...(antiCheat ? [r.violations > 0 ? String(r.violations) : '-'] : []),
    ];
  });

  const columnStyles: Record<number, { cellWidth?: number | 'auto'; halign?: 'left' | 'center' | 'right' }> = {
    0: { cellWidth: 8, halign: 'center' },
    1: { cellWidth: 20, halign: 'center' },
    2: { cellWidth: 'auto', halign: 'left' },
    3: { cellWidth: 16, halign: 'center' },
    4: { cellWidth: 23, halign: 'center' },
    5: { cellWidth: 11, halign: 'center' },
    6: { cellWidth: 11, halign: 'center' },
    7: { cellWidth: 13, halign: 'center' },
    8: { cellWidth: 24, halign: 'center' },
  };
  if (antiCheat) columnStyles[9] = { cellWidth: 9, halign: 'center' };

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, halign: 'center', valign: 'middle' },
    styles: { fontSize: 8, cellPadding: 1.3, lineColor: [150, 150, 150], lineWidth: 0.1, overflow: 'ellipsize' },
    columnStyles,
    margin: { left: ml, right: mr, top: 14, bottom: 16 },
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    didParseCell: (d: any) => {
      if (d.section !== 'body') return;
      const keterangan = d.row.raw?.[8];
      if (d.column.index === 8 && keterangan === 'Belum Tuntas') d.cell.styles.textColor = [200, 30, 30];
      if (d.column.index === 8 && keterangan === 'Tuntas') d.cell.styles.textColor = [22, 130, 70];
    },
  });

  // ---------- Rekap + catatan ----------
  let yy: number = ((doc as any).lastAutoTable?.finalY ?? y) + 6;
  const recap: [string, string][] = [
    ['Jumlah peserta dalam daftar', String(stats.peserta)],
    ['Sudah selesai / sedang mengerjakan / belum mulai', `${stats.selesai} / ${stats.berlangsung} / ${stats.belumMulai}`],
    ['Nilai rata-rata (yang selesai)', fmtScore(stats.rata)],
    ['Nilai tertinggi / terendah', `${fmtScore(stats.tertinggi)} / ${fmtScore(stats.terendah)}`],
    [`Tuntas / belum tuntas (KKM ${pass})`, `${stats.tuntas} / ${stats.belumTuntas}`],
  ];
  const recapH = recap.length * 4.8 + (provisional ? 5 : 0) + 6;
  if (yy + recapH > bottomLimit) { doc.addPage(); yy = 16; }
  setFont('bold', 9.5);
  doc.text('Rekapitulasi', ml, yy);
  setFont('normal', 9);
  yy += 5;
  for (const [k, v] of recap) {
    doc.text(k, ml, yy);
    doc.text(':', ml + 82, yy);
    doc.text(v, ml + 85, yy);
    yy += 4.8;
  }
  if (provisional) {
    setFont('italic', 8);
    doc.text('* Nilai sementara: soal essay belum dikoreksi.   (R) = peserta remidial.', ml, yy + 1);
    yy += 5;
  }

  // ---------- Titimangsa + tanda tangan (tidak boleh terpotong) ----------
  const place = clean(opts.place);
  const dateStr = formatIdDateLong(opts.signDate);
  const dateLine = `${place ? place + ', ' : ''}${dateStr || '....................'}`;
  const lineH = 4.6;
  const sigGap = 18;
  const sigH = lineH * 3 + sigGap + lineH * 2 + 2;
  let sy = yy + 6;
  if (sy + sigH > bottomLimit) { doc.addPage(); sy = 18; }
  const colW = 70;
  const leftX = ml + 6;
  const rightX = pw - mr - colW - 4;
  setFont('normal', 9.5);
  doc.text(dateLine, rightX + colW / 2, sy, { align: 'center' });
  doc.text('Mengetahui,', leftX + colW / 2, sy + lineH, { align: 'center' });
  doc.text(clean(settings?.headmaster_position) || 'Kepala Sekolah', leftX + colW / 2, sy + lineH * 2, { align: 'center' });
  doc.text('Panitia Ujian', rightX + colW / 2, sy + lineH * 2, { align: 'center' });
  const nameY = sy + lineH * 2 + sigGap;
  setFont('bold', 9.5);
  const hm = clean(settings?.headmaster_name);
  doc.text(hm || '(............................................)', leftX + colW / 2, nameY, { align: 'center' });
  doc.text('(............................................)', rightX + colW / 2, nameY, { align: 'center' });
  const nip = clean(settings?.headmaster_nip);
  if (nip) { setFont('normal', 9); doc.text(`NIP. ${nip}`, leftX + colW / 2, nameY + lineH, { align: 'center' }); }

  // ---------- Nomor halaman + waktu cetak ----------
  const pages = doc.getNumberOfPages();
  const stamp = printedAt.toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    setFont('italic', 7.5);
    doc.setTextColor(110, 110, 110);
    doc.text(`Dicetak: ${stamp}`, ml, ph - 8);
    doc.text(`Halaman ${p} dari ${pages}`, pw - mr, ph - 8, { align: 'right' });
  }
  return doc;
}
