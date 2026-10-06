import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { addLetterheadToPDF, type LetterheadSettings } from '@/lib/pdfLetterhead';
import { paperFormat, type PdfPaper } from '@/lib/pdfPaper';

export interface EkskulPdfJournal {
  id: string;
  meeting_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  activity_description: string;
  location: string | null;
  evaluation: string | null;
  students_present: number;
  students_absent: number;
}

export interface EkskulPdfPhoto {
  journal_id: string;
  url: string;
}

export interface EkskulSigner {
  name: string;
  nip?: string | null;
  nuptk?: string | null;
  pangkat_golongan?: string | null;
}

export interface EkskulJournalPdfInput {
  schoolSettings: (LetterheadSettings & { academic_year?: string | null }) | null;
  ekskulName: string;
  periodLabel: string;
  journals: EkskulPdfJournal[];
  /** Foto per jurnal; hanya dipakai jika includePhotos true. */
  photos?: EkskulPdfPhoto[];
  includePhotos: boolean;
  /** Pembina dari extracurricular_instructors */
  instructor: EkskulSigner | null;
  /** Wakasek Kesiswaan (mengetahui) */
  wakasek: EkskulSigner | null;
  /** Tempat penandatanganan, mis. "Ciamis" */
  place: string;
  printDate: Date;
  /** Ukuran kertas, default A4 */
  paper?: PdfPaper;
}

const trimTime = (t: string | null) => (t ? t.slice(0, 5) : '');

const signerIdLine = (s: EkskulSigner | null): string => {
  if (!s) return '';
  if (s.nip) return `NIP. ${s.nip}`;
  if (s.nuptk) return `NUPTK. ${s.nuptk}`;
  return '';
};

interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Muat gambar (signed URL) dan perkecil agar PDF tidak membengkak. */
const loadPhoto = (url: string, maxSide = 900, quality = 0.72): Promise<LoadedImage | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * ratio));
        const h = Math.max(1, Math.round(img.naturalHeight * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), width: w, height: h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

/**
 * Membuat PDF Jurnal Ekstrakurikuler (kop sekolah, tabel pertemuan,
 * tanda tangan Wakasek Kesiswaan & Pembina, lampiran foto opsional).
 */
export async function generateEkskulJournalPdf(input: EkskulJournalPdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: paperFormat(input.paper ?? 'a4') });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ---- Kop sekolah ---------------------------------------------------------
  let y = await addLetterheadToPDF(doc, input.schoolSettings);

  // ---- Judul & identitas ---------------------------------------------------
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('JURNAL KEGIATAN EKSTRAKURIKULER', pageW / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(10);
  const info: Array<[string, string]> = [
    ['Ekstrakurikuler', input.ekskulName],
    ['Pembina', input.instructor?.name || '-'],
    ['Periode', input.periodLabel],
  ];
  if (input.schoolSettings?.academic_year) info.push(['Tahun Pelajaran', input.schoolSettings.academic_year]);
  info.push(['Jumlah Pertemuan', String(input.journals.length)]);

  info.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.text(label, margin, y);
    doc.text(':', margin + 38, y);
    doc.setFont('helvetica', 'bold');
    doc.text(value, margin + 42, y);
    y += 5.5;
  });
  y += 2;

  // ---- Tabel jurnal --------------------------------------------------------
  const body = input.journals.map((j, i) => {
    const time = j.start_time ? `${trimTime(j.start_time)}${j.end_time ? ` - ${trimTime(j.end_time)}` : ''}` : '';
    const dateLabel = format(new Date(`${j.meeting_date}T00:00:00`), 'EEEE\nd MMM yyyy', { locale: idLocale });
    const detail = [
      j.activity_description,
      j.location ? `Lokasi: ${j.location}` : '',
      j.evaluation ? `Evaluasi: ${j.evaluation}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return [String(i + 1), time ? `${dateLabel}\n${time}` : dateLabel, j.title, detail, String(j.students_present), String(j.students_absent)];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 18 },
    head: [['No', 'Hari / Tanggal', 'Materi', 'Uraian Kegiatan', 'Hadir', 'Tidak\nHadir']],
    body: body.length ? body : [['', '', 'Belum ada pertemuan pada periode ini', '', '', '']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, valign: 'top', lineColor: [60, 60, 60], lineWidth: 0.2, textColor: 20 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold', halign: 'center', valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 29 },
      2: { cellWidth: 34, fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 14, halign: 'center' },
    },
  });

  // ---- Tanda tangan --------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let signY = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
  const signBlockHeight = 52;
  if (signY + signBlockHeight > pageH - 12) {
    doc.addPage();
    signY = 22;
  }

  const leftX = margin + 50;
  const rightX = pageW - margin - 50;
  const dateStr = format(input.printDate, 'd MMMM yyyy', { locale: idLocale });
  const placeDate = input.place.trim() ? `${input.place.trim()}, ${dateStr}` : dateStr;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(placeDate, rightX, signY, { align: 'center' });
  doc.text('Mengetahui,', leftX, signY + 5.5, { align: 'center' });
  doc.text('Wakil Kepala Sekolah Bidang Kesiswaan,', leftX, signY + 10.5, { align: 'center' });
  doc.text(`Pembina ${input.ekskulName},`, rightX, signY + 10.5, { align: 'center', maxWidth: 80 });

  const nameY = signY + 38;
  const drawSigner = (signer: EkskulSigner | null, x: number) => {
    const name = signer?.name?.trim() || '(................................)';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(name, x, nameY, { align: 'center' });
    if (signer?.name) {
      const w = doc.getTextWidth(name);
      doc.setLineWidth(0.3);
      doc.line(x - w / 2, nameY + 0.8, x + w / 2, nameY + 0.8);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const idLine = signerIdLine(signer);
    if (idLine) doc.text(idLine, x, nameY + 5, { align: 'center' });
  };
  drawSigner(input.wakasek, leftX);
  drawSigner(input.instructor, rightX);

  // ---- Lampiran foto -------------------------------------------------------
  // Foto dijaga proporsinya (contain), tiap baris dipusatkan di tengah kertas,
  // dan blok foto per halaman dipusatkan secara vertikal.
  const photosByJournal = new Map<string, string[]>();
  (input.photos ?? []).forEach((p) => {
    photosByJournal.set(p.journal_id, [...(photosByJournal.get(p.journal_id) ?? []), p.url]);
  });

  if (input.includePhotos && photosByJournal.size > 0) {
    // Muat semua foto lebih dulu (paralel terbatas) agar rasio tiap foto diketahui
    const allUrls = Array.from(photosByJournal.values()).flat();
    const loaded = new Map<string, LoadedImage | null>();
    for (let i = 0; i < allUrls.length; i += 6) {
      await Promise.all(
        allUrls.slice(i, i + 6).map(async (u) => {
          loaded.set(u, await loadPhoto(u));
        }),
      );
    }

    const cols = 3;
    const gap = 5;
    const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.75;
    const headingH = 11;
    const rowStep = cellH + gap;
    const areaTop = 31;
    const areaBottom = pageH - 14;
    const avail = areaBottom - areaTop;

    type PhotoItem =
      | { kind: 'heading'; text: string; cont: boolean }
      | { kind: 'row'; urls: string[] };
    const pages: PhotoItem[][] = [[]];
    let used = 0;
    const newPage = () => {
      pages.push([]);
      used = 0;
    };

    input.journals.forEach((j, idx) => {
      const urls = photosByJournal.get(j.id);
      if (!urls || urls.length === 0) return;
      const title = `${idx + 1}. ${format(new Date(`${j.meeting_date}T00:00:00`), 'EEEE, d MMMM yyyy', { locale: idLocale })} — ${j.title}`;

      // Judul pertemuan harus ikut bersama minimal satu baris foto
      if (used + headingH + cellH > avail && pages[pages.length - 1].length) newPage();
      pages[pages.length - 1].push({ kind: 'heading', text: title, cont: false });
      used += headingH;

      for (let i = 0; i < urls.length; i += cols) {
        if (used + cellH > avail) {
          newPage();
          pages[pages.length - 1].push({ kind: 'heading', text: j.title, cont: true });
          used += headingH;
        }
        pages[pages.length - 1].push({ kind: 'row', urls: urls.slice(i, i + cols) });
        used += rowStep;
      }
    });

    pages
      .filter((items) => items.length > 0)
      .forEach((items) => {
        doc.addPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text('LAMPIRAN DOKUMENTASI KEGIATAN', pageW / 2, 18, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`${input.ekskulName} · ${input.periodLabel}`, pageW / 2, 23.5, { align: 'center' });

        const contentH = items.reduce((sum, it) => sum + (it.kind === 'heading' ? headingH : rowStep), 0) - gap;
        let py = areaTop + Math.max(0, (avail - contentH) / 2);

        items.forEach((it) => {
          if (it.kind === 'heading') {
            doc.setFont('helvetica', it.cont ? 'italic' : 'bold');
            doc.setFontSize(it.cont ? 8.5 : 9.5);
            const label = it.cont ? `(lanjutan) ${it.text}` : it.text;
            doc.text(doc.splitTextToSize(label, pageW - margin * 2)[0], pageW / 2, py + 4, { align: 'center' });
            py += headingH;
            return;
          }

          // Baris dipusatkan di tengah kertas (baris terakhir yang tidak penuh tetap di tengah)
          const rowW = it.urls.length * cellW + (it.urls.length - 1) * gap;
          const startX = (pageW - rowW) / 2;
          it.urls.forEach((url, i) => {
            const x = startX + i * (cellW + gap);
            doc.setDrawColor(190);
            doc.setLineWidth(0.2);
            doc.rect(x, py, cellW, cellH);
            const img = loaded.get(url);
            if (img) {
              const pad = 1;
              const scale = Math.min((cellW - pad * 2) / img.width, (cellH - pad * 2) / img.height);
              const w = img.width * scale;
              const h = img.height * scale;
              doc.addImage(img.dataUrl, 'JPEG', x + (cellW - w) / 2, py + (cellH - h) / 2, w, h);
            } else {
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(8);
              doc.text('Foto tidak dapat dimuat', x + cellW / 2, py + cellH / 2, { align: 'center' });
            }
          });
          py += rowStep;
        });
      });
  }

  // ---- Nomor halaman -------------------------------------------------------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Halaman ${p} dari ${total}`, pageW - margin, pageH - 7, { align: 'right' });
    doc.setTextColor(0);
  }

  return doc;
}

/** Tebak nama tempat dari nama kabupaten/kota di kop (mis. "PEMERINTAH KABUPATEN CIAMIS" -> "Ciamis"). */
export function guessPlaceFromDistrict(districtName?: string | null): string {
  if (!districtName) return '';
  const m = districtName.match(/(?:KABUPATEN|KAB\.?|KOTA)\s+(.+)$/i);
  if (!m) return '';
  return m[1]
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
