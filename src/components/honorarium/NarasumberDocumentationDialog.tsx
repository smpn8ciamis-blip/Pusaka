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
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Trash2,
  Loader2,
  FileDown,
  Image as ImageIcon,
  Check,
  Printer,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { compressImage, loadImageAsDataUrl } from "@/lib/imageCompress";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// ============================================================
// HELPER LOKAL: Load logo sebagai PNG (transparan)
// ============================================================
const loadLogoAsPng = (url: string): Promise<string | null> => {
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

      // Jangan fill background — biarkan transparan
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

interface Documentation {
  id: string;
  honorarium_id: string;
  file_path: string;
  file_name: string;
  caption: string | null;
  file_size: number;
  mime_type: string;
  created_at: string;
  public_url?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  honorarium: any;
  schoolSettings: any;
}

export function NarasumberDocumentationDialog({
  open,
  onOpenChange,
  honorarium,
  schoolSettings,
}: Props) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Documentation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  // ============================================================
  // FETCH DOCS
  // ============================================================
  const fetchDocs = useCallback(async () => {
    if (!honorarium?.id) return;
    setIsLoading(true);

    const { data, error } = await supabase
      .from("narasumber_documentation")
      .select("*")
      .eq("honorarium_id", honorarium.id)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Gagal memuat dokumentasi: " + error.message);
      setIsLoading(false);
      return;
    }

    const docsWithUrl: Documentation[] = (data || []).map((d: any) => ({
      ...d,
      public_url: supabase.storage
        .from("narasumber-documentation")
        .getPublicUrl(d.file_path).data.publicUrl,
    }));

    setDocs(docsWithUrl);

    const drafts: Record<string, string> = {};
    docsWithUrl.forEach((d) => {
      drafts[d.id] = d.caption || "";
    });
    setCaptionDrafts(drafts);

    setIsLoading(false);
  }, [honorarium?.id]);

  useEffect(() => {
    if (open) fetchDocs();
  }, [open, fetchDocs]);

  useEffect(() => {
    if (!open) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setShowPreview(false);
    }
  }, [open]);

  // ============================================================
  // UPLOAD
  // ============================================================
  const handleUpload = async (files: FileList) => {
    if (!user?.id || !honorarium?.id) {
      toast.error("User tidak terautentikasi");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const fileArray = Array.from(files);
    const total = fileArray.length;
    let uploaded = 0;
    let failed = 0;

    for (const file of fileArray) {
      try {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} bukan file gambar`);
          failed++;
          continue;
        }

        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} terlalu besar (max 10MB)`);
          failed++;
          continue;
        }

        const compressed = await compressImage(file, {
          maxWidth: 1600,
          maxHeight: 1600,
          quality: 0.75,
        });

        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const fileName = `${timestamp}-${random}.jpg`;
        const filePath = `${honorarium.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("narasumber-documentation")
          .upload(filePath, compressed, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase
          .from("narasumber_documentation")
          .insert({
            honorarium_id: honorarium.id,
            file_path: filePath,
            file_name: file.name,
            file_size: compressed.size,
            mime_type: "image/jpeg",
            created_by: user.id,
          });

        if (dbError) {
          await supabase.storage
            .from("narasumber-documentation")
            .remove([filePath]);
          throw dbError;
        }

        uploaded++;
        setUploadProgress(Math.round((uploaded / total) * 100));
      } catch (e: any) {
        console.error("Upload error:", e);
        toast.error(`Gagal upload ${file.name}: ${e.message}`);
        failed++;
      }
    }

    setIsUploading(false);
    setUploadProgress(0);

    if (uploaded > 0) {
      toast.success(
        `${uploaded} foto berhasil diupload${failed > 0 ? `, ${failed} gagal` : ""}`
      );
      fetchDocs();
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ============================================================
  // DELETE
  // ============================================================
  const handleDelete = async (doc: Documentation) => {
    if (!confirm("Hapus dokumentasi ini?")) return;

    try {
      await supabase.storage
        .from("narasumber-documentation")
        .remove([doc.file_path]);

      const { error } = await supabase
        .from("narasumber_documentation")
        .delete()
        .eq("id", doc.id);

      if (error) throw error;

      toast.success("Dokumentasi dihapus");
      fetchDocs();
    } catch (e: any) {
      toast.error("Gagal hapus: " + e.message);
    }
  };

  // ============================================================
  // UPDATE CAPTION
  // ============================================================
  const handleSaveCaption = async (id: string) => {
    const caption = captionDrafts[id] || "";
    const current = docs.find((d) => d.id === id);
    if (current?.caption === caption) return;

    try {
      const { error } = await supabase
        .from("narasumber_documentation")
        .update({ caption })
        .eq("id", id);

      if (error) throw error;

      setDocs((prev) =>
        prev.map((d) => (d.id === id ? { ...d, caption } : d))
      );
      toast.success("Keterangan tersimpan", { duration: 1500 });
    } catch (e: any) {
      toast.error("Gagal update keterangan");
    }
  };

  // ============================================================
  // GENERATE PDF — LAYOUT 1 KOLOM (FOTO BESAR)
  // ============================================================
  const generateDocPDF = useCallback(
    async (forDownload = false): Promise<string | null> => {
      if (docs.length === 0) return null;

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      const contentWidth = pageWidth - margin * 2;

      // ============================================================
      // KOP SURAT
      // ============================================================
      const schoolName = schoolSettings?.school_name || "NAMA SEKOLAH";
      const governmentName =
        schoolSettings?.government_name ||
        schoolSettings?.district_name ||
        "PEMERINTAH KABUPATEN";
      const address = schoolSettings?.school_address || "";
      const phone = schoolSettings?.school_phone || "";

      const logoLeftUrl =
        schoolSettings?.logo_left_url ||
        schoolSettings?.government_logo_url ||
        schoolSettings?.logo_url ||
        "";
      const logoRightUrl =
        schoolSettings?.logo_right_url ||
        schoolSettings?.school_logo_url ||
        schoolSettings?.right_logo_url ||
        schoolSettings?.logo_url ||
        "";

      const [logoLeft, logoRight] = await Promise.all([
        loadLogoAsPng(logoLeftUrl),
        loadLogoAsPng(logoRightUrl),
      ]);

      const logoSize = 22;
      const kopTop = margin;

      if (logoLeft) {
        try {
          doc.addImage(logoLeft, "PNG", margin, kopTop, logoSize, logoSize);
        } catch (e) {
          console.warn("Gagal render logo kiri:", e);
        }
      }

      if (logoRight) {
        try {
          doc.addImage(
            logoRight,
            "PNG",
            pageWidth - margin - logoSize,
            kopTop,
            logoSize,
            logoSize
          );
        } catch (e) {
          console.warn("Gagal render logo kanan:", e);
        }
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(governmentName.toUpperCase(), pageWidth / 2, kopTop + 5, {
        align: "center",
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(schoolName.toUpperCase(), pageWidth / 2, kopTop + 13, {
        align: "center",
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      let kopTextY = kopTop + 18;
      if (address) {
        doc.text(address, pageWidth / 2, kopTextY, { align: "center" });
        kopTextY += 4;
      }
      if (phone) {
        doc.text(`Telp: ${phone}`, pageWidth / 2, kopTextY, { align: "center" });
        kopTextY += 4;
      }

      const lineY = Math.max(kopTextY, kopTop + logoSize) + 1;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1);
      doc.line(margin, lineY, pageWidth - margin, lineY);
      doc.setLineWidth(0.3);
      doc.line(margin, lineY + 1, pageWidth - margin, lineY + 1);

      let yPos = lineY + 8;

      // ============================================================
      // JUDUL
      // ============================================================
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("DOKUMENTASI KEGIATAN NARASUMBER", pageWidth / 2, yPos, {
        align: "center",
      });
      yPos += 6;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `No. Kwitansi: ${honorarium?.receipt_number || "-"}`,
        pageWidth / 2,
        yPos,
        { align: "center" }
      );
      yPos += 8;

      // ============================================================
      // INFO KEGIATAN
      // ============================================================
      doc.setFontSize(10);
      const labelX = margin + 3;
      const colonX = margin + 35;
      const valueX = margin + 40;

      const infoRows: [string, string][] = [
        ["Nama Kegiatan", honorarium?.activity_name || "-"],
        ["Narasumber", honorarium?.instructors?.name || "-"],
        [
          "Jenis Narasumber",
          honorarium?.instructors?.narasumber_types?.name || "Narasumber",
        ],
        [
          "Periode",
          `${MONTHS[(honorarium?.payment_month || 1) - 1]} ${honorarium?.payment_year || ""}`,
        ],
        [
          "Tanggal Kwitansi",
          honorarium?.receipt_date
            ? format(new Date(honorarium.receipt_date), "d MMMM yyyy", {
                locale: idLocale,
              })
            : "-",
        ],
      ];

      infoRows.forEach(([label, value]) => {
        doc.setFont("helvetica", "normal");
        doc.text(label, labelX, yPos);
        doc.text(":", colonX, yPos);
        doc.setFont("helvetica", "bold");
        const valueLines = doc.splitTextToSize(value, contentWidth - 40);
        doc.text(valueLines, valueX, yPos);
        yPos += Math.max(5, valueLines.length * 4);
      });

      yPos += 4;

      // ============================================================
      // GRID FOTO — 1 KOLOM FULL WIDTH (FOTO BESAR)
      // ============================================================
      const captionH = 8;       // tinggi area caption
      const rowGap = 6;         // jarak antar foto
      const cellW = contentWidth; // full width
      const rowH = 130;         // tinggi cell — besar!
      const photoH = rowH - captionH;

      // Sisa ruang di halaman pertama setelah info
      let rowY = yPos;

      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];

        // Cek page break
        if (rowY + rowH > pageHeight - margin) {
          doc.addPage();
          rowY = margin;
        }

        // Load gambar
        const imgData = await loadImageAsDataUrl(d.public_url || "", 0.9);
        if (!imgData) {
          // Skip gambar gagal
          continue;
        }

        // Hitung ukuran gambar (fit di dalam cell, jaga aspect ratio)
        const aspect = imgData.width / imgData.height;
        let drawW = cellW;
        let drawH = drawW / aspect;
        if (drawH > photoH) {
          drawH = photoH;
          drawW = drawH * aspect;
        }
        const offsetX = margin + (cellW - drawW) / 2;
        const offsetY = rowY + (photoH - drawH) / 2;

        // Border cell
        doc.setDrawColor(180);
        doc.setLineWidth(0.2);
        doc.rect(margin, rowY, cellW, rowH);

        // Gambar
        doc.addImage(imgData.dataUrl, "JPEG", offsetX, offsetY, drawW, drawH);

        // Nomor + caption
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(`${i + 1}.`, margin + 2, rowY + photoH + 5);

        doc.setFont("helvetica", "normal");
        const captionText =
          captionDrafts[d.id] || d.caption || d.file_name || "";
        const captionLines = doc.splitTextToSize(captionText, cellW - 10);
        doc.text(captionLines.slice(0, 1), margin + 8, rowY + photoH + 5);

        doc.setDrawColor(0);

        // Pindah ke cell berikutnya
        rowY += rowH + rowGap;
      }

      // ============================================================
      // OUTPUT
      // ============================================================
      if (forDownload) {
        const safeNo = (honorarium?.receipt_number || "dok").replace(/\//g, "-");
        doc.save(`Dokumentasi-Narasumber-${safeNo}.pdf`);
        return null;
      }

      const pdfBlob = doc.output("blob");
      return URL.createObjectURL(pdfBlob);
    },
    [docs, honorarium, schoolSettings, captionDrafts]
  );

  // ============================================================
  // PREVIEW HANDLER
  // ============================================================
  const handlePreview = async () => {
    if (docs.length === 0) {
      toast.error("Belum ada dokumentasi untuk dicetak");
      return;
    }

    setIsGenerating(true);
    try {
      const url = await generateDocPDF(false);
      if (url) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(url);
        setShowPreview(true);
      }
    } catch (e: any) {
      console.error("Preview error:", e);
      toast.error("Gagal membuat preview: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // ============================================================
  // DOWNLOAD HANDLER
  // ============================================================
  const handleDownload = async () => {
    try {
      await generateDocPDF(true);
      toast.success("PDF berhasil diunduh");
    } catch (e: any) {
      console.error("Download error:", e);
      toast.error("Gagal mengunduh: " + e.message);
    }
  };

  // ============================================================
  // PRINT HANDLER
  // ============================================================
  const handlePrint = () => {
    const iframe = previewIframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } else {
      toast.error("Preview belum siap");
    }
  };

  // ============================================================
  // CLOSE PREVIEW
  // ============================================================
  const handleClosePreview = (open: boolean) => {
    setShowPreview(open);
    if (!open && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const totalSize = docs.reduce((s, d) => s + (d.file_size || 0), 0);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      {/* =========================== DIALOG UTAMA =========================== */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Dokumentasi Kegiatan Narasumber</DialogTitle>
            <DialogDescription>
              {honorarium?.instructors?.name || "-"}
              {honorarium?.activity_name && ` — ${honorarium.activity_name}`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* UPLOAD AREA */}
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isUploading
                  ? "border-muted bg-muted/30"
                  : "hover:border-primary/50 hover:bg-muted/20 cursor-pointer"
              }`}
              onClick={() => !isUploading && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => e.target.files && handleUpload(e.target.files)}
                className="hidden"
                disabled={isUploading}
              />

              {isUploading ? (
                <div className="space-y-3">
                  <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
                  <p className="text-sm font-medium">Mengompres & mengupload...</p>
                  <Progress value={uploadProgress} className="max-w-xs mx-auto" />
                  <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">
                    Klik untuk upload foto dokumentasi
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG, WEBP — max 10 MB per file. Gambar akan otomatis
                    dikompres untuk menghemat penyimpanan.
                  </p>
                </>
              )}
            </div>

            {/* ACTION BAR */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {docs.length > 0 && (
                  <>
                    <strong>{docs.length}</strong> foto •{" "}
                    <strong>{(totalSize / 1024).toFixed(0)} KB</strong> total
                  </>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreview}
                disabled={docs.length === 0 || isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-2" />
                )}
                Preview & Cetak PDF
              </Button>
            </div>

            {/* LIST DOKUMENTASI */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : docs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Belum ada dokumentasi</p>
                <p className="text-xs mt-1">
                  Upload foto kegiatan untuk melampirkan pada kwitansi
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {docs.map((d, idx) => (
                  <div
                    key={d.id}
                    className="border rounded-lg overflow-hidden group bg-card"
                  >
                    <div className="relative aspect-video bg-muted">
                      <img
                        src={d.public_url}
                        alt={d.caption || `Foto ${idx + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                        {idx + 1}
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-1 right-1 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition"
                        onClick={() => handleDelete(d)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="p-2 space-y-1.5">
                      <Input
                        placeholder="Keterangan foto..."
                        value={captionDrafts[d.id] ?? d.caption ?? ""}
                        onChange={(e) =>
                          setCaptionDrafts((prev) => ({
                            ...prev,
                            [d.id]: e.target.value,
                          }))
                        }
                        onBlur={() => handleSaveCaption(d.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="h-7 text-xs"
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground">
                          {((d.file_size || 0) / 1024).toFixed(0)} KB
                        </p>
                        {captionDrafts[d.id] === d.caption && d.caption && (
                          <Check className="h-3 w-3 text-green-600" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* =========================== DIALOG PREVIEW =========================== */}
      <Dialog open={showPreview} onOpenChange={handleClosePreview}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 gap-0 flex flex-col">
          <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
            <div>
              <DialogTitle>Preview Dokumentasi Narasumber</DialogTitle>
              <DialogDescription>
                Periksa hasil sebelum download atau cetak
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button variant="default" size="sm" onClick={handleDownload}>
                <FileDown className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 bg-muted/30 p-4">
            {previewUrl ? (
              <iframe
                ref={previewIframeRef}
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
        </DialogContent>
      </Dialog>
    </>
  );
}