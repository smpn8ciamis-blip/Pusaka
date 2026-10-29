import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Newspaper, Mail, Images, Calendar, ArrowRight, Plus, Upload, CalendarPlus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cardCls, Pill, fmtDate, fmtDateTime } from "@/components/web-admin/ui";

const count = (t: string, filter?: Record<string, any>) => {
  let q: any = (supabase.from(t as any) as any).select("id", { count: "exact", head: true });
  if (filter) for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  return q;
};

// Hanya kolom yang dipakai (bukan select("*")) agar ringan.
async function loadDashboard() {
  const [news, unread, albums, agenda, msgs, recent] = await Promise.all([
    count("website_news"),
    count("website_contact_messages", { is_read: false }),
    count("website_gallery_albums"),
    count("website_agenda"),
    (supabase.from("website_contact_messages" as any) as any).select("id,name,subject,message,is_read,created_at").order("created_at", { ascending: false }).limit(5),
    (supabase.from("website_news" as any) as any).select("id,title,status,published_at,created_at,cover_image_url").order("created_at", { ascending: false }).limit(5),
  ]);
  return {
    counts: { news: news.count ?? 0, unread: unread.count ?? 0, albums: albums.count ?? 0, agenda: agenda.count ?? 0 },
    messages: (msgs.data ?? []) as any[],
    news: (recent.data ?? []) as any[],
  };
}

const STATS = [
  { key: "news", label: "Total Berita", icon: Newspaper, tone: "bg-blue-50 text-blue-600", to: "/web-admin/berita" },
  { key: "unread", label: "Pesan Belum Dibaca", icon: Mail, tone: "bg-red-50 text-red-600", to: "/web-admin/pesan" },
  { key: "albums", label: "Album Galeri", icon: Images, tone: "bg-emerald-50 text-emerald-600", to: "/web-admin/galeri" },
  { key: "agenda", label: "Agenda", icon: Calendar, tone: "bg-violet-50 text-violet-600", to: "/web-admin/agenda" },
] as const;

const ACTIONS = [
  { to: "/web-admin/berita", label: "Tulis Berita", icon: Plus },
  { to: "/web-admin/galeri", label: "Unggah Foto", icon: Upload },
  { to: "/web-admin/agenda", label: "Tambah Agenda", icon: CalendarPlus },
];

function SectionHead({ title, to, link }: { title: string; to: string; link: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <Link to={to} className="flex items-center gap-1 text-sm font-medium text-[#1E40AF] hover:underline">{link} <ArrowRight className="h-3.5 w-3.5" /></Link>
    </div>
  );
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["web-admin", "dashboard"], queryFn: loadDashboard });
  const c = data?.counts;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 rounded-2xl bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] p-5 text-white shadow-sm sm:p-6">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Dashboard Website</h1>
        <p className="mt-1 text-sm text-blue-100">Ringkasan pengelolaan konten website sekolah.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <Link key={a.to + a.label} to={a.to} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-medium hover:bg-white/25">
              <a.icon className="h-3.5 w-3.5" /> {a.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {STATS.map((s) => (
          <Link key={s.key} to={s.to} className={`${cardCls} p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5`}>
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${s.tone}`}><s.icon className="h-5 w-5" /></div>
            {isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold tabular-nums text-slate-900">{c?.[s.key] ?? 0}</div>}
            <div className="mt-0.5 text-xs text-slate-500">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <section className={`${cardCls} p-4 sm:p-5`}>
          <SectionHead title="Pesan Terbaru" to="/web-admin/pesan" link="Lihat semua" />
          {isLoading ? <Skeleton className="h-40 w-full" /> : (data?.messages.length ?? 0) === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">Belum ada pesan.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data!.messages.map((m) => (
                <li key={m.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 text-sm">
                    {!m.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-[#1E40AF]" aria-label="Belum dibaca" />}
                    <span className="truncate font-medium text-slate-900">{m.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-400">{fmtDateTime(m.created_at)}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{m.subject ? `${m.subject} — ` : ""}{m.message}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${cardCls} p-4 sm:p-5`}>
          <SectionHead title="Berita Terbaru" to="/web-admin/berita" link="Kelola" />
          {isLoading ? <Skeleton className="h-40 w-full" /> : (data?.news.length ?? 0) === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">Belum ada berita.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data!.news.map((n) => (
                <li key={n.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  {n.cover_image_url
                    ? <img src={n.cover_image_url} alt="" loading="lazy" decoding="async" className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 object-cover" />
                    : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300"><Newspaper className="h-4 w-4" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-sm font-medium text-slate-900">{n.title}</div>
                    <div className="text-xs text-slate-400">{fmtDate(n.published_at ?? n.created_at)}</div>
                  </div>
                  <Pill tone={n.status === "published" ? "green" : "amber"}>{n.status === "published" ? "Terbit" : "Draft"}</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
