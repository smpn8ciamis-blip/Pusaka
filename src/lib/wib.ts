// Waktu WIB (Asia/Jakarta, UTC+7) untuk input <input type="datetime-local"> dan tampilan.
//
// Masalah yang diperbaiki: nilai datetime-local ("2026-11-22T08:00") tidak membawa zona waktu. Bila dikirim apa adanya ke kolom
// timestamptz, Postgres menganggapnya UTC (08:00 UTC = 15:00 WIB), lalu saat dibaca kembali peramban menampilkannya dalam zona
// perangkat, sehingga jam yang dipilih tidak sama dengan yang tersimpan. Di sini input SELALU dianggap WIB, disimpan sebagai
// instan yang benar, dan dibaca kembali dalam WIB di perangkat mana pun.

export const WIB_TZ = 'Asia/Jakarta';
const WIB_OFFSET = '+07:00'; // WIB tidak mengenal waktu musim panas

const INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** "2026-11-22T08:00" (jam dinding WIB) -> ISO UTC "2026-11-22T01:00:00.000Z". Kosong/tidak valid -> null. */
export function wibInputToIso(v: string | null | undefined): string | null {
  const m = INPUT_RE.exec((v || '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59 || (s && +s > 59)) return null;
  const t = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s || '00'}${WIB_OFFSET}`);
  if (Number.isNaN(t.getTime())) return null;
  // tanggal yang tidak ada (mis. 31 Februari) bergeser oleh Date; tolak
  if (isoToWibInput(t.toISOString()).slice(0, 10) !== `${y}-${mo}-${d}`) return null;
  return t.toISOString();
}

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: WIB_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Instan (ISO/Date) -> "yyyy-MM-ddTHH:mm" dalam WIB, untuk nilai awal <input type="datetime-local">. */
export function isoToWibInput(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(d)) if (x.type !== 'literal') p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Hari ini + addDays, pukul hh:mm WIB, dalam format input datetime-local. */
export function wibInputFromNow(addDays: number, hour: number, minute = 0, now: Date = new Date()): string {
  const today = isoToWibInput(now).slice(0, 10); // tanggal WIB saat ini
  const base = new Date(`${today}T00:00:00${WIB_OFFSET}`);
  base.setUTCDate(base.getUTCDate() + addDays);
  const day = isoToWibInput(base).slice(0, 10);
  return `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Tampilan "22 November 2026" dalam WIB. */
export function formatWibDate(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: WIB_TZ });
}

/** Tampilan "22 Nov 2026 08.00 WIB". */
export function formatWibDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: WIB_TZ });
  const time = isoToWibInput(d).slice(11).replace(':', '.');
  return `${date} ${time} WIB`;
}

/** "22/11 08:00" (dd/MM HH:mm) dalam WIB. */
export function formatWibShort(iso: string | Date | null | undefined): string {
  const w = isoToWibInput(iso);
  return w ? `${w.slice(8, 10)}/${w.slice(5, 7)} ${w.slice(11)}` : '';
}

/** Jam "08.00.05" dalam WIB (id-ID). */
export function formatWibClock(iso: string | number | Date | null | undefined): string {
  if (iso == null || iso === '') return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('id-ID', { timeZone: WIB_TZ });
}
