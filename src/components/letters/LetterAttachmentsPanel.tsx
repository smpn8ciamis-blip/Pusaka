import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Camera,
  Image as ImageIcon,
  FileUp,
  Trash2,
  Download,
  Printer,
  Loader2,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  LETTER_BUCKET,
  MAX_PHOTOS,
  LetterAttachment,
  LetterKind,
  deleteAttachment,
  downloadAttachment,
  fetchLetterAttachments,
  generateVisitEvidencePDF,
} from "@/lib/letterAttachments";

interface Props {
  letterType: LetterKind;
  letterId: string;
  letterNumber: string;
  /** Batasi tampilan hanya pada lampiran guru ini (akun guru). */
  teacherId?: string;
  /** Izinkan unggah & hapus (akun guru pemilik). */
  canUpload?: boolean;
  teacherName?: string;
  destination?: string;
  purpose?: string;
}

/**
 * Kompres file gambar menggunakan canvas.
 * Target: ~100 KB, dimensi maksimal 1280px, kualitas iteratif.
 */
async function compressImage(
  file: File,
  targetKB = 100,
  maxDimension = 1280
): Promise<File> {
  // Hanya kompres gambar
  if (!file.type.startsWith("image/")) return file;

  // Jika sudah kecil, kembalikan apa adanya
  if (file.size <= targetKB * 1024) return file;

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Hitung dimensi baru (jaga rasio)
  let newW = width;
  let newH = height;
  if (Math.max(width, height) > maxDimension) {
    if (width >= height) {
      newW = maxDimension;
      newH = Math.round((height / width) * maxDimension);
    } else {
      newH = maxDimension;
      newW = Math.round((width / height) * maxDimension);
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, newW, newH);

  // Iterasi kualitas: mulai 0.85, turunkan sampai ≤ targetKB
  const targetBytes = targetKB * 1024;
  let quality = 0.85;
  let blob: Blob | null = null;

  for (let i = 0; i < 6; i++) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    if (!blob) break;
    if (blob.size <= targetBytes) break;
    quality -= 0.12;
    if (quality < 0.3) break;
  }

  if (!blob) return file;

  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}

