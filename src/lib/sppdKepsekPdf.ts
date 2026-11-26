// Paket SPPD Kepala Sekolah/Plt (mengikuti berkas contoh SPPD_KEPSEK, kertas F4):
//   1. Surat Tugas format Dinas  2. SPD (depan)  3. SPD (belakang, Kabid mengisi I dan VI)  4. LPT per pelaksana.
// Satu implementasi dipakai oleh halaman SPD (unduh) dan dialog pratinjau SPD.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';
import { toTitleCase } from '@/lib/utils';
import {
  isKepsekExecutor, kepsekPerson,
  type HeadmasterInfo, type KepsekLetterSettings, type KepsekPerson,
} from '@/lib/suratTugasKepsek';
import { drawKepsekLetter, loadKabLogo, type KepsekLetterData } from '@/lib/suratTugasKepsekPdf';

export interface SppdExecutor {
  name: string;
  nip: string;
  pangkat: string;
  jabatan: string;
  /** Keterangan pada kolom Pengikut bila bukan pelaksana utama. */
  ket: string;
}

export interface SppdKepsekInput {
  travel: {
    letter_number: string;
    letter_date?: string | null;
    purpose: string;
    destination: string;
    transportation?: string | null;
    departure_date: string;
    return_date: string;
    notes?: string | null;
  };
  /** Baris school_settings (kop surat, nama sekolah, kepala sekolah). */
  schoolSettings: any;
  cfg: KepsekLetterSettings;
  /** Urut sama dengan surat tugas; yang pertama = pelaksana utama. */
  executors: SppdExecutor[];
  /** Siswa pengikut: nama dan keterangan. */
  students?: { name: string; ket: string }[];
  fonts?: { title?: number; body?: number; table?: number; signature?: number };
  /** Data surat tugas Dinas untuk halaman pertama; null = tanpa halaman surat tugas. */
  surat?: Omit<KepsekLetterData, 'pelaksana'> | null;
}

const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];
const FONT = 'times';
const ML = 14;

const KATA = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh',
  'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas', 'dua puluh',
  'dua puluh satu', 'dua puluh dua', 'dua puluh tiga', 'dua puluh empat', 'dua puluh lima', 'dua puluh enam', 'dua puluh tujuh', 'dua puluh delapan', 'dua puluh sembilan', 'tiga puluh'];
const kata = (n: number) => KATA[n] ?? String(n);

/** Pelaksana (guru lalu pelaksana manual) dari satu SPD, urut sama dengan surat tugas. */
export function collectSppdExecutors(travel: any): SppdExecutor[] {
  const guru = [...(travel?.official_travel_teachers || [])].map((tt: any) => ({
    name: tt.teachers?.profiles?.full_name || '-',
    nip: tt.teachers?.nip || '-',
    pangkat: tt.teachers?.pangkat_golongan || '-',
    jabatan: tt.teachers?.jabatan || '-',
    ket: `Guru - NIP. ${tt.teachers?.nip || '-'}`,
    order_index: tt.order_index ?? 0,
  }));
  const manual = (travel?.official_travel_followers || [])
    .filter((f: any) => f.follower_type === 'manual_executor')
    .map((f: any) => {
      const jab = f.manual_executor?.jabatan || f.manual_executor_jabatan || '-';
      const nip = f.manual_executor?.nip || f.manual_executor_nip || '-';
      return {
        name: f.manual_executor?.full_name || f.manual_executor_name || '-',
        nip,
        pangkat: f.manual_executor?.pangkat_golongan || f.manual_executor_pangkat || '-',
        jabatan: jab,
        ket: `${jab} - NIP. ${nip}`,
        order_index: f.order_index ?? 0,
      };
    });
  return [...guru, ...manual]
    .sort((a, b) => a.order_index - b.order_index)
    .map(({ order_index: _o, ...rest }) => rest);
}

