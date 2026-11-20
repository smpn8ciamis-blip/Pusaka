/**
 * Gambar soal CBT: dikompres di perangkat guru, diunggah ke Google Drive lewat bot (server.js),
 * lalu soal hanya menyimpan tautan Drive (bukan base64) sehingga naskah soal tetap kecil dan
 * siswa memuat gambar langsung dari Google, bukan dari server sekolah.
 */
import { supabase } from '@/integrations/supabase/client';
import { WA_BOT_URL } from '@/lib/waBot';
import { driveFileId, driveImageUrl, driveFallbackUrl } from '@/lib/driveLinks';

/** Batas berkas asli yang mau diproses (foto kamera/tangkapan layar). */
export const SOAL_IMG_MAX_INPUT_BYTES = 25 * 1024 * 1024;
/** Sisi terpanjang hasil kompres (px). Cukup tajam untuk layar HP/laptop siswa. */
export const SOAL_IMG_MAX_SIDE = 1280;
/** Target ukuran hasil; bila terlampaui, kualitas/ukuran diturunkan bertahap. */
export const SOAL_IMG_TARGET_BYTES = 300 * 1024;
/** Batas keras yang diterima server (server.js memakai 1 MB). */
export const SOAL_IMG_HARD_BYTES = 900 * 1024;
/** Berkas webp/jpeg yang sudah kecil dipakai apa adanya agar tidak menurunkan mutu dua kali. */
const PASS_THROUGH_BYTES = 150 * 1024;

/** Ukuran akhir dengan sisi terpanjang ≤ maxSide (tidak pernah membesarkan gambar). */
export function fitSize(w: number, h: number, maxSide = SOAL_IMG_MAX_SIDE, factor = 1): { width: number; height: number } {
  const longest = Math.max(w, h);
  const s = (longest > maxSide ? maxSide / longest : 1) * factor;
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** Urutan percobaan (faktor ukuran, kualitas) dari yang paling tajam ke yang paling ringan. */
export const COMPRESS_STEPS: { factor: number; quality: number }[] = [
  { factor: 1, quality: 0.8 },
  { factor: 1, quality: 0.68 },
  { factor: 0.85, quality: 0.68 },
  { factor: 0.7, quality: 0.6 },
  { factor: 0.55, quality: 0.55 },
];

type Decoded = { src: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: Blob): Promise<Decoded> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    return { src: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() };
  } catch {
    // Cadangan untuk peramban lama / SVG
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Gambar tidak dapat dibaca. Gunakan JPG, PNG, atau WebP.'));
        img.src = url;
      });
    } catch (e) { URL.revokeObjectURL(url); throw e; }
    return { src: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  }
}

function encode(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));
}

/**
 * Kompres gambar untuk soal: perkecil (maks. 1280 px), simpan WebP (cadangan JPEG), latar putih untuk
 * gambar transparan. Hasil biasanya 40–250 KB. Melempar Error berbahasa Indonesia bila gagal.
 */
export async function compressQuestionImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Berkas harus berupa gambar (JPG/PNG/WebP).');
  if (file.size > SOAL_IMG_MAX_INPUT_BYTES) throw new Error('Ukuran gambar terlalu besar (maksimal 25 MB).');
  const d = await decode(file);
  try {
    if (!d.width || !d.height) throw new Error('Gambar tidak valid.');
    const fits = Math.max(d.width, d.height) <= SOAL_IMG_MAX_SIDE;
    if (fits && file.size <= PASS_THROUGH_BYTES && (file.type === 'image/webp' || file.type === 'image/jpeg')) return file;

    let best: Blob | null = null;
    for (const step of COMPRESS_STEPS) {
      const { width, height } = fitSize(d.width, d.height, SOAL_IMG_MAX_SIDE, step.factor);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Peramban tidak mendukung pemrosesan gambar.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(d.src, 0, 0, width, height);
      let blob = await encode(canvas, 'image/webp', step.quality);
      if (!blob || blob.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg', step.quality); // peramban tanpa encoder WebP
      if (!blob) continue;
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= SOAL_IMG_TARGET_BYTES) break;
    }
    if (!best) throw new Error('Gagal mengompres gambar.');
    // gambar kecil yang justru membesar setelah dikompres: pakai aslinya bila jenisnya diterima server
    if (fits && file.size < best.size && (file.type === 'image/webp' || file.type === 'image/jpeg' || file.type === 'image/png') && file.size <= SOAL_IMG_HARD_BYTES) return file;
    if (best.size > SOAL_IMG_HARD_BYTES) throw new Error('Gambar masih terlalu besar setelah dikompres. Potong atau perkecil gambarnya dulu.');
    return best;
  } finally { d.close(); }
}

export { driveFileId, driveImageUrl, driveFallbackUrl };

// ------------------------------------------------------------------ unggah lewat bot
export async function uploadQuestionImage(blob: Blob): Promise<{ id: string; url: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sesi login tidak ditemukan. Masuk ulang lalu coba lagi.');
  if (blob.size > SOAL_IMG_HARD_BYTES) throw new Error('Gambar terlalu besar untuk diunggah.');
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${WA_BOT_URL}/cbt/image-upload`, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'image/webp', Authorization: `Bearer ${token}` },
        body: blob,
      });
    } catch {
      lastErr = new Error('Server bot tidak dapat dihubungi. Periksa koneksi internet, lalu coba lagi.');
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
    const json = await res.json().catch(() => ({} as any));
    if (res.ok && json?.id && json?.url) return { id: String(json.id), url: String(json.url) };
    if ([502, 503, 504].includes(res.status) && !json?.message) lastErr = new Error('Bot tidak berjalan (HTTP ' + res.status + '). Restart bot di server lalu coba lagi.');
    else if (res.status === 404) throw new Error('Fitur unggah gambar belum terpasang di server. Pasang server.js versi terbaru lalu restart bot.');
    else if (res.status === 413) throw new Error('Gambar terlalu besar ditolak server (413). Periksa client_max_body_size di nginx.');
    else lastErr = new Error(json?.message || `Unggah gagal (HTTP ${res.status})`);
    if (res.status < 500) break; // kesalahan dari sisi permintaan tidak diulang
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw lastErr ?? new Error('Unggah gambar gagal.');
}

/** Kompres lalu unggah; mengembalikan tautan Drive untuk disisipkan ke soal. */
export async function compressAndUploadQuestionImage(file: Blob): Promise<{ id: string; url: string; bytes: number }> {
  const small = await compressQuestionImage(file);
  const r = await uploadQuestionImage(small);
  return { ...r, bytes: small.size };
}
