import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { komiteErrorMessage, useKomiteKelasList, useKomiteKorlasList, useSetKorlasKelas } from '@/hooks/useKomite';

export function BendaharaKorlas() {
  const { data: akun = [], isLoading } = useKomiteKorlasList();
  const { data: kelas = [] } = useKomiteKelasList();
  const set = useSetKorlasKelas();

  const ubah = async (user_id: string, v: string) => {
    try {
      await set.mutateAsync({ user_id, class_id: v === 'none' ? null : v });
      toast.success('Rombel korlas diperbarui');
    } catch (e) {
      toast.error(komiteErrorMessage(e));
    }
  };

  const tanpaKorlas = kelas.filter((k) => !k.korlas_email);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Setiap rombel memiliki akun korlas sendiri. Korlas hanya dapat melihat dan menginput sumbangan untuk siswa di rombelnya.
        Akun korlas dibuat oleh Super Admin di menu Manajemen Pengguna (peran <b>Korlas</b>, pilih sekolah), lalu rombelnya ditetapkan di sini.
      </p>

      {kelas.length > 0 && (
        <p className={`rounded-lg border p-3 text-sm ${tanpaKorlas.length ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
          {tanpaKorlas.length
            ? <>Rombel yang belum punya korlas ({tanpaKorlas.length} dari {kelas.length}): <b>{tanpaKorlas.map((k) => k.kelas).join(', ')}</b></>
            : <>Semua {kelas.length} rombel sudah memiliki korlas.</>}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3">Akun korlas</th><th className="px-4 py-3">Rombel saat ini</th><th className="px-4 py-3">Tetapkan rombel</th></tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Memuat…</td></tr>}
            {!isLoading && akun.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Belum ada akun dengan peran korlas di sekolah ini.</td></tr>}
            {akun.map((r) => (
              <tr key={r.user_id}>
                <td className="px-4 py-3"><div className="font-medium">{r.nama}</div><div className="text-xs text-muted-foreground">{r.email}</div></td>
                <td className="px-4 py-3">{r.kelas ? <Badge>{r.kelas}</Badge> : <Badge variant="destructive">Belum ditetapkan</Badge>}</td>
                <td className="px-4 py-3">
                  <Select value={r.class_id ?? 'none'} onValueChange={(v) => ubah(r.user_id, v)}>
                    <SelectTrigger className="w-[200px]" aria-label={`Rombel untuk ${r.email}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Belum ditetapkan</SelectItem>
                      {kelas.map((k) => (
                        <SelectItem key={k.class_id} value={k.class_id}>
                          {k.kelas} ({k.siswa_total} siswa){k.korlas_email && k.korlas_email !== r.email ? ' · sudah ada korlas' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
