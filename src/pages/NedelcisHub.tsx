import { useEffect, useMemo, useState, memo, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Settings as SettingsIcon, Calendar,
  Clock, Link as LinkIcon, GraduationCap, BookOpen, FileText, Users, Globe,
  Mail, Phone, Video, Image as ImageIcon, Music, Star, Heart, Sparkles,
  Award, Megaphone, Library, Briefcase, MapPin, Shield, Bell, Zap, ArrowUpRight,
  Lock, Hourglass, CheckCircle2, XCircle, Quote,
} from 'lucide-react';
import { AppFooter } from '@/components/AppFooter';

const ICON_MAP: Record<string, any> = {
  Link: LinkIcon, Globe, GraduationCap, BookOpen, FileText, Users, Mail, Phone,
  Video, Image: ImageIcon, Music, Star, Heart, Sparkles, Award, Megaphone,
  Library, Briefcase, MapPin, Shield, Bell, Zap, Calendar,
};
const ICON_OPTIONS = Object.keys(ICON_MAP);

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#f59e0b', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
];

const MOTIVATIONAL_QUOTES = [
  { t: 'Belajar hari ini, memimpin masa depan.', a: 'Nedelcis' },
  { t: 'Pendidikan adalah senjata paling ampuh untuk mengubah dunia.', a: 'Nelson Mandela' },
  { t: 'Kesuksesan adalah hasil dari kerja keras dan disiplin.', a: 'Anonim' },
  { t: 'Tidak ada kata terlambat untuk belajar hal baru.', a: 'Anonim' },
  { t: 'Membaca adalah jendela dunia, ilmu adalah kuncinya.', a: 'Pepatah' },
  { t: 'Jadilah lebih baik dari versi dirimu kemarin.', a: 'Anonim' },
  { t: 'Mimpi besar dimulai dari langkah kecil hari ini.', a: 'Anonim' },
  { t: 'Guru terbaik adalah pengalaman, sekolah terbaik adalah usaha.', a: 'Pepatah' },
  { t: 'Disiplin adalah jembatan antara cita-cita dan pencapaian.', a: 'Jim Rohn' },
  { t: 'Belajar tanpa berpikir sia-sia, berpikir tanpa belajar berbahaya.', a: 'Konfusius' },
  { t: 'Investasi terbaik adalah investasi pada ilmu pengetahuan.', a: 'Benjamin Franklin' },
  { t: 'Setiap ahli pernah menjadi pemula.', a: 'Anonim' },
  // ——— Islamic Quotes ———
  { t: 'Sesungguhnya Allah tidak akan mengubah keadaan suatu kaum hingga mereka mengubah keadaan diri mereka sendiri.', a: 'QS. Ar-Ra\'d: 11' },
  { t: 'Barang siapa yang menempuh jalan untuk mencari ilmu, Allah akan memudahkan baginya jalan ke surga.', a: 'HR. Muslim' },
  { t: 'Tuntutlah ilmu dari buaian sampai ke liang lahat.', a: 'HR. Muslim' },
  { t: 'Ilmu adalah cahaya yang Allah letakkan di hambanya.', a: 'Imam Al-Ghazali' },
  { t: 'Orang berilmu ibarat garam di masakan; sedikit namun memberi rasa pada seluruh hidup.', a: 'Imam Asy-Syafi\'i' },
  { t: 'Wahai anakku, sesungguhnya jika ada sesuatu yang hilang darimu, maka janganlah hilang ilmu.', a: 'Luqman Al-Hakim' },
  { t: 'Bertambahnya ilmu seseorang, bertambah pula kerendahan hatinya.', a: 'Imam Ali bin Abi Thalib' },
  { t: 'Segala sesuatu yang baik dimulai dengan niat yang tulus.', a: 'HR. Bukhari & Muslim' },
  { t: 'Ia yang membaca Al-Quran dan mengamalkannya seperti wangi kayu oud, harumnya tercium di mana-mana.', a: 'HR. Bukhari' },
  { t: 'Janganlah engkau menuntut ilmu untuk berbangga, melainkan untuk bertaqwa kepada Allah.', a: 'Imam Malik' },
  { t: 'Ilmu yang sejati adalah yang diamalkan, bukan sekadar dihafalkan.', a: 'Imam Hasan Al-Banna' },
  { t: 'Jika engkau merasa rendah diri, ingatlah bahwa engkau umat Nabi terakhir dan terbaik.', a: 'Anonim' },
  { t: 'Jadikan hari ini lebih baik dari kemarin, dan besok lebih baik dari hari ini.', a: 'Umar bin Khattab' },
  { t: 'Kesabaran adalah sinar terang di tengah kegelapan.', a: 'Anonim' },
  { t: 'Satu huruf yang kau pelajari lebih baik daripada emas yang kau tumpuk.', a: 'HR. At-Tirmidzi' },
  { t: 'Setiap pagi yang engkau bangun dalam keadaan sehat adalah berkah yang harus disyukuri dengan belajar.', a: 'Anonim' },
  { t: 'Jadilah seperti pohon kurma; tinggi ilmu, rendah sikap, dan penuh manfaat.', a: 'Pepatah Arab' },
  { t: 'Allah tidak memandang bentuk tubuhmu, melainkan hati dan amalmu.', a: 'HR. Muslim' },
  { t: 'Jangan pernah berhenti belajar, karena hidup adalah sekolah yang tak pernah tutup.', a: 'Anonim' },
];

