import { useAuth } from '@/contexts/AuthContext';
import { useIsEkskulCoach } from '@/hooks/useEkskul';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  LogOut, GraduationCap, Users, Calendar, BookOpen, FileText, ClipboardList,
  UserCircle, Settings, Menu, X, TrendingUp, Shield, UserCheck, Megaphone,
  FileCheck, CalendarClock, Mail, ChevronLeft, ChevronRight, ChevronDown,
  ChevronUp, AlertTriangle, BarChart3, FolderOpen, MessageSquare, Database,
  Award, FileSignature, Plane, Receipt, FileSpreadsheet, Wallet, FileBarChart,
  Inbox, Send, Hammer, Vote, Upload, Bell, Lock, Landmark, Server, UserMinus,
  Sparkles, CreditCard, ScanLine, LayoutDashboard, Search, Star, Moon, CalendarDays
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppFooter } from '@/components/AppFooter';
import { useQuery } from '@tanstack/react-query';
import { NotificationBell } from '@/components/NotificationBell';
import { AcademicYearSelector } from '@/components/AcademicYearSelector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

type MenuItem = {
  icon: any;
  label: string;
  href: string;
  type?: 'item';
  badge?: number;
  badgeColor?: 'red' | 'amber' | 'blue' | 'green';
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

// ⭐ BARU: tambah 'osis'
const roleLabels: Record<string, string> = {
  admin: 'Admin',
  super_admin: 'Super Admin',
  bendahara: 'Bendahara',
  tata_usaha: 'Tata Usaha',
  kesiswaan: 'Kesiswaan',
  osis: 'OSIS',                    // ⭐ TAMBAHKAN
  guru_piket: 'Guru Piket',
  pembina_ekskul: 'Pembina Ekskul',
  siswa: 'Siswa',
  polling: 'Polling',
  billing: 'Billing',
  teacher: 'Guru',
};

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { user, userRole, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isHomeroomTeacher, setIsHomeroomTeacher] = useState(false);
  const { isCoach: isEkskulCoach } = useIsEkskulCoach();
  const [menuSearch, setMenuSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('student-favorite-menus');
      return saved ? JSON.parse(saved) : ['/student-dashboard', '/student-dashboard?tab=profile'];
    }
    return [];
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'Master Data': false,
    'Akademik': false,
    'Kehadiran & Laporan': false,
    'Kesiswaan': false,
    'Ekstrakurikuler': false,
    'Informasi': false,
    'Keuangan': false,
    'Surat & Perjalanan': false,
    'Manajemen Akun': false,
    'Sistem': false,
    'Akademik Siswa': true,
    'Kesiswaan Siswa': true,
    'Informasi Siswa': true,
    'Akun Siswa': true,
    'Favorit': true,
  });

  useEffect(() => {
    const checkViewport = () => setIsMobileViewport(window.innerWidth < 768);
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  const collapsed = isCollapsed && !isMobileViewport;

  useEffect(() => {
    setMenuSearch('');
    setIsMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  // ============================
  // QUERIES
  // ============================
  const { data: settings } = useQuery({
    queryKey: ['school-settings-navbar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_settings_public')
        .select('app_name, right_logo_url')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: profile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: studentData } = useQuery({
    queryKey: ['student-profile-sidebar', user?.id],
    queryFn: async () => {
      if (!user?.id || userRole !== 'siswa') return null;
      const { data, error } = await supabase
        .from('student_accounts')
        .select('*, students(full_name, class_id)')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && userRole === 'siswa',
  });

  const { data: classInfo } = useQuery({
    queryKey: ['student-class-sidebar', studentData?.students?.class_id],
    queryFn: async () => {
      if (!studentData?.students?.class_id) return null;
      const { data, error } = await supabase
        .from('classes')
        .select('name')
        .eq('id', studentData.students.class_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!studentData?.students?.class_id,
  });

  const { data: unreadAnnouncements } = useQuery({
    queryKey: ['unread-announcements-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('announcements')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .in('target_audience', ['semua', 'siswa'])
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      return count || 0;
    },
    enabled: userRole === 'siswa',
  });

  const { data: newViolations } = useQuery({
    queryKey: ['new-violations-count', studentData?.student_id],
    queryFn: async () => {
      if (!studentData?.student_id) return 0;
      const { count } = await supabase
        .from('student_violations')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentData.student_id)
        .gte('violation_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      return count || 0;
    },
    enabled: !!studentData?.student_id && userRole === 'siswa',
  });

  const appName = settings?.app_name || 'Sistem Manajemen Sekolah';
  const rightLogoUrl = settings?.right_logo_url;
  const roleLabel = roleLabels[userRole ?? 'teacher'] ?? 'Guru';

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  useEffect(() => {
    const checkHomeroomStatus = async () => {
      if (userRole === 'teacher' && user?.id) {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (teacher) {
          const { data: classes } = await supabase
            .from('classes')
            .select('id')
            .eq('homeroom_teacher_id', teacher.id)
            .limit(1);
          setIsHomeroomTeacher((classes && classes.length > 0) || false);
        }
      }
    };
    checkHomeroomStatus();
  }, [user?.id, userRole]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('student-favorite-menus', JSON.stringify(favorites));
    }
  }, [favorites]);

  const toggleFavorite = (href: string) => {
    setFavorites(prev => {
      if (prev.includes(href)) return prev.filter(f => f !== href);
      return [...prev, href];
    });
  };

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  // ============================
  // MENU DEFINITIONS
  // ============================
  const adminMenuGroups: MenuGroup[] = [
    {
      label: 'Master Data',
      items: [
        { icon: UserCircle, label: 'Guru', href: '/teachers' },
        { icon: Users, label: 'Siswa', href: '/students' },
        { icon: UserMinus, label: 'Mutasi Keluar', href: '/student-mutations' },
        { icon: BookOpen, label: 'Kelas', href: '/classes' },
        { icon: Award, label: 'Alumni', href: '/alumni' },
        { icon: CalendarClock, label: 'Tahun Pelajaran', href: '/academic-year-settings' },
      ],
    },
    {
      label: 'Akademik',
      items: [
        { icon: Calendar, label: 'Jadwal', href: '/schedules' },
        { icon: BarChart3, label: 'Beban Mengajar', href: '/teacher-workload' },
        { icon: FileText, label: 'Jurnal Mengajar', href: '/journals' },
        { icon: GraduationCap, label: 'Nilai', href: '/grades' },
        { icon: FileCheck, label: 'Administrasi Ujian', href: '/exam-administration' },
        { icon: FileCheck, label: 'Ujian CBT', href: '/cbt-management' },
      ],
    },
    {
      label: 'Kehadiran & Laporan',
      items: [
        { icon: ClipboardList, label: 'Absensi', href: '/attendance' },
        { icon: CreditCard, label: 'Absensi RFID', href: '/rfid-attendance' },
        { icon: FileText, label: 'Rekap Absensi Siswa', href: '/student-attendance-report' },
        { icon: TrendingUp, label: 'Analytics Kehadiran', href: '/analytics' },
        { icon: TrendingUp, label: 'Analytics Nilai', href: '/grade-analytics' },
      ],
    },
    {
      label: 'Kesiswaan',
      items: [
        { icon: Mail, label: 'Surat Izin Kegiatan', href: '/permission-letters' },
        { icon: AlertTriangle, label: 'Poin Pelanggaran', href: '/violations' },
        { icon: Award, label: 'Penghargaan & Prestasi', href: '/achievements' },
        { icon: FileText, label: 'Dispensasi Siswa', href: '/dispensasi-siswa' },
        { icon: Shield, label: 'Dashboard Guru Piket', href: '/guru-piket-dashboard' },
        { icon: BookOpen, label: 'Buku Tamu', href: '/buku-tamu' },
      ],
    },
    {
      label: 'Ekstrakurikuler',
      items: [
        { icon: ClipboardList, label: 'Jenis Ekskul', href: '/ekskul-types' },
        { icon: BookOpen, label: 'Jurnal Ekskul', href: '/ekskul-journal' },
        { icon: Users, label: 'Anggota Ekskul', href: '/ekskul-members' },
        { icon: UserCheck, label: 'Pembina Ekskul', href: '/ekskul-coaches' },
      ],
    },
    {
      label: 'Informasi',
      items: [
        { icon: Megaphone, label: 'Pengumuman', href: '/announcements' },
        { icon: FolderOpen, label: 'Repositori', href: '/repository' },
        { icon: FileText, label: 'Catatan Kejadian', href: '/important-event-notes' },
        { icon: MessageSquare, label: 'Pengaduan', href: '/manajemen-pengaduan' },
        { icon: Vote, label: 'Manajemen Polling', href: '/polling' },
        { icon: Sparkles, label: 'Nedelcis Hub', href: '/nedelcis-hub' },
      ],
    },
    {
      label: 'Surat & Perjalanan',
      items: [
        { icon: FileSignature, label: 'Surat Tugas', href: '/assignment-letters' },
        { icon: Plane, label: 'SPPD', href: '/official-travel' },
        { icon: FileCheck, label: 'Bukti Kunjungan Guru', href: '/my-letters' },
        { icon: Inbox, label: 'Surat Masuk', href: '/surat-masuk' },
        { icon: Send, label: 'Surat Keluar', href: '/surat-keluar' },
      ],
    },
    {
      label: 'Keuangan',
      items: [
        { icon: Receipt, label: 'Kwitansi', href: '/payment-receipts' },
        { icon: Hammer, label: 'Upah Tukang', href: '/worker-payments' },
        { icon: Moon, label: 'Piket Malam', href: '/night-shift-payments' },
        { icon: CalendarDays, label: 'Piket Sabtu Minggu', href: '/weekend-shift-payments' },
        { icon: GraduationCap, label: 'Honorarium GTT/PTT', href: '/gtt-ptt-honorarium' },
        { icon: Award, label: 'Honorarium Ekskul', href: '/extracurricular-honorarium' },
        { icon: Receipt, label: 'Kwitansi Narasumber', href: '/narasumber-honorarium' },
        { icon: Landmark, label: 'Manajemen Pajak', href: '/tax-management' },
        { icon: FileCheck, label: 'Pemeriksaan Kas', href: '/cash-audit' },
        { icon: Wallet, label: 'RKAS', href: '/rkas' },
        { icon: FileBarChart, label: 'SPJ / BKU', href: '/spj' },
        { icon: BarChart3, label: 'Kode Anggaran', href: '/kode-label-settings' },
      ],
    },
    {
      label: 'Manajemen Akun',
      items: [
        { icon: UserCheck, label: 'Registrasi Staff', href: '/staff-registration' },
        { icon: GraduationCap, label: 'Registrasi Siswa', href: '/student-registration' },
        { icon: Users, label: 'Akun Staff', href: '/staff-accounts' },
        { icon: Users, label: 'Akun Siswa', href: '/student-accounts' },
      ],
    },
    {
      label: 'Sistem',
      items: [
        { icon: Database, label: 'Backup Database', href: '/database-backup' },
        { icon: FileSpreadsheet, label: 'Edit Data Massal', href: '/bulk-data-editor' },
        { icon: Upload, label: 'Upload Foto Massal', href: '/bulk-photo-upload' },
        { icon: Upload, label: 'Manajemen Upload Berkas', href: '/file-upload-management' },
        { icon: Bell, label: 'Billing Dashboard', href: '/billing-dashboard' },
        { icon: Server, label: 'Sistem Informasi', href: '/system-info' },
        { icon: Settings, label: 'Pengaturan', href: '/settings' },
      ],
    },
  ];

  const siswaMenuGroups: MenuGroup[] = [
    {
      label: 'Akademik Siswa',
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', href: '/student-dashboard' },
        { icon: UserCircle, label: 'Profil Saya', href: '/student-dashboard?tab=profile' },
        { icon: BookOpen, label: 'Jadwal Hari Ini', href: '/student-dashboard?tab=schedule' },
        { icon: TrendingUp, label: 'Nilai Akademik', href: '/student-dashboard?tab=grades' },
        { icon: GraduationCap, label: 'E-Learning', href: '/student-dashboard?tab=elearning' },
        { icon: ClipboardList, label: 'Kehadiran', href: '/student-dashboard?tab=attendance' },
        { icon: FileCheck, label: 'Ujian CBT', href: '/cbt-student' },
      ],
    },
    {
      label: 'Kesiswaan Siswa',
      items: [
        { icon: ScanLine, label: 'Absensi RFID', href: '/student-dashboard?tab=rfid' },
        {
          icon: AlertTriangle,
          label: 'Pelanggaran',
          href: '/student-dashboard?tab=violations',
          badge: newViolations || 0,
          badgeColor: 'red',
        },
        { icon: Award, label: 'Prestasi', href: '/student-dashboard?tab=achievements' },
        { icon: FileText, label: 'Riwayat Dispensasi', href: '/student-dashboard?tab=dispensasi' },
      ],
    },
    {
      label: 'Informasi Siswa',
      items: [
        {
          icon: Megaphone,
          label: 'Pengumuman',
          href: '/student-dashboard?tab=announcements',
          badge: unreadAnnouncements || 0,
          badgeColor: 'blue',
        },
        { icon: Sparkles, label: 'Nedelcis Hub', href: '/nedelcis-hub' },
      ],
    },
    {
      label: 'Akun Siswa',
      items: [{ icon: Settings, label: 'Pengaturan', href: '/student-dashboard?tab=settings' }],
    },
  ];

  const baseTeacherMenuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Calendar, label: 'Jadwal', href: '/schedules' },
    { icon: ClipboardList, label: 'Absensi', href: '/attendance' },
    { icon: FileText, label: 'Jurnal Mengajar', href: '/journals' },
    { icon: GraduationCap, label: 'Nilai', href: '/grades' },
    { icon: TrendingUp, label: 'Analytics Nilai', href: '/grade-analytics' },
    { icon: FileText, label: 'Rekap Absensi Siswa', href: '/student-attendance-report' },
    { icon: AlertTriangle, label: 'Poin Pelanggaran', href: '/violations' },
    { icon: FileText, label: 'Catatan Kejadian Penting', href: '/important-event-notes' },
    { icon: FileSignature, label: 'Surat Tugas & SPPD', href: '/my-letters' },
    { icon: FileCheck, label: 'Ujian CBT', href: '/cbt-management' },
    { icon: GraduationCap, label: 'E-Learning', href: '/elearning' },
    { icon: FolderOpen, label: 'Repositori', href: '/repository' },
    { icon: Sparkles, label: 'Nedelcis Hub', href: '/nedelcis-hub' },
    { icon: Settings, label: 'Pengaturan', href: '/settings' },
  ];

  const homeroomMenuItem: MenuItem = { icon: UserCheck, label: 'Rekap Absen Wali Kelas', href: '/homeroom-attendance' };
  const homeroomRfidItem: MenuItem = { icon: CreditCard, label: 'Absensi RFID', href: '/rfid-attendance' };
  const homeroomFileManagementItem: MenuItem = { icon: FolderOpen, label: 'Manajemen Berkas Siswa', href: '/homeroom-upload-management' };

  // Guru yang ditugaskan kesiswaan sebagai pembina ekskul
  const ekskulCoachMenuItems: MenuItem[] = [
    { icon: BookOpen, label: 'Jurnal Ekskul', href: '/ekskul-journal' },
    { icon: Users, label: 'Anggota Ekskul', href: '/ekskul-members' },
  ];

  const teacherMenuItemsBase: MenuItem[] = isHomeroomTeacher
    ? [
        ...baseTeacherMenuItems.slice(0, 4),
        homeroomMenuItem,
        homeroomRfidItem,
        homeroomFileManagementItem,
        ...baseTeacherMenuItems.slice(4),
      ]
    : baseTeacherMenuItems;

  // Sisipkan sebelum "Pengaturan" (item terakhir)
  const teacherMenuItems: MenuItem[] = isEkskulCoach
    ? [...teacherMenuItemsBase.slice(0, -1), ...ekskulCoachMenuItems, ...teacherMenuItemsBase.slice(-1)]
    : teacherMenuItemsBase;

  const bendaharaMenuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/bendahara-dashboard' },
    { icon: FileSignature, label: 'Surat Tugas', href: '/assignment-letters' },
    { icon: Plane, label: 'SPPD', href: '/official-travel' },
    { icon: FileCheck, label: 'Bukti Kunjungan Guru', href: '/my-letters' },
    { icon: Receipt, label: 'Kwitansi', href: '/payment-receipts' },
    { icon: Hammer, label: 'Upah Tukang', href: '/worker-payments' },
    { icon: Moon, label: 'Piket Malam', href: '/night-shift-payments' },
    { icon: CalendarDays, label: 'Piket Sabtu Minggu', href: '/weekend-shift-payments' },
    { icon: GraduationCap, label: 'Honorarium GTT/PTT', href: '/gtt-ptt-honorarium' },
    { icon: Award, label: 'Honorarium Ekskul', href: '/extracurricular-honorarium' },
    { icon: Receipt, label: 'Kwitansi Narasumber', href: '/narasumber-honorarium' },
    { icon: Landmark, label: 'Manajemen Pajak', href: '/tax-management' },
    { icon: FileCheck, label: 'Pemeriksaan Kas', href: '/cash-audit' },
    { icon: Wallet, label: 'RKAS', href: '/rkas' },
    { icon: FileBarChart, label: 'SPJ / BKU', href: '/spj' },
    { icon: BarChart3, label: 'Kode Anggaran', href: '/kode-label-settings' },
    { icon: Settings, label: 'Pengaturan Bendahara', href: '/bendahara-settings' },
  ];

  // ============================================================
  // ⭐ TATA USAHA — sudah termasuk 6 menu Penggajian & Honorarium
  // ============================================================
  const tataUsahaMenuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/tata-usaha-dashboard' },

    // --- Surat & Perjalanan ---
    { icon: FileSignature, label: 'Surat Tugas', href: '/assignment-letters' },
    { icon: Plane, label: 'SPPD', href: '/official-travel' },
    { icon: FileCheck, label: 'Bukti Kunjungan Guru', href: '/my-letters' },
    { icon: Receipt, label: 'Kwitansi', href: '/payment-receipts' },
    { icon: Inbox, label: 'Surat Masuk', href: '/surat-masuk' },
    { icon: Send, label: 'Surat Keluar', href: '/surat-keluar' },

    // --- ⭐ Penggajian & Honorarium (Full CRUD) ---
    { icon: Hammer, label: 'Upah Tukang', href: '/worker-payments' },
    { icon: Moon, label: 'Piket Malam', href: '/night-shift-payments' },
    { icon: CalendarDays, label: 'Piket Sabtu Minggu', href: '/weekend-shift-payments' },
    { icon: GraduationCap, label: 'Honorarium GTT/PTT', href: '/gtt-ptt-honorarium' },
    { icon: Receipt, label: 'Kwitansi Narasumber', href: '/narasumber-honorarium' },
    { icon: Award, label: 'Honorarium Ekskul', href: '/extracurricular-honorarium' },
  ];

  const kesiswaanMenuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/kesiswaan-dashboard' },
    { icon: ClipboardList, label: 'Absensi', href: '/attendance' },
    { icon: CreditCard, label: 'Absensi RFID', href: '/rfid-attendance' },
    { icon: AlertTriangle, label: 'Poin Pelanggaran', href: '/violations' },
    { icon: Award, label: 'Penghargaan & Prestasi', href: '/achievements' },
    { icon: ClipboardList, label: 'Jenis Ekskul', href: '/ekskul-types' },
    { icon: BookOpen, label: 'Jurnal Ekskul', href: '/ekskul-journal' },
    { icon: Users, label: 'Anggota Ekskul', href: '/ekskul-members' },
    { icon: UserCheck, label: 'Pembina Ekskul', href: '/ekskul-coaches' },
    { icon: Settings, label: 'Pengaturan', href: '/settings' },
  ];

  // ⭐ BARU: Menu OSIS — hanya dashboard & poin pelanggaran
  const osisMenuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: AlertTriangle, label: 'Poin Pelanggaran', href: '/violations' },
  ];

  const guruPiketMenuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/guru-piket-dashboard' },
    { icon: ClipboardList, label: 'Isi Absensi', href: '/attendance' },
    { icon: FileText, label: 'Dispensasi Siswa', href: '/dispensasi-siswa' },
    { icon: CreditCard, label: 'Absensi RFID', href: '/rfid-attendance' },
    { icon: BookOpen, label: 'Buku Tamu', href: '/buku-tamu' },
    { icon: Settings, label: 'Pengaturan', href: '/settings' },
  ];

  const pembinaEkskulMenuItems: MenuItem[] = [
    { icon: BookOpen, label: 'Jurnal Ekskul', href: '/ekskul-journal' },
    { icon: Users, label: 'Anggota Ekskul', href: '/ekskul-members' },
    { icon: Settings, label: 'Pengaturan', href: '/settings' },
  ];

  const pollingMenuItems: MenuItem[] = [
    { icon: Vote, label: 'Manajemen Polling', href: '/polling' },
    { icon: UserCircle, label: 'Data Guru', href: '/teachers' },
  ];

  const billingMenuItems: MenuItem[] = [
    { icon: Bell, label: 'Notifikasi Popup', href: '/billing-dashboard' },
    { icon: Lock, label: 'Penguncian Akun', href: '/billing-dashboard' },
  ];

  const superAdminMenuItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/super-admin' },
    { icon: Database, label: 'Backup Database', href: '/database-backup' },
    { icon: Settings, label: 'Pengaturan', href: '/settings' },
  ];

  // ⭐ BARU: tambahkan userRole === 'osis'
  const menuItems: MenuItem[] =
    userRole === 'super_admin'
      ? superAdminMenuItems
      : userRole === 'bendahara'
        ? bendaharaMenuItems
        : userRole === 'tata_usaha'
          ? tataUsahaMenuItems
          : userRole === 'kesiswaan'
            ? kesiswaanMenuItems
            : userRole === 'osis'                    // ⭐ TAMBAHKAN
              ? osisMenuItems
              : userRole === 'guru_piket'
                ? guruPiketMenuItems
                : userRole === 'pembina_ekskul'
                  ? pembinaEkskulMenuItems
                  : userRole === 'polling'
                  ? pollingMenuItems
                  : userRole === 'billing'
                    ? billingMenuItems
                    : teacherMenuItems;

  // ============================
  // HELPERS
  // ============================
  const filterMenuGroups = (groups: MenuGroup[]) => {
    if (!menuSearch.trim()) return groups;
    return groups
      .map(group => ({
        ...group,
        items: group.items.filter(item =>
          item.label.toLowerCase().includes(menuSearch.toLowerCase())
        ),
      }))
      .filter(group => group.items.length > 0);
  };

  const filterMenuItems = (items: MenuItem[]) => {
    if (!menuSearch.trim()) return items;
    return items.filter(item =>
      item.label.toLowerCase().includes(menuSearch.toLowerCase())
    );
  };

  const filteredSiswaMenuGroups = filterMenuGroups(siswaMenuGroups);
  const filteredMenuItems = filterMenuItems(menuItems);

  // ⭐ BARU: izinkan osis & tata_usaha & bendahara untuk search menu
  const canSearchMenu =
    userRole === 'siswa' ||
    userRole === 'teacher' ||
    userRole === 'osis' ||
    userRole === 'tata_usaha' ||
    userRole === 'bendahara';

  const isItemActive = (href: string) =>
    location.pathname === href || location.pathname + location.search === href;

  // Buka otomatis grup yang berisi menu aktif, supaya halaman yang sedang dibuka tidak tersembunyi
  // di dalam grup yang tertutup (semua grup admin tertutup secara default).
  useEffect(() => {
    if (userRole !== 'admin') return;
    const active = adminMenuGroups.find((g) => g.items.some((i) => isItemActive(i.href)));
    if (active) {
      setOpenGroups((prev) => (prev[active.label] ? prev : { ...prev, [active.label]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, userRole]);

  // ============================
  // RENDER MENU ITEM
  // ============================
  const renderMenuItem = (menuItem: MenuItem, forceExpanded = false) => {
    const Icon = menuItem.icon;
    const isActive = isItemActive(menuItem.href);
    const isFavorite = favorites.includes(menuItem.href);

    const menuButton = (
      <div
        className={cn(
          'group/btn relative flex w-full items-center rounded-lg',
          'h-9 text-sm',
          'transition-all duration-150 ease-out',
          'will-change-transform transform-gpu',
          !isActive &&
            'hover:-translate-y-[1px] hover:scale-[1.015] hover:shadow-md active:translate-y-0 active:scale-[0.99] active:shadow-none',
          collapsed && !forceExpanded ? 'justify-center px-0' : 'justify-start px-3',
          isActive
            ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white font-medium shadow-lg shadow-violet-500/30 ring-1 ring-white/20'
            : 'text-slate-600 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-fuchsia-50 hover:text-indigo-700 dark:text-slate-400 dark:hover:from-indigo-500/10 dark:hover:to-fuchsia-500/10 dark:hover:text-indigo-300'
        )}
        style={{
          boxShadow: isActive
            ? '0 4px 12px -2px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.25)'
            : undefined,
        }}
      >
        {isActive && (!collapsed || forceExpanded) && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
        )}

        <Icon
          className={cn(
            'h-[18px] w-[18px] shrink-0 transition-transform duration-150',
            (!collapsed || forceExpanded) && 'mr-3',
            !isActive && 'group-hover/btn:scale-110'
          )}
        />

        {(!collapsed || forceExpanded) && (
          <>
            <span className="flex-1 truncate text-left">{menuItem.label}</span>

            {menuItem.badge && menuItem.badge > 0 && (
              <span
                className={cn(
                  'ml-2 min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold',
                  'shadow-sm ring-1 ring-white/20',
                  menuItem.badgeColor === 'red' && 'bg-red-500 text-white',
                  menuItem.badgeColor === 'amber' && 'bg-amber-500 text-white',
                  menuItem.badgeColor === 'blue' && 'bg-blue-500 text-white',
                  menuItem.badgeColor === 'green' && 'bg-emerald-500 text-white'
                )}
              >
                {menuItem.badge > 99 ? '99+' : menuItem.badge}
              </span>
            )}

            {isFavorite && !collapsed && (
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 ml-1 drop-shadow" />
            )}
          </>
        )}
      </div>
    );

    return (
      <div key={menuItem.href} className="relative group">
        {collapsed && !forceExpanded ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to={menuItem.href} onClick={() => setIsMobileMenuOpen(false)}>
                {menuButton}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              <p>{menuItem.label}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Link to={menuItem.href} onClick={() => setIsMobileMenuOpen(false)}>
            {menuButton}
          </Link>
        )}

        {!collapsed && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/30"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleFavorite(menuItem.href);
            }}
            aria-label="Toggle favorite"
          >
            <Star
              className={cn(
                'h-3.5 w-3.5',
                isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
              )}
            />
          </button>
        )}
      </div>
    );
  };

  // ============================
  // RENDER GROUP
  // ============================
  const renderGroupedMenu = (groups: MenuGroup[]) => {
    return groups.map((group) => {
      const isOpen = openGroups[group.label] ?? true;
      const hasActiveItem = group.items.some(item => isItemActive(item.href));

      if (collapsed) {
        return (
          <div key={group.label} className="py-1">
            <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
            <div className="space-y-1">{group.items.map((item) => renderMenuItem(item))}</div>
          </div>
        );
      }

      return (
        <Collapsible
          key={group.label}
          open={isOpen}
          onOpenChange={() => toggleGroup(group.label)}
          className="pt-1"
        >
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                'w-full flex items-center justify-between px-3 h-7 rounded-md',
                'transition-all duration-150 ease-out',
                'hover:bg-gradient-to-r hover:from-indigo-50 hover:to-fuchsia-50 dark:hover:from-indigo-500/10 dark:hover:to-fuchsia-500/10',
                'hover:-translate-y-[1px] active:translate-y-0',
                hasActiveItem && 'text-violet-600 dark:text-violet-400'
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {group.label}
              </span>
              {isOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 pt-1">
            {group.items.map((item) => renderMenuItem(item))}
          </CollapsibleContent>
        </Collapsible>
      );
    });
  };

  // ============================
  // RENDER
  // ============================
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
        {/* Mobile overlay */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* ===================== SIDEBAR ===================== */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex flex-col',
            'bg-white dark:bg-slate-900',
            'border-r border-slate-200 dark:border-slate-800',
            'shadow-[1px_0_0_0_rgba(0,0,0,0.03)]',
            'transition-all duration-300 ease-in-out md:relative md:translate-x-0',
            collapsed ? 'w-16' : 'w-64',
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          )}
        >
          {/* Top accent gradient line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />

          {/* Mobile close */}
          <button
            className="absolute right-3 top-3 md:hidden h-8 w-8 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>

          {/* ============= LOGO & APP NAME ============= */}
          <div
            className={cn(
              'flex h-16 items-center border-b border-slate-200 dark:border-slate-800 shrink-0',
              collapsed ? 'justify-center px-2' : 'gap-3 px-4'
            )}
          >
            <div
              className={cn(
                'flex items-center justify-center rounded-lg shrink-0',
                'bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500',
                'ring-1 ring-white/20',
                'transition-transform duration-150 hover:scale-105',
                'h-9 w-9'
              )}
              style={{
                boxShadow:
                  '0 4px 12px -2px rgba(139, 92, 246, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
              }}
            >
              {rightLogoUrl ? (
                <img
                  src={rightLogoUrl}
                  alt="Logo"
                  className="h-6 w-6 object-contain"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const next = target.nextElementSibling;
                    if (next) next.classList.remove('hidden');
                  }}
                />
              ) : null}
              <GraduationCap
                className={cn('h-5 w-5 text-white', rightLogoUrl && 'hidden')}
              />
            </div>

            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {appName}
                </h1>
                <p className="text-[11px] font-medium bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent truncate">
                  {roleLabel}
                </p>
              </div>
            )}
          </div>

          {/* ============= COLLAPSE TOGGLE ============= */}
          <div className="hidden md:block absolute -right-3 top-20 z-10">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'h-6 w-6 rounded-full flex items-center justify-center',
                    'bg-gradient-to-br from-indigo-500 to-fuchsia-500',
                    'text-white',
                    'ring-2 ring-white dark:ring-slate-900',
                    'transition-all duration-150 ease-out',
                    'shadow-md shadow-violet-500/40',
                    'hover:-translate-y-[1px] hover:shadow-lg hover:shadow-violet-500/50',
                    'active:translate-y-0 active:scale-[0.95]'
                  )}
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  aria-label="Toggle sidebar"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronLeft className="h-3 w-3" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                <p>{isCollapsed ? 'Perluas Menu' : 'Ciutkan Menu'}</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* ============= SEARCH ============= */}
          {canSearchMenu && !collapsed && (
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-violet-500" />
                <Input
                  placeholder="Cari menu..."
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  className={cn(
                    'pl-8 h-8 text-xs',
                    'border-slate-200 dark:border-slate-700',
                    'focus-visible:ring-violet-500/30 focus-visible:border-violet-500/50',
                    'transition-all duration-150',
                    'focus-visible:shadow-md focus-visible:shadow-violet-500/10'
                  )}
                />
              </div>
            </div>
          )}

          {/* ============= NAVIGATION ============= */}
          <nav
            className={cn(
              'flex-1 overflow-y-auto overflow-x-hidden',
              collapsed ? 'p-2 space-y-1' : 'p-2'
            )}
          >
            {userRole === 'admin' ? (
              <>
                {renderMenuItem({ icon: LayoutDashboard, label: 'Dashboard', href: '/' })}
                {renderGroupedMenu(adminMenuGroups)}
              </>
            ) : userRole === 'siswa' ? (
              <>
                {favorites.length > 0 && !collapsed && (
                  <Collapsible
                    open={openGroups['Favorit'] ?? true}
                    onOpenChange={() => toggleGroup('Favorit')}
                    className="pt-1"
                  >
                    <CollapsibleTrigger asChild>
                      <button className="w-full flex items-center justify-between px-3 h-7 rounded-md hover:bg-gradient-to-r hover:from-amber-50 hover:to-orange-50 dark:hover:from-amber-500/10 dark:hover:to-orange-500/10 transition-all duration-150 hover:-translate-y-[1px] active:translate-y-0">
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent flex items-center gap-1.5">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          Favorit
                        </span>
                        {openGroups['Favorit'] ? (
                          <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-0.5 pt-1">
                      {siswaMenuGroups
                        .flatMap((g) => g.items)
                        .filter((item) => favorites.includes(item.href))
                        .map((item) => renderMenuItem(item))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {renderGroupedMenu(filteredSiswaMenuGroups)}
              </>
            ) : (
              <div className="space-y-0.5">
                {filteredMenuItems.map((item) => renderMenuItem(item))}
              </div>
            )}
          </nav>

          {/* ============= STUDENT PROFILE FOOTER ============= */}
          {userRole === 'siswa' && (
            <div
              className={cn(
                'border-t border-slate-200 dark:border-slate-800 shrink-0',
                collapsed ? 'p-2' : 'p-3'
              )}
            >
              <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
                <div className="relative shrink-0">
                  <div
                    className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm ring-2 ring-white dark:ring-slate-900"
                    style={{
                      boxShadow:
                        '0 4px 12px -2px rgba(139, 92, 246, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
                    }}
                  >
                    {studentData?.students?.full_name?.charAt(0) ||
                      user?.email?.charAt(0) ||
                      'S'}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900 shadow-sm" />
                </div>

                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {studentData?.students?.full_name || 'Siswa'}
                      </p>
                      <p className="text-[10px] bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent font-medium truncate">
                        {classInfo?.name || 'Kelas belum diatur'}
                      </p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="h-7 w-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-gradient-to-br hover:from-indigo-50 hover:to-fuchsia-50 dark:hover:from-indigo-500/10 dark:hover:to-fuchsia-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-all duration-150 hover:-translate-y-[1px] active:translate-y-0 shrink-0"
                          onClick={() => {
                            setMenuSearch('');
                            navigate('/student-dashboard?tab=settings');
                            setIsMobileMenuOpen(false);
                          }}
                          aria-label="Pengaturan"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        <p>Pengaturan Akun</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* ===================== MAIN CONTENT ===================== */}
        <div className="flex flex-1 flex-col min-h-screen min-w-0">
          {/* ============= HEADER ============= */}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-2 sm:gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 sm:px-4 md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex-1 flex items-center gap-3 min-w-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm sm:text-base font-semibold text-foreground truncate">
                  {profile?.full_name || user?.email}
                </h2>
                <p className="text-xs text-muted-foreground hidden sm:block">{roleLabel}</p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <div className="hidden sm:block">
                <AcademicYearSelector />
              </div>
              {userRole === 'teacher' && <NotificationBell />}
              <Button
                variant="ghost"
                onClick={signOut}
                size="sm"
                className="text-muted-foreground hover:text-foreground px-2 sm:px-3"
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </header>

          {/* ============= PAGE CONTENT ============= */}
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <SubscriptionBanner />
            {children}
          </main>

          {/* ============= FOOTER ============= */}
          <AppFooter />
        </div>
      </div>
    </TooltipProvider>
  );
};
