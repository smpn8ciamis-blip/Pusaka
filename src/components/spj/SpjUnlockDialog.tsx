import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type SpjTargetKind = 'receipt' | 'travel' | 'letter';

const KIND_LABEL: Record<SpjTargetKind, string> = {
  receipt: 'kwitansi',
  travel: 'SPD',
  letter: 'surat tugas',
};

function reasonMessage(reason?: string, sisa?: number): string {
  switch (reason) {
    case 'salah': return `Kode hapus salah.${typeof sisa === 'number' ? ` Sisa percobaan: ${sisa}.` : ''}`;
    case 'dibatasi': return 'Terlalu banyak percobaan yang salah. Coba lagi 10 menit lagi.';
    case 'belum_diatur': return 'Admin belum menetapkan kode hapus. Minta admin menetapkannya di menu Kwitansi Perjalanan Dinas > Pengaturan.';
    case 'tidak_ditemukan': return 'Data tidak ditemukan.';
    default: return 'Kode tidak dapat diperiksa. Coba lagi.';
  }
}

interface Props {
  open: boolean;
  kind: SpjTargetKind;
  targetId: string;
  onOpenChange: (open: boolean) => void;
  onUnlocked: () => void;
}

export function SpjUnlockDialog({ open, kind, targetId, onOpenChange, onUnlocked }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setCode(''); setError(''); setBusy(false); }
  }, [open]);

  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: rpcError } = await (supabase as any).rpc('unlock_spj', { p_kind: kind, p_id: targetId, p_code: code });
      if (rpcError) throw rpcError;
      if (data?.ok) {
        toast.success('Kunci dibuka selama 10 menit');
        onUnlocked();
        return;
      }
      setError(reasonMessage(data?.reason, data?.sisa));
    } catch (e: any) {
      setError(e?.message || 'Gagal memeriksa kode');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-amber-600" /> Data terkunci (SPJ)</DialogTitle>
          <DialogDescription>
            Status SPJ sudah dicentang, sehingga {KIND_LABEL[kind]} ini beserta kwitansi, SPD, dan surat tugas terkait
            tidak bisa diubah atau dihapus. Masukkan kode hapus dari admin untuk membukanya selama 10 menit.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-2">
          <Label htmlFor="spj-code">Kode hapus</Label>
          <Input
            id="spj-code"
            type="password"
            autoComplete="off"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Masukkan kode dari admin"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={busy || !code.trim()}>{busy ? 'Memeriksa...' : 'Buka kunci'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
