import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, BookOpen, AlertTriangle, Bell, Clock, Trophy, Medal,
  TrendingUp, CheckCircle, XCircle, Star, Sparkles,
  Lock, Eye, EyeOff, ShieldAlert, CheckCircle2,
  Phone, Send, Mail, User, Save, Pencil, Settings, Loader2,
  LayoutDashboard, ScanLine, Moon, Sun, Globe, Eye as EyeIcon,
  BellRing, History, LogOut, Smartphone, MapPin, CalendarDays,
  Hash, Users, GraduationCap, CreditCard, IdCard, UserCircle,
  // Ikon untuk bottom nav
  Home, Box, BarChart3, ChevronRight, AlertCircle, BadgeCheck,
  Search
} from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { WaterProgressLoader } from "@/components/ui/water-progress-loader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StudentWelcomeBanner } from "@/components/dashboard/StudentWelcomeBanner";
import { StudentRfidRecap } from "@/components/dashboard/StudentRfidRecap";
import { StudentTelegramCard } from "@/components/dashboard/StudentTelegramCard";
import { AcademicYearSelector } from "@/components/AcademicYearSelector";
import { useSelectedPeriod, useStudentAttendanceSummary } from "@/hooks/useStudentAttendanceSummary";

const StudentDashboardPage = () => {
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Fallback jika tab tidak dikenali
  const activeTab = searchParams.get('tab') || 'overview';
  const queryClient = useQueryClient();

  // Settings states
  const [waNumber, setWaNumber] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [editingWa, setEditingWa] = useState(false);
  const [editingTelegram, setEditingTelegram] = useState(false);
  const [savingWa, setSavingWa] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  const [notifPrefs, setNotifPrefs] = useState({
    wa_enabled: true,
    telegram_enabled: true,
    email_enabled: true,
    announcement: true,
    violation: true,
    grade: true,
    attendance: true
  });

  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('student-theme') as any) || 'system';
    }
    return 'system';
  });

  const [language, setLanguage] = useState<'id' | 'en'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('student-language') as any) || 'id';
    }
    return 'id';
  });

  const [privacySettings, setPrivacySettings] = useState({
    show_profile_public: false,
    show_grade_public: false,
    allow_contact_by_teacher: true
  });

  // Data fetching
  const { data: studentAccount, isLoading: accountLoading } = useQuery({
    queryKey: ['student-account', user?.id],
    queryFn: async () => {
      if (!user) return null;
      try {
        const { data, error } = await supabase
          .from('student_accounts')
          .select('*, students(*)')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw error;
        return data;
      } catch (err) {
        console.error("Error fetching student account:", err);
        return null;
      }
    },
    enabled: !!user
  });

  const { data: classInfo } = useQuery({
    queryKey: ['student-class', studentAccount?.students?.class_id],
    queryFn: async () => {
      if (!studentAccount?.students?.class_id) return null;
      try {
        const { data, error } = await supabase
          .from('classes')
          .select('*, teachers(*, profiles:profiles_public(full_name))')
          .eq('id', studentAccount.students.class_id)
          .maybeSingle();
        if (error) throw error;
        return data;
      } catch (err) {
        console.error("Error fetching class:", err);
        return null;
      }
    },
    enabled: !!studentAccount?.students?.class_id
  });

  const { data: todaySchedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['student-schedules-today', studentAccount?.students?.class_id],
    queryFn: async () => {
      if (!studentAccount?.students?.class_id) return [];
      try {
        const today = new Date().getDay();
        const { data, error } = await supabase
          .from('schedules')
          .select('*, teachers(*, profiles:profiles_public(full_name))')
          .eq('class_id', studentAccount.students.class_id)
          .eq('day_of_week', today)
          .order('start_time');
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error("Error fetching schedules:", err);
        return [];
      }
    },
    enabled: !!studentAccount?.students?.class_id
  });

  const activePeriod = useSelectedPeriod();
  const { data: attendanceSummary, isLoading: attendanceLoading } = useStudentAttendanceSummary(
    studentAccount?.student_id,
    activePeriod
  );

  const { data: violations, isLoading: violationsLoading } = useQuery({
    queryKey: ['student-violations', studentAccount?.student_id],
    queryFn: async () => {
      if (!studentAccount?.student_id) return [];
      try {
        const { data, error } = await supabase
          .from('student_violations')
          .select('*, violation_types(*)')
          .eq('student_id', studentAccount.student_id)
          .order('violation_date', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error("Error fetching violations:", err);
        return [];
      }
    },
    enabled: !!studentAccount?.student_id
  });

  const { data: achievements, isLoading: achievementsLoading } = useQuery({
    queryKey: ['student-achievements', studentAccount?.student_id],
    queryFn: async () => {
      if (!studentAccount?.student_id) return [];
      try {
        const { data, error } = await supabase
          .from('student_achievements')
          .select('*')
          .eq('student_id', studentAccount.student_id)
          .order('achievement_date', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error("Error fetching achievements:", err);
        return [];
      }
    },
    enabled: !!studentAccount?.student_id
  });

  const { data: dispensations, isLoading: dispensationsLoading } = useQuery({
    queryKey: ['student-dispensations', studentAccount?.student_id],
    queryFn: async () => {
      if (!studentAccount?.student_id) return [];
      try {
        const { data, error } = await supabase
          .from('student_dispensations')
          .select('*')
          .eq('student_id', studentAccount.student_id)
          .order('dispensation_date', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error("Error fetching dispensations:", err);
        return [];
      }
    },
    enabled: !!studentAccount?.student_id
  });

  const totalViolationPoints = violations?.reduce((sum, v) => sum + (v.points || 0), 0) || 0;

  const { data: announcements, isLoading: announcementsLoading } = useQuery({
    queryKey: ['student-announcements'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('announcements')
          .select('*')
          .eq('is_active', true)
          .in('target_audience', ['semua', 'siswa'])
          .order('created_at', { ascending: false })
          .limit(5);
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error("Error fetching announcements:", err);
        return [];
      }
    }
  });

  const { data: grades, isLoading: gradesLoading } = useQuery({
    queryKey: ['student-grades', studentAccount?.student_id],
    queryFn: async () => {
      if (!studentAccount?.student_id) return [];
      try {
        const { data, error } = await supabase
          .from('grades')
          .select('*, schedules(subject, teachers(*, profiles:profiles_public(full_name)))')
          .eq('student_id', studentAccount.student_id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error("Error fetching grades:", err);
        return [];
      }
    },
    enabled: !!studentAccount?.student_id
  });

  const { data: loginHistory } = useQuery({
    queryKey: ['student-login-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        const { data, error } = await supabase
          .from('auth_sessions')
          .select('created_at, ip_address, user_agent')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) return [];
        return data || [];
      } catch (err) {
        console.error("Error fetching login history:", err);
        return [];
      }
    },
    enabled: !!user?.id
  });

  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  // Password logic
  const getPasswordStrength = (password: string) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  };

  const validatePassword = () => {
    const errors: Record<string, string> = {};
    if (!passwordForm.currentPassword) errors.currentPassword = 'Password lama wajib diisi';
    if (!passwordForm.newPassword) {
      errors.newPassword = 'Password baru wajib diisi';
    } else if (passwordForm.newPassword.length < 8) {
      errors.newPassword = 'Minimal 8 karakter';
    } else if (!/[A-Z]/.test(passwordForm.newPassword)) {
      errors.newPassword = 'Harus ada huruf kapital';
    } else if (!/[a-z]/.test(passwordForm.newPassword)) {
      errors.newPassword = 'Harus ada huruf kecil';
    } else if (!/[0-9]/.test(passwordForm.newPassword)) {
      errors.newPassword = 'Harus ada angka';
    } else if (!/[^A-Za-z0-9]/.test(passwordForm.newPassword)) {
      errors.newPassword = 'Harus ada simbol';
    }
    if (!passwordForm.confirmPassword) {
      errors.confirmPassword = 'Konfirmasi password wajib diisi';
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = 'Password tidak cocok';
    }
    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChangePassword = async () => {
    if (!validatePassword()) return;
    setPasswordLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: passwordForm.currentPassword,
      });
      if (signInError) throw new Error('Password lama salah');

      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });
      if (updateError) throw updateError;

      toast({ title: 'Berhasil', description: 'Password berhasil diperbarui.' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordErrors({});
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: err.message || 'Terjadi kesalahan saat mengubah password',
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(passwordForm.newPassword);
  const strengthLabel = passwordStrength <= 2 ? 'Lemah' : passwordStrength <= 4 ? 'Sedang' : 'Kuat';
  const strengthColor = passwordStrength <= 2 ? 'bg-red-500' : passwordStrength <= 4 ? 'bg-amber-500' : 'bg-emerald-500';

  const handleSaveWa = async () => {
    if (!waNumber.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Nomor WhatsApp tidak boleh kosong' });
      return;
    }
    const cleaned = waNumber.trim().replace(/\D/g, '');
    if (!cleaned.startsWith('62') || cleaned.length < 10 || cleaned.length > 15) {
      toast({
        variant: 'destructive',
        title: 'Format Salah',
        description: 'Nomor harus diawali 62 dan terdiri dari 10-15 digit (contoh: 6281234567890)'
      });
      return;
    }
    setSavingWa(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ parent_phone: cleaned })
        .eq('id', studentAccount.student_id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['student-account', user?.id] });
      toast({ title: 'Berhasil', description: 'Nomor WhatsApp berhasil diperbarui' });
      setEditingWa(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.message });
    } finally {
      setSavingWa(false);
    }
  };

  const handleSaveTelegram = async () => {
    if (!telegramId.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'ID Telegram tidak boleh kosong' });
      return;
    }
    setSavingTelegram(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ telegram_chat_id: telegramId.trim() })
        .eq('id', studentAccount.student_id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['student-account', user?.id] });
      toast({ title: 'Berhasil', description: 'ID Telegram berhasil diperbarui' });
      setEditingTelegram(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.message });
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    localStorage.setItem('student-theme', newTheme);
    applyTheme(newTheme);
    toast({ title: 'Tema diperbarui', description: `Tema diubah ke ${newTheme === 'system' ? 'sistem' : newTheme}` });
  };

  const applyTheme = (t: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;
    if (t === 'dark') {
      root.classList.add('dark');
    } else if (t === 'light') {
      root.classList.remove('dark');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  };

  const handleLanguageChange = (lang: 'id' | 'en') => {
    setLanguage(lang);
    localStorage.setItem('student-language', lang);
    toast({ title: 'Bahasa diperbarui', description: lang === 'id' ? 'Bahasa Indonesia' : 'English' });
  };

  const handleSaveNotifPrefs = async () => {
    toast({ title: 'Berhasil', description: 'Preferensi notifikasi disimpan' });
  };

  const handleSavePrivacy = async () => {
    toast({ title: 'Berhasil', description: 'Pengaturan privasi disimpan' });
  };

  if (accountLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-600 to-indigo-700">
        <div className="flex flex-col items-center gap-4 text-white">
          <WaterProgressLoader size="lg" isLoading={true} />
          <span className="text-base">Memuat data...</span>
        </div>
      </div>
    );
  }

  const student = studentAccount?.students;
  const attendancePercentage = attendanceSummary?.total
    ? Math.round((attendanceSummary.hadir / attendanceSummary.total) * 100)
    : 0;
  const averageGrade = grades && grades.length > 0
    ? (grades.reduce((sum, g) => sum + (g.final_grade || 0), 0) / grades.length).toFixed(1)
    : null;

  // Fungsi Navigasi Tab yang Benar
  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
    window.scrollTo(0, 0);
  };

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
      case 'settings': return renderSettingsTab();
      case 'rfid': return (
        <div className="space-y-4">
          <StudentRfidRecap studentId={student?.id} period={activePeriod ?? undefined} />
          <StudentTelegramCard studentId={student?.id} />
        </div>
      );
      default: return renderOverview();
    }
  };

  const renderProfileTab = () => {
    const biodataItems = [
      { icon: Hash, label: 'NIS', value: student?.nis || '-', color: 'bg-blue-100 text-blue-600' },
      { icon: Hash, label: 'NISN', value: student?.nisn || '-', color: 'bg-purple-100 text-purple-600' },
      { icon: GraduationCap, label: 'Kelas', value: classInfo?.name || '-', color: 'bg-green-100 text-green-600' },
      { icon: Users, label: 'Wali Kelas', value: classInfo?.teachers?.profiles?.full_name || '-', color: 'bg-yellow-100 text-yellow-600' },
      { icon: User, label: 'Jenis Kelamin', value: student?.gender ? (student.gender === 'L' ? 'Laki-laki' : 'Perempuan') : '-', color: 'bg-blue-100 text-blue-600' },
      { icon: CalendarDays, label: 'Tanggal Lahir', value: student?.birth_date ? format(new Date(student.birth_date), 'dd MMMM yyyy', { locale: localeId }) : '-', color: 'bg-purple-100 text-purple-600' },
      { icon: MapPin, label: 'Tempat Lahir', value: student?.birth_place || '-', color: 'bg-green-100 text-green-600' },
      { icon: MapPin, label: 'Alamat', value: student?.address || '-', color: 'bg-yellow-100 text-yellow-600', multiline: true },
      { icon: UserCircle, label: 'Orang Tua', value: student?.parent_name || '-', color: 'bg-blue-100 text-blue-600' },
      { icon: Phone, label: 'No. HP', value: student?.parent_phone ? `+${student.parent_phone}` : '-', color: 'bg-green-100 text-green-600' },
      { icon: IdCard, label: 'Status', value: student?.status ? (student.status === 'active' ? 'Aktif' : student.status) : 'Aktif', color: 'bg-purple-100 text-purple-600' },
      { icon: CreditCard, label: 'RFID UID', value: student?.rfid_uid || 'Belum terdaftar', color: 'bg-yellow-100 text-yellow-600' }
    ];

    return (
      <div className="space-y-4 p-4">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-200">
          <div className="flex items-center gap-4">
            <div className="relative">
              {student?.photo_url ? (
                <img src={student.photo_url} alt="Foto" className="w-16 h-16 rounded-full object-cover border-4 border-white/30" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold border-4 border-white/30">
                  {student?.full_name?.charAt(0) || 'S'}
                </div>
              )}
            </div>
            <div className="flex-1">
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
          {biodataItems.map((item) => (
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

  const renderOverview = () => {
    return (
      <div className="space-y-4 p-4">
        <div className="bg-gradient-to-br from-blue-500 to-indigo-700 rounded-2xl p-5 text-white shadow-lg shadow-blue-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-xs">Total Poin Kehadiran</p>
              <h2 className="text-4xl font-extrabold mt-1">
                {attendanceSummary?.hadir || 0}<span className="text-lg text-blue-200">/{attendanceSummary?.total || 0}</span>
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <Badge className="bg-emerald-400 text-emerald-950 text-xs">+{attendancePercentage}%</Badge>
                <span className="text-xs text-blue-100">Kehadiran Aktif</span>
              </div>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center"><Eye className="h-6 w-6" /></div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Statistik Saya</h3>
            <button className="text-xs bg-blue-600 text-white px-3 py-1 rounded-full flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> AI
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-100 p-4 rounded-2xl shadow-sm relative">
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-blue-600"><BookOpen className="h-4 w-4" /></div>
                <TrendingUp className="h-4 w-4 text-blue-400" />
              </div>
              <p className="text-2xl font-extrabold text-gray-800 mt-3">{averageGrade || '-'}</p>
              <p className="text-xs text-blue-600 font-medium">Rata-rata Nilai</p>
              <p className="text-xs text-blue-400 mt-1">{grades?.length || 0} Mapel</p>
            </div>

            <div className="bg-amber-100 p-4 rounded-2xl shadow-sm relative">
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-amber-600"><AlertTriangle className="h-4 w-4" /></div>
                <AlertCircle className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-2xl font-extrabold text-gray-800 mt-3">{totalViolationPoints}</p>
              <p className="text-xs text-amber-600 font-medium">Poin Pelanggaran</p>
              <p className="text-xs text-amber-400 mt-1">{violations?.length || 0} Catatan</p>
            </div>

            <div className="bg-green-100 p-4 rounded-2xl shadow-sm relative">
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-green-600"><Trophy className="h-4 w-4" /></div>
                <BadgeCheck className="h-4 w-4 text-green-400" />
              </div>
              <p className="text-2xl font-extrabold text-gray-800 mt-3">{achievements?.length || 0}</p>
              <p className="text-xs text-green-600 font-medium">Total Prestasi</p>
              <p className="text-xs text-green-400 mt-1">Penghargaan</p>
            </div>

            <div className="bg-purple-100 p-4 rounded-2xl shadow-sm relative">
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-purple-600"><Calendar className="h-4 w-4" /></div>
                <ChevronRight className="h-4 w-4 text-purple-400" />
              </div>
              <p className="text-2xl font-extrabold text-gray-800 mt-3">{todaySchedules?.length || 0}</p>
              <p className="text-xs text-purple-600 font-medium">Mapel Hari Ini</p>
              <p className="text-xs text-purple-400 mt-1">{dayNames[new Date().getDay()]}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Detail Kehadiran</h3>
          {attendanceLoading ? (
            <div className="text-center py-6 text-gray-400">Memuat...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                <div className="bg-emerald-500 h-full" style={{ width: `${(attendanceSummary?.hadir / attendanceSummary?.total) * 100}%` }} />
                <div className="bg-blue-500 h-full" style={{ width: `${(attendanceSummary?.izin / attendanceSummary?.total) * 100}%` }} />
                <div className="bg-amber-500 h-full" style={{ width: `${(attendanceSummary?.sakit / attendanceSummary?.total) * 100}%` }} />
                <div className="bg-red-500 h-full" style={{ width: `${(attendanceSummary?.alpa / attendanceSummary?.total) * 100}%` }} />
              </div>
              <div className="grid grid-cols-5 gap-2 text-center">
                <div><div className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></div><p className="text-xs text-gray-500 mt-1">Hadir</p><p className="font-bold">{attendanceSummary?.hadir || 0}</p></div>
                <div><div className="w-2 h-2 rounded-full bg-blue-500 inline-block"></div><p className="text-xs text-gray-500 mt-1">Izin</p><p className="font-bold">{attendanceSummary?.izin || 0}</p></div>
                <div><div className="w-2 h-2 rounded-full bg-amber-500 inline-block"></div><p className="text-xs text-gray-500 mt-1">Sakit</p><p className="font-bold">{attendanceSummary?.sakit || 0}</p></div>
                <div><div className="w-2 h-2 rounded-full bg-red-500 inline-block"></div><p className="text-xs text-gray-500 mt-1">Alpa</p><p className="font-bold">{attendanceSummary?.alpa || 0}</p></div>
                <div><div className="w-2 h-2 rounded-full bg-orange-500 inline-block"></div><p className="text-xs text-gray-500 mt-1">Telat</p><p className="font-bold">{attendanceSummary?.terlambat || 0}</p></div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Jadwal Hari Ini</h3>
          {schedulesLoading ? (
            <div className="text-center py-6 text-gray-400">Memuat...</div>
          ) : todaySchedules && todaySchedules.length > 0 ? (
            <div className="space-y-2">
              {todaySchedules.slice(0, 3).map((schedule: any) => (
                <div key={schedule.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div className="text-center">
                    <p className="font-mono text-xs font-bold text-gray-800 dark:text-gray-100">{schedule.start_time?.slice(0, 5)}</p>
                    <p className="font-mono text-xs text-gray-400">{schedule.end_time?.slice(0, 5)}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{schedule.subject}</p>
                    <p className="text-xs text-gray-500">{schedule.teachers?.profiles?.full_name}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400 text-sm">Tidak ada jadwal hari ini</div>
          )}
        </div>
      </div>
    );
  };

  const renderScheduleTab = () => (
    <div className="p-4 space-y-4">
      <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-200">
        <h2 className="text-lg font-bold">Jadwal Hari Ini</h2>
        <p className="text-blue-100 text-sm">{dayNames[new Date().getDay()]}, {format(new Date(), 'dd MMMM yyyy', { locale: localeId })}</p>
        <Badge className="bg-white/20 text-xs mt-2">{todaySchedules?.length || 0} Mapel</Badge>
      </div>
      <div className="space-y-2">
        {schedulesLoading ? (
          <div className="text-center py-12 text-gray-400">Memuat jadwal...</div>
        ) : todaySchedules && todaySchedules.length > 0 ? (
          todaySchedules.map((schedule: any) => (
            <div key={schedule.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4">
              <div className="bg-blue-50 dark:bg-gray-800 rounded-lg p-2 text-center w-14 shrink-0">
                <p className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">{schedule.start_time?.slice(0, 5)}</p>
                <p className="font-mono text-xs text-gray-400">{schedule.end_time?.slice(0, 5)}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate">{schedule.subject}</p>
                <p className="text-xs text-gray-500 truncate">{schedule.teachers?.profiles?.full_name}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-gray-400">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-base font-medium">Tidak ada jadwal hari ini</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderGradesTab = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Nilai Akademik</h2>
        <Badge className="bg-blue-100 text-blue-700 text-xs">{grades?.length || 0} Mapel</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-200">
          <p className="text-blue-100 text-xs">Rata-rata</p>
          <p className="text-3xl font-extrabold">{averageGrade || '-'}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400">Jumlah Nilai</p>
          <p className="text-3xl font-extrabold text-gray-800 dark:text-gray-100">{grades?.length || 0}</p>
        </div>
      </div>
      <div className="space-y-2">
        {gradesLoading ? (
          <div className="text-center py-12 text-gray-400">Memuat nilai...</div>
        ) : grades && grades.length > 0 ? (
          grades.map((grade: any) => {
            const score = grade.final_grade || 0;
            const scoreColor = score >= 80 ? "text-emerald-600" : score >= 70 ? "text-blue-600" : "text-red-600";
            return (
              <div key={grade.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate flex-1">{grade.schedules?.subject}</p>
                  <span className={`text-lg font-bold ${scoreColor}`}>{grade.final_grade?.toFixed(1) || '-'}</span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-center">
                  {[{ label: 'Tugas', value: grade.tugas },{ label: 'Kuis', value: grade.kuis },{ label: 'UTS', value: grade.uts },{ label: 'UAS', value: grade.uas },{ label: 'Praktik', value: grade.praktik }].map((item) => (
                    <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg py-1">
                      <p className="text-[10px] text-gray-400">{item.label}</p>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.value || '-'}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 text-gray-400">
            <BookOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-base font-medium">Belum ada nilai</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderAttendanceTab = () => (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">Detail Kehadiran</h2>
      <div className="bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-100 text-xs">Persentase Kehadiran</p>
            <h2 className="text-4xl font-extrabold mt-1">{attendancePercentage}%</h2>
            <p className="text-emerald-100 text-sm mt-1">{attendanceSummary?.hadir || 0} dari {attendanceSummary?.total || 0} hari</p>
          </div>
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center"><CheckCircle className="h-7 w-7" /></div>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 mb-4">
          <div className="bg-emerald-500 h-full" style={{ width: `${(attendanceSummary?.hadir / attendanceSummary?.total) * 100}%` }} />
          <div className="bg-blue-500 h-full" style={{ width: `${(attendanceSummary?.izin / attendanceSummary?.total) * 100}%` }} />
          <div className="bg-amber-500 h-full" style={{ width: `${(attendanceSummary?.sakit / attendanceSummary?.total) * 100}%` }} />
          <div className="bg-red-500 h-full" style={{ width: `${(attendanceSummary?.alpa / attendanceSummary?.total) * 100}%` }} />
        </div>
        <div className="grid grid-cols-5 gap-2 text-center">
          <div><div className="w-3 h-3 rounded-full bg-emerald-500 mx-auto mb-1"></div><p className="text-xs text-gray-500">Hadir</p><p className="font-bold text-gray-800 dark:text-gray-100">{attendanceSummary?.hadir || 0}</p></div>
          <div><div className="w-3 h-3 rounded-full bg-blue-500 mx-auto mb-1"></div><p className="text-xs text-gray-500">Izin</p><p className="font-bold text-gray-800 dark:text-gray-100">{attendanceSummary?.izin || 0}</p></div>
          <div><div className="w-3 h-3 rounded-full bg-amber-500 mx-auto mb-1"></div><p className="text-xs text-gray-500">Sakit</p><p className="font-bold text-gray-800 dark:text-gray-100">{attendanceSummary?.sakit || 0}</p></div>
          <div><div className="w-3 h-3 rounded-full bg-red-500 mx-auto mb-1"></div><p className="text-xs text-gray-500">Alpa</p><p className="font-bold text-gray-800 dark:text-gray-100">{attendanceSummary?.alpa || 0}</p></div>
          <div><div className="w-3 h-3 rounded-full bg-orange-500 mx-auto mb-1"></div><p className="text-xs text-gray-500">Telat</p><p className="font-bold text-gray-800 dark:text-gray-100">{attendanceSummary?.terlambat || 0}</p></div>
        </div>
      </div>
    </div>
  );

  const renderViolationsTab = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Pelanggaran</h2>
        <Badge className={`text-xs ${totalViolationPoints === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{totalViolationPoints} Poin</Badge>
      </div>
      {violationsLoading ? (
        <div className="text-center py-12 text-gray-400">Memuat...</div>
      ) : violations && violations.length > 0 ? (
        <div className="space-y-2">
          {violations.map((violation: any) => (
            <div key={violation.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-red-100 dark:border-red-900/30 flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0"><XCircle className="h-5 w-5 text-red-500" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{violation.violation_types?.name}</p>
                <p className="text-xs text-gray-500 mt-1">{format(new Date(violation.violation_date), 'dd MMMM yyyy', { locale: localeId })}</p>
                {violation.notes && <p className="text-xs text-gray-400 mt-1 italic">"{violation.notes}"</p>}
              </div>
              <Badge variant="destructive" className="text-xs shrink-0">{violation.points} Poin</Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><Sparkles className="h-8 w-8 text-emerald-500" /></div>
          <p className="text-base font-medium text-gray-800 dark:text-gray-100">Bersih!</p>
          <p className="text-sm text-gray-400 mt-1">Tidak ada pelanggaran</p>
        </div>
      )}
    </div>
  );

  const renderAchievementsTab = () => {
    const levelColors: Record<string, string> = { internasional: "bg-purple-100 text-purple-700", nasional: "bg-red-100 text-red-700", provinsi: "bg-blue-100 text-blue-700", kabupaten: "bg-emerald-100 text-emerald-700" };
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Prestasi</h2>
          <Badge className="bg-amber-100 text-amber-700 text-xs">{achievements?.length || 0} Penghargaan</Badge>
        </div>
        {achievementsLoading ? (
          <div className="text-center py-12 text-gray-400">Memuat...</div>
        ) : achievements && achievements.length > 0 ? (
          <div className="space-y-2">
            {achievements.map((achievement: any) => {
              const levelColor = levelColors[achievement.level] || "bg-gray-100 text-gray-700";
              return (
                <div key={achievement.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-amber-100 dark:border-amber-900/30 flex items-start gap-3">
                  <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shrink-0"><Medal className="h-5 w-5 text-amber-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{achievement.title}</p>
                    <p className="text-xs text-gray-500 mt-1">{format(new Date(achievement.achievement_date), 'dd MMMM yyyy', { locale: localeId })}</p>
                    {achievement.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{achievement.description}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${levelColor} shrink-0`}>{achievement.level || 'Sekolah'}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><Star className="h-8 w-8 text-amber-400" /></div>
            <p className="text-base font-medium text-gray-800 dark:text-gray-100">Belum ada prestasi</p>
            <p className="text-sm text-gray-400 mt-1">Terus semangat!</p>
          </div>
        )}
      </div>
    );
  };

  const renderAnnouncementsTab = () => (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">Pengumuman</h2>
      {announcementsLoading ? (
        <div className="text-center py-12 text-gray-400">Memuat...</div>
      ) : announcements && announcements.length > 0 ? (
        <div className="space-y-2">
          {announcements.map((announcement: any) => (
            <div key={announcement.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center shrink-0"><Bell className="h-5 w-5 text-blue-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{announcement.title}</p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-3">{announcement.content}</p>
                  <p className="text-xs text-gray-400 mt-2">{format(new Date(announcement.created_at), 'dd MMMM yyyy', { locale: localeId })}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <Bell className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-base font-medium">Tidak ada pengumuman</p>
        </div>
      )}
    </div>
  );

  const renderDispensasiTab = () => (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">Riwayat Dispensasi</h2>
      {dispensationsLoading ? (
        <div className="text-center py-12 text-gray-400">Memuat...</div>
      ) : dispensations && dispensations.length > 0 ? (
        <div className="space-y-2">
          {dispensations.map((d: any) => (
            <div key={d.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shrink-0"><Clock className="h-5 w-5 text-amber-500" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{format(new Date(d.dispensation_date), 'dd MMMM yyyy', { locale: localeId })}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{d.reason}</p>
                <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs mt-2 capitalize">{d.reason_category}</Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-base font-medium">Tidak ada dispensasi</p>
        </div>
      )}
    </div>
  );

  const renderSettingsTab = () => (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">Pengaturan</h2>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Phone className="h-4 w-4 text-blue-500" /> Informasi Kontak</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="flex items-center gap-2 min-w-0"><Mail className="h-4 w-4 text-blue-500 shrink-0" /><span className="text-sm text-gray-500">Email</span></div>
            <span className="text-sm font-medium truncate max-w-[140px]">{user?.email}</span>
          </div>

          {editingWa ? (
            <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-gray-400 bg-gray-200 dark:bg-gray-700 px-3 py-2 rounded-md shrink-0">+62</span>
                <Input type="tel" value={waNumber.startsWith('62') ? waNumber.slice(2) : waNumber} onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); setWaNumber(val ? `62${val}` : ''); }} placeholder="81234567890" className="text-sm" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setEditingWa(false); setWaNumber(student?.parent_phone || ''); }}>Batal</Button>
                <Button size="sm" onClick={handleSaveWa} disabled={savingWa}>{savingWa ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Simpan</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-2 min-w-0"><Phone className="h-4 w-4 text-emerald-500 shrink-0" /><span className="text-sm text-gray-500">WhatsApp</span></div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate max-w-[100px]">{student?.parent_phone ? `+${student.parent_phone}` : 'Belum'}</span>
                <Button variant="ghost" size="sm" onClick={() => { setWaNumber(student?.parent_phone || ''); setEditingWa(true); }}><Pencil className="h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {editingTelegram ? (
            <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <Input type="text" value={telegramId} onChange={(e) => setTelegramId(e.target.value)} placeholder="Chat ID Telegram" className="text-sm" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setEditingTelegram(false); setTelegramId(student?.telegram_chat_id || ''); }}>Batal</Button>
                <Button size="sm" onClick={handleSaveTelegram} disabled={savingTelegram}>{savingTelegram ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Simpan</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-2 min-w-0"><Send className="h-4 w-4 text-sky-500 shrink-0" /><span className="text-sm text-gray-500">Telegram</span></div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate max-w-[100px]">{student?.telegram_chat_id || 'Belum'}</span>
                <Button variant="ghost" size="sm" onClick={() => { setTelegramId(student?.telegram_chat_id || ''); setEditingTelegram(true); }}><Pencil className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Lock className="h-4 w-4 text-primary" /> Keamanan</h3>
        <div className="space-y-3">
          <Input type={showPasswords.current ? "text" : "password"} value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} placeholder="Password Lama" className="text-sm" />
          {passwordErrors.currentPassword && <p className="text-xs text-red-500">{passwordErrors.currentPassword}</p>}
          <Input type={showPasswords.new ? "text" : "password"} value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="Password Baru" className="text-sm" />
          {passwordErrors.newPassword && <p className="text-xs text-red-500">{passwordErrors.newPassword}</p>}
          {passwordForm.newPassword && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${i < passwordStrength ? strengthColor : 'bg-gray-200 dark:bg-gray-700'}`} />
                ))}
              </div>
              <p className="text-xs text-gray-500">Kekuatan: {strengthLabel}</p>
            </div>
          )}
          <Input type={showPasswords.confirm ? "text" : "password"} value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} placeholder="Konfirmasi Password" className="text-sm" />
          {passwordErrors.confirmPassword && <p className="text-xs text-red-500">{passwordErrors.confirmPassword}</p>}
          <Button onClick={handleChangePassword} disabled={passwordLoading} className="w-full text-sm">{passwordLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />} Simpan Password</Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><BellRing className="h-4 w-4 text-purple-500" /> Notifikasi</h3>
        <div className="space-y-2">
          {[{ key: 'wa_enabled', label: 'WhatsApp', icon: Phone },{ key: 'telegram_enabled', label: 'Telegram', icon: Send },{ key: 'email_enabled', label: 'Email', icon: Mail }].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              <div className="flex items-center gap-2"><item.icon className="h-4 w-4 text-gray-400" /><span className="text-sm">{item.label}</span></div>
              <Switch checked={notifPrefs[item.key as keyof typeof notifPrefs]} onCheckedChange={(v) => setNotifPrefs({ ...notifPrefs, [item.key]: v })} />
            </div>
          ))}
          <Separator />
          {[{ key: 'announcement', label: 'Pengumuman', icon: Bell },{ key: 'violation', label: 'Pelanggaran', icon: AlertTriangle },{ key: 'grade', label: 'Nilai Baru', icon: TrendingUp },{ key: 'attendance', label: 'Kehadiran', icon: CheckCircle }].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              <div className="flex items-center gap-2"><item.icon className="h-4 w-4 text-gray-400" /><span className="text-sm">{item.label}</span></div>
              <Switch checked={notifPrefs[item.key as keyof typeof notifPrefs] as boolean} onCheckedChange={(v) => setNotifPrefs({ ...notifPrefs, [item.key]: v })} />
            </div>
          ))}
          <Button onClick={handleSaveNotifPrefs} className="w-full text-sm mt-2"><Save className="w-4 h-4 mr-1" /> Simpan</Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Globe className="h-4 w-4 text-orange-500" /> Tampilan & Bahasa</h3>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[{ value: 'light', label: 'Terang', icon: Sun },{ value: 'dark', label: 'Gelap', icon: Moon },{ value: 'system', label: 'Sistem', icon: Smartphone }].map((t) => (
            <Button key={t.value} variant={theme === t.value ? 'default' : 'outline'} onClick={() => handleThemeChange(t.value as any)} className="flex flex-col items-center gap-1 h-auto py-2 text-xs">
              <t.icon className="h-4 w-4" />{t.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={language === 'id' ? 'default' : 'outline'} onClick={() => handleLanguageChange('id')} className="text-sm">🇮🇩 Indonesia</Button>
          <Button variant={language === 'en' ? 'default' : 'outline'} onClick={() => handleLanguageChange('en')} className="text-sm">🇬🇧 English</Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><EyeIcon className="h-4 w-4 text-red-500" /> Privasi</h3>
        <div className="space-y-3">
          {[{ key: 'show_profile_public', label: 'Profil di direktori publik', desc: 'Siswa lain dapat melihat' },{ key: 'show_grade_public', label: 'Nilai di leaderboard', desc: 'Nilai muncul di papan peringkat' },{ key: 'allow_contact_by_teacher', label: 'Guru hubungi via WA', desc: 'Izinkan guru menghubungi' }].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="flex-1 min-w-0 mr-2"><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-gray-400">{item.desc}</p></div>
              <Switch checked={privacySettings[item.key as keyof typeof privacySettings]} onCheckedChange={(v) => setPrivacySettings({ ...privacySettings, [item.key]: v })} />
            </div>
          ))}
          <Button onClick={handleSavePrivacy} variant="outline" className="w-full text-sm"><Save className="w-4 h-4 mr-1" /> Simpan Privasi</Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><History className="h-4 w-4 text-cyan-500" /> Riwayat Login</h3>
        <div className="space-y-2">
          {loginHistory && loginHistory.length > 0 ? (
            loginHistory.map((session: any, idx: number) => (
              <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                <Smartphone className="h-4 w-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{session.user_agent || 'Unknown Device'}</p><p className="text-xs text-gray-400">{session.ip_address || 'Unknown IP'}</p></div>
                <p className="text-xs text-gray-400 shrink-0">{format(new Date(session.created_at), 'dd MMM HH:mm', { locale: localeId })}</p>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-gray-400 text-sm">Tidak ada riwayat</div>
          )}
        </div>
      </div>

      <Button variant="outline" className="w-full justify-start text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => { if (confirm('Apakah Anda yakin ingin logout?')) signOut(); }}>
        <LogOut className="h-4 w-4 mr-2" />
        <div className="flex-1 text-left"><p className="text-sm font-medium">Logout</p><p className="text-xs text-gray-400">Keluar dari akun</p></div>
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-20">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-b-3xl px-4 pt-4 pb-6 text-white shadow-lg shadow-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">Halo, {student?.full_name?.split(' ')[0] || 'Siswa'}! 👋</h1>
            <p className="text-blue-100 text-sm mt-1">Selamat Datang Kembali!</p>
          </div>
          <button className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <Bell className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 bg-white/20 rounded-xl px-4 py-2.5">
          <Search className="h-4 w-4 text-blue-100" />
          <input type="text" placeholder="Cari Statistik..." className="bg-transparent outline-none text-sm text-white placeholder:text-blue-100 flex-1" />
        </div>
      </div>

      <div className="px-4 -mt-4">
        <AcademicYearSelector />
      </div>
      
      <div className="mt-2">
        {renderContent()}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-2 py-2 shadow-lg z-50">
        <div className="grid grid-cols-5 gap-1">
          {[
            { tab: 'overview', label: 'Home', icon: Home },
            { tab: 'schedule', label: 'Jadwal', icon: Calendar },
            { tab: 'grades', label: 'Nilai', icon: Box },
            { tab: 'violations', label: 'Poin', icon: BarChart3 },
            { tab: 'settings', label: 'Profil', icon: User },
          ].map((item) => {
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                onClick={() => handleTabChange(item.tab)}
                className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const StudentDashboard = () => (
  <ProtectedRoute allowedRoles={['siswa']}>
    <StudentDashboardPage />
  </ProtectedRoute>
);

export default StudentDashboard;