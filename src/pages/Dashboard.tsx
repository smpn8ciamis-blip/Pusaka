import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, lazy, Suspense, useMemo, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useDateRangeFilter } from '@/hooks/useDateRangeFilter';
import { useStudentGenderStats } from '@/hooks/useStudentGenderStats';
import { StudentGenderStatsCard } from '@/components/dashboard/StudentGenderStatsCard';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { useTeacherClassAttendance } from '@/hooks/useTeacherClassAttendance';
import { TeacherClassAttendanceCard } from '@/components/dashboard/TeacherClassAttendanceCard';
import {
  useDashboardStats,
  useTodaySchedules,
  useAttendanceRecap,
  useAttendanceByClass,
  useDailyAttendanceTrend,
  useLateStudents,
  useLateViolationsTrend,
  useAnnouncements,
  useTeacherProfile,
  useTeacherTasks,
  useUserProfile,
  useStudentViolationDetails,
} from '@/hooks/useDashboardData';
import { DashboardWelcomeBanner } from '@/components/dashboard/DashboardWelcomeBanner';
import { DashboardStatsCards } from '@/components/dashboard/DashboardStatsCards';
import { DashboardAttendanceRecap } from '@/components/dashboard/DashboardAttendanceRecap';
import { DashboardTodaySchedule } from '@/components/dashboard/DashboardTodaySchedule';
import { DashboardAnnouncements } from '@/components/dashboard/DashboardAnnouncements';
import { DashboardTeacherView } from '@/components/dashboard/DashboardTeacherView';
import { WaterLoaderCard } from '@/components/ui/water-progress-loader';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ROLE_REDIRECTS: Record<string, string> = {
  super_admin: '/super-admin',
  bendahara: '/bendahara-dashboard',
  tata_usaha: '/tata-usaha-dashboard',
  kesiswaan: '/kesiswaan-dashboard',
  siswa: '/student-dashboard',
  guru_piket: '/guru-piket-dashboard',
  admin_web: '/web-admin',
};

