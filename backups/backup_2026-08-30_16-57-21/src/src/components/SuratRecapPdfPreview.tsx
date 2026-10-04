import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { FileText, Download, Eye, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF, addWatermarkToPDF, LetterheadSettings } from '@/lib/pdfLetterhead';
import { toast } from 'sonner';

interface SuratMasuk {
  id: string;
  nomor_surat: string;
  tanggal_surat: string;
  tanggal_diterima: string;
  pengirim: string;
  perihal: string;
  kategori: string;
}

interface SuratKeluar {
  id: string;
  nomor_surat: string;
  tanggal_surat: string;
  tujuan: string;
  perihal: string;
  kategori: string;
}

interface SchoolSettings {
  school_name: string;
  district_name: string | null;
  school_address: string | null;
  school_phone: string | null;
  logo_url: string | null;
  right_logo_url: string | null;
  headmaster_name: string;
  headmaster_nip: string | null;
  watermark_enabled: boolean | null;
  watermark_url: string | null;
  watermark_opacity: number | null;
  watermark_size: number | null;
  watermark_position: string | null;
  logo_width: number | null;
  logo_height: number | null;
  logo_position_x: number | null;
  logo_position_y: number | null;
  right_logo_width: number | null;
  right_logo_height: number | null;
  right_logo_position_x: number | null;
  right_logo_position_y: number | null;
  header_font_size: number | null;
  subheader_font_size: number | null;
  header_font_style: string | null;
  district_font_size: number | null;
  district_font_style: string | null;
  district_line_spacing: number | null;
  school_line_spacing: number | null;
  show_address: boolean | null;
  show_phone: boolean | null;
}

const KATEGORI_OPTIONS = [
  { value: 'umum', label: 'Umum' },
  { value: 'keuangan', label: 'Keuangan' },
  { value: 'kepegawaian', label: 'Kepegawaian' },
  { value: 'kesiswaan', label: 'Kesiswaan' },
  { value: 'kurikulum', label: 'Kurikulum' },
  { value: 'sarana', label: 'Sarana Prasarana' },
];

type ReportType = 'masuk' | 'keluar' | 'both';

interface SuratRecapPdfPreviewProps {
  type?: ReportType;
  buttonVariant?: 'default' | 'outline' | 'ghost';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
}

