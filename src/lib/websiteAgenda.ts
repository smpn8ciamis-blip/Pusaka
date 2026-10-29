// Helper tampilan agenda sekolah (dipakai beranda & halaman Agenda).

export type AgendaItem = {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  location?: string | null;
  is_published?: boolean;
};

export type AgendaStatus = "ongoing" | "upcoming" | "past";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Waktu selesai kegiatan; bila kosong dianggap berakhir pada hari yang sama. */
export const agendaEnd = (a: AgendaItem) => (a.end_at ? new Date(a.end_at) : endOfDay(new Date(a.start_at)));

export function agendaStatus(a: AgendaItem, now = new Date()): AgendaStatus {
  const start = new Date(a.start_at);
  if (start > now) return "upcoming";
  return agendaEnd(a) >= now ? "ongoing" : "past";
}

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Label relatif: "Berlangsung", "Hari ini", "Besok", "5 hari lagi", "Selesai". */
export function relativeLabel(a: AgendaItem, now = new Date()): string {
  const status = agendaStatus(a, now);
  if (status === "ongoing") return "Berlangsung";
  if (status === "past") return "Selesai";
  const diff = Math.round((startOfDay(new Date(a.start_at)).getTime() - startOfDay(now).getTime()) / 86400000);
  if (diff <= 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff < 14) return `${diff} hari lagi`;
  if (diff < 60) return `${Math.round(diff / 7)} minggu lagi`;
  return `${Math.round(diff / 30)} bulan lagi`;
}

const timeFmt = (d: Date) => d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

/** "08.00 – 12.00" / "08.00" / "Sepanjang hari" (jam 00.00 tanpa waktu selesai). */
export function timeRange(a: AgendaItem): string {
  const s = new Date(a.start_at);
  const allDay = s.getHours() === 0 && s.getMinutes() === 0 && !a.end_at;
  if (allDay) return "Sepanjang hari";
  if (!a.end_at) return `${timeFmt(s)} WIB`;
  const e = new Date(a.end_at);
  if (!isSameDay(s, e)) return `${timeFmt(s)} WIB`;
  return `${timeFmt(s)} – ${timeFmt(e)} WIB`;
}

/** "Senin, 3 November 2026" atau "3 – 5 November 2026" untuk kegiatan beberapa hari. */
export function dateRange(a: AgendaItem): string {
  const s = new Date(a.start_at);
  const long = (d: Date) => d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (!a.end_at) return long(s);
  const e = new Date(a.end_at);
  if (isSameDay(s, e)) return long(s);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    return `${s.getDate()} – ${e.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;
  }
  const short = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  return `${short(s)} – ${short(e)}`;
}

/** Tautan "Tambah ke Google Kalender". */
export function googleCalendarUrl(a: AgendaItem): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const s = new Date(a.start_at);
  const e = a.end_at ? new Date(a.end_at) : new Date(s.getTime() + 60 * 60 * 1000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: a.title,
    dates: `${fmt(s)}/${fmt(e)}`,
    details: a.description ?? "",
    location: a.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
