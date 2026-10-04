import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Newspaper, Mail, Images, Calendar, ArrowRight } from "lucide-react";

const stat = (t: string, filter?: any) => {
  let q: any = (supabase.from(t as any) as any).select("id", { count: "exact", head: true });
  if (filter) for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  return q;
};

export default function AdminDashboard() {
  const [c, setC] = useState({ news: 0, unread: 0, albums: 0, agenda: 0 });
  const [recentMsg, setRecentMsg] = useState<any[]>([]);
  const [recentNews, setRecentNews] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [n, u, al, ag, msg, nws] = await Promise.all([
        stat("website_news"),
        stat("website_contact_messages", { is_read: false }),
        stat("website_gallery_albums"),
        stat("website_agenda"),
        (supabase.from("website_contact_messages" as any) as any).select("*").order("created_at", { ascending: false }).limit(5),
        (supabase.from("website_news" as any) as any).select("*").order("created_at", { ascending: false }).limit(5),
      ]);
      setC({ news: n.count ?? 0, unread: u.count ?? 0, albums: al.count ?? 0, agenda: ag.count ?? 0 });
      setRecentMsg(msg.data ?? []);
      setRecentNews(nws.data ?? []);
    })();
  }, []);

  const cards = [
    { label: "Total Berita", value: c.news, icon: Newspaper, color: "bg-blue-500", to: "/web-admin/berita" },
    { label: "Pesan Belum Dibaca", value: c.unread, icon: Mail, color: "bg-red-500", to: "/web-admin/pesan" },
    { label: "Album Galeri", value: c.albums, icon: Images, color: "bg-emerald-500", to: "/web-admin/galeri" },
    { label: "Agenda Terjadwal", value: c.agenda, icon: Calendar, color: "bg-purple-500", to: "/web-admin/agenda" },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Website</h1>
        <p className="text-slate-500 text-sm">Ringkasan pengelolaan konten website sekolah.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="bg-white rounded-2xl p-5 border border-slate-100 hover:shadow-md transition">
            <div className={`h-10 w-10 rounded-lg ${c.color} text-white flex items-center justify-center mb-3`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{c.value}</div>
            <div className="text-xs text-slate-500">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl p-6 border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Pesan Terbaru</h3>
            <Link to="/web-admin/pesan" className="text-sm text-[#1E40AF] flex items-center gap-1">Lihat semua <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="space-y-3">
            {recentMsg.length === 0 && <div className="text-sm text-slate-500">Belum ada pesan.</div>}
            {recentMsg.map((m) => (
              <div key={m.id} className="border-l-2 border-[#1E40AF] pl-3 py-1">
                <div className="text-sm font-medium">{m.name} <span className="text-xs text-slate-400">· {m.subject ?? "—"}</span></div>
                <div className="text-xs text-slate-500 line-clamp-1">{m.message}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="bg-white rounded-2xl p-6 border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Berita Terbaru</h3>
            <Link to="/web-admin/berita" className="text-sm text-[#1E40AF] flex items-center gap-1">Kelola <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="space-y-3">
            {recentNews.length === 0 && <div className="text-sm text-slate-500">Belum ada berita.</div>}
            {recentNews.map((n) => (
              <div key={n.id} className="flex items-center gap-3 text-sm">
                <span className={`px-2 py-0.5 rounded text-[10px] ${n.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{n.status}</span>
                <span className="line-clamp-1">{n.title}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
