import jsPDF from 'jspdf';

const MAX_PAGES = 60;

export interface PdfCompressResult {
  file: File;
  compressed: boolean;
  /** alasan tidak dikompres (bila compressed = false dan file besar) */
  reason?: 'too_many_pages' | 'not_smaller' | 'failed';
}

// Tahap kompresi dari kualitas terbaik ke terkecil
const TIERS: Array<{ scale: number; quality: number }> = [
  { scale: 1.5, quality: 0.65 },
  { scale: 1.2, quality: 0.55 },
  { scale: 1.0, quality: 0.45 },
  { scale: 0.8, quality: 0.4 },
];

/**
 * Kompres PDF di browser dengan merender tiap halaman menjadi gambar JPEG lalu
 * menyusunnya kembali menjadi PDF. Ukuran jauh lebih kecil, tetapi teks menjadi
 * gambar (tidak bisa diseleksi/dicari). Berhenti pada tahap pertama yang mencapai target.
 */
export async function compressPdf(
  file: File,
  targetBytes: number,
  onProgress?: (msg: string) => void,
): Promise<PdfCompressResult> {
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    if (doc.numPages > MAX_PAGES) return { file, compressed: false, reason: 'too_many_pages' };

    let best: Blob | null = null;

    for (const tier of TIERS) {
      const out = new jsPDF({ unit: 'pt', compress: true, orientation: 'portrait' });
      for (let i = 1; i <= doc.numPages; i++) {
        onProgress?.(`Mengompres PDF… halaman ${i}/${doc.numPages}`);
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: tier.scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        const jpeg = canvas.toDataURL('image/jpeg', tier.quality);
        const w = base.width;
        const h = base.height;
        if (i > 1) out.addPage([w, h], w > h ? 'landscape' : 'portrait');
        else {
          // jsPDF membuat halaman pertama A4; ganti ukurannya sesuai halaman asli
          (out as unknown as { deletePage: (n: number) => void }).deletePage(1);
          out.addPage([w, h], w > h ? 'landscape' : 'portrait');
        }
        out.addImage(jpeg, 'JPEG', 0, 0, w, h, undefined, 'FAST');
        canvas.width = canvas.height = 0; // lepas memori
        page.cleanup();
      }
      best = out.output('blob');
      if (best.size <= targetBytes) break;
    }

    await doc.destroy();
    if (!best || best.size >= file.size) return { file, compressed: false, reason: 'not_smaller' };

    const name = file.name.replace(/\.pdf$/i, '') + '.pdf';
    return { file: new File([best], name, { type: 'application/pdf' }), compressed: true };
  } catch {
    return { file, compressed: false, reason: 'failed' };
  }
}

/** Apakah error upload berasal dari batas ukuran body di server/proxy (HTTP 413)? */
export function isPayloadTooLarge(err: unknown): boolean {
  const e = err as { status?: number; statusCode?: string | number; message?: string; originalError?: { status?: number } } | null;
  if (!e) return false;
  const code = Number(e.status ?? e.statusCode ?? e.originalError?.status);
  if (code === 413) return true;
  const msg = (e.message ?? '').toLowerCase();
  return msg.includes('too large') || msg.includes('413') || msg.includes('unexpected token');
}
