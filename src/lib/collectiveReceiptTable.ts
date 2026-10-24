import type jsPDF from 'jspdf';
import { toTitleCase } from '@/lib/utils';

/** Satu baris penerima pada kwitansi kolektif (snapshot yang disimpan saat kwitansi dibuat). */
export interface ReceiptLineItem {
  kind: 'teacher' | 'student';
  full_name: string;
  id_number: string | null; // NIP / NIS
  jabatan: string;
  class_name: string | null;
  rate: number;
  days: number;
  amount: number;
}

interface RateRow {
  position_type: string;
  daily_rate: number;
  transport_rate: number;
  accommodation_rate: number;
}

export const rateForType = (rate: RateRow | undefined, paymentType: string): number => {
  if (!rate) return 0;
  switch (paymentType) {
    case 'transport': return Number(rate.transport_rate) || 0;
    case 'accommodation': return Number(rate.accommodation_rate) || 0;
    case 'meals': return Number(rate.daily_rate) || 0;
    default: return 0;
  }
};

/**
 * Membuat baris kwitansi dari penerima + tarif SAAT INI.
 * Hasilnya disimpan ke payment_receipts.line_items sehingga angka tidak berubah
 * walau tarif di pengaturan diubah kemudian. Aturan fallback tarif sama dengan
 * perhitungan total di form (jabatan tak dikenal → tarif "Guru").
 */
export function buildLineItems(
  teachers: any[],
  students: any[],
  travelRates: RateRow[] | undefined,
  paymentType: string,
  days: number,
): ReceiptLineItem[] {
  const find = (pos: string) => travelRates?.find((r) => r.position_type === pos);
  const rateFor = (pos: string) => rateForType(find(pos) ?? find('Guru'), paymentType);

  const items: ReceiptLineItem[] = [];
  teachers.forEach((t) => {
    const jabatan = t.jabatan || 'Guru';
    const rate = rateFor(jabatan);
    items.push({
      kind: 'teacher', full_name: t.full_name || '-', id_number: t.nip || null,
      jabatan, class_name: null, rate, days, amount: rate * days,
    });
  });
  students.forEach((s) => {
    const rate = rateFor('Siswa');
    items.push({
      kind: 'student', full_name: s.full_name || '-', id_number: s.nis || null,
      jabatan: 'Siswa', class_name: s.class_name || null, rate, days, amount: rate * days,
    });
  });
  return items;
}

/** Pakai snapshot bila ada; kwitansi lama (tanpa snapshot) dihitung dari data & tarif saat ini. */
export function resolveLineItems(
  receipt: any,
  teachers: any[],
  students: any[],
  travelRates: RateRow[] | undefined,
  days: number,
): ReceiptLineItem[] {
  const snap = receipt?.line_items;
  if (Array.isArray(snap) && snap.length > 0) return snap as ReceiptLineItem[];
  return buildLineItems(teachers, students, travelRates, receipt?.payment_type, days);
}

interface TableOpts {
  leftMargin: number;
  rightEdge: number; // x tepi kanan area cetak
  startY: number;
  fontSize: number;
  minRowHeight: number;
  lineWidth: number;
  pageBottom?: number;
  topOfNewPage?: number;
}

/**
 * Menggambar tabel kwitansi kolektif. Kolom angka rata kanan dan kolom Jumlah
 * berhenti sebelum kotak TTD sehingga tidak saling menimpa. Mendukung banyak halaman.
 * Mengembalikan posisi y berikutnya + total.
 */
