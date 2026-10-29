import { Suspense, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard, Newspaper, FileText, Images, Calendar, Sparkles,
  BookOpen, Mail, Settings as SettingsIcon, LogOut, Globe, Layers, Activity, Menu, ChevronDown,
} from "lucide-react";
import { ListSkeleton, UNREAD_KEY } from "@/components/web-admin/ui";

type NavItem = { to: string; end?: boolean; label: string; short?: string; icon: any };

const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Ringkasan", items: [{ to: "/web-admin", end: true, label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Konten Website",
    items: [
      { to: "/web-admin/berita", label: "Berita", icon: Newspaper },
      { to: "/web-admin/halaman", label: "Halaman Profil", icon: FileText },
      { to: "/web-admin/hero", label: "Slider Beranda", icon: Sparkles },
      { to: "/web-admin/galeri", label: "Galeri", icon: Images },
      { to: "/web-admin/agenda", label: "Agenda", icon: Calendar },
      { to: "/web-admin/program", label: "Program", icon: BookOpen },
      { to: "/web-admin/ekstrakurikuler", label: "Ekstrakurikuler", icon: Activity },
    ],
  },
  {
    title: "Pengelolaan",
    items: [
      { to: "/web-admin/kategori", label: "Kategori Berita", icon: Layers },
      { to: "/web-admin/pesan", label: "Pesan Masuk", icon: Mail },
      { to: "/web-admin/pengaturan", label: "Pengaturan Website", icon: SettingsIcon },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.items);
const BOTTOM: NavItem[] = [
  { to: "/web-admin", end: true, label: "Dashboard", short: "Beranda", icon: LayoutDashboard },
  { to: "/web-admin/berita", label: "Berita", icon: Newspaper },
  { to: "/web-admin/galeri", label: "Galeri", icon: Images },
  { to: "/web-admin/pesan", label: "Pesan Masuk", short: "Pesan", icon: Mail },
];

/** Jumlah pesan belum dibaca. Di-cache; AdminMessages menyegarkannya lewat kunci yang sama. */
function useUnread() {
  return useQuery({
    queryKey: UNREAD_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await (supabase.from("website_contact_messages" as any) as any)
        .select("id", { count: "exact", head: true }).eq("is_read", false);
      return (count ?? 0) as number;
    },
  }).data ?? 0;
}

function Badge({ n, className = "" }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return <span className={`rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4 text-white ${className}`}>{n > 99 ? "99+" : n}</span>;
}

function NavList({ unread, onNavigate }: { unread: number; onNavigate?: () => void }) {
  return (
    <nav className="space-y-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</div>
          <div className="space-y-0.5">
            {g.items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-blue-50 text-[#1E40AF]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-[#1E40AF]" />}
                    <n.icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1 truncate">{n.label}</span>
                    {n.to.endsWith("/pesan") && <Badge n={unread} className="py-0.5" />}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] text-sm font-bold text-white">W</div>
      <div className="min-w-0">
        <div className="text-sm font-bold leading-tight text-slate-900">Web Admin</div>
        <div className="text-[11px] text-slate-500">SMPN 8 Ciamis</div>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const unread = useUnread();

  const current = ALL.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? "Web Admin";
  const initial = (user?.email?.[0] ?? "A").toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200/70 bg-white lg:flex">
        <div className="border-b border-slate-200/70 px-4 py-4"><Brand /></div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-3"><NavList unread={unread} /></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Bilah atas: desktop memuat judul + akun; HP memuat tombol menu */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white px-4 lg:px-8">
          <Button variant="ghost" size="icon" className="-ml-2 h-9 w-9 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Buka menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900">{current}</div>
          <Button variant="outline" size="sm" className="hidden rounded-lg sm:inline-flex" onClick={() => window.open("/", "_blank", "noopener")}>
            <Globe className="mr-2 h-4 w-4" /> Lihat Website
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:hidden" onClick={() => window.open("/", "_blank", "noopener")} aria-label="Lihat website">
            <Globe className="h-5 w-5 text-slate-500" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100" aria-label="Menu akun">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] text-sm font-bold text-white">{initial}</span>
                <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate text-xs font-normal text-slate-500">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/dashboard")}><LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard PUSAKA</DropdownMenuItem>
              <DropdownMenuItem onClick={signOut} className="text-red-600 focus:text-red-700"><LogOut className="mr-2 h-4 w-4" /> Keluar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Menu geser (HP/tablet) */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="flex w-[85%] max-w-xs flex-col gap-0 p-0">
            <SheetHeader className="border-b p-4 text-left">
              <SheetTitle className="sr-only">Menu Web Admin</SheetTitle>
              <SheetDescription className="sr-only">Navigasi panel admin website</SheetDescription>
              <Brand />
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-3"><NavList unread={unread} onNavigate={() => setMenuOpen(false)} /></div>
          </SheetContent>
        </Sheet>

        {/* Sidebar tetap tampil saat halaman dimuat (halaman lazy) */}
        <main className="min-w-0 flex-1 overflow-x-hidden pb-24 lg:pb-0">
          <Suspense fallback={<div className="p-4 sm:p-6 lg:p-8"><ListSkeleton rows={4} /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Navigasi bawah (HP) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="grid grid-cols-5">
          {BOTTOM.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? "text-[#1E40AF]" : "text-slate-500"}`}
            >
              <n.icon className="h-5 w-5" />
              {n.short ?? n.label}
              {n.to.endsWith("/pesan") && <Badge n={unread} className="absolute right-[22%] top-1 text-[9px]" />}
            </NavLink>
          ))}
          <button type="button" onClick={() => setMenuOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500">
            <Menu className="h-5 w-5" />
            Menu
          </button>
        </div>
      </nav>
    </div>
  );
}
