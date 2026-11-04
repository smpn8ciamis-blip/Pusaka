import { supabase } from '@/integrations/supabase/client';

/** Foto siswa pernah diunggah ke dua bucket: 'student-photos' (unggah massal) dan 'school-logos' (form siswa). */
export const PHOTO_BUCKETS = ['student-photos', 'school-logos'] as const;

/** Pecah alamat storage Supabase menjadi bucket + path file; null bila bukan alamat storage. */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/);
  if (!m) return null;
  try { return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) }; } catch { return null; }
}

/** Alamat publik alternatif: alamat server saat ini, dengan bucket asli lalu bucket foto lainnya. */
export function alternatePhotoUrls(url: string): string[] {
  const p = parseStorageUrl(url);
  if (!p) return [];
  const buckets = Array.from(new Set([p.bucket, ...PHOTO_BUCKETS]));
  const urls = buckets.map((b) => supabase.storage.from(b).getPublicUrl(p.path).data.publicUrl);
  return Array.from(new Set(urls)).filter((u) => u !== url);
}

function canLoad(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

const cache = new Map<string, Promise<string | null>>();

/**
 * Dipanggil setelah alamat foto tersimpan gagal dimuat. Mencoba berurutan:
 *  1. alamat publik di server saat ini (menangani alamat server lama) dan bucket foto lainnya,
 *  2. tautan bertanda tangan (menangani bucket privat).
 * Hasil: alamat yang bisa dimuat, atau null bila file memang tidak ada di storage.
 */
export function resolveStudentPhoto(url: string): Promise<string | null> {
  let hit = cache.get(url);
  if (!hit) {
    hit = (async () => {
      for (const u of alternatePhotoUrls(url)) {
        if (await canLoad(u)) return u;
      }
      const p = parseStorageUrl(url);
      if (!p) return null;
      for (const b of Array.from(new Set([p.bucket, ...PHOTO_BUCKETS]))) {
        const { data, error } = await supabase.storage.from(b).createSignedUrl(p.path, 3600);
        if (!error && data?.signedUrl && (await canLoad(data.signedUrl))) return data.signedUrl;
      }
      return null;
    })();
    cache.set(url, hit);
  }
  return hit;
}
