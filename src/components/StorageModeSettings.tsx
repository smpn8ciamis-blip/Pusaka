import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Cloud, HardDrive, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { waAdminFetch } from '@/lib/waBot';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Mode = 'drive' | 'local';

interface StorageStatus {
  reachable: boolean;
  message?: string;
  mode?: Mode;
  changedAt?: string | null;
  drive?: { ok: boolean; usage?: number; limit?: number | null; error?: string };
  local?: { available: boolean; ok?: boolean; path?: string; freeBytes?: number; totalBytes?: number; error?: string };
}

const fmtBytes = (n?: number | null) => {
  if (n === undefined || n === null) return '-';
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
};
const fmtWib = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : null;

/** Saklar tempat penyimpanan berkas upload baru: Google Drive atau disk server (lewat gerbang S3 di server). */
export function StorageModeSettings() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<Mode | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['storage-mode'],
    queryFn: () => waAdminFetch<StorageStatus>('/admin/storage/status'),
    retry: false,
    refetchInterval: 20000,
  });

  const change = useMutation({
    mutationFn: (mode: Mode) => waAdminFetch('/admin/storage/mode', { method: 'POST', body: { mode } }),
    onSuccess: (_r, mode) => {
      toast.success(mode === 'drive' ? 'Unggahan baru sekarang disimpan di Google Drive.' : 'Unggahan baru sekarang disimpan di server.');
      qc.invalidateQueries({ queryKey: ['storage-mode'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Gagal mengubah tempat penyimpanan.'),
    onSettled: () => setTarget(null),
  });

  const mode = data?.mode;
  const driveOk = !!data?.drive?.ok;
  const localOk = !!(data?.local?.available && data?.local?.ok);
  const usedPct = data?.drive?.limit && data.drive.usage !== undefined ? Math.min(100, Math.round((data.drive.usage / data.drive.limit) * 100)) : null;
  const changed = fmtWib(data?.changedAt);

  const requestSwitch = (toDrive: boolean) => {
    const next: Mode = toDrive ? 'drive' : 'local';
    if (next === 'local' && !localOk) return toast.error(data?.local?.available ? 'Folder penyimpanan server tidak bisa ditulis.' : 'Penyimpanan server belum diatur (S3_LOCAL_DIR).');
    if (next === 'drive' && !driveOk) return toast.error('Google Drive belum siap: ' + (data?.drive?.error || 'tidak terhubung.'));
    setTarget(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {mode === 'local' ? <HardDrive className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
          Tempat Penyimpanan Berkas Upload
        </CardTitle>
        <CardDescription>
          Foto, tugas siswa, surat, SPJ, dan berkas guru/siswa lainnya. Saklar ini hanya menentukan tempat penyimpanan <b>unggahan baru</b>;
          berkas yang sudah ada tetap dibuka dari tempatnya semula.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat status…</div>}

        {data && !data.reachable && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Gerbang penyimpanan tidak terhubung</AlertTitle>
            <AlertDescription>
              {data.message || 'Gerbang belum berjalan.'}{' '}
              <button type="button" className="underline" onClick={() => refetch()}>Coba lagi</button>
            </AlertDescription>
          </Alert>
        )}

        {data?.reachable && (
          <>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <div className="font-medium">Simpan unggahan baru di Google Drive</div>
                <div className="text-sm text-muted-foreground">
                  {mode === 'drive' ? 'Aktif: Google Drive (server tidak terisi berkas baru).' : 'Mati: unggahan baru disimpan di disk server.'}
                </div>
                {changed && <div className="text-xs text-muted-foreground">Terakhir diubah {changed} WIB</div>}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={mode === 'drive' ? 'default' : 'secondary'}>{mode === 'drive' ? 'Google Drive' : 'Server'}</Badge>
                <Switch
                  checked={mode === 'drive'}
                  disabled={change.isPending}
                  onCheckedChange={requestSwitch}
                  aria-label="Simpan unggahan baru di Google Drive"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium"><Cloud className="h-4 w-4" /> Google Drive</span>
                  {driveOk
                    ? <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Siap</Badge>
                    : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Bermasalah</Badge>}
                </div>
                {driveOk ? (
                  <>
                    {usedPct !== null && <Progress value={usedPct} />}
                    <div className="text-sm text-muted-foreground">
                      Terpakai {fmtBytes(data.drive?.usage)}{data.drive?.limit ? ` dari ${fmtBytes(data.drive.limit)} (${usedPct}%)` : ''}
                    </div>
                    {usedPct !== null && usedPct >= 90 && <div className="text-xs text-destructive">Ruang Drive hampir penuh. Unggahan akan ditolak jika penuh.</div>}
                  </>
                ) : (
                  <div className="text-sm text-destructive">{data.drive?.error || 'Drive belum tersambung (sambungkan di bagian Backup Otomatis).'}</div>
                )}
              </div>

              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium"><HardDrive className="h-4 w-4" /> Server</span>
                  {!data.local?.available
                    ? <Badge variant="secondary">Belum diatur</Badge>
                    : localOk
                      ? <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Siap</Badge>
                      : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Bermasalah</Badge>}
                </div>
                {!data.local?.available ? (
                  <div className="text-sm text-muted-foreground">Isi <code>S3_LOCAL_DIR</code> di .env bot, lalu restart gerbang untuk mengaktifkan penyimpanan di server.</div>
                ) : localOk ? (
                  <div className="text-sm text-muted-foreground">Sisa disk {fmtBytes(data.local?.freeBytes)} dari {fmtBytes(data.local?.totalBytes)}</div>
                ) : (
                  <div className="text-sm text-destructive">{data.local?.error || 'Folder tidak bisa ditulis.'}</div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={target !== null} onOpenChange={(o) => { if (!o && !change.isPending) setTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{target === 'drive' ? 'Simpan unggahan baru di Google Drive?' : 'Simpan unggahan baru di server?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {target === 'drive'
                ? 'Mulai sekarang foto dan berkas yang diunggah disimpan di Google Drive, sehingga disk server tidak bertambah penuh. Berkas yang sudah ada di server tetap bisa dibuka.'
                : 'Mulai sekarang foto dan berkas yang diunggah disimpan di disk server (lebih cepat, tetapi memakai ruang disk). Berkas yang sudah ada di Google Drive tetap bisa dibuka.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={change.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={change.isPending}
              onClick={(e) => { e.preventDefault(); if (target) change.mutate(target); }}
            >
              {change.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ya, ubah
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
