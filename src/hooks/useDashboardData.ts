import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, parseISO, startOfMonth, eachDayOfInterval } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  toLocalDateStr,
  mergeAttendanceByStudentDay,
  summarizeDailyRecords,
  percentOf,
  fetchAllPages,
} from '@/lib/attendanceUtils';

const CACHE_TIME = {
  STATIC: { staleTime: 10 * 60 * 1000, gcTime: 30 * 60 * 1000 },
  MODERATE: { staleTime: 5 * 60 * 1000, gcTime: 15 * 60 * 1000 },
  DYNAMIC: { staleTime: 2 * 60 * 1000, gcTime: 10 * 60 * 1000 },
};

export const useDashboardStats = (userRole: string | null, selectedYear: string | null, selectedSemester: number) => {
  return useQuery({
    queryKey: ['dashboard-stats', selectedYear, selectedSemester],
    queryFn: async () => {
      if (!selectedYear) return { teachers: 0, students: 0, classes: 0, schedules: 0 };
      const { data: yearClasses } = await supabase.from('classes').select('id').eq('academic_year', selectedYear);
      const classIds = yearClasses?.map(c => c.id) || [];
      const [teachers, students, classes, schedules] = await Promise.all([
        supabase.from('teachers').select('id', { count: 'exact', head: true }),
        classIds.length > 0 
          ? supabase.from('students').select('id', { count: 'exact', head: true })
              .in('class_id', classIds).eq('status', 'aktif').eq('is_alumni', false)
          : Promise.resolve({ count: 0 }),
        supabase.from('classes').select('id', { count: 'exact', head: true }).eq('academic_year', selectedYear),
        supabase.from('schedules').select('id', { count: 'exact', head: true }).eq('academic_year', selectedYear).eq('semester', selectedSemester),
      ]);
      return {
        teachers: teachers.count || 0,
        students: students.count || 0,
        classes: classes.count || 0,
        schedules: schedules.count || 0,
      };
    },
    enabled: userRole === 'admin' && !!selectedYear,
    ...CACHE_TIME.MODERATE,
  });
};

export const useTodaySchedules = (userId: string | null, userRole: string | null, selectedYear: string | null, selectedSemester: number) => {
  return useQuery({
    queryKey: ['today-schedules', userId, userRole, selectedYear, selectedSemester],
    queryFn: async () => {
      if (!selectedYear) return [];
      const today = new Date().getDay();
      if (userRole === 'admin') {
        const { data } = await supabase.from('schedules').select(`*, classes(id, name, grade)`)
          .eq('day_of_week', today).eq('academic_year', selectedYear).eq('semester', selectedSemester).order('start_time');
        return data || [];
      } else {
        const { data: teacher } = await supabase.from('teachers').select('id').eq('user_id', userId).maybeSingle();
        if (!teacher) return [];
        const { data } = await supabase.from('schedules').select(`*, classes(id, name, grade)`)
          .eq('day_of_week', today).eq('teacher_id', teacher.id).eq('academic_year', selectedYear).eq('semester', selectedSemester).order('start_time');
        return data || [];
      }
    },
    enabled: !!userId && !!userRole && !!selectedYear,
    ...CACHE_TIME.MODERATE,
  });
};

