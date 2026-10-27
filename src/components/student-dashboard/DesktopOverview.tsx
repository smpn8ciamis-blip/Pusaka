// src/components/student-dashboard/DesktopOverview.tsx
// Beranda dashboard siswa untuk layar lebar: hero berita, pelajaran berlangsung, ringkasan,
// jadwal hari ini, kehadiran, dan berita sekolah dalam satu grid yang lega.
import type { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Calendar, BookOpen, GraduationCap, ChevronRight, Clock, Eye, EyeOff, ArrowUpRight } from "lucide-react";
import {
  DAY_NAMES, greetingFor, humanMinutes, safeFormatDate, toMinutes,
  type AttendanceSummary, type HeroNews, type LessonState,
} from "@/lib/studentDashboard";

export interface DesktopStat {
  label: string;
  value: string | number;
  unit: string;
  tab: string;
  icon: any;
  tone: "blue" | "green" | "amber" | "violet";
}

interface Props {
  firstName: string;
  className?: string | null;
  now: Date;
  schoolLogo?: string | null;
  slides: HeroNews[];
  slideIdx: number;
  onSlide: (i: number) => void;
  onOpenNews: (n: HeroNews) => void;
  onAllNews: () => void;
  news: HeroNews[];
  lesson: LessonState;
  todaySchedules: any[];
  schedulesLoading: boolean;
  stats: DesktopStat[];
  showData: boolean;
  onToggleData: () => void;
  summary: AttendanceSummary | null;
  attendanceLoading: boolean;
  attendancePercent: number;
  logsNode: ReactNode;
  onNavigate: (tab: string) => void;
}

const TONES: Record<DesktopStat["tone"], { chip: string; icon: string }> = {
  blue: { chip: "bg-[#E8F2FF] dark:bg-[#1E6FE0]/20", icon: "text-[#1E6FE0]" },
  green: { chip: "bg-emerald-50 dark:bg-emerald-500/15", icon: "text-emerald-600" },
  amber: { chip: "bg-amber-50 dark:bg-amber-500/15", icon: "text-amber-600" },
  violet: { chip: "bg-violet-50 dark:bg-violet-500/15", icon: "text-violet-600" },
};

const CARD = "rounded-3xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(30,111,224,0.18)] dark:border-slate-800 dark:bg-slate-900";

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">{children}</h2>
      {action}
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-0.5 rounded-lg text-[13px] font-medium text-[#1E6FE0] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E6FE0]"
    >
      {children} <ChevronRight className="h-4 w-4" />
    </button>
  );
}

