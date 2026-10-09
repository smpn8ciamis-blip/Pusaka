import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import HomeroomStudentTab from '@/components/homeroom/HomeroomStudentTab';

/**
 * Akun Siswa: data siswa & akun login per kelas, plus cetak PDF daftar akun.
 * - Guru wali kelas: otomatis kelas yang diampu.
 * - Admin / kesiswaan: pilih kelas.
 */
export default function ClassStudentAccounts() {
  const { user, userRole } = useAuth();
  const { selectedYear } = useAcademicYear();
  const isTeacher = userRole === 'teacher';
  const [pickedClassId, setPickedClassId] = useState<string>('');

  const { data: teacher } = useQuery({
    queryKey: ['student-accounts-teacher', user?.id],
    enabled: !!user?.id && isTeacher,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teachers').select('id, school_id').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Guru: kelas yang diampu sebagai wali kelas pada tahun pelajaran terpilih
  const { data: homeroomClass } = useQuery({
    queryKey: ['student-accounts-homeroom-class', teacher?.id, selectedYear],
    enabled: isTeacher && !!teacher?.id && !!selectedYear,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes').select('id, name, academic_year, school_id')
        .eq('homeroom_teacher_id', teacher!.id).eq('academic_year', selectedYear!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Admin / kesiswaan: semua kelas pada tahun pelajaran terpilih
  const { data: allClasses = [] } = useQuery({
    queryKey: ['student-accounts-classes', selectedYear],
    enabled: !isTeacher && !!selectedYear,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes').select('id, name, academic_year, school_id')
        .eq('academic_year', selectedYear!).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const cls = isTeacher ? homeroomClass : allClasses.find((c) => c.id === pickedClassId) ?? null;
  const schoolId = (cls as any)?.school_id ?? teacher?.school_id ?? null;

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold">Akun Siswa</h1>
          <p className="text-sm text-muted-foreground">
            Data siswa dan akun login per kelas{cls ? ` — ${cls.name} (${cls.academic_year})` : ''}.
          </p>
        </div>

        {!isTeacher && (
          <div className="max-w-xs space-y-1">
            <Label>Kelas</Label>
            <Select value={pickedClassId} onValueChange={setPickedClassId}>
              <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
              <SelectContent>
                {allClasses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {cls?.id && schoolId ? (
          <HomeroomStudentTab
            key={cls.id}
            classId={cls.id}
            schoolId={schoolId}
            className={cls.name}
            academicYear={cls.academic_year}
          />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {isTeacher
                ? (teacher && selectedYear
                    ? 'Anda belum menjadi wali kelas pada tahun pelajaran ini.'
                    : 'Memuat data kelas...')
                : 'Pilih kelas untuk menampilkan akun siswa.'}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
