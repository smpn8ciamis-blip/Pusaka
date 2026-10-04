import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";

const SITE_URL = "https://pusaka.lovable.app";

const asAny = (t: string) => supabase.from(t as any) as any;

function PageHero({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <section className="bg-gradient-to-r from-[#1E40AF] to-[#3B82F6] text-white py-16">
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-3">{title}</h1>
        {subtitle && <p className="text-blue-100 max-w-2xl mx-auto">{subtitle}</p>}
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
      <Helmet>
        <title>Profil Sekolah — SMPN 83</title>
        <meta name="description" content="Mengenal lebih dekat visi, misi, sejarah, dan struktur SMPN 83 Jakarta." />
        <link rel="canonical" href={`${SITE_URL}/website/profil`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Profil Sekolah — SMPN 83" />
        <meta property="og:description" content="Mengenal lebih dekat visi, misi, sejarah, dan struktur SMPN 83 Jakarta." />
        <meta property="og:url" content={`${SITE_URL}/website/profil`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Profil Sekolah — SMPN 83" />
        <meta name="twitter:description" content="Mengenal lebih dekat visi, misi, sejarah, dan struktur SMPN 83 Jakarta." />
      </Helmet>
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
