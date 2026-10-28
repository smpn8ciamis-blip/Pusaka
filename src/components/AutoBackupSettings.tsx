import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Cloud, CloudOff, Save, Play, ExternalLink, CheckCircle2, AlertTriangle, XCircle, Contact } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { waAdminFetch } from '@/lib/waBot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Tabel backup_* belum ada di types.ts hasil generate.
const db = supabase as any;

interface BackupStatus {
  google_configured: boolean;
  connected: boolean;
  contacts_granted?: boolean;
  email: string | null;
  running: boolean;
  redirect_uri: string;
}

const DAYS = [
  { v: 1, l: 'Sen' }, { v: 2, l: 'Sel' }, { v: 3, l: 'Rab' }, { v: 4, l: 'Kam' },
  { v: 5, l: 'Jum' }, { v: 6, l: 'Sab' }, { v: 7, l: 'Min' },
];

const fmtWib = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function AutoBackupSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState('02:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [incDb, setIncDb] = useState(true);
  const [incStorage, setIncStorage] = useState(true);
  const [incContacts, setIncContacts] = useState(false);
  const [keep, setKeep] = useState(7);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['backup-settings'],
    queryFn: async () => {
      const { data, error } = await db.from('backup_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!settings) return;
    setEnabled(!!settings.enabled);
    setTime(String(settings.schedule_time || '02:00').slice(0, 5));
    setDays(Array.isArray(settings.days) ? settings.days : [1, 2, 3, 4, 5, 6, 7]);
    setIncDb(!!settings.include_db);
    setIncStorage(!!settings.include_storage);
    setIncContacts(!!settings.include_contacts);
    setKeep(Number(settings.keep_count) || 7);
  }, [settings]);

  const { data: botStatus, error: botError, refetch: refetchStatus } = useQuery({
    queryKey: ['backup-bot-status'],
    queryFn: () => waAdminFetch<BackupStatus>('/admin/backup/status'),
    retry: false,
    refetchInterval: 10000,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['backup-runs'],
    queryFn: async () => {
      const { data, error } = await db.from('backup_runs').select('*').order('started_at', { ascending: false }).limit(10);
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: (q: any) => ((q.state.data || []).some((r: any) => r.status === 'running') ? 4000 : 20000),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('Format jam tidak valid');
      if (days.length === 0) throw new Error('Pilih minimal satu hari');
      if (!incDb && !incStorage && !incContacts) throw new Error('Pilih minimal database, bucket, atau kontak');
      const { error } = await db.from('backup_settings').upsert({
        id: 1, enabled, schedule_time: time, days, include_db: incDb, include_storage: incStorage, include_contacts: incContacts,
        keep_count: Math.min(90, Math.max(1, keep || 7)), updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Pengaturan backup disimpan'); qc.invalidateQueries({ queryKey: ['backup-settings'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const connect = useMutation({
    mutationFn: () => waAdminFetch<{ url: string }>('/admin/backup/auth-url', { method: 'POST' }),
    onSuccess: (r) => { window.location.href = r.url; },
    onError: (e: Error) => toast.error(e.message),
  });
  const disconnect = useMutation({
    mutationFn: () => waAdminFetch('/admin/backup/disconnect', { method: 'POST' }),
    onSuccess: () => { toast.success('Google Drive diputus'); refetchStatus(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const runNow = useMutation({
    mutationFn: () => waAdminFetch<{ message: string }>('/admin/backup/run', { method: 'POST' }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['backup-runs'] }); refetchStatus(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncContacts = useMutation({
    mutationFn: () => waAdminFetch<{ message: string }>('/admin/backup/contacts', { method: 'POST' }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['backup-runs'] }); refetchStatus(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  const running = !!botStatus?.running || runs.some((r) => r.status === 'running');

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Cloud className="h-5 w-5" /> Backup Otomatis ke Google Drive</CardTitle>
        <CardDescription>
          Bot di server membuat backup database dan isi semua bucket sesuai jadwal, lalu mengunggahnya ke folder “Pusaka Backup” di Google Drive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Koneksi Google Drive */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {botStatus?.connected ? (
              <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Terhubung{botStatus.email ? `: ${botStatus.email}` : ''}</Badge>
            ) : (
              <Badge variant="outline" className="gap-1"><CloudOff className="h-3 w-3" /> Belum terhubung</Badge>
            )}
            {settings?.drive_folder_id && (
              <a className="text-xs inline-flex items-center gap-1 underline" target="_blank" rel="noreferrer"
                href={`https://drive.google.com/drive/folders/${settings.drive_folder_id}`}>
                Buka folder di Drive <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {botStatus?.connected && !botStatus.contacts_granted && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Izin <b>Kontak</b> belum diberikan, jadi sinkron kontak siswa belum bisa dipakai. Klik “Hubungkan ulang” dan centang izin Kontak di layar Google.
            </p>
          )}
          {botError && <p className="text-xs text-destructive">{(botError as Error).message}</p>}
          {botStatus && !botStatus.google_configured && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Kunci aplikasi Google belum diset di server bot (GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET). Lihat panduan di bawah.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {botStatus?.connected ? (
              <>
                {!botStatus.contacts_granted && (
                  <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
                    {connect.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Hubungkan ulang (izin Kontak)
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>Putuskan</Button>
              </>
            ) : (
              <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending || !botStatus?.google_configured}>
                {connect.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Hubungkan Google Drive
              </Button>
            )}
          </div>
        </div>

        {/* Jadwal */}
        <div className="space-y-4 max-w-lg">
          <div className="flex items-center justify-between">
            <Label htmlFor="bk-en">Aktifkan backup terjadwal</Label>
            <Switch id="bk-en" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="space-y-1">
            <Label>Jam backup (WIB)</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
            <p className="text-xs text-muted-foreground">Disarankan dini hari saat sistem sepi. Backup dimulai maksimal 3 jam setelah jam ini (mis. bila bot baru menyala).</p>
          </div>
          <div className="space-y-1">
            <Label>Hari</Label>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d) => (
                <Button key={d.v} type="button" size="sm" variant={days.includes(d.v) ? 'default' : 'outline'} onClick={() => toggleDay(d.v)}>{d.l}</Button>
              ))}
            </div>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <Label>Yang di-backup</Label>
            <div className="flex items-center justify-between">
              <Label htmlFor="bk-db" className="font-normal">Database (seluruh data, user, RLS)</Label>
              <Switch id="bk-db" checked={incDb} onCheckedChange={setIncDb} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="bk-st" className="font-normal">Isi bucket (foto, berkas upload)</Label>
              <Switch id="bk-st" checked={incStorage} onCheckedChange={setIncStorage} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="bk-ct" className="font-normal">Kontak wali siswa ke Google Kontak (nama: kelas + nama siswa)</Label>
              <Switch id="bk-ct" checked={incContacts} onCheckedChange={setIncContacts} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Simpan berapa backup terakhir di Drive</Label>
            <Input type="number" min={1} max={90} value={keep} onChange={(e) => setKeep(parseInt(e.target.value, 10))} className="w-28" />
            <p className="text-xs text-muted-foreground">Backup yang lebih lama otomatis dihapus agar Drive tidak penuh.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Simpan jadwal
            </Button>
            <Button variant="outline" onClick={() => runNow.mutate()} disabled={runNow.isPending || running || !botStatus?.connected}>
              {running || runNow.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
              {running ? 'Backup berjalan…' : 'Backup sekarang'}
            </Button>
            <Button variant="outline" onClick={() => syncContacts.mutate()} disabled={syncContacts.isPending || running || !botStatus?.connected || !botStatus?.contacts_granted}>
              {syncContacts.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Contact className="h-4 w-4 mr-1" />} Sinkronkan kontak sekarang
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Kontak dibuat dari siswa aktif yang punya NISN dan nomor HP wali, dikumpulkan di label “Pusaka Siswa” dengan nama “kelas + nama siswa” (mis. 7A Budi Santoso). NISN disimpan di kontak, sehingga sinkron berikutnya memperbarui kontak yang sama (pindah kelas, ganti nama/nomor), bukan membuat ganda. Perubahan manual pada nama, nomor, atau catatan kontak tersebut akan ditimpa; kontak lain tidak disentuh dan kontak lama tidak pernah dihapus otomatis.
          </p>
        </div>

        {/* Riwayat */}
        <div className="space-y-2">
          <Label>Riwayat backup</Label>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada backup.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <div key={r.id} className="rounded-md border p-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.status === 'success' && <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Berhasil</Badge>}
                    {r.status === 'partial' && <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3 w-3" /> Sebagian</Badge>}
                    {r.status === 'failed' && <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Gagal</Badge>}
                    {r.status === 'running' && <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Berjalan</Badge>}
                    <span className="text-muted-foreground">{fmtWib(r.started_at)} · {r.trigger === 'schedule' ? 'terjadwal' : r.trigger === 'kontak' ? 'sinkron kontak' : 'manual'}</span>
                  </div>
                  {r.message && <p className="text-xs mt-1 break-words">{r.message}</p>}
                  {Array.isArray(r.details?.files) && r.details.files.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 break-words">
                      {r.details.files.filter((f: any) => f.size > 0).map((f: any) => `${f.name} (${fmtSize(f.size)})`).join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panduan */}
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Panduan satu kali: menyiapkan akses Google Drive</summary>
          <ol className="list-decimal pl-5 mt-2 space-y-1 text-muted-foreground">
            <li>Buka <b>console.cloud.google.com</b> → buat project → aktifkan <b>Google Drive API</b> dan <b>People API</b> (untuk sinkron kontak).</li>
            <li><b>OAuth consent screen</b>: tipe External, isi nama aplikasi, lalu <b>Publish app (In production)</b>. Bila dibiarkan “Testing”, izin Google kedaluwarsa tiap 7 hari dan backup berhenti.</li>
            <li><b>Credentials → Create credentials → OAuth client ID</b>, tipe <b>Web application</b>. Pada <i>Authorized redirect URIs</i> isi: <code className="break-all">{botStatus?.redirect_uri || 'https://pusaka.smpn8ciamis.sch.id/wa-api/backup/oauth/callback'}</code></li>
            <li>Di server bot, tambahkan <code>GOOGLE_CLIENT_ID</code> dan <code>GOOGLE_CLIENT_SECRET</code> (file .env atau pm2), lalu <code>pm2 restart wa-bot --update-env</code>.</li>
            <li>Kembali ke sini, klik <b>Hubungkan Google Drive</b>, pilih akun, dan izinkan (centang juga izin <b>Kontak</b>). Untuk Drive, bot hanya mengakses folder/berkas buatannya sendiri. Izin Kontak mencakup seluruh kontak akun tersebut, jadi sebaiknya pakai akun Google khusus sekolah. Bila muncul layar “Google belum memverifikasi aplikasi ini”, pilih Lanjutan → lanjutkan (wajar untuk aplikasi milik sendiri).</li>
            <li>Server perlu perintah <code>tar</code> dan akses ke database: default memakai <code>docker exec supabase-db pg_dump</code>. Bila nama kontainer berbeda, set <code>BACKUP_DB_CONTAINER</code>; atau set <code>BACKUP_DATABASE_URL</code> (butuh <code>pg_dump</code> terpasang).</li>
          </ol>
        </details>
      </CardContent>
    </Card>
  );
}
