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
}

/**
 * Adds watermark to PDF page
 */
export const addWatermarkToPDF = async (
  doc: jsPDF,
  settings?: LetterheadSettings | null
) => {
  if (!settings?.watermark_enabled || !settings?.watermark_url) return;

  try {
    const watermarkData = await loadImageAsBase64(settings.watermark_url);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const watermarkSize = settings.watermark_size || 100;
    const opacity = (settings.watermark_opacity || 10) / 100;
    
    // Calculate position based on setting
    let x = 0, y = 0;
    switch (settings.watermark_position) {
      case 'center':
        x = (pageWidth - watermarkSize) / 2;
        y = (pageHeight - watermarkSize) / 2;
        break;
      case 'top-left':
        x = 20;
        y = 20;
        break;
      case 'top-right':
        x = pageWidth - watermarkSize - 20;
        y = 20;
        break;
      case 'bottom-left':
        x = 20;
        y = pageHeight - watermarkSize - 20;
        break;
      case 'bottom-right':
        x = pageWidth - watermarkSize - 20;
        y = pageHeight - watermarkSize - 20;
        break;
      default:
        x = (pageWidth - watermarkSize) / 2;
        y = (pageHeight - watermarkSize) / 2;
    }

    // Set opacity and add watermark
    doc.saveGraphicsState();
    doc.setGState({ opacity });
    doc.addImage(watermarkData, 'PNG', x, y, watermarkSize, watermarkSize);
    doc.restoreGraphicsState();
  } catch (error) {
    console.error('Error adding watermark:', error);
  }
};

/**
 * Adds letterhead (kop surat) to a PDF document
 * @param doc - jsPDF document instance
 * @param settings - School settings for letterhead
 * @returns Promise<number> - Y position where content can start
 */
export const addLetterheadToPDF = async (
  doc: jsPDF,
  settings?: LetterheadSettings | null
): Promise<number> => {
  // Add watermark first (behind content)
  await addWatermarkToPDF(doc, settings);
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Detect orientation: A4 portrait is 210mm wide, landscape is 297mm wide
  const isLandscape = pageWidth > 250;
  
  // Calculate responsive margins and positions based on orientation
  const margin = isLandscape ? 20 : 14;
  const textAreaStart = margin + (settings?.logo_width || 20) + 5;
  const textAreaEnd = pageWidth - margin - (settings?.right_logo_width || 20) - 5;
  const textAreaCenter = (textAreaStart + textAreaEnd) / 2;
  
  const logoWidth = settings?.logo_width || 20;
  const logoHeight = settings?.logo_height || 20;
  const logoX = settings?.logo_position_x || margin;
  const logoY = settings?.logo_position_y || 15;
  
  const rightLogoWidth = settings?.right_logo_width || 20;
  const rightLogoHeight = settings?.right_logo_height || 20;
  // Auto-calculate right logo X position based on page width to prevent overlap
  // Posisi tersimpan dirancang untuk lebar 210mm; geser sesuai lebar kertas (A4 portrait: +0, F4: +5)
  const rightLogoX = settings?.right_logo_position_x
    ? settings.right_logo_position_x + (pageWidth - 210)
    : pageWidth - margin - rightLogoWidth;
  const rightLogoY = settings?.right_logo_position_y || 15;
  
  const headerFontSize = settings?.header_font_size || 16;
  const headerFontStyle = settings?.header_font_style || 'bold';
  const subheaderFontSize = settings?.subheader_font_size || 10;
  const districtFontSize = settings?.district_font_size || 12;
  const districtFontStyle = settings?.district_font_style || 'bold';
  const districtLineSpacing = settings?.district_line_spacing || 1.2;
  const schoolLineSpacing = settings?.school_line_spacing || 1.2;
  const showAddress = settings?.show_address !== false;
  const showPhone = settings?.show_phone !== false;

  let currentY = logoY;

  try {
    // Add left logo if available
    if (settings?.logo_url) {
      try {
        const logoData = await loadImageAsBase64(settings.logo_url);
        doc.addImage(logoData, 'PNG', logoX, logoY, logoWidth, logoHeight);
      } catch (error) {
        console.error('Error loading left logo:', error);
      }
    }

    // Add right logo if available
    if (settings?.right_logo_url) {
      try {
        const rightLogoData = await loadImageAsBase64(settings.right_logo_url);
        doc.addImage(rightLogoData, 'PNG', rightLogoX, rightLogoY, rightLogoWidth, rightLogoHeight);
      } catch (error) {
        console.error('Error loading right logo:', error);
      }
    }

    // District name (above school name)
    if (settings?.district_name) {
      doc.setFontSize(districtFontSize);
      doc.setFont('helvetica', districtFontStyle as any);
      doc.text(settings.district_name.toUpperCase(), pageWidth / 2, currentY + 2, { align: 'center' });
      currentY += (districtFontSize * districtLineSpacing) / 3;
    }

    // School name with custom style
    doc.setFontSize(headerFontSize);
    doc.setFont('helvetica', headerFontStyle as any);
    const schoolName = settings?.school_name || 'NAMA SEKOLAH';
    doc.text(schoolName, pageWidth / 2, currentY + 5, { align: 'center' });

    let textY = currentY + 5 + (headerFontSize * schoolLineSpacing) / 3;

    // School address
    if (showAddress && settings?.school_address) {
      doc.setFontSize(subheaderFontSize);
      doc.setFont('helvetica', 'normal');
      doc.text(settings.school_address, pageWidth / 2, textY + 6, { align: 'center' });
      textY += 6;
    }

    // School phone
    if (showPhone && settings?.school_phone) {
      doc.setFontSize(subheaderFontSize - 1);
      doc.text(`Telp: ${settings.school_phone}`, pageWidth / 2, textY + 5, { align: 'center' });
      textY += 5;
    }

    // Draw line separator - use responsive margin
    const lineY = textY + 4;
    doc.setLineWidth(0.5);
    doc.line(margin, lineY, pageWidth - margin, lineY);
    doc.setLineWidth(0.2);
    doc.line(margin, lineY + 1, pageWidth - margin, lineY + 1);

    // Return Y position where content should start
    return lineY + 6;
  } catch (error) {
    console.error('Error adding letterhead:', error);
    return 30;
  }
};

/**
 * Loads an image URL and converts it to base64
 */
const loadImageAsBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
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
      errorCorrectionLevel: 'H'
    });
    
    const qrSize = 30;
    const qrX = 14;
    const qrY = (finalY || 150) + 20;
    
    doc.addImage(qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    
    // Add label
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
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
  const signatureY = (finalY || 150) + 20;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  // Add QR code if serial number provided
  if (serialNumber) {
    await addQRCodeToPDF(doc, serialNumber, finalY);
  }
  
  doc.text('Mengetahui,', 140, signatureY + 10);
  doc.text((settings as any)?.headmaster_position || 'Kepala Sekolah', 140, signatureY + 15);
  
  // Signature line
  doc.line(140, signatureY + 35, 190, signatureY + 35);
  
  // Headmaster name
  doc.setFont('helvetica', 'bold');
  doc.text(headmasterName || 'Nama Kepala Sekolah', 140, signatureY + 40);
  
  // NIP
  if (headmasterNip) {
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${headmasterNip}`, 140, signatureY + 45);
  }
};
