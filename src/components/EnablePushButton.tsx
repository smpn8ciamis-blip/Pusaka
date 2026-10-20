import { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { currentPushState, syncPush } from '@/lib/webPush';
import { NotificationSetupDialog } from '@/components/NotificationSetupDialog';

/** Tombol lonceng: membuka panduan & pengaturan notifikasi absensi (layar kunci, pasang aplikasi, uji). */
export function EnablePushButton({ className }: { className?: string }) {
  const { user } = useAuth();
  const [state, setState] = useState<'unsupported' | 'denied' | 'on' | 'off'>('off');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    syncPush(user.id).finally(() => currentPushState().then(setState));
  }, [user?.id]);
  if (!user || state === 'unsupported') return null;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className={className ?? 'px-2 text-muted-foreground hover:text-foreground'}
        title="Pengaturan notifikasi absensi">
        {state === 'on' ? <BellRing className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4" />}
      </Button>
      <NotificationSetupDialog open={open} onClose={() => setOpen(false)} onChanged={setState} />
    </>
  );
}
