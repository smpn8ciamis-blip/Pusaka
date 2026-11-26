import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Search, FileDown, Calendar as CalendarIcon, X, ExternalLink, Eye, Download, Pencil, Lock, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useSpjGuard, SPJ_LOCK_QUERY_KEY } from "@/hooks/useSpjLock";
import { cn, toTitleCase } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import jsPDF from 'jspdf';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';
import { z } from "zod";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DataPagination } from "@/components/ui/data-pagination";
import { usePagination } from "@/hooks/usePagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { KepsekLetterSettingsDialog } from "@/components/letters/KepsekLetterSettingsDialog";
import { fetchKepsekLetterSettings, KEPSEK_SETTINGS_KEY, useKepsekLetterSettings } from "@/hooks/useSuratTugasKepsek";
import { isKepsekExecutor, kepsekPerson, nextKepsekNumber, type HeadmasterInfo } from "@/lib/suratTugasKepsek";
import { buildKepsekLetterPdf, loadKabLogo } from "@/lib/suratTugasKepsekPdf";

type LetterKind = "guru" | "kepsek";

interface ManualExecutor {
  id?: string;
  full_name: string;
  nip: string;
  pangkat_golongan: string;
  jabatan: string;
}

interface UnifiedExecutor {
  key: string;
  type: 'teacher' | 'manual';
  teacher_id?: string;
  staff_id?: string;
  manual_index?: number;
  full_name: string;
  nip: string;
  pangkat_golongan: string;
  jabatan: string;
  subject?: string;
}

const assignmentSchema = z.object({
  letter_number: z.string().min(1, "Nomor surat wajib diisi").max(50, "Nomor surat maksimal 50 karakter"),
  letter_date: z.string().min(1, "Tanggal surat wajib diisi"),
  dasar_surat_tugas: z.string().min(1, "Dasar surat tugas wajib diisi").max(200, "Dasar surat tugas maksimal 200 karakter"),
  tanggal_dasar_surat_tugas: z.string().min(1, "Tanggal dasar surat tugas wajib diisi"),
  assignment_type: z.string().min(1, "Jenis tugas wajib diisi").max(100, "Jenis tugas maksimal 100 karakter"),
  description: z.string().min(1, "Deskripsi wajib diisi").max(500, "Deskripsi maksimal 500 karakter"),
  location: z.string().min(1, "Lokasi wajib diisi").max(200, "Lokasi maksimal 200 karakter"),
  start_date: z.string().min(1, "Tanggal mulai wajib diisi"),
  end_date: z.string().min(1, "Tanggal selesai wajib diisi"),
});

