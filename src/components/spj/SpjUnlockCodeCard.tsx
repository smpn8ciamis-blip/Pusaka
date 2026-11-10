import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { KeyRound } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SPJ_LOCK_QUERY_KEY, useSpjLockState } from '@/hooks/useSpjLock';

/** Kartu pengaturan kode hapus SPJ (hanya admin / super admin yang melihatnya). */
export function SpjUnlockCodeCard() {
  const { state } = useSpjLockState();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const c = code.trim();
    if (c.length < 4) { toast.error('Kode minimal 4 karakter'); return; }
    if (c !== confirmCode.trim()) { toast.error('Konfirmasi kode tidak sama'); return; }
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc('set_spj_unlock_code', { p_code: c });
      if (error) throw error;
      toast.success('Kode hapus disimpan');
      setCode('');
      setConfirmCode('');
      queryClient.invalidateQueries({ queryKey: SPJ_LOCK_QUERY_KEY });
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menyimpan kode');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Kode Hapus Data SPJ</CardTitle>
        <CardDescription>
          Kwitansi yang status SPJ-nya dicentang, beserta SPD dan surat tugasnya, terkunci. Kode ini dibutuhkan untuk mengubah
          atau menghapusnya (berlaku 10 menit setelah dimasukkan). Kode disimpan terenkripsi dan tidak bisa dilihat kembali;
          bila lupa, tetapkan kode baru. Mengganti kode langsung mencabut semua izin buka kunci yang sedang aktif.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          Status:
          {state.code_set
            ? <Badge variant="secondary">Sudah ditetapkan{state.code_updated_at ? ` (${format(new Date(state.code_updated_at), 'dd/MM/yyyy HH:mm')})` : ''}</Badge>
            : <Badge variant="destructive">Belum ditetapkan: data terkunci tidak bisa dibuka</Badge>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="spj-new-code">Kode baru</Label>
            <Input id="spj-new-code" type="password" autoComplete="new-password" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="spj-confirm-code">Ulangi kode</Label>
            <Input id="spj-confirm-code" type="password" autoComplete="new-password" value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} />
          </div>
        </div>
        <Button onClick={save} disabled={busy || !code.trim()}>{busy ? 'Menyimpan...' : state.code_set ? 'Ganti Kode' : 'Simpan Kode'}</Button>
      </CardContent>
    </Card>
  );
}
