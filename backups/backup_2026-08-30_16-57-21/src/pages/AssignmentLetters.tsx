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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, FileText, Trash2, Search, FileDown, Calendar as CalendarIcon, X, ExternalLink, Eye, Download, Pencil, Users, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn, toTitleCase } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';
import { z } from "zod";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModernPageHeader, ModernDocumentCard, ModernFilterBar, ModernEmptyState, ModernStatsGrid } from "@/components/ui/modern-document-card";

interface ManualExecutor {
  id?: string;
  full_name: string;
  nip: string;
  pangkat_golongan: string;
  jabatan: string;
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
}).refine((data) => true, { message: "" }); // Will validate at least 1 executor exists

export default function AssignmentLetters() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [manualExecutors, setManualExecutors] = useState<ManualExecutor[]>([]);
  const [startDateFilter, setStartDateFilter] = useState<Date | undefined>();
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewAssignment, setPreviewAssignment] = useState<any>(null);
  const [newManualExecutor, setNewManualExecutor] = useState<ManualExecutor>({
    full_name: "",
    nip: "",
    pangkat_golongan: "",
    jabatan: "",
  });
  const [formData, setFormData] = useState({
    letter_number: "",
    letter_date: format(new Date(), "yyyy-MM-dd"),
    dasar_surat_tugas: "",
    tanggal_dasar_surat_tugas: format(new Date(), "yyyy-MM-dd"),
    assignment_type: "",
    description: "",
    location: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(new Date(), "yyyy-MM-dd"),
  });

  // Fetch teachers
  const { data: teachers, isLoading: isLoadingTeachers } = useQuery({
    queryKey: ["teachers-for-assignment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data) return [];

      const teachersWithProfiles = await Promise.all(
        data.map(async (teacher) => {
          // Use profiles_public view which is accessible to all authenticated users
          const { data: profile } = await supabase
            .from("profiles_public")
            .select("full_name")
            .eq("id", teacher.user_id)
            .maybeSingle();

          return {
            ...teacher,
            profile,
          };
        })
      );

      return teachersWithProfiles;
    },
  });

  // Fetch assignment letters with manual executors
  const { data: assignments, isLoading } = useQuery({
    queryKey: ["assignment-letters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_letters")
        .select(`
          *,
          assignment_letter_teachers (
            teacher_id
          ),
          assignment_letter_manual_executors (
            id,
            full_name,
            nip,
            pangkat_golongan,
            jabatan
          )
        `)
        .order("letter_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { teacher_ids: string[], manual_executors: ManualExecutor[] }) => {
      // Validate - check at least 1 executor (teacher or manual)
      assignmentSchema.parse(data);
      
      if (data.teacher_ids.length === 0 && data.manual_executors.length === 0) {
        throw new Error("Minimal 1 pelaksana harus dipilih atau dimasukkan manual");
      }

      // Create assignment letter
      const { data: letter, error: letterError } = await supabase
        .from("assignment_letters")
        .insert({
          letter_number: data.letter_number,
          letter_date: data.letter_date,
          dasar_surat_tugas: data.dasar_surat_tugas,
          tanggal_dasar_surat_tugas: data.tanggal_dasar_surat_tugas,
          assignment_type: data.assignment_type,
          description: data.description,
          location: data.location,
          start_date: data.start_date,
          end_date: data.end_date,
          created_by: user?.id!,
        })
        .select()
        .single();

      if (letterError) throw letterError;

      // Add teachers from database
      if (data.teacher_ids.length > 0) {
        const teacherInserts = data.teacher_ids.map((teacher_id) => ({
          assignment_letter_id: letter.id,
          teacher_id,
        }));

        const { error: teacherError } = await supabase
          .from("assignment_letter_teachers")
          .insert(teacherInserts);

        if (teacherError) throw teacherError;
      }

      // Add manual executors
      if (data.manual_executors.length > 0) {
        const manualInserts = data.manual_executors.map((executor) => ({
          assignment_letter_id: letter.id,
          full_name: executor.full_name,
          nip: executor.nip || null,
          pangkat_golongan: executor.pangkat_golongan || null,
          jabatan: executor.jabatan || null,
        }));

        const { error: manualError } = await supabase
          .from("assignment_letter_manual_executors")
          .insert(manualInserts);

        if (manualError) throw manualError;
      }

      // Auto-create surat keluar from surat tugas
      const { error: suratKeluarError } = await supabase
        .from("surat_keluar")
        .insert({
          nomor_surat: data.letter_number,
          tanggal_surat: data.letter_date,
          tujuan: data.location,
          perihal: `Surat Tugas - ${data.assignment_type}: ${data.description}`,
          kategori: 'kepegawaian',
          catatan: `Otomatis tercatat dari Surat Tugas No. ${data.letter_number}`,
          created_by: user?.id!,
        });

      if (suratKeluarError) {
        console.warn('Gagal mencatat ke surat keluar:', suratKeluarError);
        // Don't throw, just warn - surat tugas still created successfully
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
      } else {
        toast.error(error.message || "Gagal membuat surat tugas");
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { teacher_ids: string[], manual_executors: ManualExecutor[], id: string }) => {
      // Validate
      assignmentSchema.parse({
        letter_number: data.letter_number,
        letter_date: data.letter_date,
        dasar_surat_tugas: data.dasar_surat_tugas,
        tanggal_dasar_surat_tugas: data.tanggal_dasar_surat_tugas,
        assignment_type: data.assignment_type,
        description: data.description,
        location: data.location,
        start_date: data.start_date,
        end_date: data.end_date,
      });

      if (data.teacher_ids.length === 0 && data.manual_executors.length === 0) {
        throw new Error("Minimal 1 pelaksana harus dipilih atau dimasukkan manual");
      }

      // Update assignment letter
      const { error: letterError } = await supabase
        .from("assignment_letters")
        .update({
          letter_number: data.letter_number,
          letter_date: data.letter_date,
          dasar_surat_tugas: data.dasar_surat_tugas,
          tanggal_dasar_surat_tugas: data.tanggal_dasar_surat_tugas,
          assignment_type: data.assignment_type,
          description: data.description,
          location: data.location,
          start_date: data.start_date,
          end_date: data.end_date,
        })
        .eq("id", data.id);

      if (letterError) throw letterError;

      // Delete existing teachers and re-add
      const { error: deleteTeacherError } = await supabase
        .from("assignment_letter_teachers")
        .delete()
        .eq("assignment_letter_id", data.id);

      if (deleteTeacherError) throw deleteTeacherError;

      // Delete existing manual executors and re-add
      const { error: deleteManualError } = await supabase
        .from("assignment_letter_manual_executors")
        .delete()
        .eq("assignment_letter_id", data.id);

      if (deleteManualError) throw deleteManualError;

      // Add teachers from database
      if (data.teacher_ids.length > 0) {
        const teacherInserts = data.teacher_ids.map((teacher_id) => ({
          assignment_letter_id: data.id,
          teacher_id,
        }));

        const { error: teacherError } = await supabase
          .from("assignment_letter_teachers")
          .insert(teacherInserts);

        if (teacherError) throw teacherError;
      }

      // Add manual executors
      if (data.manual_executors.length > 0) {
        const manualInserts = data.manual_executors.map((executor) => ({
          assignment_letter_id: data.id,
          full_name: executor.full_name,
          nip: executor.nip || null,
          pangkat_golongan: executor.pangkat_golongan || null,
          jabatan: executor.jabatan || null,
        }));

        const { error: manualError } = await supabase
          .from("assignment_letter_manual_executors")
          .insert(manualInserts);

        if (manualError) throw manualError;
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
      } else {
        toast.error(error.message || "Gagal memperbarui surat tugas");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("assignment_letters")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignment-letters"] });
      toast.success("Surat tugas berhasil dihapus");
    },
    onError: (error: any) => {
      toast.error(error.message || "Gagal menghapus surat tugas");
    },
  });

  const resetForm = () => {
    setFormData({
      letter_number: "",
      letter_date: format(new Date(), "yyyy-MM-dd"),
      dasar_surat_tugas: "",
      tanggal_dasar_surat_tugas: format(new Date(), "yyyy-MM-dd"),
      assignment_type: "",
      description: "",
      location: "",
      start_date: format(new Date(), "yyyy-MM-dd"),
      end_date: format(new Date(), "yyyy-MM-dd"),
    });
    setSelectedTeachers([]);
    setManualExecutors([]);
    setNewManualExecutor({ full_name: "", nip: "", pangkat_golongan: "", jabatan: "" });
    setIsEditMode(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditMode && editingId) {
      updateMutation.mutate({
        ...formData,
        teacher_ids: selectedTeachers,
        manual_executors: manualExecutors,
        id: editingId,
      });
    } else {
      createMutation.mutate({
        ...formData,
        teacher_ids: selectedTeachers,
        manual_executors: manualExecutors,
      });
    }
  };

  const handleEdit = (assignment: any) => {
    setIsEditMode(true);
    setEditingId(assignment.id);
    setFormData({
      letter_number: assignment.letter_number,
      letter_date: assignment.letter_date,
      dasar_surat_tugas: assignment.dasar_surat_tugas || "",
      tanggal_dasar_surat_tugas: assignment.tanggal_dasar_surat_tugas || format(new Date(), "yyyy-MM-dd"),
      assignment_type: assignment.assignment_type,
      description: assignment.description,
      location: assignment.location,
      start_date: assignment.start_date,
      end_date: assignment.end_date,
    });
    setSelectedTeachers(assignment.assignment_letter_teachers?.map((at: any) => at.teacher_id) || []);
    setManualExecutors(assignment.assignment_letter_manual_executors?.map((me: any) => ({
      id: me.id,
      full_name: me.full_name,
      nip: me.nip || "",
      pangkat_golongan: me.pangkat_golongan || "",
      jabatan: me.jabatan || "",
    })) || []);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Yakin ingin menghapus surat tugas ini?")) {
      deleteMutation.mutate(id);
    }
  };

  const toggleTeacher = (teacherId: string) => {
    setSelectedTeachers((prev) =>
      prev.includes(teacherId)
        ? prev.filter((id) => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const addManualExecutor = () => {
    if (!newManualExecutor.full_name.trim()) {
      toast.error("Nama pelaksana wajib diisi");
      return;
    }
    setManualExecutors((prev) => [...prev, { ...newManualExecutor }]);
    setNewManualExecutor({ full_name: "", nip: "", pangkat_golongan: "", jabatan: "" });
  };

  const removeManualExecutor = (index: number) => {
    setManualExecutors((prev) => prev.filter((_, i) => i !== index));
  };

  const generatePDF = async (assignment: any): Promise<jsPDF> => {
    const { data: settings } = await supabase
      .from("school_settings")
      .select("*")
      .single();

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [210, 330] // F4 paper size
    });
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

    // Title: SURAT TUGAS
    yPos += 8;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("SURAT TUGAS", pageWidth / 2, yPos, { align: "center" });
    
    // Nomor Surat
    yPos += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Nomor : ${assignment.letter_number}`, pageWidth / 2, yPos, { align: "center" });

    // Dasar section
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

    // MEMERINTAHKAN section
    yPos += 12;
    doc.setFont("helvetica", "bold");
    doc.text("MEMERINTAHKAN:", pageWidth / 2, yPos, { align: "center" });
    doc.setFont("helvetica", "normal");

    // Kepada section with teacher and manual executor details
    yPos += 10;
    const assignmentTeachers = assignment.assignment_letter_teachers || [];
    const manualExecs = assignment.assignment_letter_manual_executors || [];
    
    // Fetch full teacher data
    const teachersData = await Promise.all(
      assignmentTeachers.map(async (at: any) => {
        const { data: teacher } = await supabase
          .from("teachers")
          .select("*")
          .eq("id", at.teacher_id)
          .single();
        
        if (!teacher) return null;
        
        const { data: profile } = await supabase
          .from("profiles_public")
          .select("full_name")
          .eq("id", teacher.user_id)
          .maybeSingle();
        
        return { ...teacher, profile, isManual: false };
      })
    );

    // Combine teachers from database and manual executors
    const allExecutors = [
      ...teachersData.filter(Boolean),
      ...manualExecs.map((me: any) => ({
        profile: { full_name: me.full_name },
        nip: me.nip,
        pangkat_golongan: me.pangkat_golongan,
        jabatan: me.jabatan,
        subject: me.jabatan || "Pelaksana",
        isManual: true,
      }))
    ];
    
    doc.text("Kepada", 20, yPos);
    doc.text(":", 40, yPos);
    
    for (let i = 0; i < allExecutors.length; i++) {
      const executor = allExecutors[i];
      if (!executor) continue;
      
      const executorName = toTitleCase(executor.profile?.full_name) || "-";
      const executorNip = executor.nip || "-";
      const executorSubject = executor.subject || "Pelaksana";
      
      if (i > 0) yPos += 12;
      
      // Number
      doc.text(`${i + 1}.`, 45, yPos);
      
      // Nama
      doc.text("Nama", 55, yPos);
      doc.text(`: ${executorName}`, 90, yPos);
      yPos += 5;
      
      // Pangkat/Gol
      doc.text("Pangkat / Gol", 55, yPos);
      doc.text(`: ${executor.pangkat_golongan || "-"}`, 90, yPos);
      yPos += 5;
      
      // NIP
      doc.text("NIP", 55, yPos);
      doc.text(`: ${executorNip}`, 90, yPos);
      yPos += 5;
      
      // Jabatan
      doc.text("Jabatan", 55, yPos);
      doc.text(`: ${executor.jabatan || executorSubject}`, 90, yPos);
      yPos += 2;
    }

    // Untuk section
    yPos += 12;
    doc.text("Untuk", 20, yPos);
    doc.text(":", 40, yPos);
    doc.text("1.", 45, yPos);
    
    // Split description into multiple lines if needed
    const maxWidth = 140;
    const descLines = doc.splitTextToSize(assignment.description, maxWidth);
    doc.text(descLines, 55, yPos);
    yPos += descLines.length * 5;

    // Date and location
    yPos += 6;
    doc.text("2.", 45, yPos);
    doc.text(`${format(new Date(assignment.start_date), "dd MMMM", { locale: idLocale })} s.d ${format(new Date(assignment.end_date), "dd MMMM yyyy", { locale: idLocale })}`, 55, yPos);
    
    yPos += 6;
    doc.text("3.", 45, yPos);
    doc.text(assignment.location, 55, yPos);

    // Signature section
    yPos += 15;
    const signatureX = pageWidth - 65;
    
    doc.text(`Ciamis, ${format(new Date(assignment.letter_date), "dd MMMM yyyy", { locale: idLocale })}`, signatureX, yPos, { align: "center" });
    yPos += 5;
    doc.text(`Kepala ${settings?.school_name || "Sekolah"},`, signatureX, yPos, { align: "center" });
    
    // Space for signature
    yPos += 20;
    
    // Name and NIP
    doc.setFont("helvetica", "bold");
    doc.text(toTitleCase(settings?.headmaster_name) || "", signatureX, yPos, { align: "center" });
    yPos += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`NIP. ${settings?.headmaster_nip || ""}`, signatureX, yPos, { align: "center" });

    return doc;
  };

  const handlePreview = async (assignment: any) => {
    try {
      // Fetch complete assignment data with teachers and manual executors
      const { data: completeAssignment, error } = await supabase
        .from("assignment_letters")
        .select(`
          *,
          assignment_letter_teachers (
            teacher_id
          ),
          assignment_letter_manual_executors (
            id,
            full_name,
            nip,
            pangkat_golongan,
            jabatan
          )
        `)
        .eq("id", assignment.id)
        .single();

      if (error) throw error;

      const doc = await generatePDF(completeAssignment);
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      setPreviewPdfUrl(pdfUrl);
      setPreviewAssignment(completeAssignment);
      setPreviewOpen(true);
    } catch (error) {
      console.error("Error generating preview:", error);
      toast.error("Gagal membuat preview PDF");
    }
  };

  const handleDownloadFromPreview = async () => {
    if (previewAssignment) {
      try {
        const doc = await generatePDF(previewAssignment);
        doc.save(`Surat-Tugas-${previewAssignment.letter_number}.pdf`);
        toast.success("PDF berhasil diunduh");
      } catch (error) {
        console.error("Error downloading PDF:", error);
        toast.error("Gagal mengunduh PDF");
      }
    }
  };

  const handleClosePreview = () => {
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
    }
    setPreviewOpen(false);
    setPreviewPdfUrl(null);
    setPreviewAssignment(null);
  };

  const exportPDF = async (assignment: any) => {
    try {
      // Fetch complete assignment data with teachers and manual executors
      const { data: completeAssignment, error } = await supabase
        .from("assignment_letters")
        .select(`
          *,
          assignment_letter_teachers (
            teacher_id
          ),
          assignment_letter_manual_executors (
            id,
            full_name,
            nip,
            pangkat_golongan,
            jabatan
          )
        `)
        .eq("id", assignment.id)
        .single();

      if (error) throw error;

      const doc = await generatePDF(completeAssignment);
      doc.save(`Surat-Tugas-${completeAssignment.letter_number}.pdf`);
      toast.success("PDF berhasil diunduh");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Gagal membuat PDF");
    }
  };

  const filteredAssignments = assignments?.filter((assignment) => {
    // Search filter
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === "" || 
      assignment.letter_number.toLowerCase().includes(searchLower) ||
      assignment.assignment_type.toLowerCase().includes(searchLower) ||
      assignment.location.toLowerCase().includes(searchLower) ||
      assignment.assignment_letter_teachers?.some((at: any) => {
        const teacher = teachers?.find((t: any) => t.id === at.teacher_id);
        return teacher?.profile?.full_name?.toLowerCase().includes(searchLower);
      }) ||
      assignment.assignment_letter_manual_executors?.some((me: any) => 
        me.full_name?.toLowerCase().includes(searchLower)
      );

    // Date filter
    const assignmentDate = new Date(assignment.letter_date);
    const matchesStartDate = !startDateFilter || assignmentDate >= startDateFilter;
    const matchesEndDate = !endDateFilter || assignmentDate <= endDateFilter;

    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Surat Tugas</h1>
              <p className="text-muted-foreground">Kelola surat tugas untuk guru</p>
            </div>
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
                        placeholder="Contoh: 001/ST/2024"
                        required
                      />
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
                            Total: {teachers.length} guru
                          </div>
                          {teachers.map((teacher: any) => (
                            <div key={teacher.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded group">
                              <input
                                type="checkbox"
                                id={`teacher-${teacher.id}`}
                                checked={selectedTeachers.includes(teacher.id)}
                                onChange={() => toggleTeacher(teacher.id)}
                                className="h-4 w-4"
                              />
                              <Label
                                htmlFor={`teacher-${teacher.id}`}
                                className="cursor-pointer flex-1"
                              >
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
                          ))}
                        </>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          Tidak ada data guru.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manual Executor Section */}
                  <div className="space-y-2">
                    <Label>Pelaksana Manual (jika tidak ada di database)</Label>
                    
                    {/* List of added manual executors */}
                    {manualExecutors.length > 0 && (
                      <div className="border rounded-md p-3 space-y-2 bg-muted/20 mb-2">
                        <div className="text-xs text-muted-foreground">
                          Pelaksana manual yang ditambahkan: {manualExecutors.length}
                        </div>
                        {manualExecutors.map((executor, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-background rounded border">
                            <div className="flex-1">
                              <span className="font-medium">{executor.full_name}</span>
                              {executor.nip && <span className="text-muted-foreground"> - NIP: {executor.nip}</span>}
                              {executor.jabatan && <span className="text-muted-foreground"> ({executor.jabatan})</span>}
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeManualExecutor(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Form to add new manual executor */}
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

                  {/* Validation message */}
                  {selectedTeachers.length === 0 && manualExecutors.length === 0 && (
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

          <Card>
            <CardHeader>
              <CardTitle>Daftar Surat Tugas</CardTitle>
              <CardDescription>
                Total: {filteredAssignments?.length || 0} surat tugas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari berdasarkan nomor surat, nama guru, jenis tugas, atau lokasi..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Date Filters */}
                <div className="flex flex-wrap gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !startDateFilter && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDateFilter ? format(startDateFilter, "dd/MM/yyyy") : "Dari Tanggal"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDateFilter}
                        onSelect={setStartDateFilter}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !endDateFilter && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDateFilter ? format(endDateFilter, "dd/MM/yyyy") : "Sampai Tanggal"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDateFilter}
                        onSelect={setEndDateFilter}
                        initialFocus
                      />
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

                {/* Active Filters Display */}
                {(startDateFilter || endDateFilter || searchQuery) && (
                  <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
                    <span>Filter aktif:</span>
                    {searchQuery && (
                      <Badge variant="secondary">
                        Pencarian: "{searchQuery}"
                      </Badge>
                    )}
                    {startDateFilter && (
                      <Badge variant="secondary">
                        Dari: {format(startDateFilter, "dd/MM/yyyy")}
                      </Badge>
                    )}
                    {endDateFilter && (
                      <Badge variant="secondary">
                        Sampai: {format(endDateFilter, "dd/MM/yyyy")}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
              ) : filteredAssignments && filteredAssignments.length > 0 ? (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">No</TableHead>
                        <TableHead>Nomor Surat</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Jenis Tugas</TableHead>
                        <TableHead>Lokasi</TableHead>
                        <TableHead>Guru</TableHead>
                        <TableHead>Waktu</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssignments.map((assignment, index) => (
                        <TableRow key={assignment.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="font-medium">{assignment.letter_number}</TableCell>
                          <TableCell>{format(new Date(assignment.letter_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>{assignment.assignment_type}</TableCell>
                          <TableCell>{assignment.location}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {assignment.assignment_letter_teachers.map((at: any) => {
                                const teacher = teachers?.find((t: any) => t.id === at.teacher_id);
                                return (
                                  <Badge key={at.teacher_id} variant="secondary" className="text-xs">
                                    {teacher?.profile?.full_name || "-"}
                                  </Badge>
                                );
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(assignment.start_date), "dd/MM/yy")} - {format(new Date(assignment.end_date), "dd/MM/yy")}
                          </TableCell>
                          <TableCell className="text-right">
                            <TooltipProvider>
                              <div className="flex justify-end gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() => handleEdit(assignment)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Edit surat tugas</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() => handlePreview(assignment)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Preview surat tugas sebelum cetak</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="default"
                                      size="icon"
                                      onClick={() => exportPDF(assignment)}
                                    >
                                      <FileDown className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Unduh dan cetak surat tugas dalam format PDF</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="destructive"
                                      size="icon"
                                      onClick={() => handleDelete(assignment.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Hapus surat tugas</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "Tidak ada surat tugas yang cocok dengan pencarian" : "Belum ada surat tugas"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview Sheet */}
        <Sheet open={previewOpen} onOpenChange={handleClosePreview}>
          <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Preview Surat Tugas</SheetTitle>
              <SheetDescription>
                {previewAssignment && `Nomor: ${previewAssignment.letter_number}`}
              </SheetDescription>
            </SheetHeader>
            
            <div className="mt-6 space-y-4">
              {previewPdfUrl ? (
                <>
                  <div className="border rounded-lg overflow-hidden bg-muted">
                    <iframe
                      src={previewPdfUrl}
                      className="w-full h-[600px]"
                      title="Preview Surat Tugas"
                    />
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleClosePreview}>
                      Tutup
                    </Button>
                    <Button onClick={handleDownloadFromPreview} className="gap-2">
                      <Download className="h-4 w-4" />
                      Download PDF
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Memuat preview...
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
