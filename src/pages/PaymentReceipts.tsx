import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Receipt, Trash2, Search, FileDown, Pencil, Settings, Save, Eye, Calendar as CalendarIcon, X, Wallet, TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn, toTitleCase } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import jsPDF from 'jspdf';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';
import { z } from "zod";
import { ReceiptPreviewDialog } from "@/components/receipt/ReceiptPreviewDialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DataPagination } from "@/components/ui/data-pagination";
import { usePagination } from "@/hooks/usePagination";

const numberToWords = (num: number): string => {
  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  if (num < 12) return satuan[num];
  if (num < 20) return satuan[num - 10] + ' belas';
  if (num < 100) return satuan[Math.floor(num / 10)] + ' puluh ' + satuan[num % 10];
  if (num < 200) return 'seratus ' + numberToWords(num - 100);
  if (num < 1000) return satuan[Math.floor(num / 100)] + ' ratus ' + numberToWords(num % 100);
  if (num < 2000) return 'seribu ' + numberToWords(num - 1000);
  if (num < 1000000) return numberToWords(Math.floor(num / 1000)) + ' ribu ' + numberToWords(num % 1000);
  if (num < 1000000000) return numberToWords(Math.floor(num / 1000000)) + ' juta ' + numberToWords(num % 1000000);
  return num.toString();
};

const formatAmountToWords = (amount: number): string => {
  const words = numberToWords(amount).trim();
  return words.charAt(0).toUpperCase() + words.slice(1) + ' rupiah';
};

const receiptSchema = z.object({
  official_travel_id: z.string().min(1, "SPPD wajib dipilih"),
  receipt_number: z.string().min(1, "Nomor kwitansi wajib diisi"),
  receipt_date: z.string().min(1, "Tanggal wajib diisi"),
  recipient_name: z.string().min(1, "Nama penerima wajib diisi"),
  amount: z.number().min(1, "Jumlah harus lebih dari 0"),
  description: z.string().min(1, "Keterangan wajib diisi"),
  payment_type: z.string().min(1, "Jenis pembayaran wajib diisi"),
});

interface TravelRate {
  id: string;
  position_type: string;
  daily_rate: number;
  transport_rate: number;
  accommodation_rate: number;
}

