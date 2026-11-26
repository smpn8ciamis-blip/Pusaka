// Satu akun = satu perangkat (login terakhir menang). Perangkat dikenali lewat ID acak yang disimpan di browser ini;
// semua tab di browser yang sama berbagi ID itu, jadi membuka beberapa tab tidak mengeluarkan siapa pun.
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;
const KEY = 'pusaka_device_id';

const randomId = () => {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* lanjut */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

let memoryId: string | null = null;
export function getDeviceId(): string {
  try {
    let v = localStorage.getItem(KEY);
    if (!v || v.length < 8) { v = randomId(); localStorage.setItem(KEY, v); }
    return v;
  } catch {
    // localStorage diblokir: pakai ID sementara selama halaman terbuka
    return (memoryId ??= randomId());
  }
}

/** "Chrome di Android" dari user agent; hanya sebagai keterangan untuk pengguna. */
export function deviceLabel(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : 'perangkat lain';
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari' : 'Browser';
  return `${browser} di ${os}`;
}

// Selama proses login (sampai device_claim selesai) pemeriksaan perangkat ditunda,
// supaya perangkat yang baru login tidak langsung dianggap perangkat lama.
let loggingIn = false;
export const beginLogin = () => { loggingIn = true; };
export const cancelLogin = () => { loggingIn = false; };
export const isLoggingIn = () => loggingIn;

/** Dipanggil setelah login selesai seluruhnya (termasuk 2FA): perangkat ini menjadi satu-satunya yang aktif. */
export async function completeLogin(): Promise<void> {
  try {
    await db.rpc('device_claim', { p_device_id: getDeviceId(), p_label: deviceLabel() });
  } catch { /* migrasi belum dijalankan / jaringan: login tetap berjalan */ }
  finally { loggingIn = false; }
}

export interface OtherDevice { label: string | null; loggedInAt: string | null }

/** Mengembalikan data perangkat lain bila akun ini sudah dipakai login di perangkat lain; null bila aman atau tidak bisa dipastikan. */
export async function otherDeviceActive(): Promise<OtherDevice | null> {
  try {
    const { data, error } = await db.rpc('device_status', { p_device_id: getDeviceId() });
    if (error || !data || data.ok !== false) return null; // galat jaringan/migrasi: jangan mengeluarkan pengguna
    return { label: data.label ?? null, loggedInAt: data.logged_in_at ?? null };
  } catch { return null; }
}
