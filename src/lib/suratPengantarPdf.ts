import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import { paperFormat, type PdfPaper } from '@/lib/pdfPaper';

export interface SuratPengantarItem {
  uraian: string;
  jumlah: string;
  keterangan: string;
}

export interface SuratPengantarData {
  nomor_surat: string;
  tanggal_surat: string; // yyyy-MM-dd
  tempat_surat?: string | null;
  kepada_yth: string; // boleh beberapa baris
  di_tempat?: string | null;
  items: SuratPengantarItem[];
  penandatangan_nama?: string | null;
  penandatangan_nip?: string | null;
}

type SchoolSettings = (LetterheadSettings & { headmaster_name?: string | null; headmaster_nip?: string | null }) | null | undefined;

export const DEFAULT_KETERANGAN_SURAT_PENGANTAR =
  'Disampaikan dengan hormat sebagai permohonan dan atas perhatiannya disampaikan terima kasih';

export const suratPengantarFileName = (nomor: string) =>
  `Surat-Pengantar-${nomor.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tanpa-nomor'}.pdf`;

const clean = (v?: string | null) => (v ?? '').replace(/\r\n?/g, '\n').trim();

/**
 * Surat Pengantar: kop dari pengaturan sekolah, tabel No | Uraian | Jumlah | Keterangan,
 * tanda tangan kepala sekolah (hanya nama & NIP). A4 atau F4; tabel yang panjang pindah halaman
 * dengan judul kolom diulang, blok tanda tangan tidak pernah terpotong.
 */
export async function buildSuratPengantarPdf(
  letter: SuratPengantarData,
  settings: SchoolSettings,
  paper: PdfPaper = 'a4'
): Promise<jsPDF> {
  const first = await layoutSuratPengantar(letter, settings, paper, false);
  if (!first.signatureAlone) return first.doc;
  // Tanda tangan terlempar sendirian ke halaman baru: ulangi dengan menyisihkan ruangnya di baris terakhir tabel
  // sehingga baris terakhir ikut pindah bersama tanda tangan.
  return (await layoutSuratPengantar(letter, settings, paper, true)).doc;
}