export function SuratRecapPdfPreview({ 
  type: defaultType = 'both',
  buttonVariant = 'outline',
  buttonSize = 'default'
}: SuratRecapPdfPreviewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>(defaultType);
  const [startDate, setStartDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings-pdf'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_settings')
        .select('*')
        .single();
      if (error) throw error;
      return data as SchoolSettings;
    },
  });

  const { data: suratMasukList } = useQuery({
    queryKey: ['surat-masuk-recap', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_masuk')
        .select('id, nomor_surat, tanggal_surat, tanggal_diterima, pengirim, perihal, kategori')
        .gte('tanggal_diterima', startDate)
        .lte('tanggal_diterima', endDate)
        .order('tanggal_diterima', { ascending: true });
      if (error) throw error;
      return data as SuratMasuk[];
    },
    enabled: dialogOpen && (reportType === 'masuk' || reportType === 'both'),
  });

  const { data: suratKeluarList } = useQuery({
    queryKey: ['surat-keluar-recap', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_keluar')
        .select('id, nomor_surat, tanggal_surat, tujuan, perihal, kategori')
        .gte('tanggal_surat', startDate)
        .lte('tanggal_surat', endDate)
        .order('tanggal_surat', { ascending: true });
      if (error) throw error;
      return data as SuratKeluar[];
    },
    enabled: dialogOpen && (reportType === 'keluar' || reportType === 'both'),
  });

  const getKategoriLabel = (value: string) => {
    return KATEGORI_OPTIONS.find((k) => k.value === value)?.label || value;
  };

  const generatePDF = async (preview = true) => {
    if (!schoolSettings) {
      toast.error('Pengaturan sekolah belum dimuat');
      return;
    }

    setGenerating(true);

    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Prepare letterhead settings
      const letterheadSettings: LetterheadSettings = {
        school_name: schoolSettings.school_name,
        district_name: schoolSettings.district_name || undefined,
        school_address: schoolSettings.school_address || undefined,
        school_phone: schoolSettings.school_phone || undefined,
        logo_url: schoolSettings.logo_url || undefined,
        right_logo_url: schoolSettings.right_logo_url || undefined,
        logo_width: schoolSettings.logo_width || undefined,
        logo_height: schoolSettings.logo_height || undefined,
        logo_position_x: schoolSettings.logo_position_x || undefined,
        logo_position_y: schoolSettings.logo_position_y || undefined,
        right_logo_width: schoolSettings.right_logo_width || undefined,
        right_logo_height: schoolSettings.right_logo_height || undefined,
        right_logo_position_x: schoolSettings.right_logo_position_x || undefined,
        right_logo_position_y: schoolSettings.right_logo_position_y || undefined,
        header_font_size: schoolSettings.header_font_size || undefined,
        subheader_font_size: schoolSettings.subheader_font_size || undefined,
        header_font_style: schoolSettings.header_font_style || undefined,
        district_font_size: schoolSettings.district_font_size || undefined,
        district_font_style: schoolSettings.district_font_style || undefined,
        district_line_spacing: schoolSettings.district_line_spacing || undefined,
        school_line_spacing: schoolSettings.school_line_spacing || undefined,
        show_address: schoolSettings.show_address ?? true,
        show_phone: schoolSettings.show_phone ?? true,
        watermark_enabled: schoolSettings.watermark_enabled || false,
        watermark_url: schoolSettings.watermark_url || undefined,
        watermark_opacity: schoolSettings.watermark_opacity || undefined,
        watermark_size: schoolSettings.watermark_size || undefined,
        watermark_position: schoolSettings.watermark_position || undefined,
      };

      // Add watermark if enabled
      if (letterheadSettings.watermark_enabled && letterheadSettings.watermark_url) {
        await addWatermarkToPDF(doc, letterheadSettings);
      }

      // Add letterhead
      let yPos = await addLetterheadToPDF(doc, letterheadSettings);
      yPos += 10;

      // Title
      const title = reportType === 'masuk' 
        ? 'REKAPITULASI SURAT MASUK'
        : reportType === 'keluar' 
        ? 'REKAPITULASI SURAT KELUAR'
        : 'REKAPITULASI SURAT MASUK DAN KELUAR';
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(title, pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;

      // Date range
      const dateRange = `Periode: ${format(new Date(startDate), 'd MMMM yyyy', { locale: id })} - ${format(new Date(endDate), 'd MMMM yyyy', { locale: id })}`;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(dateRange, pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      // Surat Masuk Table
      if ((reportType === 'masuk' || reportType === 'both') && suratMasukList && suratMasukList.length > 0) {
        if (reportType === 'both') {
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('A. SURAT MASUK', 14, yPos);
          yPos += 6;
        }

        const masukTableData = suratMasukList.map((surat, index) => [
          (index + 1).toString(),
          surat.nomor_surat,
          format(new Date(surat.tanggal_surat), 'dd/MM/yyyy'),
          format(new Date(surat.tanggal_diterima), 'dd/MM/yyyy'),
          surat.pengirim,
          surat.perihal,
          getKategoriLabel(surat.kategori),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['No', 'Nomor Surat', 'Tgl Surat', 'Tgl Diterima', 'Pengirim', 'Perihal', 'Kategori']],
          body: masukTableData,
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: [255, 255, 255],
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center',
          },
          bodyStyles: {
            fontSize: 8,
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { cellWidth: 25 },
            2: { halign: 'center', cellWidth: 20 },
            3: { halign: 'center', cellWidth: 20 },
            4: { cellWidth: 35 },
            5: { cellWidth: 50 },
            6: { halign: 'center', cellWidth: 22 },
          },
          margin: { left: 14, right: 14 },
          didDrawPage: (data) => {
            // Add page number
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(
              `Halaman ${doc.getCurrentPageInfo().pageNumber}`,
              pageWidth / 2,
              doc.internal.pageSize.getHeight() - 10,
              { align: 'center' }
            );
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 8;
      }

      // Surat Keluar Table
      if ((reportType === 'keluar' || reportType === 'both') && suratKeluarList && suratKeluarList.length > 0) {
        // Check if need new page
        if (yPos > doc.internal.pageSize.getHeight() - 60) {
          doc.addPage();
          yPos = 20;
        }

        if (reportType === 'both') {
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('B. SURAT KELUAR', 14, yPos);
          yPos += 6;
        }

        const keluarTableData = suratKeluarList.map((surat, index) => [
          (index + 1).toString(),
          surat.nomor_surat,
          format(new Date(surat.tanggal_surat), 'dd/MM/yyyy'),
          surat.tujuan,
          surat.perihal,
          getKategoriLabel(surat.kategori),
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['No', 'Nomor Surat', 'Tgl Surat', 'Tujuan', 'Perihal', 'Kategori']],
          body: keluarTableData,
          headStyles: {
            fillColor: [34, 197, 94],
            textColor: [255, 255, 255],
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center',
          },
          bodyStyles: {
            fontSize: 8,
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { cellWidth: 30 },
            2: { halign: 'center', cellWidth: 22 },
            3: { cellWidth: 40 },
            4: { cellWidth: 55 },
            5: { halign: 'center', cellWidth: 25 },
          },
          margin: { left: 14, right: 14 },
          didDrawPage: (data) => {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(
              `Halaman ${doc.getCurrentPageInfo().pageNumber}`,
              pageWidth / 2,
              doc.internal.pageSize.getHeight() - 10,
              { align: 'center' }
            );
          },
        });

        yPos = (doc as any).lastAutoTable.finalY + 8;
      }

      // Summary section
      if (yPos > doc.internal.pageSize.getHeight() - 50) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('RINGKASAN:', 14, yPos);
      yPos += 6;

      doc.setFont('helvetica', 'normal');
      if (reportType === 'masuk' || reportType === 'both') {
        doc.text(`• Total Surat Masuk: ${suratMasukList?.length || 0} surat`, 18, yPos);
        yPos += 5;
      }
      if (reportType === 'keluar' || reportType === 'both') {
        doc.text(`• Total Surat Keluar: ${suratKeluarList?.length || 0} surat`, 18, yPos);
        yPos += 5;
      }

      // Signature section
      yPos += 10;
      const signatureX = pageWidth - 70;
      
      doc.setFontSize(10);
      doc.text(`Ciamis, ${format(new Date(), 'd MMMM yyyy', { locale: id })}`, signatureX, yPos);
      yPos += 5;
      doc.text('Kepala Sekolah,', signatureX, yPos);
      yPos += 25;
      doc.setFont('helvetica', 'bold');
      doc.text(schoolSettings.headmaster_name, signatureX, yPos);
      if (schoolSettings.headmaster_nip) {
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.text(`NIP. ${schoolSettings.headmaster_nip}`, signatureX, yPos);
      }

      if (preview) {
        const pdfBlob = doc.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        setPdfUrl(url);
      } else {
        const fileName = `Rekapitulasi_Surat_${reportType === 'masuk' ? 'Masuk' : reportType === 'keluar' ? 'Keluar' : 'Masuk_Keluar'}_${format(new Date(), 'yyyyMMdd')}.pdf`;
        doc.save(fileName);
        toast.success('PDF berhasil diunduh');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Gagal membuat PDF');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (dialogOpen) {
      setPdfUrl(null);
    }
  }, [dialogOpen, reportType, startDate, endDate]);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant} size={buttonSize}>
          <Printer className="h-4 w-4 mr-2" />
          Cetak Rekapitulasi
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Preview Rekapitulasi Surat
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-wrap gap-4 items-end pb-4 border-b">
          <div className="space-y-1">
            <label className="text-sm font-medium">Jenis Laporan</label>
            <Select value={reportType} onValueChange={(v: ReportType) => setReportType(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Masuk & Keluar</SelectItem>
                <SelectItem value="masuk">Surat Masuk</SelectItem>
                <SelectItem value="keluar">Surat Keluar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1">
            <label className="text-sm font-medium">Tanggal Mulai</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[150px]"
            />
          </div>
          
          <div className="space-y-1">
            <label className="text-sm font-medium">Tanggal Akhir</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[150px]"
            />
          </div>

          <Button onClick={() => generatePDF(true)} disabled={generating}>
            <Eye className="h-4 w-4 mr-2" />
            {generating ? 'Memproses...' : 'Preview'}
          </Button>
          
          <Button onClick={() => generatePDF(false)} disabled={generating} variant="default">
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full min-h-[500px] border rounded-lg"
              title="PDF Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full min-h-[500px] bg-muted/50 rounded-lg">
              <div className="text-center text-muted-foreground">
                <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>Klik tombol "Preview" untuk melihat dokumen</p>
                <p className="text-sm mt-2">
                  {reportType === 'masuk' 
                    ? `${suratMasukList?.length || 0} surat masuk ditemukan`
                    : reportType === 'keluar'
                    ? `${suratKeluarList?.length || 0} surat keluar ditemukan`
                    : `${suratMasukList?.length || 0} surat masuk, ${suratKeluarList?.length || 0} surat keluar ditemukan`
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
