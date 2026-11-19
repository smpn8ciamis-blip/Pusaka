import { useEffect } from 'react';

/**
 * Menjaga layar tetap menyala selama `active` (Screen Wake Lock API). Dilepas otomatis oleh browser saat tab
 * tersembunyi, jadi diminta ulang saat tab terlihat lagi. Browser yang tidak mendukung (atau tanpa HTTPS) diabaikan
 * diam-diam: ujian tetap berjalan, hanya layar bisa padam sesuai pengaturan perangkat.
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !(navigator as any).wakeLock) return;
    let lock: any = null;
    let cancelled = false;
    const request = async () => {
      try {
        if (cancelled || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
        lock = await (navigator as any).wakeLock.request('screen');
        if (cancelled) { lock.release?.().catch(() => {}); lock = null; }
      } catch { /* ditolak (baterai hemat / tidak didukung): abaikan */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') request(); };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      try { lock?.release?.().catch(() => {}); } catch { /* abaikan */ }
      lock = null;
    };
  }, [active]);
}
