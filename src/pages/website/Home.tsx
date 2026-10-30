import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useWebsiteSettings } from "@/components/website/PublicLayout";
import AgendaCard from "@/components/website/AgendaCard";
import { agendaDateParts, agendaState, agendaTimeText, isUpcomingOrOngoing, type AgendaItem } from "@/lib/agenda";
import { fetchRecentPhotos } from "@/lib/websiteGallery";
import {
  ArrowRight, Calendar, CalendarDays, Newspaper, GraduationCap, Users, Trophy, BookOpen, Sparkles, Instagram, PlayCircle,
  MegaphoneIcon, Building2, Images, UserPlus, Clock, MapPin,
} from "lucide-react";

const asAny = (t: string) => supabase.from(t as any) as any;
const fmtLong = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

/** Angka naik perlahan saat strip statistik terlihat (sekali saja). */
function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") { setN(to); return; }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started.current) return;
      started.current = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 1200);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return <span ref={ref} className="tabular-nums">{n.toLocaleString("id-ID")}</span>;
}

function SectionHead({ eyebrow, title, desc, to, link, center = false }: { eyebrow: string; title: string; desc?: string; to?: string; link?: string; center?: boolean }) {
  return (
    <div className={`mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${center ? "items-center text-center sm:flex-col sm:items-center" : ""}`}>
      <div className={center ? "mx-auto max-w-2xl" : ""}>
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#1E40AF]">{eyebrow}</div>
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{title}</h2>
        {desc && <p className="mt-3 text-slate-600">{desc}</p>}
      </div>
      {to && link && (
        <Button asChild variant="outline" className="shrink-0 rounded-full">
          <Link to={to}>{link} <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      )}
    </div>
  );
}

