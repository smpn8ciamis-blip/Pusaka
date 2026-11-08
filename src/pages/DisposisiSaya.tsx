import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { toast } from 'sonner';
import { CheckCircle, Clock, AlertCircle, ExternalLink, Inbox, Loader2, Play } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

// RPC baru belum ada di types.ts yang digenerate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface MyDisposisi {
  id: string;
  surat_masuk_id: string;
  nomor_surat: string;
  perihal: string;
  pengirim: string;
  tanggal_surat: string | null;
  tanggal_diterima: string | null;
  file_url: string | null;
  instruksi: string;
  catatan: string | null;
  status: 'pending' | 'proses' | 'selesai' | string;
  tanggal_disposisi: string;
  tanggal_selesai: string | null;
  tindak_lanjut: string | null;
}

const STATUS = {
  pending: { label: 'Menunggu', color: 'bg-yellow-500', Icon: Clock },
  proses: { label: 'Diproses', color: 'bg-blue-500', Icon: AlertCircle },
  selesai: { label: 'Selesai', color: 'bg-green-600', Icon: CheckCircle },
} as const;

const fmt = (d: string | null) => (d ? format(new Date(d), 'd MMM yyyy', { locale: localeId }) : '-');

function DisposisiCard({ item }: { item: MyDisposisi }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(item.tindak_lanjut ?? '');
  const st = STATUS[item.status as keyof typeof STATUS] ?? STATUS.pending;

  const update = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await db.rpc('disposisi_update_status', {
        p_id: item.id, p_status: status, p_tindak_lanjut: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['disposisi-saya'] }); toast.success('Status disposisi diperbarui'); },
    onError: (e: { message?: string }) => toast.error(e?.message ?? 'Gagal memperbarui status'),
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{item.perihal}</p>
            <p className="text-xs text-muted-foreground">
              {item.nomor_surat} • dari {item.pengirim}
            </p>
          </div>
          <Badge className={`${st.color} text-white`}><st.Icon className="mr-1 h-3 w-3" />{st.label}</Badge>
        </div>

        <div className="rounded-md bg-muted/60 p-3 text-sm">
          <p><span className="text-muted-foreground">Instruksi:</span> <b>{item.instruksi}</b></p>
          {item.catatan && <p className="mt-1"><span className="text-muted-foreground">Catatan:</span> {item.catatan}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            Didisposisikan {fmt(item.tanggal_disposisi)}{item.tanggal_selesai ? ` • selesai ${fmt(item.tanggal_selesai)}` : ''}
          </p>
        </div>

        {item.file_url && (
          <Button variant="outline" size="sm" asChild>
            <a href={item.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Buka berkas surat</a>
          </Button>
        )}

        <div className="space-y-2">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tindak lanjut / keterangan (opsional)" />
          <div className="flex flex-wrap gap-2">
            {item.status === 'pending' && (
              <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate('proses')}>
                <Play className="mr-1 h-4 w-4" /> Mulai proses
              </Button>
            )}
            {item.status !== 'selesai' ? (
              <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={update.isPending} onClick={() => update.mutate('selesai')}>
                {update.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />} Tandai selesai
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate('proses')}>Buka kembali</Button>
            )}
            {note.trim() !== (item.tindak_lanjut ?? '') && (
              <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => update.mutate(item.status)}>Simpan keterangan</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DisposisiSaya() {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['disposisi-saya'],
    queryFn: async (): Promise<MyDisposisi[]> => {
      const { data, error } = await db.rpc('disposisi_saya');
      if (error) throw error;
      return (data ?? []) as MyDisposisi[];
    },
  });

  const open = data.filter((d) => d.status !== 'selesai');
  const done = data.filter((d) => d.status === 'selesai');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Inbox className="h-6 w-6 text-primary" /> Disposisi Saya</h1>
          <p className="text-sm text-muted-foreground">Surat masuk yang didisposisikan kepada Anda. Ubah status setelah Anda tindak lanjuti.</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
        ) : isError ? (
          <Card><CardContent className="py-10 text-center text-destructive">
            Gagal memuat. Pastikan migrasi <code>20261108100000_disposisi_penerima_status.sql</code> sudah dijalankan.
          </CardContent></Card>
        ) : data.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Belum ada disposisi untuk Anda.</CardContent></Card>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Perlu ditindaklanjuti ({open.length})</h2>
              {open.length === 0
                ? <p className="text-sm text-muted-foreground">Semua disposisi sudah selesai.</p>
                : open.map((d) => <DisposisiCard key={d.id} item={d} />)}
            </section>
            {done.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Selesai ({done.length})</h2>
                {done.map((d) => <DisposisiCard key={d.id} item={d} />)}
              </section>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
