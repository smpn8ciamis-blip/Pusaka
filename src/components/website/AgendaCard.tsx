import { CalendarPlus, Clock, MapPin } from "lucide-react";
import { agendaDateParts, agendaState, agendaTimeText, googleCalendarUrl, type AgendaItem, type AgendaState } from "@/lib/agenda";

const BADGE: Record<AgendaState, string> = {
  ongoing: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  today: "bg-amber-50 text-amber-700 ring-amber-600/20",
  soon: "bg-blue-50 text-[#1E40AF] ring-blue-600/20",
  upcoming: "bg-slate-100 text-slate-600 ring-slate-500/20",
  done: "bg-slate-100 text-slate-400 ring-slate-400/20",
};

/** Kartu agenda: blok tanggal di kiri, rincian di kanan. `compact` dipakai di beranda. */
export default function AgendaCard({ a, compact = false }: { a: AgendaItem; compact?: boolean }) {
  const d = agendaDateParts(a.start_at);
  const st = agendaState(a);
  const done = st.state === "done";

  return (
    <article className={`group flex gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg sm:p-5 ${done ? "opacity-80" : ""}`}>
      <div className={`flex w-16 shrink-0 flex-col items-center justify-center self-start rounded-xl py-2.5 text-center sm:w-[4.5rem] ${done ? "bg-slate-100 text-slate-500" : "bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] text-white shadow-md shadow-blue-900/15"}`}>
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{d.month}</span>
        <span className="text-2xl font-extrabold leading-none tabular-nums sm:text-[1.65rem]">{d.day}</span>
        <span className="mt-0.5 text-[10px] opacity-80">{d.weekday}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${BADGE[st.state]}`}>
            {st.state === "ongoing" && <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
            {st.label}
          </span>
        </div>
        <h3 className="font-bold leading-snug text-slate-900 [overflow-wrap:anywhere] group-hover:text-[#1E40AF]">{a.title}</h3>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{agendaTimeText(a)}</span>
          {a.location && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{a.location}</span></span>}
        </div>
        {a.description && <p className={`mt-2 text-sm text-slate-600 ${compact ? "line-clamp-2" : "line-clamp-3"}`}>{a.description}</p>}
        {!done && !compact && (
          <a href={googleCalendarUrl(a)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E40AF] hover:underline">
            <CalendarPlus className="h-3.5 w-3.5" /> Tambah ke kalender
          </a>
        )}
      </div>
    </article>
  );
}
