import { supabase } from '@/integrations/supabase/client';
import { WA_BOT_URL } from '@/lib/waBot';

const db = supabase as any;

export const isPushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration() {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

/** Status langganan di perangkat ini. */
export async function currentPushState(): Promise<'unsupported' | 'denied' | 'on' | 'off'> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

export async function enablePush(userId: string) {
  if (!isPushSupported()) throw new Error('Browser ini tidak mendukung notifikasi. Di iPhone, pasang aplikasi ke layar utama dulu.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di browser.');

  const res = await fetch(`${WA_BOT_URL}/push/public-key`);
  const { key } = await res.json().catch(() => ({ key: null }));
  if (!key) throw new Error('Notifikasi belum diaktifkan di server (kunci VAPID belum diatur).');

  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  const j = sub.toJSON() as any;
  const { error } = await db.from('web_push_subscriptions').upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await db.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}
