import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, parseISO, startOfMonth, eachDayOfInterval } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

// Helper to format date as local YYYY-MM-DD (avoids timezone shift from toISOString)
const toLocalDateStr = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Cache time constants for better performance
const CACHE_TIME = {
  STATIC: { staleTime: 10 * 60 * 1000, gcTime: 30 * 60 * 1000 }, // 10 min stale, 30 min gc
  MODERATE: { staleTime: 5 * 60 * 1000, gcTime: 15 * 60 * 1000 }, // 5 min stale, 15 min gc
  DYNAMIC: { staleTime: 2 * 60 * 1000, gcTime: 10 * 60 * 1000 }, // 2 min stale, 10 min gc
};

export const useDashboardStats = (userRole: string | null, selectedYear: string | null, selectedSemester: number) => {
  return useQuery({
    queryKey: ['dashboard-stats', selectedYear, selectedSemester],
    queryFn: async () => {
      if (!selectedYear) return { teachers: 0, students: 0, classes: 0, schedules: 0 };

      // Get class IDs for the selected academic year
      const { data: yearClasses } = await supabase
        .from('classes')
        .select('id')
        .eq('academic_year', selectedYear);
      
      const classIds = yearClasses?.map(c => c.id) || [];

      const [teachers, students, classes, schedules] = await Promise.all([
        supabase.from('teachers').select('id', { count: 'exact', head: true }),
        classIds.length > 0 
          ? supabase.from('students').select('id', { count: 'exact', head: true }).in('class_id', classIds)
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
        const { data } = await supabase
          .from('schedules')
          .select(`*, classes(id, name, grade)`)
          .eq('day_of_week', today)
          .eq('academic_year', selectedYear)
          .eq('semester', selectedSemester)
          .order('start_time');
        return data || [];
      } else {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (!teacher) return [];

        const { data } = await supabase
          .from('schedules')
          .select(`*, classes(id, name, grade)`)
          .eq('day_of_week', today)
          .eq('teacher_id', teacher.id)
          .eq('academic_year', selectedYear)
          .eq('semester', selectedSemester)
          .order('start_time');
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
      if (!selectedYear) return { total: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0 };

      const start = toLocalDateStr(startDate);
      const end = toLocalDateStr(endDate);

      // Use RPC for accurate aggregation (avoids 1000-row limit and handles dedup at DB level)
      const { data, error } = await supabase.rpc('get_attendance_recap', {
        p_start_date: start,
        p_end_date: end,
        p_academic_year: selectedYear,
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      return {
        total: Number(result?.total || 0),
        hadir: Number(result?.hadir || 0),
        izin: Number(result?.izin || 0),
        sakit: Number(result?.sakit || 0),
        alpa: Number(result?.alpa || 0),
      };
    },
    enabled: !!selectedYear,
  });
};

export const useAttendanceByClass = (startDate: Date, endDate: Date, userRole: string | null, selectedYear: string | null, selectedSemester: number) => {
  return useQuery({
    queryKey: ['attendance-by-class', toLocalDateStr(startDate), toLocalDateStr(endDate), selectedYear],
    queryFn: async () => {
      if (!selectedYear) return { filledClasses: [], unfilledClasses: [] };

      const start = toLocalDateStr(startDate);
      const end = toLocalDateStr(endDate);
      
      // Get all classes for the selected academic year with student count and homeroom teacher
      const { data: allClasses } = await supabase
        .from('classes')
        .select('id, name, grade, students(id), homeroom_teacher:teachers!classes_homeroom_teacher_id_fkey(id, user_id, profiles!inner(full_name))')
        .eq('academic_year', selectedYear);
      
      // Get schedule IDs for the selected year to know which classes have schedules
      const { data: scheduleIds } = await supabase
        .from('schedules')
        .select('id, class_id')
        .eq('academic_year', selectedYear);
      
      const classesWithSchedules = new Set(scheduleIds?.map(s => s.class_id) || []);

      // Build class map with all classes
      const classMap = new Map();
      allClasses?.forEach((cls: any) => {
        const classKey = `${cls.name} (${cls.grade})`;
        const studentCount = cls.students?.length || 0;
        const homeroomTeacherName = cls.homeroom_teacher?.profiles?.full_name || null;
        classMap.set(cls.id, { 
          id: cls.id,
          name: classKey, 
          grade: cls.grade,
          studentCount,
          homeroomTeacherName,
          hadir: 0, 
          izin: 0, 
          sakit: 0, 
          alpa: 0, 
          total: 0, 
          attendanceRate: 0,
          hasSchedule: classesWithSchedules.has(cls.id),
          hasFilled: false
        });
      });

      // Use RPC for accurate per-class aggregation (avoids 1000-row limit)
      const { data: classAttendance, error } = await supabase.rpc('get_attendance_by_class', {
        p_start_date: start,
        p_end_date: end,
        p_academic_year: selectedYear,
      });

      if (error) throw error;

      // Apply RPC results to class map
      classAttendance?.forEach((record: any) => {
        const classData = classMap.get(record.class_id);
        if (classData) {
          classData.hasFilled = true;
          classData.hadir = Number(record.hadir || 0);
          classData.izin = Number(record.izin || 0);
          classData.sakit = Number(record.sakit || 0);
          classData.alpa = Number(record.alpa || 0);
        }
      });

      // Calculate totals and sort by class name
      const allClassData = Array.from(classMap.values()).map(classData => {
        const total = classData.hadir + classData.izin + classData.sakit + classData.alpa;
        const attendanceRate = total > 0 ? Math.round((classData.hadir / total) * 100) : 0;
        return { ...classData, total, attendanceRate };
      });

      // Sort by grade first, then by name
      const sortClasses = (a: any, b: any) => {
        if (a.grade !== b.grade) return a.grade - b.grade;
        return a.name.localeCompare(b.name);
      };

      const filledClasses = allClassData.filter(c => c.hasFilled).sort(sortClasses);
      const unfilledClasses = allClassData.filter(c => !c.hasFilled && c.hasSchedule).sort(sortClasses);

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
      
      const { data: attendanceData, error } = await supabase
        .from('attendance')
        .select('student_id, date, status, created_at')
        .gte('date', start)
        .lte('date', end)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const dailyData = new Map();
      dateRange.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        dailyData.set(dateStr, { date: format(date, 'dd/MM'), hadir: 0, izin: 0, sakit: 0, alpa: 0 });
      });

      const studentDateMap = new Map();
      attendanceData?.forEach((record: any) => {
        const key = `${record.student_id}-${record.date}`;
        if (!studentDateMap.has(key)) {
          studentDateMap.set(key, record);
        }
      });

      Array.from(studentDateMap.values()).forEach((record: any) => {
        const dateData = dailyData.get(record.date);
        if (dateData) {
          const status = record.status?.toLowerCase();
          if (status === 'hadir') dateData.hadir++;
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
      
      const { data: violationTypes } = await supabase
        .from('violation_types')
        .select('id')
        .ilike('name', '%terlambat%')
        .eq('is_active', true);
      
      if (!violationTypes || violationTypes.length === 0) return [];
      
      const violationTypeIds = violationTypes.map(v => v.id);
      
      const { data: violations, error } = await supabase
        .from('student_violations')
        .select(`points, student_id, violation_date, students(id, nis, nisn, full_name, classes(name, grade))`)
        .in('violation_type_id', violationTypeIds)
        .gte('violation_date', start)
        .lte('violation_date', end)
        .order('violation_date', { ascending: false });
      
      if (error) throw error;
      
      const studentMap = new Map();
      violations?.forEach((v: any) => {
        const studentId = v.student_id;
        if (!studentMap.has(studentId)) {
          studentMap.set(studentId, { student: v.students, totalPoints: 0, count: 0, dates: [] });
        }
        const student = studentMap.get(studentId);
        student.totalPoints += v.points;
        student.count += 1;
        student.dates.push(v.violation_date);
      });
      
      return Array.from(studentMap.values())
        .map(item => ({ ...item.student, latePoints: item.totalPoints, lateCount: item.count, lateDates: item.dates }))
        .sort((a, b) => b.latePoints - a.latePoints)
        .slice(0, 10);
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
      
      const { data: violationTypes } = await supabase
        .from('violation_types')
        .select('id')
        .ilike('name', '%terlambat%')
        .eq('is_active', true);
      
      if (!violationTypes || violationTypes.length === 0) return [];
      
      const violationTypeIds = violationTypes.map(v => v.id);
      
      const { data: violations, error } = await supabase
        .from('student_violations')
        .select('violation_date, points')
        .in('violation_type_id', violationTypeIds)
        .gte('violation_date', start)
        .lte('violation_date', end)
        .order('violation_date', { ascending: true });
      
      if (error) throw error;
      if (!violations || violations.length === 0) return [];
      
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff <= 7) {
        const dateMap = new Map();
        violations.forEach((v: any) => {
          const date = v.violation_date;
          if (!dateMap.has(date)) dateMap.set(date, { count: 0, points: 0 });
          const data = dateMap.get(date);
          data.count += 1;
          data.points += v.points;
        });
        
        return Array.from(dateMap.entries())
          .map(([date, data]) => ({
            period: format(parseISO(date), 'dd MMM', { locale: localeId }),
            fullDate: date,
            count: data.count,
            points: data.points
          }))
          .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
      } else if (daysDiff <= 60) {
        const weekMap = new Map();
        violations.forEach((v: any) => {
          const date = parseISO(v.violation_date);
          const weekStart = startOfWeek(date, { weekStartsOn: 1 });
          const weekKey = format(weekStart, 'yyyy-MM-dd');
          
          if (!weekMap.has(weekKey)) weekMap.set(weekKey, { count: 0, points: 0, weekStart });
          const data = weekMap.get(weekKey);
          data.count += 1;
          data.points += v.points;
        });
        
        return Array.from(weekMap.entries())
          .map(([key, data]) => ({
            period: `Minggu ${format(data.weekStart, 'dd MMM', { locale: localeId })}`,
            fullDate: key,
            count: data.count,
            points: data.points
          }))
          .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
      } else {
        const monthMap = new Map();
        violations.forEach((v: any) => {
          const date = parseISO(v.violation_date);
          const monthKey = format(date, 'yyyy-MM');
          
          if (!monthMap.has(monthKey)) monthMap.set(monthKey, { count: 0, points: 0 });
          const data = monthMap.get(monthKey);
          data.count += 1;
          data.points += v.points;
        });
        
        return Array.from(monthMap.entries())
          .map(([key, data]) => ({
            period: format(parseISO(`${key}-01`), 'MMM yyyy', { locale: localeId }),
            fullDate: key,
            count: data.count,
            points: data.points
          }))
          .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
      }
    },
    enabled: userRole === 'admin' || userRole === 'kesiswaan',
  });
};

export const useAnnouncements = () => {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(3);

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
      const { data: teacher, error } = await supabase
        .from('teachers')
        .select(`id, subject, is_homeroom_teacher, photo_url`)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) throw error;
      if (!teacher) return null;
      
      if (teacher.is_homeroom_teacher) {
        const { data: homeroomClass, error: classError } = await supabase
          .from('classes')
          .select('name, grade')
          .eq('homeroom_teacher_id', teacher.id)
          .maybeSingle();
        
        if (!classError && homeroomClass) {
          return { ...teacher, homeroomClass };
        }
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

      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('schedule_id')
        .in('schedule_id', todayScheduleIds)
        .eq('date', today);

      const schedulesWithAttendance = new Set(attendanceData?.map(a => a.schedule_id) || []);
      const pendingAttendance = todayScheduleIds.filter((id: string) => !schedulesWithAttendance.has(id)).length;

      const { data: journalData } = await supabase
        .from('teaching_journals')
        .select('schedule_id')
        .in('schedule_id', todayScheduleIds)
        .eq('date', today);

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
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();
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
      
      const { data: violationTypes } = await supabase
        .from('violation_types')
        .select('id')
        .ilike('name', '%terlambat%')
        .eq('is_active', true);
      
      if (!violationTypes || violationTypes.length === 0) return [];
      
      const violationTypeIds = violationTypes.map(v => v.id);
      
      const { data: violations, error } = await supabase
        .from('student_violations')
        .select(`*, violation_types(name, category, points), reporter:profiles!reported_by(full_name)`)
        .eq('student_id', selectedStudent.id)
        .in('violation_type_id', violationTypeIds)
        .gte('violation_date', start)
        .lte('violation_date', end)
        .order('violation_date', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return violations || [];
    },
    enabled: !!selectedStudent?.nis,
  });
};