const LOW_ATTENDANCE_THRESHOLD = 80;
const CHART_FALLBACK_HEIGHT = 'min-h-[400px]';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SelectedStudent {
  id: string;
  name: string;
  class: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Lazy-loaded heavy chart components
// ---------------------------------------------------------------------------
const DashboardAttendanceCharts = lazy(() =>
  import('@/components/dashboard/DashboardAttendanceCharts').then((m) => ({
    default: m.DashboardAttendanceCharts,
  })),
);
const DashboardLateStudents = lazy(() =>
  import('@/components/dashboard/DashboardLateStudents').then((m) => ({
    default: m.DashboardLateStudents,
  })),
);
const PunctualityChart = lazy(() =>
  import('@/components/dashboard/PunctualityChart').then((m) => ({
    default: m.PunctualityChart,
  })),
);
const StudentViolationModal = lazy(() =>
  import('@/components/dashboard/StudentViolationModal').then((m) => ({
    default: m.StudentViolationModal,
  })),
);

// ---------------------------------------------------------------------------
// Reusable Suspense wrapper
// ---------------------------------------------------------------------------
function LazySection({
  children,
  minHeight = CHART_FALLBACK_HEIGHT,
  fallback,
}: {
  children: ReactNode;
  minHeight?: string;
  fallback?: ReactNode;
}) {
  return (
    <Suspense fallback={fallback ?? <WaterLoaderCard className={minHeight} />}>
      {children}
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Modern section wrapper — konsisten untuk semua blok konten
// ---------------------------------------------------------------------------
function Section({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section
      className={`
        relative rounded-2xl
        bg-white/70 dark:bg-slate-900/60
        backdrop-blur-sm
        border border-slate-200/70 dark:border-slate-800/70
        shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)]
        transition-shadow duration-300
        hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-12px_rgba(15,23,42,0.14)]
        animate-[fadeInUp_0.5s_ease-out_both]
        ${className}
      `}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page header (mini) — muncul di atas konten
// ---------------------------------------------------------------------------
function DashboardHeader() {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 animate-pulse" />
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        Dashboard
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const { userRole, user } = useAuth();
  const { selectedYear, selectedSemester } = useAcademicYear();

  const [selectedStudent, setSelectedStudent] = useState<SelectedStudent | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const { startDate, endDate, setStartDate, setEndDate, setPeriod, getPeriodLabel } =
    useDateRangeFilter();

  // Data hooks
  const { data: profile } = useUserProfile(user?.id);
  const { data: stats } = useDashboardStats(userRole, selectedYear, selectedSemester);
  const { data: genderStats } = useStudentGenderStats(selectedYear, userRole, user?.id);
  const { data: todaySchedules } = useTodaySchedules(
    user?.id,
    userRole,
    selectedYear,
    selectedSemester,
  );
  const { data: attendanceRecap } = useAttendanceRecap(
    startDate,
    endDate,
    selectedYear,
    selectedSemester,
  );
  const { data: attendanceByClass } = useAttendanceByClass(
    startDate,
    endDate,
    userRole,
    selectedYear,
    selectedSemester,
  );
  const { data: dailyAttendanceTrend } = useDailyAttendanceTrend(startDate, endDate, userRole);
  const { data: lateStudents } = useLateStudents(startDate, endDate, userRole);
  const { data: lateViolationsTrend } = useLateViolationsTrend(startDate, endDate, userRole);
  const { data: announcements } = useAnnouncements();
  const { data: teacherData } = useTeacherProfile(user?.id, userRole);
  const { data: teacherTasks } = useTeacherTasks(user?.id, userRole, todaySchedules);
  const { data: studentViolationDetails } = useStudentViolationDetails(
    selectedStudent,
    startDate,
    endDate,
  );
  const { data: teacherClassAttendance } = useTeacherClassAttendance(
    user?.id,
    selectedYear,
    String(selectedSemester),
  );

  const { handleExportPDF, handleExportExcel } = useDashboardExport(
    startDate,
    endDate,
    attendanceRecap,
  );

  // Derived data (memoized)
  const lowAttendanceClasses = useMemo(
    () =>
      attendanceByClass?.filledClasses?.filter(
        (classData: { attendanceRate: number; total: number }) =>
          classData.attendanceRate < LOW_ATTENDANCE_THRESHOLD && classData.total > 0,
      ) ?? [],
    [attendanceByClass],
  );

  const handleStudentClick = (student: SelectedStudent) => {
    setSelectedStudent(student);
    setIsDetailModalOpen(true);
  };

  const handleCloseModal = () => setIsDetailModalOpen(false);

  // Role-based redirect (O(1) lookup)
  const redirectTo = userRole ? ROLE_REDIRECTS[userRole] : undefined;
  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  // -------------------------------------------------------------------------
  // Admin dashboard
  // -------------------------------------------------------------------------
  if (userRole === 'admin') {
    return (
      <DashboardLayout>
        <div className="relative space-y-6 animate-fade-in">
          {/* Ambient gradient background — super ringan, hanya CSS */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          >
            <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-400/10 blur-3xl" />
            <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-violet-400/10 blur-3xl" />
          </div>

          <DashboardHeader />

          {/* Hero banner — tanpa wrapper card, biar jadi focal point */}
          <DashboardWelcomeBanner profile={profile} userRole={userRole} />

          {/* Stats cards */}
          <Section delay={40}>
            <div className="p-4 sm:p-5">
              <DashboardStatsCards stats={stats} />
            </div>
          </Section>

          {/* Gender stats */}
          {genderStats && (
            <Section delay={80}>
              <div className="p-4 sm:p-5">
                <StudentGenderStatsCard
                  totalMale={genderStats.totalMale}
                  totalFemale={genderStats.totalFemale}
                  totalStudents={genderStats.totalStudents}
                  byClass={genderStats.byClass}
                  byGrade={genderStats.byGrade}
                />
              </div>
            </Section>
          )}

          {/* Attendance recap */}
          <Section delay={120}>
            <div className="p-4 sm:p-5">
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
            </div>
          </Section>

          {/* Charts */}
          <Section delay={160}>
            <div className="p-4 sm:p-5">
              <LazySection>
                <DashboardAttendanceCharts
                  startDate={startDate}
                  endDate={endDate}
                  dailyAttendanceTrend={dailyAttendanceTrend}
                  attendanceByClass={attendanceByClass}
                  lowAttendanceClasses={lowAttendanceClasses}
                />
              </LazySection>
            </div>
          </Section>

          <Section delay={200}>
            <div className="p-4 sm:p-5">
              <LazySection>
                <PunctualityChart startDate={startDate} endDate={endDate} />
              </LazySection>
            </div>
          </Section>

          {/* Late students */}
          <Section delay={240}>
            <div className="p-4 sm:p-5">
              <LazySection>
                <DashboardLateStudents
                  lateStudents={lateStudents || []}
                  lateViolationsTrend={lateViolationsTrend || []}
                  getPeriodLabel={getPeriodLabel}
                  onStudentClick={handleStudentClick}
                />
              </LazySection>
            </div>
          </Section>

          {/* Bottom grid — schedule & announcements */}
          <div className="grid gap-6 md:grid-cols-2">
            <Section delay={280}>
              <div className="p-4 sm:p-5">
                <DashboardTodaySchedule
                  todaySchedules={todaySchedules || []}
                  userRole={userRole}
                />
              </div>
            </Section>
            <Section delay={320}>
              <div className="p-4 sm:p-5">
                <DashboardAnnouncements announcements={announcements || []} />
              </div>
            </Section>
          </div>
        </div>

        <LazySection fallback={null}>
          <StudentViolationModal
            isOpen={isDetailModalOpen}
            onClose={handleCloseModal}
            selectedStudent={selectedStudent}
            violationDetails={studentViolationDetails || []}
            getPeriodLabel={getPeriodLabel}
          />
        </LazySection>
      </DashboardLayout>
    );
  }

  // -------------------------------------------------------------------------
  // Teacher / fallback dashboard
  // -------------------------------------------------------------------------
  return (
    <DashboardLayout>
      <div className="relative space-y-6 animate-fade-in">
        {/* Ambient gradient background */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
        </div>

        <DashboardHeader />

        <DashboardWelcomeBanner
          profile={profile}
          userRole={userRole}
          teacherData={teacherData}
        />

        <Section delay={40}>
          <div className="p-4 sm:p-5">
            <DashboardTeacherView teacherTasks={teacherTasks} />
          </div>
        </Section>

        {teacherClassAttendance && (
          <Section delay={80}>
            <div className="p-4 sm:p-5">
              <TeacherClassAttendanceCard data={teacherClassAttendance} />
            </div>
          </Section>
        )}

        {teacherClassAttendance?.classId && (
          <Section delay={120}>
            <div className="p-4 sm:p-5">
              <LazySection>
                <PunctualityChart
                  startDate={startDate}
                  endDate={endDate}
                  classId={teacherClassAttendance.classId}
                  title="Ketepatan Waktu Kehadiran Kelas Perwalian"
                />
              </LazySection>
            </div>
          </Section>
        )}

        {genderStats && genderStats.totalStudents > 0 && (
          <Section delay={160}>
            <div className="p-4 sm:p-5">
              <StudentGenderStatsCard
                totalMale={genderStats.totalMale}
                totalFemale={genderStats.totalFemale}
                totalStudents={genderStats.totalStudents}
                byClass={genderStats.byClass}
                byGrade={genderStats.byGrade}
                isTeacher
              />
            </div>
          </Section>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Section delay={200}>
            <div className="p-4 sm:p-5">
              <DashboardTodaySchedule todaySchedules={todaySchedules || []} userRole={userRole} />
            </div>
          </Section>
          <Section delay={240}>
            <div className="p-4 sm:p-5">
              <DashboardAnnouncements announcements={announcements || []} />
            </div>
          </Section>
        </div>
      </div>
    </DashboardLayout>
  );
}