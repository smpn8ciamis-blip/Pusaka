import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export function GraduateStudentsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: grade9Students, isLoading } = useQuery({
    queryKey: ["grade9-students"],
    queryFn: async () => {
      const { data: classes, error: classError } = await supabase
        .from("classes")
        .select("id")
        .eq("grade", 9);

      if (classError) throw classError;

      const classIds = classes.map((c) => c.id);

      const { data, error } = await supabase
        .from("students")
        .select(`
          id,
          nis,
          full_name,
          class_id,
          classes (
            name,
            grade
          )
        `)
        .in("class_id", classIds)
        .eq("is_alumni", false)
        .order("full_name");

      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  const graduateMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      const today = new Date().toISOString().split("T")[0];

      // Update students to alumni
      const { error: updateError } = await supabase
        .from("students")
        .update({
          is_alumni: true,
          graduation_date: today,
          class_id: null,
        })
        .in("id", studentIds);

      if (updateError) throw updateError;

      // Get student names for announcement
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("full_name")
        .in("id", studentIds);

      if (studentsError) throw studentsError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Create graduation announcement
      const studentNames = students.map((s) => s.full_name).join(", ");
      const { error: announcementError } = await supabase
        .from("announcements")
        .insert({
          title: `Pengumuman Kelulusan Siswa Kelas 9`,
          content: `Selamat kepada siswa-siswa berikut yang telah dinyatakan LULUS:\n\n${studentNames}\n\nTanggal Kelulusan: ${new Date(today).toLocaleDateString("id-ID", { 
            year: "numeric", 
            month: "long", 
            day: "numeric" 
          })}`,
          created_by: user.id,
          is_active: true,
        });

      if (announcementError) throw announcementError;

      return studentIds.length;
    },
    onSuccess: (count) => {
      toast.success(`Berhasil meluluskan ${count} siswa`);
      queryClient.invalidateQueries({ queryKey: ["grade9-students"] });
      queryClient.invalidateQueries({ queryKey: ["alumni"] });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setSelectedStudents([]);
      setIsOpen(false);
      setShowConfirmDialog(false);
    },
    onError: (error) => {
      console.error("Error graduating students:", error);
      toast.error("Gagal meluluskan siswa");
      setShowConfirmDialog(false);
    },
  });

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSelectAll = () => {
    if (!grade9Students) return;
    
    if (selectedStudents.length === grade9Students.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(grade9Students.map((s) => s.id));
    }
  };

  const handleGraduate = () => {
    if (selectedStudents.length === 0) {
      toast.error("Pilih minimal 1 siswa untuk diluluskan");
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmGraduate = () => {
    graduateMutation.mutate(selectedStudents);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button className="gap-2">
            <GraduationCap className="h-4 w-4" />
            Luluskan Siswa Kelas 9
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Kelulusan Siswa Kelas 9
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Pilih siswa yang akan dinyatakan lulus
              </p>
              {grade9Students && grade9Students.length > 0 && (
                <Badge variant="secondary">
                  {selectedStudents.length} / {grade9Students.length} dipilih
                </Badge>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !grade9Students || grade9Students.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Tidak ada siswa kelas 9 yang belum lulus
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Checkbox
                    id="select-all"
                    checked={
                      selectedStudents.length === grade9Students.length &&
                      grade9Students.length > 0
                    }
                    onCheckedChange={handleSelectAll}
                  />
                  <label
                    htmlFor="select-all"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Pilih Semua
                  </label>
                </div>

                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-2">
                    {grade9Students.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <Checkbox
                          id={student.id}
                          checked={selectedStudents.includes(student.id)}
                          onCheckedChange={() => handleToggleStudent(student.id)}
                        />
                        <label
                          htmlFor={student.id}
                          className="flex-1 cursor-pointer"
                        >
                          <div className="font-medium">{student.full_name}</div>
                          <div className="text-sm text-muted-foreground">
                            NIS: {student.nis} | Kelas:{" "}
                            {student.classes?.name || "-"}
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setIsOpen(false)}>
                    Batal
                  </Button>
                  <Button
                    onClick={handleGraduate}
                    disabled={selectedStudents.length === 0}
                    className="gap-2"
                  >
                    <GraduationCap className="h-4 w-4" />
                    Luluskan ({selectedStudents.length})
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Kelulusan</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin meluluskan {selectedStudents.length} siswa?
              <br />
              <br />
              Tindakan ini akan:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Memindahkan siswa ke data alumni</li>
                <li>Mencatat tanggal kelulusan</li>
                <li>Membuat pengumuman kelulusan</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={graduateMutation.isPending}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmGraduate}
              disabled={graduateMutation.isPending}
            >
              {graduateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                "Ya, Luluskan"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