async function layoutSuratPengantar(
  letter: SuratPengantarData,
  settings: SchoolSettings,
  paper: PdfPaper,
  reserveSignature: boolean
): Promise<{ doc: jsPDF; signatureAlone: boolean }> {
  const doc = new jsPDF({ unit: 'mm', format: paperFormat(paper), orientation: 'portrait' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 20;
  const mr = 20;
  const cw = pw - ml - mr;
  const bottomLimit = ph - 16;
  const FONT = 'times';
  const SIZE = 11;
  const lineH = 5.4;
  const pad = 2.4;

  const setFont = (style: 'normal' | 'bold' = 'normal', size = SIZE) => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
  };

  let y = (await addLetterheadToPDF(doc, settings)) + 4;
  setFont();

  // ---- Blok tujuan (kanan atas) ----
  const rx = ml + cw * 0.52;
  const rw = pw - mr - rx;
  const kepadaLines = clean(letter.kepada_yth).split('\n').filter((l) => l.trim());
  const block: { text: string; indent?: number }[] = [{ text: 'Kepada' }];
  kepadaLines.forEach((l, i) => block.push({ text: i === 0 ? `Yth. ${l.trim()}` : l.trim() }));
  const di = clean(letter.di_tempat);
  if (di) {
    block.push({ text: 'Di' });
    block.push({ text: di, indent: 8 });
  }
  block.forEach((b) => {
    const lines: string[] = doc.splitTextToSize(b.text, rw - (b.indent ?? 0));
    lines.forEach((ln) => {
      doc.text(ln, rx + (b.indent ?? 0), y + lineH * 0.8);
      y += lineH;
    });
  });

  // ---- Judul & nomor ----
  y += 10;
  setFont('bold', 12);
  const title = 'SURAT PENGANTAR'.split('').join(' ');
  doc.text(title, pw / 2, y, { align: 'center' });
  const tw = doc.getTextWidth(title);
  doc.setLineWidth(0.3);
  doc.line(pw / 2 - tw / 2, y + 1.2, pw / 2 + tw / 2, y + 1.2);
  y += 6;
  setFont('bold');
  doc.text(`No: ${clean(letter.nomor_surat)}`, pw / 2, y, { align: 'center' });
  y += 6;
  setFont();

  // ---- Tabel ----
  const wNo = 11;
  const wUr = cw * 0.46;
  const wJm = cw * 0.16;
  const xs = [ml, ml + wNo, ml + wNo + wUr, ml + wNo + wUr + wJm, ml + cw];
  const headH = 9;
  const minBody = 52;
  doc.setLineWidth(0.3);
  doc.setDrawColor(0, 0, 0);

  const drawHeader = (top: number) => {
    setFont('bold');
    const heads = ['No', 'Uraian', 'Jumlah', 'Keterangan'];
    heads.forEach((h, i) => doc.text(h, (xs[i] + xs[i + 1]) / 2, top + headH / 2 + 1.4, { align: 'center' }));
    setFont();
    return top + headH;
  };

  const closeSegment = (top: number, headBottom: number, bottom: number) => {
    doc.setLineWidth(0.3);
    doc.line(xs[0], top, xs[4], top);
    doc.line(xs[0], headBottom, xs[4], headBottom);
    doc.line(xs[0], bottom, xs[4], bottom);
    xs.forEach((x) => doc.line(x, top, x, bottom));
  };

  const sigNip = !!(clean(letter.penandatangan_nip) || clean(settings?.headmaster_nip));
  const sigH = lineH * 2 + 24 + lineH * (sigNip ? 2 : 1) + 2;
  const items = (letter.items ?? []).filter((it) => clean(it.uraian) || clean(it.jumlah) || clean(it.keterangan));
  const rows = items.length ? items : [{ uraian: '', jumlah: '', keterangan: '' }];

  let segTop = y;
  let bodyTop = drawHeader(segTop);
  let cursor = bodyTop + pad;
  let segments = 1;

  // extra: jarak dari 'cursor' ke garis bawah tabel pada halaman yang ditutup
  const newPage = (extra: number) => {
    closeSegment(segTop, bodyTop, Math.min(cursor + extra, bottomLimit));
    doc.addPage();
    segments += 1;
    segTop = 18;
    bodyTop = drawHeader(segTop);
    cursor = bodyTop + pad;
  };

  rows.forEach((it, idx) => {
    const wrap = (txt: string, w: number): string[] => {
      const t = clean(txt);
      return t ? (doc.splitTextToSize(t, w - pad * 2) as string[]) : [];
    };
    const cols = [
      wrap(it.uraian, wUr),
      wrap(it.jumlah, wJm),
      wrap(it.keterangan, xs[4] - xs[3]),
    ];
    let off = 0;
    const total = Math.max(1, ...cols.map((c) => c.length));
    let first = true;
    const isLast = idx === rows.length - 1;
    // baris terakhir diberi batas lebih atas bila tanda tangan harus ikut di halaman yang sama
    const limitFor = () => (isLast && reserveSignature ? bottomLimit - sigH - 12 : bottomLimit);
    // baris yang muat di satu halaman tidak dipotong: pindah utuh ke halaman berikutnya
    const fullPageLines = Math.floor((bottomLimit - 18 - headH - pad * 2) / lineH);
    const fitsHere = Math.floor((limitFor() - cursor - pad) / lineH);
    if (total <= fullPageLines && fitsHere < total && cursor > bodyTop + pad) newPage(-pad);
    while (off < total) {
      let avail = Math.floor((limitFor() - cursor - pad) / lineH);
      if (avail < 1) {
        newPage(-pad); // cursor sudah memuat jarak antar-uraian (2 x pad)
        avail = Math.floor((limitFor() - cursor - pad) / lineH);
      }
      const take = Math.min(total - off, avail);
      setFont();
      if (first) doc.text(String(idx + 1), (xs[0] + xs[1]) / 2, cursor + lineH * 0.8, { align: 'center' });
      cols.forEach((c, ci) => {
        c.slice(off, off + take).forEach((ln, li) => {
          const x = ci === 0 ? xs[1] + pad : xs[ci + 1] + pad;
          doc.text(ln, x, cursor + li * lineH + lineH * 0.8);
        });
      });
      cursor += take * lineH;
      off += take;
      first = false;
      if (off < total) newPage(pad);
    }
    cursor += pad * 2; // jarak antar uraian
  });

  // tinggi minimum badan tabel (hanya bila seluruh tabel muat satu halaman)
  let tableBottom = cursor - pad;
  if (segments === 1) tableBottom = Math.min(Math.max(tableBottom, bodyTop + minBody), bottomLimit);
  closeSegment(segTop, bodyTop, tableBottom);
  y = tableBottom;

  // ---- Tanda tangan (hanya nama & NIP kepala sekolah) ----
  const place = clean(letter.tempat_surat);
  const dateLong = format(new Date(`${letter.tanggal_surat}T00:00:00`), 'd MMMM yyyy', { locale: localeId });
  const position = clean(settings?.headmaster_position) || 'Kepala Sekolah';
  const name = clean(letter.penandatangan_nama) || clean(settings?.headmaster_name);
  const nip = clean(letter.penandatangan_nip) || clean(settings?.headmaster_nip);

  y += 10;
  let signatureAlone = false;
  if (y + sigH > bottomLimit) {
    doc.addPage();
    y = 22;
    signatureAlone = true;
  }
  const sx = pw - mr - 66;
  setFont();
  // titik-titik pengisi selebar w mm (untuk diisi tulisan tangan)
  const dots = (w: number) => '.'.repeat(Math.max(3, Math.floor(w / Math.max(0.1, doc.getTextWidth('.')))));
  // ---- Bukti diterima (kiri bawah, sejajar tanda tangan kepala sekolah) ----
  const recvW = 58;
  const recvLabel = 'Diterima tgl : ';
  doc.text(`${recvLabel}${dots(recvW - doc.getTextWidth(recvLabel))}`, ml, y);
  doc.text('Kepala/ketua', ml, y + lineH);
  doc.text(dots(recvW), ml, y + lineH + 24 + lineH); // tempat nama penerima
  doc.text(place ? `${place}, ${dateLong}` : dateLong, sx, y);
  y += lineH;
  doc.text(position.endsWith(',') ? position : `${position},`, sx, y);
  y += 24 + lineH;
  setFont('bold');
  doc.text(name, sx, y);
  if (nip) {
    y += lineH;
    setFont();
    doc.text(`NIP. ${nip}`, sx, y);
  }
  setFont();
  return { doc, signatureAlone };
}
