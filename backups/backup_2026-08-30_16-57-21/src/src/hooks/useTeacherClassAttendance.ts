import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface StudentAttendanceItem {
  studentId: string;
  studentName: string;
  status: string;
}

interface TeacherClassAttendanceData {
  totalStudents: number;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  belumAbsen: number;
  studentsByStatus: {
    hadir: StudentAttendanceItem[];
    sakit: StudentAttendanceItem[];
    izin: StudentAttendanceItem[];
    alpa: StudentAttendanceItem[];
  };
}

export const useTeacherClassAttendance = (
  teacherUserId: string | null | undefined,
  selectedYear: string | null,
  _selectedSemester: string | null
) => {
  return useQuery({
    queryKey: ['teacher-class-attendance', teacherUserId, selectedYear, format(new Date(), 'yyyy-MM-dd')],
    queryFn: async (): Promise<TeacherClassAttendanceData | null> => {
      if (!teacherUserId || !selectedYear) return null;

      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', teacherUserId)
        .maybeSingle();

      if (!teacher) return null;

      const { data: homeroomClass } = await supabase
        .from('classes')
        .select('id')
        .eq('homeroom_teacher_id', teacher.id)
        .eq('academic_year', selectedYear)
        .maybeSingle();

      if (!homeroomClass) return null;

      const { data: students } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('class_id', homeroomClass.id)
        .eq('is_alumni', false)
        .order('full_name');

      if (!students || students.length === 0) return null;

      const today = format(new Date(), 'yyyy-MM-dd');
      const studentIds = students.map(s => s.id);

      const { data: attendanceRecords } = await supabase
        .from('attendance')
        .select('student_id, status')
        .in('student_id', studentIds)
        .eq('date', today);

      const statusMap = new Map<string, string>();
      attendanceRecords?.forEach(a => {
        statusMap.set(a.student_id, a.status.toLowerCase());
      });

      const result: TeacherClassAttendanceData = {
        totalStudents: students.length,
        hadir: 0, sakit: 0, izin: 0, alpa: 0, belumAbsen: 0,
        studentsByStatus: { hadir: [], sakit: [], izin: [], alpa: [] },
      };

      students.forEach(s => {
        const status = statusMap.get(s.id);
        const item: StudentAttendanceItem = { studentId: s.id, studentName: s.full_name, status: status || 'belum' };

        if (!status) {
          result.belumAbsen++;
        } else if (status === 'hadir') {
          result.hadir++;
          result.studentsByStatus.hadir.push(item);
        } else if (status === 'sakit') {
          result.sakit++;
          result.studentsByStatus.sakit.push(item);
        } else if (status === 'izin') {
          result.izin++;
          result.studentsByStatus.izin.push(item);
        } else if (status === 'alpa') {
          result.alpa++;
          result.studentsByStatus.alpa.push(item);
        }
      });

      return result;
    },
    enabled: !!teacherUserId && !!selectedYear,
    staleTime: 2 * 60 * 1000,
  });
};
