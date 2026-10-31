import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHero } from "./Profil";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock, MapPin, Search, X } from "lucide-react";
import {
  agendaStatus, dateRange, dayKey, googleCalendarUrl, isSameDay, relativeLabel, timeRange,
  type AgendaItem, type AgendaStatus,
} from "@/lib/websiteAgenda";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

type Tab = "mendatang" | "selesai" | "semua";

const STATUS_STYLE: Record<AgendaStatus, { chip: string; dot: string }> = {
  ongoing: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500" },
  upcoming: { chip: "bg-blue-50 text-blue-700 ring-blue-600/20", dot: "bg-[#1E40AF]" },
  past: { chip: "bg-slate-100 text-slate-500 ring-slate-400/20", dot: "bg-slate-300" },
};

function DateBlock({ date, status }: { date: Date; status: AgendaStatus }) {
  const past = status === "past";
  return (
    <div className={`flex h-[72px] w-[64px] shrink-0 flex-col items-center justify-center rounded-2xl border ${past ? "border-slate-200 bg-slate-50 text-slate-400" : "border-[#1E40AF]/15 bg-[#1E40AF] text-white"}`}>
      <span className={`text-[11px] font-medium ${past ? "text-slate-400" : "text-blue-100"}`}>
        {date.toLocaleDateString("id-ID", { weekday: "short" })}
      </span>
      <span className="text-2xl font-bold leading-none tabular-nums">{date.getDate()}</span>
      <span className={`mt-0.5 text-[11px] ${past ? "text-slate-400" : "text-blue-100"}`}>
        {date.toLocaleDateString("id-ID", { month: "short" })}
      </span>
    </div>
  );
}

function StatusChip({ a }: { a: AgendaItem }) {
  const st = agendaStatus(a);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[st].chip}`}>
      {st === "ongoing" && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
      )}
      {relativeLabel(a)}
    </span>
  );
}

function MiniCalendar({
  month, onMonth, events, selected, onSelect,
}: {
  month: Date; onMonth: (d: Date) => void; events: AgendaItem[]; selected: Date | null; onSelect: (d: Date | null) => void;
}) {
  const today = new Date();
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaStatus>();
    events.forEach((e) => {
      const k = dayKey(new Date(e.start_at));
      const st = agendaStatus(e);
      const cur = m.get(k);
      // prioritas penanda: berlangsung > mendatang > selesai
      if (!cur || (cur === "past" && st !== "past") || (cur === "upcoming" && st === "ongoing")) m.set(k, st);
    });
    return m;
  }, [events]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Senin = 0
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{MONTHS[month.getMonth()]} {month.getFullYear()}</h2>
        <div className="flex gap-1">
          <button onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Bulan sebelumnya" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Bulan berikutnya" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] font-medium text-slate-400">
        {WEEKDAYS.map((w) => <div key={w} className="pb-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const st = byDay.get(dayKey(d));
          const isToday = isSameDay(d, today);
          const isSel = !!selected && isSameDay(d, selected);
          return (
            <button
              key={i}
              disabled={!st}
              onClick={() => onSelect(isSel ? null : d)}
              aria-pressed={isSel}
              aria-label={`${d.getDate()} ${MONTHS[d.getMonth()]}${st ? ", ada kegiatan" : ""}`}
              className={`relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-sm transition
                ${isSel ? "bg-[#1E40AF] font-semibold text-white" : isToday ? "bg-amber-100 font-semibold text-amber-900" : st ? "font-medium text-slate-900 hover:bg-slate-100" : "text-slate-400"}
                ${st ? "cursor-pointer" : "cursor-default"}`}
            >
              {d.getDate()}
              {st && !isSel && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${STATUS_STYLE[st].dot}`} />}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-300" /> Hari ini</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#1E40AF]" /> Mendatang</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" /> Selesai</span>
      </div>
    </div>
  );
}