export const useAttendanceRecap = (startDate: Date, endDate: Date, selectedYear: string | null, selectedSemester: number) => {
  return useQuery({
    queryKey: ['attendance-recap', toLocalDateStr(startDate), toLocalDateStr(endDate), selectedYear],
    queryFn: async () => {
      if (!selectedYear) return { total: 0, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, belum: 0, expected: 0, attendanceRate: 0 };
      const start = toLocalDateStr(startDate);
      const end = toLocalDateStr(endDate);
      const [manualAttendance, rfidAttendance, activeStudents] = await Promise.all([
        fetchAllPages<any>((from, to) => supabase.from('attendance').select('id, student_id, date, status, schedule_id').gte('date', start).lte('date', end).order('id').range(from, to)),
        fetchAllPages<any>((from, to) => supabase.from('rfid_attendance').select('id, student_id, date, status').gte('date', start).lte('date', end).order('id').range(from, to)),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('status', 'aktif').eq('is_alumni', false),
      ]);
      if (activeStudents.error) throw activeStudents.error;

      // Satu siswa + satu tanggal = satu catatan (aturan di src/lib/attendanceUtils.ts).
      const daily = mergeAttendanceByStudentDay(manualAttendance, rfidAttendance);
      const counts = summarizeDailyRecords(daily);
      const schoolDays = new Set(daily.map(r => r.date));
      const expected = (activeStudents.count || 0) * schoolDays.size;
      return {
        total: counts.total,
        hadir: counts.hadir, // sudah termasuk terlambat (dihitung sekali)
        terlambat: counts.terlambat,
        izin: counts.izin,
        sakit: counts.sakit,
        alpa: counts.alpa,
        belum: Math.max(0, expected - counts.total),
        expected,
        attendanceRate: percentOf(counts.hadir, expected),
      };
    },
    enabled: !!selectedYear,
  });
};

export const useAttendanceByClass = (startDate: Date, endDate: Date, userRole: string | null, selectedYear: string | null, selectedSemester: number) => {
  return useQuery({
    queryKey: ['attendance-by-class', toLocalDateStr(startDate), toLocalDateStr(endDate), selectedYear, selectedSemester],
    queryFn: async () => {
      if (!selectedYear) return { filledClasses: [], unfilledClasses: [] };
      const start = toLocalDateStr(startDate);
      const end = toLocalDateStr(endDate);
      const { data: allClasses, error: classesError } = await supabase.from('classes').select('id, name, grade').eq('academic_year', selectedYear).order('grade').order('name');
      if (classesError) throw classesError;
      if (!allClasses || allClasses.length === 0) return { filledClasses: [], unfilledClasses: [] };
      const classIds = allClasses.map(c => c.id);

      // Semua data diambil lewat paginasi. Daftar siswa aktif diambil sekali (id + kelas)
      // sehingga tidak perlu .in() dengan ratusan ID yang membuat URL terlalu panjang.
      const [activeStudents, schedules, manualAttendance, rfidAttendance] = await Promise.all([
        fetchAllPages<any>((from, to) => supabase.from('students').select('id, class_id').in('class_id', classIds).eq('status', 'aktif').eq('is_alumni', false).order('id').range(from, to)),
        fetchAllPages<any>((from, to) => supabase.from('schedules').select('id, class_id').eq('academic_year', selectedYear).eq('semester', selectedSemester).order('id').range(from, to)),
        fetchAllPages<any>((from, to) => supabase.from('attendance').select('id, student_id, date, status, schedule_id').gte('date', start).lte('date', end).order('id').range(from, to)),
        fetchAllPages<any>((from, to) => supabase.from('rfid_attendance').select('id, student_id, date, status').gte('date', start).lte('date', end).order('id').range(from, to)),
      ]);

      const activeStudentCountByClass = new Map<string, number>();
      const activeStudentClass = new Map<string, string>();
      activeStudents.forEach(st => {
        activeStudentCountByClass.set(st.class_id, (activeStudentCountByClass.get(st.class_id) || 0) + 1);
        activeStudentClass.set(st.id, st.class_id);
      });
      const classesWithSchedules = new Set(schedules.map(sc => sc.class_id));
      const scheduleToClass = new Map<string, string>();
      schedules.forEach(sc => scheduleToClass.set(sc.id, sc.class_id));

      const classMap = new Map();
      allClasses.forEach((cls: any) => {
        classMap.set(cls.id, { id: cls.id, name: `${cls.name} (${cls.grade})`, grade: cls.grade, className: cls.name, studentCount: activeStudentCountByClass.get(cls.id) || 0, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, belum: 0, expected: 0, total: 0, attendanceRate: 0, hasSchedule: classesWithSchedules.has(cls.id), hasFilled: false });
      });

      // Satu siswa + satu tanggal = satu catatan (aturan di src/lib/attendanceUtils.ts).
      mergeAttendanceByStudentDay(manualAttendance, rfidAttendance).forEach(record => {
        let classId = record.schedule_id ? scheduleToClass.get(record.schedule_id) : undefined;
        if (!classId) classId = activeStudentClass.get(record.student_id);
        if (!classId) return;
        const classData = classMap.get(classId);
        if (!classData) return;
        classData.hasFilled = true;
        if (record.status === 'hadir') classData.hadir++;
        else if (record.status === 'terlambat') { classData.terlambat++; classData.hadir++; }
        else if (record.status === 'izin') classData.izin++;
        else if (record.status === 'sakit') classData.sakit++;
        else if (record.status === 'alpa') classData.alpa++;
      });

      const allClassData = Array.from(classMap.values()).map(classData => {
        const total = classData.hadir + classData.izin + classData.sakit + classData.alpa;
        return { ...classData, total, attendanceRate: percentOf(classData.hadir, total) };
      });
      const sortClasses = (a: any, b: any) => { if (a.grade !== b.grade) return a.grade - b.grade; return a.className.localeCompare(b.className, 'id'); };
      const filledClasses = allClassData.filter(c => c.hasFilled).sort(sortClasses);
      const unfilledClasses = allClassData.filter(c => !c.hasFilled).sort(sortClasses);
      return { filledClasses, unfilledClasses };
    },
    enabled: (userRole === 'admin' || userRole === 'kesiswaan') && !!selectedYear,
  });
};

