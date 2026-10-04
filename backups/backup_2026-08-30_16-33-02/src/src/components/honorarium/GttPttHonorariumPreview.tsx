import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import jsPDF from 'jspdf';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';

interface Teacher {
  id: string;
  nip: string | null;
  nuptk: string | null;
  subject: string;
  pangkat_golongan: string | null;
  jabatan: string | null;
  profiles: {
    full_name: string;
  } | null;
}

interface Honorarium {
  id: string;
  teacher_id: string;
  honorarium_amount: number;
  tax_percentage: number;
  tax_amount: number;
  net_amount: number;
  payment_month: number;
  payment_year: number;
  receipt_number: string;
  receipt_date: string;
  description: string | null;
  teachers: Teacher;
}

interface SchoolSettings {
  school_name: string;
  school_address: string | null;
  school_phone: string | null;
  district_name: string | null;
  headmaster_name: string;
  headmaster_nip: string | null;
  bendahara_name: string | null;
  bendahara_nip: string | null;
  logo_url: string | null;
  logo_width: number | null;
  logo_height: number | null;
  logo_position_x: number | null;
  logo_position_y: number | null;
  right_logo_url: string | null;
  right_logo_width: number | null;
  right_logo_height: number | null;
  right_logo_position_x: number | null;
  right_logo_position_y: number | null;
  header_font_size: number | null;
  header_font_style: string | null;
  subheader_font_size: number | null;
  district_font_size: number | null;
  district_font_style: string | null;
  district_line_spacing: number | null;
  school_line_spacing: number | null;
  show_address: boolean | null;
  show_phone: boolean | null;
  watermark_url: string | null;
  watermark_opacity: number | null;
  watermark_size: number | null;
  watermark_position: string | null;
  watermark_enabled: boolean | null;
}

interface Props {
  honorarium: Honorarium;
  schoolSettings: SchoolSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function numberToWords(num: number): string {
  const ones = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'];
  const tens = ['', 'sepuluh', 'dua puluh', 'tiga puluh', 'empat puluh', 'lima puluh', 'enam puluh', 'tujuh puluh', 'delapan puluh', 'sembilan puluh'];
  const teens = ['sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas'];

  if (num === 0) return 'nol';

  const convert = (n: number): string => {
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 200) return 'seratus' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' ratus' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 1000000) return convert(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 1000000000) return convert(Math.floor(n / 1000000)) + ' juta' + (n % 1000000 ? ' ' + convert(n % 1000000) : '');
    return convert(Math.floor(n / 1000000000)) + ' miliar' + (n % 1000000000 ? ' ' + convert(n % 1000000000) : '');
  };

  return convert(num) + ' rupiah';
}

