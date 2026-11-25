import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fotoUrl } from '@/lib/komiteAnggaran';

/** Gambar kecil foto barang; klik membuka foto besar. Tanpa foto: tidak menampilkan apa pun (atau tanda strip). */
export function FotoBarang({ path, judul, ukuran = 'h-12 w-12' }: { path: string | null | undefined; judul: string; ukuran?: string }) {
  const [buka, setBuka] = useState(false);
  const [rusak, setRusak] = useState(false);
  const url = fotoUrl(path);
  if (!url || rusak) {
    return <span className={`inline-flex ${ukuran} items-center justify-center rounded-lg bg-slate-100 text-slate-300`} aria-hidden={!url}>{url ? <ImageIcon className="h-5 w-5" aria-label="Foto tidak dapat dimuat" /> : <span className="text-xs">-</span>}</span>;
  }
  return (
    <>
      <button
        type="button" onClick={() => setBuka(true)} aria-label={`Lihat foto: ${judul}`}
        className={`${ukuran} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`}
      >
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setRusak(true)} className="h-full w-full object-cover" />
      </button>
      <Dialog open={buka} onOpenChange={setBuka}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-balance">{judul}</DialogTitle>
            <DialogDescription className="sr-only">Foto barang yang dibeli</DialogDescription>
          </DialogHeader>
          <img src={url} alt={`Foto ${judul}`} className="mx-auto max-h-[75dvh] w-auto rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
