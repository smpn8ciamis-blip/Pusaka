// src/pages/StudentDashboard.tsx

import { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, BookOpen, AlertTriangle, Bell, Clock, Trophy, Medal,
  TrendingUp, CheckCircle, XCircle, Star, Sparkles, Lock, Eye, EyeOff,
  Phone, Mail, User, Save, Settings, Loader2, History, LogOut,
  MapPin, CalendarDays, Hash, Users, GraduationCap, CreditCard, IdCard,
  UserCircle, Home, Box, BarChart3, ChevronRight, AlertCircle, BadgeCheck,
  Search, Grid3X3, CalendarCheck, Megaphone, Hourglass, ExternalLink, Link2,
  Trash2, X, Upload, CheckCircle2, Wifi, WifiOff,
} from "lucide-react";
import { format, isValid, formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { AcademicYearSelector } from "@/components/AcademicYearSelector";
import { useAcademicYear } from "@/contexts/AcademicYearContext";
import { getMessagingInstance, getToken, onMessage } from "@/integrations/firebase";

import StudentUploadTab from "@/components/dashboard/StudentUploadTab";
import StudentElearningTab from "@/components/dashboard/StudentElearningTab";
import AttendanceTrendChart from "@/components/dashboard/AttendanceTrendChart";
import AttendanceLogList from "@/components/dashboard/AttendanceLogList";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AttendanceSummary {
  total: number;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
}

interface AttendanceLog {
  id: string;
  date: string;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  source: 'rfid' | 'manual';
  notes: string | null;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string | null;
  type: string;
  is_read: boolean;
  created_at: string;
  metadata?: { status?: string; source?: string };
}

interface HeroNews {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  website_news_categories?: { name: string } | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const safeFormatDate = (date: any, fmt: string, fallback = '-'): string => {
  if (!date) return fallback;
  const d = new Date(date);
  return isValid(d) ? format(d, fmt, { locale: localeId }) : fallback;
};

const safeFormatTime = (date: any, fallback = '-'): string => {
  if (!date) return fallback;
  const d = new Date(date);
  return isValid(d) ? format(d, 'HH:mm', { locale: localeId }) : fallback;
};

const calcPercent = (value: number, total: number): number => {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
};

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Palet: biru tinta seragam + kuning kapur sebagai satu-satunya aksen
const INK = 'bg-gradient-to-br from-[#1E6FE0] via-[#2F7FE8] to-[#4F97F2]';
const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const toMinutes = (t?: string | null): number | null => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const greetingFor = (d: Date) => {
  const h = d.getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
};

type LessonState =
  | { kind: 'none' }
  | { kind: 'done'; count: number }
  | { kind: 'now'; lesson: any; elapsed: number; total: number; minsLeft: number; next?: any }
  | { kind: 'next'; lesson: any; minsUntil: number };

/** Tentukan pelajaran yang sedang berlangsung / berikutnya dari jadwal hari ini. */
const resolveLesson = (schedules: any[] | undefined, now: Date): LessonState => {
  if (!schedules || schedules.length === 0) return { kind: 'none' };
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const sorted = [...schedules].sort((a, b) => (toMinutes(a.start_time) ?? 0) - (toMinutes(b.start_time) ?? 0));
  for (let i = 0; i < sorted.length; i++) {
    const st = toMinutes(sorted[i].start_time);
    const en = toMinutes(sorted[i].end_time);
    if (st == null || en == null) continue;
    if (nowMin >= st && nowMin < en) {
      return { kind: 'now', lesson: sorted[i], elapsed: nowMin - st, total: en - st, minsLeft: Math.ceil(en - nowMin), next: sorted[i + 1] };
    }
    if (nowMin < st) return { kind: 'next', lesson: sorted[i], minsUntil: Math.ceil(st - nowMin) };
  }
  return { kind: 'done', count: sorted.length };
};

const humanMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} jam ${m % 60 ? `${m % 60} menit` : ''}`.trim() : `${m} menit`);

// ═══════════════════════════════════════════════════════════════════════════
// SMALL REUSABLE COMPONENTS (memoized)
// ═══════════════════════════════════════════════════════════════════════════

const EmptyState = memo(({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) => (
  <div className="text-center py-12">
    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
      <Icon className="h-8 w-8 text-gray-400" />
    </div>
    <p className="text-base font-medium text-gray-800 dark:text-gray-100">{title}</p>
    {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
  </div>
));
EmptyState.displayName = 'EmptyState';

/** Kartu melayang di bawah hero: pelajaran berlangsung/berikutnya + tiga aksi cepat. */
const CurrentLessonCard = memo(({ state, onOpenSchedule, actions }: {
  state: LessonState;
  onOpenSchedule: () => void;
  actions: { label: string; icon: any; onClick: () => void }[];
}) => {
  const teacher = (l: any) => l?.teachers?.profiles?.full_name || '';
  let label = 'Jadwal hari ini';
  let title = 'Tidak ada pelajaran';
  let meta = 'Nikmati harimu.';
  let progress: number | null = null;

  if (state.kind === 'now') {
    label = 'Sedang berlangsung';
    title = state.lesson.subject;
    meta = [teacher(state.lesson), `sisa ${humanMinutes(state.minsLeft)}`].filter(Boolean).join(' · ');
    progress = Math.min(100, Math.max(0, (state.elapsed / state.total) * 100));
  } else if (state.kind === 'next') {
    label = 'Berikutnya';
    title = state.lesson.subject;
    meta = [`${state.lesson.start_time?.slice(0, 5)}`, `mulai ${humanMinutes(state.minsUntil)} lagi`].join(' · ');
  } else if (state.kind === 'done') {
    title = 'Semua pelajaran selesai';
    meta = `${state.count} mapel hari ini sudah dilewati.`;
  }

  return (
    <div className="relative z-10 -mt-16 rounded-3xl bg-white dark:bg-slate-900 p-4 shadow-[0_10px_30px_-12px_rgba(30,111,224,0.45)] border border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSchedule}
          className="flex min-w-0 flex-1 items-center gap-3 text-left rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E1F0FF] text-[#1E6FE0]">
            <Clock className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1E6FE0]">
              {state.kind === 'now' && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full rounded-full bg-[#1E6FE0] opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#1E6FE0]" /></span>}
              {label}
            </span>
            <span className="block truncate text-base font-bold text-slate-900 dark:text-white leading-tight">{title}</span>
            <span className="block truncate text-xs text-slate-500">{meta}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-start gap-3">
          {actions.map((ac) => (
            <button key={ac.label} onClick={ac.onClick}
              className="flex flex-col items-center gap-1 text-[#1E6FE0] rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0]">
              <ac.icon className="h-6 w-6" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100">{ac.label}</span>
            </button>
          ))}
        </div>
      </div>
      {progress !== null && (
        <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[#1E6FE0] transition-[width] duration-1000" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
});
CurrentLessonCard.displayName = 'CurrentLessonCard';

const LoadingState = memo(({ label = 'Memuat...' }: { label?: string }) => (
  <div className="flex flex-col items-center justify-center py-12 gap-3">
    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
    <p className="text-sm text-gray-400">{label}</p>
  </div>
));
LoadingState.displayName = 'LoadingState';

const AttendanceBar = memo(({ summary }: { summary: AttendanceSummary | null }) => {
  const s = summary || { total: 0, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0 };
  const p = {
    hadir: calcPercent(s.hadir, s.total),
    izin: calcPercent(s.izin, s.total),
    sakit: calcPercent(s.sakit, s.total),
    alpa: calcPercent(s.alpa, s.total),
  };
  return (
    <>
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${p.hadir}%` }} />
        <div className="bg-blue-500 h-full transition-all" style={{ width: `${p.izin}%` }} />
        <div className="bg-amber-500 h-full transition-all" style={{ width: `${p.sakit}%` }} />
        <div className="bg-red-500 h-full transition-all" style={{ width: `${p.alpa}%` }} />
      </div>
      <div className="grid grid-cols-5 gap-2 text-center mt-3">
        {[
          { label: 'Hadir', value: s.hadir, color: 'bg-emerald-500' },
          { label: 'Izin', value: s.izin, color: 'bg-blue-500' },
          { label: 'Sakit', value: s.sakit, color: 'bg-amber-500' },
          { label: 'Alpa', value: s.alpa, color: 'bg-red-500' },
          { label: 'Telat', value: s.terlambat, color: 'bg-orange-500' },
        ].map((item) => (
          <div key={item.label}>
            <div className={`w-2.5 h-2.5 rounded-full ${item.color} inline-block`} />
            <p className="text-xs text-gray-500 mt-1">{item.label}</p>
            <p className="font-bold text-gray-800 dark:text-gray-100">{item.value}</p>
          </div>
        ))}
      </div>
    </>
  );
});
AttendanceBar.displayName = 'AttendanceBar';

