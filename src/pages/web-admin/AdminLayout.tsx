import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Newspaper, FileText, Images, Calendar, Sparkles,
  BookOpen, Mail, Settings as SettingsIcon, LogOut, Globe, Layers, Activity,
} from "lucide-react";

const NAV = [
  { to: "/web-admin", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/web-admin/berita", label: "Berita", icon: Newspaper },
  { to: "/web-admin/halaman", label: "Halaman Profil", icon: FileText },
  { to: "/web-admin/hero", label: "Slider Beranda", icon: Sparkles },
  { to: "/web-admin/galeri", label: "Galeri", icon: Images },
  { to: "/web-admin/agenda", label: "Agenda", icon: Calendar },
  { to: "/web-admin/program", label: "Program", icon: BookOpen },
  { to: "/web-admin/ekstrakurikuler", label: "Ekstrakurikuler", icon: Activity },
  { to: "/web-admin/kategori", label: "Kategori Berita", icon: Layers },
  { to: "/web-admin/pesan", label: "Pesan Masuk", icon: Mail },
  { to: "/web-admin/pengaturan", label: "Pengaturan Website", icon: SettingsIcon },
];

export default function AdminLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-white border-r flex flex-col shrink-0">
        <div className="p-5 border-b">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] text-white flex items-center justify-center font-bold">W</div>
            <div>
              <div className="font-bold text-slate-900 text-sm">Web Admin</div>
              <div className="text-[11px] text-slate-500">{user?.email}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  isActive ? "bg-[#1E40AF] text-white" : "text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t space-y-2">
          <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/")}>
            <Globe className="h-4 w-4 mr-2" /> Lihat Website
          </Button>
          <Button variant="ghost" size="sm" className="w-full text-red-600" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Keluar
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