export const useDailyAttendanceTrend = (startDate: Date, endDate: Date, userRole: string | null) => {
  return useQuery({
    queryKey: ['daily-attendance-trend', toLocalDateStr(startDate), toLocalDateStr(endDate)],
    queryFn: async () => {
      const start = toLocalDateStr(startDate);
      const end = toLocalDateStr(endDate);
      const [manualAttendance, rfidAttendance] = await Promise.all([
        fetchAllPages<any>((from, to) => supabase.from('attendance').select('id, student_id, date, status').gte('date', start).lte('date', end).order('id').range(from, to)),
        fetchAllPages<any>((from, to) => supabase.from('rfid_attendance').select('id, student_id, date, status').gte('date', start).lte('date', end).order('id').range(from, to)),
      ]);
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const dailyData = new Map();
      dateRange.forEach(date => { dailyData.set(format(date, 'yyyy-MM-dd'), { date: format(date, 'dd/MM'), hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0 }); });
      // Satu siswa + satu tanggal = satu catatan (aturan di src/lib/attendanceUtils.ts).
      mergeAttendanceByStudentDay(manualAttendance, rfidAttendance).forEach(record => {
        const dateData = dailyData.get(record.date);
        if (!dateData) return;
        if (record.status === 'hadir') dateData.hadir++;
        else if (record.status === 'terlambat') { dateData.hadir++; dateData.terlambat++; }
        else if (record.status === 'izin') dateData.izin++;
        else if (record.status === 'sakit') dateData.sakit++;
        else if (record.status === 'alpa') dateData.alpa++;
      });
      return Array.from(dailyData.values());
    },
    enabled: userRole === 'admin' || userRole === 'kesiswaan',
  });
};