export function LetterAttachmentsPanel({
  letterType,
  letterId,
  letterNumber,
  teacherId,
  canUpload = false,
  teacherName,
  destination,
  purpose,
}: Props) {
  const [items, setItems] = useState<LetterAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchLetterAttachments(letterType, letterId, teacherId));
    } catch (e: any) {
      toast.error(e.message ?? "Gagal memuat lampiran");
    } finally {
      setLoading(false);
    }
  }, [letterType, letterId, teacherId]);

  useEffect(() => {
    load();
  }, [load]);

  const photos = items.filter((i) => i.kind === "photo");
  const docs = items.filter((i) => i.kind === "document");

  const uploadFiles = async (
    files: FileList | null,
    kind: "photo" | "document"
  ) => {
    if (!files?.length || !teacherId) return;
    const list = Array.from(files);

    if (kind === "photo") {
      const mine = photos.length;
      if (mine + list.length > MAX_PHOTOS) {
        toast.error(
          `Maksimal ${MAX_PHOTOS} foto bukti kunjungan (saat ini ${mine}).`
        );
        return;
      }
    }

    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sesi berakhir, silakan login ulang");

      for (const original of list) {
        // Kompres foto sebelum upload
        let file = original;
        if (kind === "photo") {
          try {
            file = await compressImage(original, 100, 1280);
          } catch (err) {
            console.warn("Kompresi gagal, pakai file asli:", err);
            file = original;
          }
        }

        const ext =
          file.name.split(".").pop() || (kind === "photo" ? "jpg" : "pdf");
        const path = `${uid}/${letterType}/${letterId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(LETTER_BUCKET)
          .upload(path, file, {
            contentType: file.type,
            upsert: false,
          });
        if (upErr) throw upErr;

        const { error: insErr } = await supabase
          .from("letter_attachments")
          .insert({
            letter_type: letterType,
            assignment_letter_id: letterType === "assignment" ? letterId : null,
            official_travel_id: letterType === "spd" ? letterId : null,
            teacher_id: teacherId,
            kind,
            file_url: path,
            file_path: path,
            file_name: file.name,
            mime_type: file.type,
            // Lokasi & geotag tidak lagi diisi
            latitude: null,
            longitude: null,
            location_name: null,
            captured_at: new Date().toISOString(),
            notes: notes || null,
          } as any);
        if (insErr) throw insErr;
      }
      setNotes("");
      toast.success("Berhasil diunggah");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Gagal mengunggah");
    } finally {
      setUploading(false);
      if (cameraInput.current) cameraInput.current.value = "";
      if (galleryInput.current) galleryInput.current.value = "";
      if (docInput.current) docInput.current.value = "";
    }
  };

  const handleDelete = async (att: LetterAttachment) => {
    try {
      await deleteAttachment(att);
      toast.success("Lampiran dihapus");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Gagal menghapus");
    }
  };

  const handlePrintEvidence = async (download: boolean) => {
    if (!photos.length) return toast.error("Belum ada foto bukti kunjungan");
    setPrinting(true);
    try {
      const url = await generateVisitEvidencePDF({
        letterNumber,
        letterType,
        teacherName,
        destination,
        purpose,
        photos,
        download,
      });
      if (!download) window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e.message ?? "Gagal membuat PDF");
    } finally {
      setPrinting(false);
    }
  };

  const isPhotoLimitReached = photos.length >= MAX_PHOTOS;

  return (
    <div className="space-y-4">
      {canUpload && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Input
              placeholder="Keterangan singkat (opsional) — dipakai untuk berkas yang diunggah berikutnya"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            {/* Input tersembunyi */}
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={(e) => uploadFiles(e.target.files, "photo")}
            />
            <input
              ref={galleryInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => uploadFiles(e.target.files, "photo")}
            />
            <input
              ref={docInput}
              type="file"
              accept="application/pdf"
              multiple
              hidden
              onChange={(e) => uploadFiles(e.target.files, "document")}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="md:hidden"
                disabled={uploading || isPhotoLimitReached}
                onClick={() => cameraInput.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 mr-2" />
                )}
                Ambil Foto ({photos.length}/{MAX_PHOTOS})
              </Button>

              <Button
                size="sm"
                variant="secondary"
                disabled={uploading || isPhotoLimitReached}
                onClick={() => galleryInput.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4 mr-2" />
                )}
                Pilih dari Galeri
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => docInput.current?.click()}
              >
                <FileUp className="h-4 w-4 mr-2" /> Upload PDF Surat Tugas / SPPD
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Foto akan dikompres otomatis (~100 KB) untuk mempercepat upload.
              Format: JPG, PNG, WEBP.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={printing || !photos.length}
          onClick={() => handlePrintEvidence(false)}
        >
          {printing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Printer className="h-4 w-4 mr-2" />
          )}
          Cetak Lampiran Bukti Kunjungan
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={printing || !photos.length}
          onClick={() => handlePrintEvidence(true)}
        >
          <Download className="h-4 w-4 mr-2" /> Unduh PDF Lampiran
        </Button>
      </div>

      {loading ? (
        <div className="py-6 text-center text-muted-foreground text-sm">
          Memuat lampiran…
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2">Foto Bukti Kunjungan</h4>
            {photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada foto bukti kunjungan.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border overflow-hidden bg-card"
                  >
                    {p.signedUrl && (
                      <img
                        src={p.signedUrl}
                        alt={p.file_name || "Bukti kunjungan"}
                        loading="lazy"
                        className="w-full h-40 object-cover"
                      />
                    )}
                    <div className="p-2 space-y-1 text-xs">
                      {p.captured_at && (
                        <div className="text-muted-foreground">
                          {format(new Date(p.captured_at), "dd MMM yyyy HH:mm", {
                            locale: idLocale,
                          })}
                        </div>
                      )}
                      {p.notes && (
                        <div className="text-muted-foreground">{p.notes}</div>
                      )}
                      <div className="flex gap-1 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => downloadAttachment(p)}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        {canUpload && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDelete(p)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">
              Berkas PDF Surat Tugas / SPPD
            </h4>
            {docs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada berkas PDF yang diunggah.
              </p>
            ) : (
              <div className="space-y-2">
                {docs.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate text-sm">{d.file_name}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {d.signedUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(d.signedUrl, "_blank")}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadAttachment(d)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {canUpload && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleDelete(d)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}