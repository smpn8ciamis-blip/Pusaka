import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Smartphone, BellRing, Download, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  canPromptInstall, currentPushState, disablePush, enablePush, isInstalled, promptInstall, sendTestPush,
} from '@/lib/webPush';

type PushState = 'unsupported' | 'denied' | 'on' | 'off';

const Step = ({ done, title, children }: { done?: boolean; title: string; children?: React.ReactNode }) => (
  <div className="flex gap-3 rounded-lg border p-3 text-sm">
    {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
    <div className="min-w-0 flex-1 space-y-2"><div className="font-medium">{title}</div>{children}</div>
  </div>
);

/** Panduan & pengaturan agar notifikasi absensi muncul di layar kunci walau browser tertutup. */
export function NotificationSetupDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged?: (s: PushState) => void }) {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>('off');
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(false);
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  const refresh = async () => { const s = await currentPushState(); setState(s); setInstalled(isInstalled()); onChanged?.(s); };
  useEffect(() => { if (open) refresh(); /* eslint-disable-next-line */ }, [open]);

  const run = async (fn: () => Promise<void>, okMsg?: string) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast.success(okMsg); } catch (e: any) { toast.error(e?.message || 'Gagal'); }
    finally { setBusy(false); refresh(); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BellRing className="h-5 w-5" />Notifikasi Absensi</DialogTitle>
          <DialogDescription>Ikuti langkah berikut agar notifikasi muncul di layar kunci, juga saat browser tertutup.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Step done={state === 'on'} title="1. Izinkan notifikasi">
            {state === 'unsupported' && <p className="text-xs text-muted-foreground">Browser ini belum mendukung notifikasi{ios ? '. Di iPhone, pasang aplikasi ke layar utama dulu (langkah 2), lalu buka dari ikon aplikasi.' : '.'}</p>}
            {state === 'denied' && <p className="text-xs text-destructive">Izin diblokir. Buka pengaturan situs di browser (ikon gembok di alamat) lalu ubah Notifikasi menjadi Izinkan.</p>}
            {(state === 'off' || state === 'on') && (
              <div className="flex flex-wrap gap-2">
                {state === 'off'
                  ? <Button size="sm" disabled={busy || !user} onClick={() => run(() => enablePush(user!.id), 'Notifikasi diaktifkan')}>Izinkan notifikasi</Button>
                  : <Button size="sm" variant="outline" disabled={busy} onClick={() => run(disablePush, 'Notifikasi dimatikan di perangkat ini')}>Matikan</Button>}
              </div>
            )}
          </Step>

          <Step done={installed} title="2. Pasang aplikasi ke layar utama">
            <p className="text-xs text-muted-foreground">Aplikasi yang terpasang lebih andal menerima notifikasi saat layar terkunci dan tidak dimatikan seperti tab browser.</p>
            {installed ? <p className="text-xs text-green-600">Sudah terpasang.</p> : canPromptInstall() ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await promptInstall(); })}><Download className="mr-1 h-4 w-4" />Pasang aplikasi</Button>
            ) : ios ? (
              <p className="text-xs">Safari: tekan tombol <b>Bagikan</b> → <b>Tambahkan ke Layar Utama</b>, lalu buka PUSAKA dari ikonnya.</p>
            ) : (
              <p className="text-xs">Chrome: menu ⋮ → <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b>.</p>
            )}
          </Step>

          <Step title="3. Atur izin di ponsel (tidak bisa diaktifkan otomatis oleh website)">
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li><b>Layar kunci:</b> Setelan → Notifikasi → {installed ? 'PUSAKA' : 'Chrome'} → <i>Layar kunci</i> = Tampilkan semua konten.</li>
              <li><b>Baterai:</b> Setelan → Aplikasi → {installed ? 'PUSAKA' : 'Chrome'} → Baterai → <i>Tanpa batasan</i> (jangan dioptimalkan).</li>
              <li><b>Xiaomi / Oppo / Vivo / Realme:</b> aktifkan <i>Mulai otomatis (Autostart)</i> dan kunci aplikasi di Recent Apps.</li>
              <li><b>Samsung:</b> Perawatan perangkat → Baterai → Batas penggunaan di latar belakang → keluarkan aplikasi dari daftar "tidur".</li>
              <li><b>iPhone:</b> Setelan → Notifikasi → PUSAKA → aktifkan <i>Layar Kunci</i>.</li>
              <li>Jangan "Paksa berhenti" aplikasi/browser. Menutup dengan menggeser dari Recent Apps boleh, selama pembatasan baterai di atas dimatikan.</li>
            </ul>
          </Step>

          <Step title="4. Uji notifikasi">
            <p className="text-xs text-muted-foreground">Tekan tombol, lalu <b>kunci layar dan tutup browser</b>. Notifikasi tes muncul dalam ±10 detik.</p>
            <Button size="sm" variant="outline" disabled={busy || state !== 'on'} onClick={() => run(() => sendTestPush(10), 'Tes dijadwalkan. Kunci layar dan tutup browser sekarang.')}>
              <FlaskConical className="mr-1 h-4 w-4" />Kirim tes 10 detik
            </Button>
          </Step>
        </div>
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Smartphone className="h-3 w-3" />Pengaturan ini berlaku per perangkat.</p>
      </DialogContent>
    </Dialog>
  );
}
