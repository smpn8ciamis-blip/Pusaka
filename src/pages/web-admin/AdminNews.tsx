import AdminCrudPage from "./AdminCrudPage";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eye, Share2, TrendingUp, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill, fmtDate, cardCls } from "@/components/web-admin/ui";

const nf = (n: unknown) => Number(n ?? 0).toLocaleString("id-ID");
const views = (r: any) => Number(r.view_count ?? 0);
const shares = (r: any) => Number(r.share_count ?? 0);

/**
 * Total statistik semua berita. Hanya mengambil kolom angka + judul (ringan), terpisah dari daftar
 * sehingga totalnya tetap benar walau daftar dibatasi. Bila kolom share_count belum ada, dicoba tanpa kolom itu.
 */
function useNewsStats() {
  return useQuery({
    queryKey: ["web-admin", "news-stats"],
    queryFn: async () => {
      const run = (cols: string) =>
        (supabase.from("website_news" as any) as any).select(cols).eq("status", "published").limit(5000);
      let { data, error } = await run("id,title,slug,view_count,share_count");
      if (error) ({ data, error } = await run("id,title,slug,view_count"));
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function StatCard({ icon: Icon, tone, label, value, sub }: { icon: any; tone: string; label: string; value: string; sub?: string }) {
  return (
    <div className={`${cardCls} p-4`}>
      <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-[18px] w-[18px]" /></div>
      <div className="text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {sub && <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function NewsStatsPanel() {
  const { data, isLoading } = useNewsStats();
  if (isLoading) {
    return <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>;
  }
  const rows = data ?? [];
  if (rows.length === 0) return null;

  const totalViews = rows.reduce((a, r) => a + views(r), 0);
  const totalShares = rows.reduce((a, r) => a + shares(r), 0);
  const top = rows.slice().sort((a, b) => views(b) - views(a)).slice(0, 5);
  const max = Math.max(1, ...top.map(views));

  return (
    <div className="mb-5 space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Eye} tone="bg-blue-50 text-blue-600" label="Total dibaca" value={nf(totalViews)} sub={`dari ${nf(rows.length)} berita terbit`} />
        <StatCard icon={Share2} tone="bg-emerald-50 text-emerald-600" label="Total dibagikan" value={nf(totalShares)} />
        <StatCard icon={TrendingUp} tone="bg-violet-50 text-violet-600" label="Rata-rata dibaca / berita" value={nf(Math.round(totalViews / rows.length))} />
        <StatCard icon={Trophy} tone="bg-amber-50 text-amber-600" label="Terpopuler" value={nf(views(top[0]))} sub={top[0]?.title} />
      </div>

      <section className={`${cardCls} p-4 sm:p-5`}>
        <h2 className="mb-3 font-semibold text-slate-900">5 Berita Terpopuler</h2>
        <ol className="space-y-3">
          {top.map((n, i) => (
            <li key={n.id} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-sm font-medium text-slate-900">{n.title}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#1E40AF]" style={{ width: `${Math.max(3, (views(n) / max) * 100)}%` }} />
                </div>
              </div>
              <div className="shrink-0 text-right text-xs tabular-nums text-slate-500">
                <div className="font-semibold text-slate-800">{nf(views(n))}x</div>
                <div>{nf(shares(n))} bagikan</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function AdminNews() {
  const { data: cats = [] } = useQuery({
    queryKey: ["web-admin", "news-categories-options"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from("website_news_categories" as any) as any).select("id,name").order("name");
      return (data ?? []) as any[];
    },
  });
  return (
    <AdminCrudPage
      title="Berita"
      description="Kelola artikel dan berita yang tampil di website."
      table="website_news"
      orderBy={{ column: "created_at", ascending: false }}
      // Daftar tidak memuat isi berita (kolom besar); isi lengkap diambil saat Edit.
      listSelect="id,title,slug,status,published_at,created_at,cover_image_url,category_id,view_count,share_count,website_news_categories(name,color)"
      listSelectFallback="id,title,slug,status,published_at,created_at,cover_image_url,category_id,view_count,website_news_categories(name,color)"
      thumbKey="cover_image_url"
      defaults={{ status: "draft", is_featured: false }}
      sortOptions={[
        { value: "terbaru", label: "Urutan: Terbaru" },
        { value: "dibaca", label: "Urutan: Paling banyak dibaca", compare: (a, b) => views(b) - views(a) },
        { value: "dibagikan", label: "Urutan: Paling banyak dibagikan", compare: (a, b) => shares(b) - shares(a) },
      ]}
      renderExtra={() => <NewsStatsPanel />}
      columns={[
        { key: "title", label: "Judul" },
        { key: "status", label: "Status", render: (r) => <Pill tone={r.status === "published" ? "green" : "amber"}>{r.status === "published" ? "Terbit" : "Draft"}</Pill> },
        { key: "category", label: "Kategori", render: (r) => r.website_news_categories?.name ?? "—" },
        { key: "published_at", label: "Publikasi", render: (r) => <span className="whitespace-nowrap">{fmtDate(r.published_at)}</span> },
        { key: "view_count", label: "Dibaca", render: (r) => <span className="inline-flex items-center gap-1 tabular-nums"><Eye className="h-3.5 w-3.5 text-slate-400" />{nf(r.view_count)}</span> },
        { key: "share_count", label: "Dibagikan", render: (r) => <span className="inline-flex items-center gap-1 tabular-nums"><Share2 className="h-3.5 w-3.5 text-slate-400" />{nf(r.share_count)}</span> },
      ]}
      fields={[
        { key: "title", label: "Judul", required: true, colSpan: 2 },
        { key: "slug", label: "Slug URL", required: true, placeholder: "contoh-berita" },
        { key: "category_id", label: "Kategori", type: "select", options: cats.map((c) => ({ value: c.id, label: c.name })) },
        { key: "cover_image_url", label: "Gambar Cover", type: "image", colSpan: 2 },
        { key: "excerpt", label: "Ringkasan", type: "textarea", colSpan: 2 },
        { key: "content", label: "Isi Berita", type: "richtext", colSpan: 2 },
        { key: "author_name", label: "Penulis" },
        { key: "status", label: "Status", type: "select", options: [{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }] },
        { key: "published_at", label: "Tanggal Publikasi", type: "datetime", colSpan: 2 },
        { key: "is_featured", label: "Berita Utama", type: "boolean" },
      ]}
    />
  );
}
