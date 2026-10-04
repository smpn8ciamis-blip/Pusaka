#!/usr/bin/env bash
# ============================================================
# Setup All-in-One: Dokumentasi Narasumber
# ============================================================
# Author  : Auto-generated
# Purpose : Buat semua file TS/TSX + opsi jalankan migrasi SQL
# ============================================================

set -euo pipefail

# ============================================================
# KONFIGURASI WARNA
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "\n${CYAN}▶ $*${NC}"; }

# ============================================================
# DETEKSI PROJECT ROOT
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f "package.json" ]]; then
  log_error "package.json tidak ditemukan di $SCRIPT_DIR"
  log_error "Jalankan script ini di root project React/Vite Anda."
  exit 1
fi

PROJECT_ROOT="$SCRIPT_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${PROJECT_ROOT}/.backup-${TIMESTAMP}"

log_info "Project root: ${PROJECT_ROOT}"
log_info "Backup dir  : ${BACKUP_DIR}"

# ============================================================
# FUNGSI: BACKUP FILE JIKA ADA
# ============================================================
backup_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local rel="${file#$PROJECT_ROOT/}"
    local target="${BACKUP_DIR}/${rel}"
    mkdir -p "$(dirname "$target")"
    cp "$file" "$target"
    log_warn "Backup: $rel → .backup-${TIMESTAMP}/"
  fi
}

# ============================================================
# FUNGSI: TULIS FILE (dengan heredoc)
# ============================================================
write_file() {
  local path="$1"
  mkdir -p "$(dirname "$path")"
  cat > "$path"
  log_ok "Wrote: ${path#$PROJECT_ROOT/}"
}

# ============================================================
# STEP 1: BACKUP FILE YANG AKAN DI-OVERRIDE
# ============================================================
log_step "STEP 1: Backup file lama"

backup_file "${PROJECT_ROOT}/src/pages/NarasumberHonorarium.tsx"
backup_file "${PROJECT_ROOT}/src/components/honorarium/NarasumberHonorariumPreview.tsx"

if [[ -d "${BACKUP_DIR}" ]]; then
  log_ok "Backup tersimpan di: .backup-${TIMESTAMP}/"
else
  log_info "Tidak ada file lama untuk di-backup (fresh install)"
fi

# ============================================================
# STEP 2: BUAT SQL MIGRATION FILE
# ============================================================
log_step "STEP 2: Buat file migrasi SQL"

mkdir -p "${PROJECT_ROOT}/migrations"

write_file "${PROJECT_ROOT}/migrations/narasumber_documentation.sql" <<'SQL_EOF'
-- ============================================================
-- Migrasi: Dokumentasi Narasumber
-- Jalankan di Supabase SQL Editor atau via psql
-- ============================================================

