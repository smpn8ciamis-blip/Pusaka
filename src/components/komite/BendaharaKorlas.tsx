import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { komiteErrorMessage, useKomiteKorlasList, useSetKorlasGrade } from '@/hooks/useKomite';

export function BendaharaKorlas() {
  const { data: rows = [], isLoading } = useKomiteKorlasList();
  const set = useSetKorlasGrade();

  const ubah = async (user_id: string, v: string) => {
    try {
      await set.mutateAsync({ user_id, grade: v === 'auto' ? null : Number(v) });
      toast.success('Tingkat kelas korlas diperbarui');
    } catch (e) {
      toast.error(komiteErrorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Korlas hanya dapat menginput sumbangan siswa dari tingkat kelasnya. Secara bawaan tingkat dibaca dari email
        (<code>korlas7@…</code> = kelas 7); pilih tingkat di sini bila ingin menetapkannya secara manual. Akun korlas dibuat oleh
        Super Admin di menu Manajemen Pengguna.
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3">Akun</th><th className="px-4 py-3">Tingkat saat ini</th><th className="px-4 py-3">Ubah</th></tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Memuat…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Belum ada akun dengan peran korlas di sekolah ini.</td></tr>}
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td className="px-4 py-3"><div className="font-medium">{r.nama}</div><div className="text-xs text-muted-foreground">{r.email}</div></td>
                <td className="px-4 py-3">
                  {r.grade ? <Badge>Kelas {r.grade}{r.asal === 'email' ? ' (dari email)' : ''}</Badge> : <Badge variant="destructive">Belum ditetapkan</Badge>}
                </td>
                <td className="px-4 py-3">
                  <Select value={r.asal === 'manual' && r.grade ? String(r.grade) : 'auto'} onValueChange={(v) => ubah(r.user_id, v)}>
                    <SelectTrigger className="w-[190px]" aria-label={`Tingkat kelas ${r.email}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Otomatis (dari email)</SelectItem>
                      <SelectItem value="7">Kelas 7</SelectItem>
                      <SelectItem value="8">Kelas 8</SelectItem>
                      <SelectItem value="9">Kelas 9</SelectItem>
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
