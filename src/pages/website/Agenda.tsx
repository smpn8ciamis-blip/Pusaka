import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHero } from "./Profil";
import AgendaCard from "@/components/website/AgendaCard";
import { agendaDateParts, isUpcomingOrOngoing, type AgendaItem } from "@/lib/agenda";

type Tab = "mendatang" | "selesai";

export default function Agenda() {
  const [rows, setRows] = useState<AgendaItem[] | null>(null);
  const [tab, setTab] = useState<Tab>("mendatang");

  useEffect(() => {
    (supabase.from("website_agenda" as any) as any)
      .select("id,title,description,start_at,end_at,location")
      .eq("is_published", true).order("start_at", { ascending: true }).limit(400)
      .then(({ data }: any) => setRows((data ?? []) as AgendaItem[]));
  }, []);

  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    const all = rows ?? [];
    return {
      upcoming: all.filter((a) => isUpcomingOrOngoing(a, now)),                                   // terdekat dulu
      past: all.filter((a) => !isUpcomingOrOngoing(a, now)).sort((x, y) => y.start_at.localeCompare(x.start_at)), // terbaru dulu
    };
  }, [rows]);

  const list = tab === "mendatang" ? upcoming : past;
  // Kelompokkan per bulan agar mudah dipindai
  const groups = useMemo(() => {
    const m = new Map<string, AgendaItem[]>();
    for (const a of list) {
      const k = agendaDateParts(a.start_at).monthYear;
      (m.get(k) ?? m.set(k, []).get(k)!).push(a);
    }
    return Array.from(m.entries());
  }, [list]);

  const tabBtn = (t: Tab, label: string, n: number) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      aria-pressed={tab === t}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === t ? "bg-[#1E40AF] text-white shadow" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"}`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-[11px] leading-5 ${tab === t ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>{n}</span>
    </button>
  );

  return (
    <div>
      <Helmet>
        <title>Agenda — SMPN 8 Ciamis</title>
        <meta name="description" content="Jadwal kegiatan dan agenda SMP Negeri 8 Ciamis." />
      </Helmet>
      <PageHero title="Agenda Sekolah" subtitle="Jadwal kegiatan, acara, dan informasi penting SMP Negeri 8 Ciamis." />

      <div className="container mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div className="mb-8 flex flex-wrap gap-2">
          {tabBtn("mendatang", "Mendatang", upcoming.length)}
          {tabBtn("selesai", "Telah selesai", past.length)}
        </div>

        {rows === null ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-500">
            <CalendarDays className="mb-3 h-10 w-10 text-slate-300" />
            {tab === "mendatang" ? "Belum ada agenda mendatang." : "Belum ada agenda yang selesai."}
          </div>
        ) : (
          <div className="space-y-10">
            {groups.map(([month, items]) => (
              <section key={month}>
                <h2 className="mb-4 flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-slate-500">
                  {month}<span className="h-px flex-1 bg-slate-200" />
                </h2>
                <div className="space-y-3">{items.map((a) => <AgendaCard key={a.id} a={a} />)}</div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