export const useLateStudents = (startDate: Date, endDate: Date, userRole: string | null) => {
  return useQuery({
    queryKey: ['late-students', toLocalDateStr(startDate), toLocalDateStr(endDate)],
    queryFn: async () => {
      const start = toLocalDateStr(startDate);
      const end = toLocalDateStr(endDate);
      const { data: violationTypes } = await supabase.from('violation_types').select('id').ilike('name', '%terlambat%').eq('is_active', true);
      if (!violationTypes || violationTypes.length === 0) return [];
      const violationTypeIds = violationTypes.map(v => v.id);
      const violations = await fetchAllPages<any>((from, to) => supabase.from('student_violations').select(`id, points, student_id, violation_date, students(id, nis, nisn, full_name, classes(name, grade))`).in('violation_type_id', violationTypeIds).gte('violation_date', start).lte('violation_date', end).order('violation_date', { ascending: false }).order('id').range(from, to));
      const studentMap = new Map();
      violations?.forEach((v: any) => {
        if (!studentMap.has(v.student_id)) studentMap.set(v.student_id, { student: v.students, totalPoints: 0, count: 0, dates: [] });
        const s = studentMap.get(v.student_id);
        s.totalPoints += v.points; s.count += 1; s.dates.push(v.violation_date);
      });
      return Array.from(studentMap.values()).map(item => ({ ...item.student, latePoints: item.totalPoints, lateCount: item.count, lateDates: item.dates })).sort((a, b) => b.latePoints - a.latePoints).slice(0, 10);
    },
    enabled: userRole === 'admin' || userRole === 'kesiswaan',
  });
};

export const useLateViolationsTrend = (startDate: Date, endDate: Date, userRole: string | null) => {
  return useQuery({
    queryKey: ['late-violations-trend', toLocalDateStr(startDate), toLocalDateStr(endDate)],
    queryFn: async () => {
      const start = toLocalDateStr(startDate);
      const end = toLocalDateStr(endDate);
      const { data: violationTypes } = await supabase.from('violation_types').select('id').ilike('name', '%terlambat%').eq('is_active', true);
      if (!violationTypes || violationTypes.length === 0) return [];
      const violationTypeIds = violationTypes.map(v => v.id);
      const violations = await fetchAllPages<any>((from, to) => supabase.from('student_violations').select('id, violation_date, points').in('violation_type_id', violationTypeIds).gte('violation_date', start).lte('violation_date', end).order('violation_date', { ascending: true }).order('id').range(from, to));
      if (violations.length === 0) return [];
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7) {
        const dateMap = new Map();
        violations.forEach((v: any) => { if (!dateMap.has(v.violation_date)) dateMap.set(v.violation_date, { count: 0, points: 0 }); const d = dateMap.get(v.violation_date); d.count += 1; d.points += v.points; });
        return Array.from(dateMap.entries()).map(([date, data]) => ({ period: format(parseISO(date), 'dd MMM', { locale: localeId }), fullDate: date, count: data.count, points: data.points })).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
      } else if (daysDiff <= 60) {
        const weekMap = new Map();
        violations.forEach((v: any) => { const weekStart = startOfWeek(parseISO(v.violation_date), { weekStartsOn: 1 }); const weekKey = format(weekStart, 'yyyy-MM-dd'); if (!weekMap.has(weekKey)) weekMap.set(weekKey, { count: 0, points: 0, weekStart }); const d = weekMap.get(weekKey); d.count += 1; d.points += v.points; });
        return Array.from(weekMap.entries()).map(([key, data]) => ({ period: `Minggu ${format(data.weekStart, 'dd MMM', { locale: localeId })}`, fullDate: key, count: data.count, points: data.points })).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
      } else {
        const monthMap = new Map();
        violations.forEach((v: any) => { const monthKey = format(parseISO(v.violation_date), 'yyyy-MM'); if (!monthMap.has(monthKey)) monthMap.set(monthKey, { count: 0, points: 0 }); const d = monthMap.get(monthKey); d.count += 1; d.points += v.points; });
        return Array.from(monthMap.entries()).map(([key, data]) => ({ period: format(parseISO(`${key}-01`), 'MMM yyyy', { locale: localeId }), fullDate: key, count: data.count, points: data.points })).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
      }
    },
    enabled: userRole === 'admin' || userRole === 'kesiswaan',
  });
};

export const useAnnouncements = () => {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      const { data, error } = await supabase.from('announcements').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(3);
      if (error) throw error;
      return data;
    },
    ...CACHE_TIME.STATIC,
  });
};

