import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Search, FileDown, Plane, Eye, Pencil, Calendar as CalendarIcon, X, FileText, Wrench, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn, toTitleCase } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SPDPreviewDialog } from "@/components/spd/SPDPreviewDialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DataPagination } from "@/components/ui/data-pagination";
import { usePagination } from "@/hooks/usePagination";

const numberToWords = (num: number): string => {
  const words = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh',
    'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas', 'dua puluh',
    'dua puluh satu', 'dua puluh dua', 'dua puluh tiga', 'dua puluh empat', 'dua puluh lima', 'dua puluh enam', 'dua puluh tujuh', 'dua puluh delapan', 'dua puluh sembilan', 'tiga puluh'];
  return words[num] || num.toString();
};

const travelSchema = z.object({
  assignment_letter_id: z.string().min(1, "Surat Tugas wajib dipilih"),
  letter_date: z.string().min(1, "Tanggal surat wajib diisi"),
  purpose: z.string().min(1, "Tujuan perjalanan wajib diisi").max(200, "Tujuan maksimal 200 karakter"),
  destination: z.string().min(1, "Tujuan wajib diisi").max(200, "Tujuan maksimal 200 karakter"),
  departure_date: z.string().min(1, "Tanggal berangkat wajib diisi"),
  return_date: z.string().min(1, "Tanggal kembali wajib diisi"),
  total_executors: z.number().min(1, "Minimal 1 guru harus dipilih"),
});

