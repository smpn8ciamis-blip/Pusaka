import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Plus, BookOpen, Edit, Trash2, Calendar, Star } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

const HABITS = [
  { number: 1, name: "Proaktif", description: "Bertanggung jawab atas pilihan dan tindakan sendiri", icon: "🎯" },
  { number: 2, name: "Mulai dengan Tujuan Akhir", description: "Menetapkan tujuan dan membuat rencana", icon: "🏆" },
  { number: 3, name: "Dahulukan yang Utama", description: "Mengerjakan hal penting terlebih dahulu", icon: "📋" },
  { number: 4, name: "Berpikir Menang-Menang", description: "Mencari solusi yang menguntungkan semua pihak", icon: "🤝" },
  { number: 5, name: "Berusaha Memahami Dulu", description: "Mendengarkan dengan empati sebelum berbicara", icon: "👂" },
  { number: 6, name: "Sinergi", description: "Bekerja sama untuk hasil yang lebih baik", icon: "🌟" },
  { number: 7, name: "Asah Gergaji", description: "Menjaga keseimbangan fisik, mental, sosial, dan spiritual", icon: "🔧" },
];

const HabitJournal = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingJournal, setEditingJournal] = useState<any>(null);
  const [selectedHabit, setSelectedHabit] = useState<string>("");
  const [journalDate, setJournalDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activityDescription, setActivityDescription] = useState("");
  const [reflection, setReflection] = useState("");

  // Get student account
  const { data: studentAccount } = useQuery({
    queryKey: ["student-account", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_accounts")
        .select("*, students(id, full_name, class_id, classes(name))")
        .eq("user_id", user?.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Get journals
  const { data: journals, isLoading } = useQuery({
    queryKey: ["habit-journals", studentAccount?.student_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habit_journals")
        .select("*")
        .eq("student_id", studentAccount?.student_id)
        .order("journal_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!studentAccount?.student_id,
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingJournal) {
        const { error } = await supabase
          .from("habit_journals")
          .update({
            habit_number: parseInt(data.habit_number),
            journal_date: data.journal_date,
            activity_description: data.activity_description,
            reflection: data.reflection,
          })
          .eq("id", editingJournal.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("habit_journals")
          .insert({
            student_id: studentAccount?.student_id,
            habit_number: parseInt(data.habit_number),
            journal_date: data.journal_date,
            activity_description: data.activity_description,
            reflection: data.reflection,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habit-journals"] });
      toast.success(editingJournal ? "Jurnal berhasil diperbarui" : "Jurnal berhasil ditambahkan");
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error("Gagal menyimpan jurnal: " + error.message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("habit_journals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habit-journals"] });
      toast.success("Jurnal berhasil dihapus");
    },
    onError: (error: any) => {
      toast.error("Gagal menghapus jurnal: " + error.message);
    },
  });

  const resetForm = () => {
    setSelectedHabit("");
    setJournalDate(format(new Date(), "yyyy-MM-dd"));
    setActivityDescription("");
    setReflection("");
    setEditingJournal(null);
  };

  const handleEdit = (journal: any) => {
    setEditingJournal(journal);
    setSelectedHabit(journal.habit_number.toString());
    setJournalDate(journal.journal_date);
    setActivityDescription(journal.activity_description);
    setReflection(journal.reflection || "");
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHabit || !activityDescription) {
      toast.error("Silakan lengkapi semua field yang wajib diisi");
      return;
    }
    saveMutation.mutate({
      habit_number: selectedHabit,
      journal_date: journalDate,
      activity_description: activityDescription,
      reflection: reflection,
    });
  };

  const getHabitInfo = (number: number) => HABITS.find((h) => h.number === number);

  // Group journals by habit
  const journalsByHabit = HABITS.map((habit) => ({
    ...habit,
    journals: journals?.filter((j) => j.habit_number === habit.number) || [],
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Jurnal 7 Kebiasaan Anak Indonesia Hebat
            </h1>
            <p className="text-muted-foreground">
              Catat kegiatan dan refleksi harianmu untuk membangun kebiasaan positif
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tambah Jurnal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingJournal ? "Edit Jurnal" : "Tambah Jurnal Baru"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Kebiasaan *</Label>
                  <Select value={selectedHabit} onValueChange={setSelectedHabit}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kebiasaan" />
                    </SelectTrigger>
                    <SelectContent>
                      {HABITS.map((habit) => (
                        <SelectItem key={habit.number} value={habit.number.toString()}>
                          {habit.icon} {habit.number}. {habit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedHabit && (
                    <p className="text-xs text-muted-foreground">
                      {getHabitInfo(parseInt(selectedHabit))?.description}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Tanggal *</Label>
                  <Input
                    type="date"
                    value={journalDate}
                    onChange={(e) => setJournalDate(e.target.value)}
                    max={format(new Date(), "yyyy-MM-dd")}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Kegiatan yang Dilakukan *</Label>
                  <Textarea
                    value={activityDescription}
                    onChange={(e) => setActivityDescription(e.target.value)}
                    placeholder="Ceritakan kegiatan yang kamu lakukan terkait kebiasaan ini..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Refleksi (Opsional)</Label>
                  <Textarea
                    value={reflection}
                    onChange={(e) => setReflection(e.target.value)}
                    placeholder="Apa yang kamu pelajari dari kegiatan ini?"
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Menyimpan..." : "Simpan"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Habit Cards Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {HABITS.map((habit) => {
            const count = journals?.filter((j) => j.habit_number === habit.number).length || 0;
            return (
              <Card key={habit.number} className="text-center">
                <CardContent className="pt-4 pb-3">
                  <div className="text-2xl mb-1">{habit.icon}</div>
                  <div className="text-xs font-medium truncate">{habit.name}</div>
                  <Badge variant={count > 0 ? "default" : "secondary"} className="mt-2">
                    {count} jurnal
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Journals by Habit */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">Semua</TabsTrigger>
            {HABITS.map((habit) => (
              <TabsTrigger key={habit.number} value={habit.number.toString()}>
                {habit.icon} {habit.number}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <div className="space-y-3">
              {isLoading ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Memuat jurnal...
                  </CardContent>
                </Card>
              ) : journals?.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Belum ada jurnal. Mulai catat kegiatan positifmu!</p>
                  </CardContent>
                </Card>
              ) : (
                journals?.map((journal) => {
                  const habitInfo = getHabitInfo(journal.habit_number);
                  return (
                    <Card key={journal.id}>
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xl">{habitInfo?.icon}</span>
                              <Badge variant="outline">
                                {journal.habit_number}. {habitInfo?.name}
                              </Badge>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(journal.journal_date), "dd MMM yyyy", { locale: idLocale })}
                              </span>
                            </div>
                            <p className="text-sm mb-2">{journal.activity_description}</p>
                            {journal.reflection && (
                              <div className="bg-muted/50 rounded-md p-2 text-sm">
                                <span className="font-medium text-xs text-muted-foreground">Refleksi:</span>
                                <p className="text-muted-foreground">{journal.reflection}</p>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => handleEdit(journal)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(journal.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {HABITS.map((habit) => (
            <TabsContent key={habit.number} value={habit.number.toString()} className="mt-4">
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">{habit.icon}</span>
                    {habit.number}. {habit.name}
                  </CardTitle>
                  <CardDescription>{habit.description}</CardDescription>
                </CardHeader>
              </Card>
              <div className="space-y-3">
                {journalsByHabit.find((h) => h.number === habit.number)?.journals.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      Belum ada jurnal untuk kebiasaan ini
                    </CardContent>
                  </Card>
                ) : (
                  journalsByHabit
                    .find((h) => h.number === habit.number)
                    ?.journals.map((journal) => (
                      <Card key={journal.id}>
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(journal.journal_date), "dd MMMM yyyy", { locale: idLocale })}
                                </span>
                              </div>
                              <p className="text-sm mb-2">{journal.activity_description}</p>
                              {journal.reflection && (
                                <div className="bg-muted/50 rounded-md p-2 text-sm">
                                  <span className="font-medium text-xs text-muted-foreground">Refleksi:</span>
                                  <p className="text-muted-foreground">{journal.reflection}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => handleEdit(journal)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => deleteMutation.mutate(journal.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default HabitJournal;