CREATE TABLE IF NOT EXISTS narasumber_documentation (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  honorarium_id UUID REFERENCES narasumber_honorariums(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  caption TEXT,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_narasumber_doc_honorarium
  ON narasumber_documentation(honorarium_id);

ALTER TABLE narasumber_documentation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users can view narasumber docs" ON narasumber_documentation;
CREATE POLICY "Auth users can view narasumber docs"
  ON narasumber_documentation FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth users can insert narasumber docs" ON narasumber_documentation;
CREATE POLICY "Auth users can insert narasumber docs"
  ON narasumber_documentation FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth users can update narasumber docs" ON narasumber_documentation;
CREATE POLICY "Auth users can update narasumber docs"
  ON narasumber_documentation FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth users can delete narasumber docs" ON narasumber_documentation;
CREATE POLICY "Auth users can delete narasumber docs"
  ON narasumber_documentation FOR DELETE
  USING (auth.role() = 'authenticated');

INSERT INTO storage.buckets (id, name, public)
VALUES ('narasumber-documentation', 'narasumber-documentation', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view narasumber docs" ON storage.objects;
CREATE POLICY "Public can view narasumber docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'narasumber-documentation');

DROP POLICY IF EXISTS "Auth users can upload narasumber docs" ON storage.objects;
CREATE POLICY "Auth users can upload narasumber docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'narasumber-documentation' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth users can update narasumber docs" ON storage.objects;
CREATE POLICY "Auth users can update narasumber docs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'narasumber-documentation' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth users can delete narasumber docs" ON storage.objects;
CREATE POLICY "Auth users can delete narasumber docs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'narasumber-documentation' AND auth.role() = 'authenticated');
SQL_EOF

# ============================================================
# STEP 3: FILE imageCompress.ts
# ============================================================
log_step "STEP 3: Buat src/lib/imageCompress.ts"

write_file "${PROJECT_ROOT}/src/lib/imageCompress.ts" <<'TS_EOF'
export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: string;
}

/**
 * Kompres gambar di client-side pakai Canvas API
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.75,
    mimeType = "image/jpeg",
  } = options;

  if (!file.type.startsWith("image/")) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas context tidak tersedia"));

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Gagal mengompres gambar"));

            const baseName = file.name.replace(/\.[^.]+$/, "");
            const newFile = new File([blob], `${baseName}.jpg`, {
              type: mimeType,
              lastModified: Date.now(),
            });
            resolve(newFile);
          },
          mimeType,
          quality
        );
      };

      img.onerror = () => reject(new Error("Gagal memuat gambar"));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}

export function loadImageAsDataUrl(
  url: string,
  quality = 0.85
): Promise<{ dataUrl: string; width: number; height: number } | null> {
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
        resolve({
          dataUrl: canvas.toDataURL("image/jpeg", quality),
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = url;
  });
}
TS_EOF

# ============================================================
# STEP 4: FILE NarasumberDocumentationDialog.tsx
# ============================================================
log_step "STEP 4: Buat NarasumberDocumentationDialog.tsx"

write_file "${PROJECT_ROOT}/src/components/honorarium/NarasumberDocumentationDialog.tsx" <<'TSX_EOF'
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { compressImage, loadImageAsDataUrl } from "@/lib/imageCompress";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toTitleCase } from "@/lib/utils";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

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
  const [isPrinting, setIsPrinting] = useState(false);
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handlePrintDocs = async () => {
    if (docs.length === 0) {
      toast.error("Belum ada dokumentasi untuk dicetak");
      return;
    }

    setIsPrinting(true);

    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;

      const schoolName = schoolSettings?.school_name || "NAMA SEKOLAH";
      const governmentName =
        schoolSettings?.government_name ||
        schoolSettings?.district_name ||
        "PEMERINTAH KABUPATEN";
      const address = schoolSettings?.school_address || "";
      const phone = schoolSettings?.school_phone || "";

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(governmentName.toUpperCase(), pageWidth / 2, margin + 5, {
        align: "center",
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(schoolName.toUpperCase(), pageWidth / 2, margin + 12, {
        align: "center",
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      let kopY = margin + 17;
      if (address) {
        doc.text(address, pageWidth / 2, kopY, { align: "center" });
        kopY += 4;
      }
      if (phone) {
        doc.text(`Telp: ${phone}`, pageWidth / 2, kopY, { align: "center" });
        kopY += 4;
      }

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1);
      doc.line(margin, kopY, pageWidth - margin, kopY);
      doc.setLineWidth(0.3);
      doc.line(margin, kopY + 1, pageWidth - margin, kopY + 1);

      let yPos = kopY + 8;

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

      const colGap = 5;
      const colW = (contentWidth - colGap) / 2;
      const captionH = 8;
      const rowH = 65;
      const photoH = rowH - captionH;

      let col = 0;
      let x = margin;
      let rowY = yPos;

      doc.setLineWidth(0.3);
      doc.line(margin, rowY - 2, pageWidth - margin, rowY - 2);

      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];

        if (rowY + rowH > pageHeight - margin - 5) {
          doc.addPage();
          rowY = margin + 5;
          col = 0;
          x = margin;
        }

        const imgData = await loadImageAsDataUrl(d.public_url || "", 0.85);
        if (!imgData) {
          col++;
          x += colW + colGap;
          if (col === 2) {
            col = 0;
            x = margin;
            rowY += rowH + 3;
          }
          continue;
        }

        const aspect = imgData.width / imgData.height;
        let drawW = colW;
        let drawH = drawW / aspect;
        if (drawH > photoH) {
          drawH = photoH;
          drawW = drawH * aspect;
        }
        const offsetX = x + (colW - drawW) / 2;
        const offsetY = rowY + (photoH - drawH) / 2;

        doc.setDrawColor(180);
        doc.setLineWidth(0.2);
        doc.rect(x, rowY, colW, rowH);

        doc.addImage(imgData.dataUrl, "JPEG", offsetX, offsetY, drawW, drawH);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(`${i + 1}.`, x + 2, rowY + photoH + 4);

        doc.setFont("helvetica", "normal");
        const captionText =
          captionDrafts[d.id] || d.caption || d.file_name || "";
        const captionLines = doc.splitTextToSize(captionText, colW - 8);
        doc.text(captionLines.slice(0, 1), x + 6, rowY + photoH + 4);

        doc.setDrawColor(0);

        col++;
        x += colW + colGap;

        if (col === 2) {
          col = 0;
          x = margin;
          rowY += rowH + 3;
        }
      }

      if (rowY + 50 > pageHeight - margin) {
        doc.addPage();
        rowY = margin + 10;
      } else {
        rowY += 15;
      }

      const footerColW = contentWidth / 2;
      const col1X = margin + footerColW * 0.5;
      const col2X = margin + footerColW * 1.5;

      const receiptDate = honorarium?.receipt_date
        ? format(new Date(honorarium.receipt_date), "d MMMM yyyy", {
            locale: idLocale,
          })
        : "";

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Ciamis, ${receiptDate}`, col2X, rowY, { align: "center" });
      doc.text("Mengetahui,", col1X, rowY, { align: "center" });
      doc.text("Kepala Sekolah", col1X, rowY + 5, { align: "center" });
      doc.text("Bendahara BOS", col2X, rowY + 5, { align: "center" });

      rowY += 30;

      doc.setFont("helvetica", "bold");
      doc.text(
        toTitleCase(
          schoolSettings?.headmaster_name ||
            schoolSettings?.kepala_sekolah ||
            ".................."
        ),
        col1X,
        rowY,
        { align: "center" }
      );
      doc.text(
        toTitleCase(schoolSettings?.bendahara_name || ".................."),
        col2X,
        rowY,
        { align: "center" }
      );

      rowY += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const headmasterNip =
        schoolSettings?.headmaster_nip || schoolSettings?.nip_kepala_sekolah;
      if (headmasterNip) {
        doc.text(`NIP. ${headmasterNip}`, col1X, rowY, { align: "center" });
      }
      if (schoolSettings?.bendahara_nip) {
        doc.text(`NIP. ${schoolSettings.bendahara_nip}`, col2X, rowY, {
          align: "center",
        });
      }

      const safeNo = (honorarium?.receipt_number || "dok").replace(/\//g, "-");
      doc.save(`Dokumentasi-Narasumber-${safeNo}.pdf`);
      toast.success("Dokumentasi berhasil diunduh");
    } catch (e: any) {
      console.error("Print error:", e);
      toast.error("Gagal mencetak: " + e.message);
    } finally {
      setIsPrinting(false);
    }
  };

  const totalSize = docs.reduce((s, d) => s + (d.file_size || 0), 0);

  return (
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
              onClick={handlePrintDocs}
              disabled={docs.length === 0 || isPrinting}
            >
              {isPrinting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              Cetak Dokumentasi (PDF)
            </Button>
          </div>

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
  );
}
TSX_EOF

# ============================================================
# STEP 5: UPDATE NarasumberHonorarium.tsx (PATCH)
# ============================================================
log_step "STEP 5: Patch NarasumberHonorarium.tsx"

HONO_FILE="${PROJECT_ROOT}/src/pages/NarasumberHonorarium.tsx"

if [[ ! -f "$HONO_FILE" ]]; then
  log_warn "File NarasumberHonorarium.tsx tidak ditemukan — skip patch."
  log_warn "Buat file manual atau letakkan di path: src/pages/NarasumberHonorarium.tsx"
else
  # 5a. Tambah import dokumentasi
  if ! grep -q "NarasumberDocumentationDialog" "$HONO_FILE"; then
    # Insert import setelah import NarasumberHonorariumPreview
    if grep -q "NarasumberHonorariumPreview" "$HONO_FILE"; then
      sed -i "/import.*NarasumberHonorariumPreview/a import { NarasumberDocumentationDialog } from '@/components/honorarium/NarasumberDocumentationDialog';" "$HONO_FILE"
      log_ok "Import NarasumberDocumentationDialog ditambahkan"
    else
      log_warn "Tidak dapat menemukan anchor import NarasumberHonorariumPreview"
    fi
  else
    log_info "Import NarasumberDocumentationDialog sudah ada"
  fi

  # 5b. Pastikan ImageIcon diimport dari lucide-react
  if ! grep -q "Image as ImageIcon" "$HONO_FILE"; then
    if grep -q "from 'lucide-react'" "$HONO_FILE"; then
      # Cari baris import lucide-react dan tambahkan ImageIcon
      sed -i "s/} from 'lucide-react';/, Image as ImageIcon } from 'lucide-react';/" "$HONO_FILE"
      log_ok "Import ImageIcon ditambahkan ke lucide-react"
    fi
  else
    log_info "ImageIcon sudah ada di import lucide-react"
  fi

  # 5c. Tambah state documentationHonorarium
  if ! grep -q "documentationHonorarium" "$HONO_FILE"; then
    # Tambah state setelah previewHonorarium
    sed -i "/const \[previewHonorarium, setPreviewHonorarium\]/a\\  const [documentationHonorarium, setDocumentationHonorarium] = useState<Honorarium | null>(null);" "$HONO_FILE"
    log_ok "State documentationHonorarium ditambahkan"
  else
    log_info "State documentationHonorarium sudah ada"
  fi

  # 5d. Info untuk penambahan tombol & dialog manual
  log_warn "════════════════════════════════════════════════════════════════"
  log_warn "PERLU TINDAKAN MANUAL untuk tombol & dialog dokumentasi:"
  log_warn ""
  log_warn "1. Cari blok tombol aksi di tabel honorarium (yang ada tombol Eye/Pencil/Trash2)"
  log_warn "2. Tambahkan tombol berikut SETELAH tombol Eye:"
  log_warn ""
  echo -e "${YELLOW}<Button"
  echo -e "  size=\"sm\""
  echo -e "  variant=\"ghost\""
  echo -e "  onClick={() => setDocumentationHonorarium(honorarium)}"
  echo -e "  title=\"Dokumentasi Kegiatan\""
  echo -e ">"
  echo -e "  <ImageIcon className=\"h-4 w-4\" />"
  echo -e "</Button>${NC}"
  log_warn ""
  log_warn "3. Tambahkan dialog berikut SEBELUM closing </DashboardLayout>:"
  log_warn ""
  echo -e "${YELLOW}{documentationHonorarium && schoolSettings && ("
  echo -e "  <NarasumberDocumentationDialog"
  echo -e "    open={!!documentationHonorarium}"
  echo -e "    onOpenChange={(open) => !open && setDocumentationHonorarium(null)}"
  echo -e "    honorarium={documentationHonorarium}"
  echo -e "    schoolSettings={schoolSettings}"
  echo -e "  />"
  echo -e ")}${NC}"
  log_warn ""
  log_warn "Atau lihat file backup dan apply manual — karena struktur JSX"
  log_warn "sulit di-patch otomatis dengan aman."
  log_warn "════════════════════════════════════════════════════════════════"
fi

# ============================================================
# STEP 6: JALANKAN MIGRASI SQL (OPSIONAL)
# ============================================================
log_step "STEP 6: Migrasi Database"

if [[ -n "${DATABASE_URL:-}" ]]; then
  log_info "DATABASE_URL terdeteksi, menjalankan migrasi via psql..."

  if ! command -v psql &>/dev/null; then
    log_error "psql tidak terinstall. Install dulu:"
    log_error "  - Ubuntu/Debian: sudo apt install postgresql-client"
    log_error "  - macOS: brew install postgresql"
    log_error "Migrasi SQL dibatalkan. Jalankan manual di Supabase SQL Editor."
  else
    if psql "$DATABASE_URL" -f "${PROJECT_ROOT}/migrations/narasumber_documentation.sql"; then
      log_ok "Migrasi database berhasil!"
    else
      log_error "Migrasi gagal. Cek connection string / permission."
      exit 1
    fi
  fi
else
  log_warn "DATABASE_URL tidak diset."
  log_warn "Jalankan migrasi manual:"
  log_warn "  1. Buka Supabase Dashboard → SQL Editor"
  log_warn "  2. Copy isi file: migrations/narasumber_documentation.sql"
  log_warn "  3. Klik RUN"
  log_warn ""
  log_warn "Atau jalankan ulang script dengan:"
  log_warn "  DATABASE_URL=\"postgresql://...\" ./setup-narasumber-docs.sh"
fi

# ============================================================
# STEP 7: INSTALL DEPENDENSI YANG HILANG (Opsional)
# ============================================================
log_step "STEP 7: Cek dependensi npm"

MISSING_DEPS=()

if ! grep -q '"jspdf"' package.json; then
  MISSING_DEPS+=("jspdf")
fi
if ! grep -q '"date-fns"' package.json; then
  MISSING_DEPS+=("date-fns")
fi
if ! grep -q '"sonner"' package.json; then
  MISSING_DEPS+=("sonner")
fi

if [[ ${#MISSING_DEPS[@]} -gt 0 ]]; then
  log_warn "Dependensi berikut belum ada di package.json:"
  for dep in "${MISSING_DEPS[@]}"; do
    log_warn "  - $dep"
  done
  read -p "Install sekarang? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm install "${MISSING_DEPS[@]}"
    log_ok "Dependensi terinstall"
  else
    log_info "Skip install. Jalankan manual: npm install ${MISSING_DEPS[*]}"
  fi
else
  log_ok "Semua dependensi sudah ada di package.json"
fi

# ============================================================
# STEP 8: SUMMARY
# ============================================================
log_step "✅ SELESAI"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  SETUP BERHASIL!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}📁 File yang dibuat:${NC}"
echo "  ✓ src/lib/imageCompress.ts"
echo "  ✓ src/components/honorarium/NarasumberDocumentationDialog.tsx"
echo "  ✓ migrations/narasumber_documentation.sql"
echo ""
echo -e "${CYAN}📝 File yang di-patch:${NC}"
echo "  ✓ src/pages/NarasumberHonorarium.tsx (import + state)"
echo ""
echo -e "${CYAN}💾 Backup (jika ada file lama):${NC}"
echo "  📂 .backup-${TIMESTAMP}/"
echo ""
echo -e "${YELLOW}⚠️  LANGKAH SELANJUTNYA:${NC}"
echo ""
echo "1️⃣  Jalankan migrasi SQL (jika belum):"
echo "    → Buka Supabase Dashboard → SQL Editor"
echo "    → Copy isi: migrations/narasumber_documentation.sql"
echo "    → Klik RUN"
echo ""
echo "2️⃣  Selesaikan patch manual di NarasumberHonorarium.tsx:"
echo "    → Lihat instruksi di atas (tombol 📷 & dialog)"
echo ""
echo "3️⃣  Restart dev server:"
echo "    npm run dev"
echo ""
echo "4️⃣  Hard refresh browser: Ctrl + Shift + R"
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
