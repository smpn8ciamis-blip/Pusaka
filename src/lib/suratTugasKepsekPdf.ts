// PDF surat tugas Kepala Sekolah/Plt (format Dinas Pendidikan, mengikuti halaman 1 berkas SPPD).
import jsPDF from 'jspdf';
import logoKabCiamis from '@/assets/logo-kab-ciamis.png';
import {
  lokasiTeks, rentangTanggalTeks, tanggalSuratTeks,
  type KepsekLetterSettings, type KepsekPerson,
} from '@/lib/suratTugasKepsek';

export interface KepsekLetterData {
  nomor: string;
  /** yyyy-MM-dd */
  tanggal: string;
  /** Maksud tugas, dari isian "Deskripsi Tugas". */
  maksud: string;
  lokasi: string;
  mulai: string;
  selesai: string;
  pelaksana: KepsekPerson[];
}

const ML = 20; // margin kiri/kanan (mm)
const FONT = 'times';

/** Logo (data URL PNG) dari berkas aset; null bila gagal dimuat (surat tetap tercetak tanpa logo). */
export async function loadKabLogo(): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(logoKabCiamis)).blob();
    const data: string = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
    const dim: { w: number; h: number } = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => rej(new Error('logo'));
      img.src = data;
    });
    return { data, ...dim };
  } catch {
    return null;
  }
}

export function buildKepsekLetterPdf(
  d: KepsekLetterData,
  cfg: KepsekLetterSettings,
  logo: { data: string; w: number; h: number } | null,
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [210, 330] });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const center = W / 2;
  const right = W - ML;

  // --- Kop Dinas
  if (logo) {
    const h = 24;
    doc.addImage(logo.data, 'PNG', ML, 14, (logo.w / logo.h) * h, h);
  }
  doc.setFont(FONT, 'normal').setFontSize(13);
  doc.text(cfg.kop1, center + 6, 21, { align: 'center' });
  doc.setFont(FONT, 'bold').setFontSize(16);
  doc.text(cfg.kop2, center + 6, 28, { align: 'center' });
  doc.setFont(FONT, 'normal').setFontSize(11);
  doc.text(cfg.kop3, center + 6, 34, { align: 'center' });
  doc.setLineWidth(0.9).line(ML, 40.5, right, 40.5);
  doc.setLineWidth(0.2);

  // --- Judul dan nomor
  let y = 51;
  doc.setFont(FONT, 'bold').setFontSize(13);
  doc.text('SURAT TUGAS', center, y, { align: 'center' });
  const tw = doc.getTextWidth('SURAT TUGAS');
  doc.setLineWidth(0.3).line(center - tw / 2, y + 1, center + tw / 2, y + 1);
  y += 5.5;
  doc.setFont(FONT, 'normal').setFontSize(11);
  doc.text(`Nomor : ${d.nomor}`, center, y, { align: 'center' });

  doc.setFontSize(11);
  const LBL = ML;
  const COLON = ML + 30;
  const VAL = ML + 35;
  const LH = 5.6;
  const orang = (p: KepsekPerson, y0: number, nomor?: number) => {
    let yy = y0;
    const baris: [string, string][] = [['Nama', p.nama], ['NIP', p.nip], ['Pangkat / Gol', p.pangkat], ['Jabatan', p.jabatan]];
    for (const [l, v] of baris) {
      if (nomor && l === 'Nama') doc.text(`${nomor}.`, LBL - 6, yy);
      doc.text(l, LBL, yy);
      doc.text(':', COLON, yy);
      doc.text(v, VAL, yy);
      yy += LH;
    }
    return yy;
  };

  // --- Pejabat yang menugaskan
  y += 14;
  doc.text('Yang bertanda tangan di bawah ini :', LBL, y);
  y += 8;
  y = orang({ nama: cfg.penerbit_nama || '-', nip: cfg.penerbit_nip || '-', pangkat: cfg.penerbit_pangkat || '-', jabatan: cfg.penerbit_jabatan }, y);

  // --- Yang ditugaskan
  y += 4;
  doc.text('Menugaskan kepada :', LBL, y);
  y += 11;
  d.pelaksana.forEach((p, i) => {
    if (i > 0) y += 3;
    y = orang(p, y, d.pelaksana.length > 1 ? i + 1 : undefined);
  });

  // --- Untuk
  y += 3;
  doc.text('Untuk', LBL, y);
  doc.text(':', COLON, y);
  const NUM = VAL;
  const TXT = VAL + 6;
  const lebar = right - TXT;
  const item = (no: number, teks: string) => {
    const baris = doc.splitTextToSize(teks, lebar) as string[];
    doc.text(`${no}.`, NUM, y);
    doc.text(baris, TXT, y);
    y += baris.length * 5 + 1;
  };
  item(1, d.maksud.trim() || '-');
  item(2, rentangTanggalTeks(d.mulai, d.selesai));
  item(3, lokasiTeks(d.lokasi));

  // --- Tanda tangan (pindah halaman bila tidak muat)
  y += 8;
  const BLOK = 52;
  if (y + BLOK > H - 15) { doc.addPage(); y = 25; }
  const sx = 108;
  doc.text(`${cfg.tempat}, ${tanggalSuratTeks(d.tanggal)}`, sx, y);
  y += 5;
  doc.text(cfg.penerbit_jabatan, sx, y);
  y += 26;
  doc.text(cfg.penerbit_nama || '-', sx, y);
  y += 5;
  doc.text(`Pangkat. ${cfg.penerbit_pangkat || '-'}`, sx, y);
  y += 5;
  doc.text(`NIP. ${cfg.penerbit_nip || '-'}`, sx, y);

  return doc;
}
