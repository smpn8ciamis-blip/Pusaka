import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  LayoutDashboard, Newspaper, FileText, Images, Calendar, Sparkles,
  BookOpen, Mail, Settings as SettingsIcon, LogOut, Globe, Layers, Activity, Menu,
} from "lucide-react";

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
                  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? "bg-[#1E40AF] text-white shadow-sm shadow-blue-900/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                <n.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1 truncate">{n.label}</span>
                {n.to.endsWith("/pesan") && unread > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{unread > 99 ? "99+" : unread}</span>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand({ email }: { email?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] font-bold text-white shadow-sm">W</div>
      <div className="min-w-0">
        <div className="text-sm font-bold leading-tight text-slate-900">Web Admin</div>
        <div className="truncate text-[11px] text-slate-500">{email}</div>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    (supabase.from("website_contact_messages" as any) as any)
      .select("id", { count: "exact", head: true }).eq("is_read", false)
      .then(({ count }: any) => setUnread(count ?? 0));
  }, [pathname]);

  const current = ALL.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? "Web Admin";

  const Actions = (
    <div className="space-y-2">
      <Button variant="outline" size="sm" className="w-full justify-start rounded-xl" onClick={() => { setMenuOpen(false); navigate("/"); }}>
        <Globe className="mr-2 h-4 w-4" /> Lihat Website
      </Button>
      <Button variant="ghost" size="sm" className="w-full justify-start rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700" onClick={signOut}>
        <LogOut className="mr-2 h-4 w-4" /> Keluar
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-white lg:flex">
        <div className="border-b p-5"><Brand email={user?.email} /></div>
        <div className="flex-1 overflow-y-auto p-3"><NavList unread={unread} /></div>
        <div className="border-t p-3">{Actions}</div>
      </aside>

      {/* Bilah atas mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" className="-ml-2 h-9 w-9" onClick={() => setMenuOpen(true)} aria-label="Buka menu">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900">{current}</div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate("/")} aria-label="Lihat website">
          <Globe className="h-5 w-5 text-slate-500" />
        </Button>
      </header>

      {/* Menu geser mobile */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="flex w-[85%] max-w-xs flex-col gap-0 p-0">
          <SheetHeader className="border-b p-5 text-left">
            <SheetTitle className="sr-only">Menu Web Admin</SheetTitle>
            <SheetDescription className="sr-only">Navigasi panel admin website</SheetDescription>
            <Brand email={user?.email} />
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-3"><NavList unread={unread} onNavigate={() => setMenuOpen(false)} /></div>
          <div className="border-t p-3">{Actions}</div>
        </SheetContent>
      </Sheet>

      <main className="min-w-0 flex-1 overflow-x-hidden pb-24 lg:pb-0">
        <Outlet />
      </main>

      {/* Navigasi bawah mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
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
              {n.to.endsWith("/pesan") && unread > 0 && (
                <span className="absolute right-[22%] top-1 rounded-full bg-red-500 px-1.5 text-[9px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>
              )}
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