interface HubButton {
  id: string;
  name: string;
  url: string;
  description: string | null;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  schedule_start: string | null;
  schedule_end: string | null;
  open_in_new_tab: boolean;
}

interface HubSettings {
  id?: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  accent_color: string;
}

interface SchoolBranding {
  school_name?: string;
  logo_url?: string;
  right_logo_url?: string;
  district_name?: string;
}

/* ---------- datetime-local helpers (avoid UTC drift) ---------- */
const isoToLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localInputToIso = (v: string): string | null => {
  if (!v) return null;
  return new Date(v).toISOString();
};

/* ---------- Isolated clock component (re-renders alone) ---------- */
const FancyClock = memo(({ accent }: { accent: string }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const [hh, mm, ss] = time.split(':');
  const date = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div
      className="relative overflow-hidden rounded-3xl p-6 md:p-8 text-white shadow-xl"
      style={{ background: `linear-gradient(135deg, ${accent} 0%, hsl(var(--sidebar-background)) 100%)` }}
    >
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
      <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-white/70 uppercase tracking-widest">Waktu Sekarang</p>
            <p className="text-lg font-medium">{date}</p>
          </div>
        </div>
        <div className="flex items-end gap-2 font-mono">
          <span className="text-5xl md:text-7xl font-bold tabular-nums drop-shadow-lg">{hh}</span>
          <span className="text-4xl md:text-6xl opacity-60">:</span>
          <span className="text-5xl md:text-7xl font-bold tabular-nums drop-shadow-lg">{mm}</span>
          <span className="text-2xl md:text-3xl opacity-70 mb-2 tabular-nums">{ss}</span>
        </div>
      </div>
    </div>
  );
});
FancyClock.displayName = 'FancyClock';

/* ---------- Rotating motivational quote ---------- */
const MotivationalQuote = memo(() => {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length));
  useEffect(() => {
    const t = setInterval(() => {
      setIdx((prev) => {
        let n = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
        if (n === prev) n = (n + 1) % MOTIVATIONAL_QUOTES.length;
        return n;
      });
    }, 8000);
    return () => clearInterval(t);
  }, []);
  const q = MOTIVATIONAL_QUOTES[idx];
  return (
    <div
      key={idx}
      className="animate-fade-in glass-effect rounded-2xl px-5 py-4 flex items-start gap-3 border border-border/50"
    >
      <Quote className="w-5 h-5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm md:text-base italic text-foreground/90 leading-relaxed">"{q.t}"</p>
        <p className="text-xs text-muted-foreground mt-1">— {q.a}</p>
      </div>
    </div>
  );
});
MotivationalQuote.displayName = 'MotivationalQuote';