export function drawCollectiveTable(doc: jsPDF, items: ReceiptLineItem[], o: TableOpts) {
  const L = o.leftMargin;
  const R = o.rightEdge;
  const bottom = o.pageBottom ?? 270;
  const ttdW = 18;
  const ttdX = R - ttdW;
  const amountRight = ttdX - 3;
  const hariCenter = amountRight - 22;
  const satuanRight = hariCenter - 6;

  const colNo = L;
  const colName = L + 7;
  const colNIP = L + 46;
  const colJabatan = L + 74;
  const colKelas = L + 94;
  const nameW = colNIP - colName - 2;
  const jabatanW = colKelas - colJabatan - 2;

  const header = (y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(o.fontSize);
    doc.setDrawColor(0);
    doc.setLineWidth(o.lineWidth);
    doc.line(L, y - 3, R, y - 3);
    doc.text('No', colNo, y);
    doc.text('Nama', colName, y);
    doc.text('NIP/NIS', colNIP, y);
    doc.text('Jabatan', colJabatan, y);
    doc.text('Kelas', colKelas, y);
    doc.text('Satuan', satuanRight, y, { align: 'right' });
    doc.text('Hari', hariCenter, y, { align: 'center' });
    doc.text('Jumlah (Rp)', amountRight, y, { align: 'right' });
    doc.text('TTD', R - ttdW / 2, y, { align: 'center' });
    doc.line(L, y + 2, R, y + 2);
    doc.setFont('helvetica', 'normal');
  };

  let y = o.startY;
  header(y);
  y += 2;

  let total = 0;
  items.forEach((it, i) => {
    const nameLines: string[] = doc.splitTextToSize(toTitleCase(it.full_name) || '-', nameW);
    const jabLines: string[] = doc.splitTextToSize(it.jabatan || '-', jabatanW);
    const lines = Math.max(nameLines.length, jabLines.length);
    const rowH = Math.max(o.minRowHeight, lines * 3.5 + 2);

    if (y + rowH > bottom) {
      doc.addPage();
      y = o.topOfNewPage ?? 20;
      header(y);
      y += 2;
    }

    const top = y;
    const base = top + rowH / 2 + 1; // baris teks pertama, rata tengah vertikal
    const firstLineY = top + (rowH - (lines - 1) * 3.5) / 2 + 1;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(o.fontSize);
    doc.text(`${i + 1}`, colNo, base);
    nameLines.forEach((ln, idx) => doc.text(ln, colName, firstLineY + idx * 3.5));
    doc.text(it.id_number || '-', colNIP, base);
    jabLines.forEach((ln, idx) => doc.text(ln, colJabatan, firstLineY + idx * 3.5));
    doc.text(it.class_name || '-', colKelas, base);
    doc.text(Number(it.rate).toLocaleString('id-ID'), satuanRight, base, { align: 'right' });
    doc.text(`${it.days}`, hariCenter, base, { align: 'center' });
    doc.text(Number(it.amount).toLocaleString('id-ID'), amountRight, base, { align: 'right' });
    doc.setLineWidth(0.2);
    doc.rect(ttdX, top + 1, ttdW, rowH - 2);

    total += Number(it.amount) || 0;
    y = top + rowH;
  });

  // baris total
  if (y + 12 > bottom) {
    doc.addPage();
    y = o.topOfNewPage ?? 20;
  }
  y += 1;
  doc.setLineWidth(o.lineWidth);
  doc.line(L, y, R, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(o.fontSize + 1);
  doc.text('TOTAL', colJabatan, y);
  doc.text(total.toLocaleString('id-ID'), amountRight, y, { align: 'right' });
  y += 2;
  doc.line(L, y, R, y);

  return { y, total };
}

const RECEIPT_PAPER_KEY = 'receipt-paper';
export const getSavedReceiptPaper = (): 'a4' | 'f4' => {
  try { return localStorage.getItem(RECEIPT_PAPER_KEY) === 'f4' ? 'f4' : 'a4'; } catch { return 'a4'; }
};
export const saveReceiptPaper = (p: 'a4' | 'f4') => {
  try { localStorage.setItem(RECEIPT_PAPER_KEY, p); } catch { /* abaikan */ }
};

interface FooterOpts {
  y: number;                 // posisi y tepat setelah tabel
  leftMargin: number;
  rightMargin: number;
  pageBottom: number;        // batas bawah area cetak (tinggi kertas - margin bawah)
  topOfNewPage: number;
  terbilangText: string;
  showTax: boolean;
  terbilangFontSize: number;
  taxFontSize: number;
  signatureFontSize: number;
  terbilangToTaxSpacing: number;
  taxToSignatureSpacing: number;
  signatureSpacing: number;
  signatureNameSpacing: number;
  signatureColumnWidth: number;
  schoolName?: string | null;
  headmasterName?: string | null;
  headmasterNip?: string | null;
  bendaharaName?: string | null;
  bendaharaNip?: string | null;
  sppdDate: string;
  receiptDate: string;
}

/**
 * Menggambar terbilang, info pajak, dan blok tanda tangan. Seluruh blok dijaga satu paket:
 * bila tidak muat di sisa halaman, dipindah utuh ke halaman berikutnya sehingga TTD tidak terpotong.
 */
export function drawCollectiveFooter(doc: jsPDF, o: FooterOpts) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const L = o.leftMargin;
  const col1X = L + o.signatureColumnWidth;
  const col2X = pageWidth - o.rightMargin - o.signatureColumnWidth;

  doc.setFontSize(o.terbilangFontSize);
  const terbilangLines: string[] = doc.splitTextToSize(o.terbilangText, pageWidth - L - 30);

  // Tinggi seluruh blok: terbilang + pajak + 4 baris TTD (+ cadangan 6mm untuk NIP).
  const needed =
    8 + terbilangLines.length * 4 + o.terbilangToTaxSpacing + o.taxToSignatureSpacing +
    5 + o.signatureNameSpacing + o.signatureSpacing + o.signatureNameSpacing + 6;

  let y = o.y;
  if (y + needed > o.pageBottom) {
    doc.addPage();
    y = o.topOfNewPage - 8; // dikurangi 8 karena langkah berikut menambah 8
  }

  y += 8;
  doc.setFontSize(o.terbilangFontSize);
  doc.setFont('helvetica', 'normal');
  doc.text('Terbilang:', L, y);
  doc.setFont('helvetica', 'italic');
  doc.text(terbilangLines, L + 20, y);

  y += terbilangLines.length * 4 + o.terbilangToTaxSpacing;
  if (o.showTax) {
    doc.setFontSize(o.taxFontSize);
    doc.setFont('helvetica', 'normal');
    doc.text('Informasi Potongan Pajak:', L, y);
    doc.text('PPh 21: -   |   PPh 23: -   |   PPN: -   |   Jumlah Potongan: -', L + 35, y);
  }

  y += o.taxToSignatureSpacing;
  doc.setFontSize(o.signatureFontSize);
  doc.setFont('helvetica', 'normal');
  doc.text('Menyetujui,', col1X, y, { align: 'center' });
  doc.text(`Ciamis, ${o.sppdDate}`, col2X, y, { align: 'center' });

  y += 5;
  doc.text(`Kepala ${o.schoolName || 'Sekolah'}`, col1X, y, { align: 'center' });
  doc.text('Bendahara BOS', col2X, y, { align: 'center' });

  y += o.signatureNameSpacing;
  doc.setFont('helvetica', 'bolditalic');
  doc.text(`Lunas Dibayar Tanggal: ${o.receiptDate}`, col2X, y, { align: 'center' });

  y += o.signatureSpacing;
  doc.setFont('helvetica', 'bold');
  doc.text(toTitleCase(o.headmasterName) || '', col1X, y, { align: 'center' });
  doc.text(toTitleCase(o.bendaharaName) || '.........................', col2X, y, { align: 'center' });

  y += o.signatureNameSpacing;
  doc.setFontSize(o.taxFontSize);
  doc.setFont('helvetica', 'normal');
  if (o.headmasterNip) doc.text(`NIP. ${o.headmasterNip}`, col1X, y, { align: 'center' });
  doc.text(o.bendaharaNip ? `NIP. ${o.bendaharaNip}` : 'NIP. .........................', col2X, y, { align: 'center' });
  return y;
}