export const useTeacherProfile = (userId: string | null, userRole: string | null) => {
  return useQuery({
    queryKey: ['teacher-data', userId],
    queryFn: async () => {
      const { data: teacher, error } = await supabase.from('teachers').select(`id, subject, is_homeroom_teacher, photo_url`).eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (!teacher) return null;
      if (teacher.is_homeroom_teacher) {
        const { data: homeroomClass } = await supabase.from('classes').select('name, grade').eq('homeroom_teacher_id', teacher.id).maybeSingle();
        if (homeroomClass) return { ...teacher, homeroomClass };
      }
      return teacher;
    },
    enabled: !!userId && userRole === 'teacher',
    ...CACHE_TIME.STATIC,
  });
};

export const useTeacherTasks = (userId: string | null, userRole: string | null, todaySchedules: any) => {
  return useQuery({
    queryKey: ['teacher-tasks', userId],
    queryFn: async () => {
      if (userRole !== 'teacher' || !userId) return null;
      const today = toLocalDateStr(new Date());
      const todayScheduleIds = todaySchedules?.map((s: any) => s.id) || [];
      if (todayScheduleIds.length === 0) return { pendingAttendance: 0, pendingJournals: 0 };
      const { data: attendanceData } = await supabase.from('attendance').select('schedule_id').in('schedule_id', todayScheduleIds).eq('date', today);
      const schedulesWithAttendance = new Set(attendanceData?.map(a => a.schedule_id) || []);
      const pendingAttendance = todayScheduleIds.filter((id: string) => !schedulesWithAttendance.has(id)).length;
      const { data: journalData } = await supabase.from('teaching_journals').select('schedule_id').in('schedule_id', todayScheduleIds).eq('date', today);
      const schedulesWithJournal = new Set(journalData?.map(j => j.schedule_id) || []);
      const pendingJournals = todayScheduleIds.filter((id: string) => !schedulesWithJournal.has(id)).length;
      return { pendingAttendance, pendingJournals };
    },
    enabled: userRole === 'teacher' && !!userId && !!todaySchedules,
  });
};

export const useUserProfile = (userId: string | null) => {
  return useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    ...CACHE_TIME.STATIC,
  });
};

export const useStudentViolationDetails = (selectedStudent: any, startDate: Date, endDate: Date) => {
  return useQuery({
    queryKey: ['student-violation-details', selectedStudent?.nis, toLocalDateStr(startDate), toLocalDateStr(endDate)],
    queryFn: async () => {
      if (!selectedStudent?.nis) return [];
      const start = toLocalDateStr(startDate);
      const end = toLocalDateStr(endDate);
      const { data: violationTypes } = await supabase.from('violation_types').select('id').ilike('name', '%terlambat%').eq('is_active', true);
      if (!violationTypes || violationTypes.length === 0) return [];
      const typeIds = violationTypes.map(v => v.id);
      const violations = await fetchAllPages<any>((from, to) => supabase.from('student_violations').select(`*, violation_types(name, category, points)`).eq('student_id', selectedStudent.id).in('violation_type_id', typeIds).gte('violation_date', start).lte('violation_date', end).order('violation_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to));

      // Tabel student_violations tidak punya relasi (FK) reported_by -> profiles, jadi
      // nama pelapor diambil dengan query terpisah lalu digabung di sini.
      const reporterIds = [...new Set(violations.map(v => v.reported_by).filter(Boolean))] as string[];
      const reporterNames = new Map<string, string>();
      if (reporterIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', reporterIds);
        profiles?.forEach(p => reporterNames.set(p.id, p.full_name));
      }
      return violations.map(v => ({
        ...v,
        reporter: v.reported_by && reporterNames.has(v.reported_by) ? { full_name: reporterNames.get(v.reported_by) } : null,
      }));
    },
    enabled: !!selectedStudent?.nis,
  });
};
