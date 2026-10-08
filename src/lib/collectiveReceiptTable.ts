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
