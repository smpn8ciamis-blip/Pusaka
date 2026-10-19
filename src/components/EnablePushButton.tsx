import { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { currentPushState, disablePush, enablePush } from '@/lib/webPush';

/** Tombol aktif/nonaktif notifikasi absensi di perangkat ini (muncul di layar kunci). */
export function EnablePushButton({ className }: { className?: string }) {
  const { user } = useAuth();
  const [state, setState] = useState<'unsupported' | 'denied' | 'on' | 'off'>('off');
  const [busy, setBusy] = useState(false);

  useEffect(() => { currentPushState().then(setState); }, [user?.id]);
  if (!user || state === 'unsupported') return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (state === 'on') { await disablePush(); toast.success('Notifikasi absensi dimatikan di perangkat ini'); }
      else { await enablePush(user.id); toast.success('Notifikasi absensi aktif. Setiap absen akan muncul di layar kunci.'); }
      setState(await currentPushState());
    } catch (e: any) {
      toast.error(e?.message || 'Gagal mengatur notifikasi');
      setState(await currentPushState());
    } finally { setBusy(false); }
  };

  return (
    <Button variant="ghost" size="sm" onClick={toggle} disabled={busy} className={className ?? 'px-2 text-muted-foreground hover:text-foreground'}
      title={state === 'on' ? 'Matikan notifikasi absensi' : state === 'denied' ? 'Izin notifikasi diblokir di browser' : 'Aktifkan notifikasi absensi'}>
      {state === 'on' ? <BellRing className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4" />}
    </Button>
  );
}