export function GttPttHonorariumPreview({ honorarium, schoolSettings, open, onOpenChange }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value);
  };

  const receiptDateFormatted = format(new Date(honorarium.receipt_date), 'd MMMM yyyy', { locale: idLocale });
  const periodText = `${MONTHS[honorarium.payment_month - 1]} ${honorarium.payment_year}`;

  const generatePDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Add letterhead
    let y = await addLetterheadToPDF(doc, {
      school_name: schoolSettings.school_name,
      district_name: schoolSettings.district_name || undefined,
      school_address: schoolSettings.school_address || undefined,
      school_phone: schoolSettings.school_phone || undefined,
      logo_url: schoolSettings.logo_url || undefined,
      logo_width: schoolSettings.logo_width || undefined,
      logo_height: schoolSettings.logo_height || undefined,
      logo_position_x: schoolSettings.logo_position_x || undefined,
      logo_position_y: schoolSettings.logo_position_y || undefined,
      right_logo_url: schoolSettings.right_logo_url || undefined,
      right_logo_width: schoolSettings.right_logo_width || undefined,
      right_logo_height: schoolSettings.right_logo_height || undefined,
      right_logo_position_x: schoolSettings.right_logo_position_x || undefined,
      right_logo_position_y: schoolSettings.right_logo_position_y || undefined,
      header_font_size: schoolSettings.header_font_size || undefined,
      header_font_style: schoolSettings.header_font_style || undefined,
      subheader_font_size: schoolSettings.subheader_font_size || undefined,
      district_font_size: schoolSettings.district_font_size || undefined,
      district_font_style: schoolSettings.district_font_style || undefined,
      district_line_spacing: schoolSettings.district_line_spacing || undefined,
      school_line_spacing: schoolSettings.school_line_spacing || undefined,
      show_address: schoolSettings.show_address ?? true,
      show_phone: schoolSettings.show_phone ?? true,
      watermark_url: schoolSettings.watermark_url || undefined,
      watermark_opacity: schoolSettings.watermark_opacity || undefined,
      watermark_size: schoolSettings.watermark_size || undefined,
      watermark_position: schoolSettings.watermark_position || undefined,
      watermark_enabled: schoolSettings.watermark_enabled ?? false,
    });
    
    y += 5;

    // Title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('KWITANSI PEMBAYARAN HONORARIUM GTT/PTT', pageWidth / 2, y, { align: 'center' });
    y += 10;

    // Receipt details
    doc.setFontSize(11);
    
    // Sudah terima dari
    doc.text('Sudah terima dari', 20, y);
    doc.text(': Bendahara ' + schoolSettings.school_name, 70, y);
    y += 7;

    // Uang sebanyak
    doc.text('Uang sebanyak', 20, y);
    const amountText = numberToWords(honorarium.net_amount);
    const wrappedAmount = doc.splitTextToSize(': ' + amountText.charAt(0).toUpperCase() + amountText.slice(1), 110);
    doc.text(wrappedAmount, 70, y);
    y += wrappedAmount.length * 5 + 2;

    // Untuk pembayaran
    doc.text('Untuk pembayaran', 20, y);
    doc.text(`: Honorarium GTT/PTT bulan ${periodText}`, 70, y);
    y += 7;

    // Nama penerima
    doc.text('Nama penerima', 20, y);
    doc.text(`: ${honorarium.teachers?.profiles?.full_name || 'N/A'}`, 70, y);
    y += 7;

    // NIP if available
    if (honorarium.teachers?.nip) {
      doc.text('NIP', 20, y);
      doc.text(`: ${honorarium.teachers.nip}`, 70, y);
      y += 7;
    }

    // NUPTK if available
    if (honorarium.teachers?.nuptk) {
      doc.text('NUPTK', 20, y);
      doc.text(`: ${honorarium.teachers.nuptk}`, 70, y);
      y += 7;
    }

    // Jabatan
    doc.text('Jabatan', 20, y);
    doc.text(`: ${honorarium.teachers?.jabatan || honorarium.teachers?.subject || '-'}`, 70, y);
    y += 15;

    // Amount table
    doc.setFontSize(10);
    
    // Draw table
    const tableStartY = y;
    const tableWidth = 170;
    const col1Width = 100;
    const col2Width = 70;
    
    // Header
    doc.setFillColor(240, 240, 240);
    doc.rect(20, y, tableWidth, 8, 'F');
    doc.rect(20, y, tableWidth, 8);
    doc.setFont('helvetica', 'bold');
    doc.text('Keterangan', 25, y + 5.5);
    doc.text('Jumlah', 20 + col1Width + col2Width / 2, y + 5.5, { align: 'center' });
    y += 8;

    // Rows
    doc.setFont('helvetica', 'normal');
    
    // Honorarium bruto
    doc.rect(20, y, col1Width, 7);
    doc.rect(20 + col1Width, y, col2Width, 7);
    doc.text('Honorarium Bruto', 25, y + 5);
    doc.text(formatCurrency(honorarium.honorarium_amount), 20 + col1Width + col2Width - 5, y + 5, { align: 'right' });
    y += 7;

    // Pajak
    doc.rect(20, y, col1Width, 7);
    doc.rect(20 + col1Width, y, col2Width, 7);
    doc.text(`Pajak (${honorarium.tax_percentage}%)`, 25, y + 5);
    doc.text('(' + formatCurrency(honorarium.tax_amount) + ')', 20 + col1Width + col2Width - 5, y + 5, { align: 'right' });
    y += 7;

    // Netto
    doc.setFillColor(240, 240, 240);
    doc.rect(20, y, tableWidth, 8, 'F');
    doc.rect(20, y, tableWidth, 8);
    doc.setFont('helvetica', 'bold');
    doc.text('Honorarium Netto', 25, y + 5.5);
    doc.text(formatCurrency(honorarium.net_amount), 20 + col1Width + col2Width - 5, y + 5.5, { align: 'right' });
    y += 20;

    // Signatures - 3 columns: Kepala Sekolah (left) - Bendahara (center) - Penerima (right)
    const signatureY = y;
    const leftX = 40;
    const centerX = pageWidth / 2;
    const rightX = pageWidth - 40;
    
    // Kepala Sekolah (left)
    doc.setFont('helvetica', 'normal');
    doc.text('Menyetujui', leftX, signatureY, { align: 'center' });
    doc.text(`Kepala ${schoolSettings.school_name}`, leftX, signatureY + 5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(schoolSettings.headmaster_name, leftX, signatureY + 30, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    if (schoolSettings.headmaster_nip) {
      doc.text(`NIP. ${schoolSettings.headmaster_nip}`, leftX, signatureY + 35, { align: 'center' });
    }

    // Bendahara (center)
    doc.setFont('helvetica', 'bolditalic');
    doc.text(`Lunas Dibayar, ${receiptDateFormatted}`, centerX, signatureY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text('Bendahara BOS', centerX, signatureY + 5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(schoolSettings.bendahara_name || '(___________________)', centerX, signatureY + 30, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    if (schoolSettings.bendahara_nip) {
      doc.text(`NIP. ${schoolSettings.bendahara_nip}`, centerX, signatureY + 35, { align: 'center' });
    }

    // Penerima (right)
    doc.text(`Ciamis, ${receiptDateFormatted}`, rightX, signatureY, { align: 'center' });
    doc.text('Penerima', rightX, signatureY + 5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(honorarium.teachers?.profiles?.full_name || '(___________________)', rightX, signatureY + 30, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    // NUPTK di bawah nama penerima
    if (honorarium.teachers?.nuptk) {
      doc.text(`NUPTK. ${honorarium.teachers.nuptk}`, rightX, signatureY + 35, { align: 'center' });
    }

    doc.save(`Kwitansi_Honorarium_${honorarium.teachers?.profiles?.full_name || 'GTT'}_${periodText}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Preview Kwitansi Honorarium</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button size="sm" onClick={generatePDF}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Preview content */}
        <div ref={contentRef} className="bg-white p-8 border rounded-lg print:border-0 text-black">
          {/* Letterhead Preview */}
          <div className="text-center mb-4 pb-4 border-b-2 border-black">
            <div className="flex items-center justify-center gap-4">
              {schoolSettings.logo_url && (
                <img src={schoolSettings.logo_url} alt="Logo Kiri" className="h-16 w-auto" />
              )}
              <div className="flex-1">
                {schoolSettings.district_name && (
                  <p className="text-sm font-bold uppercase">{schoolSettings.district_name}</p>
                )}
                <h2 className="text-lg font-bold uppercase">{schoolSettings.school_name}</h2>
                {schoolSettings.school_address && (
                  <p className="text-xs">{schoolSettings.school_address}</p>
                )}
                {schoolSettings.school_phone && (
                  <p className="text-xs">Telp: {schoolSettings.school_phone}</p>
                )}
              </div>
              {schoolSettings.right_logo_url && (
                <img src={schoolSettings.right_logo_url} alt="Logo Kanan" className="h-16 w-auto" />
              )}
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-base font-bold underline">KWITANSI PEMBAYARAN HONORARIUM GTT/PTT</h1>
          </div>

          {/* Receipt details */}
          <div className="space-y-2 text-sm mb-6">
            <div className="grid grid-cols-[150px_1fr]">
              <span>Sudah terima dari</span>
              <span>: Bendahara {schoolSettings.school_name}</span>
            </div>
            <div className="grid grid-cols-[150px_1fr]">
              <span>Uang sebanyak</span>
              <span className="italic">: {numberToWords(honorarium.net_amount).charAt(0).toUpperCase() + numberToWords(honorarium.net_amount).slice(1)}</span>
            </div>
            <div className="grid grid-cols-[150px_1fr]">
              <span>Untuk pembayaran</span>
              <span>: Honorarium GTT/PTT bulan {periodText}</span>
            </div>
            <div className="grid grid-cols-[150px_1fr]">
              <span>Nama penerima</span>
              <span>: {honorarium.teachers?.profiles?.full_name || 'N/A'}</span>
            </div>
            {honorarium.teachers?.nip && (
              <div className="grid grid-cols-[150px_1fr]">
                <span>NIP</span>
                <span>: {honorarium.teachers.nip}</span>
              </div>
            )}
            {honorarium.teachers?.nuptk && (
              <div className="grid grid-cols-[150px_1fr]">
                <span>NUPTK</span>
                <span>: {honorarium.teachers.nuptk}</span>
              </div>
            )}
            <div className="grid grid-cols-[150px_1fr]">
              <span>Jabatan</span>
              <span>: {honorarium.teachers?.jabatan || honorarium.teachers?.subject || '-'}</span>
            </div>
          </div>

          {/* Amount table */}
          <table className="w-full border-collapse border border-gray-400 text-sm mb-8">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 p-2 text-left">Keterangan</th>
                <th className="border border-gray-400 p-2 text-right w-40">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 p-2">Honorarium Bruto</td>
                <td className="border border-gray-400 p-2 text-right">{formatCurrency(honorarium.honorarium_amount)}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2">Pajak ({honorarium.tax_percentage}%)</td>
                <td className="border border-gray-400 p-2 text-right text-red-600">({formatCurrency(honorarium.tax_amount)})</td>
              </tr>
              <tr className="bg-gray-100 font-bold">
                <td className="border border-gray-400 p-2">Honorarium Netto</td>
                <td className="border border-gray-400 p-2 text-right">{formatCurrency(honorarium.net_amount)}</td>
              </tr>
            </tbody>
          </table>

          {/* Signatures - 3 columns */}
          <div className="grid grid-cols-3 gap-4 mt-12 text-sm text-center">
            {/* Kepala Sekolah (left) */}
            <div>
              <p>Menyetujui</p>
              <p>Kepala {schoolSettings.school_name}</p>
              <div className="h-16"></div>
              <p className="font-bold">{schoolSettings.headmaster_name}</p>
              {schoolSettings.headmaster_nip && (
                <p>NIP. {schoolSettings.headmaster_nip}</p>
              )}
            </div>

            {/* Bendahara (center) */}
            <div>
              <p className="font-bold italic">Lunas Dibayar, {receiptDateFormatted}</p>
              <p>Bendahara BOS</p>
              <div className="h-16"></div>
              <p className="font-bold">{schoolSettings.bendahara_name || '(___________________)'}</p>
              {schoolSettings.bendahara_nip && (
                <p>NIP. {schoolSettings.bendahara_nip}</p>
              )}
            </div>

            {/* Penerima (right) */}
            <div>
              <p>Ciamis, {receiptDateFormatted}</p>
              <p>Penerima</p>
              <div className="h-16"></div>
              <p className="font-bold">{honorarium.teachers?.profiles?.full_name || '(___________________)'}</p>
              {honorarium.teachers?.nuptk && (
                <p>NUPTK. {honorarium.teachers.nuptk}</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
