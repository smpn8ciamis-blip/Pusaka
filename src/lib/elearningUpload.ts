import { compressImage } from '@/lib/imageCompress';
import { compressPdf } from '@/lib/pdfCompress';
import { detectElearningKind, elearningMime, formatFileSize, type ElearningKind } from '@/lib/elearning';

// Server/proxy sekolah menolak body besar (HTTP 413), jadi file dikecilkan dulu sebelum diunggah.
export const UPLOAD_TARGET_BYTES = 900 * 1024;

export interface PreparedFile { upload: File; kind: ElearningKind; mime: string; fileName: string; notes: string[] }

export async function prepareFile(file: File, onProgress: (m: string) => void): Promise<PreparedFile> {
  const kind = detectElearningKind(file)!;
  const notes: string[] = [];
  let upload = file;
  let fileName = file.name;

  if (kind === 'image' && file.type !== 'image/gif' && file.size > 300 * 1024) {
    onProgress('Mengompres gambar…');
    for (const o of [
      { maxWidth: 2000, maxHeight: 2000, quality: 0.82 },
      { maxWidth: 1600, maxHeight: 1600, quality: 0.7 },
      { maxWidth: 1280, maxHeight: 1280, quality: 0.6 },
    ]) {
      try { upload = await compressImage(file, o); } catch { break; }
      if (upload.size <= UPLOAD_TARGET_BYTES) break;
    }
    if (upload !== file) fileName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  } else if (kind === 'pdf' && file.size > UPLOAD_TARGET_BYTES) {
    onProgress('Mengompres PDF…');
    const res = await compressPdf(file, UPLOAD_TARGET_BYTES, onProgress);
    if (res.compressed) {
      upload = res.file;
      notes.push(`PDF dikompres ${formatFileSize(file.size)} → ${formatFileSize(upload.size)} (teks menjadi gambar)`);
    } else if (res.reason === 'too_many_pages') {
      notes.push('PDF lebih dari 60 halaman, tidak dikompres');
    }
  }
  return { upload, kind, mime: elearningMime(kind, upload), fileName, notes };
}
