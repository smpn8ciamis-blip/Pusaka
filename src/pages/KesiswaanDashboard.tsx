import React, {
  useState,
  lazy,
  Suspense,
  useMemo,
  useCallback,
  useEffect,
  memo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Calendar as CalendarIcon,
  X,
  Users,
  AlertTriangle,
  Award,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Search,
  RefreshCw,
  BarChart3,
  Sparkles,
  Clock,
  CheckCircle2,
  FileWarning,
  UserRound,
  CalendarOff,
} from "lucide-react";
import {
  format,
  startOfMonth,
  startOfYear,
  startOfDay,
  subDays,
  addDays,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useCountAnimation } from "@/hooks/useCountAnimation";
import { useStudentGenderStats } from "@/hooks/useStudentGenderStats";
import { StudentGenderStatsCard } from "@/components/dashboard/StudentGenderStatsCard";
import { useAcademicYear } from "@/contexts/AcademicYearContext";
import { useDateRangeFilter } from "@/hooks/useDateRangeFilter";
import { fetchAllPages, percentOf } from "@/lib/attendanceUtils";
import { useDashboardExport } from "@/hooks/useDashboardExport";
import {
  useAttendanceRecap,
  useAttendanceByClass,
  useDailyAttendanceTrend,
  useLateStudents,
  useLateViolationsTrend,
  useStudentViolationDetails,
} from "@/hooks/useDashboardData";
import { DashboardAttendanceRecap } from "@/components/dashboard/DashboardAttendanceRecap";
import { WaterLoaderCard } from "@/components/ui/water-progress-loader";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  LabelList,
} from "recharts";

// =====================================================================
// LAZY LOADED
// =====================================================================
const DashboardLateStudents = lazy(() =>
  import("@/components/dashboard/DashboardLateStudents").then((m) => ({
    default: m.DashboardLateStudents,
  }))
);
const StudentViolationModal = lazy(() =>
  import("@/components/dashboard/StudentViolationModal").then((m) => ({
    default: m.StudentViolationModal,
  }))
);

// =====================================================================
// CONSTANTS
// =====================================================================
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const VISIBLE_LIMIT = 5;
const RECENT_FETCH_LIMIT = 50;
const AUTO_REFRESH_MS = 60_000;
const SKELETON_WIDTHS = [72, 54, 88, 40, 66, 78];

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "12px",
  fontSize: "12px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  padding: "8px 12px",
};

// =====================================================================
// HELPERS
// =====================================================================
const ROMAN_TO_NUM: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6,
  VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12,
};

/** Samakan penulisan nama kelas: "VII A", "VII-A", "7A", "7 A_2025/2026" => "7A" */
function normName(n: unknown): string {
  let s = String(n ?? "")
    .replace(/[_\s]*\d{4}\/\d{4}\s*$/, "")
    .trim()
    .toUpperCase();
  s = s.replace(
    /^(XII|XI|IX|X|VIII|VII|VI|V|IV|III|II|I)(?=[\s_\-.]|\d|$|[A-Z]\d*$)/,
    (m) => String(ROMAN_TO_NUM[m] ?? m)
  );
  return s.replace(/[\s_\-.]+/g, "");
}

function detectGrade(name: string): string {
  const m = normName(name).match(/^(\d{1,2})/);
  return m ? m[1] : "Lainnya";
}

function gradeOrder(g: string): number {
  const n = parseInt(g, 10);
  return isNaN(n) ? 999 : n;
}

const classNameOf = (c: any): string =>
  String(
    c?.className ?? c?.class_name ?? c?.nama_kelas ?? c?.name ?? c?.kelas ?? c?.nama ?? ""
  );

