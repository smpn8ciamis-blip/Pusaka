import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export const LETTER_BUCKET = "letter-attachments";
export const MAX_PHOTOS = 3;

export type LetterKind = "assignment" | "spd";

export interface LetterAttachment {
  id: string;
  letter_type: LetterKind;
  assignment_letter_id: string | null;
  official_travel_id: string | null;
  teacher_id: string;
  kind: "photo" | "document";
  file_url: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  captured_at: string | null;
  notes: string | null;
  created_at: string;
  signedUrl?: string;
}

export interface GeoInfo {
  latitude: number;
  longitude: number;
  capturedAt?: string;
  source: "exif" | "device";
}

/** Read GPS coordinates from a photo's EXIF data. */
export async function readExifGeo(file: File): Promise<GeoInfo | null> {
  try {
    const exifr = (await import("exifr")).default as any;
    const data = await exifr.gps(file);
    if (data && typeof data.latitude === "number" && typeof data.longitude === "number") {
      let capturedAt: string | undefined;
      try {
        const meta = await exifr.parse(file, ["DateTimeOriginal"]);
        if (meta?.DateTimeOriginal) capturedAt = new Date(meta.DateTimeOriginal).toISOString();
      } catch {
        /* ignore */
      }
      return { latitude: data.latitude, longitude: data.longitude, capturedAt, source: "exif" };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Fallback: current device position. */
export function readDeviceGeo(): Promise<GeoInfo | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          capturedAt: new Date().toISOString(),
          source: "device",
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export async function signAttachments(rows: LetterAttachment[]): Promise<LetterAttachment[]> {
  if (!rows.length) return [];
  const { data } = await supabase.storage
    .from(LETTER_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.file_path),
      3600
    );
  return rows.map((r, i) => ({ ...r, signedUrl: data?.[i]?.signedUrl ?? undefined }));
}

export async function fetchLetterAttachments(
  letterType: LetterKind,
  letterId: string,
  teacherId?: string
): Promise<LetterAttachment[]> {
  let q = supabase
    .from("letter_attachments")
    .select("*")
    .eq("letter_type", letterType)
    .eq(letterType === "assignment" ? "assignment_letter_id" : "official_travel_id", letterId)
    .order("created_at", { ascending: true });
  if (teacherId) q = q.eq("teacher_id", teacherId);
  const { data, error } = await q;
  if (error) throw error;
  return signAttachments((data ?? []) as unknown as LetterAttachment[]);
}

export async function deleteAttachment(att: LetterAttachment) {
  await supabase.storage.from(LETTER_BUCKET).remove([att.file_path]);
  const { error } = await supabase.from("letter_attachments").delete().eq("id", att.id);
  if (error) throw error;
}

export async function downloadAttachment(att: LetterAttachment) {
  const { data, error } = await supabase.storage.from(LETTER_BUCKET).download(att.file_path);
  if (error || !data) throw error ?? new Error("Gagal mengunduh berkas");
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.file_name || "lampiran";
  a.click();
  URL.revokeObjectURL(url);
}

async function toDataUrl(
  url: string
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 4, height: 3 });
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

interface EvidencePrintOptions {
  letterNumber: string;
  letterType: LetterKind;
  teacherName?: string;
  /** @deprecated Tidak dicetak lagi pada lampiran bukti kunjungan. */
  destination?: string;
  purpose?: string;
  photos: LetterAttachment[];
  download?: boolean;
}

/**
 * Cetak "Lampiran Bukti Kunjungan" untuk SPPD / Surat Tugas.
 *
 * Catatan: sesuai kebutuhan, **lokasi** (tujuan & koordinat) serta **timestamp**
 * (captured_at) TIDAK ditampilkan pada cetakan PDF. Data tersebut tetap
 * tersimpan di database dan masih tampil pada preview di aplikasi.
 *
 * Mengembalikan object URL PDF.
 */
export async function generateVisitEvidencePDF(opts: EvidencePrintOptions): Promise<string> {
  const { data: school } = await supabase.rpc("get_school_settings_for_letterhead");
  const s: any = school ?? {};

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [210, 330] });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 20;

  let y = await addLetterheadToPDF(doc, {
    school_name: s.school_name,
    district_name: s.district_name,
    school_address: s.school_address,
    school_phone: s.school_phone,
    logo_url: s.logo_url,
    right_logo_url: s.right_logo_url,
    show_address: s.show_address,
    show_phone: s.show_phone,
  });

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("LAMPIRAN BUKTI KUNJUNGAN", pageWidth / 2, y, { align: "center" });
  doc.setLineWidth(0.4);
  doc.line(pageWidth / 2 - 45, y + 1.5, pageWidth / 2 + 45, y + 1.5);

  y += 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const label = opts.letterType === "spd" ? "No SPPD" : "No Surat Tugas";
  doc.text(`${label} : ${opts.letterNumber || "-"}`, marginLeft, y);
  if (opts.teacherName) {
    y += 6;
    doc.text(`Nama : ${opts.teacherName}`, marginLeft, y);
  }
  // "Tujuan" (lokasi) sengaja tidak dicetak pada lampiran bukti kunjungan.
  if (opts.purpose) {
    y += 6;
    doc.text(`Keperluan : ${opts.purpose}`, marginLeft, y);
  }

  y += 8;
  const imgWidth = pageWidth - marginLeft * 2;

  for (let i = 0; i < opts.photos.length; i++) {
    const photo = opts.photos[i];
    if (!photo.signedUrl) continue;
    const img = await toDataUrl(photo.signedUrl);
    if (!img) continue;
    const ratio = img.height / img.width;
    const imgHeight = Math.min(imgWidth * ratio, 110);

    // Caption hanya memuat nomor foto & keterangan opsional.
    // Timestamp (captured_at) dan koordinat (latitude/longitude) TIDAK dicetak.
    const captionLines: string[] = [];
    captionLines.push(`Foto ${i + 1}`);
    if (photo.notes) captionLines.push(`Keterangan: ${photo.notes}`);

    const blockHeight = imgHeight + captionLines.length * 5 + 8;
    if (y + blockHeight > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
    doc.addImage(img.dataUrl, "JPEG", marginLeft, y, imgWidth, imgHeight, undefined, "FAST");
    doc.setDrawColor(180);
    doc.rect(marginLeft, y, imgWidth, imgHeight);
    y += imgHeight + 5;
    doc.setFontSize(9);
    captionLines.forEach((line) => {
      doc.text(line, marginLeft, y);
      y += 5;
    });
    doc.setFontSize(11);
    y += 4;
  }

  if (opts.download) {
    doc.save(`Lampiran-Bukti-Kunjungan-${opts.letterNumber || "SPPD"}.pdf`);
  }
  return doc.output("bloburl") as unknown as string;
}