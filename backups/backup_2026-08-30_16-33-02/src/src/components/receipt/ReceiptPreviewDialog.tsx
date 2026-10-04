import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReceiptPdfSettingsPanel, ReceiptPdfSettings, DEFAULT_RECEIPT_SETTINGS } from "./ReceiptPdfSettings";
import { FileDown, Settings2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import jsPDF from "jspdf";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import { toTitleCase } from "@/lib/utils";
import { toast } from "sonner";

// Helper function to convert number to Indonesian words
const numberToWords = (num: number): string => {
  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  
  if (num < 12) return satuan[num];
  if (num < 20) return satuan[num - 10] + ' belas';
  if (num < 100) return satuan[Math.floor(num / 10)] + ' puluh ' + satuan[num % 10];
  if (num < 200) return 'seratus ' + numberToWords(num - 100);
  if (num < 1000) return satuan[Math.floor(num / 100)] + ' ratus ' + numberToWords(num % 100);
  if (num < 2000) return 'seribu ' + numberToWords(num - 1000);
  if (num < 1000000) return numberToWords(Math.floor(num / 1000)) + ' ribu ' + numberToWords(num % 1000);
  if (num < 1000000000) return numberToWords(Math.floor(num / 1000000)) + ' juta ' + numberToWords(num % 1000000);
  return num.toString();
};

const formatAmountToWords = (amount: number): string => {
  const words = numberToWords(amount).trim();
  return words.charAt(0).toUpperCase() + words.slice(1) + ' rupiah';
};

interface TravelRate {
  id: string;
  position_type: string;
  daily_rate: number;
  transport_rate: number;
  accommodation_rate: number;
}

interface ReceiptPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: any;
  teachers: any[];
  students: any[];
  travelRates: TravelRate[] | undefined;
  travelDays: number;
}

