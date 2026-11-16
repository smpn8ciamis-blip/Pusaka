import { useMemo, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  computeInfographic, renderAlpaHtml, renderIzinSakitHtml, type InfoRecord,
} from '@/lib/attendanceInfographic';

type Kind = 'izin-sakit' | 'alpa';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Catatan absensi sesuai filter yang sedang aktif (sudah tanpa duplikat) */
  records: InfoRecord[];
  allClasses: string[];
  startDate: string;
  endDate: string;
  scopeLabel: string;
  schoolName: string;
}

const clampInt = (v: string, min: number, max: number, fallback: number) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

/** Infografis Izin & Sakit / Alpa dari data absensi pada filter aktif. Pratinjau = HTML yang sama dengan yang diunduh. */
export function AttendanceInfographicDialog({ open, onClose, records, allClasses, startDate, endDate, scopeLabel, schoolName }: Props) {
  const [kind, setKind] = useState<Kind>('izin-sakit');
  const [minIzin, setMinIzin] = useState(3);
  const [minSakit, setMinSakit] = useState(5);
  const [minAlpa, setMinAlpa] = useState(2);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const data = useMemo(
    () => computeInfographic(records, { allClasses, startDate, endDate, scopeLabel }),
    [records, allClasses, startDate, endDate, scopeLabel],
  );
  const html = useMemo(() => {
    const opts = { schoolName, printedAt: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), minIzin, minSakit, minAlpa };
    return kind === 'alpa' ? renderAlpaHtml(data, opts) : renderIzinSakitHtml(data, opts);
  }, [data, kind, schoolName, minIzin, minSakit, minAlpa]);

  const fileBase = `infografis-${kind === 'alpa' ? 'alpa' : 'izin-sakit'}-${startDate}_${endDate}`;

  const download = () => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${fileBase}.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    const w = frameRef.current?.contentWindow;
    if (!w) { toast.error('Pratinjau belum siap.'); return; }
    w.focus(); w.print();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[92vh] max-w-4xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Infografis Absensi</DialogTitle>
          <DialogDescription>
            Dibuat dari data absensi sesuai filter tanggal, kelas, dan mapel yang sedang aktif ({records.length} catatan).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1">
            <Button size="sm" variant={kind === 'izin-sakit' ? 'default' : 'outline'} onClick={() => setKind('izin-sakit')}>Izin &amp; Sakit</Button>
            <Button size="sm" variant={kind === 'alpa' ? 'default' : 'outline'} onClick={() => setKind('alpa')}>Alpa</Button>
          </div>
          {kind === 'izin-sakit' ? (
            <>
              <div>
                <Label className="text-xs">Daftar siswa izin ≥ (kali)</Label>
                <Input type="number" min={1} max={99} value={minIzin} onChange={(e) => setMinIzin(clampInt(e.target.value, 1, 99, 3))} className="h-9 w-28" />
              </div>
              <div>
                <Label className="text-xs">Daftar siswa sakit ≥ (kali)</Label>
                <Input type="number" min={1} max={99} value={minSakit} onChange={(e) => setMinSakit(clampInt(e.target.value, 1, 99, 5))} className="h-9 w-28" />
              </div>
            </>
          ) : (
            <div>
              <Label className="text-xs">Rincian siswa alpa ≥ (kali)</Label>
              <Input type="number" min={2} max={99} value={minAlpa} onChange={(e) => setMinAlpa(clampInt(e.target.value, 2, 99, 2))} className="h-9 w-28" />
            </div>
          )}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={print} className="gap-2"><Printer className="h-4 w-4" />Cetak / PDF</Button>
            <Button size="sm" onClick={download} className="gap-2"><Download className="h-4 w-4" />Unduh HTML</Button>
          </div>
        </div>

        <iframe
          ref={frameRef}
          title="Pratinjau infografis"
          srcDoc={html}
          sandbox="allow-same-origin allow-modals"
          className="min-h-0 w-full flex-1 rounded-md border bg-background"
        />
      </DialogContent>
    </Dialog>
  );
}
