// src/components/student-dashboard/DesktopShell.tsx
// Kerangka dashboard siswa untuk layar lebar: sidebar navigasi + bilah atas + area konten.
import type { ReactNode } from "react";
import {
  Home, Calendar, BookOpen, GraduationCap, CalendarCheck, AlertTriangle, Trophy, Users,
  Star, Hourglass, Megaphone, IdCard, Upload, UserCircle, Settings, ExternalLink, Link2,
  LogOut, Search, Smartphone,
} from "lucide-react";

interface NavItem {
  tab?: string;
  url?: string;
  label: string;
  icon: any;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Utama",
    items: [
      { tab: "overview", label: "Beranda", icon: Home },
      { tab: "schedule", label: "Jadwal", icon: Calendar },
      { tab: "grades", label: "Nilai", icon: BookOpen },
      { tab: "elearning", label: "E-Learning", icon: GraduationCap },
      { tab: "attendance", label: "Kehadiran", icon: CalendarCheck },
    ],
  },
  {
    label: "Catatan Siswa",
    items: [
      { tab: "violations", label: "Pelanggaran", icon: AlertTriangle },
      { tab: "achievements", label: "Prestasi", icon: Trophy },
      { tab: "ekskul", label: "Ekstrakurikuler", icon: Users },
      { tab: "salat", label: "Absensi Salat", icon: Star },
      { tab: "dispensasi", label: "Dispensasi", icon: Hourglass },
    ],
  },
  {
    label: "Layanan",
    items: [
      { tab: "announcements", label: "Pengumuman", icon: Megaphone },
      { tab: "idcard", label: "Kartu OSIS", icon: IdCard },
      { tab: "uploads", label: "Upload Berkas", icon: Upload },
      { tab: "profile", label: "Profil Saya", icon: UserCircle },
      { tab: "settings", label: "Pengaturan", icon: Settings },
    ],
  },
  {
    label: "Aplikasi Lain",
    items: [
      { url: "/cbt-student", label: "CBT Student", icon: ExternalLink },
      { url: "/nedelcis-hub", label: "Nedelcis Hub", icon: Link2 },
    ],
  },
];

const ALL_TABS = GROUPS.flatMap((g) => g.items.map((i) => i.tab)).filter(Boolean) as string[];

/** Judul halaman untuk bilah atas. */
export const desktopTitleFor = (activeTab: string): string => {
  for (const g of GROUPS) for (const i of g.items) if (i.tab === activeTab) return i.label;
  return "Beranda";
};

interface Props {
  activeTab: string;
  onNavigate: (tab: string) => void;
  onOpenUrl: (url: string) => void;
  schoolName?: string | null;
  schoolLogo?: string | null;
  studentName: string;
  className?: string | null;
  photoUrl?: string | null;
  onProfile: () => void;
  onLogout: () => void;
  onSwitchToMobile: () => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onSearchFocus: () => void;
  /** Daftar saran pencarian (posisi absolut di bawah kolom cari). */
  searchPanel?: ReactNode;
  /** Kontrol kanan bilah atas: pemilih tahun, notifikasi, dll. */
  topbarRight?: ReactNode;
  children: ReactNode;
}

export function DesktopShell({
  activeTab, onNavigate, onOpenUrl, schoolName, schoolLogo, studentName, className, photoUrl,
  onProfile, onLogout, onSwitchToMobile, searchValue, onSearchChange, onSearchFocus,
  searchPanel, topbarRight, children,
}: Props) {
  const current = ALL_TABS.includes(activeTab) ? activeTab : "overview";

  return (
    <div className="min-h-screen bg-[#F1F6FD] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* SIDEBAR */}
      <aside
        aria-label="Menu siswa"
        className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex h-16 shrink-0 items-center gap-3 px-5">
          {schoolLogo ? (
            <img src={schoolLogo} alt="" className="h-9 w-9 rounded-lg object-contain" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1E6FE0] to-[#4F97F2] text-sm font-bold text-white">P</span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight tracking-tight">PUSAKA</p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{schoolName || "Portal Siswa"}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-1 [scrollbar-width:thin]">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-3">
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{g.label}</p>
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const active = !!item.tab && item.tab === current;
                  return (
                    <li key={item.label}>
                      <button
                        onClick={() => (item.tab ? onNavigate(item.tab) : onOpenUrl(item.url!))}
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-[7px] text-left text-[13.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0] ${
                          active
                            ? "bg-[#E8F2FF] text-[#1E6FE0] dark:bg-slate-800 dark:text-[#6FB0FF]"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        }`}
                      >
                        {active && <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#1E6FE0]" aria-hidden />}
                        <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.25 : 1.75} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 space-y-1 border-t border-slate-200/80 p-3 dark:border-slate-800">
          <button
            onClick={onSwitchToMobile}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0]"
          >
            <Smartphone className="h-[18px] w-[18px]" strokeWidth={1.75} />
            Tampilan Mobile
          </button>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
            Keluar
          </button>
        </div>
      </aside>

      {/* AREA KANAN */}
      <div className="pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#F1F6FD]/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
          <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-8">
            <h1 className="min-w-0 shrink-0 text-lg font-semibold tracking-tight">{desktopTitleFor(current)}</h1>

            <div className="relative ml-auto w-full max-w-sm">
              <div className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm shadow-sm focus-within:border-[#1E6FE0] focus-within:ring-2 focus-within:ring-[#1E6FE0]/20 dark:border-slate-700 dark:bg-slate-900">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  data-search-input
                  type="text"
                  placeholder="Cari menu…"
                  aria-label="Cari menu"
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onFocus={onSearchFocus}
                  className="min-w-0 flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
              </div>
              {searchPanel}
            </div>

            <div className="flex shrink-0 items-center gap-2">{topbarRight}</div>

            <button
              onClick={onProfile}
              className="flex shrink-0 items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-4 shadow-sm transition-colors hover:border-[#1E6FE0]/50 dark:border-slate-700 dark:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0]"
              aria-label="Buka profil"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8F2FF] text-sm font-semibold text-[#1E6FE0]">
                  {studentName.charAt(0) || "S"}
                </span>
              )}
              <span className="hidden min-w-0 text-left xl:block">
                <span className="block max-w-[10rem] truncate text-[13px] font-semibold leading-tight">{studentName}</span>
                <span className="block max-w-[10rem] truncate text-[11px] leading-tight text-slate-500">{className || "Kelas belum diatur"}</span>
              </span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1320px] px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
