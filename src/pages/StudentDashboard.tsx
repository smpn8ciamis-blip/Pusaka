// src/pages/StudentDashboard.tsx

import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useSearchParams } from "react-router-dom";
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
import { format, isValid } from "date-fns";
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
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-600 to-indigo-700">
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

  const renderOverview = () => (
    <div className="space-y-4 p-4">
      <div className="mb-2"><AcademicYearSelector /></div>

      <div>
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">Statistik Saya</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { bg: 'bg-blue-100 border-blue-200', icon: BookOpen, iconColor: 'text-blue-600', trend: TrendingUp, trendColor: 'text-blue-400', value: showData ? (averageGrade ?? '-') : '•••', label: 'Rata-rata Nilai', sub: showData ? `${grades?.length || 0} Mapel` : '•••', labelColor: 'text-blue-600', subColor: 'text-blue-400' },
            { bg: 'bg-amber-100 border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-600', trend: AlertCircle, trendColor: 'text-amber-400', value: showData ? totalViolationPoints : '•••', label: 'Poin Pelanggaran', sub: showData ? `${violations?.length || 0} Catatan` : '•••', labelColor: 'text-amber-600', subColor: 'text-amber-400' },
            { bg: 'bg-green-100 border-green-200', icon: Trophy, iconColor: 'text-green-600', trend: BadgeCheck, trendColor: 'text-green-400', value: showData ? (achievements?.length || 0) : '•••', label: 'Total Prestasi', sub: 'Penghargaan', labelColor: 'text-green-600', subColor: 'text-green-400' },
            { bg: 'bg-purple-100 border-purple-200', icon: Calendar, iconColor: 'text-purple-600', trend: ChevronRight, trendColor: 'text-purple-400', value: showData ? (todaySchedules?.length || 0) : '•••', label: 'Mapel Hari Ini', sub: DAY_NAMES[new Date().getDay()], labelColor: 'text-purple-600', subColor: 'text-purple-400' },
          ].map((c, i) => (
            <div key={i} className={`${c.bg} p-3 rounded-2xl shadow-lg relative border`}>
              <div className="flex items-start justify-between">
                <div className={`w-8 h-8 rounded-full bg-white flex items-center justify-center ${c.iconColor}`}>
                  <c.icon className="h-4 w-4" />
                </div>
                <c.trend className={`h-4 w-4 ${c.trendColor}`} />
              </div>
              <p className="text-2xl font-extrabold text-gray-800 mt-2">{c.value}</p>
              <p className={`text-xs ${c.labelColor} font-medium`}>{c.label}</p>
              <p className={`text-xs ${c.subColor} mt-0.5`}>{c.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2 mb-3">
          <Grid3X3 className="h-5 w-5 text-blue-600" /> Menu Cepat
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {shortcutMenus.map((menu) => (
            <button
              key={menu.label}
              onClick={() => menu.isExternal ? (window.location.href = menu.url!) : handleTabChange(menu.tab!)}
              className="group flex flex-col items-center gap-2 bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800 hover:shadow-xl hover:scale-105 transition-all duration-200"
            >
              <div className={`w-12 h-12 rounded-2xl ${menu.color} shadow-lg flex items-center justify-center text-white group-hover:rotate-6 transition-transform`}>
                <menu.icon className="h-6 w-6" />
              </div>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 text-center leading-tight">{menu.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Detail Kehadiran</h3>
          <Badge variant="outline" className="text-[10px]">RFID + Manual</Badge>
        </div>
        {attendanceLoading ? <LoadingState /> : <AttendanceBar summary={attendanceSummary || null} />}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Riwayat Absensi Terbaru</h3>
        <AttendanceLogList
          logs={attendanceLogs}
          loading={logsLoading}
          limit={5}
          onSeeAll={() => handleTabChange('attendance')}
        />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Jadwal Hari Ini</h3>
        {schedulesLoading ? <LoadingState /> : todaySchedules && todaySchedules.length > 0 ? (
          <div className="space-y-2">
            {todaySchedules.slice(0, 3).map((schedule: any) => (
              <div key={schedule.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className="text-center">
                  <p className="font-mono text-xs font-bold text-gray-800 dark:text-gray-100">{schedule.start_time?.slice(0, 5)}</p>
                  <p className="font-mono text-xs text-gray-400">{schedule.end_time?.slice(0, 5)}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{schedule.subject}</p>
                  <p className="text-xs text-gray-500 truncate">{schedule.teachers?.profiles?.full_name}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Calendar} title="Tidak ada jadwal hari ini" />
        )}
      </div>
    </div>
  );

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
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-200">
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

  const renderScheduleTab = () => (
    <div className="p-4 space-y-4">
      <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-200">
        <h2 className="text-lg font-bold">Jadwal Hari Ini</h2>
        <p className="text-blue-100 text-sm">{DAY_NAMES[new Date().getDay()]}, {safeFormatDate(new Date(), 'dd MMMM yyyy')}</p>
        <Badge className="bg-white/20 text-xs mt-2">{todaySchedules?.length || 0} Mapel</Badge>
      </div>
      <div className="space-y-2">
        {schedulesLoading ? <LoadingState label="Memuat jadwal..." /> :
          todaySchedules && todaySchedules.length > 0 ? todaySchedules.map((s: any) => (
            <div key={s.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-gray-100 dark:border-gray-800 flex items-center gap-4">
              <div className="bg-blue-50 dark:bg-gray-800 rounded-lg p-2 text-center w-14 shrink-0">
                <p className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">{s.start_time?.slice(0, 5)}</p>
                <p className="font-mono text-xs text-gray-400">{s.end_time?.slice(0, 5)}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate">{s.subject}</p>
                <p className="text-xs text-gray-500 truncate">{s.teachers?.profiles?.full_name}</p>
              </div>
            </div>
          )) : <EmptyState icon={Calendar} title="Tidak ada jadwal hari ini" />
        }
      </div>
    </div>
  );

  const renderGradesTab = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Nilai Akademik</h2>
        <Badge className="bg-blue-100 text-blue-700 text-xs">{grades?.length || 0} Mapel</Badge>
      </div>
      <AcademicYearSelector />
      <p className="text-[11px] text-gray-400">Nilai mapel yang disembunyikan oleh guru tidak ditampilkan.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-200">
          <p className="text-blue-100 text-xs">Rata-rata</p>
          <p className="text-3xl font-extrabold">{averageGrade ?? '-'}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
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
              <div key={grade.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate flex-1">{grade.schedules?.subject}</p>
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

      <div className="bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200">
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

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
        <AttendanceBar summary={attendanceSummary || null} />
      </div>

      <AttendanceTrendChart logs={attendanceLogs} loading={logsLoading} />

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
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
            <div key={v.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-red-100 dark:border-red-900/30 flex items-start gap-3">
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
            <div key={a.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-amber-100 dark:border-amber-900/30 flex items-start gap-3">
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
            <div key={a.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
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
            <div key={d.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-gray-100 dark:border-gray-800 flex items-start gap-3">
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
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
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
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      {/* HEADER */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-b-[2rem] px-4 pt-4 pb-6 text-white shadow-2xl shadow-blue-200/50 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute top-20 -left-10 w-32 h-32 bg-cyan-400/20 rounded-full blur-3xl" />

        {/* Top row */}
        <div className="flex items-center gap-3 relative z-10 mb-4">
          {schoolSetting?.right_logo_url && (
            <img src={schoolSetting.right_logo_url} alt="Logo"
              className="w-16 h-16 object-cover rounded-xl border-2 border-white/50 shadow-lg" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold leading-tight truncate">
              Halo, {student?.full_name?.split(' ')[0] || 'Siswa'}! 👋
            </h1>
            <p className="text-blue-100 text-xs mt-1">Selamat Datang Kembali!</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-notif-btn
              onClick={() => setShowNotifications((v) => !v)}
              aria-label="Notifikasi"
              className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center hover:bg-white/30 transition-colors relative"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <button onClick={() => setShowLogoutModal(true)}
              className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center hover:bg-red-500/80 transition-colors">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Name + class */}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold truncate">{student?.full_name || 'Siswa'}</h2>
            <p className="text-blue-100 text-xs">{classInfo?.name || 'Kelas belum diatur'}</p>
          </div>
        </div>

        {/* STATS CARD */}
        <div className="mt-4 bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {student?.photo_url ? (
                <img src={student.photo_url} alt="Foto"
                  className="w-12 h-12 rounded-full object-cover border-2 border-white/50" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold border-2 border-white/50">
                  {student?.full_name?.charAt(0) || 'S'}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-blue-100 text-xs">Total Poin Kehadiran</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <h2 className="text-3xl font-extrabold">{showData ? (attendanceSummary?.hadir || 0) : '•••'}</h2>
                  <span className="text-lg text-blue-200">/ {showData ? (attendanceSummary?.total || 0) : '•••'}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-emerald-400 text-emerald-950 text-xs">
                    {showData ? `${attendancePercentage}%` : '•••'}
                  </Badge>
                  <span className="text-xs text-blue-100">Kehadiran</span>
                </div>
              </div>
            </div>
            <button onClick={() => setShowData((v) => !v)}
              className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 shrink-0">
              {showData ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="mt-3 bg-white/20 backdrop-blur rounded-xl px-4 py-2.5 relative z-10">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-blue-100 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white tabular-nums">{format(liveClock, 'HH:mm:ss')}</p>
              <p className="text-[10px] text-blue-100">{safeFormatDate(liveClock, 'dd MMMM yyyy')}</p>
            </div>
            <div className="w-px h-6 bg-white/20" />
            <Search className="h-4 w-4 text-blue-100 shrink-0" />
            <input
              data-search-input
              type="text"
              placeholder="Cari menu... (min. 3 huruf)"
              className="bg-transparent outline-none text-sm text-white placeholder:text-blue-100 flex-1 min-w-0"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSearchSuggestions(true); }}
              onFocus={() => setShowSearchSuggestions(true)}
            />
          </div>
        </div>
      </div>

      {/* NOTIFICATIONS PANEL */}
      {showNotifications && (
        <div data-notif-panel
          className="absolute top-20 right-4 w-[calc(100vw-2rem)] max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 z-[100] overflow-hidden animate-in slide-in-from-top-2 fade-in">
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
          className="fixed top-40 left-4 right-4 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 z-[999] overflow-hidden">
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
      <div className="mt-2">{renderContent()}</div>

      {/* BOTTOM NAV */}
      <div className="fixed bottom-0 left-0 right-0 bg-blue-600 border-t border-blue-500 px-2 py-2 shadow-[0_-10px_30px_rgba(37,99,235,0.5)] z-50 rounded-t-2xl">
        <div className="grid grid-cols-5 gap-1">
          {[
            { tab: 'overview', label: 'Home', icon: Home },
            { tab: 'schedule', label: 'Jadwal', icon: Calendar },
            { tab: 'grades', label: 'Nilai', icon: Box },
            { tab: 'violations', label: 'Poin', icon: BarChart3 },
            { tab: 'profile', label: 'Profil', icon: User },
          ].map((item) => {
            const isActive = activeTab === item.tab;
            return (
              <button key={item.tab} onClick={() => handleTabChange(item.tab)}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all duration-300 ${
                  isActive ? 'bg-white text-blue-600 shadow-[0_0_20px_rgba(255,255,255,0.8)] scale-105'
                    : 'text-blue-100 hover:bg-blue-500 hover:text-white'
                }`}>
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

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