import jsPDF from 'jspdf';
import QRCode from 'qrcode';

export interface LetterheadSettings {
  school_name: string;
  district_name?: string;
  district_font_size?: number;
  district_font_style?: string;
  district_line_spacing?: number;
  school_address?: string;
  school_phone?: string;
  logo_url?: string;
  logo_width?: number;
  logo_height?: number;
  logo_position_x?: number;
  logo_position_y?: number;
  right_logo_url?: string;
  right_logo_width?: number;
  right_logo_height?: number;
  right_logo_position_x?: number;
  right_logo_position_y?: number;
  header_font_size?: number;
  header_font_style?: string;
  school_line_spacing?: number;
  subheader_font_size?: number;
  show_address?: boolean;
  show_phone?: boolean;
  watermark_url?: string;
  watermark_opacity?: number;
  watermark_size?: number;
  watermark_position?: string;
  watermark_enabled?: boolean;
  headmaster_position?: string;
}

const PT_TO_MM = 0.3528;
const MAX_IMAGE_SIDE = 800; // batasi resolusi agar ukuran PDF tidak membengkak

interface LoadedImage {
  data: string;
  width: number;
  height: number;
}

const imageCache = new Map<string, Promise<LoadedImage>>();

/**
 * Memuat gambar -> PNG base64 beserta ukuran aslinya (untuk menjaga proporsi).
 * Hasil di-cache per URL sehingga tidak dimuat ulang di setiap halaman/ekspor.
 */
const loadImageAsBase64 = (url: string): Promise<LoadedImage> => {
  const cached = imageCache.get(url);
  if (cached) return cached;

  const promise = new Promise<LoadedImage>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      const nw = img.naturalWidth || img.width || 300;
      const nh = img.naturalHeight || img.height || 300;
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(nw, nh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(nw * scale));
      canvas.height = Math.max(1, Math.round(nh * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ data: canvas.toDataURL('image/png'), width: nw, height: nh });
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });

  promise.catch(() => imageCache.delete(url)); // jangan cache kegagalan
  imageCache.set(url, promise);
  return promise;
};

const loadSafe = async (url?: string): Promise<LoadedImage | null> => {
  if (!url) return null;
  try {
    return await loadImageAsBase64(url);
  } catch (error) {
    console.error('Error loading image:', url, error);
    return null;
  }
};

