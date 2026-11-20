/** Tautan gambar Google Drive untuk soal CBT (tanpa impor, aman dipakai di mana saja). */
const DRIVE_ID_RE = /(?:lh3\.googleusercontent\.com\/d\/|drive\.google\.com\/(?:thumbnail\?(?:[^"'\s]*&)?id=|uc\?(?:[^"'\s]*&)?id=))([A-Za-z0-9_-]{10,})/;

/** ID berkas Drive dari tautan gambar yang dibuat bot; null bila bukan tautan Drive. */
export function driveFileId(url: string | null | undefined): string | null {
  const m = DRIVE_ID_RE.exec(url || '');
  return m ? m[1] : null;
}
/** Tautan utama gambar Drive (publik per-tautan). */
export function driveImageUrl(id: string): string { return `https://lh3.googleusercontent.com/d/${id}`; }
/** Tautan cadangan bila tautan utama gagal dimuat. */
export function driveFallbackUrl(id: string): string { return `https://drive.google.com/thumbnail?id=${id}&sz=w1280`; }
