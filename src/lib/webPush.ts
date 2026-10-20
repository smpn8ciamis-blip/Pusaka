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

  requestPersistentStorage();
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

/** Dipanggil saat aplikasi dibuka: daftarkan SW dan sinkronkan langganan (memperbarui endpoint yang berganti / kedaluwarsa). */
export async function syncPush(userId: string) {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const res = await fetch(`${WA_BOT_URL}/push/public-key`);
      const { key } = await res.json().catch(() => ({ key: null }));
      if (!key) return;
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    }
    const j = sub.toJSON() as any;
    await db.from('web_push_subscriptions').upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, user_agent: navigator.userAgent.slice(0, 200) },
      { onConflict: 'endpoint' },
    );
  } catch { /* abaikan */ }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await db.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

// ---- PWA: pasang ke layar utama & izin penyimpanan ----
let deferredInstall: any = null;
export function initPwa() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
  window.addEventListener('appinstalled', () => { deferredInstall = null; });
  // Daftarkan service worker sejak awal supaya aplikasi bisa dipasang dan push diterima walau halaman tertutup
  if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
export const canPromptInstall = () => !!deferredInstall;
export const isInstalled = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  const r = await deferredInstall.userChoice.catch(() => null);
  deferredInstall = null;
  return r?.outcome === 'accepted';
}
export async function requestPersistentStorage() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
/** Minta server mengirim notifikasi tes ke perangkat ini setelah beberapa detik (untuk uji layar terkunci / browser tertutup). */
export async function sendTestPush(delaySeconds = 10) {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) throw new Error('Notifikasi belum diaktifkan di perangkat ini.');
  const res = await fetch(`${WA_BOT_URL}/push/test`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint, delay: delaySeconds }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || 'Gagal meminta notifikasi tes');
}
