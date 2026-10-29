import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useWebsiteSettings } from "@/components/website/PublicLayout";
import { ArrowRight, CalendarDays, Clock, MapPin, Newspaper, GraduationCap, Users, Trophy, BookOpen, Instagram, PlayCircle, MegaphoneIcon } from "lucide-react";
import { agendaStatus, relativeLabel, timeRange, type AgendaItem } from "@/lib/websiteAgenda";

const asAny = (t: string) => supabase.from(t as any) as any;

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "";

function StatItem({ icon: Icon, value, label }: { icon: any; value: number; label: string }) {
  return (
    <div className="flex items-center gap-4 px-5 py-5 md:px-7">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#1E40AF]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums leading-none text-slate-900 md:text-3xl">{value.toLocaleString("id-ID")}</div>
        <div className="mt-1 text-sm text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function MiniDate({ iso, dark }: { iso: string; dark?: boolean }) {
  const d = new Date(iso);
  return (
    <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl ${dark ? "bg-white/15 text-white" : "bg-[#1E40AF] text-white"}`}>
      <span className="text-xl font-bold leading-none tabular-nums">{d.getDate()}</span>
      <span className="mt-0.5 text-[11px] text-blue-100">{d.toLocaleDateString("id-ID", { month: "short" })}</span>
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
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
      const [sl, nw, pr, ag] = await Promise.all([
        asAny("website_hero_slides").select("*").eq("is_active", true).order("sort_order"),
        asAny("website_news").select("*, website_news_categories(name,color)").eq("status", "published").order("published_at", { ascending: false }).limit(5),
        asAny("website_programs").select("*").eq("is_published", true).order("sort_order").limit(6),
        asAny("website_agenda").select("*").eq("is_published", true)
          .or(`start_at.gte.${startOfToday.toISOString()},end_at.gte.${new Date().toISOString()}`)
          .order("start_at").limit(12),
      ]);
      setSlides(sl.data ?? []);
      setNews(nw.data ?? []);
      setPrograms(pr.data ?? []);
      setAgenda(((ag.data ?? []) as AgendaItem[]).filter((a) => agendaStatus(a) !== "past").slice(0, 5));

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

  const upcoming = agenda.slice(0, 3);
  const featured = agenda[0];
  const restAgenda = agenda.slice(1, 5);
  const [mainNews, ...otherNews] = news;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0B1F4D] text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B1F4D] via-[#12307a] to-[#1E40AF]" />
        {slides.map((s, i) => (
          s.image_url ? (
            <div
              key={s.id ?? i}
              className="absolute inset-0 transition-opacity duration-[1800ms] ease-in-out"
              style={{ opacity: i === slideIdx ? 1 : 0 }}
              aria-hidden={i !== slideIdx}
            >
              <img
                src={s.image_url} alt="" loading={i === 0 ? "eager" : "lazy"}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: i === slideIdx ? "scale(1.05)" : "scale(1)", transition: "transform 8s ease-out" }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F4D]/95 via-[#0B1F4D]/75 to-[#0B1F4D]/35" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F4D]/80 via-transparent to-transparent" />
            </div>
          ) : null
        ))}
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-400/20 blur-3xl" />

        <div className="container relative mx-auto grid items-center gap-10 px-4 pb-28 pt-16 md:pb-36 md:pt-24 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              {settings?.site_name ?? "Sekolah Kami"}
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight md:text-6xl">
              {currentSlide?.title ?? "Membangun Generasi Cerdas, Berkarakter, dan Berprestasi"}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-blue-100/95 md:text-lg">
              {currentSlide?.subtitle ?? settings?.tagline ?? "Pendidikan berkualitas dengan pendekatan modern, teknologi terkini, dan penguatan karakter untuk masa depan yang cemerlang."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full bg-amber-400 font-semibold text-[#0B1F4D] shadow-lg shadow-amber-500/20 hover:bg-amber-300">
                <Link to="/daftar-siswa">Daftar sekarang</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-white/40 bg-white/5 text-white backdrop-blur hover:bg-white hover:text-[#0B1F4D]">
                <Link to={currentSlide?.cta_url ?? "/website/profil"}>
                  {currentSlide?.cta_label ?? "Kenali sekolah kami"} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              {settings?.show_lapor_button !== false && (
                <Button asChild size="lg" variant="ghost" className="rounded-full text-white hover:bg-white/10 hover:text-white">
                  <a href="https://sp4n.lapor.go.id/" target="_blank" rel="noreferrer">
                    <MegaphoneIcon className="mr-2 h-4 w-4" /> Layanan pengaduan
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Agenda terdekat di halaman utama */}
          <aside className="rounded-3xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-xl md:p-6" aria-label="Agenda terdekat">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <CalendarDays className="h-5 w-5 text-amber-300" /> Agenda terdekat
              </h2>
              <Link to="/website/agenda" className="text-sm text-blue-100 hover:text-white hover:underline">Lihat semua</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="rounded-2xl bg-white/5 px-4 py-6 text-center text-sm text-blue-100/80">Belum ada agenda mendatang.</p>
            ) : (
              <ul className="space-y-2.5">
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <Link to="/website/agenda" className="flex items-center gap-4 rounded-2xl bg-white/10 p-3 transition hover:bg-white/20">
                      <MiniDate iso={a.start_at} dark />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{a.title}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-blue-100/85">
                          <Clock className="h-3 w-3 shrink-0" />{timeRange(a)}
                          {a.location ? <span className="truncate">, {a.location}</span> : null}
                        </div>
                      </div>
                      <span className="hidden shrink-0 rounded-full bg-amber-400/90 px-2.5 py-1 text-[11px] font-semibold text-[#0B1F4D] sm:inline">{relativeLabel(a)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        {/* Floating Pengaduan FAB */}
        {settings?.show_lapor_button !== false && (
          <a
            href="https://sp4n.lapor.go.id/" target="_blank" rel="noreferrer"
            className="group fixed bottom-20 right-5 z-40 md:bottom-24 md:right-8"
            aria-label="Layanan Pengaduan SP4N-LAPOR"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-orange-500/50 motion-reduce:animate-none" />
            <span className="relative flex items-center gap-2 rounded-full border border-white/30 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 py-3 pl-4 pr-5 text-white shadow-2xl shadow-orange-500/50 backdrop-blur transition hover:scale-105">
              <MegaphoneIcon className="h-5 w-5" />
              <span className="hidden whitespace-nowrap text-sm font-semibold sm:inline">Lapor Pengaduan</span>
            </span>
          </a>
        )}

        {slides.length > 1 && (
          <div className="absolute bottom-20 left-1/2 z-10 flex -translate-x-1/2 gap-2 md:bottom-24">
            {slides.map((_, i) => (
              <button
                key={i} onClick={() => setSlideIdx(i)}
                className={`h-1.5 rounded-full transition-all ${i === slideIdx ? "w-8 bg-white" : "w-3 bg-white/40 hover:bg-white/70"}`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </section>

      {/* Statistik */}
      <section className="container relative z-10 mx-auto -mt-12 px-4 md:-mt-14">
        <div className="grid grid-cols-2 divide-slate-100 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl shadow-slate-900/5 md:grid-cols-4 md:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-slate-100 md:[&>*:nth-child(-n+2)]:border-b-0">
          <StatItem icon={Users} value={stats.students} label="Peserta didik" />
          <StatItem icon={GraduationCap} value={stats.teachers} label="Guru dan staf" />
          <StatItem icon={BookOpen} value={stats.classes} label="Rombel" />
          <StatItem icon={Trophy} value={stats.achievements} label="Prestasi" />
        </div>
      </section>

      {/* Agenda */}
      <section className="container mx-auto px-4 pt-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Agenda sekolah</h2>
            <p className="mt-2 text-slate-600">Kegiatan dan acara yang akan berlangsung dalam waktu dekat.</p>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/website/agenda">Lihat semua agenda <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>

        {!featured ? (
          <div className="rounded-3xl border border-dashed border-slate-300 py-14 text-center text-slate-500">
            <CalendarDays className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            Belum ada agenda mendatang.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-5">
            <Link
              to="/website/agenda"
              className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1F4D] via-[#12307a] to-[#1E40AF] p-7 text-white lg:col-span-2 md:p-8"
            >
              <div className="pointer-events-none absolute -bottom-16 -right-10 h-56 w-56 rounded-full bg-amber-400/15 blur-2xl" />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-[#0B1F4D]">
                {agendaStatus(featured) === "ongoing" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600 motion-reduce:animate-none" />}
                {relativeLabel(featured)}
              </span>
              <div className="mt-6 flex items-end gap-4">
                <div className="text-7xl font-extrabold leading-none tabular-nums md:text-8xl">{new Date(featured.start_at).getDate()}</div>
                <div className="pb-2 text-blue-100">
                  <div className="text-lg font-semibold">{new Date(featured.start_at).toLocaleDateString("id-ID", { month: "long" })}</div>
                  <div className="text-sm">{new Date(featured.start_at).toLocaleDateString("id-ID", { weekday: "long", year: "numeric" })}</div>
                </div>
              </div>
              <h3 className="mt-6 text-2xl font-bold leading-snug group-hover:underline">{featured.title}</h3>
              <div className="mt-4 space-y-1.5 text-sm text-blue-100">
                <div className="flex items-center gap-2"><Clock className="h-4 w-4" />{timeRange(featured)}</div>
                {featured.location && <div className="flex items-center gap-2"><MapPin className="h-4 w-4" />{featured.location}</div>}
              </div>
              {featured.description && <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-blue-100/90">{featured.description}</p>}
            </Link>

            <div className="flex flex-col gap-3 lg:col-span-3">
              {restAgenda.length === 0 && (
                <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  Belum ada agenda lain. Kegiatan berikutnya akan tampil di sini.
                </div>
              )}
              {restAgenda.map((a) => (
                <Link key={a.id} to="/website/agenda" className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#1E40AF]/40 hover:shadow-md">
                  <MiniDate iso={a.start_at} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-slate-900 group-hover:text-[#1E40AF]">{a.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeRange(a)}</span>
                      {a.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{a.location}</span>}
                    </div>
                  </div>
                  <span className="hidden shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-[#1E40AF] sm:inline">{relativeLabel(a)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Program */}
      {programs.length > 0 && (
        <section className="container mx-auto px-4 pt-24">
          <div className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Kurikulum modern dan terpadu</h2>
            <p className="mt-3 text-slate-600">Program pembelajaran yang dirancang untuk mengembangkan potensi akademik, spiritual, dan keterampilan hidup.</p>
          </div>
          <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 gap-px md:grid-cols-2 lg:grid-cols-3">
            {programs.map((p) => (
              <div key={p.id} className="group bg-white p-7 transition hover:bg-blue-50/60">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-[#1E40AF] transition group-hover:bg-[#1E40AF] group-hover:text-white">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-slate-900">{p.name}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{p.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Berita */}
      <section className="container mx-auto px-4 pt-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Kabar terkini</h2>
            <p className="mt-2 text-slate-600">Berita dan informasi terbaru dari sekolah.</p>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/website/berita">Semua berita <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
        {!mainNews ? (
          <div className="rounded-3xl border border-dashed border-slate-300 py-14 text-center text-slate-500">
            <Newspaper className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            Belum ada berita dipublikasikan.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-5">
            <Link to={`/website/berita/${mainNews.slug}`} className="group relative block min-h-[360px] overflow-hidden rounded-3xl bg-slate-900 lg:col-span-3 lg:min-h-[460px]">
              {mainNews.cover_image_url ? (
                <img src={mainNews.cover_image_url} alt={mainNews.title} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#12307a] to-[#1E40AF]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
                {mainNews.website_news_categories && (
                  <span className="inline-block rounded-full bg-white/90 px-3 py-1 text-xs font-semibold" style={{ color: mainNews.website_news_categories.color }}>
                    {mainNews.website_news_categories.name}
                  </span>
                )}
                <h3 className="mt-3 line-clamp-3 text-2xl font-bold leading-snug text-white md:text-3xl">{mainNews.title}</h3>
                {mainNews.excerpt && <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-white/80">{mainNews.excerpt}</p>}
                <div className="mt-3 text-xs text-white/60">{fmtDate(mainNews.published_at)}</div>
              </div>
            </Link>
            <div className="flex flex-col gap-3 lg:col-span-2">
              {otherNews.map((n) => (
                <Link key={n.id} to={`/website/berita/${n.slug}`} className="group flex flex-1 gap-4 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-[#1E40AF]/40 hover:shadow-md">
                  <div className="h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:w-32">
                    {n.cover_image_url ? (
                      <img src={n.cover_image_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-blue-50 text-blue-300"><Newspaper className="h-8 w-8" /></div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    {n.website_news_categories && (
                      <span className="mb-1 text-xs font-semibold" style={{ color: n.website_news_categories.color }}>{n.website_news_categories.name}</span>
                    )}
                    <h3 className="line-clamp-2 font-semibold leading-snug text-slate-900 group-hover:text-[#1E40AF]">{n.title}</h3>
                    <div className="mt-1.5 text-xs text-slate-400">{fmtDate(n.published_at)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="h-24" />

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
      <section className="relative overflow-hidden bg-[#0B1F4D] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.45),transparent_60%)]" />
        <div className="container relative mx-auto px-4 py-16 text-center md:py-20">
          <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">Bergabunglah bersama kami</h2>
          <p className="mx-auto mb-7 max-w-2xl text-blue-100">Wujudkan cita-cita ananda bersama kami. Pendaftaran peserta didik baru telah dibuka.</p>
          <Button asChild size="lg" className="rounded-full bg-amber-400 font-semibold text-[#0B1F4D] shadow-xl hover:bg-amber-300">
            <Link to="/daftar-siswa">Daftar sekarang <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