export function ReceiptPreviewDialog({ 
  open, 
  onOpenChange, 
  receipt, 
  teachers, 
  students, 
  travelRates, 
  travelDays 
}: ReceiptPreviewDialogProps) {
  const [settings, setSettings] = useState<ReceiptPdfSettings>(DEFAULT_RECEIPT_SETTINGS);
  const [showSettings, setShowSettings] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState<any>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch school settings once when dialog opens
  useEffect(() => {
    if (open && !schoolSettings) {
      supabase
        .from("school_settings")
        .select("*")
        .single()
        .then(({ data }) => {
          setSchoolSettings(data);
        });
    }
  }, [open, schoolSettings]);

  // Generate PDF with current settings
  const generatePDF = useCallback(async (pdfSettings: ReceiptPdfSettings, forDownload = false) => {
    if (!receipt || !schoolSettings) return null;

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const leftMargin = pdfSettings.marginLeft;
      
      let yPos = pdfSettings.marginTop;
      
      if (pdfSettings.showLetterhead && schoolSettings) {
        yPos = await addLetterheadToPDF(doc, {
          school_name: schoolSettings.school_name,
          district_name: schoolSettings.district_name,
          school_address: schoolSettings.school_address,
          school_phone: schoolSettings.school_phone,
          logo_url: schoolSettings.logo_url,
          right_logo_url: schoolSettings.right_logo_url,
          show_address: schoolSettings.show_address,
          show_phone: schoolSettings.show_phone,
        });
      }

      // Add "No TB :" at top right corner below letterhead
      doc.setFontSize(pdfSettings.signatureFontSize);
      doc.setFont("helvetica", "normal");
      doc.text(`No TB : .......`, pageWidth - pdfSettings.marginRight, yPos + 3, { align: "right" });

      yPos += 5;
      doc.setFontSize(pdfSettings.titleFontSize);
      doc.setFont("helvetica", "bold");
      doc.text("KWITANSI KOLEKTIF", pageWidth / 2, yPos, { align: "center" });
      
      yPos += 5;
      doc.setFontSize(pdfSettings.headerFontSize);
      doc.setFont("helvetica", "normal");
      doc.text(`No. ${receipt.receipt_number}`, pageWidth / 2, yPos, { align: "center" });

      const colonX = 50;
      const valueX = 55;

      yPos += 10;
      doc.setFontSize(pdfSettings.headerFontSize);
      doc.setFont("helvetica", "normal");
      doc.text("Sudah Diterima Dari", leftMargin, yPos);
      doc.text(":", colonX, yPos);
      doc.setFont("helvetica", "bold");
      doc.text(`Bendahara BOS ${schoolSettings?.school_name || ""}`, valueX, yPos);

      yPos += pdfSettings.headerSpacing;
      doc.setFont("helvetica", "normal");
      doc.text("Untuk Pembayaran", leftMargin, yPos);
      doc.text(":", colonX, yPos);
      doc.setFont("helvetica", "italic");
      const descLines = doc.splitTextToSize(receipt.description, pageWidth - valueX - 10);
      doc.text(descLines, valueX, yPos);
      yPos += (descLines.length - 1) * 4;

      // Table
      yPos += 10;
      const colNo = leftMargin;
      const colName = leftMargin + 8;
      const colNIP = leftMargin + 58;
      const colJabatan = leftMargin + 90;
      const colKelas = leftMargin + 110;
      const colHarga = leftMargin + 125;
      const colHari = leftMargin + 142;
      const colAmount = leftMargin + 155;
      const colTTD = pageWidth - pdfSettings.marginRight;
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(pdfSettings.tableFontSize);
      
      doc.setDrawColor(0);
      doc.setLineWidth(pdfSettings.tableLineWidth);
      doc.line(leftMargin, yPos - 3, pageWidth - pdfSettings.marginRight, yPos - 3);
      
      doc.text("No", colNo, yPos);
      doc.text("Nama", colName, yPos);
      doc.text("NIP/NIS", colNIP, yPos);
      doc.text("Jabatan", colJabatan, yPos);
      doc.text("Kelas", colKelas, yPos);
      doc.text("Satuan", colHarga, yPos);
      doc.text("Hari", colHari, yPos);
      doc.text("Jumlah (Rp)", colAmount, yPos);
      doc.text("TTD", colTTD, yPos, { align: "right" });
      
      yPos += 2;
      doc.line(leftMargin, yPos, pageWidth - pdfSettings.marginRight, yPos);
      
      // Table content
      doc.setFont("helvetica", "normal");
      
      let totalAmount = 0;
      let rowNumber = 0;
      
      const nameMaxWidth = colNIP - colName - 2;
      
      // Helper function to render name with word wrap
      const renderNameWithWrap = (name: string, maxWidth: number) => {
        const lines = doc.splitTextToSize(name || "-", maxWidth);
        return lines;
      };
      
      // Teachers
      teachers.forEach((teacher) => {
        const jabatan = teacher.jabatan || "Guru";
        const rate = travelRates?.find(r => r.position_type === jabatan);
        let dailyRate = 0;
        if (rate) {
          switch (receipt.payment_type) {
            case "transport": dailyRate = Number(rate.transport_rate); break;
            case "accommodation": dailyRate = Number(rate.accommodation_rate); break;
            case "meals": dailyRate = Number(rate.daily_rate); break;
          }
        }
        const amount = dailyRate * travelDays;
        
        rowNumber++;
        const nameLines = renderNameWithWrap(toTitleCase(teacher.full_name) || "-", nameMaxWidth);
        const rowHeight = Math.max(pdfSettings.tableRowHeight, nameLines.length * 3.5);
        yPos += rowHeight;
        
        doc.text(`${rowNumber}`, colNo, yPos - (nameLines.length > 1 ? (nameLines.length - 1) * 1.75 : 0));
        nameLines.forEach((line: string, idx: number) => {
          doc.text(line, colName, yPos - (nameLines.length - 1 - idx) * 3.5);
        });
        doc.text(teacher.nip || "-", colNIP, yPos);
        doc.text(jabatan, colJabatan, yPos);
        doc.text("-", colKelas, yPos);
        doc.text(dailyRate.toLocaleString("id-ID"), colHarga, yPos);
        doc.text(`${travelDays}`, colHari, yPos);
        doc.text(amount.toLocaleString("id-ID"), colAmount, yPos);
        doc.rect(colTTD - 18, yPos - 5, 18, 6);
        totalAmount += amount;
      });
      
      // Students
      students.forEach((student) => {
        const rate = travelRates?.find(r => r.position_type === "Siswa");
        let dailyRate = 0;
        if (rate) {
          switch (receipt.payment_type) {
            case "transport": dailyRate = Number(rate.transport_rate); break;
            case "accommodation": dailyRate = Number(rate.accommodation_rate); break;
            case "meals": dailyRate = Number(rate.daily_rate); break;
          }
        }
        const amount = dailyRate * travelDays;
        
        rowNumber++;
        const nameLines = renderNameWithWrap(toTitleCase(student.full_name) || "-", nameMaxWidth);
        const rowHeight = Math.max(pdfSettings.tableRowHeight, nameLines.length * 3.5);
        yPos += rowHeight;
        
        doc.text(`${rowNumber}`, colNo, yPos - (nameLines.length > 1 ? (nameLines.length - 1) * 1.75 : 0));
        nameLines.forEach((line: string, idx: number) => {
          doc.text(line, colName, yPos - (nameLines.length - 1 - idx) * 3.5);
        });
        doc.text(student.nis || "-", colNIP, yPos);
        doc.text("Siswa", colJabatan, yPos);
        doc.text(student.class_name || "-", colKelas, yPos);
        doc.text(dailyRate.toLocaleString("id-ID"), colHarga, yPos);
        doc.text(`${travelDays}`, colHari, yPos);
        doc.text(amount.toLocaleString("id-ID"), colAmount, yPos);
        doc.rect(colTTD - 18, yPos - 5, 18, 6);
        totalAmount += amount;
      });
      
      // Total line
      yPos += 3;
      doc.line(leftMargin, yPos, pageWidth - pdfSettings.marginRight, yPos);
      yPos += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(pdfSettings.tableFontSize + 1);
      doc.text("TOTAL", colJabatan, yPos);
      doc.text(totalAmount.toLocaleString("id-ID"), colAmount, yPos);
      yPos += 2;
      doc.line(leftMargin, yPos, pageWidth - pdfSettings.marginRight, yPos);

      // Terbilang
      yPos += 8;
      doc.setFontSize(pdfSettings.terbilangFontSize);
      doc.setFont("helvetica", "normal");
      doc.text("Terbilang:", leftMargin, yPos);
      doc.setFont("helvetica", "italic");
      const amountText = formatAmountToWords(totalAmount);
      const terbilangLines = doc.splitTextToSize(amountText, pageWidth - leftMargin - 30);
      doc.text(terbilangLines, leftMargin + 20, yPos);

      // Tax Section - tanpa jarak besar
      yPos += terbilangLines.length * 4 + pdfSettings.terbilangToTaxSpacing;
      
      if (pdfSettings.showTax) {
        doc.setFontSize(pdfSettings.tableFontSize + 1);
        doc.setFont("helvetica", "normal");
        doc.text("Informasi Potongan Pajak:", leftMargin, yPos);
        doc.text("PPh 21: -   |   PPh 23: -   |   PPN: -   |   Jumlah Potongan: -", leftMargin + 35, yPos);
      }

      // Signature Section
      yPos += pdfSettings.taxToSignatureSpacing;
      const col1X = leftMargin + pdfSettings.signatureColumnWidth;
      const col2X = pageWidth - leftMargin - pdfSettings.signatureColumnWidth;
      
      doc.setFontSize(pdfSettings.signatureFontSize);
      doc.setFont("helvetica", "normal");
      
      const sppdDate = receipt.official_travel_letters?.departure_date 
        ? format(new Date(receipt.official_travel_letters.departure_date), "dd MMMM yyyy", { locale: idLocale })
        : format(new Date(receipt.receipt_date), "dd MMMM yyyy", { locale: idLocale });
      
      const receiptDate = format(new Date(receipt.receipt_date), "dd MMMM yyyy", { locale: idLocale });
      
      doc.text("Menyetujui,", col1X, yPos, { align: "center" });
      doc.text(`Ciamis, ${sppdDate}`, col2X, yPos, { align: "center" });
      
      yPos += 5;
      doc.text(`Kepala ${schoolSettings?.school_name || "Sekolah"}`, col1X, yPos, { align: "center" });
      doc.text("Bendahara BOS", col2X, yPos, { align: "center" });
      
      yPos += pdfSettings.signatureNameSpacing;
      doc.setFont("helvetica", "bolditalic");
      doc.text(`Lunas Dibayar Tanggal: ${receiptDate}`, col2X, yPos, { align: "center" });

      yPos += pdfSettings.signatureSpacing;
      
      doc.setFont("helvetica", "bold");
      doc.text(toTitleCase(schoolSettings?.headmaster_name) || "", col1X, yPos, { align: "center" });
      doc.text(toTitleCase(schoolSettings?.bendahara_name) || ".........................", col2X, yPos, { align: "center" });
      
      yPos += pdfSettings.signatureNameSpacing;
      doc.setFontSize(pdfSettings.tableFontSize + 1);
      doc.setFont("helvetica", "normal");
      if (schoolSettings?.headmaster_nip) {
        doc.text(`NIP. ${schoolSettings.headmaster_nip}`, col1X, yPos, { align: "center" });
      }
      doc.text(schoolSettings?.bendahara_nip ? `NIP. ${schoolSettings.bendahara_nip}` : "NIP. .........................", col2X, yPos, { align: "center" });

      if (forDownload) {
        doc.save(`Kwitansi-Kolektif-${receipt.receipt_number}.pdf`);
        return null;
      }

      const pdfBlob = doc.output('blob');
      return URL.createObjectURL(pdfBlob);
    } catch (error) {
      console.error("Error generating PDF:", error);
      return null;
    }
  }, [receipt, schoolSettings, teachers, students, travelRates, travelDays]);

  // Debounced preview generation
  useEffect(() => {
    if (!open || !receipt || !schoolSettings) return;

    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setIsGenerating(true);

    // Debounce the PDF generation
    debounceRef.current = setTimeout(async () => {
      const url = await generatePDF(settings);
      if (url) {
        // Revoke previous URL
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        setPreviewUrl(url);
      }
      setIsGenerating(false);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [settings, open, receipt, schoolSettings, generatePDF]);

  // Cleanup on close
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    onOpenChange(isOpen);
  };

  const handleDownload = async () => {
    await generatePDF(settings, true);
    toast.success("PDF berhasil diunduh");
  };

  const handleReset = () => {
    setSettings(DEFAULT_RECEIPT_SETTINGS);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle>Preview Kwitansi Kolektif</DialogTitle>
            <DialogDescription>
              Sesuaikan pengaturan PDF dan lihat hasilnya secara real-time
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              {showSettings ? "Sembunyikan" : "Tampilkan"} Pengaturan
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleDownload}
            >
              <FileDown className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex flex-1 min-h-0">
          {/* PDF Preview */}
          <div className="flex-1 bg-muted/30 p-4 relative">
            {isGenerating && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Memperbarui preview...</span>
                </div>
              </div>
            )}
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full h-full border rounded-md bg-white"
                title="PDF Preview"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Memuat preview...
              </div>
            )}
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="w-80 border-l">
              <ReceiptPdfSettingsPanel
                settings={settings}
                onChange={setSettings}
                onReset={handleReset}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
