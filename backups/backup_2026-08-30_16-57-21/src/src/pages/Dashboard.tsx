import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, lazy, Suspense } from 'react';
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
  useStudentViolationDetails
} from '@/hooks/useDashboardData';
import { DashboardWelcomeBanner } from '@/components/dashboard/DashboardWelcomeBanner';
import { DashboardStatsCards } from '@/components/dashboard/DashboardStatsCards';
import { DashboardAttendanceRecap } from '@/components/dashboard/DashboardAttendanceRecap';
import { DashboardTodaySchedule } from '@/components/dashboard/DashboardTodaySchedule';
import { DashboardAnnouncements } from '@/components/dashboard/DashboardAnnouncements';
import { DashboardTeacherView } from '@/components/dashboard/DashboardTeacherView';
import { WaterLoaderCard } from '@/components/ui/water-progress-loader';

// Lazy load heavy chart components
const DashboardAttendanceCharts = lazy(() => import('@/components/dashboard/DashboardAttendanceCharts').then(m => ({ default: m.DashboardAttendanceCharts })));
const DashboardLateStudents = lazy(() => import('@/components/dashboard/DashboardLateStudents').then(m => ({ default: m.DashboardLateStudents })));
const StudentViolationModal = lazy(() => import('@/components/dashboard/StudentViolationModal').then(m => ({ default: m.StudentViolationModal })));

export default function Dashboard() {
  const { userRole, user } = useAuth();
  const { selectedYear, selectedSemester } = useAcademicYear();
  
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const { startDate, endDate, setStartDate, setEndDate, setPeriod, getPeriodLabel } = useDateRangeFilter();
  
  const { data: profile } = useUserProfile(user?.id);
  const { data: stats } = useDashboardStats(userRole, selectedYear, selectedSemester);
  const { data: genderStats } = useStudentGenderStats(selectedYear, userRole, user?.id);
  const { data: todaySchedules } = useTodaySchedules(user?.id, userRole, selectedYear, selectedSemester);
  const { data: attendanceRecap } = useAttendanceRecap(startDate, endDate, selectedYear, selectedSemester);
  const { data: attendanceByClass } = useAttendanceByClass(startDate, endDate, userRole, selectedYear, selectedSemester);
  const { data: dailyAttendanceTrend } = useDailyAttendanceTrend(startDate, endDate, userRole);
  const { data: lateStudents } = useLateStudents(startDate, endDate, userRole);
  const { data: lateViolationsTrend } = useLateViolationsTrend(startDate, endDate, userRole);
  const { data: announcements } = useAnnouncements();
  const { data: teacherData } = useTeacherProfile(user?.id, userRole);
  const { data: teacherTasks } = useTeacherTasks(user?.id, userRole, todaySchedules);
  const { data: studentViolationDetails } = useStudentViolationDetails(selectedStudent, startDate, endDate);
  const { data: teacherClassAttendance } = useTeacherClassAttendance(user?.id, selectedYear, String(selectedSemester));

  const { handleExportPDF, handleExportExcel } = useDashboardExport(startDate, endDate, attendanceRecap);

  const lowAttendanceClasses = attendanceByClass?.filledClasses?.filter(
    (classData: any) => classData.attendanceRate < 80 && classData.total > 0
  ) || [];

  const handleStudentClick = (student: any) => {
    setSelectedStudent(student);
    setIsDetailModalOpen(true);
  };

  // Redirect roles to their dedicated dashboards
  if (userRole === 'super_admin') {
    return <Navigate to="/super-admin" replace />;
  }
  if (userRole === 'bendahara') {
    return <Navigate to="/bendahara-dashboard" replace />;
  }
  if (userRole === 'tata_usaha') {
    return <Navigate to="/tata-usaha-dashboard" replace />;
  }
  if (userRole === 'kesiswaan') {
    return <Navigate to="/kesiswaan-dashboard" replace />;
  }
  if (userRole === 'siswa') {
    return <Navigate to="/student-dashboard" replace />;
  }
  if (userRole === 'guru_piket') {
    return <Navigate to="/guru-piket-dashboard" replace />;
  }

  if (userRole === 'admin') {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <DashboardWelcomeBanner profile={profile} userRole={userRole} />
          <DashboardStatsCards stats={stats} />
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
          <Suspense fallback={<WaterLoaderCard className="min-h-[400px]" />}>
            <DashboardAttendanceCharts
              startDate={startDate}
              endDate={endDate}
              dailyAttendanceTrend={dailyAttendanceTrend}
              attendanceByClass={attendanceByClass}
              lowAttendanceClasses={lowAttendanceClasses}
            />
          </Suspense>
          <Suspense fallback={<WaterLoaderCard className="min-h-[400px]" />}>
            <DashboardLateStudents
              lateStudents={lateStudents || []}
              lateViolationsTrend={lateViolationsTrend || []}
              getPeriodLabel={getPeriodLabel}
              onStudentClick={handleStudentClick}
            />
          </Suspense>
          <div className="grid gap-6 md:grid-cols-2">
            <DashboardTodaySchedule todaySchedules={todaySchedules || []} userRole={userRole} />
            <DashboardAnnouncements announcements={announcements || []} />
          </div>
        </div>

        <Suspense fallback={null}>
          <StudentViolationModal
            isOpen={isDetailModalOpen}
            onClose={() => setIsDetailModalOpen(false)}
            selectedStudent={selectedStudent}
            violationDetails={studentViolationDetails || []}
            getPeriodLabel={getPeriodLabel}
          />
        </Suspense>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <DashboardWelcomeBanner profile={profile} userRole={userRole} teacherData={teacherData} />
        <DashboardTeacherView teacherTasks={teacherTasks} />
        {teacherClassAttendance && (
          <TeacherClassAttendanceCard data={teacherClassAttendance} />
        )}
        {genderStats && genderStats.totalStudents > 0 && (
          <StudentGenderStatsCard
            totalMale={genderStats.totalMale}
            totalFemale={genderStats.totalFemale}
            totalStudents={genderStats.totalStudents}
            byClass={genderStats.byClass}
            byGrade={genderStats.byGrade}
            isTeacher
          />
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <DashboardTodaySchedule todaySchedules={todaySchedules || []} userRole={userRole} />
          <DashboardAnnouncements announcements={announcements || []} />
        </div>
      </div>
    </DashboardLayout>
  );
}