export default function PaymentReceipts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedSPPD, setSelectedSPPD] = useState<string>("");
  const [startDateFilter, setStartDateFilter] = useState<Date | undefined>();
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>();
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [formData, setFormData] = useState({
    receipt_number: "",
    payment_type: "transport",
  });

  const [sppdTeachersData, setSPPDTeachersData] = useState<any[]>([]);
  const [sppdStudentsData, setSPPDStudentsData] = useState<any[]>([]);
  const [autoData, setAutoData] = useState({
    receipt_date: format(new Date(), "yyyy-MM-dd"),
    recipient_name: "",
    recipient_position: "",
    recipient_nip: "",
    amount: "",
    description: "",
  });

  const [isAddPositionOpen, setIsAddPositionOpen] = useState(false);
  const [newPosition, setNewPosition] = useState({
    position_type: "",
    daily_rate: "",
    transport_rate: "",
    accommodation_rate: "",
  });

  const [editingRates, setEditingRates] = useState<Record<string, TravelRate>>({});

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewReceipt, setPreviewReceipt] = useState<any>(null);
  const [previewTeachers, setPreviewTeachers] = useState<any[]>([]);
  const [previewStudents, setPreviewStudents] = useState<any[]>([]);
  const [previewTravelDays, setPreviewTravelDays] = useState(1);

  const { data: travelRates, isLoading: isLoadingRates } = useQuery({
    queryKey: ["travel-payment-rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("travel_payment_rates").select("*").order("position_type");
      if (error) throw error;
      return data as TravelRate[];
    },
  });

  const updateRateMutation = useMutation({
    mutationFn: async (rate: TravelRate) => {
      const { error } = await supabase
        .from("travel_payment_rates")
        .update({
          daily_rate: rate.daily_rate,
          transport_rate: rate.transport_rate,
          accommodation_rate: rate.accommodation_rate,
        })
        .eq("id", rate.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-payment-rates"] });
      toast.success("Tarif berhasil diperbarui");
    },
    onError: (error: any) => toast.error(error.message || "Gagal memperbarui tarif"),
  });

  const createPositionMutation = useMutation({
    mutationFn: async (data: typeof newPosition) => {
      if (!data.position_type.trim()) throw new Error("Nama jabatan wajib diisi");
      const { error } = await supabase.from("travel_payment_rates").insert({
        position_type: data.position_type.trim(),
        daily_rate: parseFloat(data.daily_rate) || 0,
        transport_rate: parseFloat(data.transport_rate) || 0,
        accommodation_rate: parseFloat(data.accommodation_rate) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-payment-rates"] });
      toast.success("Jenis jabatan berhasil ditambahkan");
      setIsAddPositionOpen(false);
      setNewPosition({ position_type: "", daily_rate: "", transport_rate: "", accommodation_rate: "" });
    },
    onError: (error: any) => toast.error(error.message || "Gagal menambahkan jenis jabatan"),
  });

  const deletePositionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("travel_payment_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["travel-payment-rates"] });
      toast.success("Jenis jabatan berhasil dihapus");
    },
    onError: (error: any) => toast.error(error.message || "Gagal menghapus jenis jabatan"),
  });

  const toggleSpjMutation = useMutation({
    mutationFn: async ({ id, is_spj }: { id: string; is_spj: boolean }) => {
      const { error } = await supabase.from("payment_receipts").update({ is_spj }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      toast.success("Status SPJ berhasil diperbarui");
    },
    onError: (error: any) => toast.error(error.message || "Gagal memperbarui status SPJ"),
  });

  const { data: sppdList } = useQuery({
    queryKey: ["sppd-for-receipt"],
    queryFn: async () => {
      const { data: letters, error } = await supabase
        .from("official_travel_letters")
        .select("id, letter_number, purpose, destination, departure_date, return_date")
        .order("letter_date", { ascending: false });
      if (error) throw error;

      return await Promise.all(
        (letters || []).map(async (letter) => {
          const { data: teachers } = await supabase
            .from("official_travel_teachers").select("id").eq("official_travel_id", letter.id);
          const { data: manualFollowers } = await supabase
            .from("official_travel_followers").select("id")
            .eq("official_travel_id", letter.id).eq("follower_type", "manual_executor");

          const teacherCount = (teachers?.length || 0) + (manualFollowers?.length || 0);
          return { ...letter, teacher_count: teacherCount };
        })
      );
    },
  });

  const selectedSPPDData = sppdList?.find((s) => s.id === selectedSPPD);

  const fetchSPPDTeachers = async (sppdId: string) => {
    if (!sppdId) return [];

    const { data: sppdTeachers } = await supabase
      .from("official_travel_teachers")
      .select("teacher_id, order_index")
      .eq("official_travel_id", sppdId)
      .order("order_index", { ascending: true });

    let mappedTeachers: any[] = [];

    if (sppdTeachers && sppdTeachers.length > 0) {
      const teacherIds = sppdTeachers.map((t) => t.teacher_id);
      const { data: teachers } = await supabase
        .from("teachers")
        .select("id, user_id, nip, pangkat_golongan, jabatan")
        .in("id", teacherIds);

      if (teachers && teachers.length > 0) {
        const userIds = teachers.map((t) => t.user_id);
        const { data: profiles } = await supabase
          .from("profiles_public").select("id, full_name").in("id", userIds);

        const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || []);
        const teacherMap = new Map(teachers.map((t) => [t.id, t]));

        mappedTeachers = sppdTeachers
          .map((st) => {
            const t = teacherMap.get(st.teacher_id);
            if (!t) return null;
            return {
              ...t,
              full_name: profileMap.get(t.user_id) || "",
              type: "guru" as const,
              isManual: false,
              order_index: st.order_index ?? 0,
            };
          })
          .filter(Boolean);
      }
    }

    const { data: manualFollowers } = await supabase
      .from("official_travel_followers")
      .select("id, manual_executor_name, manual_executor_nip, manual_executor_pangkat, manual_executor_jabatan, order_index")
      .eq("official_travel_id", sppdId)
      .eq("follower_type", "manual_executor")
      .order("order_index", { ascending: true });

    const manualTeachers = (manualFollowers || []).map((f) => ({
      id: f.id,
      user_id: null,
      nip: f.manual_executor_nip,
      pangkat_golongan: f.manual_executor_pangkat,
      jabatan: f.manual_executor_jabatan || "Guru",
      full_name: f.manual_executor_name || "",
      type: "guru" as const,
      isManual: true,
      order_index: f.order_index ?? 0,
    }));

    return [...mappedTeachers, ...manualTeachers]
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map(({ order_index, ...rest }) => rest);
  };

  const fetchSPPDStudents = async (sppdId: string) => {
    if (!sppdId) return [];
    try {
      const { data: followers } = await supabase
        .from("official_travel_followers")
        .select("student_id, order_index")
        .eq("official_travel_id", sppdId)
        .eq("follower_type", "student")
        .order("order_index", { ascending: true });

      if (!followers || followers.length === 0) return [];

      const studentIds = followers.map(f => f.student_id).filter(Boolean);
      if (studentIds.length === 0) return [];

      const { data: students } = await supabase
        .from("students").select("id, full_name, nis, class_id").in("id", studentIds);

      if (!students || students.length === 0) return [];

      const classIds = students.map(s => s.class_id).filter(Boolean);
      let classMap = new Map<string, string>();
      if (classIds.length > 0) {
        const { data: classes } = await supabase.from("classes").select("id, name").in("id", classIds);
        if (classes) classMap = new Map(classes.map(c => [c.id, c.name]));
      }

      const studentMap = new Map(students.map(s => [s.id, s]));

      return followers
        .map(f => {
          const s = studentMap.get(f.student_id);
          if (!s) return null;
          return {
            id: s.id,
            full_name: s.full_name || "",
            nis: s.nis || "",
            class_name: s.class_id ? (classMap.get(s.class_id) || "") : "",
            jabatan: "Siswa",
            type: "siswa" as const,
          };
        })
        .filter(Boolean);
    } catch (error) {
      console.error("Error in fetchSPPDStudents:", error);
      return [];
    }
  };

  const { data: receipts, isLoading } = useQuery({
    queryKey: ["payment-receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_receipts")
        .select(`
          *,
          official_travel_letters (
            id, letter_number, purpose, destination, departure_date, return_date, travel_budget, accommodation_budget
          )
        `)
        .order("receipt_date", { ascending: false });
      if (error) throw error;

      return await Promise.all(
        (data || []).map(async (receipt) => {
          if (receipt.official_travel_letters?.id) {
            const { data: teachers } = await supabase
              .from("official_travel_teachers").select("id").eq("official_travel_id", receipt.official_travel_letters.id);
            const { data: manualFollowers } = await supabase
              .from("official_travel_followers").select("id")
              .eq("official_travel_id", receipt.official_travel_letters.id).eq("follower_type", "manual_executor");
            const { data: students } = await supabase
              .from("official_travel_followers").select("id")
              .eq("official_travel_id", receipt.official_travel_letters.id).eq("follower_type", "student");

            const teacherCount = (teachers?.length || 0) + (manualFollowers?.length || 0);

            return {
              ...receipt,
              sppd_teacher_count: teacherCount,
              sppd_student_count: students?.length || 0
            };
          }
          return { ...receipt, sppd_teacher_count: 0, sppd_student_count: 0 };
        })
      );
    },
  });

  const { data: rkasBudgetData } = useQuery({
    queryKey: ["rkas-budget-stats", monthFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rkas_items")
        .select(`id, total_amount, activity_name, kode_rekening, rkas_id, rkas_documents!inner (month, year, status)`)
        .eq("rkas_documents.status", "parsed");
      if (error) throw error;
      return (data || []).filter(item =>
        item.kode_rekening === "5.1.02.04.01.0003" || item.kode_rekening === "5.1.02.04.01.0001"
      );
    },
  });

  const calculateTravelDays = (departureDate: string, returnDate: string): number => {
    const start = new Date(departureDate);
    const end = new Date(returnDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const getRateForJabatan = (jabatan: string, paymentType: string): number => {
    const rate = travelRates?.find(r => r.position_type === jabatan);
    if (!rate) {
      const guruRate = travelRates?.find(r => r.position_type === "Guru");
      if (!guruRate) return 0;
      switch (paymentType) {
        case "transport": return Number(guruRate.transport_rate);
        case "accommodation": return Number(guruRate.accommodation_rate);
        case "meals": return Number(guruRate.daily_rate);
        default: return 0;
      }
    }
    switch (paymentType) {
      case "transport": return Number(rate.transport_rate);
      case "accommodation": return Number(rate.accommodation_rate);
      case "meals": return Number(rate.daily_rate);
      default: return 0;
    }
  };

  const handleSPPDChange = async (sppdId: string) => {
    setSelectedSPPD(sppdId);
    if (!sppdId) {
      setSPPDTeachersData([]);
      setSPPDStudentsData([]);
      setFormData(prev => ({ ...prev, receipt_number: "" }));
      setAutoData({
        receipt_date: format(new Date(), "yyyy-MM-dd"),
        recipient_name: "", recipient_position: "", recipient_nip: "", amount: "", description: "",
      });
      return;
    }

    const sppdData = sppdList?.find(s => s.id === sppdId);
    if (sppdData?.letter_number) {
      setFormData(prev => ({ ...prev, receipt_number: sppdData.letter_number }));
    }
    if (!sppdData) return;

    const travelDays = calculateTravelDays(sppdData.departure_date, sppdData.return_date);
    const teachers = await fetchSPPDTeachers(sppdId);
    const students = await fetchSPPDStudents(sppdId);
    setSPPDTeachersData(teachers);
    setSPPDStudentsData(students);

    if (teachers.length > 0) {
      const firstTeacher = teachers[0];
      const jabatan = firstTeacher.jabatan || "Guru";

      let totalAmount = 0;
      teachers.forEach(teacher => {
        totalAmount += getRateForJabatan(teacher.jabatan || "Guru", formData.payment_type) * travelDays;
      });
      students.forEach(() => {
        totalAmount += getRateForJabatan("Siswa", formData.payment_type) * travelDays;
      });

      setAutoData({
        receipt_date: sppdData.departure_date,
        recipient_name: firstTeacher.full_name || "",
        recipient_position: jabatan,
        recipient_nip: firstTeacher.nip || "",
        amount: totalAmount.toString(),
        description: `Pembayaran ${formData.payment_type === "transport" ? "transportasi" : formData.payment_type === "accommodation" ? "akomodasi" : "uang harian"} perjalanan dinas ke ${sppdData.destination} dalam rangka ${sppdData.purpose} (${travelDays} hari)`,
      });
    }
  };

  const handlePaymentTypeChange = async (paymentType: string) => {
    setFormData(prev => ({ ...prev, payment_type: paymentType }));

    if (sppdTeachersData.length > 0) {
      const sppdData = sppdList?.find(s => s.id === selectedSPPD);
      const travelDays = sppdData ? calculateTravelDays(sppdData.departure_date, sppdData.return_date) : 1;

      let totalAmount = 0;
      sppdTeachersData.forEach(teacher => {
        totalAmount += getRateForJabatan(teacher.jabatan || "Guru", paymentType) * travelDays;
      });
      sppdStudentsData.forEach(() => {
        totalAmount += getRateForJabatan("Siswa", paymentType) * travelDays;
      });

      setAutoData(prev => ({
        ...prev,
        amount: totalAmount.toString(),
        description: `Pembayaran ${paymentType === "transport" ? "transportasi" : paymentType === "accommodation" ? "akomodasi" : "uang harian"} perjalanan dinas ke ${sppdData?.destination || ""} dalam rangka ${sppdData?.purpose || ""} (${travelDays} hari)`,
      }));
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const submitData = { ...data, ...autoData, official_travel_id: selectedSPPD };

      receiptSchema.parse({
        ...submitData,
        amount: parseFloat(autoData.amount) || 0,
      });

      const amountNum = parseFloat(autoData.amount) || 0;
      const { error } = await supabase.from("payment_receipts").insert({
        official_travel_id: selectedSPPD,
        receipt_number: data.receipt_number,
        receipt_date: autoData.receipt_date,
        recipient_name: autoData.recipient_name,
        recipient_position: autoData.recipient_position || null,
        recipient_nip: autoData.recipient_nip || null,
        amount: amountNum,
        amount_text: formatAmountToWords(amountNum),
        description: autoData.description,
        payment_type: data.payment_type,
        created_by: user?.id!,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      toast.success("Kwitansi berhasil dibuat");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
      else toast.error(error.message || "Gagal membuat kwitansi");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const submitData = { ...data, ...autoData, official_travel_id: selectedSPPD };

      receiptSchema.parse({
        ...submitData,
        amount: parseFloat(autoData.amount) || 0,
      });

      const amountNum = parseFloat(autoData.amount) || 0;
      const { error } = await supabase.from("payment_receipts").update({
        official_travel_id: selectedSPPD,
        receipt_number: data.receipt_number,
        receipt_date: autoData.receipt_date,
        recipient_name: autoData.recipient_name,
        recipient_position: autoData.recipient_position || null,
        recipient_nip: autoData.recipient_nip || null,
        amount: amountNum,
        amount_text: formatAmountToWords(amountNum),
        description: autoData.description,
        payment_type: data.payment_type,
      }).eq("id", editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      toast.success("Kwitansi berhasil diperbarui");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
      else toast.error(error.message || "Gagal memperbarui kwitansi");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_receipts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      toast.success("Kwitansi berhasil dihapus");
    },
    onError: (error: any) => toast.error(error.message || "Gagal menghapus kwitansi"),
  });

  const resetForm = () => {
    setFormData({ receipt_number: "", payment_type: "transport" });
    setAutoData({
      receipt_date: format(new Date(), "yyyy-MM-dd"),
      recipient_name: "", recipient_position: "", recipient_nip: "", amount: "", description: "",
    });
    setSelectedSPPD("");
    setSPPDTeachersData([]);
    setSPPDStudentsData([]);
    setIsEditMode(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditMode && editingId) updateMutation.mutate(formData);
    else createMutation.mutate(formData);
  };

  const handleEdit = async (receipt: any) => {
    setIsEditMode(true);
    setEditingId(receipt.id);
    setSelectedSPPD(receipt.official_travel_id);

    const teachers = await fetchSPPDTeachers(receipt.official_travel_id);
    const students = await fetchSPPDStudents(receipt.official_travel_id);
    setSPPDTeachersData(teachers);
    setSPPDStudentsData(students);

    setFormData({ receipt_number: receipt.receipt_number, payment_type: receipt.payment_type });
    setAutoData({
      receipt_date: receipt.receipt_date,
      recipient_name: receipt.recipient_name,
      recipient_position: receipt.recipient_position || "",
      recipient_nip: receipt.recipient_nip || "",
      amount: receipt.amount.toString(),
      description: receipt.description,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Yakin ingin menghapus kwitansi ini?")) deleteMutation.mutate(id);
  };

  const handleRateChange = (rateId: string, field: keyof TravelRate, value: string) => {
    const rate = travelRates?.find(r => r.id === rateId);
    if (rate) {
      setEditingRates(prev => ({
        ...prev,
        [rateId]: { ...rate, ...(prev[rateId] || {}), [field]: parseFloat(value) || 0 }
      }));
    }
  };

  const saveRate = (rateId: string) => {
    const rate = editingRates[rateId];
    if (rate) {
      updateRateMutation.mutate(rate);
      setEditingRates(prev => {
        const newRates = { ...prev };
        delete newRates[rateId];
        return newRates;
      });
    }
  };

  const exportPDF = async (receipt: any) => {
    try {
      const { data: settings } = await supabase.from("school_settings").select("*").maybeSingle();
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      let yPos = 15;
      if (settings) {
        yPos = await addLetterheadToPDF(doc, {
          school_name: settings.school_name, district_name: settings.district_name,
          school_address: settings.school_address, school_phone: settings.school_phone,
          logo_url: settings.logo_url, right_logo_url: settings.right_logo_url,
          show_address: settings.show_address, show_phone: settings.show_phone,
        });
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`No TB : .......`, pageWidth - 20, yPos + 3, { align: "right" });

      yPos += 5;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("KWITANSI PEMBAYARAN", pageWidth / 2, yPos, { align: "center" });

      const leftMargin = 20;
      const colonX = 55;
      const valueX = 60;

      yPos += 10;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Sudah Diterima Dari", leftMargin, yPos);
      doc.text(":", colonX, yPos);
      doc.setFont("helvetica", "bold");
      doc.text(`Bendahara BOS ${settings?.school_name || ""}`, valueX, yPos);

      yPos += 8;
      doc.setFont("helvetica", "normal");
      doc.text("Banyaknya Uang", leftMargin, yPos);
      doc.text(":", colonX, yPos);
      doc.setFont("helvetica", "bolditalic");
      const amountTextLines = doc.splitTextToSize(receipt.amount_text, pageWidth - valueX - 15);
      doc.text(amountTextLines, valueX, yPos);
      yPos += (amountTextLines.length - 1) * 5;

      yPos += 8;
      doc.setFont("helvetica", "normal");
      doc.text("Untuk Pembayaran", leftMargin, yPos);
      doc.text(":", colonX, yPos);
      doc.setFont("helvetica", "italic");
      const descLines = doc.splitTextToSize(receipt.description, pageWidth - valueX - 15);
      doc.text(descLines, valueX, yPos);
      yPos += (descLines.length - 1) * 5;

      yPos += 10;
      doc.setFont("helvetica", "normal");
      doc.text("Terbilang", leftMargin, yPos + 5);
      doc.text(":", colonX, yPos + 5);

      const boxX = valueX;
      const boxWidth = pageWidth - valueX - 15;
      const boxHeight = 10;
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.rect(boxX, yPos, boxWidth, boxHeight);

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Rp", boxX + 3, yPos + 6);
      doc.text(`${Number(receipt.amount).toLocaleString('id-ID')},00`, boxX + boxWidth - 5, yPos + 6, { align: "right" });

      yPos += boxHeight + 8;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Informasi Potongan Pajak", leftMargin, yPos);

      const taxStartY = yPos + 5;
      const taxLabelX = leftMargin;
      const taxColonX = leftMargin + 25;
      const taxRpX = taxColonX + 5;
      const taxValueX = pageWidth - 50;

      doc.text("- PPh Pasal 23", taxLabelX, taxStartY);
      doc.text(":", taxColonX, taxStartY);
      doc.text("Rp", taxRpX, taxStartY);
      doc.text("-", taxValueX, taxStartY, { align: "right" });

      doc.text("- PPh Pasal 21", taxLabelX, taxStartY + 5);
      doc.text(":", taxColonX, taxStartY + 5);
      doc.text("Rp", taxRpX, taxStartY + 5);
      doc.text("-", taxValueX, taxStartY + 5, { align: "right" });

      doc.text("- PPN", taxLabelX, taxStartY + 10);
      doc.text(":", taxColonX, taxStartY + 10);
      doc.text("Rp", taxRpX, taxStartY + 10);
      doc.text("-", taxValueX, taxStartY + 10, { align: "right" });

      doc.setFont("helvetica", "bold");
      doc.text("Jumlah", taxLabelX, taxStartY + 15);
      doc.text(":", taxColonX, taxStartY + 15);
      doc.text("Rp", taxRpX, taxStartY + 15);
      doc.text("-", taxValueX, taxStartY + 15, { align: "right" });

      yPos = taxStartY + 30;
      const colWidth = (pageWidth - 40) / 3;
      const col1X = leftMargin + colWidth / 2;
      const col2X = leftMargin + colWidth + colWidth / 2;
      const col3X = leftMargin + colWidth * 2 + colWidth / 2;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      const sppdDate = receipt.official_travel_letters?.departure_date
        ? format(new Date(receipt.official_travel_letters.departure_date), "dd MMMM yyyy", { locale: idLocale })
        : format(new Date(receipt.receipt_date), "dd MMMM yyyy", { locale: idLocale });

      doc.text("Menyetujui", col1X, yPos, { align: "center" });
      doc.setFont("helvetica", "bolditalic");
      doc.text(`Lunas Dibayar, ${format(new Date(receipt.receipt_date), "dd MMMM yyyy", { locale: idLocale })}`, col2X, yPos, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.text(`Ciamis, ${sppdDate}`, col3X, yPos, { align: "center" });

      yPos += 5;
      doc.text(`Kepala ${settings?.school_name || "Sekolah"}`, col1X, yPos, { align: "center" });
      doc.text("Bendahara BOS", col2X, yPos, { align: "center" });
      doc.text("Penerima", col3X, yPos, { align: "center" });

      yPos += 25;
      doc.setFont("helvetica", "bold");
      doc.text(toTitleCase(settings?.headmaster_name) || "", col1X, yPos, { align: "center" });
      doc.text(toTitleCase(settings?.bendahara_name) || ".........................", col2X, yPos, { align: "center" });
      doc.text(toTitleCase(receipt.recipient_name), col3X, yPos, { align: "center" });

      yPos += 5;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      if (settings?.headmaster_nip) doc.text(`NIP. ${settings.headmaster_nip}`, col1X, yPos, { align: "center" });
      doc.text(settings?.bendahara_nip ? `NIP. ${settings.bendahara_nip}` : "NIP. .........................", col2X, yPos, { align: "center" });
      if (receipt.recipient_nip) doc.text(`NIP. ${receipt.recipient_nip}`, col3X, yPos, { align: "center" });

      doc.save(`Kwitansi-${receipt.receipt_number}.pdf`);
      toast.success("PDF berhasil diunduh");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Gagal membuat PDF");
    }
  };

  const exportCollectivePDF = async (receipt: any) => {
    try {
      const { data: settings } = await supabase.from("school_settings").select("*").maybeSingle();
      const teachers = await fetchSPPDTeachers(receipt.official_travel_letters?.id);
      const students = await fetchSPPDStudents(receipt.official_travel_letters?.id);

      const sppdData = receipt.official_travel_letters;
      const travelDays = sppdData?.departure_date && sppdData?.return_date
        ? calculateTravelDays(sppdData.departure_date, sppdData.return_date) : 1;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      let yPos = 15;
      if (settings) {
        yPos = await addLetterheadToPDF(doc, {
          school_name: settings.school_name, district_name: settings.district_name,
          school_address: settings.school_address, school_phone: settings.school_phone,
          logo_url: settings.logo_url, right_logo_url: settings.right_logo_url,
          show_address: settings.show_address, show_phone: settings.show_phone,
        });
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`No TB : .......`, pageWidth - 15, yPos + 3, { align: "right" });

      yPos += 5;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("KWITANSI KOLEKTIF", pageWidth / 2, yPos, { align: "center" });

      yPos += 5;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`No. ${receipt.receipt_number}`, pageWidth / 2, yPos, { align: "center" });

      const leftMargin = 15;
      const colonX = 50;
      const valueX = 55;

      yPos += 10;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Sudah Diterima Dari", leftMargin, yPos);
      doc.text(":", colonX, yPos);
      doc.setFont("helvetica", "bold");
      doc.text(`Bendahara BOS ${settings?.school_name || ""}`, valueX, yPos);

      yPos += 7;
      doc.setFont("helvetica", "normal");
      doc.text("Untuk Pembayaran", leftMargin, yPos);
      doc.text(":", colonX, yPos);
      doc.setFont("helvetica", "italic");
      const descLines = doc.splitTextToSize(receipt.description, pageWidth - valueX - 10);
      doc.text(descLines, valueX, yPos);
      yPos += (descLines.length - 1) * 4;

      yPos += 10;
      const colNo = leftMargin;
      const colName = leftMargin + 8;
      const colNameWidth = 50;
      const colNIP = leftMargin + 58;
      const colJabatan = leftMargin + 90;
      const colKelas = leftMargin + 110;
      const colHarga = leftMargin + 125;
      const colHari = leftMargin + 142;
      const colAmount = leftMargin + 155;
      const colTTD = pageWidth - 15;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);

      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.line(leftMargin, yPos - 3, pageWidth - 15, yPos - 3);

      doc.text("No", colNo, yPos);
      doc.text("Nama", colName, yPos);
      doc.text("NIP/NIS", colNIP, yPos);
      doc.text("Jabatan", colJabatan, yPos);
      doc.text("Kelas", colKelas, yPos);
      doc.text("Satuan", colHarga, yPos);
      doc.text("Hari", colHari, yPos);
      doc.text("Jumlah (Rp)", colAmount, yPos);
      doc.text("TTD", colTTD, yPos, { align: "right" });

      yPos += 2;
      doc.line(leftMargin, yPos, pageWidth - 15, yPos);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);

      let totalAmount = 0;
      let rowNumber = 0;

      const renderNameWithWrap = (name: string, maxWidth: number) => doc.splitTextToSize(name || "-", maxWidth);
      const nameMaxWidth = colNIP - colName - 2;

      teachers.forEach((teacher) => {
        const jabatan = teacher.jabatan || "Guru";
        const rate = travelRates?.find(r => r.position_type === jabatan);
        let dailyRate = 0;
        if (rate) {
          switch (receipt.payment_type) {
            case "transport": dailyRate = Number(rate.transport_rate); break;
            case "accommodation": dailyRate = Number(rate.accommodation_rate); break;
            case "meals": dailyRate = Number(rate.daily_rate); break;
          }
        }
        const amount = dailyRate * travelDays;

        rowNumber++;
        const nameLines = renderNameWithWrap(toTitleCase(teacher.full_name) || "-", nameMaxWidth);
        const rowHeight = Math.max(7, nameLines.length * 3.5);
        yPos += rowHeight;

        doc.text(`${rowNumber}`, colNo, yPos - (nameLines.length > 1 ? (nameLines.length - 1) * 1.75 : 0));
        nameLines.forEach((line: string, idx: number) => {
          doc.text(line, colName, yPos - (nameLines.length - 1 - idx) * 3.5);
        });
        doc.text(teacher.nip || "-", colNIP, yPos);
        doc.text(jabatan, colJabatan, yPos);
        doc.text("-", colKelas, yPos);
        doc.text(dailyRate.toLocaleString("id-ID"), colHarga, yPos);
        doc.text(`${travelDays}`, colHari, yPos);
        doc.text(amount.toLocaleString("id-ID"), colAmount, yPos);
        doc.rect(colTTD - 18, yPos - 5, 18, 6);
        totalAmount += amount;
      });

      students.forEach((student) => {
        const rate = travelRates?.find(r => r.position_type === "Siswa");
        let dailyRate = 0;
        if (rate) {
          switch (receipt.payment_type) {
            case "transport": dailyRate = Number(rate.transport_rate); break;
            case "accommodation": dailyRate = Number(rate.accommodation_rate); break;
            case "meals": dailyRate = Number(rate.daily_rate); break;
          }
        }
        const amount = dailyRate * travelDays;

        rowNumber++;
        const nameLines = renderNameWithWrap(toTitleCase(student.full_name) || "-", nameMaxWidth);
        const rowHeight = Math.max(7, nameLines.length * 3.5);
        yPos += rowHeight;

        doc.text(`${rowNumber}`, colNo, yPos - (nameLines.length > 1 ? (nameLines.length - 1) * 1.75 : 0));
        nameLines.forEach((line: string, idx: number) => {
          doc.text(line, colName, yPos - (nameLines.length - 1 - idx) * 3.5);
        });
        doc.text(student.nis || "-", colNIP, yPos);
        doc.text("Siswa", colJabatan, yPos);
        doc.text(student.class_name || "-", colKelas, yPos);
        doc.text(dailyRate.toLocaleString("id-ID"), colHarga, yPos);
        doc.text(`${travelDays}`, colHari, yPos);
        doc.text(amount.toLocaleString("id-ID"), colAmount, yPos);
        doc.rect(colTTD - 18, yPos - 5, 18, 6);
        totalAmount += amount;
      });

      yPos += 3;
      doc.line(leftMargin, yPos, pageWidth - 15, yPos);
      yPos += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("TOTAL", colJabatan, yPos);
      doc.text(totalAmount.toLocaleString("id-ID"), colAmount, yPos);
      yPos += 2;
      doc.line(leftMargin, yPos, pageWidth - 15, yPos);

      yPos += 10;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Terbilang:", leftMargin, yPos);
      doc.setFont("helvetica", "italic");
      const amountText = formatAmountToWords(totalAmount);
      const terbilangLines = doc.splitTextToSize(amountText, pageWidth - leftMargin - 30);
      doc.text(terbilangLines, leftMargin + 20, yPos);

      yPos += terbilangLines.length * 5 + 10;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Informasi Potongan Pajak:", leftMargin, yPos);
      doc.text("PPh 21: -   |   PPh 23: -   |   PPN: -   |   Jumlah Potongan: -", leftMargin + 35, yPos);

      yPos += 20;
      const col1X = leftMargin + 35;
      const col2X = pageWidth - leftMargin - 35;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      const sppdDate = receipt.official_travel_letters?.departure_date
        ? format(new Date(receipt.official_travel_letters.departure_date), "dd MMMM yyyy", { locale: idLocale })
        : format(new Date(receipt.receipt_date), "dd MMMM yyyy", { locale: idLocale });

      const receiptDate = format(new Date(receipt.receipt_date), "dd MMMM yyyy", { locale: idLocale });

      doc.text("Menyetujui,", col1X, yPos, { align: "center" });
      doc.text(`Ciamis, ${sppdDate}`, col2X, yPos, { align: "center" });

      yPos += 5;
      doc.text(`Kepala ${settings?.school_name || "Sekolah"}`, col1X, yPos, { align: "center" });
      doc.text("Bendahara BOS", col2X, yPos, { align: "center" });

      yPos += 4;
      doc.setFont("helvetica", "bolditalic");
      doc.text(`Lunas Dibayar Tanggal: ${receiptDate}`, col2X, yPos, { align: "center" });

      yPos += 20;
      doc.setFont("helvetica", "bold");
      doc.text(toTitleCase(settings?.headmaster_name) || "", col1X, yPos, { align: "center" });
      doc.text(toTitleCase(settings?.bendahara_name) || ".........................", col2X, yPos, { align: "center" });

      yPos += 4;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      if (settings?.headmaster_nip) doc.text(`NIP. ${settings.headmaster_nip}`, col1X, yPos, { align: "center" });
      doc.text(settings?.bendahara_nip ? `NIP. ${settings.bendahara_nip}` : "NIP. .........................", col2X, yPos, { align: "center" });

      doc.save(`Kwitansi-Kolektif-${receipt.receipt_number}.pdf`);
      toast.success("PDF Kwitansi Kolektif berhasil diunduh");
    } catch (error) {
      console.error("Error generating collective PDF:", error);
      toast.error("Gagal membuat PDF Kolektif");
    }
  };

  const previewCollectivePDF = async (receipt: any) => {
    try {
      const teachers = await fetchSPPDTeachers(receipt.official_travel_letters?.id);
      const students = await fetchSPPDStudents(receipt.official_travel_letters?.id);

      const sppdData = receipt.official_travel_letters;
      const travelDays = sppdData?.departure_date && sppdData?.return_date
        ? calculateTravelDays(sppdData.departure_date, sppdData.return_date) : 1;

      setPreviewReceipt(receipt);
      setPreviewTeachers(teachers);
      setPreviewStudents(students);
      setPreviewTravelDays(travelDays);
      setIsPreviewOpen(true);
    } catch (error) {
      console.error("Error preparing collective PDF preview:", error);
      toast.error("Gagal menyiapkan preview PDF Kolektif");
    }
  };

  const handlePreviewPDF = (receipt: any) => {
    const totalCount = (receipt.sppd_teacher_count || 0) + (receipt.sppd_student_count || 0);
    if (totalCount > 1) previewCollectivePDF(receipt);
    else {
      setPreviewReceipt(receipt);
      setPreviewTeachers([]);
      setPreviewStudents([]);
      setPreviewTravelDays(1);
      setIsPreviewOpen(true);
    }
  };

  const handleExportPDF = (receipt: any) => {
    const totalCount = (receipt.sppd_teacher_count || 0) + (receipt.sppd_student_count || 0);
    if (totalCount > 1) exportCollectivePDF(receipt);
    else exportPDF(receipt);
  };

  const filteredReceipts = receipts?.filter((receipt) => {
    const matchesSearch = receipt.receipt_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      receipt.recipient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      receipt.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      receipt.official_travel_letters?.letter_number?.toLowerCase().includes(searchQuery.toLowerCase());

    const receiptDate = new Date(receipt.receipt_date);
    const matchesStartDate = !startDateFilter || receiptDate >= startDateFilter;
    const matchesEndDate = !endDateFilter || receiptDate <= endDateFilter;

    let matchesMonth = true;
    if (monthFilter && monthFilter !== "all") {
      const [year, month] = monthFilter.split("-");
      matchesMonth = receiptDate.getFullYear() === parseInt(year) && (receiptDate.getMonth() + 1) === parseInt(month);
    }

    return matchesSearch && matchesStartDate && matchesEndDate && matchesMonth;
  });

  const filteredRkasBudget = rkasBudgetData?.filter((item) => {
    if (!monthFilter || monthFilter === "all") return true;
    const [year, month] = monthFilter.split("-");
    const rkasDoc = item.rkas_documents as { month: number; year: number; status: string };
    return rkasDoc.year === parseInt(year) && rkasDoc.month === parseInt(month);
  });

  const totalAnggaranRKAS = filteredRkasBudget?.reduce((sum, item) => sum + (Number(item.total_amount) || 0), 0) || 0;
  const totalRealisasiKwitansi = filteredReceipts?.reduce((sum, receipt) => sum + (Number(receipt.amount) || 0), 0) || 0;
  const selisih = totalAnggaranRKAS - totalRealisasiKwitansi;

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(new Date().getFullYear(), i, 1);
    return { value: format(date, "yyyy-MM"), label: format(date, "MMMM yyyy", { locale: idLocale }) };
  });

  const formatCurrency = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

  const getPaymentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      transport: "Transportasi", accommodation: "Akomodasi", meals: "Konsumsi", other: "Lainnya",
    };
    return labels[type] || type;
  };

  // ✅ Pagination
  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalItems,
    paginatedItems: paginatedReceipts,
  } = usePagination(filteredReceipts, 10);

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                <Receipt className="h-8 w-8" />
                Kwitansi
              </h1>
              <p className="text-muted-foreground">Kelola kwitansi pembayaran kegiatan SPPD</p>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="mr-2 h-4 w-4" />
                  Buat Kwitansi
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{isEditMode ? "Edit Kwitansi" : "Buat Kwitansi Baru"}</DialogTitle>
                  <DialogDescription>
                    {isEditMode ? "Ubah data kwitansi" : "Isi form di bawah untuk membuat kwitansi pembayaran"}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Pilih SPPD *</Label>
                      <SearchableSelect
                        options={
                          sppdList?.map((sppd) => ({
                            value: sppd.id,
                            label: sppd.letter_number,
                            description: `${sppd.purpose?.substring(0, 80) || ""} • ${sppd.destination || ""}`,
                            keywords: `${sppd.letter_number} ${sppd.purpose || ""} ${sppd.destination || ""}`,
                          })) || []
                        }
                        value={selectedSPPD}
                        onValueChange={handleSPPDChange}
                        placeholder="Pilih SPPD terkait..."
                        searchPlaceholder="Cari nomor SPPD / maksud / tujuan..."
                        emptyMessage="Tidak ada SPPD yang cocok."
                        disabled={isEditMode}
                        maxHeight="min(400px, 50vh)"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="receipt_number">Nomor Kwitansi *</Label>
                      <Input
                        id="receipt_number"
                        value={formData.receipt_number}
                        onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
                        placeholder="Contoh: KW/001/2024"
                        required
                      />
                    </div>
                  </div>

                  {selectedSPPD && selectedSPPDData && (
                    <div className="border rounded-lg p-3 bg-muted/30 text-sm space-y-1">
                      <p><span className="text-muted-foreground">Tujuan:</span> {selectedSPPDData.destination}</p>
                      <p><span className="text-muted-foreground">Tanggal:</span> {format(new Date(selectedSPPDData.departure_date), "dd/MM/yyyy")} - {format(new Date(selectedSPPDData.return_date), "dd/MM/yyyy")}</p>
                      <p><span className="text-muted-foreground">Jumlah Guru:</span> {sppdTeachersData.length} orang</p>
                      {sppdStudentsData.length > 0 && (
                        <p><span className="text-muted-foreground">Jumlah Siswa Pengikut:</span> {sppdStudentsData.length} orang</p>
                      )}
                      {(sppdTeachersData.length + sppdStudentsData.length) > 1 && <Badge variant="secondary">Kwitansi Kolektif</Badge>}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="payment_type">Jenis Pembayaran *</Label>
                    <Select value={formData.payment_type} onValueChange={handlePaymentTypeChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="transport">Transportasi</SelectItem>
                        <SelectItem value="accommodation">Akomodasi</SelectItem>
                        <SelectItem value="meals">Konsumsi / Uang Harian</SelectItem>
                        <SelectItem value="other">Lainnya</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedSPPD && autoData.recipient_name && (
                    <div className="border rounded-lg p-3 bg-primary/5 text-sm space-y-2">
                      <p className="font-medium text-primary">Data Otomatis dari SPPD:</p>
                      <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                        <p><span className="font-medium">Penerima:</span> {autoData.recipient_name}</p>
                        <p><span className="font-medium">NIP:</span> {autoData.recipient_nip || "-"}</p>
                        <p><span className="font-medium">Jabatan:</span> {autoData.recipient_position}</p>
                        <p><span className="font-medium">Tanggal:</span> {autoData.receipt_date ? format(new Date(autoData.receipt_date), "dd/MM/yyyy") : "-"}</p>
                      </div>
                      <div className="pt-2 border-t">
                        <p><span className="font-medium">Jumlah:</span> <span className="text-lg font-bold text-primary">Rp {Number(autoData.amount).toLocaleString("id-ID")}</span></p>
                        {autoData.amount && (
                          <p className="text-xs">Terbilang: {formatAmountToWords(parseFloat(autoData.amount) || 0)}</p>
                        )}
                      </div>
                      <p><span className="font-medium">Keterangan:</span> {autoData.description}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Batal
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || !selectedSPPD || !autoData.recipient_name}>
                      {(createMutation.isPending || updateMutation.isPending) ? "Menyimpan..." : isEditMode ? "Perbarui" : "Simpan"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Tabs defaultValue="receipts" className="w-full">
            <TabsList>
              <TabsTrigger value="receipts">
                <Receipt className="h-4 w-4 mr-2" />
                Daftar Kwitansi
              </TabsTrigger>
              <TabsTrigger value="rates">
                <Settings className="h-4 w-4 mr-2" />
                Tarif Perjalanan
              </TabsTrigger>
            </TabsList>

            <TabsContent value="receipts" className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Anggaran RKAS</CardTitle>
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">{formatCurrency(totalAnggaranRKAS)}</div>
                    <p className="text-xs text-muted-foreground">Transport & Perjalanan Dinas</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Realisasi Kwitansi</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRealisasiKwitansi)}</div>
                    <p className="text-xs text-muted-foreground">Total pembayaran kwitansi</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Selisih</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={cn("text-2xl font-bold", selisih >= 0 ? "text-blue-600" : "text-destructive")}>
                      {formatCurrency(selisih)}
                    </div>
                    <p className="text-xs text-muted-foreground">Anggaran - Realisasi</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Daftar Kwitansi</CardTitle>
                  <CardDescription>
                    Total: {filteredReceipts?.length || 0} kwitansi
                    {monthFilter && ` (${monthOptions.find(m => m.value === monthFilter)?.label})`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Cari berdasarkan nomor, penerima, atau keterangan..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Select value={monthFilter} onValueChange={setMonthFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Filter Bulan" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px] overflow-y-auto">
                          <SelectItem value="all">Semua Bulan</SelectItem>
                          {monthOptions.map((month) => (
                            <SelectItem key={month.value} value={month.value}>
                              {month.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      {(startDateFilter || endDateFilter || (monthFilter && monthFilter !== "all")) && (
                        <Button variant="ghost" size="icon" onClick={() => { setStartDateFilter(undefined); setEndDateFilter(undefined); setMonthFilter(""); }}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
                  ) : filteredReceipts && filteredReceipts.length > 0 ? (
                    <>
                      <div className="border rounded-md overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">No</TableHead>
                              <TableHead>No. Kwitansi</TableHead>
                              <TableHead>Tanggal</TableHead>
                              <TableHead>SPPD</TableHead>
                              <TableHead>Penerima</TableHead>
                              <TableHead>Jenis</TableHead>
                              <TableHead className="text-right">Anggaran SPD</TableHead>
                              <TableHead className="text-right">Jumlah</TableHead>
                              <TableHead className="text-center">SPJ</TableHead>
                              <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedReceipts.map((receipt, index) => {
                              const actualIndex = (currentPage - 1) * pageSize + index + 1;
                              return (
                                <TableRow key={receipt.id}>
                                  <TableCell>{actualIndex}</TableCell>
                                  <TableCell className="font-medium">{receipt.receipt_number}</TableCell>
                                  <TableCell>{format(new Date(receipt.receipt_date), "dd/MM/yyyy")}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-xs">
                                      {receipt.official_travel_letters?.letter_number || "-"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{receipt.recipient_name}</TableCell>
                                  <TableCell>
                                    <Badge variant="secondary" className="text-xs">
                                      {getPaymentTypeLabel(receipt.payment_type)}
                                    </Badge>
                                    {receipt.sppd_teacher_count > 1 && (
                                      <Badge variant="default" className="text-xs ml-1">
                                        Kolektif
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {receipt.official_travel_letters?.travel_budget || receipt.official_travel_letters?.accommodation_budget ? (
                                      <>Rp {Number((receipt.official_travel_letters?.travel_budget || 0) + (receipt.official_travel_letters?.accommodation_budget || 0)).toLocaleString('id-ID')}</>
                                    ) : (
                                      <span className="text-xs">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    Rp {Number(receipt.amount).toLocaleString('id-ID')}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      <Switch
                                        checked={receipt.is_spj || false}
                                        onCheckedChange={(checked) => toggleSpjMutation.mutate({ id: receipt.id, is_spj: checked })}
                                        disabled={toggleSpjMutation.isPending}
                                      />
                                      {receipt.is_spj && (
                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                      <Button variant="outline" size="icon" onClick={() => handleEdit(receipt)} title="Edit">
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button variant="secondary" size="icon" onClick={() => handlePreviewPDF(receipt)} title="Preview">
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button variant="default" size="icon" onClick={() => handleExportPDF(receipt)} title="Download">
                                        <FileDown className="h-4 w-4" />
                                      </Button>
                                      <Button variant="destructive" size="icon" onClick={() => handleDelete(receipt.id)} title="Hapus">
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
                      {searchQuery ? "Tidak ada kwitansi yang cocok dengan pencarian" : "Belum ada kwitansi"}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rates" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Pengaturan Tarif Perjalanan Dinas
                    </CardTitle>
                    <CardDescription>
                      Atur tarif pembayaran berdasarkan jenis jabatan.
                    </CardDescription>
                  </div>
                  <Dialog open={isAddPositionOpen} onOpenChange={setIsAddPositionOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Tambah Jabatan
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Tambah Jenis Jabatan Baru</DialogTitle>
                        <DialogDescription>Isi form di bawah untuk menambahkan jenis jabatan dan tarif baru</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="position_type">Nama Jabatan *</Label>
                          <Input
                            id="position_type"
                            value={newPosition.position_type}
                            onChange={(e) => setNewPosition(prev => ({ ...prev, position_type: e.target.value }))}
                            placeholder="Contoh: Staff, Pengawas, dll"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="daily_rate">Uang Harian (Rp)</Label>
                            <Input
                              id="daily_rate"
                              type="number"
                              value={newPosition.daily_rate}
                              onChange={(e) => setNewPosition(prev => ({ ...prev, daily_rate: e.target.value }))}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="transport_rate">Transportasi (Rp)</Label>
                            <Input
                              id="transport_rate"
                              type="number"
                              value={newPosition.transport_rate}
                              onChange={(e) => setNewPosition(prev => ({ ...prev, transport_rate: e.target.value }))}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="accommodation_rate">Akomodasi (Rp)</Label>
                            <Input
                              id="accommodation_rate"
                              type="number"
                              value={newPosition.accommodation_rate}
                              onChange={(e) => setNewPosition(prev => ({ ...prev, accommodation_rate: e.target.value }))}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={() => setIsAddPositionOpen(false)}>Batal</Button>
                          <Button
                            onClick={() => createPositionMutation.mutate(newPosition)}
                            disabled={createPositionMutation.isPending || !newPosition.position_type.trim()}
                          >
                            {createPositionMutation.isPending ? "Menyimpan..." : "Simpan"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {isLoadingRates ? (
                    <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
                  ) : travelRates && travelRates.length > 0 ? (
                    <div className="border rounded-md overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">No</TableHead>
                            <TableHead>Jabatan</TableHead>
                            <TableHead className="text-right">Uang Harian (Rp)</TableHead>
                            <TableHead className="text-right">Transportasi (Rp)</TableHead>
                            <TableHead className="text-right">Akomodasi (Rp)</TableHead>
                            <TableHead className="text-center w-32">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {travelRates.map((rate, index) => {
                            const isEditing = editingRates[rate.id];
                            const currentRate = isEditing || rate;
                            return (
                              <TableRow key={rate.id}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell className="font-medium">{rate.position_type}</TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    className="w-32 text-right ml-auto"
                                    value={currentRate.daily_rate}
                                    onChange={(e) => handleRateChange(rate.id, 'daily_rate', e.target.value)}
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    className="w-32 text-right ml-auto"
                                    value={currentRate.transport_rate}
                                    onChange={(e) => handleRateChange(rate.id, 'transport_rate', e.target.value)}
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    className="w-32 text-right ml-auto"
                                    value={currentRate.accommodation_rate}
                                    onChange={(e) => handleRateChange(rate.id, 'accommodation_rate', e.target.value)}
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex justify-center gap-2">
                                    {isEditing && (
                                      <Button size="sm" onClick={() => saveRate(rate.id)} disabled={updateRateMutation.isPending}>
                                        <Save className="h-4 w-4 mr-1" />
                                        Simpan
                                      </Button>
                                    )}
                                    <Button
                                      variant="destructive"
                                      size="icon"
                                      onClick={() => {
                                        if (confirm(`Yakin ingin menghapus jabatan "${rate.position_type}"?`)) {
                                          deletePositionMutation.mutate(rate.id);
                                        }
                                      }}
                                      disabled={deletePositionMutation.isPending}
                                      title="Hapus"
                                    >
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
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Belum ada data tarif. Klik "Tambah Jabatan" untuk menambahkan.
                    </div>
                  )}

                  <div className="mt-4 p-4 bg-muted/30 rounded-lg text-sm text-muted-foreground">
                    <p className="font-medium mb-2">Keterangan:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>Uang Harian:</strong> Tarif per hari untuk konsumsi/meals</li>
                      <li><strong>Transportasi:</strong> Tarif untuk biaya transportasi</li>
                      <li><strong>Akomodasi:</strong> Tarif untuk penginapan</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <ReceiptPreviewDialog
          open={isPreviewOpen}
          onOpenChange={setIsPreviewOpen}
          receipt={previewReceipt}
          teachers={previewTeachers}
          students={previewStudents}
          travelRates={travelRates}
          travelDays={previewTravelDays}
        />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