function AgendaRow({ a, onOpen }: { a: AgendaItem; onOpen: () => void }) {
  const d = new Date(a.start_at);
  const st = agendaStatus(a);
  return (
    <button
      onClick={onOpen}
      className={`group flex w-full gap-4 rounded-2xl border bg-white p-4 text-left transition hover:border-[#1E40AF]/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] sm:gap-5 sm:p-5 ${st === "past" ? "border-slate-200 opacity-80" : "border-slate-200"}`}
    >
      <DateBlock date={d} status={st} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip a={a} />
        </div>
        <h3 className="mt-1.5 text-lg font-semibold leading-snug text-slate-900 group-hover:text-[#1E40AF]">{a.title}</h3>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{timeRange(a)}</span>
          {a.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{a.location}</span>}
        </div>
        {a.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">{a.description}</p>}
      </div>
    </button>
  );
}

export default function Agenda() {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("mendatang");
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(() => new Date());
  const [day, setDay] = useState<Date | null>(null);
  const [detail, setDetail] = useState<AgendaItem | null>(null);

  useEffect(() => {
    (supabase.from("website_agenda" as any) as any)
      .select("*").eq("is_published", true).order("start_at", { ascending: true }).limit(500)
      .then(({ data }: any) => { setItems(data ?? []); setLoading(false); });
  }, []);

  const counts = useMemo(() => {
    const up = items.filter((a) => agendaStatus(a) !== "past").length;
    return { mendatang: up, selesai: items.length - up, semua: items.length };
  }, [items]);

  // Bila tidak ada kegiatan mendatang tetapi ada yang sudah lewat, buka tab "Selesai" otomatis.
  useEffect(() => {
    if (!loading && counts.mendatang === 0 && counts.selesai > 0) setTab("selesai");
  }, [loading, counts.mendatang, counts.selesai]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = items.filter((a) => {
      if (day) return isSameDay(new Date(a.start_at), day);
      const past = agendaStatus(a) === "past";
      if (tab === "mendatang") return !past;
      if (tab === "selesai") return past;
      return true;
    });
    if (needle) r = r.filter((a) => `${a.title} ${a.location ?? ""} ${a.description ?? ""}`.toLowerCase().includes(needle));
    return tab === "selesai" && !day ? [...r].reverse() : r;
  }, [items, tab, q, day]);

  const grouped = useMemo(() => {
    const g: { label: string; rows: AgendaItem[] }[] = [];
    list.forEach((a) => {
      const d = new Date(a.start_at);
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      const last = g[g.length - 1];
      if (last && last.label === label) last.rows.push(a);
      else g.push({ label, rows: [a] });
    });
    return g;
  }, [list]);

  const next = useMemo(() => items.find((a) => agendaStatus(a) !== "past"), [items]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "mendatang", label: "Mendatang" },
    { id: "selesai", label: "Selesai" },
    { id: "semua", label: "Semua" },
  ];

  return (
    <div>
      <PageHero title="Agenda" subtitle="Jadwal kegiatan dan acara sekolah. Simpan ke kalender Anda agar tidak terlewat.">
        {next && (
          <button onClick={() => setDetail(next)} className="inline-flex max-w-full items-center gap-3 rounded-full bg-white/10 py-2 pl-2 pr-5 text-left backdrop-blur transition hover:bg-white/20">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[#0B1F4D]"><CalendarDays className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="block text-[11px] text-blue-100/80">Berikutnya, {relativeLabel(next).toLowerCase()}</span>
              <span className="block truncate text-sm font-semibold">{next.title}</span>
            </span>
          </button>
        )}
      </PageHero>

      <div className="container mx-auto grid gap-8 px-4 py-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="tablist" className="inline-flex w-fit rounded-full bg-slate-100 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id} role="tab" aria-selected={tab === t.id && !day}
                  onClick={() => { setTab(t.id); setDay(null); }}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === t.id && !day ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {t.label} <span className="opacity-50">{counts[t.id]}</span>
                </button>
              ))}
            </div>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kegiatan atau lokasi"
                className="h-10 w-full rounded-full border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/20"
              />
            </div>
          </div>

          {day && (
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#1E40AF]/10 py-1.5 pl-4 pr-2 text-sm font-medium text-[#1E40AF]">
              Kegiatan pada {day.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              <button onClick={() => setDay(null)} aria-label="Hapus filter tanggal" className="rounded-full p-1 hover:bg-[#1E40AF]/15"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {loading ? (
            <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div>
          ) : grouped.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 px-6 py-16 text-center">
              <CalendarDays className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="font-medium text-slate-700">
                {q || day ? "Tidak ada kegiatan yang cocok." : tab === "mendatang" ? "Belum ada kegiatan mendatang." : "Belum ada kegiatan."}
              </p>
              {tab === "mendatang" && counts.selesai > 0 && !q && !day && (
                <button onClick={() => setTab("selesai")} className="mt-3 text-sm font-medium text-[#1E40AF] hover:underline">Lihat kegiatan yang sudah selesai</button>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map((g) => (
                <section key={g.label}>
                  <h2 className="mb-3 text-sm font-semibold text-slate-500">{g.label}</h2>
                  <div className="space-y-3">
                    {g.rows.map((a) => <AgendaRow key={a.id} a={a} onOpen={() => setDetail(a)} />)}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <MiniCalendar month={month} onMonth={setMonth} events={items} selected={day} onSelect={(d) => { setDay(d); if (d) setQ(""); }} />
        </aside>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg rounded-3xl p-0 overflow-hidden">
          {detail && (
            <>
              <div className="bg-[#0B1F4D] p-6 pr-12 text-white">
                <StatusChip a={detail} />
                <DialogHeader className="mt-3 space-y-0 text-left">
                  <DialogTitle className="text-xl font-bold leading-snug text-white">{detail.title}</DialogTitle>
                </DialogHeader>
              </div>
              <div className="space-y-4 p-6">
                <div className="flex gap-3 text-sm text-slate-700">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#1E40AF]" />
                  <div>
                    <div className="font-medium">{dateRange(detail)}</div>
                    <div className="text-slate-500">{timeRange(detail)}</div>
                  </div>
                </div>
                {detail.location && (
                  <div className="flex gap-3 text-sm text-slate-700">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#1E40AF]" />
                    <div className="font-medium">{detail.location}</div>
                  </div>
                )}
                {detail.description && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{detail.description}</p>}
                <a
                  href={googleCalendarUrl(detail)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#1E40AF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1E3A8A]"
                >
                  <CalendarPlus className="h-4 w-4" /> Tambah ke Google Kalender
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