/** Siswa pengikut dari satu SPD. */
export function collectSppdStudents(travel: any): { name: string; ket: string }[] {
  return (travel?.official_travel_followers || [])
    .filter((f: any) => f.follower_type === 'student')
    .sort((a: any, b: any) => (a.order_index ?? 9999) - (b.order_index ?? 9999))
    .map((f: any) => ({
      name: toTitleCase(f.students?.full_name) || '-',
      ket: `Siswa - NIS. ${f.students?.nis || '-'}${f.students?.class_name ? ` (${f.students.class_name})` : ''}`,
    }));
}

const hmFrom = (s: any): HeadmasterInfo => ({
  name: s?.headmaster_name, nip: s?.headmaster_nip, position: s?.headmaster_position,
});

/** True bila pelaksana utama (urutan pertama) adalah kepala sekolah/Plt. */
export function isKepsekSppd(executors: SppdExecutor[], schoolSettings: any): boolean {
  const main = executors[0];
  if (!main) return false;
  return isKepsekExecutor({ full_name: main.name, nip: main.nip, jabatan: main.jabatan }, hmFrom(schoolSettings));
}

/** Golongan saja ("IV/b") dari teks pangkat seperti "Pembina Tk.1, IV/b"; bila tidak ada, teks apa adanya. */
export const golonganSaja = (pangkat: string): string => {
  const m = /\b(IV|III|II|I)\s*\/\s*[a-e]\b/i.exec(pangkat || '');
  return m ? m[0].replace(/\s+/g, '') : pangkat || '-';
};

