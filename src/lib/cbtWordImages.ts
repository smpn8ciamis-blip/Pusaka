import { compressAndUploadQuestionImage } from '@/lib/driveImage';
import { runLimited } from '@/lib/cbtMonitor';
import type { ImageRef } from '@/lib/cbtWordPaste';
import type { RtfImage } from '@/lib/cbtRtf';

/** Ambil data gambar dari rujukan hasil tempel. Mengembalikan null bila tidak dapat dibaca. */
export async function blobOfRef(ref: ImageRef, rtf: RtfImage[], rtfUsable: boolean): Promise<Blob | null> {
  try {
    if (ref.kind === 'rtf') {
      if (!rtfUsable || ref.rtfIndex == null || !rtf[ref.rtfIndex]) return null;
      const im = rtf[ref.rtfIndex];
      return new Blob([im.bytes], { type: im.mime });
    }
    if (ref.kind === 'data' || ref.kind === 'blob') return await (await fetch(ref.src)).blob();
  } catch { /* jatuh ke null */ }
  return null;
}

/**
 * Unggah gambar yang dipakai (kompres → Google Drive lewat bot) maksimal 3 sekaligus. `done` berisi url hasil
 * unggah sebelumnya sehingga percobaan ulang tidak mengunggah dua kali. Rujukan https dipakai apa adanya.
 */
export async function uploadRefs(
  refs: ImageRef[], rtf: RtfImage[], rtfUsable: boolean, done: Record<string, string>,
  onProgress?: (n: number, total: number) => void,
): Promise<{ urls: Record<string, string>; failed: { id: string; message: string }[] }> {
  const urls = { ...done };
  const failed: { id: string; message: string }[] = [];
  const todo = refs.filter((r) => !urls[r.id]);
  for (const r of todo) if (r.kind === 'url') urls[r.id] = r.src;
  const work = todo.filter((r) => r.kind !== 'url');
  let n = 0;
  await runLimited(work, 3, async (r) => {
    const blob = await blobOfRef(r, rtf, rtfUsable);
    if (!blob) { failed.push({ id: r.id, message: r.kind === 'rtf' ? 'Gambar dari Word tidak terbaca (gunakan Upload di editor).' : 'Gambar tidak terbaca.' }); n++; onProgress?.(n, work.length); return; }
    try {
      const res = await compressAndUploadQuestionImage(blob);
      urls[r.id] = res.url;
    } catch (e: any) { failed.push({ id: r.id, message: e?.message || 'Gagal diunggah.' }); }
    n++; onProgress?.(n, work.length);
  });
  return { urls, failed };
}
