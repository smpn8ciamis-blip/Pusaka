/**
 * Kompres foto profil di perangkat sebelum diunggah: dipotong persegi dari tengah,
 * diperkecil ke `size` px, lalu disimpan JPEG. Hasil biasanya 20–70 KB (dari foto kamera 3–8 MB).
 * Mengikuti orientasi EXIF bila peramban mendukung (createImageBitmap + imageOrientation).
 */
export const AVATAR_MAX_INPUT_BYTES = 15 * 1024 * 1024;

export async function compressAvatar(file: File, size = 512, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Berkas harus berupa gambar (JPG/PNG/WebP).');
  if (file.size > AVATAR_MAX_INPUT_BYTES) throw new Error('Ukuran foto terlalu besar (maksimal 15 MB).');

  let src: CanvasImageSource & { width: number; height: number };
  let cleanup = () => {};
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    cleanup = () => (src as ImageBitmap).close?.();
  } catch {
    // Cadangan untuk peramban lama
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Foto tidak dapat dibaca. Gunakan format JPG, PNG, atau WebP.'));
      img.src = url;
    });
    src = img;
    cleanup = () => URL.revokeObjectURL(url);
  }

  try {
    const side = Math.min(src.width, src.height);
    if (!side) throw new Error('Foto tidak valid.');
    const out = Math.min(size, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Peramban tidak mendukung pemrosesan gambar.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, out, out);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal mengompres foto.'))), 'image/jpeg', quality),
    );
  } finally {
    cleanup();
  }
}
