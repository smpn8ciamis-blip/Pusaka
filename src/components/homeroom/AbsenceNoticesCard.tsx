import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { FileImage, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { notifyBotAbsenceDecided } from '@/lib/waBot';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Notice {
  id: string;
  kind: 'sakit' | 'izin';
  absence_date: string;
  status: 'menunggu' | 'disetujui' | 'ditolak';
  file_path: string | null;
  created_at: string;
  decided_at: string | null;
  decided_via: string | null;
  decision_note: string | null;
  applied_rows: number | null;
  students: { full_name: string; nisn: string | null } | null;
  classes: { name: string } | null;
}

const STATUS_BADGE: Record<Notice['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  menunggu: { label: 'Menunggu', variant: 'outline' },
  disetujui: { label: 'Disetujui', variant: 'default' },
  ditolak: { label: 'Ditolak', variant: 'destructive' },
};

const fmtDate = (iso: string) => format(new Date(`${iso.slice(0, 10)}T00:00:00`), 'EEEE, d MMM yyyy', { locale: localeId });

/**
 * Pemberitahuan izin/sakit dari orang tua (lewat WhatsApp): foto surat + ACC/Tolak.
 * Yang terlihat dibatasi RLS: wali kelas hanya kelasnya; admin & kesiswaan seluruh sekolah.
 */
export default function AbsenceNoticesCard() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'menunggu' | 'semua' | 'disetujui' | 'ditolak'>('menunggu');

  const { data: notices = [], isLoading, isError } = useQuery({
    queryKey: ['absence-notices', status],
    queryFn: async (): Promise<Notice[]> => {
      let q = (supabase as any)
        .from('student_absence_notices')
        .select('id, kind, absence_date, status, file_path, created_at, decided_at, decided_via, decision_note, applied_rows, students(full_name, nisn), classes:class_id(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (status !== 'semua') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Notice[];
    },
    retry: false,
  });

  const pendingCount = useQuery({
    queryKey: ['absence-notices-pending-count'],
    queryFn: async () => {
      const { count, error } = await (supabase as any).from('student_absence_notices').select('id', { count: 'exact', head: true }).eq('status', 'menunggu');
      if (error) throw error;
      return (count as number) || 0;
    },
    retry: false,
  }).data ?? 0;

  const openLetter = async (n: Notice) => {
    if (!n.file_path) { toast.error('Surat tidak tersedia'); return; }
    const { data, error } = await supabase.storage.from('absence-notices').createSignedUrl(n.file_path, 300);
    if (error || !data?.signedUrl) { toast.error('Gagal membuka surat'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const decide = useMutation({
    mutationFn: async ({ id, approve, note }: { id: string; approve: boolean; note?: string }) => {
      const { data, error } = await (supabase as any).rpc('decide_absence_notice', { p_id: id, p_approve: approve, p_note: note || null });
      if (error) throw error;
      if (!data?.ok) {
        const reason = data?.reason;
        throw new Error(
          reason === 'tidak_ada_jadwal' ? 'Kelas tidak punya jadwal pelajaran pada tanggal itu, absensi tidak bisa disimpan.'
          : reason === 'sudah_diputuskan' ? `Pemberitahuan ini sudah ${data?.status ?? 'diputuskan'}.`
          : 'Pemberitahuan tidak ditemukan.');
      }
      return { id, approve, data };
    },
    onSuccess: ({ id, approve, data }) => {
      toast.success(approve
        ? `Disetujui. Absensi tersimpan di ${data.rows ?? 0} jam pelajaran${data.skipped ? ` (${data.skipped} jam sudah tercatat hadir, tidak diubah)` : ''}.`
        : 'Pemberitahuan ditolak. Absensi tidak diubah.');
      void notifyBotAbsenceDecided(id);          // kabari orang tua lewat WhatsApp (gagal diam-diam)
      queryClient.invalidateQueries({ queryKey: ['absence-notices'] });
      queryClient.invalidateQueries({ queryKey: ['absence-notices-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['homeroom-attendance'] });   // rekap absensi wali kelas ikut diperbarui
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Gagal memproses');
      queryClient.invalidateQueries({ queryKey: ['absence-notices'] });
    },
  });

  const approve = (n: Notice) => {
    if (!confirm(`Setujui ${n.kind} ${n.students?.full_name ?? ''} pada ${fmtDate(n.absence_date)}? Absensi tanggal itu akan tersimpan sebagai ${n.kind}.`)) return;
    decide.mutate({ id: n.id, approve: true });
  };
  const reject = (n: Notice) => {
    const note = window.prompt(`Tolak ${n.kind} ${n.students?.full_name ?? ''}? Tulis alasan (boleh dikosongkan):`);
    if (note === null) return;
    decide.mutate({ id: n.id, approve: false, note });
  };

  // Bila migrasi belum dijalankan, tabel belum ada: kartu disembunyikan (tidak mengganggu halaman).
  if (isError) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            Izin / Sakit dari Orang Tua
            {pendingCount > 0 && <Badge variant="destructive">{pendingCount} menunggu</Badge>}
          </CardTitle>
          <CardDescription>
            Dilaporkan orang tua lewat WhatsApp (foto surat tersimpan di server). ACC menyimpan absensi siswa pada tanggal itu; tolak tidak mengubah absensi.
          </CardDescription>
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="menunggu">Menunggu</SelectItem>
            <SelectItem value="semua">Semua</SelectItem>
            <SelectItem value="disetujui">Disetujui</SelectItem>
            <SelectItem value="ditolak">Ditolak</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal tidak masuk</TableHead>
                <TableHead>Siswa</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Surat</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Memuat...</TableCell></TableRow>
              ) : notices.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  {status === 'menunggu' ? 'Tidak ada pemberitahuan yang menunggu.' : 'Belum ada pemberitahuan.'}
                </TableCell></TableRow>
              ) : notices.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="whitespace-nowrap">
                    {fmtDate(n.absence_date)}
                    <div className="text-xs text-muted-foreground">dilaporkan {format(new Date(n.created_at), 'd MMM HH:mm', { locale: localeId })}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{n.students?.full_name ?? '-'}</div>
                    <div className="text-xs text-muted-foreground">{n.classes?.name ?? '-'}</div>
                  </TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{n.kind}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openLetter(n)} disabled={!n.file_path}>
                      <FileImage className="h-4 w-4" /> Lihat
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[n.status].variant}>{STATUS_BADGE[n.status].label}</Badge>
                    {n.status !== 'menunggu' && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {n.decided_via === 'wa' ? 'via WhatsApp' : 'via aplikasi'}
                        {n.status === 'disetujui' && n.applied_rows != null ? ` · ${n.applied_rows} jam` : ''}
                        {n.decision_note ? ` · ${n.decision_note}` : ''}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {n.status === 'menunggu' && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" className="gap-1" onClick={() => approve(n)} disabled={decide.isPending}><Check className="h-4 w-4" /> ACC</Button>
                        <Button size="sm" variant="destructive" className="gap-1" onClick={() => reject(n)} disabled={decide.isPending}><X className="h-4 w-4" /> Tolak</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
