import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useWebsiteSettings } from "@/components/website/PublicLayout";
import { ArrowRight, Calendar, Newspaper, GraduationCap, Users, Trophy, BookOpen, Sparkles, Instagram, PlayCircle, MegaphoneIcon } from "lucide-react";

const asAny = (t: string) => supabase.from(t as any) as any;

function StatCard({ icon: Icon, value, label, color }: any) {
  return (
    <div className="group bg-white/95 backdrop-blur rounded-2xl p-6 shadow-lg border border-slate-100 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-3 ${color} group-hover:scale-110 transition`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

export default function Home() {
  const settings = useWebsiteSettings();
  const [slides, setSlides] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [agenda, setAgenda] = useState<any[]>([]);
  const [stats, setStats] = useState({ students: 0, teachers: 0, classes: 0, achievements: 0 });
  const [slideIdx, setSlideIdx] = useState(0);
  const [igPostsAuto, setIgPostsAuto] = useState<any[]>([]);
  const igRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [sl, nw, pr, ag] = await Promise.all([
        asAny("website_hero_slides").select("*").eq("is_active", true).order("sort_order"),
        asAny("website_news").select("*, website_news_categories(name,color)").eq("status", "published").order("published_at", { ascending: false }).limit(6),
        asAny("website_programs").select("*").eq("is_published", true).order("sort_order").limit(6),
        asAny("website_agenda").select("*").eq("is_published", true).gte("start_at", new Date().toISOString()).order("start_at").limit(4),
      ]);
      setSlides(sl.data ?? []);
      setNews(nw.data ?? []);
      setPrograms(pr.data ?? []);
      setAgenda(ag.data ?? []);

      const [st, tc, cl, ach] = await Promise.all([
        asAny("students").select("id", { count: "exact", head: true }),
        asAny("teachers").select("id", { count: "exact", head: true }),
        asAny("classes").select("id", { count: "exact", head: true }),
        asAny("student_achievements").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        students: st.count ?? 0,
        teachers: tc.count ?? 0,
        classes: cl.count ?? 0,
        achievements: ach.count ?? 0,
      });
    })();
  }, []);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);

  const autoFetch = (settings as any)?.instagram_auto_fetch;
  useEffect(() => {
    if (!autoFetch) { setIgPostsAuto([]); return; }
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("fetch-instagram-posts", { body: {} });
        setIgPostsAuto(data?.posts ?? []);
      } catch (e) { console.error(e); }
    })();
  }, [autoFetch]);

  // Manual embed URLs fallback
  const igManualUrls = (((settings as any)?.instagram_post_urls ?? "") as string)
    .split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);

  useEffect(() => {
    if (autoFetch || !igManualUrls.length) return;
    const SRC = "https://www.instagram.com/embed.js";
    const process = () => (window as any).instgrm?.Embeds?.process();
    const existing = document.querySelector(`script[src="${SRC}"]`) as HTMLScriptElement | null;
    if (existing) { process(); return; }
    const s = document.createElement("script");
    s.src = SRC; s.async = true; s.onload = process;
    document.body.appendChild(s);
  }, [igManualUrls.join("|"), autoFetch]);

  const currentSlide = slides[slideIdx];
  const igUsername = (settings as any)?.instagram_username;

  return (
    <div>
      {/* Hero with elegant crossfade background */}
      <section className="relative overflow-hidden text-white min-h-[620px] md:min-h-[760px] flex items-center">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B2A6B] via-[#1E40AF] to-[#3B82F6]" />
        {slides.map((s, i) => (
          s.image_url ? (
            <div
              key={s.id ?? i}
              className="absolute inset-0 transition-opacity duration-[1800ms] ease-in-out will-change-[opacity]"
              style={{ opacity: i === slideIdx ? 1 : 0 }}
              aria-hidden={i !== slideIdx}
            >
              <img
                src={s.image_url} alt="" loading={i === 0 ? "eager" : "lazy"}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: i === slideIdx ? "scale(1.06)" : "scale(1)", transition: "transform 8s ease-out" }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B2A6B]/85 via-[#1E40AF]/70 to-[#1E40AF]/40" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>
          ) : null
        ))}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,white,transparent_60%)] pointer-events-none" />

        <div className="container mx-auto px-4 py-24 md:py-32 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur border border-white/20 text-sm mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <Sparkles className="h-4 w-4" /> Selamat Datang di {settings?.site_name ?? "Sekolah Kami"}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6 drop-shadow-lg animate-in fade-in slide-in-from-bottom-6 duration-700">
              {currentSlide?.title ?? "Membangun Generasi Cerdas, Berkarakter, dan Berprestasi"}
            </h1>
            <p className="text-lg md:text-xl text-blue-50/95 mb-8 max-w-2xl drop-shadow animate-in fade-in slide-in-from-bottom-8 duration-1000">
              {currentSlide?.subtitle ?? settings?.tagline ?? "Pendidikan berkualitas dengan pendekatan modern, teknologi terkini, dan penguatan karakter untuk masa depan yang cemerlang."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-white text-[#1E40AF] hover:bg-blue-50 shadow-xl">
                <Link to={currentSlide?.cta_url ?? "/website/profil"}>
                  {currentSlide?.cta_label ?? "Kenali Sekolah Kami"} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white text-white bg-transparent hover:bg-white hover:text-[#1E40AF]">
                <Link to="/daftar-siswa">Daftar Sekarang</Link>
              </Button>
              {settings?.show_lapor_button !== false && (
                <Button asChild size="lg" className="relative overflow-hidden bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 hover:from-amber-500 hover:via-orange-600 hover:to-red-600 text-white shadow-xl shadow-orange-500/40 border border-white/20">
                  <a href="https://sp4n.lapor.go.id/" target="_blank" rel="noreferrer">
                    <MegaphoneIcon className="mr-2 h-4 w-4" /> Layanan Pengaduan (SP4N-LAPOR!)
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Floating Pengaduan FAB */}
        {settings?.show_lapor_button !== false && (
          <a
            href="https://sp4n.lapor.go.id/"
            target="_blank"
            rel="noreferrer"
            className="fixed z-40 bottom-20 right-5 md:bottom-24 md:right-8 group"
            aria-label="Layanan Pengaduan SP4N-LAPOR"
          >
            <span className="absolute inset-0 rounded-full bg-orange-500/50 animate-ping" />
            <span className="relative flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 text-white pl-4 pr-5 py-3 shadow-2xl shadow-orange-500/50 border border-white/30 backdrop-blur hover:scale-105 transition">
              <MegaphoneIcon className="h-5 w-5" />
              <span className="hidden sm:inline font-semibold text-sm whitespace-nowrap">Lapor Pengaduan</span>
            </span>
          </a>
        )}


        {slides.length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {slides.map((_, i) => (
              <button
                key={i} onClick={() => setSlideIdx(i)}
                className={`h-2 rounded-full transition-all ${i === slideIdx ? "w-8 bg-white" : "w-2 bg-white/50 hover:bg-white/80"}`}
                aria-label={`slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </section>

      {/* Stats */}
      <section className="container mx-auto px-4 -mt-16 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Users} value={stats.students} label="Peserta Didik" color="bg-gradient-to-br from-blue-500 to-blue-700" />
          <StatCard icon={GraduationCap} value={stats.teachers} label="Guru & Staff" color="bg-gradient-to-br from-emerald-500 to-emerald-700" />
          <StatCard icon={BookOpen} value={stats.classes} label="Rombel" color="bg-gradient-to-br from-amber-500 to-amber-700" />
          <StatCard icon={Trophy} value={stats.achievements} label="Prestasi" color="bg-gradient-to-br from-purple-500 to-purple-700" />
        </div>
      </section>

      {/* Programs */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-sm font-semibold text-[#1E40AF] mb-2">PROGRAM UNGGULAN</div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">Kurikulum Modern & Terpadu</h2>
          <p className="text-slate-600">Program pembelajaran yang dirancang untuk mengembangkan potensi akademik, spiritual, dan keterampilan hidup.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.map((p) => (
            <div key={p.id} className="group relative overflow-hidden bg-white rounded-2xl p-8 border border-slate-100 hover:border-[#1E40AF] hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-blue-50/0 group-hover:from-blue-50/50 group-hover:to-transparent transition-all duration-500 pointer-events-none" />
              <div className="h-12 w-12 rounded-xl bg-blue-50 text-[#1E40AF] flex items-center justify-center mb-4 group-hover:bg-[#1E40AF] group-hover:text-white group-hover:scale-110 transition">
                <BookOpen className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2 relative">{p.name}</h3>
              <p className="text-slate-600 text-sm relative">{p.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* News */}
      <section className="bg-gradient-to-b from-slate-50 to-white py-20">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="text-sm font-semibold text-[#1E40AF] mb-2">BERITA & INFORMASI</div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900">Kabar Terkini</h2>
            </div>
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link to="/website/berita">Semua Berita <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
          {news.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Newspaper className="h-12 w-12 mx-auto mb-3 opacity-40" />
              Belum ada berita dipublikasikan.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {news.map((n) => (
                <Link key={n.id} to={`/website/berita/${n.slug}`} className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-slate-100">
                  <div className="aspect-video bg-slate-100 overflow-hidden">
                    {n.cover_image_url ? (
                      <img src={n.cover_image_url} alt={n.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition duration-700" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center text-blue-300">
                        <Newspaper className="h-12 w-12" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    {n.website_news_categories && (
                      <span className="inline-block text-xs font-semibold px-2 py-1 rounded" style={{ background: `${n.website_news_categories.color}20`, color: n.website_news_categories.color }}>
                        {n.website_news_categories.name}
                      </span>
                    )}
                    <h3 className="mt-3 font-bold text-slate-900 line-clamp-2 group-hover:text-[#1E40AF] transition">{n.title}</h3>
                    <p className="mt-2 text-sm text-slate-600 line-clamp-2">{n.excerpt}</p>
                    <div className="mt-3 text-xs text-slate-400">{n.published_at ? new Date(n.published_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : ""}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Agenda */}
      {agenda.length > 0 && (
        <section className="container mx-auto px-4 py-20">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="text-sm font-semibold text-[#1E40AF] mb-2">AGENDA</div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">Kegiatan Mendatang</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {agenda.map((a) => {
              const d = new Date(a.start_at);
              return (
                <div key={a.id} className="flex gap-4 bg-white border border-slate-100 rounded-xl p-4 hover:shadow-lg hover:border-[#1E40AF] transition">
                  <div className="shrink-0 w-16 h-16 rounded-lg bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] text-white flex flex-col items-center justify-center shadow-md">
                    <div className="text-2xl font-bold leading-none">{d.getDate()}</div>
                    <div className="text-xs uppercase">{d.toLocaleDateString("id-ID", { month: "short" })}</div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">{a.title}</h4>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><Calendar className="h-3 w-3" />{d.toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit" })}{a.location ? ` · ${a.location}` : ""}</p>
                    {a.description && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{a.description}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Instagram Feed */}
      {((settings as any)?.instagram_section_enabled ?? true) && (igPostsAuto.length > 0 || igManualUrls.length > 0 || igUsername) && (
        <section className="bg-gradient-to-b from-white via-slate-50 to-white py-20 border-t border-slate-100">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#1E40AF] mb-2">
                <Instagram className="h-4 w-4" /> INSTAGRAM
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
                {(settings as any)?.instagram_section_title ?? "Ikuti Instagram Kami"}
              </h2>
              {igUsername && (
                <a href={`https://www.instagram.com/${igUsername}`} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 text-[#1E40AF] hover:underline font-medium">
                  @{igUsername}
                </a>
              )}
            </div>

            {igPostsAuto.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5 max-w-6xl mx-auto">
                {igPostsAuto.slice(0, 5).map((p: any) => {
                  const src = p.media_type === "VIDEO" ? (p.thumbnail_url || p.media_url) : p.media_url;
                  return (
                    <a key={p.id} href={p.permalink} target="_blank" rel="noreferrer"
                       className="group relative aspect-square block rounded-xl overflow-hidden bg-slate-100 shadow-sm hover:shadow-2xl transition">
                      {src && <img src={src} alt={p.caption?.slice(0,60) ?? ""} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition duration-500" />}
                      {p.media_type === "VIDEO" && (
                        <PlayCircle className="absolute top-3 right-3 h-6 w-6 text-white drop-shadow" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-3">
                        <p className="text-white text-xs line-clamp-3">{p.caption}</p>
                      </div>
                      <div className="absolute top-3 left-3 h-8 w-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <Instagram className="h-4 w-4 text-pink-600" />
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : igManualUrls.length > 0 ? (
              <div ref={igRef} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                {igManualUrls.map((url, i) => (
                  <blockquote key={i} className="instagram-media" data-instgrm-permalink={url} data-instgrm-version="14"
                    style={{ background: "#FFF", border: 0, borderRadius: 12, boxShadow: "0 4px 20px rgba(15,23,42,.08)", margin: 0, minWidth: 260, padding: 0, width: "100%" }} />
                ))}
              </div>
            ) : (
              <div className="text-center">
                <Button asChild className="bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 hover:opacity-90 text-white">
                  <a href={`https://www.instagram.com/${igUsername}`} target="_blank" rel="noreferrer">
                    <Instagram className="h-4 w-4 mr-2" /> Kunjungi Instagram
                  </a>
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#0B2A6B] via-[#1E40AF] to-[#3B82F6] text-white">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_bottom_left,white,transparent_60%)]" />
        <div className="container mx-auto px-4 py-16 text-center relative">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Bergabunglah Bersama Kami</h2>
          <p className="text-blue-100 mb-6 max-w-2xl mx-auto">Wujudkan cita-cita ananda bersama kami. Pendaftaran peserta didik baru telah dibuka.</p>
          <Button asChild size="lg" className="bg-white text-[#1E40AF] hover:bg-blue-50 shadow-xl">
            <Link to="/daftar-siswa">Daftar Sekarang <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
