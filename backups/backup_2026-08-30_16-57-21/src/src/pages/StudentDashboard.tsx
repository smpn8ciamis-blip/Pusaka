import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { 
  Calendar, BookOpen, AlertTriangle, Bell, Clock, Award, Trophy, Medal,
  TrendingUp, CheckCircle, XCircle, Star, Sparkles, ArrowRightLeft
} from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { WaterProgressLoader } from "@/components/ui/water-progress-loader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StudentWelcomeBanner } from "@/components/dashboard/StudentWelcomeBanner";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const }
  })
};

const StudentDashboardPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  // Fetch student account and data
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
    enabled: !!user
  });

  const { data: classInfo } = useQuery({
    queryKey: ['student-class', studentAccount?.students?.class_id],
    queryFn: async () => {
      if (!studentAccount?.students?.class_id) return null;
      const { data, error } = await supabase
        .from('classes')
        .select('*, teachers(*, profiles:profiles_public(full_name))')
        .eq('id', studentAccount.students.class_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!studentAccount?.students?.class_id
  });

  const { data: todaySchedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['student-schedules-today', studentAccount?.students?.class_id],
    queryFn: async () => {
      if (!studentAccount?.students?.class_id) return [];
      const today = new Date().getDay();
      const { data, error } = await supabase
        .from('schedules')
        .select('*, teachers(*, profiles:profiles_public(full_name))')
        .eq('class_id', studentAccount.students.class_id)
        .eq('day_of_week', today)
        .order('start_time');
      if (error) throw error;
      return data || [];
    },
    enabled: !!studentAccount?.students?.class_id
  });

  const { data: attendanceSummary, isLoading: attendanceLoading } = useQuery({
    queryKey: ['student-attendance-summary', studentAccount?.student_id],
    queryFn: async () => {
      if (!studentAccount?.student_id) return null;
      const { data, error } = await supabase
        .from('attendance')
        .select('status')
        .eq('student_id', studentAccount.student_id);
      if (error) throw error;
      const summary = { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: data?.length || 0 };
      data?.forEach((a: any) => {
        if (summary[a.status as keyof typeof summary] !== undefined) {
          summary[a.status as keyof typeof summary]++;
        }
      });
      return summary;
    },
    enabled: !!studentAccount?.student_id
  });

  const { data: violations, isLoading: violationsLoading } = useQuery({
    queryKey: ['student-violations', studentAccount?.student_id],
    queryFn: async () => {
      if (!studentAccount?.student_id) return [];
      const { data, error } = await supabase
        .from('student_violations')
        .select('*, violation_types(*)')
        .eq('student_id', studentAccount.student_id)
        .order('violation_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!studentAccount?.student_id
  });

  const { data: achievements, isLoading: achievementsLoading } = useQuery({
    queryKey: ['student-achievements', studentAccount?.student_id],
    queryFn: async () => {
      if (!studentAccount?.student_id) return [];
      const { data, error } = await supabase
        .from('student_achievements')
        .select('*')
        .eq('student_id', studentAccount.student_id)
        .order('achievement_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!studentAccount?.student_id
  });

  const { data: mutationHistory, isLoading: mutationLoading } = useQuery({
    queryKey: ['student-mutations-history', studentAccount?.student_id],
    queryFn: async () => {
      if (!studentAccount?.student_id) return [];
      const { data, error } = await supabase
        .from('student_mutations')
        .select('*')
        .eq('student_id', studentAccount.student_id)
        .order('mutation_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!studentAccount?.student_id
  });

  const totalViolationPoints = violations?.reduce((sum, v) => sum + (v.points || 0), 0) || 0;

  const { data: announcements, isLoading: announcementsLoading } = useQuery({
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
    }
  });

  const { data: grades, isLoading: gradesLoading } = useQuery({
    queryKey: ['student-grades', studentAccount?.student_id],
    queryFn: async () => {
      if (!studentAccount?.student_id) return [];
      const { data, error } = await supabase
        .from('grades')
        .select('*, schedules(subject, teachers(*, profiles:profiles_public(full_name)))')
        .eq('student_id', studentAccount.student_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!studentAccount?.student_id
  });

  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  if (accountLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-4">
            <WaterProgressLoader size="lg" isLoading={true} />
            <span className="text-sm text-muted-foreground">Memuat data...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const student = studentAccount?.students;
  const attendancePercentage = attendanceSummary?.total 
    ? Math.round((attendanceSummary.hadir / attendanceSummary.total) * 100) 
    : 0;

  const averageGrade = grades && grades.length > 0
    ? (grades.reduce((sum, g) => sum + (g.final_grade || 0), 0) / grades.length).toFixed(1)
    : null;

  // Determine what content to show based on tab
  const renderContent = () => {
    switch (activeTab) {
      case 'schedule':
        return renderScheduleTab();
      case 'grades':
        return renderGradesTab();
      case 'attendance':
        return renderAttendanceTab();
      case 'violations':
        return renderViolationsTab();
      case 'achievements':
        return renderAchievementsTab();
      case 'announcements':
        return renderAnnouncementsTab();
      default:
        return renderOverview();
    }
  };

  const renderOverview = () => (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { 
            label: 'Kehadiran', 
            value: `${attendancePercentage}%`, 
            icon: CheckCircle, 
            color: 'text-emerald-500',
            bgColor: 'bg-emerald-500/10',
            borderColor: 'border-emerald-500/20',
            sub: `${attendanceSummary?.hadir || 0} dari ${attendanceSummary?.total || 0} hari`
          },
          { 
            label: 'Rata-rata Nilai', 
            value: averageGrade || '-', 
            icon: TrendingUp, 
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
            borderColor: 'border-blue-500/20',
            sub: `${grades?.length || 0} mata pelajaran`
          },
          { 
            label: 'Poin Pelanggaran', 
            value: totalViolationPoints, 
            icon: AlertTriangle, 
            color: totalViolationPoints === 0 ? 'text-emerald-500' : totalViolationPoints < 50 ? 'text-amber-500' : 'text-red-500',
            bgColor: totalViolationPoints === 0 ? 'bg-emerald-500/10' : totalViolationPoints < 50 ? 'bg-amber-500/10' : 'bg-red-500/10',
            borderColor: totalViolationPoints === 0 ? 'border-emerald-500/20' : totalViolationPoints < 50 ? 'border-amber-500/20' : 'border-red-500/20',
            sub: `${violations?.length || 0} catatan`
          },
          { 
            label: 'Prestasi', 
            value: achievements?.length || 0, 
            icon: Trophy, 
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10',
            borderColor: 'border-amber-500/20',
            sub: 'penghargaan'
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
          >
            <Card className={`border ${stat.borderColor} shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-9 h-9 ${stat.bgColor} rounded-xl flex items-center justify-center`}>
                    <stat.icon className={`h-4.5 w-4.5 ${stat.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold tracking-tight text-foreground">{stat.value}</p>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">{stat.label}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Attendance Detail */}
      {renderAttendanceTab()}

      {/* Today Schedule & Announcements side by side */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
              </div>
              Jadwal Hari Ini
            </CardTitle>
            <CardDescription>
              {dayNames[new Date().getDay()]}, {format(new Date(), 'dd MMMM yyyy', { locale: localeId })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {schedulesLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Memuat...</div>
            ) : todaySchedules && todaySchedules.length > 0 ? (
              <div className="space-y-2">
                {todaySchedules.slice(0, 5).map((schedule: any) => (
                  <div key={schedule.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 hover:bg-accent/30 transition-colors">
                    <div className="text-center min-w-[44px]">
                      <p className="font-mono text-xs font-semibold">{schedule.start_time?.slice(0, 5)}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{schedule.end_time?.slice(0, 5)}</p>
                    </div>
                    <div className="w-px h-8 bg-primary/20" />
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{schedule.subject}</p>
                      <p className="text-xs text-muted-foreground">{schedule.teachers?.profiles?.full_name || 'Guru'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm">Tidak ada jadwal hari ini 🎉</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center">
                <Bell className="h-3.5 w-3.5 text-primary" />
              </div>
              Pengumuman Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent>
            {announcementsLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">Memuat...</div>
            ) : announcements && announcements.length > 0 ? (
              <div className="space-y-2">
                {announcements.slice(0, 3).map((a: any) => (
                  <div key={a.id} className="p-2.5 rounded-lg border border-border/50 hover:bg-accent/30 transition-colors">
                    <p className="font-semibold text-sm">{a.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{a.content}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {format(new Date(a.created_at), 'dd MMM yyyy', { locale: localeId })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm">Tidak ada pengumuman</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );

  const renderAttendanceTab = () => (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-7 h-7 bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          Detail Kehadiran
        </CardTitle>
      </CardHeader>
      <CardContent>
        {attendanceLoading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Memuat...</div>
        ) : attendanceSummary && attendanceSummary.total > 0 ? (
          <div className="space-y-3">
            <div className="w-full h-3 bg-muted rounded-full overflow-hidden flex">
              {attendanceSummary.hadir > 0 && (
                <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(attendanceSummary.hadir / attendanceSummary.total) * 100}%` }} />
              )}
              {attendanceSummary.izin > 0 && (
                <div className="bg-blue-500 h-full transition-all" style={{ width: `${(attendanceSummary.izin / attendanceSummary.total) * 100}%` }} />
              )}
              {attendanceSummary.sakit > 0 && (
                <div className="bg-amber-500 h-full transition-all" style={{ width: `${(attendanceSummary.sakit / attendanceSummary.total) * 100}%` }} />
              )}
              {attendanceSummary.alpa > 0 && (
                <div className="bg-red-500 h-full transition-all" style={{ width: `${(attendanceSummary.alpa / attendanceSummary.total) * 100}%` }} />
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Hadir', value: attendanceSummary.hadir, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
                { label: 'Izin', value: attendanceSummary.izin, color: 'bg-blue-500', textColor: 'text-blue-600' },
                { label: 'Sakit', value: attendanceSummary.sakit, color: 'bg-amber-500', textColor: 'text-amber-600' },
                { label: 'Alpa', value: attendanceSummary.alpa, color: 'bg-red-500', textColor: 'text-red-600' },
              ].map((item) => (
                <div key={item.label} className="text-center p-2.5 rounded-xl bg-muted/40 border border-border/30">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <div className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-[10px] text-muted-foreground">{item.label}</span>
                  </div>
                  <p className={`text-lg font-bold ${item.textColor}`}>{item.value}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {attendanceSummary.total > 0 ? Math.round((item.value / attendanceSummary.total) * 100) : 0}%
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60 text-center">
              Total {attendanceSummary.total} hari tercatat
            </p>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm">Belum ada data kehadiran</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderScheduleTab = () => (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              Jadwal Hari Ini
            </CardTitle>
            <CardDescription className="mt-1">
              {dayNames[new Date().getDay()]}, {format(new Date(), 'dd MMMM yyyy', { locale: localeId })}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">{todaySchedules?.length || 0} mapel</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {schedulesLoading ? (
          <div className="text-center py-8 text-muted-foreground">Memuat jadwal...</div>
        ) : todaySchedules && todaySchedules.length > 0 ? (
          <div className="space-y-2">
            {todaySchedules.map((schedule: any, idx: number) => (
              <motion.div 
                key={schedule.id} 
                custom={idx}
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                className="flex items-center gap-4 p-3.5 rounded-xl border border-border/50 bg-card hover:bg-accent/30 transition-colors group"
              >
                <div className="text-center min-w-[52px]">
                  <p className="font-mono text-sm font-semibold text-foreground">{schedule.start_time?.slice(0, 5)}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{schedule.end_time?.slice(0, 5)}</p>
                </div>
                <div className="w-px h-10 bg-primary/20 group-hover:bg-primary/40 transition-colors" />
                <div className="flex-1">
                  <p className="font-semibold text-sm text-foreground">{schedule.subject}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{schedule.teachers?.profiles?.full_name || 'Guru'}</p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium">Tidak ada jadwal hari ini</p>
            <p className="text-xs mt-1">Nikmati hari liburmu! 🎉</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderGradesTab = () => (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-blue-500" />
              </div>
              Nilai Akademik
            </CardTitle>
            <CardDescription className="mt-1">
              {averageGrade ? `Rata-rata: ${averageGrade}` : 'Belum ada nilai'}
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">{grades?.length || 0} nilai</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {gradesLoading ? (
          <div className="text-center py-8 text-muted-foreground">Memuat nilai...</div>
        ) : grades && grades.length > 0 ? (
          <div className="space-y-2">
            {grades.map((grade: any, idx: number) => {
              const score = grade.final_grade || 0;
              const scoreColor = score >= 80 ? 'text-emerald-600 bg-emerald-500/10' : score >= 70 ? 'text-blue-600 bg-blue-500/10' : 'text-red-600 bg-red-500/10';
              return (
                <motion.div 
                  key={grade.id}
                  custom={idx}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="p-3.5 rounded-xl border border-border/50 bg-card hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="font-semibold text-sm text-foreground">{grade.schedules?.subject || 'Mata Pelajaran'}</p>
                    <span className={`text-lg font-bold px-3 py-0.5 rounded-lg ${scoreColor}`}>
                      {grade.final_grade?.toFixed(1) || '-'}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: 'Tugas', value: grade.tugas },
                      { label: 'Kuis', value: grade.kuis },
                      { label: 'UTS', value: grade.uts },
                      { label: 'UAS', value: grade.uas },
                      { label: 'Praktik', value: grade.praktik },
                    ].map((item) => (
                      <div key={item.label} className="text-center p-1.5 rounded-lg bg-muted/50">
                        <p className="text-[10px] text-muted-foreground">{item.label}</p>
                        <p className="text-xs font-semibold text-foreground">{item.value || '-'}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium">Belum ada nilai</p>
            <p className="text-xs mt-1">Nilai akan muncul setelah guru menginput</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderViolationsTab = () => (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                totalViolationPoints === 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'
              }`}>
                {totalViolationPoints === 0 ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                )}
              </div>
              Catatan Pelanggaran
            </CardTitle>
            <CardDescription className="mt-1">
              Total poin: <span className={`font-semibold ${
                totalViolationPoints === 0 ? 'text-emerald-500' :
                totalViolationPoints < 50 ? 'text-amber-500' : 'text-red-500'
              }`}>{totalViolationPoints}</span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {violationsLoading ? (
          <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
        ) : violations && violations.length > 0 ? (
          <div className="space-y-2">
            {violations.map((violation: any, idx: number) => (
              <motion.div 
                key={violation.id}
                custom={idx}
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                className="p-3.5 rounded-xl border border-red-500/10 bg-card hover:bg-red-500/5 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <p className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                    {violation.violation_types?.name}
                  </p>
                  <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                    {violation.points} poin
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground ml-5.5">
                  {format(new Date(violation.violation_date), 'dd MMMM yyyy', { locale: localeId })}
                </p>
                {violation.notes && (
                  <p className="text-xs text-muted-foreground mt-1.5 ml-5.5 italic">"{violation.notes}"</p>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Sparkles className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="font-medium text-foreground">Bersih! 🌟</p>
            <p className="text-xs text-muted-foreground mt-1">Tidak ada catatan pelanggaran. Pertahankan!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderAchievementsTab = () => (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                <Trophy className="h-4 w-4 text-amber-500" />
              </div>
              Daftar Prestasi
            </CardTitle>
            <CardDescription className="mt-1">{achievements?.length || 0} penghargaan</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {achievementsLoading ? (
          <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
        ) : achievements && achievements.length > 0 ? (
          <div className="space-y-2">
            {achievements.map((achievement: any, idx: number) => {
              const levelColors: Record<string, string> = {
                internasional: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
                nasional: 'bg-red-500/10 text-red-600 border-red-500/20',
                provinsi: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                kabupaten: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
              };
              const levelColor = levelColors[achievement.level] || 'bg-muted text-muted-foreground border-border';
              return (
                <motion.div 
                  key={achievement.id}
                  custom={idx}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="p-3.5 rounded-xl border border-amber-500/10 bg-card hover:bg-amber-500/5 transition-colors"
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <p className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <Medal className="h-4 w-4 text-amber-500" />
                      {achievement.title}
                    </p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${levelColor}`}>
                      {achievement.level || 'Sekolah'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    {format(new Date(achievement.achievement_date), 'dd MMMM yyyy', { locale: localeId })}
                  </p>
                  {achievement.description && (
                    <p className="text-xs text-muted-foreground mt-1.5 ml-6">{achievement.description}</p>
                  )}
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Star className="h-8 w-8 text-amber-400" />
            </div>
            <p className="font-medium text-foreground">Belum ada prestasi</p>
            <p className="text-xs text-muted-foreground mt-1">Terus semangat dan raih prestasimu!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderAnnouncementsTab = () => (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          Pengumuman Sekolah
        </CardTitle>
      </CardHeader>
      <CardContent>
        {announcementsLoading ? (
          <div className="text-center py-8 text-muted-foreground">Memuat pengumuman...</div>
        ) : announcements && announcements.length > 0 ? (
          <div className="space-y-2">
            {announcements.map((announcement: any, idx: number) => (
              <motion.div 
                key={announcement.id}
                custom={idx}
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                className="p-3.5 rounded-xl border border-border/50 bg-card hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-primary/5 rounded-lg flex items-center justify-center mt-0.5 shrink-0">
                    <Bell className="h-3.5 w-3.5 text-primary/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">{announcement.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{announcement.content}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-2">
                      {format(new Date(announcement.created_at), 'dd MMMM yyyy', { locale: localeId })}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium">Tidak ada pengumuman</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <StudentWelcomeBanner student={student} classInfo={classInfo} />
        {renderContent()}
      </div>
    </DashboardLayout>
  );
};

const StudentDashboard = () => (
  <ProtectedRoute allowedRoles={['siswa']}>
    <StudentDashboardPage />
  </ProtectedRoute>
);

export default StudentDashboard;
