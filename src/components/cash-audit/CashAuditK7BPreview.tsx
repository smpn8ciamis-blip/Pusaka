import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import jsPDF from "jspdf";
import { addLetterheadToPDF, addWatermarkToPDF, LetterheadSettings } from "@/lib/pdfLetterhead";

interface CashAudit {
  id: string;
  audit_date: string;
  sk_number: string | null;
  sk_date: string | null;
  total_penerimaan: number;
  total_pengeluaran: number;
  saldo_buku: number;
  lembar_100000: number;
  lembar_50000: number;
  lembar_20000: number;
  lembar_10000: number;
  lembar_5000: number;
  lembar_2000: number;
  lembar_1000: number;
  keping_1000: number;
  keping_500: number;
  keping_200: number;
  keping_100: number;
  saldo_bank: number;
  surat_berharga: number;
  penjelasan_perbedaan: string | null;
  sk_bendahara_name?: string | null;
  sk_bendahara_nip?: string | null;
  sk_headmaster_name?: string | null;
  sk_headmaster_nip?: string | null;
  sk_headmaster_position?: string | null;
}

interface SchoolSettings {
  school_name: string;
  headmaster_name: string;
  headmaster_nip: string | null;
  headmaster_position?: string | null;
  bendahara_name: string | null;
  bendahara_nip: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit: CashAudit;
  schoolSettings: SchoolSettings;
  previousClosingDate?: string | null;
}

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const CashAuditK7BPreview = ({ open, onOpenChange, audit, schoolSettings, previousClosingDate }: Props) => {
  const { data: fullSettings } = useQuery({
    queryKey: ['school-settings-full'],
    queryFn: async () => {
      const { data, error } = await supabase.from('school_settings').select('*').single();
      if (error) throw error;
      return data;
    }
  });

  const headmasterPosition = (audit as any)?.sk_headmaster_position || (schoolSettings as any)?.headmaster_position || (fullSettings as any)?.headmaster_position || 'Kepala Sekolah';
  const headmasterName = (audit as any)?.sk_headmaster_name || schoolSettings.headmaster_name || '';
  const headmasterNip = (audit as any)?.sk_headmaster_nip || schoolSettings.headmaster_nip || '';
  const bendaharaName = (audit as any)?.sk_bendahara_name || schoolSettings.bendahara_name || '';
  const bendaharaNip = (audit as any)?.sk_bendahara_nip || schoolSettings.bendahara_nip || '';

  // Fetch previous audit if not provided
  const { data: previousAudit } = useQuery({
    queryKey: ['previous-cash-audit', audit.id, audit.audit_date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_audits')
        .select('audit_date')
        .lt('audit_date', audit.audit_date)
        .neq('id', audit.id)
        .order('audit_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      console.log('Previous audit found:', data);
      return data;
    },
    enabled: open && !previousClosingDate
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID').format(value);
  };

  const formatCurrencyWithDots = (value: number) => {
    return formatCurrency(value) + ',-';
  };

  // Calculate totals
  const subJumlah1 = audit.lembar_100000 * 100000 + audit.lembar_50000 * 50000 + 
                     audit.lembar_20000 * 20000 + audit.lembar_10000 * 10000 + 
                     audit.lembar_5000 * 5000 + audit.lembar_2000 * 2000 + audit.lembar_1000 * 1000;
  const subJumlah2 = audit.keping_1000 * 1000 + audit.keping_500 * 500 + 
                     audit.keping_200 * 200 + audit.keping_100 * 100;
  const subJumlah3 = Number(audit.saldo_bank) + Number(audit.surat_berharga);
  const totalKas = subJumlah1 + subJumlah2 + subJumlah3;
  const saldoBuku = Number(audit.total_penerimaan) - Number(audit.total_pengeluaran);
  const perbedaan = saldoBuku - totalKas;

  const auditDate = new Date(audit.audit_date);

  // Get the previous closing date
  const prevClosingDateStr = previousClosingDate || previousAudit?.audit_date;
  const formattedPrevClosingDate = prevClosingDateStr 
    ? format(new Date(prevClosingDateStr), 'dd MMMM yyyy', { locale: localeId })
    : '....................................';

  const generatePDF = async (action: 'download' | 'print') => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 15;

    // Add letterhead if settings available
    if (fullSettings) {
      const letterheadSettings: LetterheadSettings = {
        school_name: fullSettings.school_name,
        district_name: fullSettings.district_name || '',
        school_address: fullSettings.school_address || '',
        school_phone: fullSettings.school_phone || '',
        logo_url: fullSettings.logo_url || '',
        right_logo_url: fullSettings.right_logo_url || '',
        header_font_size: fullSettings.header_font_size || 14,
        subheader_font_size: fullSettings.subheader_font_size || 10,
        school_line_spacing: fullSettings.school_line_spacing || 6,
        district_line_spacing: fullSettings.district_line_spacing || 5,
        logo_width: fullSettings.logo_width || 20,
        logo_height: fullSettings.logo_height || 20,
        logo_position_x: fullSettings.logo_position_x || margin,
        logo_position_y: fullSettings.logo_position_y || 10,
        right_logo_width: fullSettings.right_logo_width || 20,
        right_logo_height: fullSettings.right_logo_height || 20,
        right_logo_position_x: fullSettings.right_logo_position_x || pageWidth - margin - 20,
        right_logo_position_y: fullSettings.right_logo_position_y || 10,
        show_address: fullSettings.show_address ?? true,
        show_phone: fullSettings.show_phone ?? true,
      };

      if (fullSettings.watermark_enabled && fullSettings.watermark_url) {
        await addWatermarkToPDF(doc, {
          ...letterheadSettings,
          watermark_url: fullSettings.watermark_url,
          watermark_opacity: fullSettings.watermark_opacity || 0.1,
          watermark_size: fullSettings.watermark_size || 100,
          watermark_position: fullSettings.watermark_position || 'center',
          watermark_enabled: true,
        });
      }

      y = await addLetterheadToPDF(doc, letterheadSettings);
      y += 5;
    }

    const lineHeight = 6;
    const labelX = margin;
    const colonX = margin + 65;
    const valueX = colonX + 5;

    // Form number (top right)
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Formulir BOS-K7b', pageWidth - margin, y, { align: 'right' });
    y += 12;

    // Title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('REGISTER PENUTUPAN KAS', pageWidth / 2, y, { align: 'center' });
    y += 12;

    // Info section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    // Tanggal Penutupan Kas
    doc.text('Tanggal Penutupan Kas', labelX, y);
    doc.text(':', colonX, y);
    doc.text(format(auditDate, 'dd MMMM yyyy', { locale: localeId }), valueX, y);
    y += lineHeight;

    // Nama Penutup Kas
    doc.text('Nama Penutup Kas (Pemegang Kas)', labelX, y);
    doc.text(':', colonX, y);
    doc.text(bendaharaName || '......................', valueX, y);
    y += lineHeight;

    // Tanggal Penutupan Kas Yang Lalu
    doc.text('Tanggal Penutupan Kas Yang Lalu', labelX, y);
    doc.text(':', colonX, y);
    doc.text(formattedPrevClosingDate, valueX, y);
    y += lineHeight;

    // Jumlah Total Penerimaan
    doc.text('Jumlah Total Penerimaan (D)', labelX, y);
    doc.text(':', colonX, y);
    doc.text(`Rp. ${formatCurrencyWithDots(Number(audit.total_penerimaan))}`, valueX, y);
    y += lineHeight;

    // Jumlah Total Pengeluaran
    doc.text('Jumlah Total Pengeluaran (K)', labelX, y);
    doc.text(':', colonX, y);
    doc.text(`Rp. ${formatCurrencyWithDots(Number(audit.total_pengeluaran))}`, valueX, y);
    y += lineHeight;

    // Saldo Buku (bold)
    doc.setFont('helvetica', 'bold');
    doc.text('Saldo Buku (A = D - K)', labelX + 15, y);
    doc.text(`Rp. ${formatCurrencyWithDots(saldoBuku)}`, valueX + 15, y);
    y += lineHeight;

    // Saldo Kas (bold)
    doc.text('Saldo Kas (B)', labelX + 15, y);
    doc.text(`Rp. ${formatCurrencyWithDots(totalKas)}`, valueX + 15, y);
    y += lineHeight + 2;

    doc.setFont('helvetica', 'normal');
    doc.text('Saldo kas B terdiri dari:', labelX, y);
    y += lineHeight;

    // Currency breakdown helper function - show count
    const addCurrencyLine = (label: string, denomination: string, count: number, total: number, unit: string, isFirst: boolean = false) => {
      const prefix = isFirst ? '1. ' : '   ';
      doc.text(`${prefix}${label}`, labelX, y);
      doc.text('Rp', labelX + 45, y);
      doc.text(`${formatCurrency(parseInt(denomination.replace('.', '')))},-`, labelX + 55, y);
      // Show count instead of dots
      doc.text(count > 0 ? count.toString() : '............', labelX + 78, y);
      doc.text(unit, labelX + 95, y);
      doc.text('Rp', labelX + 110, y);
      doc.text(count > 0 ? formatCurrencyWithDots(total) : '....................................', labelX + 120, y);
      y += lineHeight;
    };

    // 1. Lembaran uang kertas
    addCurrencyLine('Lembaran uang kertas', '100.000', audit.lembar_100000, audit.lembar_100000 * 100000, 'Lembar', true);
    addCurrencyLine('Lembaran uang kertas', '50.000', audit.lembar_50000, audit.lembar_50000 * 50000, 'Lembar');
    addCurrencyLine('Lembaran uang kertas', '20.000', audit.lembar_20000, audit.lembar_20000 * 20000, 'Lembar');
    addCurrencyLine('Lembaran uang kertas', '10.000', audit.lembar_10000, audit.lembar_10000 * 10000, 'Lembar');
    addCurrencyLine('Lembaran uang kertas', '5.000', audit.lembar_5000, audit.lembar_5000 * 5000, 'Lembar');
    addCurrencyLine('Lembaran uang kertas', '2.000', audit.lembar_2000, audit.lembar_2000 * 2000, 'Lembar');
    addCurrencyLine('Lembaran uang kertas', '1.000', audit.lembar_1000, audit.lembar_1000 * 1000, 'Lembar');

    // Sub Jumlah 1
    doc.setFont('helvetica', 'bold');
    doc.text('Sub Jumlah (1) Rp', labelX + 60, y);
    doc.text(formatCurrencyWithDots(subJumlah1), labelX + 120, y);
    y += lineHeight + 2;
    doc.setFont('helvetica', 'normal');

    // 2. Keping uang logam - show count
    const addCoinLine = (denomination: string, count: number, total: number, isFirst: boolean = false) => {
      const prefix = isFirst ? '2. ' : '   ';
      doc.text(`${prefix}Keping uang logam`, labelX, y);
      doc.text('Rp', labelX + 45, y);
      doc.text(`${formatCurrency(parseInt(denomination.replace('.', '')))},-`, labelX + 55, y);
      // Show count instead of dots
      doc.text(count > 0 ? count.toString() : '............', labelX + 78, y);
      doc.text('Keping', labelX + 95, y);
      doc.text('Rp', labelX + 110, y);
      doc.text(count > 0 ? formatCurrencyWithDots(total) : '....................................', labelX + 120, y);
      y += lineHeight;
    };

    addCoinLine('1.000', audit.keping_1000, audit.keping_1000 * 1000, true);
    addCoinLine('500', audit.keping_500, audit.keping_500 * 500);
    addCoinLine('200', audit.keping_200, audit.keping_200 * 200);
    addCoinLine('100', audit.keping_100, audit.keping_100 * 100);

    // Sub Jumlah 2
    doc.setFont('helvetica', 'bold');
    doc.text('Sub Jumlah (2) Rp', labelX + 60, y);
    doc.text(formatCurrencyWithDots(subJumlah2), labelX + 120, y);
    y += lineHeight + 2;
    doc.setFont('helvetica', 'normal');

    // 3. Saldo Bank, Surat Berharga dll
    doc.text('3. Saldo Bank, Surat Berharga dll', labelX, y);
    doc.setFont('helvetica', 'bold');
    doc.text('Sub Jumlah (3) Rp', labelX + 60, y);
    doc.text(formatCurrencyWithDots(subJumlah3), labelX + 120, y);
    y += lineHeight;

    // Total
    doc.text('Jumlah (1 + 2 + 3) Rp', labelX + 60, y);
    doc.text(formatCurrencyWithDots(totalKas), labelX + 120, y);
    y += lineHeight + 4;
    doc.setFont('helvetica', 'normal');

    // Perbedaan
    doc.text('Perbedaan (A-B)', labelX, y);
    doc.text(`Rp. ${formatCurrencyWithDots(Math.abs(perbedaan))}`, valueX + 30, y);
    y += lineHeight;

    // Penjelasan Perbedaan
    doc.text('Penjelasan Perbedaan', labelX, y);
    doc.setFont('helvetica', 'bold');
    doc.text(audit.penjelasan_perbedaan || 'Nihil', valueX, y);
    y += lineHeight + 8;
    doc.setFont('helvetica', 'normal');

    // Date and signatures - two columns
    const formattedDate = format(auditDate, 'dd MMMM yyyy', { locale: localeId });
    
    const signatureY = y;
    const leftColX = margin + 30;
    const rightColX = pageWidth - margin - 40;
    
    // Left signature (Bendahara)
    doc.text('Yang diperiksa,', leftColX, signatureY, { align: 'center' });
    doc.text('Bendahara/Pemegang Kas', leftColX, signatureY + lineHeight, { align: 'center' });
    doc.text(bendaharaName || '......................', leftColX, signatureY + 28, { align: 'center' });
    if (bendaharaNip) {
      doc.text(`NIP ${bendaharaNip}`, leftColX, signatureY + 33, { align: 'center' });
    }

    // Right side - Date and signature (Kepala Sekolah)
    doc.text(`Tanggal, ${formattedDate}`, rightColX, signatureY, { align: 'center' });
    doc.text('Yang Memeriksa,', rightColX, signatureY + lineHeight, { align: 'center' });
    doc.text(headmasterPosition, rightColX, signatureY + lineHeight * 2, { align: 'center' });
    doc.text(headmasterName, rightColX, signatureY + 28, { align: 'center' });
    if (headmasterNip) {
      doc.text(`NIP ${headmasterNip}`, rightColX, signatureY + 33, { align: 'center' });
    }

    if (action === 'download') {
      doc.save(`register-penutupan-kas-${audit.audit_date}.pdf`);
    } else {
      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Register Penutupan Kas (BOS-K7B)</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button onClick={() => generatePDF('print')}>
            <Printer className="h-4 w-4 mr-2" />
            Cetak
          </Button>
          <Button variant="outline" onClick={() => generatePDF('download')}>
            <Download className="h-4 w-4 mr-2" />
            Unduh PDF
          </Button>
        </div>

        {/* Preview Content */}
        <div className="bg-white p-8 border rounded-lg text-black text-sm" style={{ fontFamily: 'Times New Roman, serif' }}>
          <div className="text-right font-bold mb-4">Formulir BOS-K7b</div>
          
          <h2 className="text-center font-bold text-lg mb-6">REGISTER PENUTUPAN KAS</h2>
          
          {/* Info section */}
          <div className="space-y-1 mb-4">
            <div className="flex">
              <span className="w-64">Tanggal Penutupan Kas</span>
              <span className="w-4">:</span>
              <span>{format(auditDate, 'dd MMMM yyyy', { locale: localeId })}</span>
            </div>
            <div className="flex">
              <span className="w-64">Nama Penutup Kas (Pemegang Kas)</span>
              <span className="w-4">:</span>
              <span>{bendaharaName || '......................'}</span>
            </div>
            <div className="flex">
              <span className="w-64">Tanggal Penutupan Kas Yang Lalu</span>
              <span className="w-4">:</span>
              <span>{formattedPrevClosingDate}</span>
            </div>
            <div className="flex">
              <span className="w-64">Jumlah Total Penerimaan (D)</span>
              <span className="w-4">:</span>
              <span>Rp. {formatCurrencyWithDots(Number(audit.total_penerimaan))}</span>
            </div>
            <div className="flex">
              <span className="w-64">Jumlah Total Pengeluaran (K)</span>
              <span className="w-4">:</span>
              <span>Rp. {formatCurrencyWithDots(Number(audit.total_pengeluaran))}</span>
            </div>
            <div className="flex font-bold pl-8">
              <span className="w-48">Saldo Buku (A = D - K)</span>
              <span>Rp. {formatCurrencyWithDots(saldoBuku)}</span>
            </div>
            <div className="flex font-bold pl-8">
              <span className="w-48">Saldo Kas (B)</span>
              <span>Rp. {formatCurrencyWithDots(totalKas)}</span>
            </div>
          </div>

          <div className="mb-2">Saldo kas B terdiri dari:</div>

          {/* 1. Lembaran uang kertas - show counts */}
          <div className="space-y-1 mb-2">
            {[
              { label: '100.000', count: audit.lembar_100000, value: audit.lembar_100000 * 100000 },
              { label: '50.000', count: audit.lembar_50000, value: audit.lembar_50000 * 50000 },
              { label: '20.000', count: audit.lembar_20000, value: audit.lembar_20000 * 20000 },
              { label: '10.000', count: audit.lembar_10000, value: audit.lembar_10000 * 10000 },
              { label: '5.000', count: audit.lembar_5000, value: audit.lembar_5000 * 5000 },
              { label: '2.000', count: audit.lembar_2000, value: audit.lembar_2000 * 2000 },
              { label: '1.000', count: audit.lembar_1000, value: audit.lembar_1000 * 1000 },
            ].map((item, idx) => (
              <div key={idx} className="flex">
                <span className="w-4">{idx === 0 ? '1.' : ''}</span>
                <span className="w-40">Lembaran uang kertas</span>
                <span className="w-8">Rp</span>
                <span className="w-20">{item.label},-</span>
                <span className="w-16 text-center">{item.count > 0 ? item.count : '......'}</span>
                <span className="w-16">Lembar</span>
                <span className="w-8">Rp</span>
                <span className="w-32">{item.count > 0 ? formatCurrencyWithDots(item.value) : '....................................'}</span>
              </div>
            ))}
            <div className="flex justify-end font-bold">
              <span className="w-40">Sub Jumlah (1) Rp</span>
              <span className="w-32">{formatCurrencyWithDots(subJumlah1)}</span>
            </div>
          </div>

          {/* 2. Keping uang logam - show counts */}
          <div className="space-y-1 mb-2">
            {[
              { label: '1.000', count: audit.keping_1000, value: audit.keping_1000 * 1000 },
              { label: '500', count: audit.keping_500, value: audit.keping_500 * 500 },
              { label: '200', count: audit.keping_200, value: audit.keping_200 * 200 },
              { label: '100', count: audit.keping_100, value: audit.keping_100 * 100 },
            ].map((item, idx) => (
              <div key={idx} className="flex">
                <span className="w-4">{idx === 0 ? '2.' : ''}</span>
                <span className="w-40">Keping uang logam</span>
                <span className="w-8">Rp</span>
                <span className="w-20">{item.label},-</span>
                <span className="w-16 text-center">{item.count > 0 ? item.count : '......'}</span>
                <span className="w-16">Keping</span>
                <span className="w-8">Rp</span>
                <span className="w-32">{item.count > 0 ? formatCurrencyWithDots(item.value) : '....................................'}</span>
              </div>
            ))}
            <div className="flex justify-end font-bold">
              <span className="w-40">Sub Jumlah (2) Rp</span>
              <span className="w-32">{formatCurrencyWithDots(subJumlah2)}</span>
            </div>
          </div>

          {/* 3. Saldo Bank */}
          <div className="flex mb-2">
            <span className="w-4">3.</span>
            <span>Saldo Bank, Surat Berharga dll</span>
            <span className="ml-auto font-bold w-40">Sub Jumlah (3) Rp</span>
            <span className="font-bold w-32">{formatCurrencyWithDots(subJumlah3)}</span>
          </div>

          {/* Total */}
          <div className="flex justify-end font-bold mb-4">
            <span className="w-48">Jumlah (1 + 2 + 3) Rp</span>
            <span className="w-32">{formatCurrencyWithDots(totalKas)}</span>
          </div>

          {/* Perbedaan */}
          <div className="flex mb-1">
            <span className="w-48">Perbedaan (A-B)</span>
            <span>Rp. {formatCurrencyWithDots(Math.abs(perbedaan))}</span>
          </div>
          <div className="flex mb-6">
            <span className="w-48">Penjelasan Perbedaan</span>
            <span className="font-bold">{audit.penjelasan_perbedaan || 'Nihil'}</span>
          </div>

          {/* Signatures */}
          <div className="flex justify-between mt-8">
            <div className="text-center">
              <p>Yang diperiksa,</p>
              <p>Bendahara/Pemegang Kas</p>
              <div className="h-16"></div>
              <p className="font-bold">{bendaharaName || '......................'}</p>
              {bendaharaNip && <p>NIP {bendaharaNip}</p>}
            </div>
            <div className="text-center">
              <p>Tanggal, {format(auditDate, 'dd MMMM yyyy', { locale: localeId })}</p>
              <p>Yang Memeriksa,</p>
              <p>{headmasterPosition}</p>
              <div className="h-16"></div>
              <p className="font-bold">{headmasterName}</p>
              {headmasterNip && <p>NIP {headmasterNip}</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CashAuditK7BPreview;
