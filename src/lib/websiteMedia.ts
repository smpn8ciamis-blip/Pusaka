import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/imageCompress";

export const WEBSITE_MEDIA_BUCKET = "website-media";
const MAX_RAW_BYTES = 15 * 1024 * 1024;
// Proxy sekolah menolak body besar (HTTP 413), jadi gambar dikecilkan dulu.
const TARGET_BYTES = 900 * 1024;

/** Kompres lalu unggah gambar ke bucket publik website-media. Mengembalikan URL publik. */
export async function uploadWebsiteImage(file: File, folder = "umum"): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Berkas harus berupa gambar (JPG/PNG/WebP).");
  if (file.size > MAX_RAW_BYTES) throw new Error("Ukuran gambar maksimal 15 MB.");
  let upload: File = file;
  if (file.type !== "image/gif" && file.size > 300 * 1024) {
    for (const o of [
      { maxWidth: 2000, maxHeight: 2000, quality: 0.82 },
      { maxWidth: 1600, maxHeight: 1600, quality: 0.7 },
      { maxWidth: 1280, maxHeight: 1280, quality: 0.6 },
    ]) {
      try { upload = await compressImage(file, o); } catch { break; }
      if (upload.size <= TARGET_BYTES) break;
    }
  }
  const ext = upload.type === "image/gif" ? "gif" : upload !== file ? "jpg" : (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(WEBSITE_MEDIA_BUCKET).upload(path, upload, { contentType: upload.type || "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(WEBSITE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
