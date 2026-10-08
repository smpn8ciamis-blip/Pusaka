import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ELEARNING_BUCKET, type ElearningMaterial } from '@/lib/elearning';

interface Props {
  material: ElearningMaterial | null;
  onClose: () => void;
}

/** Pratinjau materi: gambar & PDF tampil langsung, Word diunduh. */
export function ElearningViewer({ material, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setUrl(null);
    setDownloadUrl(null);
    setError(false);
    if (!material) return;
    let cancelled = false;
    (async () => {
      const bucket = supabase.storage.from(ELEARNING_BUCKET);
      const [view, dl] = await Promise.all([
        bucket.createSignedUrl(material.file_path, 3600),
        bucket.createSignedUrl(material.file_path, 3600, { download: material.file_name }),
      ]);
      if (cancelled) return;
      if (view.error || !view.data?.signedUrl) {
        setError(true);
        return;
      }
      setUrl(view.data.signedUrl);
      setDownloadUrl(dl.data?.signedUrl ?? view.data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [material]);

  return (
    <Dialog open={!!material} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-6 pb-3 pr-12 pt-6">
          <DialogTitle className="truncate">{material?.title}</DialogTitle>
          <DialogDescription>
            {material?.subject}
            {material?.description ? ` — ${material.description}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-3">
          {error ? (
            <p className="py-12 text-center text-sm text-destructive">Gagal membuka file. Coba lagi nanti.</p>
          ) : !url ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : material?.file_type === 'image' ? (
            <img src={url} alt={material.title} className="mx-auto max-h-[68dvh] w-auto max-w-full rounded-md object-contain" />
          ) : material?.file_type === 'pdf' ? (
            <iframe src={url} title={material.title} className="h-[68dvh] w-full rounded-md border" />
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
              <FileText className="h-12 w-12 text-primary" />
              <p>File Word tidak dapat dipratinjau di browser. Unduh untuk membukanya.</p>
              <p className="text-xs">{material?.file_name}</p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>Tutup</Button>
          <Button asChild disabled={!downloadUrl}>
            <a href={downloadUrl ?? '#'} download={material?.file_name}>
              <Download className="mr-2 h-4 w-4" /> Unduh
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