const classIdOf = (c: any): string => {
  const v = c?.classId ?? c?.class_id ?? c?.id;
  return v === undefined || v === null ? "" : String(v);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_KEY_RE = /(^id$|_id$|Id$|uuid$|Uuid$)/;

function pickName(v: any): string {
  if (typeof v === "string") {
    const t = v.trim();
    return t && !UUID_RE.test(t) ? t : "";
  }
  if (v && typeof v === "object") {
    return pickName(v.full_name ?? v.name ?? v.nama_lengkap ?? v.nama);
  }
  return "";
}

/** Ambil nama wali kelas; abaikan field *_id dan nilai berbentuk UUID. */
function extractWali(obj: any): string {
  if (!obj || typeof obj !== "object") return "";
  const explicit = [
    "waliKelas", "wali_kelas", "waliKelasName", "wali_kelas_name",
    "homeroomTeacher", "homeroom_teacher", "teacherName", "teacher_name",
    "wali", "homeroom", "teacher", "guru",
  ];
  for (const k of explicit) {
    const n = pickName(obj[k]);
    if (n) return n;
  }
  for (const key of Object.keys(obj)) {
    if (ID_KEY_RE.test(key)) continue;
    if (/wali|homeroom|teacher|guru/i.test(key)) {
      const n = pickName(obj[key]);
      if (n) return n;
    }
  }
  return "";
}

function prettyLabel(s: unknown): string {
  return String(s || "Lainnya")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// =====================================================================
// ERROR BOUNDARY
// =====================================================================
class SafeErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode; label?: string },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: any) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary:${this.props.label || "unknown"}]`, error, info);
  }
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-center space-y-2">
            <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
            <p className="text-sm font-medium">
              Gagal memuat {this.props.label || "komponen ini"}
            </p>
            <p className="text-xs text-muted-foreground">
              {this.state.error?.message?.slice(0, 120) || "Terjadi kesalahan"}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => this.setState({ hasError: false, error: undefined })}
            >
              Coba lagi
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

// =====================================================================
// INLINE HOOKS
// =====================================================================
function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Auto-refresh; dilewati saat tab sedang tidak terlihat. */
function useAutoRefresh(enabled: boolean, refresh: () => void, intervalMs = AUTO_REFRESH_MS) {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, refresh, intervalMs]);
}

/** Tanggal hari ini; ikut berganti kalau halaman dibiarkan terbuka melewati tengah malam. */
function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    const id = setInterval(() => {
      const now = startOfDay(new Date());
      setToday((prev) => (prev.getTime() === now.getTime() ? prev : now));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

function useKesiswaanStats(startDate?: Date, endDate?: Date) {
  const debouncedStart = useDebouncedValue(startDate, 400);
  const debouncedEnd = useDebouncedValue(endDate, 400);

  return useQuery({
    queryKey: [
      "kesiswaan-stats",
      debouncedStart?.toISOString() ?? null,
      debouncedEnd?.toISOString() ?? null,
    ],
    queryFn: async () => {
      const startStr = debouncedStart ? format(debouncedStart, "yyyy-MM-dd") : undefined;
      // Batas atas eksklusif (hari berikutnya) supaya data di hari terakhir tetap ikut,
      // baik kolom bertipe date maupun timestamp.
      const endExclusive = debouncedEnd
        ? format(addDays(debouncedEnd, 1), "yyyy-MM-dd")
        : undefined;

      const recentViolationsQuery = () => {
        let q: any = supabase
          .from("student_violations")
          .select(
            `id, violation_date, points, notes,
             students:student_id (full_name, nis),
             violation_types:violation_type_id (name, category)`
          );
        if (startStr) q = q.gte("violation_date", startStr);
        if (endExclusive) q = q.lt("violation_date", endExclusive);
        return q.order("violation_date", { ascending: false }).limit(RECENT_FETCH_LIMIT);
      };

      const recentAchievementsQuery = () => {
        let q: any = supabase
          .from("student_achievements")
          .select(
            `id, achievement_date, achievement_name, achievement_type, level,
             students:student_id (full_name, nis)`
          );
        if (startStr) q = q.gte("achievement_date", startStr);
        if (endExclusive) q = q.lt("achievement_date", endExclusive);
        return q.order("achievement_date", { ascending: false }).limit(RECENT_FETCH_LIMIT);
      };

      const [studentRes, violationsData, achievementsData, recentV, recentA] =
        await Promise.all([
          supabase
            .from("students")
            .select("*", { count: "exact", head: true })
            .eq("is_alumni", false)
            .eq("status", "aktif"),

          fetchAllPages<any>((from, to) => {
            let q: any = supabase
              .from("student_violations")
              .select(
                `id, violation_date, points, violation_types:violation_type_id (name, category)`
              );
            if (startStr) q = q.gte("violation_date", startStr);
            if (endExclusive) q = q.lt("violation_date", endExclusive);
            return q.order("id").range(from, to);
          }),

          fetchAllPages<any>((from, to) => {
            let q: any = supabase
              .from("student_achievements")
              .select("id, achievement_date, achievement_type, level");
            if (startStr) q = q.gte("achievement_date", startStr);
            if (endExclusive) q = q.lt("achievement_date", endExclusive);
            return q.order("id").range(from, to);
          }),

          recentViolationsQuery(),
          recentAchievementsQuery(),
        ]);

      if (studentRes.error) throw studentRes.error;
      if (recentV.error) throw recentV.error;
      if (recentA.error) throw recentA.error;

      const vByCat: Record<string, number> = {};
      violationsData.forEach((v: any) => {
        const c = v.violation_types?.category || "lainnya";
        vByCat[c] = (vByCat[c] || 0) + 1;
      });

      const aByType: Record<string, number> = {};
      const aByLevel: Record<string, number> = {};
      achievementsData.forEach((a: any) => {
        aByType[a.achievement_type] = (aByType[a.achievement_type] || 0) + 1;
        aByLevel[a.level] = (aByLevel[a.level] || 0) + 1;
      });

      const toSeries = (rec: Record<string, number>) =>
        Object.entries(rec).map(([name, value]) => ({ name: prettyLabel(name), value }));

      return {
        studentCount: studentRes.count || 0,
        totalViolations: violationsData.length,
        totalPoints: violationsData.reduce((s: number, v: any) => s + (v.points || 0), 0),
        violationsByCategory: toSeries(vByCat),
        totalAchievements: achievementsData.length,
        achievementsByType: toSeries(aByType),
        achievementsByLevel: toSeries(aByLevel),
        recentViolations: recentV.data ?? [],
        recentAchievements: recentA.data ?? [],
      };
    },
    staleTime: 60_000,
  });
}

// =====================================================================
// SUB-COMPONENTS
// =====================================================================
const AnimatedBackground = memo(() => (
  <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
    <style>{`
      @keyframes kesFloatA{0%,100%{transform:translate(0,0)}50%{transform:translate(24px,32px)}}
      @keyframes kesFloatB{0%,100%{transform:translate(0,0)}50%{transform:translate(-32px,-24px)}}
      .kes-float-a{animation:kesFloatA 18s ease-in-out infinite}
      .kes-float-b{animation:kesFloatB 24s ease-in-out infinite}
      .kes-scroll{scrollbar-width:thin}
      @media (prefers-reduced-motion: reduce){.kes-float-a,.kes-float-b{animation:none}}
    `}</style>
    <div className="kes-float-a absolute -top-20 -left-20 w-72 h-72 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl" />
    <div className="kes-float-b absolute top-1/3 right-0 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl" />
    <div className="kes-float-a absolute bottom-0 left-1/3 w-80 h-80 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl" />
  </div>
));
AnimatedBackground.displayName = "AnimatedBackground";

const StatsCardSkeleton = () => (
  <Card className="animate-pulse">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <div className="h-4 w-24 bg-muted rounded" />
      <div className="h-4 w-4 bg-muted rounded" />
    </CardHeader>
    <CardContent>
      <div className="h-8 w-16 bg-muted rounded mb-2" />
      <div className="h-3 w-20 bg-muted rounded" />
    </CardContent>
  </Card>
);
const StatsGridSkeleton = () => (
  <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <StatsCardSkeleton key={i} />
    ))}
  </div>
);

const EmptyState = ({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) => (
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <div className="h-14 w-14 rounded-full bg-gradient-to-br from-muted/60 to-muted/30 flex items-center justify-center mb-2 shadow-inner">
      <span className="text-xl">{icon}</span>
    </div>
    <p className="text-sm font-medium">{title}</p>
    <p className="text-xs text-muted-foreground">{subtitle}</p>
  </div>
);

const ErrorBanner = ({
  messages,
  onRetry,
}: {
  messages: string[];
  onRetry: () => void;
}) => (
  <div
    role="alert"
    className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3"
  >
    <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium">Sebagian data gagal dimuat</p>
      <p className="text-xs text-muted-foreground">
        Angka bertanda "—" tidak tersedia: {messages.join(", ")}.
      </p>
    </div>
    <Button size="sm" variant="outline" onClick={onRetry}>
      Muat ulang
    </Button>
  </div>
);

const SectionHeader = ({
  icon: Icon,
  title,
  description,
  accent = "primary",
  children,
}: {
  icon: any;
  title: string;
  description?: string;
  accent?: "primary" | "emerald" | "amber" | "red" | "violet";
  children?: React.ReactNode;
}) => {
  const accentMap: Record<string, string> = {
    primary: "from-blue-500/20 to-blue-500/5 text-blue-500",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-500",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-500",
    red: "from-red-500/20 to-red-500/5 text-red-500",
    violet: "from-violet-500/20 to-violet-500/5 text-violet-500",
  };
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm",
            accentMap[accent]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
            {title}
          </CardTitle>
          {description && (
            <CardDescription className="text-xs sm:text-sm">{description}</CardDescription>
          )}
        </div>
      </div>
      {children}
    </div>
  );
};

// --- Stats Cards ---
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

const KesiswaanStatsCards = memo(function KesiswaanStatsCards({
  loading,
  statsFailed,
  attendanceFailed,
  studentCount,
  attendancePercent,
  attendancePresent,
  attendanceTotal,
  totalViolations,
  totalPoints,
  totalAchievements,
}: {
  loading: boolean;
  statsFailed: boolean;
  attendanceFailed: boolean;
  studentCount: number;
  attendancePercent: number;
  attendancePresent: number;
  attendanceTotal: number;
  totalViolations: number;
  totalPoints: number;
  totalAchievements: number;
}) {
  const aStudents = useCountAnimation(studentCount);
  const aAttendance = useCountAnimation(attendancePercent);
  const aViolations = useCountAnimation(totalViolations);
  const aAchievements = useCountAnimation(totalAchievements);

  if (loading) return <StatsGridSkeleton />;

  const hasAttendanceData = attendanceTotal > 0;

  const cards = [
    {
      title: "Total siswa aktif",
      value: aStudents,
      suffix: "",
      desc: "siswa terdaftar",
      icon: Users,
      gradient: "from-blue-500 to-blue-600",
      glow: "shadow-blue-500/20",
      trend: null as "up" | "down" | null,
      failed: statsFailed,
    },
    {
      title: "Tingkat kehadiran",
      value: aAttendance,
      suffix: "%",
      desc: hasAttendanceData
        ? `${attendancePresent} hadir dari ${attendanceTotal} absensi tercatat`
        : "Belum ada absensi pada periode ini",
      icon: ClipboardList,
      gradient: "from-emerald-500 to-green-600",
      glow: "shadow-emerald-500/20",
      trend: !hasAttendanceData ? null : attendancePercent >= 90 ? "up" : "down",
      failed: attendanceFailed,
    },
    {
      title: "Total pelanggaran",
      value: aViolations,
      suffix: "",
      desc: `${totalPoints} total poin`,
      icon: AlertTriangle,
      gradient: "from-rose-500 to-red-600",
      glow: "shadow-rose-500/20",
      trend: null as "up" | "down" | null,
      failed: statsFailed,
    },
    {
      title: "Total prestasi",
      value: aAchievements,
      suffix: "",
      desc: "penghargaan tercatat",
      icon: Award,
      gradient: "from-amber-500 to-orange-600",
      glow: "shadow-amber-500/20",
      trend: null as "up" | "down" | null,
      failed: statsFailed,
    },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid gap-3 grid-cols-2 lg:grid-cols-4"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <motion.div key={card.title} variants={itemVariants}>
            <Card
              className={cn(
                "group relative overflow-hidden backdrop-blur-sm border-border/60",
                "transition-all duration-300 hover:shadow-xl",
                card.glow
              )}
            >
              <div
                className={cn(
                  "absolute inset-0 opacity-[0.07] group-hover:opacity-[0.12] transition-opacity duration-300 bg-gradient-to-br",
                  card.gradient
                )}
              />
              <div
                className={cn(
                  "absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-20 bg-gradient-to-br group-hover:opacity-40 transition-opacity",
                  card.gradient
                )}
              />

              <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br text-white shadow-md",
                    card.gradient
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="relative">
                <div className="text-2xl sm:text-3xl font-bold tabular-nums text-foreground">
                  {card.failed ? "—" : `${card.value}${card.suffix}`}
                </div>
                <div className="flex items-center justify-between gap-1 mt-1.5">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                    {card.failed ? "Data tidak tersedia" : card.desc}
                  </p>
                  {!card.failed && card.trend === "up" && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-500 shrink-0 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                      <TrendingUp className="h-3 w-3" /> Baik
                    </span>
                  )}
                  {!card.failed && card.trend === "down" && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-rose-500 shrink-0 bg-rose-500/10 px-1.5 py-0.5 rounded-full">
                      <TrendingDown className="h-3 w-3" /> Rendah
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
});

// --- Unified Date Filter ---
const UnifiedDateFilter = memo(function UnifiedDateFilter({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  autoRefresh,
  setAutoRefresh,
  onClear,
  onRefresh,
}: {
  startDate?: Date;
  endDate?: Date;
  setStartDate: (d?: Date) => void;
  setEndDate: (d?: Date) => void;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  onClear: () => void;
  onRefresh: () => void;
}) {
  const presets = [
    { label: "Hari ini", apply: () => { const d = new Date(); setStartDate(d); setEndDate(d); } },
    { label: "7 hari", apply: () => { setStartDate(subDays(new Date(), 6)); setEndDate(new Date()); } },
    { label: "Bulan ini", apply: () => { setStartDate(startOfMonth(new Date())); setEndDate(new Date()); } },
    { label: "Tahun ini", apply: () => { setStartDate(startOfYear(new Date())); setEndDate(new Date()); } },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-background/60 backdrop-blur-sm p-1 shadow-sm">
        {presets.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant="ghost"
            className="h-7 px-3 text-xs rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
            onClick={p.apply}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "justify-start text-left font-normal rounded-xl bg-background/60 backdrop-blur-sm",
              !startDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {startDate ? format(startDate, "dd MMM yyyy", { locale: idLocale }) : "Dari"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={startDate}
            onSelect={setStartDate}
            disabled={(d: Date) => !!endDate && startOfDay(d) > startOfDay(endDate)}
            initialFocus
            locale={idLocale}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "justify-start text-left font-normal rounded-xl bg-background/60 backdrop-blur-sm",
              !endDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {endDate ? format(endDate, "dd MMM yyyy", { locale: idLocale }) : "Sampai"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={endDate}
            onSelect={setEndDate}
            disabled={(d: Date) => !!startDate && startOfDay(d) < startOfDay(startDate)}
            initialFocus
            locale={idLocale}
          />
        </PopoverContent>
      </Popover>

      {(startDate || endDate) && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-xl hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
          onClick={onClear}
          title="Bersihkan filter"
          aria-label="Bersihkan filter tanggal"
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-xl"
        onClick={onRefresh}
        title="Muat ulang data"
        aria-label="Muat ulang data"
      >
        <RefreshCw className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 ml-1 pl-2 border-l border-border/60">
        <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
        <Label
          htmlFor="auto-refresh"
          className="text-xs text-muted-foreground cursor-pointer"
        >
          Segarkan otomatis
        </Label>
      </div>
    </div>
  );
});

// =====================================================================
// KEHADIRAN PER KELAS
// =====================================================================
const ClassAttendanceChart = memo(function ClassAttendanceChart({
  attendanceByClass,
  isLoading,
}: {
  attendanceByClass: any;
  isLoading?: boolean;
}) {
  const chartData = useMemo(() => {
    if (!attendanceByClass) return [];

    const filled = attendanceByClass.filledClasses || [];
    const empty = attendanceByClass.unfilledClasses || [];

    const all = [
      ...filled.map((c: any) => ({
        className: classNameOf(c) || "-",
        attendanceRate: Number(c.attendanceRate) || 0,
        total: Number(c.total) || 0,
        hadir: Number(c.hadir) || 0,
        hasData: true,
      })),
      ...empty.map((c: any) => ({
        className: (typeof c === "string" ? c : classNameOf(c)) || "-",
        attendanceRate: 0,
        total: 0,
        hadir: 0,
        hasData: false,
      })),
    ];

    return all.sort((a, b) => {
      if (b.attendanceRate !== a.attendanceRate) return b.attendanceRate - a.attendanceRate;
      return a.className.localeCompare(b.className, "id", { numeric: true });
    });
  }, [attendanceByClass]);

  const getBarColor = (rate: number, hasData: boolean) => {
    if (!hasData) return "#94a3b8";
    if (rate >= 90) return "#10b981";
    if (rate >= 80) return "#3b82f6";
    if (rate >= 70) return "#f59e0b";
    return "#ef4444";
  };

  const getRateLabel = (rate: number, hasData: boolean) => {
    if (!hasData) return "Belum ada absensi";
    if (rate >= 90) return "Sangat baik";
    if (rate >= 80) return "Baik";
    if (rate >= 70) return "Cukup";
    return "Perlu perhatian";
  };

  const summary = useMemo(() => {
    const withData = chartData.filter((c) => c.hasData);
    return [
      { label: "Sangat baik", range: "≥90%", color: "emerald", count: withData.filter((c) => c.attendanceRate >= 90).length },
      { label: "Baik", range: "80-89%", color: "blue", count: withData.filter((c) => c.attendanceRate >= 80 && c.attendanceRate < 90).length },
      { label: "Cukup", range: "70-79%", color: "amber", count: withData.filter((c) => c.attendanceRate >= 70 && c.attendanceRate < 80).length },
      { label: "Perlu perhatian", range: "<70%", color: "red", count: withData.filter((c) => c.attendanceRate < 70).length },
    ];
  }, [chartData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <SectionHeader icon={BarChart3} title="Kehadiran per kelas" description="Memuat data..." />
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center">
            <div className="animate-pulse space-y-3 w-full">
              {SKELETON_WIDTHS.map((w, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-4 w-16 bg-muted rounded" />
                  <div className="h-6 bg-muted rounded" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <SectionHeader
            icon={BarChart3}
            title="Kehadiran per kelas"
            description="Tingkat kehadiran setiap kelas"
          />
        </CardHeader>
        <CardContent>
          <EmptyState icon="📊" title="Belum ada data kelas" subtitle="Data muncul setelah absensi diinput" />
        </CardContent>
      </Card>
    );
  }

  const chartHeight = Math.max(300, chartData.length * 42);

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/60">
      <CardHeader className="pb-3">
        <SectionHeader
          icon={BarChart3}
          title="Kehadiran per kelas"
          description={`Tingkat kehadiran setiap kelas (${chartData.length} kelas)`}
          accent="primary"
        >
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { c: "bg-emerald-500", l: "≥ 90%" },
              { c: "bg-blue-500", l: "80-89%" },
              { c: "bg-amber-500", l: "70-79%" },
              { c: "bg-red-500", l: "< 70%" },
              { c: "bg-slate-400", l: "Belum ada data" },
            ].map((s) => (
              <div key={s.l} className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full shadow-sm", s.c)} />
                <span className="text-muted-foreground text-[10px] sm:text-xs">{s.l}</span>
              </div>
            ))}
          </div>
        </SectionHeader>
      </CardHeader>
      <CardContent>
        <div className="kes-scroll w-full overflow-y-auto pr-2" style={{ maxHeight: 500 }}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 60, bottom: 8, left: 8 }}
            >
              <defs>
                {chartData.map((entry, i) => {
                  const base = getBarColor(entry.attendanceRate, entry.hasData);
                  return (
                    <linearGradient key={`grad-${i}`} id={`barGrad-${i}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={base} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={base} stopOpacity={1} />
                    </linearGradient>
                  );
                })}
              </defs>

              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted/30" />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                className="text-xs"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="className"
                type="category"
                className="text-xs"
                width={70}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 500 }}
              />

              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={TOOLTIP_STYLE}>
                      <p className="font-semibold text-sm mb-1">{d.className}</p>
                      <div className="space-y-0.5">
                        {d.hasData ? (
                          <>
                            <p className="text-xs">
                              Kehadiran:{" "}
                              <span className="font-semibold text-primary">
                                {d.attendanceRate.toFixed(1)}%
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Hadir: {d.hadir} / {d.total}
                            </p>
                          </>
                        ) : null}
                        <p
                          className="text-xs font-medium mt-1"
                          style={{ color: getBarColor(d.attendanceRate, d.hasData) }}
                        >
                          {getRateLabel(d.attendanceRate, d.hasData)}
                        </p>
                      </div>
                    </div>
                  );
                }}
              />

              <Bar dataKey="attendanceRate" radius={[0, 6, 6, 0]} animationDuration={800} animationBegin={100}>
                {chartData.map((_, i) => (
                  <Cell key={`cell-${i}`} fill={`url(#barGrad-${i})`} />
                ))}
                <LabelList
                  dataKey="attendanceRate"
                  content={(p: any) => {
                    const d = chartData[p.index];
                    if (!d) return null;
                    return (
                      <text
                        x={Number(p.x) + Number(p.width) + 6}
                        y={Number(p.y) + Number(p.height) / 2}
                        dominantBaseline="central"
                        style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                      >
                        {d.hasData ? `${d.attendanceRate.toFixed(1)}%` : "—"}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-4 border-t border-border/60">
          {summary.map((s) => {
            const colorMap: Record<string, string> = {
              emerald: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
              blue: "text-blue-500 bg-blue-500/10 border-blue-500/20",
              amber: "text-amber-500 bg-amber-500/10 border-amber-500/20",
              red: "text-red-500 bg-red-500/10 border-red-500/20",
            };
            return (
              <div
                key={s.label}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-xl border",
                  colorMap[s.color]
                )}
              >
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("text-base sm:text-lg font-bold", colorMap[s.color].split(" ")[0])}>
                    {s.count}
                  </p>
                </div>
                <span className="text-[10px] opacity-70">{s.range}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});
ClassAttendanceChart.displayName = "ClassAttendanceChart";

// =====================================================================
// KELAS BELUM MENGISI ABSENSI (HARI INI)
// =====================================================================
const UnfilledClassesCard = memo(function UnfilledClassesCard({
  academicYear,
  today,
  todayByClass,
  allClasses,
  isLoading,
  failed,
}: {
  academicYear?: string;
  today: Date;
  todayByClass: any;
  allClasses: any[];
  isLoading: boolean;
  failed: boolean;
}) {
  const todayLabel = format(today, "EEEE, dd MMM yyyy", { locale: idLocale });
  const isSunday = today.getDay() === 0;

  // Kelas dianggap "sudah mengisi" hanya jika ada absensi tercatat HARI INI.
  const { filledIds, filledNames } = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    (todayByClass?.filledClasses || []).forEach((c: any) => {
      if (c?.total !== undefined && Number(c.total) <= 0) return;
      const id = classIdOf(c);
      const nm = classNameOf(c);
      if (id) ids.add(id);
      if (nm) names.add(normName(nm));
    });
    return { filledIds: ids, filledNames: names };
  }, [todayByClass]);

  const total = (allClasses || []).length;

  const unfilled = useMemo(() => {
    return (allClasses || [])
      .filter((c) => {
        const nm = classNameOf(c);
        if (!nm) return false;
        const id = classIdOf(c);
        if (id && filledIds.has(id)) return false;
        return !filledNames.has(normName(nm));
      })
      .map((c) => {
        const raw = classNameOf(c) || "-";
        return {
          id: classIdOf(c) || raw,
          displayName: raw,
          grade: detectGrade(raw),
          waliKelas: extractWali(c),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "id", { numeric: true }));
  }, [allClasses, filledIds, filledNames]);

  const filled = total - unfilled.length;
  const yearSuffix = academicYear ? ` · TP ${academicYear}` : "";

  if (isLoading) {
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={FileWarning}
            title="Kelas belum mengisi absensi hari ini"
            description="Memuat data kelas..."
            accent="amber"
          />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (failed) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={FileWarning}
            title="Kelas belum mengisi absensi hari ini"
            description="Data absensi hari ini gagal dimuat"
            accent="red"
          />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Daftar tidak ditampilkan agar tidak menyesatkan. Coba muat ulang data.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (total === 0) {
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={FileWarning}
            title="Kelas belum mengisi absensi hari ini"
            description={`Data rombel belum tersedia${yearSuffix}`}
            accent="amber"
          />
        </CardHeader>
        <CardContent>
          <EmptyState
            icon="🏫"
            title="Belum ada data kelas"
            subtitle="Periksa data rombel untuk tahun ajaran yang dipilih"
          />
        </CardContent>
      </Card>
    );
  }

  if (isSunday) {
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={CalendarOff}
            title="Kelas belum mengisi absensi hari ini"
            description={todayLabel}
            accent="primary"
          />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Hari Minggu bukan hari belajar, jadi tidak ada absensi yang perlu diisi.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (unfilled.length === 0) {
    return (
      <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={CheckCircle2}
            title="Kelas belum mengisi absensi hari ini"
            description={`Semua ${total} kelas sudah mengisi · ${todayLabel}${yearSuffix}`}
            accent="emerald"
          />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <p className="font-medium text-sm text-emerald-600 dark:text-emerald-400">
                Semua kelas sudah mengisi
              </p>
              <p className="text-xs text-muted-foreground">
                {filled} dari {total} kelas sudah mengisi absensi hari ini
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const grouped: Record<string, typeof unfilled> = {};
  unfilled.forEach((c) => {
    (grouped[c.grade] ||= []).push(c);
  });
  const sortedGrades = Object.keys(grouped).sort((a, b) => gradeOrder(a) - gradeOrder(b));

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent hover:shadow-lg transition-all duration-300 overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />

      <CardHeader className="pb-3">
        <SectionHeader
          icon={FileWarning}
          title="Kelas belum mengisi absensi hari ini"
          description={`${unfilled.length} dari ${total} kelas belum mengisi · ${todayLabel}${yearSuffix}`}
          accent="amber"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className="text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 gap-1"
            >
              <CheckCircle2 className="h-3 w-3" />
              {filled} sudah
            </Badge>
            <Badge
              variant="outline"
              className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 gap-1"
            >
              <Clock className="h-3 w-3" />
              {unfilled.length} belum
            </Badge>
          </div>
        </SectionHeader>
      </CardHeader>

      <CardContent className="space-y-5">
        {sortedGrades.map((grade) => (
          <div key={grade} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {grade === "Lainnya" ? "Lainnya" : `Kelas ${grade}`}
              </span>
              <span className="text-[10px] text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded-full">
                {grouped[grade].length}
              </span>
              <div className="flex-1 h-px bg-border/60" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              <AnimatePresence mode="popLayout">
                {grouped[grade].map((cls) => (
                  <motion.div
                    key={cls.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={cn(
                      "relative flex items-start gap-2 px-3 py-2 rounded-xl",
                      "bg-gradient-to-br from-amber-500/10 to-orange-500/5",
                      "border border-amber-500/30 shadow-sm cursor-default"
                    )}
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span
                        className="text-xs font-bold text-amber-700 dark:text-amber-300 truncate"
                        title={cls.displayName}
                      >
                        {cls.displayName}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <UserRound className="h-2.5 w-2.5 shrink-0" />
                        {cls.waliKelas ? (
                          <span className="truncate" title={cls.waliKelas}>
                            {cls.waliKelas}
                          </span>
                        ) : (
                          <span className="italic opacity-60">Wali kelas belum tercatat</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}

        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 mt-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
            Ingatkan wali kelas yang tercantum untuk mengisi absensi hari ini. Hari libur nasional
            tidak terdeteksi otomatis, jadi daftar ini bisa terisi penuh pada hari libur.
          </p>
        </div>
      </CardContent>
    </Card>
  );
});
UnfilledClassesCard.displayName = "UnfilledClassesCard";

// =====================================================================
// TREN KEHADIRAN
// =====================================================================
const ElegantAttendanceTrend = memo(function ElegantAttendanceTrend({ data }: { data: any[] }) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((d: any) => ({
      date: d.date || d.tanggal || d.day,
      hadir: Number(d.hadir) || 0,
      izin: Number(d.izin) || 0,
      sakit: Number(d.sakit) || 0,
      alpa: Number(d.alpa) || 0,
      terlambat: Number(d.terlambat) || 0,
      total: Number(d.total) || 0,
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <SectionHeader
            icon={Sparkles}
            title="Tren kehadiran harian"
            description="Belum ada data tren"
            accent="violet"
          />
        </CardHeader>
        <CardContent>
          <EmptyState icon="📈" title="Belum ada data tren" subtitle="Pilih periode yang memiliki absensi" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-all duration-300 border-border/60 overflow-hidden">
      <CardHeader className="pb-3">
        <SectionHeader
          icon={Sparkles}
          title="Tren kehadiran harian"
          description="Hadir, terlambat, izin, sakit, dan alpa dari waktu ke waktu"
          accent="violet"
        />
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <defs>
              <linearGradient id="gradHadir" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
            <XAxis dataKey="date" className="text-xs" axisLine={false} tickLine={false} />
            <YAxis className="text-xs" axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
            <Area type="monotone" dataKey="hadir" name="Hadir" stroke="#10b981" strokeWidth={2.5} fill="url(#gradHadir)" animationDuration={900} />
            <Area type="monotone" dataKey="terlambat" name="Terlambat" stroke="#f59e0b" strokeWidth={2} fill="transparent" animationDuration={900} />
            <Area type="monotone" dataKey="izin" name="Izin" stroke="#3b82f6" strokeWidth={2} fill="transparent" animationDuration={900} />
            <Area type="monotone" dataKey="sakit" name="Sakit" stroke="#8b5cf6" strokeWidth={2} fill="transparent" animationDuration={900} />
            <Area type="monotone" dataKey="alpa" name="Alpa" stroke="#ef4444" strokeWidth={2} fill="transparent" animationDuration={900} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
});
ElegantAttendanceTrend.displayName = "ElegantAttendanceTrend";

// =====================================================================
// PELANGGARAN & PRESTASI
// =====================================================================
const ViolationsChart = memo(function ViolationsChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <SectionHeader
            icon={AlertTriangle}
            title="Pelanggaran per kategori"
            description="Distribusi jenis pelanggaran"
            accent="red"
          />
        </CardHeader>
        <CardContent>
          <EmptyState icon="🎉" title="Tidak ada pelanggaran" subtitle="Tidak ada data pada periode ini" />
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="hover:shadow-lg transition-all duration-300 border-border/60">
      <CardHeader className="pb-3">
        <SectionHeader
          icon={AlertTriangle}
          title="Pelanggaran per kategori"
          description={`Total ${total} kejadian`}
          accent="red"
        />
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <defs>
              {data.map((_, i) => (
                <linearGradient key={i} id={`pieGrad-${i}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={1} />
                  <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.6} />
                </linearGradient>
              ))}
            </defs>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={5}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
              animationDuration={800}
              stroke="hsl(var(--background))"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={`url(#pieGrad-${i})`} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} kejadian`, "Jumlah"]} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
});

const HorizontalBarCard = memo(function HorizontalBarCard({
  title,
  description,
  accent,
  gradId,
  color,
  data,
  emptyTitle,
}: {
  title: string;
  description: string;
  accent: "amber" | "violet";
  gradId: string;
  color: string;
  data: { name: string; value: number }[];
  emptyTitle: string;
}) {
  return (
    <Card className="hover:shadow-lg transition-all duration-300 border-border/60">
      <CardHeader className="pb-3">
        <SectionHeader icon={Award} title={title} description={description} accent={accent} />
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState icon="🏆" title={emptyTitle} subtitle="Data muncul setelah prestasi diinput" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} layout="vertical" margin={{ right: 24 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={color} stopOpacity={1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" horizontal={false} />
              <XAxis type="number" className="text-xs" axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis dataKey="name" type="category" className="text-xs" width={100} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
              <Bar dataKey="value" name="Jumlah" fill={`url(#${gradId})`} radius={[0, 6, 6, 0]} animationDuration={800}>
                <LabelList
                  dataKey="value"
                  position="right"
                  style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
});

const RecentActivity = memo(function RecentActivity({
  violations,
  achievements,
}: {
  violations: any[];
  achievements: any[];
}) {
  const [searchV, setSearchV] = useState("");
  const [searchA, setSearchA] = useState("");
  const [showAllV, setShowAllV] = useState(false);
  const [showAllA, setShowAllA] = useState(false);

  const filteredV = useMemo(() => {
    const q = searchV.toLowerCase();
    return violations.filter(
      (v) =>
        !q ||
        v.students?.full_name?.toLowerCase().includes(q) ||
        v.violation_types?.name?.toLowerCase().includes(q)
    );
  }, [violations, searchV]);

  const filteredA = useMemo(() => {
    const q = searchA.toLowerCase();
    return achievements.filter(
      (a) =>
        !q ||
        a.students?.full_name?.toLowerCase().includes(q) ||
        a.achievement_name?.toLowerCase().includes(q)
    );
  }, [achievements, searchA]);

  const visibleV = showAllV ? filteredV : filteredV.slice(0, VISIBLE_LIMIT);
  const visibleA = showAllA ? filteredA : filteredA.slice(0, VISIBLE_LIMIT);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="hover:shadow-lg transition-all duration-300 border-border/60">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={AlertTriangle}
            title="Pelanggaran terbaru"
            description={`${filteredV.length} data (maks. ${RECENT_FETCH_LIMIT} terbaru pada periode ini)`}
            accent="red"
          />
          {violations.length > VISIBLE_LIMIT && (
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari siswa atau jenis pelanggaran"
                value={searchV}
                onChange={(e) => setSearchV(e.target.value)}
                className="h-9 pl-9 text-xs rounded-xl bg-muted/40 border-border/60"
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          <AnimatePresence mode="popLayout">
            {visibleV.length === 0 ? (
              <EmptyState icon="🎉" title="Tidak ada pelanggaran" subtitle="Tidak ada data yang cocok" />
            ) : (
              visibleV.map((v: any) => (
                <motion.div
                  key={v.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-start justify-between p-3 rounded-xl bg-gradient-to-r from-muted/50 to-muted/20 border border-transparent hover:border-rose-500/20 transition-colors"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{v.students?.full_name || "-"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {v.violation_types?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.violation_date
                        ? format(new Date(v.violation_date), "dd MMM yyyy", { locale: idLocale })
                        : "-"}
                    </p>
                  </div>
                  <Badge variant="destructive" className="text-xs shrink-0 ml-2 shadow-sm">
                    {v.points} poin
                  </Badge>
                </motion.div>
              ))
            )}
          </AnimatePresence>
          {filteredV.length > VISIBLE_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs rounded-xl hover:bg-primary/10"
              onClick={() => setShowAllV((s) => !s)}
            >
              {showAllV ? "Tampilkan lebih sedikit" : `Lihat semua (${filteredV.length})`}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="hover:shadow-lg transition-all duration-300 border-border/60">
        <CardHeader className="pb-3">
          <SectionHeader
            icon={Award}
            title="Prestasi terbaru"
            description={`${filteredA.length} data (maks. ${RECENT_FETCH_LIMIT} terbaru pada periode ini)`}
            accent="amber"
          />
          {achievements.length > VISIBLE_LIMIT && (
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari siswa atau nama prestasi"
                value={searchA}
                onChange={(e) => setSearchA(e.target.value)}
                className="h-9 pl-9 text-xs rounded-xl bg-muted/40 border-border/60"
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          <AnimatePresence mode="popLayout">
            {visibleA.length === 0 ? (
              <EmptyState icon="🏆" title="Belum ada prestasi" subtitle="Data muncul setelah prestasi diinput" />
            ) : (
              visibleA.map((a: any) => (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-start justify-between p-3 rounded-xl bg-gradient-to-r from-muted/50 to-muted/20 border border-transparent hover:border-amber-500/20 transition-colors"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{a.students?.full_name || "-"}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.achievement_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.achievement_date
                        ? format(new Date(a.achievement_date), "dd MMM yyyy", { locale: idLocale })
                        : "-"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0 ml-2">
                    <Badge variant="outline" className="text-xs">
                      {prettyLabel(a.achievement_type)}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {prettyLabel(a.level)}
                    </Badge>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
          {filteredA.length > VISIBLE_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs rounded-xl hover:bg-primary/10"
              onClick={() => setShowAllA((s) => !s)}
            >
              {showAllA ? "Tampilkan lebih sedikit" : `Lihat semua (${filteredA.length})`}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

// =====================================================================
// KONTEN UTAMA (hook baru jalan setelah ProtectedRoute meloloskan peran)
// =====================================================================
function KesiswaanDashboardContent() {
  const { selectedYear, selectedSemester } = useAcademicYear();
  const today = useToday();

  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { startDate, endDate, setStartDate, setEndDate, setPeriod, getPeriodLabel } =
    useDateRangeFilter();

  const { data: attendanceRecap, isLoading: isLoadingRecap, isError: recapError } =
    useAttendanceRecap(startDate, endDate, selectedYear, selectedSemester);

  const { data: attendanceByClass, isLoading: isLoadingClass, isError: classError } =
    useAttendanceByClass(startDate, endDate, "kesiswaan", selectedYear, selectedSemester);

  // Absensi khusus HARI INI, dipakai kartu "Kelas belum mengisi absensi".
  const { data: todayByClass, isLoading: isLoadingToday, isError: todayError } =
    useAttendanceByClass(today, today, "kesiswaan", selectedYear, selectedSemester);

  const { data: dailyAttendanceTrend, isError: trendError } =
    useDailyAttendanceTrend(startDate, endDate, "kesiswaan");
  const { data: lateStudents } = useLateStudents(startDate, endDate, "kesiswaan");
  const { data: lateViolationsTrend } = useLateViolationsTrend(startDate, endDate, "kesiswaan");
  const { data: studentViolationDetails } = useStudentViolationDetails(
    selectedStudent,
    startDate,
    endDate
  );

  const { data: stats, isLoading: isLoadingStats, isError: statsError } =
    useKesiswaanStats(startDate, endDate);

  const { handleExportPDF, handleExportExcel } = useDashboardExport(
    startDate,
    endDate,
    attendanceRecap
  );
  const { data: genderStats, isLoading: isLoadingGender } = useStudentGenderStats(
    selectedYear,
    "kesiswaan"
  );

  const queryClient = useQueryClient();
  // Menyegarkan semua query yang sedang aktif di halaman ini,
  // tanpa bergantung pada tebakan nama queryKey.
  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);
  useAutoRefresh(autoRefresh, refreshAll);

  const attendancePercent = useMemo(
    () => percentOf(attendanceRecap?.hadir || 0, attendanceRecap?.total || 0),
    [attendanceRecap]
  );

  const handleStudentClick = useCallback((student: any) => {
    setSelectedStudent(student);
    setIsDetailModalOpen(true);
  }, []);

  const clearFilter = useCallback(() => {
    setStartDate(undefined);
    setEndDate(undefined);
  }, [setStartDate, setEndDate]);

  const failedParts = [
    statsError && "pelanggaran & prestasi",
    recapError && "rekap kehadiran",
    classError && "kehadiran per kelas",
    todayError && "absensi hari ini",
    trendError && "tren kehadiran",
  ].filter(Boolean) as string[];

  const scopeLabel =
    startDate || endDate
      ? `${startDate ? format(startDate, "dd MMM yyyy", { locale: idLocale }) : "awal"} – ${
          endDate ? format(endDate, "dd MMM yyyy", { locale: idLocale }) : "sekarang"
        }`
      : "semua waktu";

  return (
    <>
      <AnimatedBackground />

      <SafeErrorBoundary label="Dashboard utama">
        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Dashboard Kesiswaan
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Ringkasan data kesiswaan, absensi, dan pelanggaran
              </p>
              <Badge variant="outline" className="mt-2 text-[11px] font-normal">
                Cakupan pelanggaran & prestasi: {scopeLabel}
              </Badge>
            </div>

            <UnifiedDateFilter
              startDate={startDate}
              endDate={endDate}
              setStartDate={setStartDate}
              setEndDate={setEndDate}
              autoRefresh={autoRefresh}
              setAutoRefresh={setAutoRefresh}
              onClear={clearFilter}
              onRefresh={refreshAll}
            />
          </div>

          {failedParts.length > 0 && <ErrorBanner messages={failedParts} onRetry={refreshAll} />}

          <KesiswaanStatsCards
            loading={isLoadingStats || isLoadingRecap}
            statsFailed={!!statsError}
            attendanceFailed={!!recapError}
            studentCount={stats?.studentCount || 0}
            attendancePercent={attendancePercent}
            attendancePresent={attendanceRecap?.hadir || 0}
            attendanceTotal={attendanceRecap?.total || 0}
            totalViolations={stats?.totalViolations || 0}
            totalPoints={stats?.totalPoints || 0}
            totalAchievements={stats?.totalAchievements || 0}
          />

          {genderStats && (
            <StudentGenderStatsCard
              totalMale={genderStats.totalMale}
              totalFemale={genderStats.totalFemale}
              totalStudents={genderStats.totalStudents}
              byClass={genderStats.byClass}
              byGrade={genderStats.byGrade}
            />
          )}

          <DashboardAttendanceRecap
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            setPeriod={setPeriod}
            attendanceRecap={attendanceRecap}
            onExportPDF={handleExportPDF}
            onExportExcel={handleExportExcel}
          />

          <ClassAttendanceChart attendanceByClass={attendanceByClass} isLoading={isLoadingClass} />

          <SafeErrorBoundary label="Kelas belum mengisi absensi">
            <UnfilledClassesCard
              academicYear={selectedYear}
              today={today}
              todayByClass={todayByClass}
              allClasses={(genderStats as any)?.byClass || []}
              isLoading={isLoadingGender || isLoadingToday}
              failed={!!todayError}
            />
          </SafeErrorBoundary>

          <ElegantAttendanceTrend data={dailyAttendanceTrend || []} />

          <Suspense fallback={<WaterLoaderCard className="min-h-[400px]" />}>
            <DashboardLateStudents
              lateStudents={lateStudents || []}
              lateViolationsTrend={lateViolationsTrend || []}
              getPeriodLabel={getPeriodLabel}
              onStudentClick={handleStudentClick}
            />
          </Suspense>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ViolationsChart data={stats?.violationsByCategory || []} />
            <HorizontalBarCard
              title="Prestasi per jenis"
              description="Distribusi jenis prestasi"
              accent="amber"
              gradId="gradAmber"
              color="#f59e0b"
              data={stats?.achievementsByType || []}
              emptyTitle="Belum ada data prestasi"
            />
            <HorizontalBarCard
              title="Prestasi per tingkat"
              description="Distribusi tingkat prestasi"
              accent="violet"
              gradId="gradIndigo"
              color="#6366f1"
              data={stats?.achievementsByLevel || []}
              emptyTitle="Belum ada data tingkat"
            />
          </div>

          <RecentActivity
            violations={stats?.recentViolations || []}
            achievements={stats?.recentAchievements || []}
          />
        </div>
      </SafeErrorBoundary>

      <Suspense fallback={null}>
        <StudentViolationModal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          selectedStudent={selectedStudent}
          violationDetails={studentViolationDetails || []}
          getPeriodLabel={getPeriodLabel}
        />
      </Suspense>
    </>
  );
}

// =====================================================================
// EXPORT
// =====================================================================
export default function KesiswaanDashboard() {
  return (
    <ProtectedRoute allowedRoles={["kesiswaan", "admin"]}>
      <DashboardLayout>
        <KesiswaanDashboardContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
