import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ClassGenderData { 
  classId: string; 
  className: string; 
  grade: number; 
  male: number; 
  female: number; 
  total: number; 
  homeroomTeacher?: string; 
}

interface GradeGenderData { 
  grade: number; 
  male: number; 
  female: number; 
  total: number; 
}

interface GenderStats { 
  totalMale: number; 
  totalFemale: number; 
  totalStudents: number; 
  byClass: ClassGenderData[]; 
  byGrade: GradeGenderData[]; 
}

export const useStudentGenderStats = (
  selectedYear: string | null,
  userRole: string | null,
  teacherUserId?: string | null
) => {
  return useQuery({
    queryKey: ['student-gender-stats', selectedYear, userRole, teacherUserId],
    queryFn: async (): Promise<GenderStats> => {
      if (!selectedYear) {
        return { totalMale: 0, totalFemale: 0, totalStudents: 0, byClass: [], byGrade: [] };
      }

      if (userRole === 'teacher' && teacherUserId) {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('id, user_id')
          .eq('user_id', teacherUserId)
          .maybeSingle();
        
        if (!teacher) {
          return { totalMale: 0, totalFemale: 0, totalStudents: 0, byClass: [], byGrade: [] };
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', teacher.user_id)
          .maybeSingle();

        const { data: homeroomClass } = await supabase
          .from('classes')
          .select('id, name, grade')
          .eq('homeroom_teacher_id', teacher.id)
          .eq('academic_year', selectedYear)
          .maybeSingle();

        if (!homeroomClass) {
          return { totalMale: 0, totalFemale: 0, totalStudents: 0, byClass: [], byGrade: [] };
        }

        // ✅ FILTER: hanya siswa aktif
        const { data: students } = await supabase
          .from('students')
          .select('gender')
          .eq('class_id', homeroomClass.id)
          .eq('status', 'aktif')
          .eq('is_alumni', false);

        const male = students?.filter(s => s.gender === 'L').length || 0;
        const female = students?.filter(s => s.gender === 'P').length || 0;

        const classData: ClassGenderData = {
          classId: homeroomClass.id,
          className: homeroomClass.name,
          grade: homeroomClass.grade,
          male,
          female,
          total: male + female,
          homeroomTeacher: profile?.full_name || undefined,
        };

        return {
          totalMale: male,
          totalFemale: female,
          totalStudents: male + female,
          byClass: [classData],
          byGrade: [{ grade: homeroomClass.grade, male, female, total: male + female }],
        };
      }

      const { data: classes } = await supabase
        .from('classes')
        .select('id, name, grade, homeroom_teacher_id')
        .eq('academic_year', selectedYear)
        .order('grade')
        .order('name');

      if (!classes || classes.length === 0) {
        return { totalMale: 0, totalFemale: 0, totalStudents: 0, byClass: [], byGrade: [] };
      }

      const teacherIds = classes
        .map(c => c.homeroom_teacher_id)
        .filter((id): id is string => !!id);

      const teacherNameMap = new Map<string, string>();
      
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, user_id')
          .in('id', teacherIds);

        if (teachers) {
          const userIds = teachers.map(t => t.user_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);

          const profileMap = new Map<string, string>();
          profiles?.forEach(p => profileMap.set(p.id, p.full_name || ''));
          teachers.forEach(t => { 
            const name = profileMap.get(t.user_id); 
            if (name) teacherNameMap.set(t.id, name); 
          });
        }
      }

      const classIds = classes.map(c => c.id);

      // ✅ FILTER: hanya siswa aktif
      const { data: students } = await supabase
        .from('students')
        .select('class_id, gender')
        .in('class_id', classIds)
        .eq('status', 'aktif')
        .eq('is_alumni', false);

      const classCountMap = new Map<string, { male: number; female: number }>();
      classes.forEach(c => classCountMap.set(c.id, { male: 0, female: 0 }));

      students?.forEach(s => { 
        const entry = classCountMap.get(s.class_id); 
        if (entry) { 
          if (s.gender === 'L') entry.male++; 
          else if (s.gender === 'P') entry.female++; 
        } 
      });

      const byClass: ClassGenderData[] = classes.map(c => { 
        const entry = classCountMap.get(c.id)!; 
        return { 
          classId: c.id, 
          className: c.name, 
          grade: c.grade, 
          male: entry.male, 
          female: entry.female, 
          total: entry.male + entry.female, 
          homeroomTeacher: c.homeroom_teacher_id ? teacherNameMap.get(c.homeroom_teacher_id) : undefined 
        }; 
      });

      const gradeMap = new Map<number, { male: number; female: number }>();
      byClass.forEach(c => { 
        if (!gradeMap.has(c.grade)) gradeMap.set(c.grade, { male: 0, female: 0 }); 
        const g = gradeMap.get(c.grade)!; 
        g.male += c.male; 
        g.female += c.female; 
      });

      const byGrade: GradeGenderData[] = Array.from(gradeMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([grade, data]) => ({ grade, male: data.male, female: data.female, total: data.male + data.female }));

      const totalMale = byGrade.reduce((sum, g) => sum + g.male, 0);
      const totalFemale = byGrade.reduce((sum, g) => sum + g.female, 0);

      return { 
        totalMale, 
        totalFemale, 
        totalStudents: totalMale + totalFemale, 
        byClass, 
        byGrade 
      };
    },
    enabled: !!selectedYear && !!userRole,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
};