export async function buildSppdKepsekPdf(inp: SppdKepsekInput): Promise<jsPDF> {
  const { travel, schoolSettings: ss, cfg } = inp;
  const fTitle = inp.fonts?.title ?? 12;
  const fBody = inp.fonts?.body ?? 10;
  const fTable = (inp.fonts?.table ?? 9) + 1;
  const fSign = inp.fonts?.signature ?? 10;

  const hm = hmFrom(ss);
  const schoolName: string = ss?.school_name || '';
  const city: string = ss?.city || cfg.tempat || 'Ciamis';
  const dep = parseISO(travel.departure_date);
  const ret = parseISO(travel.return_date);
  const hari = Math.max(1, differenceInCalendarDays(ret, dep) + 1);
  const dFmt = (d: Date) => format(d, 'dd MMMM yyyy', { locale: idLocale });
  const tglSurat = travel.letter_date ? dFmt(parseISO(travel.letter_date)) : dFmt(dep);

  const orang = (e: SppdExecutor): KepsekPerson =>
    kepsekPerson({ full_name: e.name, nip: e.nip, jabatan: e.jabatan, pangkat_golongan: e.pangkat }, hm, cfg.kepsek_pangkat);
  const isKep = (e: SppdExecutor) => isKepsekExecutor({ full_name: e.name, nip: e.nip, jabatan: e.jabatan }, hm);

  const main = orang(inp.executors[0]);
  const kabid = {
    nama: cfg.penerbit_nama || '-',
    nip: cfg.penerbit_nip || '-',
    jabatan: cfg.penerbit_jabatan || 'Kepala Bidang Pembinaan SMP',
  };

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [210, 330] });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setTextColor(...BLACK);
  doc.setDrawColor(...BLACK);

  // ===== Halaman 1: Surat Tugas Dinas (semua pelaksana berstatus kepsek/Plt) =====
  if (inp.surat) {
    const pelaksana = inp.executors.filter(isKep).map(orang);
    const logo = await loadKabLogo();
    drawKepsekLetter(doc, { ...inp.surat, pelaksana: pelaksana.length ? pelaksana : [main] }, cfg, logo);
    doc.addPage();
  }

  // ===== SPD depan =====
  let y = 15;
  if (ss) y = await addLetterheadToPDF(doc, ss);
  doc.setTextColor(...BLACK);
  doc.setDrawColor(...BLACK);

  y += 5;
  doc.setFont(FONT, 'normal').setFontSize(fBody + 1);
  const hx = W - 85;
  doc.text('Lembar ke', hx, y);
  doc.text(': ..............................', hx + 22, y);
  y += 5;
  doc.text('Kode No.', hx, y);
  doc.text(': ..............................', hx + 22, y);
  y += 5;
  doc.text('Nomor', hx, y);
  doc.text(`: ${travel.letter_number}`, hx + 22, y);

  y += 10;
  doc.setFont(FONT, 'bold').setFontSize(fTitle + 1);
  doc.text('SURAT PERJALANAN DINAS (SPD)', W / 2, y, { align: 'center' });
  const tw = doc.getTextWidth('SURAT PERJALANAN DINAS (SPD)');
  doc.setLineWidth(0.4).line(W / 2 - tw / 2, y + 1, W / 2 + tw / 2, y + 1);
  doc.setLineWidth(0.2);

  const jabatanInstansi = /\//.test(main.jabatan) || (schoolName && main.jabatan.toLowerCase().includes(schoolName.toLowerCase()))
    ? main.jabatan
    : `${main.jabatan}${schoolName ? `/${schoolName}` : ''}`;
  const alat = (travel.transportation || '').trim() || cfg.spd_alat_angkut || 'Kendaraan Umum';
  const biaya = cfg.spd_tingkat_biaya || 'BOS';

  const gaya = (size: number, pad: number, valign: 'top' | 'middle' = 'top') => ({
    font: FONT, fontSize: size, cellPadding: pad, lineColor: BLACK, lineWidth: 0.2, valign,
    textColor: BLACK, fillColor: WHITE,
  });
  const kolom = { 0: { cellWidth: 10, halign: 'center' as const }, 1: { cellWidth: 55 }, 2: { cellWidth: W - 2 * ML - 65 } };

  y += 8;
  autoTable(doc, {
    startY: y,
    head: [],
    body: [
      ['1.', 'Pejabat Pembuat Komitmen', `Kepala ${schoolName || '-'}`],
      ['2.', 'Nama/NIP Pegawai yang\nmelaksanakan perjalanan dinas', `${toTitleCase(main.nama) || main.nama}\nNIP. ${main.nip}`],
      ['3.', 'a. Pangkat dan Golongan\nb. Jabatan/Instansi\nc. Tingkat Biaya Perjalanan Dinas', `a. ${golonganSaja(main.pangkat)}\nb. ${jabatanInstansi}\nc. ${biaya}`],
      ['4.', 'Maksud Perjalanan Dinas', travel.purpose],
      ['5.', 'Alat angkut yang dipergunakan', alat],
      ['6.', 'a. Tempat Berangkat\nb. Tempat Tujuan', `a. ${schoolName || '-'}\nb. ${travel.destination}`],
      ['7.', 'a. Lamanya Perjalanan Dinas\nb. Tanggal Berangkat\nc. Tanggal harus kembali/\n    tiba di tempat baru', `a. ${hari} (${kata(hari)}) hari\nb. ${dFmt(dep)}\nc. ${dFmt(ret)}`],
    ],
    styles: gaya(fTable, 3),
    columnStyles: kolom,
    theme: 'grid',
    margin: { left: ML, right: ML },
  });
  y = (doc as any).lastAutoTable.finalY;

  const pengikut = [
    ...inp.executors.slice(1).map((e) => [toTitleCase(e.name) || e.name, '', e.ket]),
    ...(inp.students || []).map((s) => [s.name, '', s.ket]),
  ];
  if (pengikut.length === 0) pengikut.push(['', '', '']);
  autoTable(doc, {
    startY: y,
    head: [],
    body: [
      [{ content: '8.', rowSpan: pengikut.length + 1 }, { content: 'Pengikut', rowSpan: pengikut.length + 1 }, 'Nama', 'Tanggal Lahir', 'Keterangan'],
      ...pengikut,
    ] as any,
    styles: gaya(fTable - 1, 2, 'middle'),
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 45 },
      3: { cellWidth: 28 },
      4: { cellWidth: W - 2 * ML - 65 - 45 - 28 },
    },
    theme: 'grid',
    margin: { left: ML, right: ML },
  });
  y = (doc as any).lastAutoTable.finalY;

  autoTable(doc, {
    startY: y,
    head: [],
    body: [
      ['9.', 'Pembebanan Anggaran\na. Instansi\nb. Akun', `a. ${schoolName || '-'}\nb. ..............................`],
      ['10.', 'Keterangan lain-lain', travel.notes || ''],
    ],
    styles: gaya(fTable, 2),
    columnStyles: kolom,
    theme: 'grid',
    margin: { left: ML, right: ML },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // TTD PPK = kepala sekolah/Plt (pindah halaman bila tidak muat)
  if (y + 50 > H - 10) { doc.addPage(); y = 20; }
  const sx = W - 85;
  doc.setFont(FONT, 'normal').setFontSize(fSign + 1);
  doc.text(`Dikeluarkan di : ${city}`, sx, y);
  y += 4.5;
  doc.text(`Tanggal : ${tglSurat}`, sx, y);
  y += 4.5;
  doc.text('Pejabat Pembuat Komitmen', sx, y);
  y += 25;
  doc.setFont(FONT, 'bold');
  doc.text(main.nama, sx, y);
  doc.setFont(FONT, 'normal');
  y += 4.5;
  doc.text(`NIP. ${main.nip}`, sx, y);

  // ===== SPD belakang: Kabid Pembinaan SMP mengisi I dan VI =====
  doc.addPage();
  y = 15;
  const col1X = ML;
  const col2X = W / 2;
  const colW = (W - 2 * ML) / 2;
  const tblW = W - 2 * ML;
  const numW = 12;
  doc.setLineWidth(0.2);
  doc.setFont(FONT, 'normal').setFontSize(fBody + 1);

  const kabidBlok = (x: number, top: number, ySig: number) => {
    doc.setFontSize(fSign);
    doc.setFont(FONT, 'bold');
    doc.text(kabid.nama, x, top + ySig);
    doc.setFont(FONT, 'normal');
    doc.text(`NIP. ${kabid.nip}`, x, top + ySig + 5);
  };

  // Menulis pasangan label/nilai; nilai yang panjang dibungkus ke baris berikutnya. Mengembalikan y berikutnya.
  const kv = (x: number, vx: number, yy: number, rows: [string, string][], maxW: number, lh: number) => {
    for (const [label, val] of rows) {
      doc.text(label, x, yy);
      const baris = doc.splitTextToSize(`: ${val}`, maxW) as string[];
      baris.forEach((l, i) => doc.text(i === 0 ? l : `  ${l.replace(/^:\s*/, '')}`, vx, yy + i * lh));
      yy += Math.max(1, baris.length) * lh;
    }
    return yy;
  };

  // I (kolom kanan, kolom kiri kosong)
  const h1 = 48;
  doc.rect(col1X, y, colW, h1);
  doc.rect(col2X, y, colW, h1);
  const lx = col2X + 10;
  const vx = col2X + 42;
  doc.setFontSize(fBody + 1);
  doc.text('I.', col2X + 3, y + 6);
  let iy = kv(lx, vx, y + 6, [['Berangkat Dari', schoolName]], col2X + colW - vx - 2, 4.8);
  doc.text('(tempat kedudukan)', lx, iy - 0.3);
  iy = kv(lx, vx, iy + 4.5, [['Ke', travel.destination], ['Pada Tanggal', dFmt(dep)]], col2X + colW - vx - 2, 4.8);
  doc.text(kabid.jabatan, lx, iy + 0.7);
  kabidBlok(lx, y, 38);
  y += h1;

  // II – V: kosong (diisi di tempat tujuan)
  const rowH = 34;
  const h6 = 44;
  const totalH = 4 * rowH + h6;
  doc.rect(col1X, y, tblW, totalH);
  doc.line(col2X, y, col2X, y + totalH);
  let ly = y;
  for (let i = 0; i < 4; i++) { ly += rowH; doc.line(col1X, ly, col1X + tblW, ly); }

  const lLab = col1X + numW + 2;
  const lVal = col1X + 38;
  const rLab = col2X + 3;
  const rVal = col2X + 38;
  const ttd = '(..............................................)';
  const titik = '.................................';
  const LH2 = 4;
  doc.setFontSize(fTable - 1);

  let ry = y;
  (['II', 'III', 'IV', 'V'] as const).forEach((no, i) => {
    const isi = i === 0; // II terisi: tiba di tempat tujuan, dan berangkat kembali
    doc.text(`${no}.`, col1X + 3, ry + 5);
    kv(lLab, lVal, ry + 5, [
      ['Tiba di', isi ? travel.destination : titik],
      ['Pada Tanggal', isi ? dFmt(dep) : titik],
      ['Kepala', titik],
    ], col2X - lVal - 2, LH2);
    doc.text(ttd, lLab, ry + rowH - 8);
    doc.text('NIP.', lLab, ry + rowH - 3.5);

    kv(rLab, rVal, ry + 5, [
      ['Berangkat Dari', isi ? travel.destination : titik],
      ['Ke', isi ? schoolName : titik],
      ['Pada Tanggal', isi ? dFmt(ret) : titik],
      ['Kepala', titik],
    ], col2X + colW - rVal - 2, LH2);
    doc.text(ttd, rLab, ry + rowH - 8);
    doc.text('NIP.', rLab, ry + rowH - 3.5);
    ry += rowH;
  });

  // VI: tiba kembali di sekolah, disahkan Kabid
  doc.setFontSize(fBody + 1);
  doc.text('VI.', col1X + 3, ry + 6);
  let vy = kv(lLab, lVal, ry + 6, [['Tiba di', schoolName], ['Pada Tanggal', dFmt(ret)]], col2X - lVal - 2, 5);
  doc.text(kabid.jabatan, lLab, vy + 0.5);
  kabidBlok(lLab, ry, 32);
  doc.setFontSize(fTable);
  const catatan = doc.splitTextToSize(
    'Telah diperiksa, dengan keterangan bahwa perjalanan tersebut diatas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan dalam kurun waktu yang sesingkat-singkatnya',
    colW - 10,
  );
  doc.text(catatan, rLab, ry + 8);
  y = ry + h6;

  doc.setFontSize(fBody + 1);
  doc.rect(col1X, y, tblW, 12);
  doc.text('VII.    Catatan Lain-lain', col1X + 3, y + 8);
  y += 12;
  doc.rect(col1X, y, tblW, 24);
  doc.setFontSize(fTable - 1);
  doc.text('VIII.   PERHATIAN:', col1X + 3, y + 6);
  doc.text(doc.splitTextToSize(
    'PPK yang menerbitkan SPD, pegawai yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba, serta bendahara pengeluaran bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara apabila negara menderita rugi akibat kesalahan, kelalaian, dan kealpaannya.',
    tblW - 10,
  ), col1X + 3, y + 11);
  y += 24 + 6;

  // Muat satu halaman F4; hanya pindah halaman bila benar-benar tidak muat (TTD tidak boleh terpotong)
  if (y + 32 > H - 4) { doc.addPage(); y = 20; }
  doc.setFontSize(fSign + 1);
  doc.text('Pejabat Pembuat Komitmen', W - 70, y, { align: 'center' });
  y += 25;
  doc.setFont(FONT, 'bold');
  doc.text(main.nama, W - 70, y, { align: 'center' });
  doc.setFont(FONT, 'normal');
  y += 4.5;
  doc.text(`NIP. ${main.nip}`, W - 70, y, { align: 'center' });

  // ===== LPT: satu halaman per pelaksana =====
  const titikPenuh = (lebar: number) => {
    let s = '.';
    while (doc.getTextWidth(s) < lebar) s += '.';
    return s;
  };
  const dasar = inp.surat?.nomor ? `Surat Tugas Nomor ${inp.surat.nomor}` : '';
  const tujuan = `Untuk ${travel.purpose}`;

  inp.executors.forEach((e) => {
    const p = orang(e);
    const pelaporKepsek = isKep(e);
    doc.addPage();
    let ly2 = 28;
    doc.setFont(FONT, 'bold').setFontSize(fTitle + 2);
    doc.text('LAPORAN PELAKSANAAN TUGAS', W / 2, ly2, { align: 'center' });
    ly2 += 6;
    doc.text('(L P T)', W / 2, ly2, { align: 'center' });

    const lab = 20;
    const col = 62;
    const val = 66;
    const lebar = W - ML - val - 6;
    const garis = titikPenuh(lebar);
    const LH = 7;
    doc.setFont(FONT, 'normal').setFontSize(fBody + 1);
    let yy = ly2 + 16;

    const baris = (no: string, label: string, isi: string, bold = false) => {
      doc.text(`${no} ${label}`, lab, yy);
      doc.text(':', col, yy);
      doc.setFont(FONT, bold ? 'bold' : 'normal');
      doc.text(isi, val, yy);
      doc.setFont(FONT, 'normal');
      yy += LH + 2;
    };
    const isian = (no: string, label: string, n: number, awal = '') => {
      doc.text(`${no} ${label}`, lab, yy);
      doc.text(':', col, yy);
      const teks = awal ? (doc.splitTextToSize(awal, lebar) as string[]) : [];
      for (let i = 0; i < n; i++) {
        if (teks[i]) doc.text(teks[i], val, yy + i * LH);
        else doc.text(garis, val, yy + i * LH);
      }
      yy += Math.max(n, teks.length) * LH + 4;
    };

    baris('1.', 'Nama', p.nama, true);
    baris('2.', 'NIP', p.nip);
    isian('3.', 'Dasar', 2, dasar);
    isian('4.', 'Tujuan', 2, tujuan);
    doc.text('5. Waktu', lab, yy);
    doc.text(':', col, yy);
    doc.text('a. Berangkat', val, yy);
    doc.text(':', val + 28, yy);
    doc.text(dFmt(dep), val + 31, yy);
    yy += LH + 1;
    doc.text('b. Kembali', val, yy);
    doc.text(':', val + 28, yy);
    doc.text(dFmt(ret), val + 31, yy);
    yy += LH + 3;
    isian('6.', 'Sasaran', 3);
    isian('7.', 'Hasil yang dicapai', 4);
    isian('8.', 'Kesimpulan', 3);
    isian('9.', 'Saran', 3);

    // Tanda tangan: kepsek/Plt dilaporkan ke Kabid; guru diketahui kepala sekolah
    yy += 6;
    if (yy + 45 > H - 10) { doc.addPage(); yy = 25; }
    const lx2 = 28;
    const rx2 = W / 2 + 18;
    const mengetahui = pelaporKepsek
      ? { jabatan: kabid.jabatan, nama: kabid.nama, nip: kabid.nip }
      : { jabatan: `Kepala ${schoolName}`, nama: main.nama, nip: main.nip };
    doc.text(`${city}, ${dFmt(ret)}`, rx2, yy);
    yy += 5;
    doc.text('Mengetahui :', lx2, yy);
    doc.text('Pelapor,', rx2, yy);
    yy += 5;
    doc.text(mengetahui.jabatan, lx2, yy);
    yy += 28;
    doc.setFont(FONT, 'bold');
    doc.text(mengetahui.nama, lx2, yy);
    doc.text(p.nama, rx2, yy);
    doc.setFont(FONT, 'normal');
    yy += 5;
    doc.text(`NIP. ${mengetahui.nip}`, lx2, yy);
    doc.text(`NIP. ${p.nip}`, rx2, yy);
  });

  return doc;
}
