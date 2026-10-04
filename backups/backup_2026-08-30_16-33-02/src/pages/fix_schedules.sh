#!/bin/bash

# Script untuk memperbaiki Schedules.tsx agar Tahun Ajaran dan Semester 
# pada form input mengikuti filter aktif (selectedYear & selectedSemester).

TARGET_FILE="Schedules.tsx"

echo "🔄 Sedang memperbarui $TARGET_FILE..."

cat << 'ENDOFFILE' > "$TARGET_FILE"
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ImportSchedules } from '@/components/ImportSchedules';
import { CopySchedulesDialog } from '@/components/CopySchedulesDialog';
import { WeeklyScheduleCalendar } from '@/components/WeeklyScheduleCalendar';
import { AcademicYearSelector } from '@/components/AcademicYearSelector';

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const Schedules = () => {
  const { userRole, user } = useAuth();
  const { selectedYear, availableYears, activeYear, selectedSemester } = useAcademicYear();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any>(null);
  const [currentTeacherId, setCurrentTeacherId] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [filterDay, setFilterDay] = useState<string>('all');
  
  const [formData, setFormData] = useState({
    class_id: '',
    teacher_id: '',
    subject: '',
    day_of_week: '',
    start_time: '',
    end_time: '',
    semester: selectedSemester.toString(),
    academic_year: selectedYear || activeYear?.year || '2024/2025', // DIPERBAIKI: Prioritaskan selectedYear (filter aktif)
  });

  // Update formData when selectedSemester or selectedYear changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      semester: selectedSemester.toString(),
      academic_year: selectedYear || activeYear?.year || '2024/2025',
    }));
  }, [selectedSemester, selectedYear, activeYear]);

  // Get current teacher's ID if user is a teacher
  useEffect(() => {
    if (userRole === 'teacher' && user) {
      const fetchTeacherId = async () => {
        const { data, error } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (data && !error) {
          setCurrentTeacherId(data.id);
          setFormData(prev => ({ ...prev, teacher_id: data.id }));
        }
      };
      fetchTeacherId();
    }
  }, [userRole, user]);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['schedules', userRole, currentTeacherId, selectedYear, selectedSemester],
    queryFn: async () => {
      if (!selectedYear) return [];
      
      let query = supabase
        .from('schedules')
        .select(`
          *,
          classes(id, name, grade),
          teachers(id, subject, user_id)
        `)
        .eq('academic_year', selectedYear)
        .eq('semester', selectedSemester)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      // Filter by teacher if user is a teacher
      if (userRole === 'teacher' && currentTeacherId) {
        query = query.eq('teacher_id', currentTeacherId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: userRole === 'admin' || !!currentTeacherId,
  });

  const { data: classes } = useQuery({
    queryKey: ['classes', selectedYear],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('academic_year', selectedYear)
        .order('grade', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: teachers } = useQuery({
    queryKey: ['teachers-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .order('subject', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['teacher-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('schedules').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast({ title: 'Jadwal berhasil ditambahkan' });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: 'Gagal menambahkan jadwal', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: any) => {
      const { error } = await supabase.from('schedules').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast({ title: 'Jadwal berhasil diperbarui' });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: 'Gagal memperbarui jadwal', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('schedules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast({ title: 'Jadwal berhasil dihapus' });
    },
    onError: () => {
      toast({ title: 'Gagal menghapus jadwal', variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      class_id: '',
      teacher_id: currentTeacherId || '',
      subject: '',
      day_of_week: '',
      start_time: '',
      end_time: '',
      semester: selectedSemester?.toString() || '1',
      academic_year: selectedYear || activeYear?.year || '2024/2025', // DIPERBAIKI: Prioritaskan selectedYear (filter aktif)
    });
    setEditingSchedule(null);
  };

  const checkTimeConflict = (newSchedule: any): boolean => {
    if (!schedules) return false;
    const dayOfWeek = parseInt(newSchedule.day_of_week);

    return schedules.some((schedule) => {
      // Skip if it's the same schedule being edited
      if (editingSchedule && schedule.id === editingSchedule.id) return false;

      // Check if same class, day, and semester
      if (
        schedule.class_id !== newSchedule.class_id ||
        schedule.day_of_week !== dayOfWeek ||
        schedule.semester !== parseInt(newSchedule.semester) ||
        schedule.academic_year !== newSchedule.academic_year
      ) {
        return false;
      }

      // Check time overlap
      const existingStart = schedule.start_time;
      const existingEnd = schedule.end_time;
      const newStart = newSchedule.start_time;
      const newEnd = newSchedule.end_time;

      // Check if times overlap
      return (
        (newStart >= existingStart && newStart < existingEnd) || // New starts during existing
        (newEnd > existingStart && newEnd <= existingEnd) ||     // New ends during existing
        (newStart <= existingStart && newEnd >= existingEnd)     // New wraps around existing
      );
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const scheduleData = {
      ...formData,
      day_of_week: parseInt(formData.day_of_week) + 1, // Convert 0-5 to 1-6
      semester: parseInt(formData.semester),
    };

    // Check for time conflicts
    if (checkTimeConflict(scheduleData)) {
      const className = classes?.find(c => c.id === formData.class_id)?.name || 'Kelas';
      const day = DAYS[parseInt(formData.day_of_week)];
      toast({
        title: 'Jadwal Bentrok',
        description: `${className} sudah memiliki jadwal pada hari ${day} di jam ${formData.start_time} - ${formData.end_time}`,
        variant: 'destructive',
      });
      return;
    }

    if (editingSchedule) {
      updateMutation.mutate({ id: editingSchedule.id, data: scheduleData });
    } else {
      createMutation.mutate(scheduleData);
    }
  };

  const handleEdit = (schedule: any) => {
    setEditingSchedule(schedule);
    setFormData({
      class_id: schedule.class_id,
      teacher_id: schedule.teacher_id,
      subject: schedule.subject,
      day_of_week: (schedule.day_of_week - 1).toString(), // Convert 1-6 to 0-5
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      semester: schedule.semester.toString(),
      academic_year: schedule.academic_year,
    });
    setIsDialogOpen(true);
  };

  const getClassName = (schedule: any) => {
    if (schedule.classes) {
      return schedule.classes.name;
    }
    const cls = classes?.find((c) => c.id === schedule.class_id);
    return cls ? cls.name : '-';
  };

  const getTeacherName = (schedule: any) => {
    if (schedule.teachers) {
      const profile = profiles?.find((p) => p.id === schedule.teachers.user_id);
      return profile?.full_name || '-';
    }
    const teacher = teachers?.find((t) => t.id === schedule.teacher_id);
    if (!teacher) return '-';
    const profile = profiles?.find((p) => p.id === teacher.user_id);
    return profile?.full_name || '-';
  };

  // Filter schedules based on selected filters
  const filteredSchedules = schedules?.filter((schedule) => {
    if (filterClass !== 'all' && schedule.class_id !== filterClass) return false;
    if (filterTeacher !== 'all' && schedule.teacher_id !== filterTeacher) return false;
    if (filterDay !== 'all' && schedule.day_of_week !== parseInt(filterDay)) return false;
    return true;
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Jadwal Pelajaran</h1>
            <p className="text-muted-foreground">
              {userRole === 'admin' ? 'Kelola jadwal pelajaran sekolah' : 'Jadwal pelajaran Anda'}
            </p>
            <div className="mt-3">
              <AcademicYearSelector />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Menampilkan jadwal TP {selectedYear || activeYear?.year || '-'} • Semester {selectedSemester === 2 ? 'Genap' : 'Ganjil'}
              {activeYear?.year && selectedYear && activeYear.year !== selectedYear ? ' (bukan tahun pelajaran aktif)' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {userRole === 'admin' && (
              <>
                <CopySchedulesDialog 
                  availableYears={availableYears}
                  activeYear={activeYear?.year || selectedYear || ''}
                  onSuccess={() => queryClient.invalidateQueries({ queryKey: ['schedules'] })}
                />
                <ImportSchedules onSuccess={() => queryClient.invalidateQueries({ queryKey: ['schedules'] })} />
              </>
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Jadwal
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingSchedule ? 'Edit Jadwal' : 'Tambah Jadwal'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Kelas</Label>
                      <Select value={formData.class_id} onValueChange={(value) => setFormData({ ...formData, class_id: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih kelas" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes?.map((cls) => (
                            <SelectItem key={cls.id} value={cls.id}>
                              {cls.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {userRole === 'admin' && (
                      <div className="space-y-2">
                        <Label>Guru</Label>
                        <Select value={formData.teacher_id} onValueChange={(value) => setFormData({ ...formData, teacher_id: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih guru" />
                          </SelectTrigger>
                          <SelectContent>
                            {teachers?.map((teacher) => {
                              const profile = profiles?.find((p) => p.id === teacher.user_id);
                              return (
                                <SelectItem key={teacher.id} value={teacher.id}>
                                  {profile?.full_name || 'Unknown'} - {teacher.subject}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Mata Pelajaran</Label>
                      <Input
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        placeholder="Contoh: Matematika"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Hari</Label>
                      <Select value={formData.day_of_week} onValueChange={(value) => setFormData({ ...formData, day_of_week: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih hari" />
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS.map((day, index) => (
                            <SelectItem key={index} value={index.toString()}>
                              {day}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Jam Mulai</Label>
                      <Input
                        type="time"
                        value={formData.start_time}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Jam Selesai</Label>
                      <Input
                        type="time"
                        value={formData.end_time}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Semester</Label>
                      <Input
                        value={`Semester ${formData.semester}`}
                        readOnly
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">Otomatis menggunakan semester sesuai filter</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Tahun Ajaran</Label>
                      <Input
                        value={formData.academic_year}
                        readOnly
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">Otomatis menggunakan tahun ajaran sesuai filter</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Batal
                    </Button>
                    <Button type="submit">{editingSchedule ? 'Simpan' : 'Tambah'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <Tabs defaultValue="table" className="space-y-4">
          <TabsList>
            <TabsTrigger value="table">Tampilan Tabel</TabsTrigger>
            <TabsTrigger value="calendar">Kalender Mingguan</TabsTrigger>
          </TabsList>
          <TabsContent value="table" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Daftar Jadwal
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="space-y-2">
                    <Label>Filter Kelas</Label>
                    <Select value={filterClass} onValueChange={setFilterClass}>
                      <SelectTrigger>
                        <SelectValue placeholder="Semua kelas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Kelas</SelectItem>
                        {classes?.map((cls) => (
                          <SelectItem key={cls.id} value={cls.id}>
                            {cls.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Filter Guru</Label>
                    <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                      <SelectTrigger>
                        <SelectValue placeholder="Semua guru" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Guru</SelectItem>
                        {teachers?.map((teacher) => {
                          const profile = profiles?.find((p) => p.id === teacher.user_id);
                          return (
                            <SelectItem key={teacher.id} value={teacher.id}>
                              {profile?.full_name || 'Unknown'}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Filter Hari</Label>
                    <Select value={filterDay} onValueChange={setFilterDay}>
                      <SelectTrigger>
                        <SelectValue placeholder="Semua hari" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Hari</SelectItem>
                        {DAYS.map((day, index) => (
                          <SelectItem key={index} value={(index + 1).toString()}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {filterClass !== 'all' || filterTeacher !== 'all' || filterDay !== 'all' ? (
                  <div className="mb-4">
                    <Button variant="outline" size="sm" onClick={() => {
                      setFilterClass('all');
                      setFilterTeacher('all');
                      setFilterDay('all');
                    }}>
                      Reset Filter
                    </Button>
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">No</TableHead>
                        <TableHead>Hari</TableHead>
                        <TableHead>Jam</TableHead>
                        <TableHead>Kelas</TableHead>
                        <TableHead>Mata Pelajaran</TableHead>
                        <TableHead>Guru</TableHead>
                        <TableHead>Semester</TableHead>
                        <TableHead>Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSchedules && filteredSchedules.length > 0 ? (
                        filteredSchedules.map((schedule, index) => {
                          const canEdit = userRole === 'admin' || (userRole === 'teacher' && schedule.teacher_id === currentTeacherId);
                          return (
                            <TableRow key={schedule.id}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{DAYS[schedule.day_of_week - 1] || '-'}</TableCell>
                              <TableCell>
                                {schedule.start_time} - {schedule.end_time}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{getClassName(schedule)}</div>
                                {schedule.classes && (
                                  <div className="text-xs text-muted-foreground">Kelas {schedule.classes.grade}</div>
                                )}
                              </TableCell>
                              <TableCell>{schedule.subject}</TableCell>
                              <TableCell>{getTeacherName(schedule)}</TableCell>
                              <TableCell>Semester {schedule.semester}</TableCell>
                              <TableCell>
                                {canEdit ? (
                                  <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(schedule)}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteMutation.mutate(schedule.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            Tidak ada jadwal yang sesuai dengan filter
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="calendar">
            <WeeklyScheduleCalendar 
              schedules={filteredSchedules || []}
              profiles={profiles || []}
              selectedClass={filterClass !== 'all' ? filterClass : undefined}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Schedules;
ENDOFFILE

echo "✅ File $TARGET_FILE berhasil diperbarui!"