const emptyButton: Omit<HubButton, 'id'> = {
  name: '', url: '', description: '', icon: 'Link', color: '#6366f1',
  sort_order: 0, is_active: true, schedule_start: null, schedule_end: null,
  open_in_new_tab: true,
};

type ButtonStatus = 'inactive' | 'upcoming' | 'active' | 'expired';

const getButtonStatus = (b: HubButton, now: number): ButtonStatus => {
  if (!b.is_active) return 'inactive';
  const start = b.schedule_start ? new Date(b.schedule_start).getTime() : null;
  const end = b.schedule_end ? new Date(b.schedule_end).getTime() : null;
  if (start && now < start) return 'upcoming';
  if (end && now > end) return 'expired';
  return 'active';
};

const fmtDuration = (ms: number) => {
  if (ms <= 0) return '0 detik';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}h ${h}j ${m}m ${sec}d`;
  if (h > 0) return `${h}j ${m}m ${sec}d`;
  if (m > 0) return `${m}m ${sec}d`;
  return `${sec} detik`;
};

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const fmtTimeOnly = (iso: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
};

/* ============ Live Button Card with internal 1s timer ============ */
interface HubButtonCardProps {
  button: HubButton;
  isAdmin: boolean;
  onEdit: (b: HubButton) => void;
  onDelete: (id: string) => void;
}

const HubButtonCard = memo(({ button: b, isAdmin, onEdit, onDelete }: HubButtonCardProps) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const Icon = ICON_MAP[b.icon] || LinkIcon;
  const status = getButtonStatus(b, nowMs);
  const start = b.schedule_start ? new Date(b.schedule_start).getTime() : null;
  const end = b.schedule_end ? new Date(b.schedule_end).getTime() : null;

  let progressLabel: string | null = null;
  let progressValue: number | null = null;
  let progressTone: 'open' | 'close' | 'wait' = 'open';

  if (status === 'upcoming' && start) {
    const remaining = start - nowMs;
    const windowMs = Math.min(7 * 86400 * 1000, Math.max(remaining, 60_000));
    progressValue = Math.max(0, Math.min(100, ((windowMs - remaining) / windowMs) * 100));
    progressLabel = `Dibuka dalam ${fmtDuration(remaining)}`;
    progressTone = 'wait';
  } else if (status === 'active' && end) {
    const total = start ?? (end - 86400 * 1000);
    const span = end - total;
    const elapsed = nowMs - total;
    progressValue = Math.max(0, Math.min(100, (elapsed / span) * 100));
    progressLabel = `Ditutup dalam ${fmtDuration(end - nowMs)}`;
    progressTone = 'close';
  } else if (status === 'active' && !end) {
    progressLabel = 'Aktif tanpa batas waktu';
  }

  const isGray = status === 'upcoming' || status === 'inactive' || status === 'expired';

  const handleClick = () => {
    if (status !== 'active') {
      if (status === 'upcoming') toast.info('Tombol belum aktif. Tunggu hingga waktu pembukaan.');
      else if (status === 'expired') toast.info('Tombol sudah berakhir.');
      else toast.info('Tombol dinonaktifkan.');
      return;
    }
    if (!b.url) return;
    const url = /^https?:\/\//i.test(b.url) ? b.url : `https://${b.url}`;
    if (b.open_in_new_tab) window.open(url, '_blank', 'noopener,noreferrer');
    else window.location.href = url;
  };

  return (
    <Card
      className={`group relative overflow-hidden rounded-2xl border-0 shadow-md transition-all duration-300 ${
        status === 'active' ? 'hover:shadow-2xl hover:-translate-y-1 cursor-pointer' : 'cursor-not-allowed'
      }`}
      onClick={handleClick}
    >
      {isGray ? (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-400 via-slate-500 to-slate-700" />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${b.color} 0%, ${b.color}dd 60%, hsl(var(--sidebar-background)) 140%)` }}
        />
      )}

      <div className="relative p-5 text-white min-h-[220px] flex flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className={`w-12 h-12 rounded-xl backdrop-blur flex items-center justify-center shadow-lg ${isGray ? 'bg-white/15' : 'bg-white/20'}`}>
            {status === 'upcoming' ? <Hourglass className="w-6 h-6" /> :
              status === 'inactive' ? <Lock className="w-6 h-6" /> :
              status === 'expired' ? <XCircle className="w-6 h-6" /> :
              <Icon className="w-6 h-6" />}
          </div>
          <div className="flex items-center gap-1">
            {status === 'active' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/90 px-2 py-1 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Aktif
              </span>
            )}
            {status === 'upcoming' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-amber-500/90 px-2 py-1 rounded-full">
                <Hourglass className="w-3 h-3" /> Belum Aktif
              </span>
            )}
            {status === 'expired' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-rose-500/90 px-2 py-1 rounded-full">
                <XCircle className="w-3 h-3" /> Berakhir
              </span>
            )}
            {status === 'inactive' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-slate-700/90 px-2 py-1 rounded-full">
                <Lock className="w-3 h-3" /> Nonaktif
              </span>
            )}
            {status === 'active' && (
              <ArrowUpRight className="w-5 h-5 opacity-80 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform ml-1" />
            )}
          </div>
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-bold leading-tight">{b.name}</h3>
          {b.description && <p className="text-sm text-white/85 mt-1 line-clamp-2">{b.description}</p>}
        </div>

        {(b.schedule_start || b.schedule_end) && (
          <div className="space-y-1.5 pt-1 border-t border-white/15">
            <div className="flex items-center justify-between text-[11px] text-white/85">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {fmtDateTime(b.schedule_start)}
              </span>
              <span>{fmtDateTime(b.schedule_end)}</span>
            </div>

            {status === 'active' && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-200">
                <Zap className="w-3 h-3" />
                <span>Jam aktif: {fmtTimeOnly(b.schedule_start)} – {fmtTimeOnly(b.schedule_end)}</span>
              </div>
            )}
            {status === 'upcoming' && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-200">
                <Hourglass className="w-3 h-3" />
                <span>Aktif mulai: {fmtTimeOnly(b.schedule_start)}</span>
              </div>
            )}

            {progressValue !== null && (
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-linear ${
                    progressTone === 'close' ? 'bg-emerald-300' : 'bg-amber-300'
                  }`}
                  style={{ width: `${progressValue}%` }}
                />
              </div>
            )}
            {progressLabel && (
              <p className={`text-[11px] font-medium ${status === 'upcoming' ? 'text-amber-200' : 'text-white/90'}`}>
                {progressLabel}
              </p>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="icon" variant="ghost" className="h-7 w-7 bg-black/30 hover:bg-black/50 text-white"
              onClick={(e) => { e.stopPropagation(); onEdit(b); }}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 bg-black/30 hover:bg-red-500/80 text-white"
              onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
});
HubButtonCard.displayName = 'HubButtonCard';

const NedelcisHub = () => {
  const { user, userRole } = useAuth();
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  // Coarse tick (every 30s) — only re-renders parent for status counters/visibility,
  // independent of the 1s clock & card timers so the hero doesn't repaint every second.
  const [coarseTick, setCoarseTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setCoarseTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [settings, setSettings] = useState<HubSettings>({
    title: 'Nedelcis Hub', subtitle: 'Pusat Akses Cepat',
    description: 'Kumpulan tautan penting untuk memudahkan akses berbagai layanan sekolah.',
    accent_color: '#6366f1',
  });
  const [buttons, setButtons] = useState<HubButton[]>([]);
  const [loading, setLoading] = useState(true);

  const [editSettingsOpen, setEditSettingsOpen] = useState(false);
  const [editButtonOpen, setEditButtonOpen] = useState(false);
  const [editingButton, setEditingButton] = useState<HubButton | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showHiddenForAdmin, setShowHiddenForAdmin] = useState(false);
  const [school, setSchool] = useState<SchoolBranding>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: bs }, { data: sch }] = await Promise.all([
      supabase.from('nedelcis_hub_settings' as any).select('*').limit(1).maybeSingle(),
      supabase.from('nedelcis_hub_buttons' as any).select('*').order('sort_order', { ascending: true }),
      supabase.rpc('get_school_settings_for_letterhead' as any),
    ]);
    if (s) setSettings(s as any);
    if (bs) setButtons(bs as any);
    if (sch) setSchool(sch as any);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const { visibleButtons, activeCount, upcomingCount } = useMemo(() => {
    const nowMs = coarseTick;
    let active = 0, upcoming = 0;
    const visible: HubButton[] = [];
    for (const b of buttons) {
      const st = getButtonStatus(b, nowMs);
      if (st === 'active') active++;
      if (st === 'upcoming') upcoming++;
      if (isAdmin && showHiddenForAdmin) visible.push(b);
      else if (st === 'active' || st === 'upcoming') visible.push(b);
    }
    return { visibleButtons: visible, activeCount: active, upcomingCount: upcoming };
  }, [buttons, isAdmin, showHiddenForAdmin, coarseTick]);

  const handleEdit = useCallback((btn: HubButton) => {
    setEditingButton(btn);
    setEditButtonOpen(true);
  }, []);
  const handleDelete = useCallback((id: string) => setDeleteId(id), []);

  const saveSettings = async () => {
    const payload = {
      title: settings.title,
      subtitle: settings.subtitle,
      description: settings.description,
      accent_color: settings.accent_color,
    };
    let res;
    if (settings.id) {
      res = await supabase.from('nedelcis_hub_settings' as any).update(payload).eq('id', settings.id);
    } else {
      res = await supabase.from('nedelcis_hub_settings' as any).insert(payload).select().single();
      if (!res.error && res.data) setSettings(res.data as any);
    }
    if (res.error) toast.error('Gagal menyimpan: ' + res.error.message);
    else { toast.success('Pengaturan tersimpan'); setEditSettingsOpen(false); load(); }
  };

  const saveButton = async () => {
    if (!editingButton) return;
    if (!editingButton.name.trim() || !editingButton.url.trim()) {
      toast.error('Nama dan URL wajib diisi'); return;
    }
    const { id, ...rest } = editingButton;
    const payload = {
      ...rest,
      schedule_start: rest.schedule_start || null,
      schedule_end: rest.schedule_end || null,
    };
    const res = id
      ? await supabase.from('nedelcis_hub_buttons' as any).update(payload).eq('id', id)
      : await supabase.from('nedelcis_hub_buttons' as any).insert(payload);
    if (res.error) toast.error('Gagal menyimpan: ' + res.error.message);
    else { toast.success('Tombol tersimpan'); setEditButtonOpen(false); setEditingButton(null); load(); }
  };

  const deleteButton = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('nedelcis_hub_buttons' as any).delete().eq('id', deleteId);
    if (error) toast.error('Gagal menghapus'); else { toast.success('Tombol dihapus'); load(); }
    setDeleteId(null);
  };

  const openNewButton = () => {
    setEditingButton({ id: '', ...emptyButton, sort_order: buttons.length } as HubButton);
    setEditButtonOpen(true);
  };

  const content = (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Hero — themed with design tokens */}
      <div
        className="relative overflow-hidden rounded-[2rem] p-6 md:p-12 text-white shadow-xl border border-white/10"
        style={{
          background: `linear-gradient(135deg, ${settings.accent_color} 0%, hsl(var(--sidebar-background)) 100%)`,
        }}
      >
        {/* simplified decorative glow (single layer for performance) */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10 blur-3xl pointer-events-none" />

        {(school?.logo_url || school?.right_logo_url) && (
          <div className="relative flex items-center justify-between gap-3 mb-6 md:mb-8">
            <div className="flex items-center gap-3 min-w-0">
              {school?.logo_url && (
                <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/95 p-2 shadow-xl ring-2 ring-white/40 shrink-0">
                  <img
                    src={school.logo_url}
                    alt={school.school_name || 'Logo Sekolah'}
                    className="w-full h-full object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              )}
              {school?.school_name && (
                <div className="min-w-0 hidden sm:block">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/60">
                    {school.district_name || 'Sekolah'}
                  </p>
                  <p className="text-sm md:text-base font-semibold truncate">{school.school_name}</p>
                </div>
              )}
            </div>

            {school?.right_logo_url && (
              <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/95 p-2 shadow-xl ring-2 ring-white/40 shrink-0">
                <img
                  src={school.right_logo_url}
                  alt="Logo Pendamping"
                  className="w-full h-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            )}
          </div>
        )}

        <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur border border-white/20 text-xs font-medium mb-4">
              <Sparkles className="w-3.5 h-3.5" /> {settings.subtitle || 'Pusat Akses Cepat'}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] bg-gradient-to-br from-white via-white to-white/70 bg-clip-text text-transparent">
              {settings.title}
            </h1>
            {settings.description && (
              <p className="mt-4 text-white/80 max-w-2xl leading-relaxed text-sm md:text-base">
                {settings.description}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-300/30 text-xs font-medium backdrop-blur">
                <CheckCircle2 className="w-3.5 h-3.5" /> {activeCount} Aktif
              </span>
              {upcomingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-300/30 text-xs font-medium backdrop-blur">
                  <Hourglass className="w-3.5 h-3.5" /> {upcomingCount} Menunggu
                </span>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setEditSettingsOpen(true)} variant="secondary" className="bg-white/10 text-white hover:bg-white/20 border border-white/20 backdrop-blur">
                <SettingsIcon className="w-4 h-4" /> Edit Halaman
              </Button>
              <Button onClick={openNewButton} className="bg-white text-slate-900 hover:bg-white/90 shadow-lg">
                <Plus className="w-4 h-4" /> Tombol Baru
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Clock */}
      <FancyClock accent={settings.accent_color} />

      {/* Motivational quote — rotates every 8s */}
      <MotivationalQuote />

      {/* Admin toggle */}
      {isAdmin && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Switch checked={showHiddenForAdmin} onCheckedChange={setShowHiddenForAdmin} id="show-hidden" />
          <Label htmlFor="show-hidden" className="cursor-pointer text-muted-foreground">
            Tampilkan tombol tidak aktif / kadaluarsa
          </Label>
        </div>
      )}

      {/* Buttons grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : visibleButtons.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <LinkIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-lg font-semibold">Belum ada tombol</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin ? 'Klik "Tombol Baru" untuk menambahkan akses cepat.' : 'Admin belum menambahkan tombol di Hub ini.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleButtons.map(b => (
            <HubButtonCard
              key={b.id}
              button={b}
              isAdmin={isAdmin}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {!user && (
        <p className="text-center text-xs text-muted-foreground pt-4">
          Halaman publik &middot; Pengelolaan tombol hanya untuk admin yang sudah masuk.
        </p>
      )}
    </div>
  );

  return (
    <>
      {user ? (
        <DashboardLayout>{content}</DashboardLayout>
      ) : (
        <div className="min-h-screen gradient-hero pb-16">
          {content}
          <AppFooter />
        </div>
      )}

      {/* Edit settings dialog */}
      <Dialog open={editSettingsOpen} onOpenChange={setEditSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Halaman Nedelcis Hub</DialogTitle>
            <DialogDescription>Atur judul, deskripsi, dan warna aksen halaman.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Judul</Label><Input value={settings.title} onChange={e => setSettings(s => ({ ...s, title: e.target.value }))} /></div>
            <div><Label>Subjudul</Label><Input value={settings.subtitle || ''} onChange={e => setSettings(s => ({ ...s, subtitle: e.target.value }))} /></div>
            <div><Label>Deskripsi</Label><Textarea rows={3} value={settings.description || ''} onChange={e => setSettings(s => ({ ...s, description: e.target.value }))} /></div>
            <div>
              <Label>Warna Aksen</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={settings.accent_color} onChange={e => setSettings(s => ({ ...s, accent_color: e.target.value }))} className="h-10 w-14 rounded border cursor-pointer" />
                <div className="flex flex-wrap gap-1">
                  {PRESET_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setSettings(s => ({ ...s, accent_color: c }))}
                      className="w-7 h-7 rounded-full border-2 border-white shadow" style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSettingsOpen(false)}>Batal</Button>
            <Button onClick={saveSettings}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit button dialog */}
      <Dialog open={editButtonOpen} onOpenChange={(o) => { setEditButtonOpen(o); if (!o) setEditingButton(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingButton?.id ? 'Edit Tombol' : 'Tombol Baru'}</DialogTitle>
            <DialogDescription>Atur nama, URL, ikon, warna, dan jadwal tampil.</DialogDescription>
          </DialogHeader>
          {editingButton && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label>Nama Tombol *</Label>
                  <Input value={editingButton.name} onChange={e => setEditingButton({ ...editingButton, name: e.target.value })} />
                </div>
                <div><Label>URL *</Label>
                  <Input placeholder="https://..." value={editingButton.url} onChange={e => setEditingButton({ ...editingButton, url: e.target.value })} />
                </div>
              </div>
              <div><Label>Deskripsi</Label>
                <Textarea rows={2} value={editingButton.description || ''} onChange={e => setEditingButton({ ...editingButton, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ikon</Label>
                  <div className="grid grid-cols-6 gap-1 mt-1 max-h-32 overflow-y-auto p-2 border rounded-md">
                    {ICON_OPTIONS.map(name => {
                      const I = ICON_MAP[name];
                      const active = editingButton.icon === name;
                      return (
                        <button key={name} type="button" onClick={() => setEditingButton({ ...editingButton, icon: name })}
                          className={`p-2 rounded-md flex items-center justify-center hover:bg-accent ${active ? 'bg-primary text-primary-foreground' : ''}`}>
                          <I className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label>Warna</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="color" value={editingButton.color} onChange={e => setEditingButton({ ...editingButton, color: e.target.value })} className="h-10 w-14 rounded border cursor-pointer" />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {PRESET_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setEditingButton({ ...editingButton, color: c })}
                        className="w-6 h-6 rounded-full border-2 border-white shadow" style={{ background: c }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Urutan</Label>
                  <Input type="number" value={editingButton.sort_order} onChange={e => setEditingButton({ ...editingButton, sort_order: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="flex items-end gap-4 pb-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={editingButton.is_active} onCheckedChange={v => setEditingButton({ ...editingButton, is_active: v })} />
                    <Label>Aktif</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={editingButton.open_in_new_tab} onCheckedChange={v => setEditingButton({ ...editingButton, open_in_new_tab: v })} />
                    <Label>Tab baru</Label>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1"><Calendar className="w-3 h-3" />Mulai Tampil</Label>
                  <Input
                    type="datetime-local"
                    className="font-mono"
                    value={isoToLocalInput(editingButton.schedule_start)}
                    onChange={e => setEditingButton({ ...editingButton, schedule_start: localInputToIso(e.target.value) })}
                  />
                  {editingButton.schedule_start && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {fmtDateTime(editingButton.schedule_start)}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="flex items-center gap-1"><Calendar className="w-3 h-3" />Berakhir</Label>
                  <Input
                    type="datetime-local"
                    className="font-mono"
                    value={isoToLocalInput(editingButton.schedule_end)}
                    onChange={e => setEditingButton({ ...editingButton, schedule_end: localInputToIso(e.target.value) })}
                  />
                  {editingButton.schedule_end && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {fmtDateTime(editingButton.schedule_end)}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Kosongkan tanggal jadwal jika ingin tombol selalu tampil saat aktif.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditButtonOpen(false); setEditingButton(null); }}>Batal</Button>
            <Button onClick={saveButton}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus tombol?</AlertDialogTitle>
            <AlertDialogDescription>Tombol akan dihapus permanen dari Nedelcis Hub.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={deleteButton} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default NedelcisHub;