export default function OfficialTravel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTravel, setPreviewTravel] = useState<any>(null);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [selectedAssignmentLetter, setSelectedAssignmentLetter] = useState<string>("");
  const [selectedStudentFollowers, setSelectedStudentFollowers] = useState<string[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startDateFilter, setStartDateFilter] = useState<Date | undefined>();
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>();
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateSPD, setDuplicateSPD] = useState<{ id: string; letter_number: string; purpose: string; departure_date: string } | null>(null);
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairResults, setRepairResults] = useState<{ repaired: number; skipped: number; errors: string[] } | null>(null);
  const [formData, setFormData] = useState({
    assignment_letter_id: "",
    letter_number: "",
    letter_date: format(new Date(), "yyyy-MM-dd"),
    purpose: "",
    destination: "",
    departure_date: format(new Date(), "yyyy-MM-dd"),
    return_date: format(new Date(), "yyyy-MM-dd"),
    transportation: "",
    accommodation_budget: "",
    travel_budget: "",
    notes: "",
  });

  // Fetch assignment letters dengan order_index
  const { data: assignmentLetters, isLoading: loadingAssignmentLetters } = useQuery({
    queryKey: ["assignment-letters-for-sppd"],
    queryFn: async () => {
      const { data: letters, error: lettersError } = await supabase
        .from("assignment_letters")
        .select(`id, letter_number, letter_date, assignment_type, description, location, start_date, end_date, dasar_surat_tugas, tanggal_dasar_surat_tugas`)
        .order("letter_date", { ascending: false });

      if (lettersError) throw lettersError;

      return await Promise.all(
        (letters || []).map(async (letter) => {
          const { data: letterTeachers } = await supabase
            .from("assignment_letter_teachers")
            .select(`teacher_id, order_index, teachers (id, nip, subject, user_id, pangkat_golongan, jabatan)`)
            .eq("assignment_letter_id", letter.id)
            .order("order_index", { ascending: true });

          const teachersWithProfiles = await Promise.all(
            (letterTeachers || []).map(async (lt: any) => {
              if (lt.teachers?.user_id) {
                const { data: profile } = await supabase
                  .from("profiles_public").select("full_name").eq("id", lt.teachers.user_id).maybeSingle();
                return { ...lt, teachers: { ...lt.teachers, profiles: profile } };
              }
              return lt;
            })
          );

          const { data: manualExecutors } = await supabase
            .from("assignment_letter_manual_executors")
            .select("id, full_name, nip, pangkat_golongan, jabatan, order_index")
            .eq("assignment_letter_id", letter.id)
            .order("order_index", { ascending: true });

          return { ...letter, assignment_letter_teachers: teachersWithProfiles, assignment_letter_manual_executors: manualExecutors || [] };
        })
      );
    },
  });

  const selectedLetterData = assignmentLetters?.find((al: any) => al.id === selectedAssignmentLetter);

  const combinedExecutors = [
    ...(selectedLetterData?.assignment_letter_teachers || []).map((alt: any) => ({
      ...alt.teachers,
      isManual: false,
      order_index: alt.order_index ?? 0,
      profiles: alt.teachers?.profiles,
    })),
    ...(selectedLetterData?.assignment_letter_manual_executors || []).map((m: any) => ({
      id: m.id,
      nip: m.nip,
      jabatan: m.jabatan,
      pangkat_golongan: m.pangkat_golongan,
      profiles: { full_name: m.full_name },
      subject: m.jabatan || 'Pelaksana Manual',
      isManual: true,
      order_index: m.order_index ?? 0,
    })),
  ].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  const allExecutors = combinedExecutors;
  const mainTeacher = allExecutors[0] || null;
  const followerTeachers = allExecutors.slice(1) || [];

  const { data: teachers } = useQuery({
    queryKey: ["teachers-for-travel"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, nip, subject, user_id, pangkat_golongan, jabatan, profiles!inner(full_name)")
        .order("profiles(full_name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: students } = useQuery({
    queryKey: ["students-for-travel"],
    queryFn: async () => {
      const { data: studentsData, error } = await supabase
        .from("students").select("id, nis, nisn, full_name, class_id").eq("is_alumni", false).order("full_name");
      if (error) throw error;

      const classIds = [...new Set(studentsData?.map(s => s.class_id).filter(Boolean))] as string[];
      let classMap: Record<string, string> = {};
      if (classIds.length > 0) {
        const { data: classesData } = await supabase.from("classes").select("id, name").in("id", classIds);
        if (classesData) classMap = Object.fromEntries(classesData.map(c => [c.id, c.name]));
      }

      return studentsData?.map(student => ({
        ...student,
        class_name: student.class_id ? classMap[student.class_id] || "" : ""
      }));
    },
  });

  const filteredStudents = students?.filter((student) =>
    student.full_name.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
    student.nis.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
    (student.nisn && student.nisn.toLowerCase().includes(studentSearchQuery.toLowerCase()))
  ) || [];

  const { data: travels, isLoading } = useQuery({
    queryKey: ["official-travel-letters"],
    queryFn: async () => {
      const { data: letters, error: lettersError } = await supabase
        .from("official_travel_letters").select("*").order("letter_date", { ascending: false });

      if (lettersError) throw lettersError;

      return await Promise.all(
        (letters || []).map(async (letter) => {
          const { data: travelTeachers } = await supabase
            .from("official_travel_teachers")
            .select(`teacher_id, order_index, teachers (id, nip, subject, user_id, pangkat_golongan, jabatan)`)
            .eq("official_travel_id", letter.id)
            .order("order_index", { ascending: true });

          const teachersWithProfiles = await Promise.all(
            (travelTeachers || []).map(async (tt: any) => {
              if (tt.teachers?.user_id) {
                const { data: profile } = await supabase
                  .from("profiles_public").select("full_name").eq("id", tt.teachers.user_id).maybeSingle();
                return { ...tt, teachers: { ...tt.teachers, profiles: profile } };
              }
              return tt;
            })
          );

          const { data: followers } = await supabase
            .from("official_travel_followers")
            .select("id, follower_type, teacher_id, student_id, manual_executor_name, manual_executor_nip, manual_executor_pangkat, manual_executor_jabatan, order_index")
            .eq("official_travel_id", letter.id)
            .order("order_index", { ascending: true });

          const studentFollowers = (followers || []).filter(f => f.follower_type === "student" && f.student_id);
          const studentIds = studentFollowers.map(f => f.student_id);

          let studentsWithClass: Record<string, any> = {};
          if (studentIds.length > 0) {
            const { data: students } = await supabase
              .from("students").select("id, nis, nisn, full_name, class_id").in("id", studentIds);

            const classIds = (students || []).map(s => s.class_id).filter(Boolean);
            let classMap = new Map<string, string>();
            if (classIds.length > 0) {
              const { data: classes } = await supabase.from("classes").select("id, name").in("id", classIds);
              if (classes) classMap = new Map(classes.map(c => [c.id, c.name]));
            }

            (students || []).forEach(student => {
              studentsWithClass[student.id] = {
                id: student.id,
                nis: student.nis,
                nisn: student.nisn,
                full_name: student.full_name,
                class_id: student.class_id,
                class_name: student.class_id ? (classMap.get(student.class_id) || "") : ""
              };
            });
          }

          const followersWithData = (followers || []).map(f => {
            if (f.follower_type === "student" && f.student_id && studentsWithClass[f.student_id]) {
              return { ...f, students: studentsWithClass[f.student_id] };
            }
            if (f.follower_type === "manual_executor") {
              return {
                ...f,
                students: null,
                manual_executor: {
                  full_name: f.manual_executor_name,
                  nip: f.manual_executor_nip,
                  pangkat_golongan: f.manual_executor_pangkat,
                  jabatan: f.manual_executor_jabatan
                }
              };
            }
            return { ...f, students: null };
          });

          return { ...letter, official_travel_teachers: teachersWithProfiles, official_travel_followers: followersWithData };
        })
      );
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { teacher_ids: string[], student_follower_ids: string[] }) => {
      const selectedLetter = assignmentLetters?.find((al: any) => al.id === data.assignment_letter_id);
      const manualExecutorsCount = selectedLetter?.assignment_letter_manual_executors?.length || 0;
      const totalExecutors = selectedTeachers.length + manualExecutorsCount;

      travelSchema.parse({
        assignment_letter_id: data.assignment_letter_id,
        letter_date: data.letter_date,
        purpose: data.purpose,
        destination: data.destination,
        departure_date: data.departure_date,
        return_date: data.return_date,
        total_executors: totalExecutors,
      });

      const { data: existingLetter, error: checkError } = await supabase
        .from("official_travel_letters")
        .select("id, letter_number, purpose, departure_date")
        .eq("letter_number", data.letter_number)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingLetter) {
        const duplicateError = new Error('DUPLICATE_SPD');
        (duplicateError as any).duplicateData = existingLetter;
        throw duplicateError;
      }

      const { data: letter, error: letterError } = await supabase
        .from("official_travel_letters")
        .insert({
          letter_number: data.letter_number,
          letter_date: data.letter_date,
          purpose: data.purpose,
          destination: data.destination,
          departure_date: data.departure_date,
          return_date: data.return_date,
          transportation: data.transportation || null,
          accommodation_budget: data.accommodation_budget ? parseFloat(data.accommodation_budget) : null,
          travel_budget: data.travel_budget ? parseFloat(data.travel_budget) : null,
          notes: data.notes || null,
          created_by: user?.id!,
          assignment_letter_id: data.assignment_letter_id || null,
        })
        .select()
        .single();

      if (letterError) throw letterError;

      const teacherOrderMap: Record<string, number> = JSON.parse(
        sessionStorage.getItem('spd_teacher_order_map') || '{}'
      );

      const teacherInserts = data.teacher_ids.map((teacher_id) => ({
        official_travel_id: letter.id,
        teacher_id,
        order_index: teacherOrderMap[teacher_id] ?? 0,
      }));

      const { error: teacherError } = await supabase
        .from("official_travel_teachers").insert(teacherInserts);
      if (teacherError) throw teacherError;

      sessionStorage.removeItem('spd_teacher_order_map');

      if (data.student_follower_ids.length > 0) {
        const allFollowerInserts = data.student_follower_ids.map((student_id, idx) => ({
          official_travel_id: letter.id,
          follower_type: 'student',
          student_id,
          order_index: 10000 + idx,
        }));

        const { error: followerError } = await supabase
          .from("official_travel_followers").insert(allFollowerInserts);
        if (followerError) throw followerError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["official-travel-letters"] });
      toast.success("SPD berhasil dibuat");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else if (error.message === 'DUPLICATE_SPD' && error.duplicateData) {
        setDuplicateSPD(error.duplicateData);
        setDuplicateDialogOpen(true);
      } else {
        toast.error(error.message || "Gagal membuat SPD");
      }
    },
  });

  const handleEditDuplicateSPD = () => {
    if (!duplicateSPD) return;
    const fullSPDData = travels?.find((t: any) => t.id === duplicateSPD.id);
    if (fullSPDData) handleEdit(fullSPDData);
    setDuplicateDialogOpen(false);
    setDuplicateSPD(null);
  };

  const handleDeleteAndCreateNew = async () => {
    if (!duplicateSPD) return;
    try {
      await deleteMutation.mutateAsync(duplicateSPD.id);
      setDuplicateDialogOpen(false);
      setDuplicateSPD(null);
      toast.success("SPD lama berhasil dihapus. Silakan submit ulang untuk membuat SPD baru.");
    } catch (error) {
      toast.error("Gagal menghapus SPD yang ada");
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("official_travel_letters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["official-travel-letters"] });
      toast.success("SPD berhasil dihapus");
    },
    onError: (error: any) => {
      toast.error(error.message || "Gagal menghapus SPD");
    },
  });

  const handleRepairSPDData = async () => {
    setIsRepairing(true);
    setRepairResults(null);
    try {
      const results = { repaired: 0, skipped: 0, errors: [] as string[] };
      if (!travels || !assignmentLetters) throw new Error("Data SPD atau Surat Tugas tidak tersedia");

      for (const spd of travels) {
        try {
          const matchingLetter = assignmentLetters.find((al: any) => al.letter_number === spd.letter_number);
          if (!matchingLetter) { results.skipped++; continue; }

          const manualExecutors = matchingLetter.assignment_letter_manual_executors || [];
          const needsAssignmentLetterLink = !spd.assignment_letter_id;
          const existingManualExecutors = spd.official_travel_followers?.filter(
            (f: any) => f.follower_type === 'manual_executor'
          ) || [];
          const needsManualExecutors = manualExecutors.length > 0 && existingManualExecutors.length < manualExecutors.length;

          if (!needsAssignmentLetterLink && !needsManualExecutors) { results.skipped++; continue; }

          if (needsAssignmentLetterLink) {
            const { error: updateError } = await supabase
              .from("official_travel_letters").update({ assignment_letter_id: matchingLetter.id }).eq("id", spd.id);
            if (updateError) { results.errors.push(`SPD ${spd.letter_number}: ${updateError.message}`); continue; }
          }

          if (!needsAssignmentLetterLink && needsManualExecutors) {
            await supabase.from("official_travel_followers").delete()
              .eq("official_travel_id", spd.id).eq("follower_type", "manual_executor");

            const teacherCount = (spd.official_travel_teachers || []).length;
            const followerInserts = manualExecutors.map((executor: any) => ({
              official_travel_id: spd.id,
              follower_type: 'manual_executor',
              manual_executor_name: executor.full_name,
              manual_executor_nip: executor.nip || null,
              manual_executor_pangkat: executor.pangkat_golongan || null,
              manual_executor_jabatan: executor.jabatan || null,
              order_index: teacherCount + (executor.order_index ?? 0),
            }));

            const { error } = await supabase.from("official_travel_followers").insert(followerInserts);
            if (error) { results.errors.push(`SPD ${spd.letter_number}: ${error.message}`); continue; }
          }
          results.repaired++;
        } catch (error: any) {
          results.errors.push(`SPD ${spd.letter_number}: ${error.message || 'Unknown error'}`);
        }
      }

      setRepairResults(results);
      if (results.repaired > 0) {
        queryClient.invalidateQueries({ queryKey: ["official-travel-letters"] });
        toast.success(`Berhasil memperbaiki ${results.repaired} SPD`);
      } else if (results.skipped === travels.length) {
        toast.info("Semua SPD sudah memiliki data yang lengkap");
      }
    } catch (error: any) {
      toast.error(error.message || "Gagal memperbaiki data SPD");
    } finally {
      setIsRepairing(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { teacher_ids: string[], student_follower_ids: string[] }) => {
      if (!editingId) throw new Error("No editing ID");

      const selectedLetterForUpdate = assignmentLetters?.find((al: any) => al.id === data.assignment_letter_id);
      const manualExecutorsCountForUpdate = selectedLetterForUpdate?.assignment_letter_manual_executors?.length || 0;
      const totalExecutorsForUpdate = selectedTeachers.length + manualExecutorsCountForUpdate;

      travelSchema.parse({
        assignment_letter_id: data.assignment_letter_id,
        letter_date: data.letter_date,
        purpose: data.purpose,
        destination: data.destination,
        departure_date: data.departure_date,
        return_date: data.return_date,
        total_executors: totalExecutorsForUpdate,
      });

      const { error: letterError } = await supabase
        .from("official_travel_letters")
        .update({
          letter_number: data.letter_number,
          letter_date: data.letter_date,
          purpose: data.purpose,
          destination: data.destination,
          departure_date: data.departure_date,
          return_date: data.return_date,
          transportation: data.transportation || null,
          accommodation_budget: data.accommodation_budget ? parseFloat(data.accommodation_budget) : null,
          travel_budget: data.travel_budget ? parseFloat(data.travel_budget) : null,
          notes: data.notes || null,
          assignment_letter_id: data.assignment_letter_id || null,
        })
        .eq("id", editingId);

      if (letterError) throw letterError;

      await supabase.from("official_travel_teachers").delete().eq("official_travel_id", editingId);

      const teacherOrderMap: Record<string, number> = JSON.parse(
        sessionStorage.getItem('spd_teacher_order_map') || '{}'
      );

      const teacherInserts = data.teacher_ids.map((teacher_id) => ({
        official_travel_id: editingId,
        teacher_id,
        order_index: teacherOrderMap[teacher_id] ?? 0,
      }));

      if (teacherInserts.length > 0) {
        const { error: teacherError } = await supabase.from("official_travel_teachers").insert(teacherInserts);
        if (teacherError) throw teacherError;
      }

      sessionStorage.removeItem('spd_teacher_order_map');

      await supabase.from("official_travel_followers").delete()
        .eq("official_travel_id", editingId).eq("follower_type", "student");

      if (data.student_follower_ids.length > 0) {
        const studentFollowerInserts = data.student_follower_ids.map((student_id, idx) => ({
          official_travel_id: editingId,
          follower_type: 'student',
          student_id,
          order_index: 10000 + idx,
        }));

        const { error: followerError } = await supabase.from("official_travel_followers").insert(studentFollowerInserts);
        if (followerError) throw followerError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["official-travel-letters"] });
      toast.success("SPD berhasil diperbarui");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Gagal memperbarui SPD");
    },
  });

  const resetForm = () => {
    setFormData({
      assignment_letter_id: "",
      letter_number: "",
      letter_date: format(new Date(), "yyyy-MM-dd"),
      purpose: "",
      destination: "",
      departure_date: format(new Date(), "yyyy-MM-dd"),
      return_date: format(new Date(), "yyyy-MM-dd"),
      transportation: "",
      accommodation_budget: "",
      travel_budget: "",
      notes: "",
    });
    setSelectedTeachers([]);
    setSelectedAssignmentLetter("");
    setSelectedStudentFollowers([]);
    setStudentSearchQuery("");
    setIsEditMode(false);
    setEditingId(null);
    sessionStorage.removeItem('spd_teacher_order_map');
  };

  const handleAssignmentLetterSelect = (letterId: string) => {
    setSelectedAssignmentLetter(letterId);
    const selectedLetter = assignmentLetters?.find((al: any) => al.id === letterId);

    if (selectedLetter) {
      const sortedTeachers = [...(selectedLetter.assignment_letter_teachers || [])]
        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));

      const teacherIds = sortedTeachers.map((alt: any) => alt.teacher_id);
      setSelectedTeachers(teacherIds);

      const teacherOrderMap: Record<string, number> = {};
      sortedTeachers.forEach((alt: any) => {
        teacherOrderMap[alt.teacher_id] = alt.order_index ?? 0;
      });
      sessionStorage.setItem('spd_teacher_order_map', JSON.stringify(teacherOrderMap));

      setFormData({
        ...formData,
        assignment_letter_id: letterId,
        letter_number: selectedLetter.letter_number,
        letter_date: selectedLetter.letter_date,
        purpose: selectedLetter.description,
        destination: selectedLetter.location,
        departure_date: selectedLetter.start_date,
        return_date: selectedLetter.end_date,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditMode && editingId) {
      updateMutation.mutate({ ...formData, teacher_ids: selectedTeachers, student_follower_ids: selectedStudentFollowers });
    } else {
      createMutation.mutate({ ...formData, teacher_ids: selectedTeachers, student_follower_ids: selectedStudentFollowers });
    }
  };

  const handleEdit = (travel: any) => {
    setIsEditMode(true);
    setEditingId(travel.id);

    setFormData({
      assignment_letter_id: travel.assignment_letter_id || "",
      letter_number: travel.letter_number,
      letter_date: travel.letter_date,
      purpose: travel.purpose,
      destination: travel.destination,
      departure_date: travel.departure_date,
      return_date: travel.return_date,
      transportation: travel.transportation || "",
      accommodation_budget: travel.accommodation_budget?.toString() || "",
      travel_budget: travel.travel_budget?.toString() || "",
      notes: travel.notes || "",
    });

    setSelectedAssignmentLetter(travel.assignment_letter_id || "");

    const sortedTeachers = [...(travel.official_travel_teachers || [])]
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const teacherIds = sortedTeachers.map((tt: any) => tt.teacher_id);
    setSelectedTeachers(teacherIds);

    const teacherOrderMap: Record<string, number> = {};
    sortedTeachers.forEach((tt: any) => {
      teacherOrderMap[tt.teacher_id] = tt.order_index ?? 0;
    });
    sessionStorage.setItem('spd_teacher_order_map', JSON.stringify(teacherOrderMap));

    const studentIds = travel.official_travel_followers
      ?.filter((f: any) => f.follower_type === 'student')
      .map((f: any) => f.student_id) || [];
    setSelectedStudentFollowers(studentIds);

    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Yakin ingin menghapus SPD ini?")) {
      deleteMutation.mutate(id);
    }
  };

  const toggleTeacher = (teacherId: string) => {
    setSelectedTeachers((prev) =>
      prev.includes(teacherId) ? prev.filter((id) => id !== teacherId) : [...prev, teacherId]
    );
  };

  const toggleStudentFollower = (studentId: string) => {
    setSelectedStudentFollowers((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const exportPDF = async (travel: any) => {
    try {
      const { data: settings } = await supabase.from("school_settings").select("*").single();

      // Baca font size dari localStorage (sinkron dengan SPDPreviewDialog)
      const saved = JSON.parse(localStorage.getItem("spd_preview_settings_v1") || "{}");
      const fontSizeTitle = saved.fontSizeTitle ?? 12;
      const fontSizeBody = saved.fontSizeBody ?? 10;
      const fontSizeTable = saved.fontSizeTable ?? 9;
      const fontSizeSignature = saved.fontSizeSignature ?? 10;
      const BLACK: [number, number, number] = [0, 0, 0];
      const WHITE: [number, number, number] = [255, 255, 255];

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [210, 330] });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setTextColor(...BLACK);
      doc.setDrawColor(...BLACK);

      let yPos = 15;
      if (settings) {
        yPos = await addLetterheadToPDF(doc, {
          school_name: settings.school_name,
          district_name: settings.district_name,
          school_address: settings.school_address,
          school_phone: settings.school_phone,
          logo_url: settings.logo_url,
          right_logo_url: settings.right_logo_url,
          show_address: settings.show_address,
          show_phone: settings.show_phone,
        });
      }

      yPos += 5;
      doc.setFontSize(fontSizeBody);
      doc.setFont("helvetica", "normal");
      doc.text("Lembar ke", pageWidth - 70, yPos);
      doc.text(": .................................", pageWidth - 50, yPos);
      yPos += 5;
      doc.text("Kode No.", pageWidth - 70, yPos);
      doc.text(": .................................", pageWidth - 50, yPos);
      yPos += 5;
      doc.text("Nomor", pageWidth - 70, yPos);
      doc.text(`: ${travel.letter_number}`, pageWidth - 50, yPos);

      yPos += 10;
      doc.setFontSize(fontSizeTitle);
      doc.setFont("helvetica", "bold");
      doc.text("SURAT PERJALANAN DINAS (SPD)", pageWidth / 2, yPos, { align: "center" });
      doc.setLineWidth(0.5);
      doc.line(pageWidth / 2 - 45, yPos + 1, pageWidth / 2 + 45, yPos + 1);

      const departureDate = new Date(travel.departure_date);
      const returnDate = new Date(travel.return_date);
      const diffTime = Math.abs(returnDate.getTime() - departureDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      const sortedTeachers = [...(travel.official_travel_teachers || [])]
        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
      const firstTeacher = sortedTeachers[0]?.teachers;
      const teacherName = toTitleCase(firstTeacher?.profiles?.full_name) || "-";
      const teacherNip = firstTeacher?.nip || "-";
      const teacherPangkat = firstTeacher?.pangkat_golongan || "-";
      const teacherJabatan = firstTeacher?.jabatan || "-";

      yPos += 8;
      const tableData = [
        ["1.", "Pejabat Pembuat Komitmen", `Kepala ${settings?.school_name || "-"}`],
        ["2.", "Nama/NIP Pegawai yang\nmelaksanakan perjalanan dinas", `${teacherName}\nNIP. ${teacherNip}`],
        ["3.", "a. Pangkat dan Golongan\nb. Jabatan/Instansi\nc. Tingkat Biaya Perjalanan Dinas", `a. ${teacherPangkat}\nb. ${teacherJabatan}\nc. BOS`],
        ["4.", "Maksud Perjalanan Dinas", travel.purpose],
        ["5.", "Alat angkut yang dipergunakan", travel.transportation || "Kendaraan Pribadi"],
        ["6.", "a. Tempat Berangkat\nb. Tempat Tujuan", `a. ${settings?.school_name || "-"}\nb. ${travel.destination}`],
        ["7.", "a. Lamanya Perjalanan Dinas\nb. Tanggal Berangkat\nc. Tanggal harus kembali/\n    tiba di tempat baru", `a. ${diffDays} (${numberToWords(diffDays)}) hari\nb. ${format(departureDate, "dd MMMM yyyy", { locale: idLocale })}\nc. ${format(returnDate, "dd MMMM yyyy", { locale: idLocale })}`],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [],
        body: tableData,
        styles: { fontSize: fontSizeTable, cellPadding: 3, lineColor: BLACK, lineWidth: 0.2, valign: 'top', textColor: BLACK, fillColor: WHITE },
        headStyles: { textColor: BLACK, fillColor: WHITE },
        bodyStyles: { textColor: BLACK, fillColor: WHITE },
        alternateRowStyles: { fillColor: WHITE },
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 55 }, 2: { cellWidth: pageWidth - 93 } },
        theme: 'grid',
        margin: { left: 14, right: 14 },
      });

      yPos = (doc as any).lastAutoTable.finalY;

      const followerExecutors = [
        ...sortedTeachers.slice(1).map((t: any) => ({
          name: t.teachers?.profiles?.full_name || "-",
          ket: `Guru - NIP. ${t.teachers?.nip || "-"}`,
          order_index: t.order_index ?? 0,
        })),
        ...(travel.official_travel_followers || [])
          .filter((f: any) => f.follower_type === 'manual_executor')
          .map((f: any) => ({
            name: f.manual_executor?.full_name || f.manual_executor_name || "-",
            ket: `${f.manual_executor?.jabatan || "-"} - NIP. ${f.manual_executor?.nip || "-"}`,
            order_index: f.order_index ?? 0,
          })),
        ...(travel.official_travel_followers || [])
          .filter((f: any) => f.follower_type === 'student')
          .map((f: any) => ({
            name: f.students?.full_name || "-",
            ket: `Siswa - NIS. ${f.students?.nis || "-"}${f.students?.class_name ? ` (${f.students.class_name})` : ""}`,
            order_index: f.order_index ?? 9999,
          })),
      ].sort((a, b) => a.order_index - b.order_index);

      const followerData = followerExecutors.map((f) => [f.name, "", f.ket]);
      if (followerData.length === 0) followerData.push(["", "", ""]);

      autoTable(doc, {
        startY: yPos,
        head: [],
        body: [
          [{ content: "8.", rowSpan: followerData.length + 1 }, { content: "Pengikut", rowSpan: followerData.length + 1 }, "Nama", "Tgl lahir", "Keterangan"],
          ...followerData,
        ],
        styles: { fontSize: fontSizeTable - 1, cellPadding: 2, lineColor: BLACK, lineWidth: 0.2, valign: 'middle', textColor: BLACK, fillColor: WHITE },
        headStyles: { textColor: BLACK, fillColor: WHITE },
        bodyStyles: { textColor: BLACK, fillColor: WHITE },
        alternateRowStyles: { fillColor: WHITE },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 55 },
          2: { cellWidth: 45 },
          3: { cellWidth: 28 },
          4: { cellWidth: pageWidth - 93 - 45 - 28 },
        },
        theme: 'grid',
        margin: { left: 14, right: 14 },
      });

      yPos = (doc as any).lastAutoTable.finalY;

      autoTable(doc, {
        startY: yPos,
        head: [],
        body: [
          ["9.", "Pembebanan Anggaran\na. Instansi\nb. Akun", `a. ${settings?.school_name || "-"}\nb. ..............................`],
          ["10.", "Keterangan lain-lain", travel.notes || "-"],
        ],
        styles: { fontSize: fontSizeTable, cellPadding: 2, lineColor: BLACK, lineWidth: 0.2, valign: 'top', textColor: BLACK, fillColor: WHITE },
        headStyles: { textColor: BLACK, fillColor: WHITE },
        bodyStyles: { textColor: BLACK, fillColor: WHITE },
        alternateRowStyles: { fillColor: WHITE },
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 55 }, 2: { cellWidth: pageWidth - 93 } },
        theme: 'grid',
        margin: { left: 14, right: 14 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 8;

      // TTD Pejabat Pembuat Komitmen — ruang TTD 25mm
      doc.setFontSize(fontSizeSignature);
      doc.setFont("helvetica", "normal");
      doc.text(`Dikeluarkan di : Ciamis`, pageWidth - 80, yPos);
      yPos += 4;
      doc.text(`Tanggal : ${format(new Date(travel.letter_date), "dd MMMM yyyy", { locale: idLocale })}`, pageWidth - 80, yPos);
      yPos += 5;
      doc.text("Pejabat Pembuat Komitmen", pageWidth - 80, yPos);
      yPos += 25;
      doc.setFont("helvetica", "bold");
      doc.text(settings?.headmaster_name || "", pageWidth - 80, yPos);
      doc.setFont("helvetica", "normal");
      yPos += 4;
      doc.text(`NIP. ${settings?.headmaster_nip || ""}`, pageWidth - 80, yPos);

      // === PAGE 2 ===
      doc.addPage();
      yPos = 15;

      const col1X = 14;
      const col2X = pageWidth / 2;
      const colWidth = (pageWidth - 28) / 2;
      const tableWidth = pageWidth - 28;
      const numColWidth = 12;

      doc.setLineWidth(0.2);
      doc.setFontSize(fontSizeBody);

      const section1Height = 52;
      doc.rect(col1X, yPos, colWidth, section1Height);
      doc.rect(col2X, yPos, colWidth, section1Height);

      const s1LabelX = col2X + 5;
      const s1ValueX = col2X + 40;

      doc.text("I.", col2X + 3, yPos + 6);
      doc.text("Berangkat Dari", s1LabelX + 5, yPos + 6);
      doc.text("(tempat kedudukan)", s1LabelX + 5, yPos + 10);
      doc.text("Ke", s1LabelX + 5, yPos + 15);
      doc.text("Pada Tanggal", s1LabelX + 5, yPos + 20);
      doc.text(`Kepala ${settings?.school_name || ""}`, s1LabelX + 5, yPos + 26);

      doc.text(`: ${settings?.school_name || ""}`, s1ValueX, yPos + 6);
      doc.text(`: ${travel.destination}`, s1ValueX, yPos + 15);
      doc.text(`: ${format(departureDate, "dd MMMM yyyy", { locale: idLocale })}`, s1ValueX, yPos + 20);

      doc.setFontSize(fontSizeSignature);
      doc.setFont("helvetica", "bold");
      doc.text(settings?.headmaster_name || "", s1LabelX + 5, yPos + 42);
      doc.setFont("helvetica", "normal");
      doc.text(`NIP. ${settings?.headmaster_nip || ""}`, s1LabelX + 5, yPos + 47);

      yPos += section1Height;

      const rowHeight = 42;
      const section6Height = 46;
      const totalTableHeight = (4 * rowHeight) + section6Height;

      doc.rect(col1X, yPos, tableWidth, totalTableHeight);
      doc.line(col2X, yPos, col2X, yPos + totalTableHeight);

      let lineY = yPos;
      for (let i = 0; i < 4; i++) {
        lineY += rowHeight;
        doc.line(col1X, lineY, col1X + tableWidth, lineY);
      }

      const leftLabelX = col1X + numColWidth + 2;
      const leftValueX = col1X + 35;
      const rightLabelX = col2X + 3;
      const rightValueX = col2X + 35;

      doc.setFontSize(fontSizeTable - 1);

      let rowY = yPos;
      doc.text("II.", col1X + 3, rowY + 5);
      doc.text("Tiba di", leftLabelX, rowY + 5);
      doc.text("Pada Tanggal", leftLabelX, rowY + 9);
      doc.text(`Kepala`, leftLabelX, rowY + 13);
      doc.text(`: ${travel.destination}`, leftValueX, rowY + 5);
      doc.text(`: ${format(departureDate, "dd MMMM yyyy", { locale: idLocale })}`, leftValueX, rowY + 9);
      doc.text("(..............................................)", leftLabelX, rowY + 32);
      doc.text("NIP.", leftLabelX, rowY + 37);

      doc.text("Berangkat Dari", rightLabelX, rowY + 5);
      doc.text("Ke", rightLabelX, rowY + 9);
      doc.text("Pada Tanggal", rightLabelX, rowY + 13);
      doc.text("Kepala", rightLabelX, rowY + 17);
      doc.text(`: ${travel.destination}`, rightValueX, rowY + 5);
      doc.text(`: ${settings?.school_name || ""}`, rightValueX, rowY + 9);
      doc.text(`: ${format(departureDate, "dd MMMM yyyy", { locale: idLocale })}`, rightValueX, rowY + 13);
      doc.text("(..............................................)", rightLabelX, rowY + 32);
      doc.text("NIP.", rightLabelX, rowY + 37);

      rowY += rowHeight;

      const emptyRows = ["III", "IV", "V"];
      emptyRows.forEach((num) => {
        doc.text(`${num}.`, col1X + 3, rowY + 5);
        doc.text("Tiba di", leftLabelX, rowY + 5);
        doc.text("Pada Tanggal", leftLabelX, rowY + 9);
        doc.text("Kepala", leftLabelX, rowY + 13);
        doc.text(": .................................", leftValueX, rowY + 5);
        doc.text(": .................................", leftValueX, rowY + 9);
        doc.text(": .................................", leftValueX, rowY + 13);
        doc.text("(..............................................)", leftLabelX, rowY + 32);
        doc.text("NIP.", leftLabelX, rowY + 37);

        doc.text("Berangkat Dari", rightLabelX, rowY + 5);
        doc.text("Ke", rightLabelX, rowY + 9);
        doc.text("Pada Tanggal", rightLabelX, rowY + 13);
        doc.text("Kepala", rightLabelX, rowY + 17);
        doc.text(": .................................", rightValueX, rowY + 5);
        doc.text(": .................................", rightValueX, rowY + 9);
        doc.text(": .................................", rightValueX, rowY + 13);
        doc.text("(..............................................)", rightLabelX, rowY + 32);
        doc.text("NIP.", rightLabelX, rowY + 37);

        rowY += rowHeight;
      });

      doc.text("VI.", col1X + 3, rowY + 6);
      doc.text("Tiba di", leftLabelX, rowY + 6);
      doc.text("Pada Tanggal", leftLabelX, rowY + 11);
      doc.text(`Kepala ${settings?.school_name || ""}`, leftLabelX, rowY + 16);
      doc.text(`: ${settings?.school_name || ""}`, leftValueX, rowY + 6);
      doc.text(`: ${format(returnDate, "dd MMMM yyyy", { locale: idLocale })}`, leftValueX, rowY + 11);

      doc.setFontSize(fontSizeSignature);
      doc.setFont("helvetica", "bold");
      doc.text(toTitleCase(settings?.headmaster_name) || "", leftLabelX, rowY + 32);
      doc.setFont("helvetica", "normal");
      doc.text(`NIP. ${settings?.headmaster_nip || ""}`, leftLabelX, rowY + 37);

      const disclaimer = doc.splitTextToSize("Telah diperiksa, dengan keterangan bahwa perjalanan tersebut diatas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan dalam kurun waktu yang sesingkat-singkatnya", colWidth - 10);
      doc.text(disclaimer, rightLabelX, rowY + 8);

      yPos = rowY + section6Height;

      doc.setFontSize(fontSizeBody);
      doc.rect(col1X, yPos, tableWidth, 12);
      doc.text("VII. Catatan Lain-lain", col1X + 3, yPos + 8);

      yPos += 12;

      doc.rect(col1X, yPos, tableWidth, 24);
      doc.setFontSize(fontSizeTable - 2);
      doc.text("VIII. PERHATIAN:", col1X + 3, yPos + 6);
      const perhatian = doc.splitTextToSize("PPK yang menerbitkan SPD, pegawai yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba, serta bendahara pengeluaran bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara apabila negara menderita rugi akibat kesalahan, kelalaian, dan kealpaannya.", tableWidth - 10);
      doc.text(perhatian, col1X + 3, yPos + 11);

      yPos += 24 + 12;

      doc.setFontSize(fontSizeSignature);
      doc.setFont("helvetica", "normal");
      doc.text("Pejabat Pembuat Komitmen", pageWidth - 60, yPos, { align: "center" });
      yPos += 25;
      doc.setFont("helvetica", "bold");
      doc.text(toTitleCase(settings?.headmaster_name) || "", pageWidth - 60, yPos, { align: "center" });
      doc.setFont("helvetica", "normal");
      yPos += 4;
      doc.text(`NIP. ${settings?.headmaster_nip || ""}`, pageWidth - 60, yPos, { align: "center" });

      // LPT pages
      const lptExecutors = [
        ...sortedTeachers.map((tt: any) => ({
          name: tt.teachers?.profiles?.full_name || "-",
          nip: tt.teachers?.nip || "-",
          order_index: tt.order_index ?? 0,
        })),
        ...(travel.official_travel_followers || [])
          .filter((f: any) => f.follower_type === 'manual_executor')
          .map((f: any) => ({
            name: f.manual_executor?.full_name || f.manual_executor_name || "-",
            nip: f.manual_executor?.nip || f.manual_executor_nip || "-",
            order_index: f.order_index ?? 0,
          })),
      ].sort((a, b) => a.order_index - b.order_index);

      const generateLPTPage = (name: string, nip: string) => {
        const formattedName = toTitleCase(name);
        doc.addPage();
        let lptYPos = 30;

        doc.setFontSize(fontSizeTitle + 2);
        doc.setFont("helvetica", "bold");
        doc.text("LAPORAN PELAKSANAAN TUGAS", pageWidth / 2, lptYPos, { align: "center" });
        lptYPos += 7;
        doc.text("(LPT)", pageWidth / 2, lptYPos, { align: "center" });

        lptYPos += 20;
        doc.setFontSize(fontSizeBody + 1);
        doc.setFont("helvetica", "normal");

        const labelX = 14;
        const colonX = 60;
        const valueX = 65;
        const lineHeight = 8;

        doc.text("1. Nama", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.setFont("helvetica", "bold");
        doc.text(formattedName, valueX, lptYPos);
        doc.setFont("helvetica", "normal");

        lptYPos += lineHeight;
        doc.text("2. NIP", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.text(nip, valueX, lptYPos);

        lptYPos += lineHeight;
        doc.text("3. Dasar Surat Tugas Nomor", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.text(travel.letter_number, valueX, lptYPos);

        lptYPos += lineHeight;
        doc.text("4. Tujuan", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        const purposeText = doc.splitTextToSize(`Untuk ${travel.purpose}`, pageWidth - valueX - 14);
        doc.text(purposeText, valueX, lptYPos);
        lptYPos += purposeText.length > 1 ? lineHeight * purposeText.length : lineHeight;

        doc.text("5. Waktu", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.text("08.30 s.d selesai", valueX, lptYPos);

        lptYPos += lineHeight;
        doc.text("    a. Berangkat", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.text(format(departureDate, "dd MMMM yyyy", { locale: idLocale }), valueX, lptYPos);

        lptYPos += lineHeight;
        doc.text("    b. Kembali", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.text(format(returnDate, "dd MMMM yyyy", { locale: idLocale }), valueX, lptYPos);

        lptYPos += lineHeight + 2;

        doc.text("6. Sasaran", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        for (let i = 0; i < 3; i++) {
          doc.text("..........................................................................................................", valueX, lptYPos + (i * 6));
        }

        lptYPos += 22;

        doc.text("7.Hasil yang dicapai", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        for (let i = 0; i < 6; i++) {
          doc.text("..........................................................................................................", valueX, lptYPos + (i * 6));
        }

        lptYPos += 40;

        doc.text("8. Saran-saran", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        for (let i = 0; i < 3; i++) {
          doc.text("..........................................................................................................", valueX, lptYPos + (i * 6));
        }

        lptYPos += 35;

        const leftSignX = 14;
        const rightSignX = pageWidth / 2 + 20;

        doc.text("Mengetahui,", leftSignX, lptYPos);
        lptYPos += 5;
        doc.text(`Kepala ${settings?.school_name || ""}`, leftSignX, lptYPos);

        const lptSignDate = `Ciamis, ${format(returnDate, "dd MMMM yyyy", { locale: idLocale })}`;
        doc.text(lptSignDate, rightSignX, lptYPos - 5);
        doc.text("Pelapor,", rightSignX, lptYPos);

        lptYPos += 30;

        doc.setFont("helvetica", "bold");
        doc.text(settings?.headmaster_name || "", leftSignX, lptYPos);
        doc.text(name, rightSignX, lptYPos);
        doc.setFont("helvetica", "normal");
        lptYPos += 5;
        doc.text(`NIP. ${settings?.headmaster_nip || ""}`, leftSignX, lptYPos);
        doc.text(`NIP. ${nip}`, rightSignX, lptYPos);
      };

      for (let i = 0; i < lptExecutors.length; i++) {
        generateLPTPage(lptExecutors[i].name, lptExecutors[i].nip);
      }

      doc.save(`SPD-${travel.letter_number}.pdf`);
      toast.success("PDF berhasil diunduh");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Gagal membuat PDF");
    }
  };

  const previewPDF = (travel: any) => {
    setPreviewTravel(travel);
    setIsPreviewOpen(true);
  };

  const filteredTravels = travels?.filter((travel) => {
    const matchesSearch = travel.letter_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      travel.purpose.toLowerCase().includes(searchQuery.toLowerCase()) ||
      travel.destination.toLowerCase().includes(searchQuery.toLowerCase());

    const travelDate = new Date(travel.letter_date);
    const matchesStartDate = !startDateFilter || travelDate >= startDateFilter;
    const matchesEndDate = !endDateFilter || travelDate <= endDateFilter;

    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  // ✅ Pagination
  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalItems,
    paginatedItems: paginatedTravels,
  } = usePagination(filteredTravels, 10);

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                <Plane className="h-8 w-8" />
                SPD
              </h1>
              <p className="text-muted-foreground">Surat Perjalanan Dinas</p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="mr-2 h-4 w-4" />
                  Buat SPD
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{isEditMode ? "Edit SPD" : "Buat SPD Baru"}</DialogTitle>
                  <DialogDescription>
                    {isEditMode ? "Ubah data SPD yang sudah ada" : "Isi form di bawah untuk membuat surat perjalanan dinas"}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {!isEditMode && (
                    <div className="space-y-2">
                      <Label>Pilih Surat Tugas *</Label>
                      <SearchableSelect
                        options={
                          assignmentLetters?.map((letter: any) => ({
                            value: letter.id,
                            label: letter.letter_number,
                            description: `${letter.description?.substring(0, 80) || ""} • ${letter.location || ""}`,
                            keywords: `${letter.letter_number} ${letter.description || ""} ${letter.assignment_type || ""} ${letter.location || ""}`,
                          })) || []
                        }
                        value={selectedAssignmentLetter}
                        onValueChange={handleAssignmentLetterSelect}
                        placeholder={loadingAssignmentLetters ? "Memuat..." : "Pilih nomor surat tugas..."}
                        searchPlaceholder="Cari nomor surat / deskripsi / lokasi..."
                        emptyMessage="Tidak ada surat tugas yang cocok."
                        loading={loadingAssignmentLetters}
                        maxHeight="min(400px, 50vh)"
                      />
                    </div>
                  )}

                  {((selectedAssignmentLetter && selectedLetterData) || isEditMode) && (
                    <>
                      {!isEditMode && selectedLetterData && (
                        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                          <h4 className="font-semibold text-sm border-b pb-2">Data dari Surat Tugas</h4>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-muted-foreground">Nomor Surat:</span>
                              <p className="font-medium">{selectedLetterData.letter_number}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tanggal Surat:</span>
                              <p className="font-medium">{format(new Date(selectedLetterData.letter_date), "dd MMMM yyyy", { locale: idLocale })}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Jenis Tugas:</span>
                              <p className="font-medium">{selectedLetterData.assignment_type}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Lokasi:</span>
                              <p className="font-medium">{selectedLetterData.location}</p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Deskripsi:</span>
                              <p className="font-medium">{selectedLetterData.description}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tanggal Mulai:</span>
                              <p className="font-medium">{format(new Date(selectedLetterData.start_date), "dd MMMM yyyy", { locale: idLocale })}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tanggal Selesai:</span>
                              <p className="font-medium">{format(new Date(selectedLetterData.end_date), "dd MMMM yyyy", { locale: idLocale })}</p>
                            </div>
                          </div>

                          {mainTeacher && (
                            <div className="mt-3 pt-3 border-t">
                              <span className="text-muted-foreground text-sm">Pelaksana Utama:</span>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="default" className="text-xs">Pelaksana</Badge>
                                {mainTeacher.isManual && (
                                  <Badge variant="outline" className="text-xs">Manual</Badge>
                                )}
                                <span className="font-medium text-sm">
                                  {mainTeacher.profiles?.full_name || "-"} - NIP. {mainTeacher.nip || "-"}
                                </span>
                              </div>
                            </div>
                          )}

                          {followerTeachers.length > 0 && (
                            <div className="mt-2">
                              <span className="text-muted-foreground text-sm">Pengikut ({followerTeachers.length} orang):</span>
                              <div className="space-y-1 mt-1">
                                {followerTeachers.map((executor: any, idx: number) => (
                                  <div key={executor.id ?? idx} className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-xs">Pengikut {idx + 1}</Badge>
                                    {executor.isManual && (
                                      <Badge variant="outline" className="text-xs">Manual</Badge>
                                    )}
                                    <span className="text-sm">
                                      {executor.profiles?.full_name || "-"} - NIP. {executor.nip || "-"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="letter_number">Nomor SPD *</Label>
                          <Input
                            id="letter_number"
                            value={formData.letter_number}
                            onChange={(e) => setFormData({ ...formData, letter_number: e.target.value })}
                            disabled={!isEditMode}
                            className={!isEditMode ? "bg-muted" : ""}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="letter_date">Tanggal Surat SPD *</Label>
                          <Input
                            id="letter_date"
                            type="date"
                            value={formData.letter_date}
                            onChange={(e) => setFormData({ ...formData, letter_date: e.target.value })}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="purpose">Maksud Perjalanan *</Label>
                        <Input
                          id="purpose"
                          value={formData.purpose}
                          onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                          placeholder="Contoh: Mengikuti Workshop Kurikulum Merdeka"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="destination">Tujuan *</Label>
                        <Input
                          id="destination"
                          value={formData.destination}
                          onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                          placeholder="Contoh: Jakarta, Hotel Grand Mercure"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="departure_date">Tanggal Berangkat *</Label>
                          <Input
                            id="departure_date"
                            type="date"
                            value={formData.departure_date}
                            onChange={(e) => setFormData({ ...formData, departure_date: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="return_date">Tanggal Kembali *</Label>
                          <Input
                            id="return_date"
                            type="date"
                            value={formData.return_date}
                            onChange={(e) => setFormData({ ...formData, return_date: e.target.value })}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="transportation">Alat Angkutan</Label>
                        <Input
                          id="transportation"
                          value={formData.transportation}
                          onChange={(e) => setFormData({ ...formData, transportation: e.target.value })}
                          placeholder="Contoh: Pesawat Terbang, Bus, Kereta Api"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="accommodation_budget">Biaya Akomodasi (Rp)</Label>
                          <Input
                            id="accommodation_budget"
                            type="number"
                            value={formData.accommodation_budget}
                            onChange={(e) => setFormData({ ...formData, accommodation_budget: e.target.value })}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="travel_budget">Biaya Transport (Rp)</Label>
                          <Input
                            id="travel_budget"
                            type="number"
                            value={formData.travel_budget}
                            onChange={(e) => setFormData({ ...formData, travel_budget: e.target.value })}
                            placeholder="0"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="notes">Catatan</Label>
                        <Textarea
                          id="notes"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder="Catatan tambahan (opsional)"
                          rows={2}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{isEditMode ? "Guru yang Diperintahkan *" : "Guru yang Diperintahkan (dari Surat Tugas)"}</Label>
                        <div className="border rounded-md p-4 bg-muted/30 space-y-3 max-h-[300px] overflow-y-auto">
                          {isEditMode ? (
                            <>
                              {selectedTeachers.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                  {selectedTeachers.map((teacherId, idx) => {
                                    const teacher = teachers?.find((t) => t.id === teacherId);
                                    return (
                                      <Badge
                                        key={teacherId}
                                        variant={idx === 0 ? "default" : "secondary"}
                                        className="text-xs cursor-pointer hover:bg-destructive/20"
                                        onClick={() => toggleTeacher(teacherId)}
                                      >
                                        {idx === 0 ? "Pelaksana: " : ""}{(teacher as any)?.profiles?.full_name || "-"} ✕
                                      </Badge>
                                    );
                                  })}
                                </div>
                              )}
                              <SearchableSelect
                                options={
                                  teachers
                                    ?.filter((t) => !selectedTeachers.includes(t.id))
                                    .map((teacher) => ({
                                      value: teacher.id,
                                      label: `${(teacher as any).profiles?.full_name || "-"} - ${teacher.nip || "-"}`,
                                      description: teacher.subject || "",
                                      keywords: `${(teacher as any).profiles?.full_name || ""} ${teacher.nip || ""} ${teacher.subject || ""}`,
                                    })) || []
                                }
                                value=""
                                onValueChange={(value) => {
                                  if (value && !selectedTeachers.includes(value)) {
                                    setSelectedTeachers((prev) => [...prev, value]);
                                  }
                                }}
                                placeholder="Tambah guru..."
                                searchPlaceholder="Cari nama guru / NIP / mapel..."
                                emptyMessage="Tidak ada guru."
                                maxHeight="300px"
                              />
                              <p className="text-xs text-muted-foreground">Guru pertama menjadi Pelaksana Utama. Klik badge untuk menghapus.</p>
                            </>
                          ) : (
                            <>
                              {allExecutors.length > 0 ? (
                                <div className="space-y-2">
                                  {allExecutors.map((executor: any, idx: number) => (
                                    <div key={executor.id ?? idx} className="flex items-center gap-2">
                                      <Badge variant={idx === 0 ? "default" : "secondary"} className="text-xs">
                                        {idx === 0 ? "Pelaksana" : `Pengikut ${idx}`}
                                      </Badge>
                                      {executor.isManual && (
                                        <Badge variant="outline" className="text-xs">Manual</Badge>
                                      )}
                                      <span className="text-sm">
                                        {executor.profiles?.full_name || "-"} - NIP. {executor.nip || "-"} ({executor.subject})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">Tidak ada pelaksana dalam surat tugas ini</p>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Siswa Pengikut (Opsional)</Label>
                        <div className="border rounded-md p-4 space-y-3">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="Cari siswa berdasarkan nama atau NIS..."
                              value={studentSearchQuery}
                              onChange={(e) => setStudentSearchQuery(e.target.value)}
                              className="pl-10"
                            />
                          </div>

                          {selectedStudentFollowers.length > 0 && (
                            <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-md">
                              <span className="text-xs text-muted-foreground">Dipilih:</span>
                              {selectedStudentFollowers.map((studentId) => {
                                const student = students?.find((s) => s.id === studentId);
                                return (
                                  <Badge
                                    key={studentId}
                                    variant="secondary"
                                    className="text-xs cursor-pointer hover:bg-destructive/20"
                                    onClick={() => toggleStudentFollower(studentId)}
                                  >
                                    {student?.full_name || "-"}{student?.class_name ? ` (${student.class_name})` : ""} ✕
                                  </Badge>
                                );
                              })}
                            </div>
                          )}

                          {studentSearchQuery && (
                            <div className="max-h-40 overflow-y-auto border rounded-md">
                              {filteredStudents.length > 0 ? (
                                filteredStudents.slice(0, 10).map((student) => (
                                  <div
                                    key={student.id}
                                    className={`p-2 text-sm cursor-pointer hover:bg-muted flex items-center justify-between ${
                                      selectedStudentFollowers.includes(student.id) ? "bg-primary/10" : ""
                                    }`}
                                    onClick={() => toggleStudentFollower(student.id)}
                                  >
                                    <span>
                                      {student.full_name} - NIS: {student.nis}
                                      {student.class_name && <span className="text-muted-foreground ml-2">({student.class_name})</span>}
                                    </span>
                                    {selectedStudentFollowers.includes(student.id) && (
                                      <Badge variant="default" className="text-xs">Dipilih</Badge>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div className="p-2 text-sm text-muted-foreground">Siswa tidak ditemukan</div>
                              )}
                            </div>
                          )}

                          <p className="text-xs text-muted-foreground">
                            Ketik nama atau NIS untuk mencari siswa. Klik untuk memilih/hapus.
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                          Batal
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                          {(createMutation.isPending || updateMutation.isPending) ? "Menyimpan..." : isEditMode ? "Perbarui" : "Simpan"}
                        </Button>
                      </div>
                    </>
                  )}
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daftar SPD</CardTitle>
              <CardDescription>
                Total: {filteredTravels?.length || 0} SPD
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari berdasarkan nomor, maksud, atau tujuan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("justify-start text-left font-normal", !startDateFilter && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDateFilter ? format(startDateFilter, "dd/MM/yyyy") : "Dari Tanggal"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={startDateFilter} onSelect={setStartDateFilter} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("justify-start text-left font-normal", !endDateFilter && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDateFilter ? format(endDateFilter, "dd/MM/yyyy") : "Sampai Tanggal"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={endDateFilter} onSelect={setEndDateFilter} initialFocus />
                      </PopoverContent>
                    </Popover>
                    {(startDateFilter || endDateFilter) && (
                      <Button variant="ghost" size="icon" onClick={() => { setStartDateFilter(undefined); setEndDateFilter(undefined); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => setRepairDialogOpen(true)}
                    className="text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-800 dark:hover:bg-amber-950"
                  >
                    <Wrench className="mr-2 h-4 w-4" />
                    Perbaiki Data SPD
                  </Button>
                </div>
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
              ) : filteredTravels && filteredTravels.length > 0 ? (
                <>
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">No</TableHead>
                          <TableHead>Nomor SPD</TableHead>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Maksud</TableHead>
                          <TableHead>Tujuan</TableHead>
                          <TableHead>Pelaksana</TableHead>
                          <TableHead>Pengikut</TableHead>
                          <TableHead>Waktu</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedTravels.map((travel, index) => {
                          const actualIndex = (currentPage - 1) * pageSize + index + 1;

                          const teacherExecs = (travel.official_travel_teachers || []).map((tt: any) => ({
                            key: `t-${tt.teacher_id}`,
                            name: tt.teachers?.profiles?.full_name || "-",
                            isManual: false,
                            isStudent: false,
                            order_index: tt.order_index ?? 0,
                          }));

                          const manualExecs = (travel.official_travel_followers || [])
                            .filter((f: any) => f.follower_type === 'manual_executor')
                            .map((f: any) => ({
                              key: `m-${f.id}`,
                              name: f.manual_executor?.full_name || f.manual_executor_name || "-",
                              isManual: true,
                              isStudent: false,
                              order_index: f.order_index ?? 0,
                            }));

                          const studentFollowers = (travel.official_travel_followers || [])
                            .filter((f: any) => f.follower_type === 'student')
                            .map((f: any) => ({
                              key: `s-${f.id}`,
                              name: `${f.students?.full_name || "-"} (NIS: ${f.students?.nis || "-"}${f.students?.class_name ? ` - ${f.students.class_name}` : ""})`,
                              isManual: false,
                              isStudent: true,
                              order_index: f.order_index ?? 9999,
                            }));

                          const sortedAll = [...teacherExecs, ...manualExecs, ...studentFollowers]
                            .sort((a, b) => a.order_index - b.order_index);

                          const mainExec = sortedAll[0];
                          const followersList = sortedAll.slice(1);

                          return (
                            <TableRow key={travel.id}>
                              <TableCell>{actualIndex}</TableCell>
                              <TableCell className="font-medium">{travel.letter_number}</TableCell>
                              <TableCell>{format(new Date(travel.letter_date), "dd/MM/yyyy")}</TableCell>
                              <TableCell>{travel.purpose}</TableCell>
                              <TableCell>{travel.destination}</TableCell>
                              <TableCell>
                                {mainExec && (
                                  <Badge variant="default" className="text-xs">
                                    {mainExec.name}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {followersList.map((f: any) => (
                                    <Badge
                                      key={f.key}
                                      variant={f.isManual ? "outline" : f.isStudent ? "outline" : "secondary"}
                                      className="text-xs"
                                    >
                                      {f.name}{f.isManual ? " (Manual)" : ""}
                                    </Badge>
                                  ))}
                                  {followersList.length === 0 && (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {format(new Date(travel.departure_date), "dd/MM/yy")} - {format(new Date(travel.return_date), "dd/MM/yy")}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button variant="outline" size="icon" onClick={() => handleEdit(travel)} title="Edit">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="outline" size="icon" onClick={() => previewPDF(travel)} title="Preview PDF">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button variant="outline" size="icon" onClick={() => exportPDF(travel)} title="Download PDF">
                                    <FileDown className="h-4 w-4" />
                                  </Button>
                                  <Button variant="destructive" size="icon" onClick={() => handleDelete(travel.id)} title="Hapus">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <DataPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                  />
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "Tidak ada SPD yang cocok dengan pencarian" : "Belum ada SPD"}
                </div>
              )}
            </CardContent>
          </Card>

          <SPDPreviewDialog
            open={isPreviewOpen}
            onOpenChange={setIsPreviewOpen}
            travel={previewTravel}
          />

          <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-600">
                  <FileText className="h-5 w-5" />
                  SPD Sudah Ada
                </DialogTitle>
                <DialogDescription className="pt-2">
                  <div className="space-y-3">
                    <p>
                      SPD dengan nomor surat <strong className="text-foreground">"{duplicateSPD?.letter_number}"</strong> sudah terdaftar di sistem.
                    </p>
                    {duplicateSPD && (
                      <div className="bg-muted/50 p-3 rounded-lg border text-sm">
                        <p><span className="text-muted-foreground">Tujuan:</span> {duplicateSPD.purpose}</p>
                        <p><span className="text-muted-foreground">Tanggal Berangkat:</span> {format(new Date(duplicateSPD.departure_date), "d MMMM yyyy", { locale: idLocale })}</p>
                      </div>
                    )}
                    <p className="text-sm">Apa yang ingin Anda lakukan?</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={handleEditDuplicateSPD} variant="default" className="w-full">
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit SPD yang Sudah Ada
                </Button>
                <Button onClick={handleDeleteAndCreateNew} variant="outline" className="w-full text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Hapus SPD Lama & Buat Baru
                </Button>
                <Button onClick={() => { setDuplicateDialogOpen(false); setDuplicateSPD(null); }} variant="ghost" className="w-full">
                  Batalkan
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={repairDialogOpen} onOpenChange={setRepairDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-600">
                  <Wrench className="h-5 w-5" />
                  Perbaiki Data SPD
                </DialogTitle>
                <DialogDescription className="pt-2">
                  <div className="space-y-3">
                    <p>
                      Fitur ini akan menyalin ulang data <strong className="text-foreground">pelaksana manual</strong> dari surat tugas yang terhubung ke masing-masing SPD.
                    </p>
                    {repairResults && (
                      <div className={cn(
                        "p-3 rounded-lg border text-sm space-y-2",
                        repairResults.repaired > 0 ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" : "bg-muted/50"
                      )}>
                        <p className="font-medium text-foreground">Hasil Perbaikan:</p>
                        <ul className="space-y-1">
                          <li className="flex items-center gap-2">
                            <Badge variant={repairResults.repaired > 0 ? "default" : "secondary"} className="text-xs">
                              {repairResults.repaired}
                            </Badge>
                            <span className="text-muted-foreground">SPD berhasil diperbaiki</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {repairResults.skipped}
                            </Badge>
                            <span className="text-muted-foreground">SPD dilewati</span>
                          </li>
                          {repairResults.errors.length > 0 && (
                            <li className="text-destructive text-xs mt-2">
                              <p className="font-medium">Errors:</p>
                              <ul className="list-disc list-inside">
                                {repairResults.errors.map((err, idx) => (
                                  <li key={idx}>{err}</li>
                                ))}
                              </ul>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={handleRepairSPDData} disabled={isRepairing} className="w-full">
                  {isRepairing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Sedang Memperbaiki...
                    </>
                  ) : (
                    <>
                      <Wrench className="h-4 w-4 mr-2" />
                      Mulai Perbaikan
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => { setRepairDialogOpen(false); setRepairResults(null); }}
                  variant="ghost"
                  className="w-full"
                  disabled={isRepairing}
                >
                  Tutup
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
