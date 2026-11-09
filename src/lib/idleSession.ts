// Kebijakan sesi login:
// - super_admin, admin, tata_usaha: otomatis keluar setelah 1 jam TANPA aktivitas (jam berjalan ulang tiap ada aktivitas).
// - peran lain: tidak pernah dikeluarkan oleh aplikasi (sesi diperpanjang otomatis oleh Supabase).
export const IDLE_ROLES = ['super_admin', 'admin', 'tata_usaha'] as const;
export const IDLE_LIMIT_MS = 60 * 60 * 1000; // 1 jam
export const IDLE_WARN_MS = 5 * 60 * 1000;   // peringatan 5 menit sebelum keluar
export const ACTIVITY_KEY = 'pusaka_last_activity';

export const isIdleRole = (role: string | null | undefined): boolean =>
  !!role && (IDLE_ROLES as readonly string[]).includes(role);

export type IdleState = 'active' | 'warn' | 'expired';

/** Waktu aktivitas terakhir yang dipakai: yang terbaru dari aktivitas tersimpan dan waktu login; tidak boleh di masa depan. */
export function effectiveLastActivity(now: number, ...times: Array<number | null | undefined>): number {
  let best = 0;
  for (const t of times) {
    if (typeof t === 'number' && Number.isFinite(t) && t > 0 && t > best) best = t;
  }
  if (best === 0) return now;       // belum ada catatan: anggap aktif sekarang
  return Math.min(best, now);       // jam perangkat dimundurkan -> jangan dianggap masa depan
}

export function idleState(now: number, lastActivity: number, limit = IDLE_LIMIT_MS, warn = IDLE_WARN_MS): IdleState {
  const left = lastActivity + limit - now;
  if (left <= 0) return 'expired';
  return left <= warn ? 'warn' : 'active';
}

export const idleMinutesLeft = (now: number, lastActivity: number, limit = IDLE_LIMIT_MS) =>
  Math.max(1, Math.ceil((lastActivity + limit - now) / 60000));
