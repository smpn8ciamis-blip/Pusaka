import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Search, BookOpen, Eye, Calendar, User, Users } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

const HABITS = [
  { number: 1, name: "Proaktif", icon: "🎯" },
  { number: 2, name: "Mulai dengan Tujuan Akhir", icon: "🏆" },
  { number: 3, name: "Dahulukan yang Utama", icon: "📋" },
  { number: 4, name: "Berpikir Menang-Menang", icon: "🤝" },
  { number: 5, name: "Berusaha Memahami Dulu", icon: "👂" },
  { number: 6, name: "Sinergi", icon: "🌟" },
  { number: 7, name: "Asah Gergaji", icon: "🔧" },
];

const HabitJournalMonitor = () => {
  const { userRole: role, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [selectedHabit, setSelectedHabit] = useState<string>("all");
  const [selectedJournal, setSelectedJournal] = useState<any>(null);

  // Get teacher info for homeroom filter
  const { data: teacherInfo } = useQuery({
    queryKey: ["teacher-info", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, is_homeroom_teacher")
        .eq("user_id", user?.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: role === "teacher",
  });

  // Get homeroom class for teacher
  const { data: homeroomClass } = useQuery({
    queryKey: ["homeroom-class", teacherInfo?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .eq("homeroom_teacher_id", teacherInfo?.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!teacherInfo?.id && teacherInfo?.is_homeroom_teacher,
  });

  // Get classes for filter
  const { data: classes } = useQuery({
    queryKey: ["classes-for-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, grade")
        .order("grade")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: role === "admin" || role === "kesiswaan",
  });

  // Get journals with student info
  const { data: journals, isLoading } = useQuery({
    queryKey: ["habit-journals-monitor", selectedClass, selectedHabit, searchQuery, homeroomClass?.id],
    queryFn: async () => {
      let query = supabase
        .from("habit_journals")
        .select(`
          *,
          students!inner(
            id,
            full_name,
            nis,
            class_id,
            classes(id, name, grade)
          )
        `)
        .order("journal_date", { ascending: false })
        .order("created_at", { ascending: false });

      // For homeroom teacher, filter by their class only
      if (role === "teacher" && homeroomClass?.id) {
        query = query.eq("students.class_id", homeroomClass.id);
      }

      // Filter by class for admin/kesiswaan
      if ((role === "admin" || role === "kesiswaan") && selectedClass !== "all") {
        query = query.eq("students.class_id", selectedClass);
      }

      // Filter by habit
      if (selectedHabit !== "all") {
        query = query.eq("habit_number", parseInt(selectedHabit));
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter by search query
      if (searchQuery) {
        return data?.filter(
          (j) =>
            j.students?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            j.students?.nis?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      return data;
    },
    enabled: role === "admin" || role === "kesiswaan" || (role === "teacher" && !!homeroomClass?.id),
  });

  // Get summary statistics
  const { data: stats } = useQuery({
    queryKey: ["habit-journal-stats", homeroomClass?.id],
    queryFn: async () => {
      let query = supabase
        .from("habit_journals")
        .select(`
          habit_number,
          student_id,
          students!inner(class_id)
        `);

      // For homeroom teacher, filter by their class
      if (role === "teacher" && homeroomClass?.id) {
        query = query.eq("students.class_id", homeroomClass.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Calculate stats
      const totalJournals = data?.length || 0;
      const uniqueStudents = new Set(data?.map((j) => j.student_id)).size;
      const habitCounts = HABITS.map((h) => ({
        ...h,
        count: data?.filter((j) => j.habit_number === h.number).length || 0,
      }));

      return {
        totalJournals,
        uniqueStudents,
        habitCounts,
      };
    },
    enabled: role === "admin" || role === "kesiswaan" || (role === "teacher" && !!homeroomClass?.id),
  });

  const getHabitInfo = (number: number) => HABITS.find((h) => h.number === number);

  // If teacher but not homeroom teacher
  if (role === "teacher" && teacherInfo && !teacherInfo.is_homeroom_teacher) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Akses Terbatas</h2>
            <p className="text-muted-foreground">
              Hanya wali kelas yang dapat memantau jurnal siswa
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Monitoring Jurnal 7 Kebiasaan
          </h1>
          <p className="text-muted-foreground">
            {role === "teacher" && homeroomClass
              ? `Pantau jurnal siswa kelas ${homeroomClass.name}`
              : "Pantau perkembangan jurnal kebiasaan seluruh siswa"}
          </p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.totalJournals || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Jurnal</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <User className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.uniqueStudents || 0}</p>
                  <p className="text-xs text-muted-foreground">Siswa Aktif</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Habit Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distribusi Jurnal per Kebiasaan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {stats?.habitCounts?.map((habit) => (
                <div key={habit.number} className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-xl mb-1">{habit.icon}</div>
                  <div className="text-lg font-bold">{habit.count}</div>
                  <div className="text-xs text-muted-foreground truncate">{habit.name}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Cari nama atau NIS siswa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {(role === "admin" || role === "kesiswaan") && (
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Semua Kelas" />
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
              )}
              <Select value={selectedHabit} onValueChange={setSelectedHabit}>
                <SelectTrigger className="w-full md:w-56">
                  <SelectValue placeholder="Semua Kebiasaan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kebiasaan</SelectItem>
                  {HABITS.map((habit) => (
                    <SelectItem key={habit.number} value={habit.number.toString()}>
                      {habit.icon} {habit.number}. {habit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Journals Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Siswa</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>Kebiasaan</TableHead>
                  <TableHead>Kegiatan</TableHead>
                  <TableHead className="text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Memuat data...
                    </TableCell>
                  </TableRow>
                ) : journals?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      Belum ada jurnal yang tercatat
                    </TableCell>
                  </TableRow>
                ) : (
                  journals?.map((journal) => {
                    const habitInfo = getHabitInfo(journal.habit_number);
                    return (
                      <TableRow key={journal.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="w-3 h-3 text-muted-foreground" />
                            {format(new Date(journal.journal_date), "dd MMM yyyy", { locale: idLocale })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{journal.students?.full_name}</p>
                            <p className="text-xs text-muted-foreground">{journal.students?.nis}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{journal.students?.classes?.name}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span>{habitInfo?.icon}</span>
                            <span className="text-sm">{habitInfo?.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-sm truncate">{journal.activity_description}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedJournal(journal)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={!!selectedJournal} onOpenChange={() => setSelectedJournal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Detail Jurnal</DialogTitle>
            </DialogHeader>
            {selectedJournal && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b">
                  <div className="p-2 rounded-full bg-primary/10">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{selectedJournal.students?.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedJournal.students?.nis} - {selectedJournal.students?.classes?.name}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getHabitInfo(selectedJournal.habit_number)?.icon}</span>
                    <div>
                      <Badge>{selectedJournal.habit_number}. {getHabitInfo(selectedJournal.habit_number)?.name}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(selectedJournal.journal_date), "EEEE, dd MMMM yyyy", { locale: idLocale })}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium mb-1">Kegiatan:</p>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                      {selectedJournal.activity_description}
                    </p>
                  </div>

                  {selectedJournal.reflection && (
                    <div>
                      <p className="text-sm font-medium mb-1">Refleksi:</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                        {selectedJournal.reflection}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default HabitJournalMonitor;
