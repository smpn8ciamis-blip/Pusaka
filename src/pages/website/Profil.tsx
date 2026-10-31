import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const asAny = (t: string) => supabase.from(t as any) as any;

function PageHero({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-[#0B1F4D] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.45),transparent_60%)]" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="container relative mx-auto px-4 py-14 md:py-20">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs text-blue-200/80">
          <Link to="/" className="hover:text-white">Beranda</Link>
          <span aria-hidden>/</span>
          <span className="text-white/90">{title}</span>
        </nav>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-4 max-w-2xl text-base leading-relaxed text-blue-100/90 md:text-lg">{subtitle}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}

export default function Profil() {
  const [pages, setPages] = useState<any[]>([]);

  useEffect(() => {
    asAny("website_pages").select("*").eq("is_published", true).order("sort_order").then(({ data }: any) => setPages(data ?? []));
  }, []);

  return (
    <div>
      <PageHero title="Profil Sekolah" subtitle="Mengenal lebih dekat visi, misi, sejarah, dan struktur sekolah kami." />
      <div className="container mx-auto px-4 py-16 max-w-4xl space-y-12">
        {pages.map((p) => (
          <article key={p.id} id={p.slug} className="scroll-mt-20">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-1 w-12 bg-[#1E40AF] rounded" />
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900">{p.title}</h2>
            </div>
            {p.cover_image_url && <img src={p.cover_image_url} alt={p.title} className="rounded-xl mb-6 w-full object-cover max-h-80" />}
            {/^\s*</.test(p.content ?? "") ? (
              <div className="prose prose-slate max-w-none leading-relaxed text-slate-700 prose-headings:text-slate-900 prose-a:text-[#1E40AF] prose-img:rounded-xl" dangerouslySetInnerHTML={{ __html: p.content ?? "" }} />
            ) : (
              <div className="prose prose-slate max-w-none whitespace-pre-line text-slate-700 leading-relaxed">{p.content}</div>
            )}
          </article>
        ))}
        {pages.length === 0 && <div className="text-center py-16 text-slate-500">Konten profil belum tersedia.</div>}
      </div>
    </div>
  );
}

export { PageHero };