export function DesktopOverview(p: Props) {
  const active = p.slides.length ? p.slideIdx % p.slides.length : 0;
  const slide = p.slides.length ? p.slides[active] : null;
  const nowMin = p.now.getHours() * 60 + p.now.getMinutes();
  const teacher = (l: any) => l?.teachers?.profiles?.full_name || "";

  // Kartu pelajaran
  let lessonLabel = "Jadwal hari ini";
  let lessonTitle = "Tidak ada pelajaran";
  let lessonMeta = "Nikmati harimu.";
  let lessonProgress: number | null = null;
  let lessonNext: string | null = null;
  if (p.lesson.kind === "now") {
    lessonLabel = "Sedang berlangsung";
    lessonTitle = p.lesson.lesson.subject;
    lessonMeta = [teacher(p.lesson.lesson), `sisa ${humanMinutes(p.lesson.minsLeft)}`].filter(Boolean).join(" · ");
    lessonProgress = Math.min(100, Math.max(0, (p.lesson.elapsed / p.lesson.total) * 100));
    if (p.lesson.next) lessonNext = `${p.lesson.next.start_time?.slice(0, 5)} · ${p.lesson.next.subject}`;
  } else if (p.lesson.kind === "next") {
    lessonLabel = "Berikutnya";
    lessonTitle = p.lesson.lesson.subject;
    lessonMeta = [p.lesson.lesson.start_time?.slice(0, 5), `mulai ${humanMinutes(p.lesson.minsUntil)} lagi`].join(" · ");
  } else if (p.lesson.kind === "done") {
    lessonTitle = "Semua pelajaran selesai";
    lessonMeta = `${p.lesson.count} mapel hari ini sudah dilewati.`;
  }

  // Cincin kehadiran
  const s = p.summary;
  const R = 52;
  const C = 2 * Math.PI * R;
  const legend = [
    { label: "Hadir", value: s?.hadir ?? 0, dot: "bg-emerald-500" },
    { label: "Terlambat", value: s?.terlambat ?? 0, dot: "bg-orange-500" },
    { label: "Izin", value: s?.izin ?? 0, dot: "bg-blue-500" },
    { label: "Sakit", value: s?.sakit ?? 0, dot: "bg-amber-500" },
    { label: "Alpa", value: s?.alpa ?? 0, dot: "bg-red-500" },
  ];

  return (
    <div className="space-y-6">
      {/* BARIS 1: hero + pelajaran/kehadiran */}
      <div className="grid grid-cols-12 gap-6">
        <section
          aria-label="Sorotan"
          className="relative col-span-12 flex min-h-[21rem] flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#1E6FE0] via-[#2F7FE8] to-[#4F97F2] p-8 text-white xl:col-span-8"
        >
          {slide ? (
            <>
              {p.slides.map((n, i) => (
                <img
                  key={n.id}
                  src={n.cover_image_url!}
                  alt=""
                  aria-hidden
                  loading={i === 0 ? "eager" : "lazy"}
                  className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-in-out ${i === active ? "opacity-100" : "opacity-0"}`}
                />
              ))}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#071B45]/95 via-[#0B2A66]/55 to-[#1E6FE0]/60" />
            </>
          ) : (
            p.schoolLogo && <img src={p.schoolLogo} alt="" aria-hidden className="pointer-events-none absolute -right-10 -top-6 h-72 w-72 object-contain opacity-15" />
          )}

          <div className="relative">
            <p className="text-sm font-medium text-white/80">{greetingFor(p.now)},</p>
            <h2 className="mt-1 text-4xl font-semibold tracking-tight">{p.firstName}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="rounded-full bg-white/20 px-3 py-1 font-medium backdrop-blur">{p.className || "Kelas belum diatur"}</span>
              <span className="rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                {DAY_NAMES[p.now.getDay()]}, {safeFormatDate(p.now, "d MMMM yyyy")}
              </span>
              <span className="rounded-full bg-white/15 px-3 py-1 tabular-nums backdrop-blur">{safeFormatDate(p.now, "HH:mm")} WIB</span>
            </div>
          </div>

          {slide && (
            <div className="relative mt-auto pt-10">
              <div key={slide.id} className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                <div className="flex items-center gap-2 text-xs text-white/80">
                  {slide.website_news_categories?.name && (
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-medium text-white backdrop-blur">{slide.website_news_categories.name}</span>
                  )}
                  {slide.published_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(slide.published_at), { addSuffix: true, locale: localeId })}
                    </span>
                  )}
                </div>
                <h3 className="mt-2 line-clamp-2 max-w-2xl text-2xl font-semibold leading-snug tracking-tight drop-shadow-sm">{slide.title}</h3>
                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => p.onOpenNews(slide)}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#1E6FE0] shadow-sm transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Selengkapnya <ChevronRight className="h-4 w-4" />
                  </button>
                  {p.slides.length > 1 && (
                    <div className="flex items-center gap-1.5" role="tablist" aria-label="Pilih berita">
                      {p.slides.map((n, i) => (
                        <button
                          key={n.id}
                          role="tab"
                          aria-selected={i === active}
                          aria-label={`Berita ${i + 1}`}
                          onClick={() => p.onSlide(i)}
                          className={`h-1.5 rounded-full transition-all duration-500 ${i === active ? "w-7 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="col-span-12 grid gap-6 md:grid-cols-2 xl:col-span-4 xl:grid-cols-1 xl:grid-rows-[auto_1fr]">
          {/* Pelajaran */}
          <section aria-label="Pelajaran" className={`${CARD} p-6`}>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1E6FE0]">
              {p.lesson.kind === "now" && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#1E6FE0] opacity-60 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1E6FE0]" />
                </span>
              )}
              {lessonLabel}
            </div>
            <button
              onClick={() => p.onNavigate("schedule")}
              className="mt-2 block w-full rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0]"
            >
              <span className="block truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{lessonTitle}</span>
              <span className="mt-0.5 block truncate text-[13px] text-slate-500">{lessonMeta}</span>
            </button>
            {lessonProgress !== null && (
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={Math.round(lessonProgress)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-[#1E6FE0] transition-[width] duration-1000" style={{ width: `${lessonProgress}%` }} />
              </div>
            )}
            {lessonNext && <p className="mt-3 truncate text-xs text-slate-500">Berikutnya: <span className="font-medium text-slate-700 dark:text-slate-300">{lessonNext}</span></p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { label: "Jadwal", icon: Calendar, tab: "schedule" },
                { label: "Nilai", icon: BookOpen, tab: "grades" },
                { label: "E-Learning", icon: GraduationCap, tab: "elearning" },
              ].map((a) => (
                <button
                  key={a.tab}
                  onClick={() => p.onNavigate(a.tab)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F6FD] px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-[#E8F2FF] hover:text-[#1E6FE0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0] dark:bg-slate-800 dark:text-slate-200"
                >
                  <a.icon className="h-3.5 w-3.5" /> {a.label}
                </button>
              ))}
            </div>
          </section>

          {/* Kehadiran */}
          <section aria-label="Kehadiran" className={`${CARD} flex flex-col p-6`}>
            <SectionTitle action={<LinkButton onClick={() => p.onNavigate("attendance")}>Detail</LinkButton>}>Kehadiran</SectionTitle>
            {p.attendanceLoading ? (
              <p className="py-6 text-center text-sm text-slate-400">Memuat…</p>
            ) : (
              <div className="flex items-center gap-5">
                <div className="relative h-28 w-28 shrink-0">
                  <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`Kehadiran ${p.attendancePercent} persen`}>
                    <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" className="stroke-slate-100 dark:stroke-slate-800" />
                    <circle
                      cx="60" cy="60" r={R} fill="none" strokeWidth="10" strokeLinecap="round"
                      className="stroke-emerald-500 transition-[stroke-dashoffset] duration-1000"
                      strokeDasharray={C}
                      strokeDashoffset={C * (1 - (p.showData ? p.attendancePercent : 0) / 100)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-white">{p.showData ? `${p.attendancePercent}%` : "•••"}</span>
                    <span className="text-[11px] text-slate-500">hadir</span>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {legend.map((l) => (
                    <li key={l.label} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <span className={`h-2 w-2 rounded-full ${l.dot}`} /> {l.label}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{p.showData ? l.value : "•"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* BARIS 2: ringkasan */}
      <section aria-label="Ringkasan">
        <SectionTitle
          action={
            <button
              onClick={p.onToggleData}
              aria-label={p.showData ? "Sembunyikan angka" : "Tampilkan angka"}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-[#1E6FE0]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {p.showData ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {p.showData ? "Sembunyikan" : "Tampilkan"}
            </button>
          }
        >
          Ringkasan Saya
        </SectionTitle>
        <div className="grid grid-cols-2 gap-6 xl:grid-cols-4">
          {p.stats.map((st) => {
            const tone = TONES[st.tone];
            return (
              <button
                key={st.label}
                onClick={() => p.onNavigate(st.tab)}
                className={`${CARD} group relative p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[#1E6FE0]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0]`}
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone.chip}`}>
                  <st.icon className={`h-5 w-5 ${tone.icon}`} strokeWidth={1.9} />
                </span>
                <ArrowUpRight className="absolute right-5 top-5 h-4 w-4 text-slate-300 transition-colors group-hover:text-[#1E6FE0]" aria-hidden />
                <p className="mt-5 text-3xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-white">{st.value}</p>
                <p className="mt-0.5 text-[13px] font-medium text-slate-700 dark:text-slate-200">{st.label}</p>
                <p className="text-xs text-slate-500">{st.unit}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* BARIS 3: jadwal + riwayat */}
      <div className="grid grid-cols-12 gap-6">
        <section aria-label="Jadwal hari ini" className={`${CARD} col-span-12 p-6 xl:col-span-7`}>
          <SectionTitle action={<LinkButton onClick={() => p.onNavigate("schedule")}>Lihat semua</LinkButton>}>Jadwal Hari Ini</SectionTitle>
          <p className="-mt-2 mb-4 text-xs text-slate-500">{DAY_NAMES[p.now.getDay()]}, {safeFormatDate(p.now, "d MMMM yyyy")}</p>
          {p.schedulesLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">Memuat jadwal…</p>
          ) : p.todaySchedules.length > 0 ? (
            <ol>
              {p.todaySchedules.map((sc: any, idx: number) => {
                const st = toMinutes(sc.start_time);
                const en = toMinutes(sc.end_time);
                const isNow = st != null && en != null && nowMin >= st && nowMin < en;
                const isPast = en != null && nowMin >= en;
                const last = idx === p.todaySchedules.length - 1;
                return (
                  <li key={sc.id} className="relative flex gap-4 pb-5 last:pb-0">
                    {!last && <span className="absolute left-[5.1rem] top-5 bottom-0 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />}
                    <div className="w-16 shrink-0 text-right tabular-nums">
                      <p className={`text-sm font-semibold ${isPast ? "text-slate-400" : "text-slate-800 dark:text-slate-100"}`}>{sc.start_time?.slice(0, 5)}</p>
                      <p className="text-xs text-slate-400">{sc.end_time?.slice(0, 5)}</p>
                    </div>
                    <span className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${isNow ? "border-[#1E6FE0] bg-[#1E6FE0]" : isPast ? "border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700" : "border-[#1E6FE0] bg-white dark:bg-slate-900"}`} />
                    <div className={`min-w-0 flex-1 rounded-2xl px-4 py-2.5 ${isNow ? "bg-[#E8F2FF] dark:bg-[#1E6FE0]/15" : ""} ${isPast ? "opacity-50" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{sc.subject}</p>
                        {isNow && <span className="shrink-0 rounded-full bg-[#1E6FE0] px-2 py-0.5 text-[11px] font-semibold text-white">Sekarang</span>}
                      </div>
                      <p className="truncate text-xs text-slate-500">{sc.teachers?.profiles?.full_name}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="py-10 text-center">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                <Calendar className="h-7 w-7 text-slate-400" />
              </span>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Tidak ada jadwal hari ini</p>
            </div>
          )}
        </section>

        <section aria-label="Riwayat absensi" className={`${CARD} col-span-12 p-6 xl:col-span-5`}>
          <SectionTitle action={<LinkButton onClick={() => p.onNavigate("attendance")}>Lihat semua</LinkButton>}>Riwayat Absensi Terbaru</SectionTitle>
          {p.logsNode}
        </section>
      </div>

      {/* BARIS 4: berita */}
      {p.news.length > 0 && (
        <section aria-label="Berita sekolah">
          <SectionTitle action={<LinkButton onClick={p.onAllNews}>Semua berita</LinkButton>}>Berita Sekolah</SectionTitle>
          <div className="grid grid-cols-3 gap-6">
            {p.news.slice(0, 3).map((n) => (
              <button
                key={n.id}
                onClick={() => p.onOpenNews(n)}
                className={`${CARD} group flex flex-col items-stretch justify-start overflow-hidden text-left transition-all hover:-translate-y-0.5 hover:border-[#1E6FE0]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0]`}
              >
                <div className="aspect-[16/9] overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <img src={n.cover_image_url!} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                </div>
                <div className="p-4">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">{n.title}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {n.website_news_categories?.name ? `${n.website_news_categories.name} · ` : ""}
                    {n.published_at ? formatDistanceToNow(new Date(n.published_at), { addSuffix: true, locale: localeId }) : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