function NewsCard({ n, big = false }: { n: any; big?: boolean }) {
  const cat = n.website_news_categories;
  return (
    <Link
      to={`/website/berita/${n.slug}`}
      className={`group relative flex overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-slate-200/60 transition hover:shadow-2xl ${big ? "min-h-[360px] w-full lg:min-h-[480px]" : "min-h-[230px]"}`}
    >
      {n.cover_image_url ? (
        <img src={n.cover_image_url} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1E40AF] to-[#3B82F6]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
      <div className="relative mt-auto w-full p-5 text-white sm:p-6">
        {cat && <span className="mb-3 inline-block rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">{cat.name}</span>}
        <h3 className={`font-bold leading-snug [overflow-wrap:anywhere] ${big ? "line-clamp-3 text-2xl md:text-3xl" : "line-clamp-2 text-lg"}`}>{n.title}</h3>
        {big && n.excerpt && <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-white/80">{n.excerpt}</p>}
        <div className="mt-3 text-xs text-white/70">{n.published_at ? fmtLong(n.published_at) : ""}</div>
      </div>
    </Link>
  );
}

export default function Home() {
  const settings = useWebsiteSettings();
  const [slides, setSlides] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [photos, setPhotos] = useState<{ url: string; title: string; href: string }[]>([]);
  const [stats, setStats] = useState({ students: 0, teachers: 0, classes: 0, achievements: 0 });
  const [slideIdx, setSlideIdx] = useState(0);
  const [igPostsAuto, setIgPostsAuto] = useState<any[]>([]);
  const igRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [sl, nw, pr, ag] = await Promise.all([
        asAny("website_hero_slides").select("id,title,subtitle,image_url,cta_label,cta_url").eq("is_active", true).order("sort_order"),
        // tanpa kolom isi berita (besar); beranda hanya butuh ringkasan
        asAny("website_news").select("id,title,slug,excerpt,cover_image_url,published_at,website_news_categories(name,color)").eq("status", "published").order("published_at", { ascending: false }).limit(6),
        asAny("website_programs").select("id,name,description").eq("is_published", true).order("sort_order").limit(6),
        // termasuk kegiatan yang sedang berlangsung (mulai kemarin atau lebih baru), disaring lagi di bawah
        asAny("website_agenda").select("id,title,description,start_at,end_at,location").eq("is_published", true).gte("start_at", dayAgo).order("start_at").limit(12),
      ]);
      setSlides(sl.data ?? []);
      setNews(nw.data ?? []);
      setPrograms(pr.data ?? []);
      setAgenda(((ag.data ?? []) as AgendaItem[]).filter((a) => isUpcomingOrOngoing(a)).slice(0, 4));

      const [st, tc, cl, ach] = await Promise.all([
        asAny("students").select("id", { count: "exact", head: true }),
        asAny("teachers").select("id", { count: "exact", head: true }),
        asAny("classes").select("id", { count: "exact", head: true }),
        asAny("student_achievements").select("id", { count: "exact", head: true }),
      ]);
      setStats({ students: st.count ?? 0, teachers: tc.count ?? 0, classes: cl.count ?? 0, achievements: ach.count ?? 0 });
    })();
    fetchRecentPhotos(8).then(setPhotos).catch(() => {});
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

  const quick = [
    { to: "/website/profil", label: "Profil", icon: Building2, tone: "bg-blue-50 text-blue-600" },
    { to: "/website/akademik", label: "Akademik", icon: BookOpen, tone: "bg-emerald-50 text-emerald-600" },
    { to: "/website/agenda", label: "Agenda", icon: CalendarDays, tone: "bg-amber-50 text-amber-600" },
    { to: "/website/galeri", label: "Galeri", icon: Images, tone: "bg-violet-50 text-violet-600" },
    { to: "/daftar-siswa", label: "Pendaftaran", icon: UserPlus, tone: "bg-rose-50 text-rose-600" },
  ];
  const statItems = [
    { icon: Users, value: stats.students, label: "Peserta Didik" },
    { icon: GraduationCap, value: stats.teachers, label: "Guru & Staff" },
    { icon: BookOpen, value: stats.classes, label: "Rombel" },
    { icon: Trophy, value: stats.achievements, label: "Prestasi" },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative flex min-h-[600px] items-center overflow-hidden pb-20 text-white md:min-h-[700px] md:pb-28">
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
                src={s.image_url} alt="" loading={i === 0 ? "eager" : "lazy"} decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: i === slideIdx ? "scale(1.06)" : "scale(1)", transition: "transform 8s ease-out" }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B2A6B]/90 via-[#1E40AF]/70 to-[#1E40AF]/30" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>
          ) : null
        ))}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,.18),transparent_55%)]" />

        <div className="container relative mx-auto grid items-center gap-10 px-4 py-20 md:py-28 lg:grid-cols-[1fr_380px]">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm backdrop-blur animate-in fade-in slide-in-from-bottom-4 duration-700">
              <Sparkles className="h-4 w-4" /> Selamat Datang di {settings?.site_name ?? "Sekolah Kami"}
            </div>
            <h1 className="mb-6 text-4xl font-extrabold leading-[1.1] tracking-tight drop-shadow-lg animate-in fade-in slide-in-from-bottom-6 duration-700 md:text-6xl">
              {currentSlide?.title ?? "Membangun Generasi Cerdas, Berkarakter, dan Berprestasi"}
            </h1>
            <p className="mb-8 max-w-2xl text-lg text-blue-50/95 drop-shadow animate-in fade-in slide-in-from-bottom-8 duration-1000 md:text-xl">
              {currentSlide?.subtitle ?? settings?.tagline ?? "Pendidikan berkualitas dengan pendekatan modern, teknologi terkini, dan penguatan karakter untuk masa depan yang cemerlang."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full bg-white text-[#1E40AF] shadow-xl hover:bg-blue-50">
                <Link to={currentSlide?.cta_url ?? "/website/profil"}>
                  {currentSlide?.cta_label ?? "Kenali Sekolah Kami"} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-white/70 bg-transparent text-white hover:bg-white hover:text-[#1E40AF]">
                <Link to="/daftar-siswa">Daftar Sekarang</Link>
              </Button>
              {settings?.show_lapor_button !== false && (
                <Button asChild size="lg" className="relative overflow-hidden rounded-full border border-white/20 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 text-white shadow-xl shadow-orange-500/40 hover:from-amber-500 hover:via-orange-600 hover:to-red-600">
                  <a href="https://sp4n.lapor.go.id/" target="_blank" rel="noreferrer">
                    <MegaphoneIcon className="mr-2 h-4 w-4" /> Layanan Pengaduan (SP4N-LAPOR!)
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Agenda terdekat (desktop) */}
          <aside className="hidden rounded-3xl border border-white/20 bg-white/10 p-5 shadow-2xl backdrop-blur-md lg:block">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4" /> Agenda Terdekat</div>
              <Link to="/website/agenda" className="text-xs font-semibold text-blue-100 hover:text-white">Semua</Link>
            </div>
            {agenda.length === 0 ? (
              <p className="py-6 text-center text-sm text-blue-100/80">Belum ada agenda mendatang.</p>
            ) : (
              <ul className="space-y-3">
                {agenda.slice(0, 3).map((a) => {
                  const d = agendaDateParts(a.start_at);
                  const st = agendaState(a);
                  return (
                    <li key={a.id}>
                      <Link to="/website/agenda" className="flex gap-3 rounded-2xl bg-white/10 p-3 transition hover:bg-white/20">
                        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-white text-[#1E40AF]">
                          <span className="text-[10px] font-bold uppercase">{d.month}</span>
                          <span className="text-xl font-extrabold leading-none">{d.day}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm font-semibold leading-snug">{a.title}</div>
                          <div className="mt-1 flex items-center gap-1 text-xs text-blue-100"><Clock className="h-3 w-3" />{agendaTimeText(a)} · {st.label}</div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>

        {slides.length > 1 && (
          <div className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 gap-2 md:bottom-32">
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

      {/* Floating Pengaduan FAB */}
      {settings?.show_lapor_button !== false && (
        <a
          href="https://sp4n.lapor.go.id/"
          target="_blank"
          rel="noreferrer"
          className="group fixed bottom-20 right-5 z-40 md:bottom-24 md:right-8"
          aria-label="Layanan Pengaduan SP4N-LAPOR"
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-orange-500/50" />
          <span className="relative flex items-center gap-2 rounded-full border border-white/30 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 py-3 pl-4 pr-5 text-white shadow-2xl shadow-orange-500/50 backdrop-blur transition hover:scale-105">
            <MegaphoneIcon className="h-5 w-5" />
            <span className="hidden whitespace-nowrap text-sm font-semibold sm:inline">Lapor Pengaduan</span>
          </span>
        </a>
      )}

      {/* Akses cepat + statistik, menumpuk di atas hero */}
      <section className="container relative z-10 mx-auto -mt-16 px-4 md:-mt-20">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-4">
          {quick.map((q, qi) => (
            <Link key={q.to} to={q.to} className={`${qi === quick.length - 1 ? "col-span-2 sm:col-span-1" : ""} group flex flex-col items-center gap-2 rounded-2xl border border-slate-200/70 bg-white p-4 text-center shadow-lg shadow-slate-900/5 transition hover:-translate-y-1 hover:shadow-xl`}>
              <span className={`flex h-12 w-12 items-center justify-center rounded-xl transition group-hover:scale-110 ${q.tone}`}><q.icon className="h-6 w-6" /></span>
              <span className="text-sm font-semibold text-slate-800">{q.label}</span>
            </Link>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-lg shadow-slate-900/5 md:mt-6 md:grid-cols-4">
          {statItems.map((s, i) => (
            <div key={s.label} className={`flex items-center gap-4 p-5 md:p-6 ${i % 2 === 1 ? "border-l border-slate-100" : ""} ${i > 1 ? "border-t border-slate-100 md:border-t-0" : ""} ${i > 0 ? "md:border-l md:border-slate-100" : ""}`}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] text-white"><s.icon className="h-6 w-6" /></span>
              <div>
                <div className="text-2xl font-extrabold text-slate-900 md:text-3xl"><CountUp to={s.value} /></div>
                <div className="text-xs text-slate-500 md:text-sm">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Programs */}
      <section className="container mx-auto px-4 py-20">
        <SectionHead eyebrow="Program Unggulan" title="Kurikulum Modern & Terpadu" desc="Program pembelajaran yang dirancang untuk mengembangkan potensi akademik, spiritual, dan keterampilan hidup." center />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {programs.map((p, i) => (
            <div key={p.id} className="group relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-7 transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-2xl">
              <span className="absolute right-5 top-3 text-6xl font-black text-slate-100 transition group-hover:text-blue-100">{String(i + 1).padStart(2, "0")}</span>
              <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#1E40AF] transition group-hover:bg-[#1E40AF] group-hover:text-white">
                <BookOpen className="h-6 w-6" />
              </div>
              <h3 className="relative mb-2 text-xl font-bold text-slate-900">{p.name}</h3>
              <p className="relative text-sm leading-relaxed text-slate-600">{p.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* News: satu berita utama besar + sisanya */}
      <section className="bg-slate-50 py-20">
        <div className="container mx-auto px-4">
          <SectionHead eyebrow="Berita & Informasi" title="Kabar Terkini" to="/website/berita" link="Semua Berita" />
          {news.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Newspaper className="mx-auto mb-3 h-12 w-12 opacity-40" />
              Belum ada berita dipublikasikan.
            </div>
          ) : (
            <>
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="flex lg:col-span-2"><NewsCard n={news[0]} big /></div>
                <div className="grid gap-5">{news.slice(1, 3).map((n) => <NewsCard key={n.id} n={n} />)}</div>
              </div>
              {news.length > 3 && (
                <div className="mt-5 grid gap-5 md:grid-cols-3">{news.slice(3, 6).map((n) => <NewsCard key={n.id} n={n} />)}</div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Agenda */}
      <section className="container mx-auto px-4 py-20">
        <SectionHead eyebrow="Agenda" title="Kegiatan Mendatang" desc="Jadwal kegiatan dan acara terdekat di sekolah." to="/website/agenda" link="Semua Agenda" />
        {agenda.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-slate-200 py-14 text-center text-slate-500">
            <Calendar className="mb-3 h-10 w-10 text-slate-300" />
            Belum ada agenda mendatang.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">{agenda.map((a) => <AgendaCard key={a.id} a={a} compact />)}</div>
        )}
      </section>

      {/* Galeri: foto terbaru (album galeri + gambar berita) */}
      {photos.length >= 3 && (
        <section className="bg-slate-50 py-20">
          <div className="container mx-auto px-4">
            <SectionHead eyebrow="Galeri" title="Momen Terbaru" desc="Dokumentasi kegiatan dan prestasi sekolah." to="/website/galeri" link="Lihat Galeri" />
            <div className="grid auto-rows-[140px] grid-cols-2 gap-3 md:auto-rows-[180px] md:grid-cols-4">
              {photos.map((p, i) => (
                <Link
                  key={p.url}
                  to={p.href}
                  title={p.title}
                  className={`group relative overflow-hidden rounded-2xl bg-slate-200 ${i === 0 ? "col-span-2 row-span-2" : ""} ${i === 3 ? "md:col-span-2" : ""}`}
                >
                  <img src={p.url} alt={p.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                  <div className="absolute inset-x-0 bottom-0 line-clamp-2 p-3 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">{p.title}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Instagram Feed */}
      {((settings as any)?.instagram_section_enabled ?? true) && (igPostsAuto.length > 0 || igManualUrls.length > 0 || igUsername) && (
        <section className="border-t border-slate-100 bg-white py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <div className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#1E40AF]">
                <Instagram className="h-4 w-4" /> Instagram
              </div>
              <h2 className="mb-3 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
                {(settings as any)?.instagram_section_title ?? "Ikuti Instagram Kami"}
              </h2>
              {igUsername && (
                <a href={`https://www.instagram.com/${igUsername}`} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 font-medium text-[#1E40AF] hover:underline">
                  @{igUsername}
                </a>
              )}
            </div>

            {igPostsAuto.length > 0 ? (
              <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-5">
                {igPostsAuto.slice(0, 5).map((p: any) => {
                  const src = p.media_type === "VIDEO" ? (p.thumbnail_url || p.media_url) : p.media_url;
                  return (
                    <a key={p.id} href={p.permalink} target="_blank" rel="noreferrer"
                       className="group relative block aspect-square overflow-hidden rounded-2xl bg-slate-100 shadow-sm transition hover:shadow-2xl">
                      {src && <img src={src} alt={p.caption?.slice(0, 60) ?? ""} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />}
                      {p.media_type === "VIDEO" && (
                        <PlayCircle className="absolute right-3 top-3 h-6 w-6 text-white drop-shadow" />
                      )}
                      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                        <p className="line-clamp-3 text-xs text-white">{p.caption}</p>
                      </div>
                      <div className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 opacity-0 backdrop-blur transition group-hover:opacity-100">
                        <Instagram className="h-4 w-4 text-pink-600" />
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : igManualUrls.length > 0 ? (
              <div ref={igRef} className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {igManualUrls.map((url, i) => (
                  <blockquote key={i} className="instagram-media" data-instgrm-permalink={url} data-instgrm-version="14"
                    style={{ background: "#FFF", border: 0, borderRadius: 12, boxShadow: "0 4px 20px rgba(15,23,42,.08)", margin: 0, minWidth: 260, padding: 0, width: "100%" }} />
                ))}
              </div>
            ) : (
              <div className="text-center">
                <Button asChild className="rounded-full bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white hover:opacity-90">
                  <a href={`https://www.instagram.com/${igUsername}`} target="_blank" rel="noreferrer">
                    <Instagram className="mr-2 h-4 w-4" /> Kunjungi Instagram
                  </a>
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="container mx-auto px-4 pb-4 pt-4">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0B2A6B] via-[#1E40AF] to-[#3B82F6] text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(255,255,255,.2),transparent_60%)]" />
          <div className="relative px-6 py-14 text-center md:py-16">
            <h2 className="mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">Bergabunglah Bersama Kami</h2>
            <p className="mx-auto mb-6 max-w-2xl text-blue-100">Wujudkan cita-cita ananda bersama kami. Pendaftaran peserta didik baru telah dibuka.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="rounded-full bg-white text-[#1E40AF] shadow-xl hover:bg-blue-50">
                <Link to="/daftar-siswa">Daftar Sekarang <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-white/70 bg-transparent text-white hover:bg-white hover:text-[#1E40AF]">
                <Link to="/website/kontak"><MapPin className="mr-2 h-4 w-4" /> Hubungi Kami</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