const LogoutModal = memo(({ open, loading, onConfirm, onCancel }: {
  open: boolean; loading: boolean; onConfirm: () => void; onCancel: () => void;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <LogOut className="h-8 w-8 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Keluar dari Akun?</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Anda akan keluar dari sesi ini.
          </p>
          <div className="w-full space-y-3">
            <button onClick={onConfirm} disabled={loading}
              className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
              Ya, Keluar
            </button>
            <button onClick={onCancel} disabled={loading}
              className="w-full py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold transition-colors">
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
LogoutModal.displayName = 'LogoutModal';

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/** Live clock — hanya update internal, tidak re-render parent */
function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

/** FCM setup dengan cleanup yang benar */
function useFCM(studentId?: string) {
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const messaging = await getMessagingInstance();
        if (!messaging || cancelled) return;

        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        });
        if (cancelled) return;

        if (token) {
          await supabase.from('push_tokens').upsert(
            { student_id: studentId, fcm_token: token, updated_at: new Date().toISOString() },
            { onConflict: 'student_id' }
          );
        }

        const unsub = onMessage(messaging, (payload) => {
          const { title, body } = payload.notification || {};
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(title || 'Notifikasi', { body });
          }
        });
        unsubscribe = unsub;
      } catch (err) {
        if (import.meta.env.DEV) console.error('FCM error:', err);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [studentId]);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const StudentDashboardPage = () => {
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const activeTab = searchParams.get('tab') || 'overview';
  const liveClock = useLiveClock();

  const [showData, setShowData] = useState(true);
  const [showAllMenu, setShowAllMenu] = useState(false);
  const navigate = useNavigate();
  const [newsIdx, setNewsIdx] = useState(0);
  const touchX = useRef<number | null>(null);

  // Berita terbaru dari web sekolah (hanya yang terbit & punya gambar sampul)
  const { data: heroNews = [] } = useQuery({
    queryKey: ['student-hero-news'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<HeroNews[]> => {
      const { data, error } = await supabase
        .from('website_news')
        .select('id, title, slug, excerpt, cover_image_url, published_at, website_news_categories(name)')
        .eq('status', 'published')
        .not('cover_image_url', 'is', null)
        .order('published_at', { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as unknown as HeroNews[];
    },
  });
  const heroSlides = heroNews.slice(0, 5);

  // Ganti slide otomatis; berhenti saat tab tidak terlihat; hitung ulang tiap pergantian
  useEffect(() => {
    if (heroSlides.length < 2) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') setNewsIdx((i) => (i + 1) % heroSlides.length);
    }, 6500);
    return () => clearInterval(t);
  }, [heroSlides.length, newsIdx]);

  // Muat gambar slide berikutnya lebih dulu agar transisi mulus
  useEffect(() => {
    if (heroSlides.length < 2) return;
    const nxt = heroSlides[(newsIdx + 1) % heroSlides.length]?.cover_image_url;
    if (nxt) { const im = new Image(); im.src = nxt; }
  }, [newsIdx, heroSlides]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '', newPassword: '', confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const { selectedYear, selectedSemester } = useAcademicYear();

  // ─── Request notification permission once ──────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ─── Queries ───────────────────────────────────────────────────────────
  const { data: studentAccount, isLoading: accountLoading } = useQuery({
    queryKey: ['student-account', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('student_accounts')
        .select('*, students(*)')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const studentId = studentAccount?.student_id;
  const classId = studentAccount?.students?.class_id;
  const schoolId = (studentAccount as any)?.school_id ?? (studentAccount as any)?.students?.school_id ?? null;

  // Pengaturan sekolah: dibatasi ke sekolah siswa (bila diketahui), ambil satu baris saja
  const { data: schoolSetting } = useQuery({
    queryKey: ['school_settings', schoolId],
    enabled: !!studentAccount,
    queryFn: async () => {
      let q = supabase.from('school_settings').select('*');
      if (schoolId) q = q.eq('school_id', schoolId);
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });

  // ─── FCM ───────────────────────────────────────────────────────────────
  useFCM(studentId);

  // ─── Tab-aware queries (enabled hanya saat tab aktif) ─────────────────
  const { data: classInfo } = useQuery({
    queryKey: ['student-class', classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('*, teachers(*, profiles:profiles_public(full_name))')
        .eq('id', classId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!classId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: todaySchedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['student-schedules-today', classId, selectedYear, selectedSemester],
    queryFn: async () => {
      // Di tabel jadwal Minggu = 7 (getDay() mengembalikan 0)
      const jsDay = new Date().getDay();
      const today = jsDay === 0 ? 7 : jsDay;
      let q = supabase
        .from('schedules')
        .select('*, teachers(*, profiles:profiles_public(full_name))')
        .eq('class_id', classId!)
        .eq('is_active', true)
        .eq('day_of_week', today);
      if (selectedYear) q = q.eq('academic_year', selectedYear).eq('semester', selectedSemester);
      const { data, error } = await q.order('start_time');
      if (error) throw error;
      return data || [];
    },
    enabled: !!classId && !!selectedYear,
    staleTime: 2 * 60 * 1000,
  });

  // ─── UNIFIED attendance summary (RFID + Manual) ───────────────────────
  const { data: attendanceSummary, isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance-summary-unified', studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_student_attendance_summary', {
        p_student_id: studentId!,
      });
      if (error) throw error;
      return data as AttendanceSummary;
    },
    enabled: !!studentId,
    staleTime: 60 * 1000,
  });

  // ─── UNIFIED attendance logs (RFID + Manual) ──────────────────────────
  const { data: attendanceLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['attendance-logs-unified', studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_student_attendance_logs', {
        p_student_id: studentId!,
        p_limit: 250,
      });
      if (error) throw error;
      return (data || []) as AttendanceLog[];
    },
    enabled: !!studentId && (activeTab === 'attendance' || activeTab === 'overview'),
    staleTime: 60 * 1000,
  });

  // ─── Notifications (from NEW table) ────────────────────────────────────
  const { data: notifications = [], refetch: refetchNotifications } = useQuery({
    queryKey: ['student-notifications', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_notifications')
        .select('*')
        .eq('student_id', studentId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as NotificationItem[];
    },
    enabled: !!studentId,
    staleTime: 30 * 1000,
  });

  // ─── Tab-aware queries ─────────────────────────────────────────────────
  const { data: violations } = useQuery({
    queryKey: ['student-violations', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_violations')
        .select('*, violation_types(*)')
        .eq('student_id', studentId!)
        .order('violation_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!studentId && (activeTab === 'violations' || activeTab === 'overview'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: achievements } = useQuery({
    queryKey: ['student-achievements', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_achievements')
        .select('*')
        .eq('student_id', studentId!)
        .order('achievement_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!studentId && (activeTab === 'achievements' || activeTab === 'overview'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: allGrades, isLoading: gradesLoading } = useQuery({
    queryKey: ['student-grades', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grades')
        .select('*, schedules(subject, academic_year, semester, teachers(*, profiles:profiles_public(full_name)))')
        .eq('student_id', studentId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!studentId && (activeTab === 'grades' || activeTab === 'overview'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: announcements } = useQuery({
    queryKey: ['student-announcements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .in('target_audience', ['semua', 'siswa'])
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: activeTab === 'announcements',
    staleTime: 5 * 60 * 1000,
  });

  const { data: dispensations } = useQuery({
    queryKey: ['student-dispensations', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_dispensations')
        .select('*')
        .eq('student_id', studentId!)
        .order('dispensation_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!studentId && activeTab === 'dispensasi',
    staleTime: 5 * 60 * 1000,
  });

  // ─── Realtime notifications ────────────────────────────────────────────
  useEffect(() => {
    if (!studentId) return;
    const channel = supabase
      .channel(`notif-${studentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'student_notifications',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          const newRow = payload.new as NotificationItem;
          queryClient.setQueryData(
            ['student-notifications', studentId],
            (old: NotificationItem[] = []) => [newRow, ...old]
          );
          queryClient.invalidateQueries({ queryKey: ['attendance-summary-unified', studentId] });
          queryClient.invalidateQueries({ queryKey: ['attendance-logs-unified', studentId] });

          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(newRow.title, {
                body: newRow.message || '',
                icon: schoolSetting?.right_logo_url || '/favicon.ico',
              });
            } catch { /* silent */ }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [studentId, queryClient, schoolSetting?.right_logo_url]);

  // ─── Close on outside click ────────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showNotifications && !target.closest('[data-notif-panel]') && !target.closest('[data-notif-btn]')) {
        setShowNotifications(false);
      }
      if (showSearchSuggestions && !target.closest('[data-search-panel]') && !target.closest('[data-search-input]')) {
        setShowSearchSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications, showSearchSuggestions]);

  // ─── Computed (memoized) ───────────────────────────────────────────────
  const totalViolationPoints = useMemo(
    () => violations?.reduce((sum, v: any) => sum + (v.points || 0), 0) || 0,
    [violations]
  );

  // Nilai dibatasi ke tahun ajaran & semester yang dipilih
  const grades = useMemo(() => {
    if (!allGrades) return allGrades;
    if (!selectedYear) return allGrades;
    return allGrades.filter((g: any) => {
      const sc = g.schedules;
      if (!sc || !sc.academic_year) return true;
      return sc.academic_year === selectedYear && Number(sc.semester) === Number(selectedSemester);
    });
  }, [allGrades, selectedYear, selectedSemester]);

  const averageGrade = useMemo(() => {
    if (!grades?.length) return null;
    const valid = grades.filter((g: any) => typeof g.final_grade === 'number');
    if (!valid.length) return null;
    return (valid.reduce((sum: number, g: any) => sum + g.final_grade, 0) / valid.length).toFixed(1);
  }, [grades]);

  const attendancePercentage = useMemo(
    () => calcPercent(attendanceSummary?.hadir || 0, attendanceSummary?.total || 0),
    [attendanceSummary]
  );

  // ─── Handlers ──────────────────────────────────────────────────────────
  const handleTabChange = useCallback((tab: string) => {
    setSearchParams({ tab });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setSearchParams]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const markNotificationsRead = useCallback(async (ids?: string[]) => {
    if (!studentId) return;
    const target = ids ?? notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (target.length === 0) return;
    // Optimis: tandai di cache dulu
    queryClient.setQueryData(
      ['student-notifications', studentId],
      (old: NotificationItem[] = []) => old.map((n) => (target.includes(n.id) ? { ...n, is_read: true } : n))
    );
    const { error } = await (supabase as any).rpc('mark_my_notifications_read', { _ids: target });
    if (error) refetchNotifications();
  }, [studentId, notifications, queryClient, refetchNotifications]);

  const handleDeleteNotification = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('student_notifications')   // ✅ TABEL YANG BENAR
        .delete()
        .eq('id', id);
      if (error) throw error;
      queryClient.setQueryData(
        ['student-notifications', studentId],
        (old: NotificationItem[] = []) => old.filter((n) => n.id !== id)
      );
      toast({ title: 'Berhasil', description: 'Notifikasi dihapus' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.message });
    }
  }, [studentId, queryClient, toast]);

  const handleDeleteAllNotifications = useCallback(async () => {
    if (!studentId) return;
    try {
      const { error } = await supabase
        .from('student_notifications')
        .delete()
        .eq('student_id', studentId);
      if (error) throw error;
      queryClient.setQueryData(['student-notifications', studentId], []);
      toast({ title: 'Berhasil', description: 'Semua notifikasi dihapus' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.message });
    } finally {
      setDeleteAllConfirm(false);
    }
  }, [studentId, queryClient, toast]);

  const handleLogoutConfirm = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
    } catch {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Terjadi kesalahan saat logout' });
    } finally {
      setIsLoggingOut(false);
    }
  }, [signOut, toast]);

  const handleChangePassword = useCallback(async () => {
    const { currentPassword, newPassword, confirmPassword } = passwordForm;
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Semua field wajib diisi' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Password minimal 6 karakter' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Konfirmasi tidak cocok' });
      return;
    }
    if (!user?.email) {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Email tidak ditemukan' });
      return;
    }

    setPasswordLoading(true);
    try {
      // Re-auth TANPA mengubah session
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (authError) throw new Error('Password lama salah');

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      toast({ title: 'Berhasil', description: 'Password berhasil diperbarui.' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.message });
    } finally {
      setPasswordLoading(false);
    }
  }, [passwordForm, user?.email, toast]);

  // ─── Shortcut menus ────────────────────────────────────────────────────
  const shortcutMenus = useMemo(() => [
    { tab: 'schedule', label: 'Jadwal', icon: Calendar, color: 'bg-blue-500' },
    { tab: 'grades', label: 'Nilai', icon: BookOpen, color: 'bg-emerald-500' },
    { tab: 'elearning', label: 'E-Learning', icon: GraduationCap, color: 'bg-sky-500' },
    { tab: 'attendance', label: 'Absensi', icon: CalendarCheck, color: 'bg-amber-500' },
    { tab: 'violations', label: 'Pelanggaran', icon: AlertTriangle, color: 'bg-red-500' },
    { tab: 'achievements', label: 'Prestasi', icon: Trophy, color: 'bg-purple-500' },
    { tab: 'announcements', label: 'Pengumuman', icon: Megaphone, color: 'bg-indigo-500' },
    { tab: 'dispensasi', label: 'Dispensasi', icon: Hourglass, color: 'bg-cyan-500' },
    { tab: 'uploads', label: 'Upload Berkas', icon: Upload, color: 'bg-emerald-500' },
    { tab: 'settings', label: 'Pengaturan', icon: Settings, color: 'bg-slate-500' },
    { tab: 'profile', label: 'Profil Saya', icon: UserCircle, color: 'bg-pink-500' },
    { url: '/cbt-student', label: 'CBT Student', icon: ExternalLink, color: 'bg-teal-500', isExternal: true },
    { url: '/nedelcis-hub', label: 'Nedelcis Hub', icon: Link2, color: 'bg-violet-500', isExternal: true },
  ], []);

  const filteredSuggestions = useMemo(() => {
    if (searchQuery.length < 3) return [];
    const q = searchQuery.toLowerCase();
    return shortcutMenus.filter((m) => m.label.toLowerCase().includes(q));
  }, [searchQuery, shortcutMenus]);

  // ─── Loading state ─────────────────────────────────────────────────────
  if (accountLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1E6FE0]">
        <div className="flex flex-col items-center gap-4 text-white">
          <Loader2 className="h-10 w-10 animate-spin" />
          <span className="text-base">Memuat data...</span>
        </div>
      </div>
    );
  }

  const student = studentAccount?.students;

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER TABS
  // ═════════════════════════════════════════════════════════════════════════

  const renderOverview = () => {
    const lesson = resolveLesson(todaySchedules, liveClock);
    const nowMin = liveClock.getHours() * 60 + liveClock.getMinutes();

    // Warna pastel per menu + lencana angka (sesuai data yang sudah ada)
    const PASTEL: Record<string, { tile: string; icon: string }> = {
      schedule: { tile: 'bg-[#E1F0FF]', icon: 'text-[#1E6FE0]' },
      grades: { tile: 'bg-[#E3F6E8]', icon: 'text-emerald-600' },
      elearning: { tile: 'bg-[#E0F4FA]', icon: 'text-cyan-600' },
      attendance: { tile: 'bg-[#FFF3D1]', icon: 'text-amber-600' },
      violations: { tile: 'bg-[#FDE7EA]', icon: 'text-rose-600' },
      achievements: { tile: 'bg-[#EEE5FA]', icon: 'text-violet-600' },
      announcements: { tile: 'bg-[#E4E8FB]', icon: 'text-indigo-600' },
      dispensasi: { tile: 'bg-[#DDF3F1]', icon: 'text-teal-600' },
      uploads: { tile: 'bg-[#E3F6E8]', icon: 'text-emerald-600' },
      settings: { tile: 'bg-[#EFEFF2]', icon: 'text-slate-600' },
      profile: { tile: 'bg-[#FCE6F1]', icon: 'text-pink-600' },
    };
    const badgeFor = (m: any): string | null => {
      if (!showData) return null;
      switch (m.tab) {
        case 'schedule': return `${todaySchedules?.length || 0} Mapel`;
        case 'grades': return `${grades?.length || 0} Nilai`;
        case 'attendance': return `${attendancePercentage}%`;
        case 'violations': return `${totalViolationPoints} Poin`;
        case 'achievements': return `${achievements?.length || 0} Prestasi`;
        default: return null;
      }
    };
    const FALLBACK = { tile: 'bg-[#E1F0FF]', icon: 'text-[#1E6FE0]' };
    const VISIBLE = 7;
    const menusShown = showAllMenu ? shortcutMenus : shortcutMenus.slice(0, VISIBLE);

    const stats = [
      { label: 'Kehadiran', value: showData ? `${attendancePercentage}%` : '•••', unit: 'Hari ini ' + (showData ? `${attendanceSummary?.hadir || 0}/${attendanceSummary?.total || 0}` : '•••'), tab: 'attendance', icon: CalendarCheck, grad: 'from-[#CFE6FF] to-[#E9F3FF]' },
      { label: 'Rata-rata Nilai', value: showData ? (averageGrade ?? '-') : '•••', unit: showData ? `${grades?.length || 0} Mapel` : '•••', tab: 'grades', icon: BookOpen, grad: 'from-[#CDEFD6] to-[#E8F7EC]' },
      { label: 'Poin Pelanggaran', value: showData ? totalViolationPoints : '•••', unit: showData ? `${violations?.length || 0} Catatan` : '•••', tab: 'violations', icon: AlertTriangle, grad: 'from-[#FFE2C2] to-[#FFF1E0]' },
      { label: 'Prestasi', value: showData ? (achievements?.length || 0) : '•••', unit: 'Penghargaan', tab: 'achievements', icon: Trophy, grad: 'from-[#E4D6F8] to-[#F2EBFC]' },
    ];

    return (
      <div className="space-y-6 px-4 pb-4">
        <CurrentLessonCard
          state={lesson}
          onOpenSchedule={() => handleTabChange('schedule')}
          actions={[
            { label: 'Jadwal', icon: Calendar, onClick: () => handleTabChange('schedule') },
            { label: 'Nilai', icon: BookOpen, onClick: () => handleTabChange('grades') },
            { label: 'Belajar', icon: GraduationCap, onClick: () => handleTabChange('elearning') },
          ]}
        />

        {/* Layanan Cepat */}
        <section aria-label="Layanan cepat">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white mb-4">Layanan Cepat</h2>
          <div className="grid grid-cols-4 gap-x-3 gap-y-5">
            {menusShown.map((menu: any) => {
              const pal = PASTEL[menu.tab as string] ?? FALLBACK;
              const badge = badgeFor(menu);
              return (
                <button
                  key={menu.label}
                  onClick={() => menu.isExternal ? (window.location.href = menu.url!) : handleTabChange(menu.tab!)}
                  className="group flex flex-col items-center gap-2 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0] active:scale-95 transition-transform"
                >
                  <span className={`relative flex aspect-square w-full items-center justify-center rounded-[1.75rem] ${pal.tile}`}>
                    {badge && (
                      <span className="absolute -top-1.5 -left-1.5 max-w-[calc(100%+0.5rem)] truncate rounded-full bg-slate-800/85 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                        {badge}
                      </span>
                    )}
                    <menu.icon className={`h-8 w-8 ${pal.icon}`} strokeWidth={1.75} />
                  </span>
                  <span className="text-[12.5px] font-medium leading-tight text-slate-700 dark:text-slate-200 text-center">{menu.label}</span>
                </button>
              );
            })}
            {!showAllMenu && shortcutMenus.length > VISIBLE && (
              <button
                onClick={() => setShowAllMenu(true)}
                className="flex flex-col items-center gap-2 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0] active:scale-95 transition-transform"
              >
                <span className="relative flex aspect-square w-full items-center justify-center rounded-[1.75rem] bg-[#EFEFF2] dark:bg-slate-800">
                  <span className="absolute -top-1.5 -left-1.5 rounded-full bg-slate-800/85 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                    {shortcutMenus.length - VISIBLE} lagi
                  </span>
                  <Grid3X3 className="h-8 w-8 text-slate-500" strokeWidth={1.75} />
                </span>
                <span className="text-[13px] font-medium leading-tight text-slate-800 dark:text-slate-200">Semua</span>
              </button>
            )}
          </div>
          {showAllMenu && (
            <button onClick={() => setShowAllMenu(false)} className="mt-4 mx-auto block text-xs font-semibold text-[#1E6FE0]">
              Tampilkan lebih sedikit
            </button>
          )}
        </section>

        {/* Berita terbaru dari web sekolah */}
        {heroNews.length > 0 && (
          <section aria-label="Berita sekolah">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Berita Sekolah</h2>
              <button onClick={() => navigate('/website/berita')} className="text-sm font-medium text-[#1E6FE0] flex items-center gap-0.5">
                Lihat semua <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {heroNews.map((n) => (
                <button
                  key={n.id}
                  onClick={() => navigate(`/website/berita/${n.slug}`)}
                  className="group snap-start shrink-0 w-64 overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-left shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0]"
                >
                  <div className="aspect-[16/9] overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <img src={n.cover_image_url!} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  </div>
                  <div className="p-3.5">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">{n.title}</p>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {n.website_news_categories?.name ? `${n.website_news_categories.name} · ` : ''}
                      {n.published_at ? formatDistanceToNow(new Date(n.published_at), { addSuffix: true, locale: localeId }) : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Statistik */}
        <section aria-label="Statistik saya">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Statistik Saya</h2>
            <button
              onClick={() => setShowData((v) => !v)}
              className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0]"
              aria-label={showData ? 'Sembunyikan angka' : 'Tampilkan angka'}
            >
              {showData ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {showData ? 'Sembunyikan' : 'Tampilkan'}
            </button>
          </div>
          <div className="mb-3"><AcademicYearSelector /></div>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {stats.map((st) => (
              <button
                key={st.label}
                onClick={() => handleTabChange(st.tab)}
                className={`snap-start shrink-0 w-[9.5rem] rounded-3xl bg-gradient-to-br ${st.grad} p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0] active:scale-[0.98] transition-transform`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">
                  <st.icon className="h-5 w-5 text-slate-600" />
                </span>
                <p className="mt-6 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{st.value}</p>
                <p className="text-sm text-slate-600">{st.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{st.unit}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Jadwal hari ini */}
        <section aria-label="Jadwal hari ini">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Jadwal Hari Ini</h2>
            <button onClick={() => handleTabChange('schedule')} className="text-sm font-semibold text-[#1E6FE0] flex items-center gap-0.5">
              Lihat semua <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
            <p className="mb-3 text-xs text-slate-500">{DAY_NAMES[liveClock.getDay()]}, {safeFormatDate(liveClock, 'd MMMM yyyy')}</p>
            {schedulesLoading ? <LoadingState /> : todaySchedules && todaySchedules.length > 0 ? (
              <ol className="relative">
                {todaySchedules.map((sc: any, idx: number) => {
                  const st = toMinutes(sc.start_time);
                  const en = toMinutes(sc.end_time);
                  const isNow = st != null && en != null && nowMin >= st && nowMin < en;
                  const isPast = en != null && nowMin >= en;
                  const last = idx === todaySchedules.length - 1;
                  return (
                    <li key={sc.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {!last && <span className="absolute left-[4.6rem] top-4 bottom-0 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />}
                      <div className="w-14 shrink-0 text-right tabular-nums">
                        <p className={`text-sm font-bold ${isPast ? 'text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>{sc.start_time?.slice(0, 5)}</p>
                        <p className="text-xs text-slate-400">{sc.end_time?.slice(0, 5)}</p>
                      </div>
                      <span className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${isNow ? 'bg-[#1E6FE0] border-[#1E6FE0]' : isPast ? 'bg-slate-200 border-slate-200 dark:bg-slate-700 dark:border-slate-700' : 'bg-white border-[#1E6FE0] dark:bg-slate-900'}`} />
                      <div className={`min-w-0 flex-1 ${isPast ? 'opacity-50' : ''}`}>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{sc.subject}</p>
                        <p className="text-xs text-slate-500 truncate">{sc.teachers?.profiles?.full_name}</p>
                      </div>
                      {isNow && <span className="self-start rounded-full bg-[#E1F0FF] px-2 py-0.5 text-[11px] font-semibold text-[#1E6FE0]">Sekarang</span>}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState icon={Calendar} title="Tidak ada jadwal hari ini" />
            )}
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Kehadiran</h3>
            <Badge variant="outline" className="text-[10px]">RFID + Manual</Badge>
          </div>
          {attendanceLoading ? <LoadingState /> : <AttendanceBar summary={attendanceSummary || null} />}
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Riwayat absensi terbaru</h3>
          <AttendanceLogList
            logs={attendanceLogs}
            loading={logsLoading}
            limit={5}
            onSeeAll={() => handleTabChange('attendance')}
          />
        </section>
      </div>
    );
  };

  const renderProfileTab = () => {
    const items = [
      { icon: Hash, label: 'NIS', value: student?.nis || '-', color: 'bg-blue-100 text-blue-600' },
      { icon: Hash, label: 'NISN', value: student?.nisn || '-', color: 'bg-purple-100 text-purple-600' },
      { icon: GraduationCap, label: 'Kelas', value: classInfo?.name || '-', color: 'bg-green-100 text-green-600' },
      { icon: Users, label: 'Wali Kelas', value: classInfo?.teachers?.profiles?.full_name || '-', color: 'bg-yellow-100 text-yellow-600' },
      { icon: User, label: 'Jenis Kelamin', value: student?.gender ? (student.gender === 'L' ? 'Laki-laki' : 'Perempuan') : '-', color: 'bg-blue-100 text-blue-600' },
      { icon: CalendarDays, label: 'Tanggal Lahir', value: student?.birth_date ? safeFormatDate(student.birth_date, 'dd MMMM yyyy') : '-', color: 'bg-purple-100 text-purple-600' },
      { icon: MapPin, label: 'Tempat Lahir', value: student?.birth_place || '-', color: 'bg-green-100 text-green-600' },
      { icon: MapPin, label: 'Alamat', value: student?.address || '-', color: 'bg-yellow-100 text-yellow-600', multiline: true },
      { icon: UserCircle, label: 'Orang Tua', value: student?.parent_name || '-', color: 'bg-blue-100 text-blue-600' },
      { icon: Phone, label: 'No. HP', value: student?.parent_phone ? `+${student.parent_phone}` : '-', color: 'bg-green-100 text-green-600' },
      { icon: IdCard, label: 'Status', value: student?.status === 'active' ? 'Aktif' : (student?.status || 'Aktif'), color: 'bg-purple-100 text-purple-600' },
      { icon: CreditCard, label: 'RFID UID', value: student?.rfid_uid || 'Belum terdaftar', color: 'bg-yellow-100 text-yellow-600' },
    ];

    return (
      <div className="space-y-4 p-4">
        <div className="bg-[#1E6FE0] rounded-2xl p-5 text-white shadow-sm">
          <div className="flex items-center gap-4">
            {student?.photo_url ? (
              <img src={student.photo_url} alt="Foto" className="w-16 h-16 rounded-full object-cover border-4 border-white/30" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold border-4 border-white/30">
                {student?.full_name?.charAt(0) || 'S'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">{student?.full_name || 'Siswa'}</h2>
              <p className="text-blue-100 text-sm">{classInfo?.name || 'Kelas belum diatur'}</p>
              <div className="flex gap-2 mt-2">
                <Badge className="bg-white/20 text-xs">Aktif</Badge>
                {student?.is_alumni && <Badge className="bg-white/20 text-xs">Alumni</Badge>}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {items.map((item: any) => (
            <div key={item.label} className={`bg-white dark:bg-gray-900 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-800 ${item.multiline ? 'col-span-2' : ''}`}>
              <div className={`w-8 h-8 rounded-full ${item.color} flex items-center justify-center mb-2`}>
                <item.icon className="h-4 w-4" />
              </div>
              <p className="text-xs text-gray-400">{item.label}</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 line-clamp-2">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderScheduleTab = () => {
    const nowMin = liveClock.getHours() * 60 + liveClock.getMinutes();
    return (
      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Jadwal hari ini</h2>
          <p className="text-sm text-slate-500">
            {DAY_NAMES[liveClock.getDay()]}, {safeFormatDate(liveClock, 'd MMMM yyyy')} · {todaySchedules?.length || 0} mapel
          </p>
        </div>
        <div className="space-y-2">
          {schedulesLoading ? <LoadingState label="Memuat jadwal..." /> :
            todaySchedules && todaySchedules.length > 0 ? todaySchedules.map((s: any) => {
              const st = toMinutes(s.start_time);
              const en = toMinutes(s.end_time);
              const isNow = st != null && en != null && nowMin >= st && nowMin < en;
              const isPast = en != null && nowMin >= en;
              return (
                <div key={s.id} className={`rounded-2xl p-4 flex items-center gap-4 border ${isNow ? 'bg-[#FFC93C]/15 border-[#FFC93C]' : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'} ${isPast ? 'opacity-55' : ''}`}>
                  <div className="w-14 shrink-0 text-center tabular-nums">
                    <p className="text-sm font-bold text-[#1E6FE0] dark:text-blue-300">{s.start_time?.slice(0, 5)}</p>
                    <p className="text-xs text-slate-400">{s.end_time?.slice(0, 5)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{s.subject}</p>
                    <p className="text-xs text-slate-500 truncate">{s.teachers?.profiles?.full_name}</p>
                  </div>
                  {isNow && <span className="rounded-full bg-[#FFC93C] px-2 py-0.5 text-[11px] font-bold text-[#4a3700]">Sekarang</span>}
                </div>
              );
            }) : <EmptyState icon={Calendar} title="Tidak ada jadwal hari ini" subtitle="Cek lagi besok atau ganti tahun pelajaran di Beranda." />
          }
        </div>
      </div>
    );
  };

  const renderGradesTab = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Nilai Akademik</h2>
        <Badge className="bg-blue-100 text-blue-700 text-xs">{grades?.length || 0} Mapel</Badge>
      </div>
      <AcademicYearSelector />
      <p className="text-[11px] text-gray-400">Nilai mapel yang disembunyikan oleh guru tidak ditampilkan.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1E6FE0] rounded-2xl p-4 text-white shadow-sm">
          <p className="text-blue-100 text-xs">Rata-rata</p>
          <p className="text-3xl font-extrabold">{averageGrade ?? '-'}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400">Jumlah Nilai</p>
          <p className="text-3xl font-extrabold text-gray-800 dark:text-gray-100">{grades?.length || 0}</p>
        </div>
      </div>
      <div className="space-y-2">
        {gradesLoading ? <LoadingState label="Memuat nilai..." /> :
          grades && grades.length > 0 ? grades.map((grade: any) => {
            const score = grade.final_grade ?? 0;
            const color = score >= 80 ? 'text-emerald-600' : score >= 70 ? 'text-blue-600' : 'text-red-600';
            return (
              <div key={grade.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate flex-1">{grade.schedules?.subject || grade.sched_subject}</p>
                  <span className={`text-lg font-bold ${color}`}>{typeof grade.final_grade === 'number' ? grade.final_grade.toFixed(1) : '-'}</span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-center">
                  {[
                    { label: 'Tugas', value: grade.tugas }, { label: 'Kuis', value: grade.kuis },
                    { label: 'UTS', value: grade.uts }, { label: 'UAS', value: grade.uas },
                    { label: 'Praktik', value: grade.praktik },
                  ].map((item) => (
                    <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg py-1">
                      <p className="text-[10px] text-gray-400">{item.label}</p>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.value ?? '-'}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          }) : <EmptyState icon={BookOpen} title="Belum ada nilai" />
        }
      </div>
    </div>
  );

  const renderAttendanceTab = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Detail Kehadiran</h2>
        <Badge variant="outline" className="text-[10px] gap-1">
          <Wifi className="w-3 h-3" /> RFID + Manual
        </Badge>
      </div>

      <div className="bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl p-5 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-100 text-xs">Persentase Kehadiran</p>
            <h2 className="text-4xl font-extrabold mt-1">{attendancePercentage}%</h2>
            <p className="text-emerald-100 text-sm mt-1">
              {attendanceSummary?.hadir || 0} dari {attendanceSummary?.total || 0} hari
            </p>
          </div>
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <CheckCircle className="h-7 w-7" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <AttendanceBar summary={attendanceSummary || null} />
      </div>

      <AttendanceTrendChart logs={attendanceLogs} loading={logsLoading} />

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Log Absensi</h3>
        <AttendanceLogList logs={attendanceLogs} loading={logsLoading} />
      </div>
    </div>
  );

  const renderViolationsTab = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Pelanggaran</h2>
        <Badge className={`text-xs ${totalViolationPoints === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {totalViolationPoints} Poin
        </Badge>
      </div>
      {violations ? violations.length > 0 ? (
        <div className="space-y-2">
          {violations.map((v: any) => (
            <div key={v.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-red-100 dark:border-red-900/30 flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{v.violation_types?.name}</p>
                <p className="text-xs text-gray-500 mt-1">{safeFormatDate(v.violation_date, 'dd MMMM yyyy')}</p>
                {v.notes && <p className="text-xs text-gray-400 mt-1 italic">"{v.notes}"</p>}
              </div>
              <Badge variant="destructive" className="text-xs shrink-0">{v.points} Poin</Badge>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Sparkles} title="Bersih!" subtitle="Tidak ada pelanggaran" />
      ) : <LoadingState />}
    </div>
  );

  const renderAchievementsTab = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Prestasi</h2>
        <Badge className="bg-amber-100 text-amber-700 text-xs">{achievements?.length || 0} Penghargaan</Badge>
      </div>
      {achievements ? achievements.length > 0 ? (
        <div className="space-y-2">
          {achievements.map((a: any) => (
            <div key={a.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-amber-100 dark:border-amber-900/30 flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shrink-0">
                <Medal className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{a.title}</p>
                <p className="text-xs text-gray-500 mt-1">{safeFormatDate(a.achievement_date, 'dd MMMM yyyy')}</p>
                {a.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{a.description}</p>}
              </div>
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-700 shrink-0">{a.level || 'Sekolah'}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Star} title="Belum ada prestasi" subtitle="Terus semangat!" />
      ) : <LoadingState />}
    </div>
  );

  const renderAnnouncementsTab = () => (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">Pengumuman</h2>
      {announcements ? announcements.length > 0 ? (
        <div className="space-y-2">
          {announcements.map((a: any) => (
            <div key={a.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center shrink-0">
                  <Bell className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{a.title}</p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-3">{a.content}</p>
                  <p className="text-xs text-gray-400 mt-2">{safeFormatDate(a.created_at, 'dd MMMM yyyy')}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState icon={Bell} title="Tidak ada pengumuman" /> : <LoadingState />}
    </div>
  );

  const renderDispensasiTab = () => (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">Riwayat Dispensasi</h2>
      {dispensations ? dispensations.length > 0 ? (
        <div className="space-y-2">
          {dispensations.map((d: any) => (
            <div key={d.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">
                  {safeFormatDate(d.dispensation_date, 'dd MMMM yyyy')}
                </p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{d.reason}</p>
                <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs mt-2 capitalize">
                  {d.reason_category}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState icon={CheckCircle} title="Tidak ada dispensasi" /> : <LoadingState />}
    </div>
  );

  const renderSettingsTab = () => (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">Pengaturan</h2>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Phone className="h-4 w-4 text-blue-500" /> Informasi Kontak
        </h3>
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="h-4 w-4 text-blue-500 shrink-0" />
            <span className="text-sm text-gray-500">Email</span>
          </div>
          <span className="text-sm font-medium truncate max-w-[140px]">{user?.email}</span>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" /> Keamanan
        </h3>
        <div className="space-y-3">
          <Input type="password" placeholder="Password Lama" value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
          <Input type="password" placeholder="Password Baru (min 6 karakter)" value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
          <Input type="password" placeholder="Konfirmasi Password Baru" value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
          <Button onClick={handleChangePassword} disabled={passwordLoading} className="w-full text-sm">
            {passwordLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Simpan Password
          </Button>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'profile': return renderProfileTab();
      case 'schedule': return renderScheduleTab();
      case 'grades': return renderGradesTab();
      case 'attendance': return renderAttendanceTab();
      case 'violations': return renderViolationsTab();
      case 'achievements': return renderAchievementsTab();
      case 'announcements': return renderAnnouncementsTab();
      case 'dispensasi': return renderDispensasiTab();
      case 'elearning':
        return <StudentElearningTab classId={classId} studentId={studentId} />;
      case 'uploads':
        return <StudentUploadTab studentAccount={studentAccount} user={user} />;
      case 'settings': return renderSettingsTab();
      default: return renderOverview();
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER MAIN
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-[#F1F6FD] dark:bg-slate-950 pb-28" style={{ fontFamily: FONT_STACK }}>
      {/* HEADER */}
      {(() => {
        const isHome = activeTab === 'overview' || !['schedule', 'grades', 'elearning', 'profile', 'attendance', 'violations', 'achievements', 'announcements', 'dispensasi', 'uploads', 'settings'].includes(activeTab);
        const bellBtn = (
          <button
            data-notif-btn
            onClick={() => setShowNotifications((v) => !v)}
            aria-label="Notifikasi"
            className="relative h-11 w-11 shrink-0 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FFC93C] text-[#1E6FE0] text-[10px] font-extrabold flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        );
        const logoutBtn = (
          <button
            onClick={() => setShowLogoutModal(true)}
            aria-label="Keluar"
            className="h-11 w-11 shrink-0 rounded-full bg-white/20 hover:bg-red-500/80 flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <LogOut className="h-5 w-5" />
          </button>
        );
        const searchPill = (
          <div className="flex h-12 flex-1 min-w-0 items-center gap-2 rounded-full bg-white px-4 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)] focus-within:ring-2 focus-within:ring-white/70">
            <input
              data-search-input
              type="text"
              placeholder="Cari menu…"
              aria-label="Cari menu"
              className="bg-transparent outline-none text-[15px] text-slate-800 placeholder:text-slate-400 flex-1 min-w-0"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSearchSuggestions(true); }}
              onFocus={() => setShowSearchSuggestions(true)}
            />
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E1F0FF] text-[#1E6FE0]"><Search className="h-4 w-4" /></span>
          </div>
        );
        const avatar = student?.photo_url ? (
          <img src={student.photo_url} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-white/60" />
        ) : (
          <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold ring-2 ring-white/60">
            {student?.full_name?.charAt(0) || 'S'}
          </div>
        );

        if (isHome) {
          const slide = heroSlides.length ? heroSlides[newsIdx % heroSlides.length] : null;
          const openNews = (n: HeroNews) => navigate(`/website/berita/${n.slug}`);
          return (
            <header
              className={`${INK} relative overflow-hidden text-white px-4 pt-4 pb-24 min-h-[23rem] flex flex-col`}
              onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (touchX.current == null || heroSlides.length < 2) return;
                const dx = e.changedTouches[0].clientX - touchX.current;
                touchX.current = null;
                if (Math.abs(dx) > 45) setNewsIdx((i) => (i + (dx < 0 ? 1 : -1) + heroSlides.length) % heroSlides.length);
              }}
            >
              {/* Latar: foto berita bergantian (crossfade) */}
              {heroSlides.length > 0 ? (
                <>
                  {heroSlides.map((n, i) => (
                    <img
                      key={n.id}
                      src={n.cover_image_url!}
                      alt=""
                      aria-hidden
                      loading={i === 0 ? 'eager' : 'lazy'}
                      className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-in-out motion-safe:transition-[opacity,transform] ${i === newsIdx % heroSlides.length ? 'opacity-100 motion-safe:scale-105' : 'opacity-0 scale-100'}`}
                      style={{ transitionDuration: '1400ms, 8000ms' }}
                    />
                  ))}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#071B45]/95 via-[#0B2A66]/45 to-[#1E6FE0]/55" />
                </>
              ) : (
                schoolSetting?.logo_url && (
                  <img src={schoolSetting.logo_url} alt="" aria-hidden className="pointer-events-none absolute -right-8 top-16 h-56 w-56 object-contain opacity-15" />
                )
              )}

              <div className="relative flex items-center gap-2">
                {searchPill}
                {bellBtn}
                {logoutBtn}
              </div>

              <div className="relative mt-5 flex items-center gap-3">
                <button onClick={() => handleTabChange('profile')} aria-label="Buka profil" className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                  {student?.photo_url ? (
                    <img src={student.photo_url} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-white/60" />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-base font-semibold ring-2 ring-white/60">
                      {student?.full_name?.charAt(0) || 'S'}
                    </div>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/85 truncate">
                    {greetingFor(liveClock)}, <span className="font-semibold text-white">{student?.full_name?.split(' ')[0] || 'Siswa'}</span>
                  </p>
                  <p className="text-xs text-white/70 truncate">
                    {classInfo?.name || 'Kelas belum diatur'}
                    <span className="mx-1.5 text-white/40">·</span>
                    <span className="tabular-nums">{format(liveClock, 'HH:mm')}</span>
                  </p>
                </div>
              </div>

              {/* Sorotan berita */}
              {slide && (
                <div className="relative mt-auto pt-6">
                  <div key={slide.id} className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                    <div className="flex items-center gap-2 text-[11px] text-white/80">
                      {slide.website_news_categories?.name && (
                        <span className="rounded-full bg-white/20 backdrop-blur px-2.5 py-0.5 font-medium text-white">
                          {slide.website_news_categories.name}
                        </span>
                      )}
                      {slide.published_at && (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDistanceToNow(new Date(slide.published_at), { addSuffix: true, locale: localeId })}</span>
                      )}
                    </div>
                    <h2 className="mt-2 line-clamp-2 text-[19px] font-semibold leading-snug tracking-tight text-white drop-shadow-sm">{slide.title}</h2>
                    <div className="mt-3 flex items-center justify-between">
                      <button
                        onClick={() => openNews(slide)}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-[#1E6FE0] shadow-sm transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        Selengkapnya <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      {heroSlides.length > 1 && (
                        <div className="flex items-center gap-1.5" role="tablist" aria-label="Pilih berita">
                          {heroSlides.map((n, i) => (
                            <button
                              key={n.id}
                              role="tab"
                              aria-selected={i === newsIdx % heroSlides.length}
                              aria-label={`Berita ${i + 1}`}
                              onClick={() => setNewsIdx(i)}
                              className={`h-1.5 rounded-full transition-all duration-500 ${i === newsIdx % heroSlides.length ? 'w-6 bg-white' : 'w-1.5 bg-white/50'}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </header>
          );
        }
        return (
          <header className={`${INK} text-white px-4 pt-4 pb-5 rounded-b-[2rem]`}>
            <div className="flex items-center gap-2">
              {searchPill}
              {bellBtn}
              {logoutBtn}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden bg-white/20 flex items-center justify-center font-bold ring-2 ring-white/50">
                {student?.photo_url ? <img src={student.photo_url} alt="" className="h-full w-full object-cover" /> : (student?.full_name?.charAt(0) || 'S')}
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold leading-tight truncate">{student?.full_name || 'Siswa'}</h1>
                <p className="text-xs text-white/80 truncate">{classInfo?.name || 'Kelas belum diatur'}</p>
              </div>
            </div>
          </header>
        );
      })()}

      {/* NOTIFICATIONS PANEL */}
      {showNotifications && (
        <div data-notif-panel
          className="fixed top-16 right-4 w-[calc(100vw-2rem)] max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 z-[100] overflow-hidden animate-in slide-in-from-top-2 fade-in">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Notifikasi</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={() => markNotificationsRead()}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Tandai dibaca
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={() => setDeleteAllConfirm(true)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1">
                  <Trash2 className="h-3 w-3" /> Hapus Semua
                </button>
              )}
              <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length > 0 ? notifications.map((notif) => (
              <div key={notif.id}
                onClick={() => { if (!notif.is_read) markNotificationsRead([notif.id]); }}
                className={`p-3 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-start justify-between gap-2 ${notif.is_read ? '' : 'bg-blue-50/60 dark:bg-blue-900/10 cursor-pointer'}`}>
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center shrink-0">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                      {!notif.is_read && <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-1.5 align-middle" />}
                      {notif.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {safeFormatDate(notif.created_at, 'dd MMM yyyy HH:mm')}
                    </p>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteNotification(notif.id); }}
                  className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )) : (
              <div className="p-6 text-center text-gray-400 text-sm">
                <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                Belum ada notifikasi
              </div>
            )}
          </div>
        </div>
      )}

      {/* SEARCH SUGGESTIONS */}
      {showSearchSuggestions && searchQuery.length >= 3 && (
        <div data-search-panel
          className="fixed top-[4.75rem] left-4 right-4 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 z-[999] overflow-hidden">
          {filteredSuggestions.length > 0 ? filteredSuggestions.map((menu) => (
            <button key={menu.label}
              onClick={() => {
                setSearchQuery('');
                setShowSearchSuggestions(false);
                if (menu.isExternal) window.location.href = menu.url!;
                else handleTabChange(menu.tab!);
              }}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-50 dark:border-gray-800 last:border-b-0">
              <div className={`w-8 h-8 rounded-lg ${menu.color} flex items-center justify-center text-white shrink-0`}>
                <menu.icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{menu.label}</span>
            </button>
          )) : (
            <div className="p-4 text-center text-xs text-gray-400">Menu tidak ditemukan</div>
          )}
        </div>
      )}

      {/* CONTENT */}
      <main>{renderContent()}</main>

      {/* BOTTOM NAV */}
      <nav aria-label="Navigasi utama" className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-md">
        <div className="grid grid-cols-5 gap-1 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 p-1.5 shadow-[0_8px_24px_-8px_rgba(30,111,224,0.4)]">
          {[
            { tab: 'overview', label: 'Beranda', icon: Home },
            { tab: 'schedule', label: 'Jadwal', icon: Calendar },
            { tab: 'grades', label: 'Nilai', icon: BookOpen },
            { tab: 'elearning', label: 'Belajar', icon: GraduationCap },
            { tab: 'profile', label: 'Profil', icon: User },
          ].map((item) => {
            const isActive = activeTab === item.tab || (item.tab === 'overview' && !['schedule', 'grades', 'elearning', 'profile'].includes(activeTab));
            return (
              <button
                key={item.tab}
                onClick={() => handleTabChange(item.tab)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E6FE0] ${
                  isActive ? 'bg-[#E1F0FF] text-[#1E6FE0] dark:bg-slate-800' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-semibold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* LOGOUT MODAL */}
      <LogoutModal
        open={showLogoutModal}
        loading={isLoggingOut}
        onConfirm={handleLogoutConfirm}
        onCancel={() => setShowLogoutModal(false)}
      />

      {/* DELETE ALL CONFIRM */}
      <AlertDialog open={deleteAllConfirm} onOpenChange={setDeleteAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Semua Notifikasi?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua notifikasi akan dihapus permanen. Data absensi Anda <strong>tidak akan terpengaruh</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAllNotifications}
              className="bg-red-500 hover:bg-red-600">Hapus Semua</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const Dashboard = () => (
  <ProtectedRoute allowedRoles={['siswa']}>
    <StudentDashboardPage />
  </ProtectedRoute>
);

export default Dashboard;