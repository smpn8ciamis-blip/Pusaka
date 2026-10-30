// Helper tampilan agenda website (status, rentang waktu, tautan "Tambah ke kalender").
export interface AgendaItem {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  location?: string | null;
}

const TZ = "Asia/Jakarta";
const DAY = 24 * 3600 * 1000;

/** Tanggal (yyyy-mm-dd) menurut WIB, untuk membandingkan "hari yang sama". */
const wibDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/** Akhir kegiatan. Tanpa jam selesai, dianggap berlangsung sampai akhir hari mulai (WIB). */
export function agendaEnd(a: AgendaItem): Date {
  if (a.end_at) return new Date(a.end_at);
  const start = new Date(a.start_at);
  const endOfDay = new Date(`${wibDay(start)}T23:59:59+07:00`);
  return endOfDay;
}

export type AgendaState = "ongoing" | "today" | "soon" | "upcoming" | "done";

export function agendaState(a: AgendaItem, now = new Date()): { state: AgendaState; label: string } {
  const start = new Date(a.start_at);
  const end = agendaEnd(a);
  if (now > end) return { state: "done", label: "Selesai" };
  if (now >= start) return { state: "ongoing", label: "Berlangsung" };
  if (wibDay(start) === wibDay(now)) return { state: "today", label: "Hari ini" };
  const days = Math.ceil((new Date(`${wibDay(start)}T00:00:00+07:00`).getTime() - new Date(`${wibDay(now)}T00:00:00+07:00`).getTime()) / DAY);
  if (days <= 7) return { state: "soon", label: days === 1 ? "Besok" : `${days} hari lagi` };
  return { state: "upcoming", label: "Mendatang" };
}

export const isUpcomingOrOngoing = (a: AgendaItem, now = new Date()) => agendaEnd(a) >= now;

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("id-ID", { timeZone: TZ, ...o });

export const agendaDateParts = (iso: string) => {
  const d = new Date(iso);
  return {
    day: fmt(d, { day: "numeric" }),
    month: fmt(d, { month: "short" }),
    weekday: fmt(d, { weekday: "long" }),
    year: fmt(d, { year: "numeric" }),
    monthYear: fmt(d, { month: "long", year: "numeric" }),
  };
};

const hhmm = (d: Date) => fmt(d, { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":");

/** "08:00 – 12:00 WIB", "08:00 WIB", atau tanggal selesai bila lintas hari. */
export function agendaTimeText(a: AgendaItem): string {
  const s = new Date(a.start_at);
  const startTxt = hhmm(s);
  if (!a.end_at) return startTxt === "00:00" ? "Sepanjang hari" : `${startTxt} WIB`;
  const e = new Date(a.end_at);
  if (wibDay(s) === wibDay(e)) return `${startTxt} – ${hhmm(e)} WIB`;
  return `${startTxt} WIB – ${fmt(e, { day: "numeric", month: "short" })} ${hhmm(e)} WIB`;
}

/** Tautan Google Calendar (acara baru terisi) agar pengunjung bisa menyimpan agenda. */
export function googleCalendarUrl(a: AgendaItem): string {
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(a.start_at);
  const end = a.end_at ? new Date(a.end_at) : new Date(start.getTime() + 2 * 3600 * 1000);
  const p = new URLSearchParams({ action: "TEMPLATE", text: a.title, dates: `${z(start)}/${z(end)}` });
  if (a.description) p.set("details", a.description);
  if (a.location) p.set("location", a.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