/** Gambar gambar di dalam kotak (x, y, boxW, boxH) dengan proporsi asli, terpusat. */
const drawImageFit = (
  doc: jsPDF,
  img: LoadedImage,
  x: number,
  y: number,
  boxW: number,
  boxH: number
) => {
  const ratio = Math.min(boxW / img.width, boxH / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  doc.addImage(img.data, 'PNG', x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
};

/**
 * Adds watermark to PDF page
 */
export const addWatermarkToPDF = async (
  doc: jsPDF,
  settings?: LetterheadSettings | null
) => {
  if (!settings?.watermark_enabled || !settings?.watermark_url) return;

  try {
    const watermark = await loadImageAsBase64(settings.watermark_url);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const watermarkSize = settings.watermark_size || 100;
    const opacity = (settings.watermark_opacity ?? 10) / 100;

    // Proporsi asli dipertahankan di dalam kotak watermarkSize x watermarkSize
    const ratio = Math.min(watermarkSize / watermark.width, watermarkSize / watermark.height);
    const w = watermark.width * ratio;
    const h = watermark.height * ratio;

    let x = 0;
    let y = 0;
    switch (settings.watermark_position) {
      case 'top-left':
        x = 20;
        y = 20;
        break;
      case 'top-right':
        x = pageWidth - w - 20;
        y = 20;
        break;
      case 'bottom-left':
        x = 20;
        y = pageHeight - h - 20;
        break;
      case 'bottom-right':
        x = pageWidth - w - 20;
        y = pageHeight - h - 20;
        break;
      case 'center':
      default:
        x = (pageWidth - w) / 2;
        y = (pageHeight - h) / 2;
    }

    doc.saveGraphicsState();
    doc.setGState(new (doc as any).GState({ opacity }));
    doc.addImage(watermark.data, 'PNG', x, y, w, h);
    doc.restoreGraphicsState();
  } catch (error) {
    console.error('Error adding watermark:', error);
  }
};

interface TextBlock {
  text: string;
  size: number;
  style: string;
  spacing: number;
  gapAfter: number;
}

/**
 * Adds letterhead (kop surat) to a PDF document
 * @param doc - jsPDF document instance
 * @param settings - School settings for letterhead
 * @returns Promise<number> - Y position where content can start
 *
 * Perbaikan tata letak:
 * - Logo tidak lagi tergepeng: proporsi asli dipertahankan di dalam kotak logo_width x logo_height.
 * - Teks otomatis dibungkus (wrap) dan tidak menabrak logo.
 * - Blok teks diratakan vertikal terhadap logo; garis pemisah berada di bawah elemen terbawah.
 * - Posisi dengan nilai 0 sekarang dihormati (sebelumnya dianggap kosong oleh operator ||).
 * - Warna teks, warna garis, dan ketebalan garis direset agar tidak terpengaruh state sebelumnya.
 */
export const addLetterheadToPDF = async (
  doc: jsPDF,
  settings?: LetterheadSettings | null
): Promise<number> => {
  // Watermark lebih dulu (di belakang konten)
  await addWatermarkToPDF(doc, settings);

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  // A4 portrait / F4 lebarnya 210mm, landscape 297mm
  const isLandscape = pageWidth > 250;
  const margin = isLandscape ? 20 : 14;
  const gap = 4;

  const logoWidth = settings?.logo_width || 20;
  const logoHeight = settings?.logo_height || 20;
  const logoX = settings?.logo_position_x ?? margin;
  const logoY = settings?.logo_position_y ?? 15;

  const rightLogoWidth = settings?.right_logo_width || 20;
  const rightLogoHeight = settings?.right_logo_height || 20;
  // Posisi tersimpan dirancang untuk lebar 210mm; hanya digeser jika kertas lebih lebar (landscape).
  // Hasil dijaga tetap berada di dalam halaman.
  const rightLogoXRaw =
    settings?.right_logo_position_x != null
      ? settings.right_logo_position_x + (pageWidth - 210)
      : pageWidth - margin - rightLogoWidth;
  const rightLogoX = Math.max(margin, Math.min(rightLogoXRaw, pageWidth - 5 - rightLogoWidth));
  const rightLogoY = settings?.right_logo_position_y ?? 15;

  const headerFontSize = settings?.header_font_size || 16;
  const headerFontStyle = settings?.header_font_style || 'bold';
  const subheaderFontSize = settings?.subheader_font_size || 10;
  const districtFontSize = settings?.district_font_size || 12;
  const districtFontStyle = settings?.district_font_style || 'bold';
  const districtLineSpacing = settings?.district_line_spacing || 1.2;
  const schoolLineSpacing = settings?.school_line_spacing || 1.2;
  const showAddress = settings?.show_address !== false;
  const showPhone = settings?.show_phone !== false;

  try {
    const [leftImg, rightImg] = await Promise.all([
      loadSafe(settings?.logo_url),
      loadSafe(settings?.right_logo_url),
    ]);

    if (leftImg) drawImageFit(doc, leftImg, logoX, logoY, logoWidth, logoHeight);
    if (rightImg) drawImageFit(doc, rightImg, rightLogoX, rightLogoY, rightLogoWidth, rightLogoHeight);

    // Rentang vertikal logo (acuan perataan teks & posisi garis)
    const tops: number[] = [];
    const bottoms: number[] = [];
    if (leftImg) {
      tops.push(logoY);
      bottoms.push(logoY + logoHeight);
    }
    if (rightImg) {
      tops.push(rightLogoY);
      bottoms.push(rightLogoY + rightLogoHeight);
    }
    const refTop = tops.length ? Math.min(...tops) : logoY;
    const refBottom = bottoms.length ? Math.max(...bottoms) : logoY;

    // Teks terpusat di halaman, lebar maksimum dibatasi agar tidak menabrak logo
    const leftEdge = leftImg ? logoX + logoWidth + gap : margin;
    const rightEdge = rightImg ? rightLogoX - gap : pageWidth - margin;
    const halfWidth = Math.max(30, Math.min(centerX - leftEdge, rightEdge - centerX));
    const maxTextWidth = halfWidth * 2;

    const blocks: TextBlock[] = [];
    if (settings?.district_name) {
      blocks.push({
        text: settings.district_name.toUpperCase(),
        size: districtFontSize,
        style: districtFontStyle,
        spacing: districtLineSpacing,
        gapAfter: 0.5,
      });
    }
    blocks.push({
      text: (settings?.school_name || 'NAMA SEKOLAH').toUpperCase(),
      size: headerFontSize,
      style: headerFontStyle,
      spacing: schoolLineSpacing,
      gapAfter: 1.5,
    });
    if (showAddress && settings?.school_address) {
      blocks.push({
        text: settings.school_address,
        size: subheaderFontSize,
        style: 'normal',
        spacing: 1.3,
        gapAfter: 0.5,
      });
    }
    if (showPhone && settings?.school_phone) {
      const phone = /^telp/i.test(settings.school_phone.trim())
        ? settings.school_phone.trim()
        : `Telp: ${settings.school_phone}`;
      blocks.push({
        text: phone,
        size: Math.max(6, subheaderFontSize - 1),
        style: 'normal',
        spacing: 1.3,
        gapAfter: 0,
      });
    }

    // Hitung baris hasil wrap dan tinggi blok
    const laidOut = blocks.map((b) => {
      doc.setFont('helvetica', b.style as any);
      doc.setFontSize(b.size);
      const lines: string[] = doc.splitTextToSize(b.text, maxTextWidth);
      const lineH = b.size * PT_TO_MM * b.spacing;
      return { ...b, lines, lineH };
    });
    const blockH = laidOut.reduce(
      (sum, b, i) => sum + b.lines.length * b.lineH + (i < laidOut.length - 1 ? b.gapAfter : 0),
      0
    );

    // Ratakan vertikal terhadap logo (jika teks lebih pendek dari logo)
    let cursor = refTop + Math.max(0, (refBottom - refTop - blockH) / 2);
    const textTop = cursor;

    laidOut.forEach((b) => {
      doc.setFont('helvetica', b.style as any);
      doc.setFontSize(b.size);
      const glyphH = b.size * PT_TO_MM;
      b.lines.forEach((line) => {
        // baseline: setengah selisih leading + tinggi huruf (~0.8 dari ukuran font)
        const baseline = cursor + (b.lineH - glyphH) / 2 + glyphH * 0.8;
        doc.text(line, centerX, baseline, { align: 'center' });
        cursor += b.lineH;
      });
      cursor += b.gapAfter;
    });

    const textBottom = textTop + blockH;
    const contentBottom = Math.max(refBottom, textBottom);

    // Garis pemisah ganda di bawah elemen terbawah
    const lineY = contentBottom + 3;
    doc.setLineWidth(0.6);
    doc.line(margin, lineY, pageWidth - margin, lineY);
    doc.setLineWidth(0.2);
    doc.line(margin, lineY + 1.2, pageWidth - margin, lineY + 1.2);

    // Pulihkan gaya default untuk pemanggil
    doc.setFont('helvetica', 'normal');

    // Y tempat konten boleh dimulai
    return lineY + 6;
  } catch (error) {
    console.error('Error adding letterhead:', error);
    return 30;
  }
};

/**
 * Generates QR code from serial number and adds it to PDF
 */
export const addQRCodeToPDF = async (
  doc: jsPDF,
  serialNumber: string,
  finalY?: number
) => {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(serialNumber, {
      width: 256,
      margin: 1,
      errorCorrectionLevel: 'H',
    });

    const qrSize = 30;
    const qrX = 14;
    const qrY = (finalY ?? 150) + 20;

    doc.addImage(qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    const verifyUrl = `${window.location.origin}/verify`;
    doc.text('Scan untuk verifikasi', qrX, qrY + qrSize + 4);
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(verifyUrl, qrX, qrY + qrSize + 8);
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.text(`No. Seri: ${serialNumber}`, qrX, qrY + qrSize + 11);
  } catch (error) {
    console.error('Error generating QR code:', error);
  } finally {
    // Sebelumnya warna abu-abu terbawa ke teks berikutnya (mis. tanda tangan)
    doc.setTextColor(0, 0, 0);
  }
};

/**
 * Adds signature section to PDF
 */
export const addSignatureToPDF = async (
  doc: jsPDF,
  settings?: LetterheadSettings | null,
  headmasterName?: string,
  headmasterNip?: string,
  finalY?: number,
  serialNumber?: string
) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Pindah halaman jika blok tanda tangan/QR tidak muat
  let baseY = finalY ?? 150;
  if (baseY + 20 + 50 > pageHeight - 10) {
    doc.addPage();
    baseY = 0;
  }

  const signatureY = baseY + 20;
  const signX = pageWidth - 70; // sebelumnya 140 (hardcode untuk lebar 210mm)

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  if (serialNumber) {
    await addQRCodeToPDF(doc, serialNumber, baseY);
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  doc.text('Mengetahui,', signX, signatureY + 10);
  doc.text(settings?.headmaster_position || 'Kepala Sekolah', signX, signatureY + 15);

  // Garis tanda tangan
  doc.line(signX, signatureY + 35, signX + 50, signatureY + 35);

  // Nama kepala sekolah
  doc.setFont('helvetica', 'bold');
  doc.text(headmasterName || 'Nama Kepala Sekolah', signX, signatureY + 40);

  // NIP
  if (headmasterNip) {
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${headmasterNip}`, signX, signatureY + 45);
  }
};
