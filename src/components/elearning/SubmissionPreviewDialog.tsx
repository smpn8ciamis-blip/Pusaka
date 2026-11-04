import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { SUBMISSION_BUCKET, formatFileSize, type ElearningSubmission } from '@/lib/elearning';
import { readDocxPreview, type DocxPreview } from '@/lib/docxPreview';

export interface PreviewItem {
  sub: ElearningSubmission;
  studentName: string;
}

const MAX_PDF_PAGES = 40;

/** PDF dirender per halaman ke kanvas (jalan di semua perangkat, tidak bergantung pada penampil PDF browser). */
function PdfPages({ buffer }: { buffer: ArrayBuffer }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'fallback'>('loading');
  const [info, setInfo] = useState('');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setInfo('');
    const el = host.current;
    if (el) el.innerHTML = '';
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
        if (cancelled || !host.current) return;
        const width = Math.max(280, host.current.clientWidth);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
        for (let i = 1; i <= pages; i++) {
          const page = await doc.getPage(i);
          if (cancelled || !host.current) return;
          const base = page.getViewport({ scale: 1 });
          const cssScale = width / base.width;
          const viewport = page.getViewport({ scale: cssScale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'mb-3 rounded border bg-white shadow-sm';
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('canvas');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          host.current.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (i === 1) setState('ok');
        }
        if (!cancelled) setInfo(doc.numPages > pages ? `Menampilkan ${pages} dari ${doc.numPages} halaman. Unduh untuk melihat semuanya.` : `${doc.numPages} halaman`);
      } catch {
        if (cancelled) return;
        // cadangan: penampil PDF bawaan browser lewat blob (aman dari batasan CSP frame-src)
        setBlobUrl(URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' })));
        setState('fallback');
      }
    })();
    return () => { cancelled = true; };
  }, [buffer]);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  return (
    <div>
      {state === 'loading' && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {state === 'fallback' && blobUrl && <iframe src={blobUrl} title="PDF" className="h-[65dvh] w-full rounded-md border" />}
      <div ref={host} className={state === 'fallback' ? 'hidden' : ''} />
      {info && <p className="pt-1 text-center text-xs text-muted-foreground">{info}</p>}
    </div>
  );
}

function DocxView({ buffer }: { buffer: ArrayBuffer }) {
  const [data, setData] = useState<DocxPreview | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let made: string[] = [];
    setData(null); setUrls([]); setError('');
    readDocxPreview(buffer.slice(0))
      .then((d) => {
        if (cancelled) return;
        made = d.images.map((i) => URL.createObjectURL(i.blob));
        setData(d); setUrls(made);
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message || 'Gagal membaca dokumen'); });
    return () => { cancelled = true; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [buffer]);

  if (error) return <p className="py-10 text-center text-sm text-destructive">{error}. Gunakan tombol Unduh untuk membukanya di Word.</p>;
  if (!data) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
        Pratinjau teks dokumen Word. Tata letak, tabel, dan format bisa berbeda dari aslinya; unduh bila perlu melihat persis.
      </p>
      {data.paragraphs.length === 0 && urls.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Dokumen tidak berisi teks.</p>}
      <div className="whitespace-pre-wrap break-words rounded-md border bg-white p-4 text-sm leading-relaxed text-black">
        {data.paragraphs.map((t, i) => <p key={i} className="min-h-[1em]">{t}</p>)}
      </div>
      {urls.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Gambar di dalam dokumen ({urls.length})</p>
          {urls.map((u, i) => <img key={u} src={u} alt={`Gambar ${i + 1} dalam dokumen`} className="mx-auto max-h-[70dvh] max-w-full rounded border bg-white object-contain" />)}
        </div>
      )}
      {data.truncated && <p className="text-xs text-muted-foreground">Dokumen panjang: sebagian isi tidak ditampilkan. Unduh untuk melihat semuanya.</p>}
    </div>
  );
}

interface Props {
  items: PreviewItem[];
  index: number | null; // null = tertutup
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** area di bawah pratinjau (mis. kotak nilai) */
  footer?: (item: PreviewItem) => React.ReactNode;
}

/** Pratinjau berkas jawaban siswa di dalam aplikasi (tanpa unduh): gambar, PDF, Word. */
export function SubmissionPreviewDialog({ items, index, onIndexChange, onClose, footer }: Props) {
  const item = index !== null ? items[index] : undefined;
  const sub = item?.sub;
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setViewUrl(null); setDownloadUrl(null); setBuffer(null); setError(false);
    if (!sub?.file_path) return;
    let cancelled = false;
    (async () => {
      try {
        const bucket = supabase.storage.from(SUBMISSION_BUCKET);
        const [view, dl] = await Promise.all([
          bucket.createSignedUrl(sub.file_path!, 3600),
          bucket.createSignedUrl(sub.file_path!, 3600, { download: sub.file_name ?? true }),
        ]);
        if (cancelled) return;
        if (view.error || !view.data?.signedUrl) throw new Error('url');
        setViewUrl(view.data.signedUrl);
        setDownloadUrl(dl.data?.signedUrl ?? view.data.signedUrl);
        // PDF & Word dibaca sebagai data agar bisa dirender di dalam aplikasi
        if (sub.file_type === 'pdf' || sub.file_type === 'docx') {
          const res = await fetch(view.data.signedUrl);
          if (!res.ok) throw new Error('fetch');
          const buf = await res.arrayBuffer();
          if (!cancelled) setBuffer(buf);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [sub?.id, sub?.file_path, sub?.file_name, sub?.file_type]);

  // panah kiri/kanan untuk pindah siswa (kecuali sedang mengetik)
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndexChange]);

  return (
    <Dialog open={index !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[96dvh] max-w-4xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-4 pb-2 pr-12 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle className="truncate">{item?.studentName}</DialogTitle>
          <DialogDescription className="truncate">
            {sub?.file_name ?? 'Jawaban teks'}{sub?.file_size ? ` (${formatFileSize(sub.file_size)})` : ''}
            {index !== null && items.length > 1 ? ` • ${index + 1} dari ${items.length}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-3 sm:px-6">
          {sub?.answer_text && (
            <p className="mb-3 whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm">{sub.answer_text}</p>
          )}
          {!sub?.file_path ? null : error ? (
            <p className="py-12 text-center text-sm text-destructive">Gagal membuka file. Coba lagi, atau gunakan tombol Unduh.</p>
          ) : !viewUrl ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : sub.file_type === 'image' ? (
            <img src={viewUrl} alt={sub.file_name ?? 'Jawaban siswa'} className="mx-auto max-h-[68dvh] w-auto max-w-full rounded-md object-contain" />
          ) : !buffer ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : sub.file_type === 'pdf' ? (
            <PdfPages buffer={buffer} />
          ) : sub.file_type === 'docx' ? (
            <DocxView buffer={buffer} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
              <FileText className="h-10 w-10 text-primary" /> Jenis file ini tidak bisa dipratinjau. Gunakan tombol Unduh.
            </div>
          )}
        </div>

        {item && footer && <div className="shrink-0 border-t px-4 py-3 sm:px-6">{footer(item)}</div>}

        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3 sm:px-6">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={index === null || index <= 0} onClick={() => index !== null && onIndexChange(index - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Sebelumnya
            </Button>
            <Button variant="outline" size="sm" disabled={index === null || index >= items.length - 1} onClick={() => index !== null && onIndexChange(index + 1)}>
              Berikutnya <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          {downloadUrl && (
            <Button variant="ghost" size="sm" asChild>
              <a href={downloadUrl} download={sub?.file_name ?? undefined}><Download className="mr-1 h-4 w-4" /> Unduh</a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
