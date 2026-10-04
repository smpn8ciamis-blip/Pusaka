import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  FileDown,
  Settings2,
  Loader2,
  RotateCcw,
  Save,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import jsPDF from "jspdf";
import { toTitleCase } from "@/lib/utils";
import { toast } from "sonner";

// ============================================================
// SETTINGS TYPES & DEFAULT
// ============================================================
interface NarasumberPdfSettings {
  // Margin
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;

  // Font sizes
  titleFontSize: number;
  headerFontSize: number;
  tableFontSize: number;
  terbilangFontSize: number;
  signatureFontSize: number;

  // Spacing
  headerSpacing: number;
  tableRowHeight: number;
  terbilangToTaxSpacing: number;
  taxToSignatureSpacing: number;
  signatureSpacing: number;
  signatureNameSpacing: number;
  signatureColumnWidth: number;

  // Table line
  tableLineWidth: number;

  // Toggles
  showLetterhead: boolean;
  showTax: boolean;
  showNoTB: boolean;
  showReceiptNumber: boolean;

  // Kop surat
  logoSize: number;
  kopLineSpacing: number;
}

const DEFAULT_NARASUMBER_SETTINGS: NarasumberPdfSettings = {
  marginTop: 15,
  marginBottom: 15,
  marginLeft: 20,
  marginRight: 20,

  titleFontSize: 13,
  headerFontSize: 10,
  tableFontSize: 9,
  terbilangFontSize: 9,
  signatureFontSize: 10,

  headerSpacing: 5,
  tableRowHeight: 7,
  terbilangToTaxSpacing: 6,
  taxToSignatureSpacing: 20,
  signatureSpacing: 20,
  signatureNameSpacing: 5,
  signatureColumnWidth: 45,

  tableLineWidth: 0.3,

  showLetterhead: true,
  showTax: true,
  showNoTB: false,
  showReceiptNumber: false,

  logoSize: 22,
  kopLineSpacing: 2,
};

// ============================================================
// HELPERS
// ============================================================
const numberToWords = (num: number): string => {
  const satuan = [
    "", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh",
    "delapan", "sembilan", "sepuluh", "sebelas",
  ];
  if (num < 12) return satuan[num];
  if (num < 20) return satuan[num - 10] + " belas";
  if (num < 100) return satuan[Math.floor(num / 10)] + " puluh " + satuan[num % 10];
  if (num < 200) return "seratus " + numberToWords(num - 100);
  if (num < 1000) return satuan[Math.floor(num / 100)] + " ratus " + numberToWords(num % 100);
  if (num < 2000) return "seribu " + numberToWords(num - 1000);
  if (num < 1000000) return numberToWords(Math.floor(num / 1000)) + " ribu " + numberToWords(num % 1000);
  if (num < 1000000000) return numberToWords(Math.floor(num / 1000000)) + " juta " + numberToWords(num % 1000000);
  return num.toString();
};