export default function AssignmentLetters() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { guard: spjGuard, dialog: spjDialog, isLetterLocked } = useSpjGuard();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [executorOrder, setExecutorOrder] = useState<UnifiedExecutor[]>([]);
  const [startDateFilter, setStartDateFilter] = useState<Date | undefined>();
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewAssignment, setPreviewAssignment] = useState<any>(null);
  const [newManualExecutor, setNewManualExecutor] = useState<ManualExecutor>({
    full_name: "", nip: "", pangkat_golongan: "", jabatan: "",
  });
  const [formData, setFormData] = useState({
    letter_number: "",
    kepsek_letter_number: "",
    letter_date: format(new Date(), "yyyy-MM-dd"),
    dasar_surat_tugas: "",
    tanggal_dasar_surat_tugas: format(new Date(), "yyyy-MM-dd"),
    assignment_type: "",
    description: "",
    location: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"),
  });
  const [kepsekNumberTouched, setKepsekNumberTouched] = useState(false);
  const [previewKind, setPreviewKind] = useState<LetterKind>("guru");

  const { data: teachers, isLoading: isLoadingTeachers } = useQuery({
    queryKey: ["teachers-for-assignment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      if (!data) return [];

      return await Promise.all(
        data.map(async (teacher) => {
          const { data: profile } = await supabase
            .from("profiles_public").select("full_name").eq("id", teacher.user_id).maybeSingle();
          return { ...teacher, profile };
        })
      );
    },
  });

  const { data: staffList } = useQuery({
    queryKey: ["staff-for-assignment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff" as any)
        .select("id, full_name, nip, position, staff_type, status")
        .order("full_name");
      if (error) throw error;
      return ((data as any[]) || []).filter((x) => x.status !== "nonaktif");
    },
  });

  const sortExecutors = (assignment: any) => {
    if (!assignment) return assignment;
    return {
      ...assignment,
      assignment_letter_teachers: [...(assignment.assignment_letter_teachers || [])]
        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)),
      assignment_letter_manual_executors: [...(assignment.assignment_letter_manual_executors || [])]
        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    };
  };

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["assignment-letters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_letters")
        .select(`
          *,
          assignment_letter_teachers (teacher_id, order_index),
          assignment_letter_manual_executors (id, full_name, nip, pangkat_golongan, jabatan, order_index, staff_id)
        `)
        .order("letter_date", { ascending: false });
      if (error) throw error;
      return (data || []).map(sortExecutors);
    },
  });

  const { data: schoolSettings } = useQuery({
    queryKey: ["school-settings-for-assignment"],
    queryFn: async () => {
      const { data } = await supabase.from("school_settings").select("*").limit(1).maybeSingle();
      return data as any;
    },
  });
  const headmaster: HeadmasterInfo = {
    name: schoolSettings?.headmaster_name,
    nip: schoolSettings?.headmaster_nip,
    position: schoolSettings?.headmaster_position,
  };
  const { data: kepsekCfg } = useKepsekLetterSettings();

  const isKepsek = (e: { full_name?: string | null; nip?: string | null; jabatan?: string | null }) => isKepsekExecutor(e, headmaster);

  /** Pelaksana surat tersimpan (guru + manual) dalam bentuk ringkas, tanpa query tambahan. */
  const executorsOfAssignment = (assignment: any) => [
    ...(assignment.assignment_letter_teachers || []).map((at: any) => {
      const t = teachersData?.find((x: any) => x.id === at.teacher_id);
      return { full_name: t?.profile?.full_name, nip: t?.nip, jabatan: t?.jabatan || t?.subject || "Guru" };
    }),
    ...(assignment.assignment_letter_manual_executors || []).map((me: any) => ({ full_name: me.full_name, nip: me.nip, jabatan: me.jabatan })),
  ];
  const kindsOf = (assignment: any) => {
    const list = executorsOfAssignment(assignment);
    const kepsek = list.filter(isKepsek).length;
    return { kepsek, guru: list.length - kepsek };
  };

  const buildExecutorOrderFromAssignment = (assignment: any): UnifiedExecutor[] => {
    const teachers = [...(assignment.assignment_letter_teachers || [])]
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const manuals = [...(assignment.assignment_letter_manual_executors || [])]
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));

    const teacherList: UnifiedExecutor[] = teachers.map((at: any) => {
      const teacher = teachersData?.find((t: any) => t.id === at.teacher_id);
      return {
        key: `teacher-${at.teacher_id}`,
        type: 'teacher',
        teacher_id: at.teacher_id,
        full_name: teacher?.profile?.full_name || "-",
        nip: teacher?.nip || "",
        pangkat_golongan: teacher?.pangkat_golongan || "",
        jabatan: teacher?.jabatan || teacher?.subject || "Guru",
        subject: teacher?.subject,
      };
    });

    const manualList: UnifiedExecutor[] = manuals.map((me: any, idx: number) => ({
      key: `manual-${me.id || idx}`,
      type: 'manual',
      manual_index: idx,
      staff_id: me.staff_id || undefined,
      full_name: me.full_name,
      nip: me.nip || "",
      pangkat_golongan: me.pangkat_golongan || "",
      jabatan: me.jabatan || "Pelaksana",
    }));

    return [...teacherList, ...manualList];
  };

  const { data: teachersData } = useQuery({
    queryKey: ["teachers-for-order"],
    queryFn: async () => {
      const { data } = await supabase.from("teachers").select("*");
      if (!data) return [];
      return await Promise.all(
        data.map(async (t) => {
          const { data: p } = await supabase
            .from("profiles_public").select("full_name").eq("id", t.user_id).maybeSingle();
          return { ...t, profile: p };
        })
      );
    },
  });

  /** Nomor surat guru dan nomor surat kepsek. Bila hanya kepsek/Plt yang ditugaskan, satu nomor saja. */
  const resolveNumbers = (data: { letter_number: string; kepsek_letter_number: string; executors: UnifiedExecutor[] }) => {
    const hasKepsek = data.executors.some(isKepsek);
    const hasGuru = data.executors.some((e) => !isKepsek(e));
    const kepsekNumber = hasKepsek ? data.kepsek_letter_number.trim() : "";
    if (hasKepsek && !kepsekNumber) throw new Error("Nomor surat tugas kepala sekolah wajib diisi");
    const letterNumber = hasGuru || !hasKepsek ? data.letter_number.trim() : kepsekNumber;
    return { hasKepsek, hasGuru, kepsekNumber, letterNumber };
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { executors: UnifiedExecutor[] }) => {
      const nomor = resolveNumbers(data);
      assignmentSchema.parse({ ...data, letter_number: nomor.letterNumber });

      if (data.executors.length === 0) {
        throw new Error("Minimal 1 pelaksana harus dipilih atau dimasukkan manual");
      }

      const { data: letter, error: letterError } = await supabase
        .from("assignment_letters")
        .insert({
          ...(nomor.kepsekNumber ? { kepsek_letter_number: nomor.kepsekNumber } : {}),
          letter_number: nomor.letterNumber,
          letter_date: data.letter_date,
          dasar_surat_tugas: data.dasar_surat_tugas,
          tanggal_dasar_surat_tugas: data.tanggal_dasar_surat_tugas,
          assignment_type: data.assignment_type,
          description: data.description,
          location: data.location,
          start_date: data.start_date,
          end_date: data.end_date,
          created_by: user?.id!,
        } as any)
        .select()
        .single();

      if (letterError) throw letterError;

      const teacherExecutors = data.executors
        .map((e, globalIdx) => ({ ...e, globalIdx }))
        .filter((e) => e.type === 'teacher');

      if (teacherExecutors.length > 0) {
        const teacherInserts = teacherExecutors.map((e) => ({
          assignment_letter_id: letter.id,
          teacher_id: e.teacher_id!,
          order_index: e.globalIdx,
        }));
        const { error } = await supabase.from("assignment_letter_teachers").insert(teacherInserts);
        if (error) throw error;
      }

      const manualExecutors = data.executors
        .map((e, globalIdx) => ({ ...e, globalIdx }))
        .filter((e) => e.type === 'manual');

      if (manualExecutors.length > 0) {
        const manualInserts = manualExecutors.map((e) => ({
          assignment_letter_id: letter.id,
          full_name: e.full_name,
          nip: e.nip || null,
          pangkat_golongan: e.pangkat_golongan || null,
          jabatan: e.jabatan || null,
          staff_id: e.staff_id ?? null,
          order_index: e.globalIdx,
        }));
        const { error } = await supabase.from("assignment_letter_manual_executors").insert(manualInserts);
        if (error) throw error;
      }

      const suratKeluarRows = [
        // Bila hanya kepala sekolah/Plt yang ditugaskan, nomor surat = nomor surat kepsek (satu catatan saja).
        ...(nomor.hasGuru ? [{ nomor: nomor.letterNumber, perihal: `Surat Tugas - ${data.assignment_type}: ${data.description}` }] : []),
        ...(nomor.kepsekNumber ? [{ nomor: nomor.kepsekNumber, perihal: `Surat Tugas Kepala Sekolah - ${data.assignment_type}: ${data.description}` }] : []),
      ];
      const { error: suratKeluarError } = await supabase
        .from("surat_keluar")
        .insert(suratKeluarRows.map((r) => ({
          nomor_surat: r.nomor,
          tanggal_surat: data.letter_date,
          tujuan: data.location,
          perihal: r.perihal,
          kategori: 'kepegawaian',
          catatan: `Otomatis tercatat dari Surat Tugas No. ${r.nomor}`,
          created_by: user?.id!,
        })));

      if (suratKeluarError) {
        console.warn('Gagal mencatat ke surat keluar:', suratKeluarError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignment-letters"] });
      queryClient.invalidateQueries({ queryKey: ["surat-keluar"] });
      toast.success("Surat tugas berhasil dibuat dan tercatat di Surat Keluar");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else if (String(error?.message).includes("uq_assignment_letters_kepsek_number")) {
        toast.error("Nomor surat tugas kepala sekolah sudah dipakai. Ubah nomornya.");
      } else {
        toast.error(error.message || "Gagal membuat surat tugas");
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { executors: UnifiedExecutor[]; id: string }) => {
      const nomor = resolveNumbers(data);
      assignmentSchema.parse({
        letter_number: nomor.letterNumber,
        letter_date: data.letter_date,
        dasar_surat_tugas: data.dasar_surat_tugas,
        tanggal_dasar_surat_tugas: data.tanggal_dasar_surat_tugas,
        assignment_type: data.assignment_type,
        description: data.description,
        location: data.location,
        start_date: data.start_date,
        end_date: data.end_date,
      });

      if (data.executors.length === 0) {
        throw new Error("Minimal 1 pelaksana harus dipilih atau dimasukkan manual");
      }

      const { error: letterError } = await supabase
        .from("assignment_letters")
        .update({
          ...(nomor.kepsekNumber
            ? { kepsek_letter_number: nomor.kepsekNumber }
            : assignments?.find((a: any) => a.id === data.id)?.kepsek_letter_number ? { kepsek_letter_number: null } : {}),
          letter_number: nomor.letterNumber,
          letter_date: data.letter_date,
          dasar_surat_tugas: data.dasar_surat_tugas,
          tanggal_dasar_surat_tugas: data.tanggal_dasar_surat_tugas,
          assignment_type: data.assignment_type,
          description: data.description,
          location: data.location,
          start_date: data.start_date,
          end_date: data.end_date,
        } as any)
        .eq("id", data.id);

      if (letterError) throw letterError;

      await supabase.from("assignment_letter_teachers").delete().eq("assignment_letter_id", data.id);
      await supabase.from("assignment_letter_manual_executors").delete().eq("assignment_letter_id", data.id);

      const teacherExecutors = data.executors
        .map((e, globalIdx) => ({ ...e, globalIdx }))
        .filter((e) => e.type === 'teacher');

      if (teacherExecutors.length > 0) {
        const teacherInserts = teacherExecutors.map((e) => ({
          assignment_letter_id: data.id,
          teacher_id: e.teacher_id!,
          order_index: e.globalIdx,
        }));
        const { error } = await supabase.from("assignment_letter_teachers").insert(teacherInserts);
        if (error) throw error;
      }

      const manualExecutors = data.executors
        .map((e, globalIdx) => ({ ...e, globalIdx }))
        .filter((e) => e.type === 'manual');

      if (manualExecutors.length > 0) {
        const manualInserts = manualExecutors.map((e) => ({
          assignment_letter_id: data.id,
          full_name: e.full_name,
          nip: e.nip || null,
          pangkat_golongan: e.pangkat_golongan || null,
          jabatan: e.jabatan || null,
          staff_id: e.staff_id ?? null,
          order_index: e.globalIdx,
        }));
        const { error } = await supabase.from("assignment_letter_manual_executors").insert(manualInserts);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignment-letters"] });
      toast.success("Surat tugas berhasil diperbarui");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else if (String(error?.message).includes("uq_assignment_letters_kepsek_number")) {
        toast.error("Nomor surat tugas kepala sekolah sudah dipakai. Ubah nomornya.");
      } else {
        toast.error(error.message || "Gagal memperbarui surat tugas");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assignment_letters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignment-letters"] });
      queryClient.invalidateQueries({ queryKey: SPJ_LOCK_QUERY_KEY });
      toast.success("Surat tugas berhasil dihapus");
    },
    onError: (error: any) => {
      toast.error(error.message || "Gagal menghapus surat tugas");
    },
  });

  const resetForm = () => {
    setKepsekNumberTouched(false);
    setFormData({
      letter_number: "",
      kepsek_letter_number: "",
      letter_date: format(new Date(), "yyyy-MM-dd"),
      dasar_surat_tugas: "",
      tanggal_dasar_surat_tugas: format(new Date(), "yyyy-MM-dd"),
      assignment_type: "",
      description: "",
      location: "",
      start_date: format(new Date(), "yyyy-MM-dd"),
      end_date: format(new Date(), "yyyy-MM-dd"),
    });
    setExecutorOrder([]);
    setNewManualExecutor({ full_name: "", nip: "", pangkat_golongan: "", jabatan: "" });
    setIsEditMode(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditMode && editingId) {
      updateMutation.mutate({ ...formData, executors: executorOrder, id: editingId });
    } else {
      createMutation.mutate({ ...formData, executors: executorOrder });
    }
  };

  // Surat tugas yang dipakai SPD berstatus SPJ terkunci: perlu kode hapus dari admin (ditegakkan juga oleh trigger database).
  const handleEdit = (assignment: any) =>
    spjGuard("letter", assignment.id, isLetterLocked(assignment.id), () => openEditAssignment(assignment));

  const openEditAssignment = (assignment: any) => {
    setIsEditMode(true);
    setEditingId(assignment.id);
    setKepsekNumberTouched(false);
    setFormData({
      letter_number: assignment.letter_number,
      kepsek_letter_number: assignment.kepsek_letter_number || "",
      letter_date: assignment.letter_date,
      dasar_surat_tugas: assignment.dasar_surat_tugas || "",
      tanggal_dasar_surat_tugas: assignment.tanggal_dasar_surat_tugas || format(new Date(), "yyyy-MM-dd"),
      assignment_type: assignment.assignment_type,
      description: assignment.description,
      location: assignment.location,
      start_date: assignment.start_date,
      end_date: assignment.end_date,
    });
    setExecutorOrder(buildExecutorOrderFromAssignment(assignment));
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) =>
    spjGuard("letter", id, isLetterLocked(id), () => {
      if (confirm("Yakin ingin menghapus surat tugas ini?")) {
        deleteMutation.mutate(id);
      }
    });

  const toggleTeacher = (teacherId: string) => {
    setExecutorOrder((prev) => {
      const exists = prev.find((e) => e.type === 'teacher' && e.teacher_id === teacherId);
      if (exists) {
        return prev.filter((e) => !(e.type === 'teacher' && e.teacher_id === teacherId));
      }
      const teacher = teachers?.find((t: any) => t.id === teacherId);
      const newExecutor: UnifiedExecutor = {
        key: `teacher-${teacherId}`,
        type: 'teacher',
        teacher_id: teacherId,
        full_name: teacher?.profile?.full_name || "-",
        nip: teacher?.nip || "",
        pangkat_golongan: teacher?.pangkat_golongan || "",
        jabatan: teacher?.jabatan || teacher?.subject || "Guru",
        subject: teacher?.subject,
      };
      return [...prev, newExecutor];
    });
  };

  const addManualExecutor = () => {
    if (!newManualExecutor.full_name.trim()) {
      toast.error("Nama pelaksana wajib diisi");
      return;
    }
    const uniqueKey = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setExecutorOrder((prev) => [
      ...prev,
      {
        key: uniqueKey,
        type: 'manual',
        full_name: newManualExecutor.full_name,
        nip: newManualExecutor.nip,
        pangkat_golongan: newManualExecutor.pangkat_golongan,
        jabatan: newManualExecutor.jabatan || "Pelaksana",
      },
    ]);
    setNewManualExecutor({ full_name: "", nip: "", pangkat_golongan: "", jabatan: "" });
  };

  const isStaffSelected = (staffId: string) =>
    executorOrder.some((e) => e.type === 'manual' && e.staff_id === staffId);

  const toggleStaff = (st: any) => {
    setExecutorOrder((prev) => {
      if (prev.some((e) => e.type === 'manual' && e.staff_id === st.id)) {
        return prev.filter((e) => !(e.type === 'manual' && e.staff_id === st.id));
      }
      return [
        ...prev,
        {
          key: `staff-${st.id}`,
          type: 'manual',
          staff_id: st.id,
          full_name: st.full_name,
          nip: st.nip || "",
          pangkat_golongan: "",
          jabatan: st.position || "Staf",
        },
      ];
    });
  };

  const removeExecutor = (key: string) => {
    setExecutorOrder((prev) => prev.filter((e) => e.key !== key));
  };

  const hasKepsekInForm = executorOrder.some(isKepsek);
  const hasGuruInForm = executorOrder.some((e) => !isKepsek(e));

  /** Menambahkan kepala sekolah/Plt dengan data dari Pengaturan Sekolah (pangkat dari data guru bila ada). */
  const addKepsek = () => {
    if (!headmaster.name) {
      toast.error("Data kepala sekolah belum diisi di Pengaturan Sekolah");
      return;
    }
    const nipDigits = String(headmaster.nip ?? "").replace(/\D/g, "");
    const sebagaiGuru = nipDigits.length >= 8
      ? teachersData?.find((t: any) => String(t.nip ?? "").replace(/\D/g, "") === nipDigits)
      : undefined;
    setExecutorOrder((prev) => [
      ...prev,
      {
        key: `kepsek-${Date.now()}`,
        type: 'manual',
        full_name: headmaster.name!,
        nip: headmaster.nip || "",
        pangkat_golongan: sebagaiGuru?.pangkat_golongan || kepsekCfg?.kepsek_pangkat || "",
        jabatan: headmaster.position || "Kepala Sekolah",
      },
    ]);
  };

  const formYear = Number(String(formData.letter_date).slice(0, 4)) || new Date().getFullYear();
  const { data: suratKeluarNomor } = useQuery({
    queryKey: ["surat-keluar-nomor", formYear],
    enabled: isDialogOpen && hasKepsekInForm,
    queryFn: async () => {
      const { data } = await supabase
        .from("surat_keluar")
        .select("nomor_surat")
        .gte("tanggal_surat", `${formYear}-01-01`)
        .lte("tanggal_surat", `${formYear}-12-31`)
        .limit(5000);
      return ((data as any[]) || []).map((r) => r.nomor_surat as string);
    },
  });

  // Nomor surat kepala sekolah terisi otomatis (urutan berikutnya menurut pola) selama belum diubah manual.
  useEffect(() => {
    if (!isDialogOpen || !hasKepsekInForm || kepsekNumberTouched) return;
    if (isEditMode && formData.kepsek_letter_number) return;
    const pola = kepsekCfg?.pattern;
    if (!pola) return;
    const nomor = nextKepsekNumber(
      pola,
      [
        ...(assignments || []).flatMap((a: any) => [a.letter_number, a.kepsek_letter_number]),
        formData.letter_number,
        ...(suratKeluarNomor || []),
      ],
      new Date(`${formData.letter_date}T00:00:00`),
    );
    if (nomor && nomor !== formData.kepsek_letter_number) {
      setFormData((f) => ({ ...f, kepsek_letter_number: nomor }));
    }
  }, [isDialogOpen, hasKepsekInForm, kepsekNumberTouched, isEditMode, kepsekCfg?.pattern, assignments, suratKeluarNomor, formData.letter_number, formData.letter_date, formData.kepsek_letter_number]);

  const isTeacherSelected = (teacherId: string) =>
    executorOrder.some((e) => e.type === 'teacher' && e.teacher_id === teacherId);

  /** Pelaksana surat (guru + manual) lengkap dengan data guru, sudah urut sesuai urutan cetak. */
  const collectExecutors = async (assignment: any) => {
    const assignmentTeachers = assignment.assignment_letter_teachers || [];
    const manualExecs = assignment.assignment_letter_manual_executors || [];

    const teachersData = await Promise.all(
      assignmentTeachers.map(async (at: any) => {
        const { data: teacher } = await supabase.from("teachers").select("*").eq("id", at.teacher_id).single();
        if (!teacher) return null;
        const { data: profile } = await supabase
          .from("profiles_public").select("full_name").eq("id", teacher.user_id).maybeSingle();
        return { ...teacher, profile, isManual: false, order_index: at.order_index ?? 0 };
      })
    );

    return [
      ...teachersData.filter(Boolean).map((t: any) => ({
        profile: { full_name: t.profile?.full_name },
        nip: t.nip,
        pangkat_golongan: t.pangkat_golongan,
        jabatan: t.jabatan || t.subject || "Guru",
        subject: t.subject,
        order_index: t.order_index,
      })),
      ...manualExecs.map((me: any, idx: number) => ({
        profile: { full_name: me.full_name },
        nip: me.nip,
        pangkat_golongan: me.pangkat_golongan,
        jabatan: me.jabatan || "Pelaksana",
        subject: me.jabatan || "Pelaksana",
        order_index: me.order_index ?? (1000 + idx),
      })),
    ].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  };

  const headmasterOf = (settings: any): HeadmasterInfo => ({
    name: settings?.headmaster_name,
    nip: settings?.headmaster_nip,
    position: settings?.headmaster_position,
  });

  /** Surat tugas Kepala Sekolah/Plt: format Dinas (ditandatangani Kabid), terpisah dari surat guru. */
  const generateKepsekPDF = async (assignment: any): Promise<jsPDF> => {
    const { data: settings } = await supabase.from("school_settings").select("*").limit(1).maybeSingle();
    const hm = headmasterOf(settings);
    const kepsekList = (await collectExecutors(assignment)).filter((e) =>
      isKepsekExecutor({ full_name: e.profile?.full_name, nip: e.nip, jabatan: e.jabatan }, hm));
    if (kepsekList.length === 0) throw new Error("Surat ini tidak memuat kepala sekolah/Plt");

    const cfg = await queryClient.fetchQuery({ queryKey: KEPSEK_SETTINGS_KEY, queryFn: fetchKepsekLetterSettings, staleTime: 60_000 });
    if (!cfg.penerbit_nama.trim()) {
      throw new Error('Isi dulu nama pejabat penandatangan di tombol "Format Surat Kepsek"');
    }
    const logo = await loadKabLogo();
    return buildKepsekLetterPdf(
      {
        nomor: assignment.kepsek_letter_number || assignment.letter_number,
        tanggal: assignment.letter_date,
        maksud: assignment.description,
        lokasi: assignment.location,
        mulai: assignment.start_date,
        selesai: assignment.end_date,
        pelaksana: kepsekList.map((e) =>
          kepsekPerson(
            { full_name: e.profile?.full_name, nip: e.nip, jabatan: e.jabatan, pangkat_golongan: e.pangkat_golongan },
            hm,
            cfg.kepsek_pangkat,
          )),
      },
      cfg,
      logo,
    );
  };

  const generatePDF = async (assignment: any): Promise<jsPDF> => {
    const { data: settings } = await supabase.from("school_settings").select("*").single();
    const hmGuru = headmasterOf(settings);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [210, 330] });
    const pageWidth = doc.internal.pageSize.getWidth();

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

    yPos += 8;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("SURAT TUGAS", pageWidth / 2, yPos, { align: "center" });

    yPos += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Nomor : ${assignment.letter_number}`, pageWidth / 2, yPos, { align: "center" });

    yPos += 12;
    doc.setFontSize(10);
    const dasarText = assignment.dasar_surat_tugas || "...";
    const dasarDate = assignment.tanggal_dasar_surat_tugas
      ? format(new Date(assignment.tanggal_dasar_surat_tugas), "dd MMMM yyyy", { locale: idLocale })
      : "...";
    const maxDasarWidth = 170;
    const dasarLines = doc.splitTextToSize(`Dasar : ${dasarText} tanggal ${dasarDate}`, maxDasarWidth);
    doc.text(dasarLines, 20, yPos);
    yPos += dasarLines.length * 5;

    yPos += 12;
    doc.setFont("helvetica", "bold");
    doc.text("MEMERINTAHKAN:", pageWidth / 2, yPos, { align: "center" });
    doc.setFont("helvetica", "normal");

    yPos += 10;
    // Kepala sekolah/Plt memakai surat tersendiri (format Dinas); surat ini hanya untuk pelaksana lain.
    const allExecutors = (await collectExecutors(assignment)).filter((e) =>
      !isKepsekExecutor({ full_name: e.profile?.full_name, nip: e.nip, jabatan: e.jabatan }, hmGuru));
    if (allExecutors.length === 0) throw new Error("Surat ini hanya memuat kepala sekolah/Plt");

    doc.text("Kepada", 20, yPos);
    doc.text(":", 40, yPos);

    for (let i = 0; i < allExecutors.length; i++) {
      const executor = allExecutors[i];
      if (!executor) continue;

      const executorName = toTitleCase(executor.profile?.full_name) || "-";
      const executorNip = executor.nip || "-";

      if (i > 0) yPos += 12;

      doc.text(`${i + 1}.`, 45, yPos);

      doc.text("Nama", 55, yPos);
      doc.text(`: ${executorName}`, 90, yPos);
      yPos += 5;

      doc.text("Pangkat / Gol", 55, yPos);
      doc.text(`: ${executor.pangkat_golongan || "-"}`, 90, yPos);
      yPos += 5;

      doc.text("NIP", 55, yPos);
      doc.text(`: ${executorNip}`, 90, yPos);
      yPos += 5;

      doc.text("Jabatan", 55, yPos);
      doc.text(`: ${executor.jabatan || "-"}`, 90, yPos);
      yPos += 2;
    }

    yPos += 12;
    doc.text("Untuk", 20, yPos);
    doc.text(":", 40, yPos);
    doc.text("1.", 45, yPos);

    const maxWidth = 140;
    const descLines = doc.splitTextToSize(assignment.description, maxWidth);
    doc.text(descLines, 55, yPos);
    yPos += descLines.length * 5;

    yPos += 6;
    doc.text("2.", 45, yPos);
    doc.text(`${format(new Date(assignment.start_date), "dd MMMM", { locale: idLocale })} s.d ${format(new Date(assignment.end_date), "dd MMMM yyyy", { locale: idLocale })}`, 55, yPos);

    yPos += 6;
    doc.text("3.", 45, yPos);
    doc.text(assignment.location, 55, yPos);

    yPos += 15;
    const signatureX = pageWidth - 65;

    doc.text(`Ciamis, ${format(new Date(assignment.letter_date), "dd MMMM yyyy", { locale: idLocale })}`, signatureX, yPos, { align: "center" });
    yPos += 5;
    doc.text(`Kepala ${settings?.school_name || "Sekolah"},`, signatureX, yPos, { align: "center" });

    yPos += 20;
    doc.setFont("helvetica", "bold");
    doc.text(toTitleCase(settings?.headmaster_name) || "", signatureX, yPos, { align: "center" });
    yPos += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`NIP. ${settings?.headmaster_nip || ""}`, signatureX, yPos, { align: "center" });

    return doc;
  };

  const fetchCompleteAssignment = async (id: string) => {
    const { data, error } = await supabase
      .from("assignment_letters")
      .select(`
        *,
        assignment_letter_teachers ( teacher_id, order_index ),
        assignment_letter_manual_executors ( id, full_name, nip, pangkat_golongan, jabatan, order_index, staff_id )
      `)
      .eq("id", id)
      .single();
    if (error) throw error;
    return sortExecutors(data);
  };

  const buildPdf = (assignment: any, kind: LetterKind) =>
    kind === "kepsek" ? generateKepsekPDF(assignment) : generatePDF(assignment);
  const pdfFileName = (assignment: any, kind: LetterKind) =>
    kind === "kepsek"
      ? `Surat-Tugas-Kepsek-${assignment.kepsek_letter_number || assignment.letter_number}.pdf`.replace(/[\\/]/g, "-")
      : `Surat-Tugas-${assignment.letter_number}.pdf`.replace(/[\\/]/g, "-");

  const handlePreview = async (assignment: any, kind: LetterKind = "guru") => {
    try {
      const completeAssignment = await fetchCompleteAssignment(assignment.id);
      const doc = await buildPdf(completeAssignment, kind);
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);

      setPreviewPdfUrl(pdfUrl);
      setPreviewAssignment(completeAssignment);
      setPreviewKind(kind);
      setPreviewOpen(true);
    } catch (error: any) {
      console.error("Error generating preview:", error);
      toast.error(error?.message?.startsWith("Isi dulu") ? error.message : "Gagal membuat preview PDF");
    }
  };

  const handleDownloadFromPreview = async () => {
    if (previewAssignment) {
      try {
        const doc = await buildPdf(previewAssignment, previewKind);
        doc.save(pdfFileName(previewAssignment, previewKind));
        toast.success("PDF berhasil diunduh");
      } catch (error) {
        console.error("Error downloading PDF:", error);
        toast.error("Gagal mengunduh PDF");
      }
    }
  };

  const handleClosePreview = () => {
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    setPreviewOpen(false);
    setPreviewPdfUrl(null);
    setPreviewAssignment(null);
  };

  const exportPDF = async (assignment: any, kind: LetterKind = "guru") => {
    try {
      const completeAssignment = await fetchCompleteAssignment(assignment.id);
      const doc = await buildPdf(completeAssignment, kind);
      doc.save(pdfFileName(completeAssignment, kind));
      toast.success("PDF berhasil diunduh");
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast.error(error?.message?.startsWith("Isi dulu") ? error.message : "Gagal membuat PDF");
    }
  };

  const filteredAssignments = assignments?.filter((assignment) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === "" ||
      assignment.letter_number.toLowerCase().includes(searchLower) ||
      (assignment.kepsek_letter_number || "").toLowerCase().includes(searchLower) ||
      assignment.assignment_type.toLowerCase().includes(searchLower) ||
      assignment.location.toLowerCase().includes(searchLower) ||
      assignment.assignment_letter_teachers?.some((at: any) => {
        const teacher = teachers?.find((t: any) => t.id === at.teacher_id);
        return teacher?.profile?.full_name?.toLowerCase().includes(searchLower);
      }) ||
      assignment.assignment_letter_manual_executors?.some((me: any) =>
        me.full_name?.toLowerCase().includes(searchLower)
      );

    const assignmentDate = new Date(assignment.letter_date);
    const matchesStartDate = !startDateFilter || assignmentDate >= startDateFilter;
    const matchesEndDate = !endDateFilter || assignmentDate <= endDateFilter;

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
    paginatedItems: paginatedAssignments,
  } = usePagination(filteredAssignments, 10);

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Surat Tugas</h1>
              <p className="text-muted-foreground">Kelola surat tugas untuk guru</p>
            </div>
            <div className="flex flex-wrap gap-2">
            <KepsekLetterSettingsDialog />
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="mr-2 h-4 w-4" />
                  Buat Surat Tugas
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{isEditMode ? "Edit Surat Tugas" : "Buat Surat Tugas Baru"}</DialogTitle>
                  <DialogDescription>
                    {isEditMode ? "Ubah data surat tugas" : "Isi form di bawah untuk membuat surat tugas"}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="letter_number">Nomor Surat *</Label>
                      <Input
                        id="letter_number"
                        value={formData.letter_number}
                        onChange={(e) => setFormData({ ...formData, letter_number: e.target.value })}
                        placeholder={hasKepsekInForm && !hasGuruInForm ? "Kosongkan: memakai nomor surat kepala sekolah" : "Contoh: 001/ST/2024"}
                        required={!(hasKepsekInForm && !hasGuruInForm)}
                      />
                      {hasKepsekInForm && hasGuruInForm && (
                        <p className="text-xs text-muted-foreground">Nomor surat tugas untuk guru/pelaksana lain.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="letter_date">Tanggal Surat *</Label>
                      <Input
                        id="letter_date"
                        type="date"
                        value={formData.letter_date}
                        onChange={(e) => setFormData({ ...formData, letter_date: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {hasKepsekInForm && (
                    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                      <Label htmlFor="kepsek_letter_number">Nomor Surat Tugas Kepala Sekolah/Plt *</Label>
                      <Input
                        id="kepsek_letter_number"
                        value={formData.kepsek_letter_number}
                        onChange={(e) => { setKepsekNumberTouched(true); setFormData({ ...formData, kepsek_letter_number: e.target.value }); }}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Terisi otomatis menurut pola nomor (ubah di tombol Format Surat Kepsek). Kepala sekolah/Plt mendapat surat tugas format Dinas yang terpisah dari surat guru.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="dasar_surat_tugas">Dasar Surat Tugas *</Label>
                    <Input
                      id="dasar_surat_tugas"
                      value={formData.dasar_surat_tugas}
                      onChange={(e) => setFormData({ ...formData, dasar_surat_tugas: e.target.value })}
                      placeholder="Contoh: Surat Dinas Pendidikan Kab. ..."
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tanggal_dasar_surat_tugas">Tanggal Dasar Surat Tugas *</Label>
                    <Input
                      id="tanggal_dasar_surat_tugas"
                      type="date"
                      value={formData.tanggal_dasar_surat_tugas}
                      onChange={(e) => setFormData({ ...formData, tanggal_dasar_surat_tugas: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="assignment_type">Jenis Tugas *</Label>
                    <Input
                      id="assignment_type"
                      value={formData.assignment_type}
                      onChange={(e) => setFormData({ ...formData, assignment_type: e.target.value })}
                      placeholder="Contoh: Mengikuti Pelatihan, Menjadi Juri Lomba"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Deskripsi Tugas *</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Jelaskan detail tugas yang akan dilaksanakan"
                      rows={3}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location">Lokasi Pelaksanaan *</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="Contoh: Aula Sekolah, Hotel XYZ Jakarta"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start_date">Tanggal Mulai *</Label>
                      <Input
                        id="start_date"
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end_date">Tanggal Selesai *</Label>
                      <Input
                        id="end_date"
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Pelaksana dari Database Guru</Label>
                    <div className="border rounded-md p-4 max-h-40 overflow-y-auto space-y-2 bg-muted/20">
                      {isLoadingTeachers ? (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          Memuat data guru...
                        </div>
                      ) : teachers && teachers.length > 0 ? (
                        <>
                          <div className="text-xs text-muted-foreground mb-2">
                            Total: {teachers.length} guru. Centang sesuai urutan yang diinginkan.
                          </div>
                          {teachers.map((teacher: any) => {
                            const selected = isTeacherSelected(teacher.id);
                            const orderNumber = selected
                              ? executorOrder.findIndex(e => e.type === 'teacher' && e.teacher_id === teacher.id) + 1
                              : null;
                            return (
                              <div key={teacher.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded group">
                                <input
                                  type="checkbox"
                                  id={`teacher-${teacher.id}`}
                                  checked={selected}
                                  onChange={() => toggleTeacher(teacher.id)}
                                  className="h-4 w-4"
                                />
                                {orderNumber && (
                                  <Badge variant="default" className="h-5 min-w-5 px-1.5 text-xs justify-center">
                                    {orderNumber}
                                  </Badge>
                                )}
                                <Label htmlFor={`teacher-${teacher.id}`} className="cursor-pointer flex-1">
                                  <span className="font-medium">{teacher.profile?.full_name || "-"}</span>
                                  {teacher.nip && <span className="text-muted-foreground"> - NIP: {teacher.nip}</span>}
                                  <span className="text-muted-foreground"> ({teacher.subject})</span>
                                </Label>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    navigate(`/teachers?highlight=${teacher.id}`);
                                  }}
                                  title="Buka detail guru"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          Tidak ada data guru.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Pelaksana dari Data Staf (tata usaha & karyawan)</Label>
                    <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                      {staffList && staffList.length > 0 ? (
                        staffList.map((st: any) => (
                          <label key={st.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 hover:bg-muted/50">
                            <input
                              type="checkbox"
                              checked={isStaffSelected(st.id)}
                              onChange={() => toggleStaff(st)}
                            />
                            <span className="font-medium">{st.full_name}</span>
                            <span className="text-xs text-muted-foreground">{st.position || (st.staff_type === 'tata_usaha' ? 'Tata Usaha' : 'Karyawan')}</span>
                          </label>
                        ))
                      ) : (
                        <div className="text-center py-3 text-muted-foreground text-sm">Belum ada data staf.</div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Staf yang dipilih dapat melihat surat ini dan mengunggah bukti kunjungan dari akunnya.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Kepala Sekolah / Plt</Label>
                    <div>
                      <Button type="button" variant="outline" size="sm" onClick={addKepsek} disabled={hasKepsekInForm}>
                        <UserCheck className="mr-2 h-4 w-4" />
                        {hasKepsekInForm ? "Kepala sekolah/Plt sudah ditambahkan" : `Tambahkan ${headmaster.position || "Kepala Sekolah"}${headmaster.name ? ` (${headmaster.name})` : ""}`}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Data diambil otomatis dari Pengaturan Sekolah.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Pelaksana Manual (jika tidak ada di database)</Label>

                    <div className="border rounded-md p-4 space-y-3 bg-muted/10">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Nama Lengkap *</Label>
                          <Input
                            placeholder="Masukkan nama lengkap"
                            value={newManualExecutor.full_name}
                            onChange={(e) => setNewManualExecutor({ ...newManualExecutor, full_name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">NIP</Label>
                          <Input
                            placeholder="Masukkan NIP (opsional)"
                            value={newManualExecutor.nip}
                            onChange={(e) => setNewManualExecutor({ ...newManualExecutor, nip: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Pangkat/Golongan</Label>
                          <Input
                            placeholder="Contoh: III/c"
                            value={newManualExecutor.pangkat_golongan}
                            onChange={(e) => setNewManualExecutor({ ...newManualExecutor, pangkat_golongan: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Jabatan</Label>
                          <Input
                            placeholder="Contoh: Guru"
                            value={newManualExecutor.jabatan}
                            onChange={(e) => setNewManualExecutor({ ...newManualExecutor, jabatan: e.target.value })}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addManualExecutor}
                        className="w-full"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Tambah Pelaksana Manual
                      </Button>
                    </div>
                  </div>

                  {executorOrder.length > 0 && (
                    <div className="space-y-2">
                      <Label>Urutan Pelaksana (sesuai urutan cetak surat)</Label>
                      <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                        {executorOrder.map((executor, index) => (
                          <div key={executor.key} className="flex items-center gap-2 p-2 bg-background rounded border">
                            <Badge variant="default" className="h-6 min-w-6 px-2 justify-center">
                              {index + 1}
                            </Badge>
                            <div className="flex-1">
                              <span className="font-medium">{executor.full_name}</span>
                              {executor.nip && <span className="text-muted-foreground"> - NIP: {executor.nip}</span>}
                              {executor.jabatan && <span className="text-muted-foreground"> ({executor.jabatan})</span>}
                              <Badge variant="outline" className="ml-2 text-xs">
                                {isKepsek(executor) ? 'Kepsek/Plt: surat terpisah' : executor.type === 'teacher' ? 'Guru' : 'Manual'}
                              </Badge>
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeExecutor(executor.key)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {executorOrder.length === 0 && (
                    <p className="text-sm text-destructive">* Minimal 1 pelaksana harus dipilih atau ditambahkan manual</p>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Batal
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {(createMutation.isPending || updateMutation.isPending) ? "Menyimpan..." : isEditMode ? "Perbarui" : "Simpan"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daftar Surat Tugas</CardTitle>
              <CardDescription>
                Total: {filteredAssignments?.length || 0} surat tugas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari berdasarkan nomor surat, nama guru, jenis tugas, atau lokasi..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

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

                  {(startDateFilter || endDateFilter || searchQuery) && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStartDateFilter(undefined);
                        setEndDateFilter(undefined);
                        setSearchQuery("");
                      }}
                      className="h-9"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Reset Filter
                    </Button>
                  )}
                </div>

                {(startDateFilter || endDateFilter || searchQuery) && (
                  <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
                    <span>Filter aktif:</span>
                    {searchQuery && <Badge variant="secondary">Pencarian: "{searchQuery}"</Badge>}
                    {startDateFilter && <Badge variant="secondary">Dari: {format(startDateFilter, "dd/MM/yyyy")}</Badge>}
                    {endDateFilter && <Badge variant="secondary">Sampai: {format(endDateFilter, "dd/MM/yyyy")}</Badge>}
                  </div>
                )}
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
              ) : filteredAssignments && filteredAssignments.length > 0 ? (
                <>
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">No</TableHead>
                          <TableHead>Nomor Surat</TableHead>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Jenis Tugas</TableHead>
                          <TableHead>Lokasi</TableHead>
                          <TableHead>Pelaksana</TableHead>
                          <TableHead>Waktu</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedAssignments.map((assignment, index) => {
                          const actualIndex = (currentPage - 1) * pageSize + index + 1;

                          const teacherExecs = (assignment.assignment_letter_teachers || []).map((at: any) => {
                            const teacher = teachers?.find((t: any) => t.id === at.teacher_id);
                            return {
                              order_index: at.order_index ?? 0,
                              name: teacher?.profile?.full_name || "-",
                            };
                          });
                          const manualExecs = (assignment.assignment_letter_manual_executors || []).map((me: any) => ({
                            order_index: me.order_index ?? 1000,
                            name: me.full_name,
                          }));
                          const allNames = [...teacherExecs, ...manualExecs]
                            .sort((a, b) => a.order_index - b.order_index);

                          const kinds = kindsOf(assignment);

                          return (
                            <TableRow key={assignment.id}>
                              <TableCell>{actualIndex}</TableCell>
                              <TableCell className="font-medium">
                                {kinds.guru > 0 || !assignment.kepsek_letter_number ? assignment.letter_number : null}
                                {assignment.kepsek_letter_number && (
                                  <div className={kinds.guru > 0 ? "text-xs font-normal text-muted-foreground" : ""}>
                                    {kinds.guru > 0 ? "Kepsek/Plt: " : ""}{assignment.kepsek_letter_number}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>{format(new Date(assignment.letter_date), "dd/MM/yyyy")}</TableCell>
                              <TableCell>{assignment.assignment_type}</TableCell>
                              <TableCell>{assignment.location}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {allNames.map((n, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {i + 1}. {n.name}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {format(new Date(assignment.start_date), "dd/MM/yy")} - {format(new Date(assignment.end_date), "dd/MM/yy")}
                              </TableCell>
                              <TableCell className="text-right">
                                <TooltipProvider>
                                  <div className="flex justify-end gap-2">
                                    {isLetterLocked(assignment.id) && (
                                      <Lock className="h-4 w-4 self-center text-amber-600" aria-label="Terkunci (SPJ)" />
                                    )}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="outline" size="icon" onClick={() => handleEdit(assignment)}>
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent><p>{isLetterLocked(assignment.id) ? "Edit surat tugas (terkunci SPJ, perlu kode hapus)" : "Edit surat tugas"}</p></TooltipContent>
                                    </Tooltip>
                                    {kinds.guru > 0 && kinds.kepsek > 0 ? (
                                      <>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="icon" aria-label="Preview surat tugas"><Eye className="h-4 w-4" /></Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => handlePreview(assignment, "guru")}>Preview surat guru</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handlePreview(assignment, "kepsek")}>Preview surat Kepala Sekolah/Plt</DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="default" size="icon" aria-label="Unduh surat tugas"><FileDown className="h-4 w-4" /></Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => exportPDF(assignment, "guru")}>Unduh surat guru</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => exportPDF(assignment, "kepsek")}>Unduh surat Kepala Sekolah/Plt</DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </>
                                    ) : (
                                      <>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="outline" size="icon" onClick={() => handlePreview(assignment, kinds.kepsek > 0 ? "kepsek" : "guru")}>
                                              <Eye className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent><p>{kinds.kepsek > 0 ? "Preview surat tugas Kepala Sekolah/Plt" : "Preview surat tugas sebelum cetak"}</p></TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button variant="default" size="icon" onClick={() => exportPDF(assignment, kinds.kepsek > 0 ? "kepsek" : "guru")}>
                                              <FileDown className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent><p>{kinds.kepsek > 0 ? "Unduh surat tugas Kepala Sekolah/Plt (PDF)" : "Unduh dan cetak surat tugas dalam format PDF"}</p></TooltipContent>
                                        </Tooltip>
                                      </>
                                    )}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="destructive" size="icon" onClick={() => handleDelete(assignment.id)}>
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent><p>{isLetterLocked(assignment.id) ? "Hapus surat tugas (terkunci SPJ, perlu kode hapus)" : "Hapus surat tugas"}</p></TooltipContent>
                                    </Tooltip>
                                  </div>
                                </TooltipProvider>
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
                  {searchQuery ? "Tidak ada surat tugas yang cocok dengan pencarian" : "Belum ada surat tugas"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Sheet open={previewOpen} onOpenChange={handleClosePreview}>
          <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{previewKind === "kepsek" ? "Preview Surat Tugas Kepala Sekolah/Plt" : "Preview Surat Tugas"}</SheetTitle>
              <SheetDescription>
                {previewAssignment && `Nomor: ${previewKind === "kepsek" ? previewAssignment.kepsek_letter_number || previewAssignment.letter_number : previewAssignment.letter_number}`}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              {previewPdfUrl ? (
                <>
                  <div className="border rounded-lg overflow-hidden bg-muted">
                    <iframe src={previewPdfUrl} className="w-full h-[600px]" title="Preview Surat Tugas" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleClosePreview}>Tutup</Button>
                    <Button onClick={handleDownloadFromPreview} className="gap-2">
                      <Download className="h-4 w-4" />
                      Download PDF
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">Memuat preview...</div>
              )}
            </div>
          </SheetContent>
        </Sheet>
        {spjDialog}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
