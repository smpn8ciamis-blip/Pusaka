import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Menu, X, Facebook, Instagram, Youtube, Phone, Mail, MapPin } from "lucide-react";
import ChatbotWidget from "./ChatbotWidget";

const NAV = [
  { to: "/", label: "Beranda", end: true },
  { to: "/website/profil", label: "Profil" },
  { to: "/website/akademik", label: "Akademik" },
  { to: "/website/ekstrakurikuler", label: "Ekstrakurikuler" },
  { to: "/website/berita", label: "Berita" },
  { to: "/website/galeri", label: "Galeri" },
  { to: "/website/guru", label: "Guru & Staff" },
  { to: "/website/kontak", label: "Kontak" },
];

export type WebsiteSettings = {
  site_name: string;
  tagline?: string;
  about_short?: string;
  address?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  facebook_url?: string;
  instagram_url?: string;
  youtube_url?: string;
  map_embed_url?: string;
  logo_url?: string;
  meta_title?: string;
  meta_description?: string;
  show_lapor_button?: boolean;
  chatbot_enabled?: boolean;
  chatbot_name?: string;
  chatbot_welcome?: string;
};

export function useWebsiteSettings() {
  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  useEffect(() => {
    (async () => {
      const { data: ws } = await (supabase.from("website_settings" as any) as any)
        .select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: sc } = await (supabase.from("school_settings" as any) as any)
        .select("school_name,logo_url,school_address,school_phone")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const merged: any = {
        ...(ws ?? {}),
        site_name: ws?.site_name || sc?.school_name || "Nedelcis School",
        logo_url: ws?.logo_url || sc?.logo_url || null,
        address: ws?.address || sc?.school_address || null,
        phone: ws?.phone || sc?.school_phone || null,
        email: ws?.email || null,
      };
      setSettings(merged);
    })();
  }, []);
  return settings;
}

export default function PublicLayout() {
  const settings = useWebsiteSettings();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (settings?.meta_title) document.title = settings.meta_title;
    if (settings?.meta_description) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
      m.setAttribute("content", settings.meta_description);
    }
  }, [settings]);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {/* Top bar */}
      <div className="hidden md:block bg-[#1E40AF] text-white text-xs">
        <div className="container mx-auto flex items-center justify-between py-2 px-4">
          <div className="flex items-center gap-4">
            {settings?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{settings.phone}</span>}
            {settings?.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{settings.email}</span>}
          </div>
          <div className="flex items-center gap-3">
            {settings?.facebook_url && <a href={settings.facebook_url} target="_blank" rel="noreferrer"><Facebook className="h-3.5 w-3.5" /></a>}
            {settings?.instagram_url && <a href={settings.instagram_url} target="_blank" rel="noreferrer"><Instagram className="h-3.5 w-3.5" /></a>}
            {settings?.youtube_url && <a href={settings.youtube_url} target="_blank" rel="noreferrer"><Youtube className="h-3.5 w-3.5" /></a>}
          </div>
        </div>
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b">
        <div className="container mx-auto flex items-center justify-between px-4 h-16">
          <Link to="/" className="flex items-center gap-3">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="logo" className="h-10 w-10 object-contain" />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] text-white flex items-center justify-center font-bold">N</div>
            )}
            <div>
              <div className="font-bold text-slate-900 leading-tight">{settings?.site_name ?? "Nedelcis School"}</div>
              {settings?.tagline && <div className="text-[11px] text-slate-500 leading-tight">{settings.tagline}</div>}
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm font-medium rounded-md transition ${
                    isActive ? "text-[#1E40AF] bg-blue-50" : "text-slate-700 hover:text-[#1E40AF] hover:bg-slate-50"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2">
            {user ? (
              <Button onClick={() => navigate("/dashboard")} className="bg-[#1E40AF] hover:bg-[#1E3A8A]">Dashboard</Button>
            ) : (
              <Button onClick={() => navigate("/auth")} variant="outline" className="border-[#1E40AF] text-[#1E40AF] hover:bg-[#1E40AF] hover:text-white">Login</Button>
            )}
          </div>

          <button className="lg:hidden p-2" onClick={() => setOpen((s) => !s)} aria-label="menu">
            {open ? <X /> : <Menu />}
          </button>
        </div>

        {open && (
          <div className="lg:hidden border-t bg-white">
            <div className="container mx-auto px-4 py-3 flex flex-col gap-1">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-md text-sm ${isActive ? "text-[#1E40AF] bg-blue-50" : "text-slate-700"}`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
              <Button
                onClick={() => { setOpen(false); navigate(user ? "/dashboard" : "/auth"); }}
                className="mt-2 bg-[#1E40AF] hover:bg-[#1E3A8A]"
              >
                {user ? "Dashboard" : "Login"}
              </Button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="mt-20 bg-slate-900 text-slate-200">
        <div className="container mx-auto px-4 py-12 grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] text-white flex items-center justify-center font-bold">N</div>
              <div className="font-bold text-white">{settings?.site_name ?? "Nedelcis School"}</div>
            </div>
            <p className="text-sm text-slate-400">{settings?.about_short ?? "Sekolah modern, berkarakter, dan berprestasi."}</p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3">Navigasi</h4>
            <ul className="space-y-2 text-sm">
              {NAV.slice(0, 5).map((n) => (
                <li key={n.to}><Link to={n.to} className="hover:text-white text-slate-400">{n.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3">Layanan</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/website/berita" className="hover:text-white text-slate-400">Berita</Link></li>
              <li><Link to="/website/galeri" className="hover:text-white text-slate-400">Galeri</Link></li>
              <li><Link to="/daftar-siswa" className="hover:text-white text-slate-400">Pendaftaran Siswa</Link></li>
              <li><Link to="/layanan-publik" className="hover:text-white text-slate-400">Layanan Publik</Link></li>
              <li><Link to="/pengaduan" className="hover:text-white text-slate-400">Pengaduan</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3">Kontak</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              {settings?.address && <li className="flex gap-2"><MapPin className="h-4 w-4 mt-0.5 shrink-0" />{settings.address}</li>}
              {settings?.phone && <li className="flex gap-2"><Phone className="h-4 w-4 mt-0.5 shrink-0" />{settings.phone}</li>}
              {settings?.email && <li className="flex gap-2"><Mail className="h-4 w-4 mt-0.5 shrink-0" />{settings.email}</li>}
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-800 py-4">
          <div className="container mx-auto px-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] text-slate-500">
            <span>© {new Date().getFullYear()} {settings?.site_name ?? "Nedelcis School"}</span>
            <span className="text-slate-700 hidden sm:inline">•</span>
            <span>Dikembangkan oleh: <span className="font-medium text-slate-300">Yusup Jati Gumilar</span></span>
          </div>
        </div>
      </footer>

      {settings && settings.chatbot_enabled !== false && (
        <ChatbotWidget
          botName={settings.chatbot_name || "Asisten Sekolah"}
          welcome={settings.chatbot_welcome || `Halo! Saya asisten virtual ${settings.site_name ?? "sekolah"}. Ada yang bisa saya bantu tentang profil, program, pendaftaran, atau berita?`}
        />
      )}
    </div>
  );
}

