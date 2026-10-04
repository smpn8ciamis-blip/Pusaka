import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, parseISO, startOfMonth, eachDayOfInterval } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

const toLocalDateStr = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
      const { data: manualAttendance, error: manualError } = await supabase
        .from('attendance').select('id, student_id, date, status, schedule_id').gte('date', start).lte('date', end);
      if (manualError) throw manualError;
      const { data: rfidAttendance, error: rfidError } = await supabase
        .from('rfid_attendance').select('id, student_id, date, status').gte('date', start).lte('date', end);
      if (rfidError) throw rfidError;
      const combinedData = new Map<string, any>();
      manualAttendance?.forEach((record: any) => {
        const key = `${record.student_id}-${record.date}`;
        combinedData.set(key, { student_id: record.student_id, date: record.date, status: record.status, source: 'manual' });
      });
      rfidAttendance?.forEach((record: any) => {
        const key = `${record.student_id}-${record.date}`;
        if (!combinedData.has(key)) {
          combinedData.set(key, { student_id: record.student_id, date: record.date, status: record.status, source: 'rfid' });
        }
      });
      let hadir = 0, terlambat = 0, izin = 0, sakit = 0, alpa = 0;
      const uniqueStudentDates = new Set<string>();
      Array.from(combinedData.values()).forEach((record: any) => {
        const key = `${record.student_id}-${record.date}`;
        if (uniqueStudentDates.has(key)) return;
        uniqueStudentDates.add(key);
        const status = (record.status || '').toLowerCase();
        if (status === 'hadir') hadir++;
        else if (status === 'terlambat') { terlambat++; hadir++; }
        else if (status === 'izin') izin++;
        else if (status === 'sakit') sakit++;
        else if (status === 'alpa') alpa++;
      });
      const { count: activeStudentsCount } = await supabase.from('students').select('id', { count: 'exact', head: true }).eq('status', 'aktif').eq('is_alumni', false);
      const schoolDays = new Set(Array.from(combinedData.values()).map(r => r.date));
      const expected = (activeStudentsCount || 0) * schoolDays.size;
      const totalHadir = hadir + terlambat;
      const total = hadir + izin + sakit + alpa;
      return { total, hadir: totalHadir, terlambat, izin, sakit, alpa, belum: Math.max(0, expected - total), expected, attendanceRate: expected > 0 ? Math.round((totalHadir / expected) * 100) : 0 };
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
      const { data: allClasses } = await supabase.from('classes').select('id, name, grade').eq('academic_year', selectedYear).order('grade').order('name');
      if (!allClasses || allClasses.length === 0) return { filledClasses: [], unfilledClasses: [] };
      const classIds = allClasses.map(c => c.id);
      const { data: activeStudents } = await supabase.from('students').select('class_id').in('class_id', classIds).eq('status', 'aktif').eq('is_alumni', false);
      const activeStudentCountByClass = new Map<string, number>();
      activeStudents?.forEach(s => { activeStudentCountByClass.set(s.class_id, (activeStudentCountByClass.get(s.class_id) || 0) + 1); });
      const { data: scheduleIds } = await supabase.from('schedules').select('id, class_id').eq('academic_year', selectedYear).eq('semester', selectedSemester);
      const classesWithSchedules = new Set(scheduleIds?.map(s => s.class_id) || []);
      const classMap = new Map();
      allClasses.forEach((cls: any) => {
        classMap.set(cls.id, { id: cls.id, name: `${cls.name} (${cls.grade})`, grade: cls.grade, className: cls.name, studentCount: activeStudentCountByClass.get(cls.id) || 0, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, belum: 0, expected: 0, total: 0, attendanceRate: 0, hasSchedule: classesWithSchedules.has(cls.id), hasFilled: false });
      });
      const { data: manualAttendance, error: manualError } = await supabase.from('attendance').select('id, student_id, date, status, schedule_id').gte('date', start).lte('date', end);
      if (manualError) throw manualError;
      const { data: rfidAttendance } = await supabase.from('rfid_attendance').select('id, student_id, date, status').gte('date', start).lte('date', end);
      const combinedData = new Map<string, any>();
      manualAttendance?.forEach((record: any) => { const key = `${record.student_id}-${record.date}`; combinedData.set(key, { student_id: record.student_id, date: record.date, status: record.status, schedule_id: record.schedule_id, source: 'manual' }); });
      rfidAttendance?.forEach((record: any) => { const key = `${record.student_id}-${record.date}`; if (!combinedData.has(key)) { combinedData.set(key, { student_id: record.student_id, date: record.date, status: record.status, source: 'rfid' }); } });
      const scheduleToClass = new Map<string, string>();
      scheduleIds?.forEach(s => scheduleToClass.set(s.id, s.class_id));
      const studentIds = [...new Set(Array.from(combinedData.values()).map(r => r.student_id))];
      let activeStudentIds = new Map<string, string>();
      if (studentIds.length > 0) {
        const { data: activeCheck } = await supabase.from('students').select('id, class_id').in('id', studentIds).eq('status', 'aktif').eq('is_alumni', false);
        activeCheck?.forEach(s => activeStudentIds.set(s.id, s.class_id));
      }
      const seen = new Set<string>();
      Array.from(combinedData.values()).forEach((record: any) => {
        let classId = record.schedule_id ? scheduleToClass.get(record.schedule_id) : null;
        if (!classId && activeStudentIds.has(record.student_id)) classId = activeStudentIds.get(record.student_id);
        const key = `${record.student_id}-${record.date}`;
        if (!classId || seen.has(key)) return;
        seen.add(key);
        const classData = classMap.get(classId);
        if (!classData) return;
        classData.hasFilled = true;
        const status = (record.status || '').toLowerCase();
        if (status === 'hadir') classData.hadir++;
        else if (status === 'terlambat') { classData.terlambat++; classData.hadir++; }
        else if (status === 'izin') classData.izin++;
        else if (status === 'sakit') classData.sakit++;
        else if (status === 'alpa') classData.alpa++;
      });
      const allClassData = Array.from(classMap.values()).map(classData => {
        const totalHadir = classData.hadir;
        const recorded = totalHadir + classData.izin + classData.sakit + classData.alpa;
        const total = classData.expected > 0 ? classData.expected : recorded + classData.belum;
        const attendanceRate = total > 0 ? Math.round((totalHadir / total) * 100) : 0;
        return { ...classData, total, attendanceRate };
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
      const { data: manualAttendance, error } = await supabase.from('attendance').select('student_id, date, status, created_at').gte('date', start).lte('date', end).order('created_at', { ascending: false });
      if (error) throw error;
      const { data: rfidAttendance } = await supabase.from('rfid_attendance').select('student_id, date, status').gte('date', start).lte('date', end);
      const combinedData = new Map<string, any>();
      manualAttendance?.forEach((record: any) => { const key = `${record.student_id}-${record.date}`; combinedData.set(key, record); });
      rfidAttendance?.forEach((record: any) => { const key = `${record.student_id}-${record.date}`; if (!combinedData.has(key)) combinedData.set(key, record); });
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const dailyData = new Map();
      dateRange.forEach(date => { dailyData.set(format(date, 'yyyy-MM-dd'), { date: format(date, 'dd/MM'), hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0 }); });
      Array.from(combinedData.values()).forEach((record: any) => {
        const dateData = dailyData.get(record.date);
        if (dateData) {
          const status = record.status?.toLowerCase();
          if (status === 'hadir') dateData.hadir++;
          else if (status === 'terlambat') { dateData.hadir++; dateData.terlambat++; }
          else if (status === 'izin') dateData.izin++;
          else if (status === 'sakit') dateData.sakit++;
          else if (status === 'alpa') dateData.alpa++;
        }
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
      const { data: violations, error } = await supabase.from('student_violations').select(`points, student_id, violation_date, students(id, nis, nisn, full_name, classes(name, grade))`).in('violation_type_id', violationTypeIds).gte('violation_date', start).lte('violation_date', end).order('violation_date', { ascending: false });
      if (error) throw error;
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
      const { data: violations, error } = await supabase.from('student_violations').select('violation_date, points').in('violation_type_id', violationTypeIds).gte('violation_date', start).lte('violation_date', end).order('violation_date', { ascending: true });
      if (error) throw error;
      if (!violations || violations.length === 0) return [];
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
      const { data: violations, error } = await supabase.from('student_violations').select(`*, violation_types(name, category, points), reporter:profiles!reported_by(full_name)`).eq('student_id', selectedStudent.id).in('violation_type_id', violationTypes.map(v => v.id)).gte('violation_date', start).lte('violation_date', end).order('violation_date', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      return violations || [];
    },
    enabled: !!selectedStudent?.nis,
  });
};
