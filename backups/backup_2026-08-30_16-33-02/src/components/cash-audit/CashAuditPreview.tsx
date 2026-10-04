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
  sk_period_start_month?: number | null;
  sk_period_start_year?: number | null;
  sk_period_end_month?: number | null;
  sk_period_end_year?: number | null;
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
}

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const numberToWords = (num: number): string => {
  const ones = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  if (num < 12) return ones[num];
  if (num < 20) return ones[num - 10] + ' Belas';
  if (num < 100) return ones[Math.floor(num / 10)] + ' Puluh' + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
  return num.toString();
};

const yearToWords = (year: number): string => {
  const thousands = Math.floor(year / 1000);
  const hundreds = Math.floor((year % 1000) / 100);
  const tens = year % 100;
  
  let result = '';
  if (thousands === 2) result += 'Dua Ribu ';
  if (hundreds > 0) result += numberToWords(hundreds) + ' Ratus ';
  if (tens > 0) result += numberToWords(tens);
  return result.trim();
};

const CashAuditPreview = ({ open, onOpenChange, audit, schoolSettings }: Props) => {
  const { data: fullSettings } = useQuery({
    queryKey: ['school-settings-full'],
    queryFn: async () => {
      const { data, error } = await supabase.from('school_settings').select('*').single();
      if (error) throw error;
      return data;
    }
  });

  // Use SK-period overrides if present, else fall back to global school settings
  const headmasterPosition = (audit as any)?.sk_headmaster_position || (schoolSettings as any)?.headmaster_position || (fullSettings as any)?.headmaster_position || 'Kepala Sekolah';
  const headmasterName = (audit as any)?.sk_headmaster_name || schoolSettings.headmaster_name || '';
  const headmasterNip = (audit as any)?.sk_headmaster_nip || schoolSettings.headmaster_nip || '';
  const bendaharaName = (audit as any)?.sk_bendahara_name || schoolSettings.bendahara_name || '';
  const bendaharaNip = (audit as any)?.sk_bendahara_nip || schoolSettings.bendahara_nip || '';

  const skPeriodText = (() => {
    const sm = audit.sk_period_start_month, sy = audit.sk_period_start_year;
    const em = audit.sk_period_end_month, ey = audit.sk_period_end_year;
    if (!sm || !sy || !em || !ey) return '';
    return `${MONTHS[sm - 1]} ${sy} s.d. ${MONTHS[em - 1]} ${ey}`;
  })();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID').format(value);
  };

  // Calculate totals
  const subJumlah1 = audit.lembar_100000 * 100000 + audit.lembar_50000 * 50000 + 
                     audit.lembar_20000 * 20000 + audit.lembar_10000 * 10000 + 
                     audit.lembar_5000 * 5000 + audit.lembar_2000 * 2000 + audit.lembar_1000 * 1000;
  const subJumlah2 = audit.keping_1000 * 1000 + audit.keping_500 * 500 + 
                     audit.keping_200 * 200 + audit.keping_100 * 100;
  const subJumlah3 = Number(audit.saldo_bank) + Number(audit.surat_berharga);
  const totalKas = subJumlah1 + subJumlah2 + subJumlah3;
  // Saldo Buku = Total Penerimaan - Total Pengeluaran
  const saldoBuku = Number(audit.total_penerimaan) - Number(audit.total_pengeluaran);
  const perbedaan = saldoBuku - totalKas;

  const auditDate = new Date(audit.audit_date);
  const dayName = DAYS[auditDate.getDay()];
  const dateNum = auditDate.getDate();
  const monthName = MONTHS[auditDate.getMonth()];
  const year = auditDate.getFullYear();

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
      y += 10;
    }

    // Form number
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Formulir BOS-K7C', pageWidth - margin, y, { align: 'right' });
    y += 10;

    // Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('BERITA ACARA PEMERIKSAAN KAS', pageWidth / 2, y, { align: 'center' });
    y += 15;

    // Main text
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    const skDateFormatted = audit.sk_date ? format(new Date(audit.sk_date), 'dd MMMM yyyy', { locale: localeId }) : '......................';
    
    const paragraph1 = `Pada hari ini ${dayName} tanggal ${numberToWords(dateNum)} bulan ${monthName} tahun ${yearToWords(year)} yang bertanda tangan di bawah ini, kami ${headmasterPosition} yang ditunjuk berdasarkan Surat Keputusan No. ${audit.sk_number || '.............'} tanggal ${skDateFormatted}`;
    
    const splitPara1 = doc.splitTextToSize(paragraph1, pageWidth - 2 * margin);
    doc.text(splitPara1, margin, y);
    y += splitPara1.length * 6 + 5;

    // Inspector info
    doc.text(`Nama        : ${headmasterName}`, margin + 10, y);
    y += 6;
    doc.text(`Jabatan     : ${headmasterPosition}`, margin + 10, y);
    y += 8;

    doc.text('melakukan pemeriksaan kas kepada:', margin, y);
    y += 8;

    // Treasurer info
    doc.text(`Nama        : ${bendaharaName || '......................'}`, margin + 10, y);
    y += 6;
    doc.text(`Jabatan     : Bendahara BOS`, margin + 10, y);
    y += 8;

    const paragraph2Base = `yang berdasarkan Surat Keputusan No. ${audit.sk_number || '.............'} tanggal ${skDateFormatted} ditugaskan dengan pengurusan uang Dana BOS`;
    const paragraph2 = skPeriodText ? `${paragraph2Base} dengan masa berlaku ${skPeriodText}` : paragraph2Base;
    const splitPara2 = doc.splitTextToSize(paragraph2, pageWidth - 2 * margin);
    doc.text(splitPara2, margin, y);
    y += splitPara2.length * 6 + 8;

    // Results section
    doc.text('Berdasarkan pemeriksaan kas serta bukti-bukti dalam pengurusan itu, kami', margin, y);
    y += 6;
    doc.text('menemui kenyataan sebagai berikut:', margin, y);
    y += 8;

    doc.text('Jumlah uang yang dihitung di hadapan Bendahara/Pemegang Kas adalah:', margin, y);
    y += 8;

    // Cash items
    const col1 = margin;
    const col2 = pageWidth - margin - 50;
    
    doc.text(`a) Uang kertas bank, uang logam`, col1, y);
    doc.text(`Rp. ${formatCurrency(subJumlah1 + subJumlah2)},-`, col2, y, { align: 'right' });
    y += 6;
    
    doc.text(`b) Saldo Bank`, col1, y);
    doc.text(`Rp. ${formatCurrency(Number(audit.saldo_bank))},-`, col2, y, { align: 'right' });
    y += 6;
    
    doc.text(`c) Surat Berharga dll`, col1, y);
    doc.text(`Rp. ${formatCurrency(Number(audit.surat_berharga))},-`, col2, y, { align: 'right' });
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.text(`Jumlah Rp. ${formatCurrency(totalKas)},-`, pageWidth / 2, y, { align: 'center' });
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.text(`Saldo uang menurut Buku Kas Umum`, col1, y);
    doc.text(`Rp. ${formatCurrency(saldoBuku)},-`, col2, y, { align: 'right' });
    y += 6;
    
    doc.text(`Perbedaan antara saldo kas dan saldo buku`, col1, y);
    doc.text(`Rp. ${formatCurrency(Math.abs(perbedaan))},-`, col2, y, { align: 'right' });
    y += 10;

    if (audit.penjelasan_perbedaan) {
      doc.text(`Penjelasan Perbedaan: ${audit.penjelasan_perbedaan}`, margin, y);
      y += 10;
    }

    // Date and signatures
    y += 5;
    const formattedDate = format(auditDate, 'dd MMMM yyyy', { locale: localeId });
    doc.text(`Tanggal, ${formattedDate}`, pageWidth - margin - 60, y);
    y += 10;

    const signatureY = y;
    
    // Left signature (Bendahara)
    doc.text('Bendahara/Pemegang Kas', margin, signatureY);
    doc.text(bendaharaName || '......................', margin, signatureY + 25);
    if (bendaharaNip) {
      doc.text(`NIP. ${bendaharaNip}`, margin, signatureY + 30);
    }

    // Right signature (Kepala Sekolah)
    doc.text(headmasterPosition, pageWidth - margin - 40, signatureY);
    doc.text(headmasterName, pageWidth - margin - 40, signatureY + 25);
    if (headmasterNip) {
      doc.text(`NIP. ${headmasterNip}`, pageWidth - margin - 40, signatureY + 30);
    }

    if (action === 'download') {
      doc.save(`berita-acara-pemeriksaan-kas-${audit.audit_date}.pdf`);
    } else {
      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Berita Acara Pemeriksaan Kas</DialogTitle>
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
          <div className="text-right font-bold mb-4">Formulir BOS-K7C</div>
          
          <h2 className="text-center font-bold text-lg mb-6 underline">BERITA ACARA PEMERIKSAAN KAS</h2>
          
          <p className="text-justify mb-4 leading-relaxed">
            Pada hari ini <em>{dayName}</em> tanggal <em>{numberToWords(dateNum)}</em> bulan <em>{monthName}</em> tahun <em>{yearToWords(year)}</em> yang bertanda tangan di bawah ini, kami {headmasterPosition} yang ditunjuk berdasarkan Surat Keputusan No. {audit.sk_number || '.............'} tanggal {audit.sk_date ? format(new Date(audit.sk_date), 'dd MMMM yyyy', { locale: localeId }) : '......................'}{skPeriodText && ` dengan masa berlaku ${skPeriodText}`}
          </p>

          <div className="ml-8 mb-4">
            <p><strong>Nama</strong> : {headmasterName}</p>
            <p><strong>Jabatan</strong> : {headmasterPosition}</p>
          </div>

          <p className="mb-4">melakukan pemeriksaan kas kepada:</p>

          <div className="ml-8 mb-4">
            <p><strong>Nama</strong> : {bendaharaName || '......................'}</p>
            <p><strong>Jabatan</strong> : Bendahara BOS</p>
          </div>

          <p className="text-justify mb-6 leading-relaxed">
            yang berdasarkan Surat Keputusan No. {audit.sk_number || '.............'} tanggal {audit.sk_date ? format(new Date(audit.sk_date), 'dd MMMM yyyy', { locale: localeId }) : '....................'} ditugaskan dengan pengurusan uang Dana BOS
          </p>

          <p className="text-justify mb-4 leading-relaxed">
            Berdasarkan pemeriksaan kas serta bukti-bukti dalam pengurusan itu, kami menemui kenyataan sebagai berikut:
          </p>

          <p className="mb-2">Jumlah uang yang dihitung di hadapan Bendahara/Pemegang Kas adalah:</p>

          <div className="mb-4">
            <div className="flex justify-between">
              <span>a) Uang kertas bank, uang logam</span>
              <span>Rp. {formatCurrency(subJumlah1 + subJumlah2)},-</span>
            </div>
            <div className="flex justify-between">
              <span>b) Saldo Bank</span>
              <span>Rp. {formatCurrency(Number(audit.saldo_bank))},-</span>
            </div>
            <div className="flex justify-between">
              <span>c) Surat Berharga dll</span>
              <span>Rp. {formatCurrency(Number(audit.surat_berharga))},-</span>
            </div>
          </div>

          <p className="text-center font-bold mb-4">Jumlah Rp. {formatCurrency(totalKas)},-</p>

          <div className="mb-4">
            <div className="flex justify-between">
              <span>Saldo uang menurut Buku Kas Umum</span>
              <span>Rp. {formatCurrency(saldoBuku)},-</span>
            </div>
            <div className="flex justify-between">
              <span>Perbedaan antara saldo kas dan saldo buku</span>
              <span>Rp. {formatCurrency(Math.abs(perbedaan))},-</span>
            </div>
          </div>

          {audit.penjelasan_perbedaan && (
            <p className="mb-6">Penjelasan Perbedaan: {audit.penjelasan_perbedaan}</p>
          )}

          <div className="text-right mb-8">
            Tanggal, {format(auditDate, 'dd MMMM yyyy', { locale: localeId })}
          </div>

          <div className="flex justify-between mt-12">
            <div className="text-center">
              <p>Bendahara/Pemegang Kas</p>
              <div className="h-16"></div>
              <p className="font-bold">{bendaharaName || '......................'}</p>
              {bendaharaNip && <p>NIP. {bendaharaNip}</p>}
            </div>
            <div className="text-center">
              <p>{headmasterPosition}</p>
              <div className="h-16"></div>
              <p className="font-bold">{headmasterName}</p>
              {headmasterNip && <p>NIP. {headmasterNip}</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CashAuditPreview;
