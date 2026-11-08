import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import { paperFormat, type PdfOrientation, type PdfPaper } from '@/lib/pdfPaper';

export interface StudentListRow {
  nisn: string | null;
  nama: string;
}

export interface StudentListPdfOptions {
  title: string; // default "Daftar Siswa"
  className: string;
  homeroomName?: string | null;
  homeroomNip?: string | null;
  students: StudentListRow[];
  /** judul kolom tambahan (boleh kosong); jumlah elemen = jumlah kolom tambahan */
  extraColumns: string[];
  place: string; // untuk titimangsa, mis. "Ciamis"
  paper?: PdfPaper;
  orientation?: PdfOrientation;
  printedAt?: Date;
}

type SchoolSettings = LetterheadSettings | null | undefined;

export const DEFAULT_STUDENT_LIST_TITLE = 'Daftar Siswa';
export const MAX_EXTRA_COLUMNS = 15;
export const PRINT_CREDIT = 'Dicetak dari Pusaka Nedelcis';

const clean = (v?: string | null) => (v ?? '').replace(/\s+/g, ' ').trim();

export const studentListFileName = (className: string, title: string) => {
  const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug(title) || 'Daftar-Siswa'}-${slug(className) || 'Kelas'}.pdf`;
};

/**
 * Daftar siswa satu kelas: kop sekolah, judul, kelas, wali kelas, tabel No | NISN | Nama | kolom bebas,
 * titimangsa + tanda tangan wali kelas, dan catatan "Dicetak dari Pusaka Nedelcis, tanggal" di tiap halaman.
 * Tabel yang panjang pindah halaman (judul kolom diulang); blok tanda tangan tidak pernah terpotong
 * dan tidak pernah sendirian di halaman tanpa baris tabel.
 */
export async function buildStudentListPdf(opts: StudentListPdfOptions, settings: SchoolSettings): Promise<jsPDF> {
  const paper = opts.paper ?? 'a4';
  const orientation = opts.orientation ?? 'portrait';
  const doc = new jsPDF({ unit: 'mm', format: paperFormat(paper), orientation });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 18;
  const mr = 18;
  const cw = pw - ml - mr;
  const bottomLimit = ph - 16;
  const FONT = 'times';
  const SIZE = 10.5;
  const lineH = 4.6;
  const padX = 1.8;
  const padY = 1.6;
  const minRowH = 7;
  const headH = 8;
  const printedAt = opts.printedAt ?? new Date();

  const setFont = (style: 'normal' | 'bold' | 'italic' = 'normal', size = SIZE) => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
  };

  // ---------- Kop & judul ----------
  let y = (await addLetterheadToPDF(doc, settings)) + 4;
  setFont('bold', 13);
  const title = clean(opts.title) || DEFAULT_STUDENT_LIST_TITLE;
  doc.text(title.toUpperCase(), pw / 2, y + 3, { align: 'center' });
  y += 10;

  const dots = (w: number) => '.'.repeat(Math.max(3, Math.floor(w / Math.max(0.1, doc.getTextWidth('.')))));
  setFont();
  const labelW = 26;
  doc.text('Kelas', ml, y);
  doc.text(`: ${clean(opts.className) || '-'}`, ml + labelW, y);
  y += lineH + 0.8;
  doc.text('Wali Kelas', ml, y);
  const wali = clean(opts.homeroomName);
  doc.text(`: ${wali || dots(60)}`, ml + labelW, y);
  y += lineH + 3.5;

  // ---------- Kolom ----------
  const extra = opts.extraColumns.slice(0, MAX_EXTRA_COLUMNS).map((h) => clean(h));
  const nExtra = extra.length;
  const wNo = 9;
  const wNisn = 27;
  // lebar kolom nama menyesuaikan jumlah kolom tambahan agar kolom tambahan tidak terlalu sempit
  const minExtra = 6;
  const wNamaMax = 62;
  const wNamaMin = 38;
  let wNama = Math.max(wNamaMin, Math.min(wNamaMax, cw - wNo - wNisn - nExtra * 14));
  let wExtra = nExtra ? (cw - wNo - wNisn - wNama) / nExtra : 0;
  if (nExtra && wExtra < minExtra) {
    wExtra = minExtra;
    wNama = cw - wNo - wNisn - nExtra * wExtra; // dengan batas 15 kolom, nilai ini tetap > 40 mm
  }
  const widths = [wNo, wNisn, wNama, ...Array(nExtra).fill(wExtra)] as number[];
  const xs: number[] = [ml];
  widths.forEach((w) => xs.push(xs[xs.length - 1] + w));
  const right = xs[xs.length - 1];

  // ---------- Tinggi baris (nama panjang bisa 2+ baris) ----------
  setFont();
  const rows = opts.students.map((s) => {
    const nameLines = doc.splitTextToSize(clean(s.nama) || '-', wNama - padX * 2) as string[];
    return { nisn: clean(s.nisn), nameLines, h: Math.max(minRowH, nameLines.length * lineH + padY * 2) };
  });

  // ---------- Blok tanda tangan ----------
  const gapBeforeSig = 8;
  const sigGap = 22; // ruang tanda tangan
  const sigH = lineH * 2 + sigGap + lineH * 2 + 1;
  const sigW = 66;

  // ---------- Paginasi baris ----------
  const firstTop = y;
  const nextTop = 16;
  const pages: number[][] = [];
  {
    let cur: number[] = [];
    let used = 0;
    let top = firstTop;
    rows.forEach((r, i) => {
      if (cur.length > 0 && top + headH + used + r.h > bottomLimit) {
        pages.push(cur);
        cur = [];
        used = 0;
        top = nextTop;
      }
      cur.push(i);
      used += r.h;
    });
    pages.push(cur);
  }
  const pageTop = (pi: number) => (pi === 0 ? firstTop : nextTop);
  const pageUsed = (pi: number) => pages[pi].reduce((a, i) => a + rows[i].h, 0);
  const sigFits = (pi: number) => pageTop(pi) + headH + pageUsed(pi) + gapBeforeSig + sigH <= bottomLimit;
  if (!sigFits(pages.length - 1)) {
    // Tanda tangan harus ikut halaman terakhir bersama minimal 3 baris tabel
    const MIN_TAIL = 3;
    const last = pages[pages.length - 1];
    if (last.length > MIN_TAIL) {
      pages[pages.length - 1] = last.slice(0, last.length - MIN_TAIL);
      pages.push(last.slice(last.length - MIN_TAIL));
    } else if (pages.length > 1) {
      const prev = pages[pages.length - 2];
      const need = Math.min(MIN_TAIL - last.length, prev.length - 1);
      if (need > 0) {
        pages[pages.length - 2] = prev.slice(0, prev.length - need);
        pages[pages.length - 1] = [...prev.slice(prev.length - need), ...last];
      }
    }
  }

  // ---------- Gambar tabel ----------
  const drawHeader = (top: number) => {
    doc.setFillColor(232, 232, 232);
    doc.rect(ml, top, right - ml, headH, 'F');
    setFont('bold', 10);
    const heads = ['No', 'NISN', 'Nama Siswa', ...extra];
    heads.forEach((h, i) => {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const lines = doc.splitTextToSize(h, widths[i] - 1.2) as string[];
      const shown = lines.slice(0, 2);
      const startY = top + headH / 2 + 1.2 - ((shown.length - 1) * 3.6) / 2;
      shown.forEach((ln, li) => doc.text(ln, cx, startY + li * 3.6, { align: 'center' }));
    });
    setFont();
    return top + headH;
  };

  let lastBottom = firstTop;
  pages.forEach((idxs, pi) => {
    if (pi > 0) doc.addPage();
    const top = pageTop(pi);
    let cy = drawHeader(top);
    idxs.forEach((ri) => {
      const r = rows[ri];
      setFont();
      doc.text(String(ri + 1), (xs[0] + xs[1]) / 2, cy + padY + lineH * 0.8, { align: 'center' });
      if (r.nisn) doc.text(r.nisn, xs[1] + padX, cy + padY + lineH * 0.8);
      r.nameLines.forEach((ln, li) => doc.text(ln, xs[2] + padX, cy + padY + li * lineH + lineH * 0.8));
      cy += r.h;
    });
    // garis: tepi atas, bawah judul kolom, tiap baris, tepi bawah, dan garis tegak
    doc.setLineWidth(0.25);
    doc.setDrawColor(0, 0, 0);
    doc.line(ml, top, right, top);
    let ly = top + headH;
    doc.line(ml, ly, right, ly);
    idxs.forEach((ri) => {
      ly += rows[ri].h;
      doc.line(ml, ly, right, ly);
    });
    xs.forEach((x) => doc.line(x, top, x, ly));
    lastBottom = ly;
  });

  // ---------- Titimangsa & tanda tangan wali kelas ----------
  let sy = lastBottom + gapBeforeSig;
  const sx = pw - mr - sigW;
  setFont();
  const place = clean(opts.place);
  doc.text(`${place ? `${place}, ` : ''}${dots(sigW - 2 - (place ? doc.getTextWidth(`${place}, `) : 0))}`, sx, sy);
  sy += lineH;
  doc.text('Wali Kelas,', sx, sy);
  sy += sigGap + lineH;
  const nip = clean(opts.homeroomNip);
  if (wali) {
    setFont('bold');
    doc.text(wali, sx, sy);
    setFont();
  } else {
    doc.text(dots(sigW - 6), sx, sy);
  }
  sy += lineH;
  doc.text(`NIP. ${nip || dots(sigW - 12)}`, sx, sy);

  // ---------- Catatan cetak di setiap halaman ----------
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
