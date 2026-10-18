import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer, Loader2 } from "lucide-react";
import type jsPDF from "jspdf";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  filename: string;
  /** Membuat dokumen saat dialog dibuka (dipanggil ulang setiap dibuka agar data terbaru). */
  build: () => Promise<jsPDF>;
}

/** Pratinjau PDF sebelum diunduh / dicetak. */
export function PdfPreviewDialog({ open, onClose, title, filename, build }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [doc, setDoc] = useState<jsPDF | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(null); setDoc(null); setErr(null);
    build()
      .then((d) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(d.output("blob"));
        setDoc(d);
        setUrl(objectUrl);
      })
      .catch((e) => alive && setErr(e?.message || "Gagal membuat pratinjau"));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const print = () => {
    try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); }
    catch { if (url) window.open(url, "_blank"); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="h-[70vh] w-full overflow-hidden rounded-md border bg-muted/30">
          {err ? (
            <p className="p-6 text-sm text-destructive">{err}</p>
          ) : !url ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Menyiapkan pratinjau…</div>
          ) : (
            <iframe ref={frame} src={url} title={title} className="h-full w-full" />
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Tutup</Button>
          <Button variant="outline" onClick={print} disabled={!url}><Printer className="mr-2 h-4 w-4" />Cetak</Button>
          <Button onClick={() => doc?.save(filename)} disabled={!doc}><Download className="mr-2 h-4 w-4" />Unduh PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