const formatAmountToWords = (amount: number): string => {
  const words = numberToWords(amount).trim();
  return words.charAt(0).toUpperCase() + words.slice(1) + " rupiah";
};

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Load image from URL → dataURL
const loadImageAsDataUrl = (url: string): Promise<string | null> => {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

// ============================================================
// KOP SURAT (2 LOGO)
// ============================================================
const addLetterheadToPDF = async (
  doc: jsPDF,
  options: any,
  pdfSettings: NarasumberPdfSettings
): Promise<number> => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const leftMargin = pdfSettings.marginLeft;
  const rightMargin = pdfSettings.marginRight;
  const topMargin = pdfSettings.marginTop;
  const logoSize = pdfSettings.logoSize;

  let yPos = topMargin;

  const logoLeftUrl = options.logo_left_url || options.logo_url || "";
  const logoRightUrl =
    options.logo_right_url || options.right_logo_url || options.logo_url || "";

  const [logoLeft, logoRight] = await Promise.all([
    loadImageAsDataUrl(logoLeftUrl),
    loadImageAsDataUrl(logoRightUrl),
  ]);

  if (logoLeft) {
    try {
      doc.addImage(logoLeft, "PNG", leftMargin, yPos, logoSize, logoSize);
    } catch (e) {
      console.warn("Gagal menambahkan logo kiri:", e);
    }
  }

  if (logoRight) {
    try {
      doc.addImage(
        logoRight,
        "PNG",
        pageWidth - rightMargin - logoSize,
        yPos,
        logoSize,
        logoSize
      );
    } catch (e) {
      console.warn("Gagal menambahkan logo kanan:", e);
    }
  }

  const centerX = pageWidth / 2;
  const government =
    options.government_name || options.district_name || "PEMERINTAH KABUPATEN";
  const schoolName = options.school_name || "NAMA SEKOLAH";

  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(government.toUpperCase(), centerX, yPos + 5, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(schoolName.toUpperCase(), centerX, yPos + 13, { align: "center" });

  let textY = yPos + 19;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  if (options.show_address !== false && options.school_address) {
    doc.text(options.school_address, centerX, textY, { align: "center" });
    textY += 4;
  }

  const contactParts: string[] = [];
  if (options.show_phone !== false && options.school_phone) {
    contactParts.push(`Telp: ${options.school_phone}`);
  }
  if (options.school_email) contactParts.push(`Email: ${options.school_email}`);
  if (options.school_website) contactParts.push(options.school_website);

  if (contactParts.length > 0) {
    doc.text(contactParts.join(" | "), centerX, textY, { align: "center" });
    textY += 4;
  }

  const lineY = Math.max(textY, yPos + logoSize) + pdfSettings.kopLineSpacing;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(1);
  doc.line(leftMargin, lineY, pageWidth - rightMargin, lineY);
  doc.setLineWidth(0.3);
  doc.line(leftMargin, lineY + 1, pageWidth - rightMargin, lineY + 1);

  return lineY + 6;
};

// ============================================================
// PROPS
// ============================================================
interface NarasumberHonorariumPreviewProps {
  honorarium: any;
  schoolSettings?: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================
// COMPONENT
// ============================================================
export function NarasumberHonorariumPreview({
  honorarium,
  schoolSettings: schoolSettingsProp,
  open,
  onOpenChange,
}: NarasumberHonorariumPreviewProps) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NarasumberPdfSettings>(
    DEFAULT_NARASUMBER_SETTINGS
  );
  const [showSettings, setShowSettings] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<any>(
    schoolSettingsProp || null
  );
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch school settings
  useEffect(() => {
    if (open && !schoolSettings) {
      supabase
        .from("school_settings")
        .select("*")
        .single()
        .then(({ data }) => setSchoolSettings(data));
    }
  }, [open, schoolSettings]);

  // ============================================================
  // LOAD SETTINGS DARI DATABASE saat open
  // ============================================================
  useEffect(() => {
    if (!open || !user?.id) return;

    setIsLoadingSettings(true);
    supabase
      .from("narasumber_pdf_settings")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn("Gagal memuat pengaturan:", error.message);
        } else if (data?.settings) {
          setSettings({
            ...DEFAULT_NARASUMBER_SETTINGS,
            ...(data.settings as Partial<NarasumberPdfSettings>),
          });
        }
        setIsLoadingSettings(false);
      });
  }, [open, user?.id]);

  // ============================================================
  // SIMPAN SETTINGS KE DATABASE
  // ============================================================
  const handleSaveSettings = async () => {
    if (!user?.id) {
      toast.error("User tidak terautentikasi");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("narasumber_pdf_settings")
        .upsert(
          {
            user_id: user.id,
            settings: settings as any,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;

      setLastSaved(new Date());
      toast.success("Pengaturan berhasil disimpan");
    } catch (e: any) {
      console.error(e);
      toast.error("Gagal menyimpan pengaturan: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================================
  // RESET ke default
  // ============================================================
  const handleReset = () => {
    setSettings(DEFAULT_NARASUMBER_SETTINGS);
    toast.success("Pengaturan direset ke default");
  };

  // ============================================================
  // GENERATE PDF
  // ============================================================
  const generatePDF = useCallback(
    async (pdfSettings: NarasumberPdfSettings, forDownload = false) => {
      if (!honorarium || !schoolSettings) return null;

      try {
        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });
        const pageWidth = doc.internal.pageSize.getWidth();
        const leftMargin = pdfSettings.marginLeft;
        const rightMargin = pdfSettings.marginRight;

        let yPos = pdfSettings.marginTop;

        // === KOP SURAT ===
        if (pdfSettings.showLetterhead && schoolSettings) {
          yPos = await addLetterheadToPDF(
            doc,
            {
              school_name: schoolSettings.school_name,
              district_name: schoolSettings.district_name,
              government_name: schoolSettings.government_name,
              school_address: schoolSettings.school_address,
              school_phone: schoolSettings.school_phone,
              school_email: schoolSettings.school_email,
              school_website: schoolSettings.school_website,
              logo_url: schoolSettings.logo_url,
              logo_left_url:
                schoolSettings.logo_left_url ||
                schoolSettings.government_logo_url,
              logo_right_url:
                schoolSettings.logo_right_url ||
                schoolSettings.school_logo_url,
              right_logo_url: schoolSettings.right_logo_url,
              show_address: schoolSettings.show_address,
              show_phone: schoolSettings.show_phone,
            },
            pdfSettings
          );
        }

        // === No TB ===
        if (pdfSettings.showNoTB) {
          doc.setFontSize(pdfSettings.signatureFontSize);
          doc.setFont("helvetica", "normal");
          doc.text(`No TB : .......`, pageWidth - rightMargin, yPos + 3, {
            align: "right",
          });
          yPos += 5;
        }

        // === JUDUL ===
        doc.setFontSize(pdfSettings.titleFontSize);
        doc.setFont("helvetica", "bold");
        doc.text(
          "KWITANSI PEMBAYARAN HONORARIUM NARASUMBER",
          pageWidth / 2,
          yPos,
          { align: "center" }
        );
        yPos += 8;

        // === NO KWITANSI (opsional) ===
        if (pdfSettings.showReceiptNumber) {
          doc.setFontSize(pdfSettings.headerFontSize);
          doc.setFont("helvetica", "normal");
          doc.text(`No. ${honorarium.receipt_number}`, pageWidth / 2, yPos, {
            align: "center",
          });
          yPos += 6;
        }

        // === INFO ===
        yPos += 3;
        const colonX = leftMargin + 40;
        const valueX = leftMargin + 45;

        doc.setFontSize(pdfSettings.headerFontSize);
        doc.setFont("helvetica", "normal");

        // =========================================================
        // UANG SEBANYAK = TERBILANG DARI BRUTO (SEBELUM PAJAK)
        // =========================================================
        const brutoAmount = Number(honorarium.honorarium_amount) || 0;

        // Sudah terima dari
        doc.text("Sudah terima dari", leftMargin, yPos);
        doc.text(":", colonX, yPos);
        doc.setFont("helvetica", "bold");
        doc.text(`Bendahara ${schoolSettings?.school_name || ""}`, valueX, yPos);

        // Uang sebanyak → PAKAI BRUTO
        yPos += pdfSettings.headerSpacing;
        doc.setFont("helvetica", "normal");
        doc.text("Uang sebanyak", leftMargin, yPos);
        doc.text(":", colonX, yPos);
        doc.setFont("helvetica", "italic");
        doc.text(formatAmountToWords(brutoAmount), valueX, yPos);

        // Untuk pembayaran
        yPos += pdfSettings.headerSpacing;
        doc.setFont("helvetica", "normal");
        doc.text("Untuk pembayaran", leftMargin, yPos);
        doc.text(":", colonX, yPos);

        const typeName =
          honorarium.instructors?.narasumber_types?.name || "Narasumber";
        const period = `${MONTHS[honorarium.payment_month - 1]} ${honorarium.payment_year}`;
        const activity = honorarium.activity_name
          ? ` dalam kegiatan "${honorarium.activity_name}"`
          : "";
        const descText = `Honorarium Narasumber ${typeName}${activity} bulan ${period}`;
        const descLines = doc.splitTextToSize(
          descText,
          pageWidth - valueX - rightMargin
        );
        doc.text(descLines, valueX, yPos);
        yPos += (descLines.length - 1) * 4;

        // Nama penerima
        yPos += pdfSettings.headerSpacing;
        doc.text("Nama penerima", leftMargin, yPos);
        doc.text(":", colonX, yPos);
        doc.setFont("helvetica", "bold");
        doc.text(honorarium.instructors?.name || "-", valueX, yPos);

        // NIP
        yPos += pdfSettings.headerSpacing;
        doc.setFont("helvetica", "normal");
        doc.text("NIP", leftMargin, yPos);
        doc.text(":", colonX, yPos);
        doc.text(honorarium.instructors?.nip || "-", valueX, yPos);

        // NUPTK
        yPos += pdfSettings.headerSpacing;
        doc.text("NUPTK", leftMargin, yPos);
        doc.text(":", colonX, yPos);
        doc.text(honorarium.instructors?.nuptk || "-", valueX, yPos);

        // Pangkat/Golongan
        yPos += pdfSettings.headerSpacing;
        doc.text("Pangkat/Golongan", leftMargin, yPos);
        doc.text(":", colonX, yPos);
        doc.text(honorarium.instructors?.pangkat_golongan || "-", valueX, yPos);

        // Jabatan
        yPos += pdfSettings.headerSpacing;
        doc.text("Jabatan", leftMargin, yPos);
        doc.text(":", colonX, yPos);
        doc.text(honorarium.instructors?.jabatan || typeName, valueX, yPos);

        // Tanggal
        yPos += pdfSettings.headerSpacing;
        doc.text("Tanggal", leftMargin, yPos);
        doc.text(":", colonX, yPos);
        doc.text(
          format(new Date(honorarium.receipt_date), "d MMMM yyyy", {
            locale: idLocale,
          }),
          valueX,
          yPos
        );

        // === TABEL JUMLAH ===
        yPos += 10;
        const colKeterangan = leftMargin;
        const colJumlah = pageWidth - rightMargin;

        doc.setFontSize(pdfSettings.tableFontSize);
        doc.setFont("helvetica", "bold");

        doc.setDrawColor(0);
        doc.setLineWidth(pdfSettings.tableLineWidth);
        doc.line(leftMargin, yPos - 3, pageWidth - rightMargin, yPos - 3);

        doc.text("Keterangan", colKeterangan, yPos);
        doc.text("Jumlah", colJumlah, yPos, { align: "right" });

        yPos += 2;
        doc.line(leftMargin, yPos, pageWidth - rightMargin, yPos);

        // Baris 1: Honorarium Bruto
        yPos += pdfSettings.tableRowHeight;
        doc.setFont("helvetica", "normal");
        doc.text("Honorarium Bruto", colKeterangan, yPos);
        doc.text(
          honorarium.honorarium_amount.toLocaleString("id-ID"),
          colJumlah,
          yPos,
          { align: "right" }
        );

        // Baris 2: Pajak
        yPos += pdfSettings.tableRowHeight;
        doc.text(`Pajak (${honorarium.tax_percentage}%)`, colKeterangan, yPos);
        doc.text(
          `(${honorarium.tax_amount.toLocaleString("id-ID")})`,
          colJumlah,
          yPos,
          { align: "right" }
        );

        // Baris 3: Netto
        yPos += pdfSettings.tableRowHeight;
        doc.setFont("helvetica", "bold");
        doc.text("Honorarium Netto", colKeterangan, yPos);
        doc.text(
          honorarium.net_amount.toLocaleString("id-ID"),
          colJumlah,
          yPos,
          { align: "right" }
        );

        yPos += 3;
        doc.line(leftMargin, yPos, pageWidth - rightMargin, yPos);

        // === TERBILANG ===
        // Terbilang di bawah tabel = netto (yang dibayarkan)
        yPos += 8;
        doc.setFontSize(pdfSettings.terbilangFontSize);
        doc.setFont("helvetica", "normal");
        doc.text("Terbilang:", leftMargin, yPos);
        doc.setFont("helvetica", "italic");
        const amountText = formatAmountToWords(honorarium.net_amount);
        const terbilangLines = doc.splitTextToSize(
          amountText,
          pageWidth - leftMargin - 30
        );
        doc.text(terbilangLines, leftMargin + 20, yPos);

        // === INFO PAJAK DINAMIS ===
        yPos += terbilangLines.length * 4;

        if (pdfSettings.showTax) {
          yPos += pdfSettings.terbilangToTaxSpacing;

          const pphAmount = Number(honorarium.tax_amount) || 0;
          const pphPct = Number(honorarium.tax_percentage) || 0;
          const nettoAmount = Number(honorarium.net_amount) || 0;

          const taxParts: string[] = [];

          if (pphAmount > 0) {
            taxParts.push(
              `PPh 21 (${pphPct}%): ${pphAmount.toLocaleString("id-ID")}`
            );
          } else {
            taxParts.push(`PPh 21: -`);
          }

          taxParts.push(`PPh 23: -`);
          taxParts.push(`PPN: -`);

          if (pphAmount > 0) {
            taxParts.push(
              `Jumlah Potongan: ${pphAmount.toLocaleString("id-ID")}`
            );
            taxParts.push(
              `Diterima Netto: ${nettoAmount.toLocaleString("id-ID")}`
            );
          } else {
            taxParts.push(`Jumlah Potongan: -`);
          }

          const taxLine = taxParts.join("  |  ");

          doc.setFontSize(pdfSettings.tableFontSize);
          doc.setFont("helvetica", "normal");
          doc.text("Informasi Potongan Pajak:", leftMargin, yPos);

          const taxText = doc.splitTextToSize(
            taxLine,
            pageWidth - leftMargin - 55
          );
          doc.text(taxText, leftMargin + 50, yPos);
          yPos += taxText.length * 4;
        }

        // === TANDA TANGAN (3 KOLOM SEJAJAR) ===
        yPos += pdfSettings.taxToSignatureSpacing;

        const contentWidth = pageWidth - leftMargin - rightMargin;
        const colWidth = contentWidth / 3;
        const col1Center = leftMargin + colWidth * 0.5;
        const col2Center = leftMargin + colWidth * 1.5;
        const col3Center = leftMargin + colWidth * 2.5;

        doc.setFontSize(pdfSettings.signatureFontSize);
        doc.setFont("helvetica", "normal");

        const receiptDate = format(
          new Date(honorarium.receipt_date),
          "d MMMM yyyy",
          { locale: idLocale }
        );

        // Baris 1: Label
        doc.setFont("helvetica", "normal");
        doc.text("Menyetujui,", col1Center, yPos, { align: "center" });

        doc.setFont("helvetica", "bolditalic");
        doc.setFontSize(pdfSettings.signatureFontSize - 0.5);
        doc.text(`Lunas Dibayar, ${receiptDate}`, col2Center, yPos, {
          align: "center",
        });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(pdfSettings.signatureFontSize);
        doc.text(`Ciamis, ${receiptDate}`, col3Center, yPos, {
          align: "center",
        });

        // Baris 2: Jabatan
        yPos += 5;
        doc.setFont("helvetica", "normal");
        doc.text(
          `Kepala ${schoolSettings?.school_name || "Sekolah"}`,
          col1Center,
          yPos,
          { align: "center" }
        );
        doc.text("Bendahara BOS", col2Center, yPos, { align: "center" });
        doc.text("Penerima", col3Center, yPos, { align: "center" });

        // Ruang TTD
        yPos += pdfSettings.signatureSpacing;

        // Baris 3: Nama
        doc.setFont("helvetica", "bold");
        doc.setFontSize(pdfSettings.signatureFontSize);

        const headmasterName = toTitleCase(
          schoolSettings?.headmaster_name ||
            schoolSettings?.kepala_sekolah ||
            ".................."
        );
        doc.text(headmasterName, col1Center, yPos, { align: "center" });

        const treasurerName = toTitleCase(
          schoolSettings?.bendahara_name || ".................."
        );
        doc.text(treasurerName, col2Center, yPos, { align: "center" });

        const recipientName = toTitleCase(
          honorarium.instructors?.name || ".................."
        );
        doc.text(recipientName, col3Center, yPos, { align: "center" });

        // Baris 4: NIP / NUPTK
        yPos += pdfSettings.signatureNameSpacing;
        doc.setFontSize(pdfSettings.tableFontSize + 1);
        doc.setFont("helvetica", "normal");

        const headmasterNip =
          schoolSettings?.headmaster_nip ||
          schoolSettings?.nip_kepala_sekolah;
        if (headmasterNip) {
          doc.text(`NIP. ${headmasterNip}`, col1Center, yPos, {
            align: "center",
          });
        } else {
          doc.text("NIP. -", col1Center, yPos, { align: "center" });
        }

        if (schoolSettings?.bendahara_nip) {
          doc.text(`NIP. ${schoolSettings.bendahara_nip}`, col2Center, yPos, {
            align: "center",
          });
        } else {
          doc.text("NIP. -", col2Center, yPos, { align: "center" });
        }

        const recipientNip = honorarium.instructors?.nip;
        const recipientNuptk = honorarium.instructors?.nuptk;
        if (recipientNip) {
          doc.text(`NIP. ${recipientNip}`, col3Center, yPos, {
            align: "center",
          });
        } else if (recipientNuptk) {
          doc.text(`NUPTK. ${recipientNuptk}`, col3Center, yPos, {
            align: "center",
          });
        } else {
          doc.text("NIP. -", col3Center, yPos, { align: "center" });
        }

        // === DOWNLOAD / PREVIEW ===
        if (forDownload) {
          doc.save(
            `Kwitansi-Narasumber-${honorarium.receipt_number.replace(
              /\//g,
              "-"
            )}.pdf`
          );
          return null;
        }

        const pdfBlob = doc.output("blob");
        return URL.createObjectURL(pdfBlob);
      } catch (error) {
        console.error("Error generating PDF:", error);
        toast.error("Gagal membuat PDF");
        return null;
      }
    },
    [honorarium, schoolSettings]
  );

  // ============================================================
  // DEBOUNCED PREVIEW
  // ============================================================
  useEffect(() => {
    if (!open || !honorarium || !schoolSettings || isLoadingSettings) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsGenerating(true);

    debounceRef.current = setTimeout(async () => {
      const url = await generatePDF(settings);
      if (url) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(url);
      }
      setIsGenerating(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [settings, open, honorarium, schoolSettings, generatePDF, isLoadingSettings]);

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

  // ============================================================
  // SETTINGS PANEL (INLINE)
  // ============================================================
  const NumberInput = ({
    label,
    field,
    min = 0,
    max = 100,
    step = 1,
  }: {
    label: string;
    field: keyof NarasumberPdfSettings;
    min?: number;
    max?: number;
    step?: number;
  }) => (
    <div className="grid grid-cols-2 items-center gap-2">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={settings[field] as number}
        onChange={(e) =>
          setSettings({ ...settings, [field]: parseFloat(e.target.value) || 0 })
        }
        min={min}
        max={max}
        step={step}
        className="h-8 text-xs"
      />
    </div>
  );

  const SettingsPanel = () => (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm">Pengaturan PDF</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            title="Reset ke default"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSaveSettings}
            disabled={isSaving}
            title="Simpan pengaturan"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span className="ml-1 text-xs">Simpan</span>
          </Button>
        </div>
      </div>

      {lastSaved && (
        <div className="px-4 py-1.5 bg-green-50 border-b flex items-center gap-1.5">
          <Check className="h-3 w-3 text-green-600" />
          <span className="text-xs text-green-700">
            Tersimpan {format(lastSaved, "HH:mm:ss")}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Separator />

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">
            Tampilan
          </h4>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Kop Surat</Label>
            <Switch
              checked={settings.showLetterhead}
              onCheckedChange={(v) =>
                setSettings({ ...settings, showLetterhead: v })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Info Pajak</Label>
            <Switch
              checked={settings.showTax}
              onCheckedChange={(v) => setSettings({ ...settings, showTax: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">No TB</Label>
            <Switch
              checked={settings.showNoTB}
              onCheckedChange={(v) => setSettings({ ...settings, showNoTB: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">No. Kwitansi</Label>
            <Switch
              checked={settings.showReceiptNumber}
              onCheckedChange={(v) =>
                setSettings({ ...settings, showReceiptNumber: v })
              }
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">
            Margin (mm)
          </h4>
          <NumberInput label="Atas" field="marginTop" min={5} max={40} />
          <NumberInput label="Bawah" field="marginBottom" min={5} max={40} />
          <NumberInput label="Kiri" field="marginLeft" min={5} max={40} />
          <NumberInput label="Kanan" field="marginRight" min={5} max={40} />
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">
            Ukuran Font
          </h4>
          <NumberInput label="Judul" field="titleFontSize" min={8} max={24} />
          <NumberInput label="Header" field="headerFontSize" min={6} max={16} />
          <NumberInput label="Tabel" field="tableFontSize" min={6} max={14} />
          <NumberInput
            label="Terbilang"
            field="terbilangFontSize"
            min={6}
            max={14}
          />
          <NumberInput
            label="Tanda Tangan"
            field="signatureFontSize"
            min={6}
            max={14}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">
            Jarak (mm)
          </h4>
          <NumberInput label="Header" field="headerSpacing" min={2} max={15} />
          <NumberInput
            label="Baris Tabel"
            field="tableRowHeight"
            min={3}
            max={15}
          />
          <NumberInput
            label="Terbilang→Pajak"
            field="terbilangToTaxSpacing"
            min={0}
            max={20}
          />
          <NumberInput
            label="Pajak→TTD"
            field="taxToSignatureSpacing"
            min={5}
            max={50}
          />
          <NumberInput
            label="Spasi TTD"
            field="signatureSpacing"
            min={10}
            max={50}
          />
          <NumberInput
            label="Spasi Nama TTD"
            field="signatureNameSpacing"
            min={1}
            max={15}
          />
          <NumberInput
            label="Lebar Kolom TTD"
            field="signatureColumnWidth"
            min={30}
            max={80}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">
            Garis
          </h4>
          <NumberInput
            label="Ketebalan"
            field="tableLineWidth"
            min={0.1}
            max={2}
            step={0.1}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">
            Kop Surat
          </h4>
          <NumberInput
            label="Ukuran Logo"
            field="logoSize"
            min={10}
            max={40}
          />
          <NumberInput
            label="Jarak Garis"
            field="kopLineSpacing"
            min={0}
            max={10}
            step={0.5}
          />
        </div>
      </div>
    </div>
  );

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle>Preview Kwitansi Honorarium Narasumber</DialogTitle>
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
            <Button variant="default" size="sm" onClick={handleDownload}>
              <FileDown className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
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

          {showSettings && (
            <div className="w-80 border-l bg-background">
              <SettingsPanel />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}