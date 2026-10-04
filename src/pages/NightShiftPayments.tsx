import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  Plus, Trash2, CalendarIcon, Settings, FileDown, Pencil, CopyPlus,
  Users, Wallet, Receipt, Percent, ClipboardList, Eye, Moon
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import { numberToWords, formatCurrency, capitalizeFirst } from "@/lib/terbilang";
import { NightShiftReceiptPreview } from "@/components/night-shift/NightShiftReceiptPreview";
import { NightShiftAttendancePreview } from "@/components/night-shift/NightShiftAttendancePreview";
import type { NightShiftRate, NightShiftBatch, SchoolSettings, TaxType } from "@/types/nightShift";
import { TAX_TYPE_LABELS } from "@/types/nightShift";

interface TempWorker {
  id?: string;             // ada kalau dari DB (edit mode)
  worker_name: string;
  position_type: string;
  shift_count: number;
  nightly_rate: number;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
  notes: string;
}

const NightShiftPayments = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("batches");

  // Dialog states
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isWorkerDialogOpen, setIsWorkerDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<NightShiftRate | null>(null);
  const [editingBatch, setEditingBatch] = useState<NightShiftBatch | null>(null);
  const [editingWorkerIndex, setEditingWorkerIndex] = useState<number | null>(null);

  // Delete confirmation
  const [deleteBatchId, setDeleteBatchId] = useState<string | null>(null);
  const [deleteRateId, setDeleteRateId] = useState<string | null>(null);

  // Copy dialog state
  const [copyDialogBatch, setCopyDialogBatch] = useState<NightShiftBatch | null>(null);
  const [copyTargetMonth, setCopyTargetMonth] = useState<number>(new Date().getMonth() + 1);
  const [copyTargetYear, setCopyTargetYear] = useState<number>(new Date().getFullYear());

  // Preview states
  const [receiptPreviewBatch, setReceiptPreviewBatch] = useState<NightShiftBatch | null>(null);
  const [attendancePreviewBatch, setAttendancePreviewBatch] = useState<NightShiftBatch | null>(null);

  // Form states
  const [rateForm, setRateForm] = useState({ position_type: "", nightly_rate: 0, description: "" });
  const [batchForm, setBatchForm] = useState({
    job_title: "",
    description: "",
    receipt_date: new Date(),
    tax_rate: 0,
    tax_type: "pph21" as TaxType,
    shift_type: "malam",
  });
  const [workerForm, setWorkerForm] = useState({
    worker_name: "",
    position_type: "",
    shift_count: 1,
    notes: "",
  });
  const [tempWorkers, setTempWorkers] = useState<TempWorker[]>([]);

  // ============================================
  // QUERIES
  // ============================================
  const { data: rates = [] } = useQuery({
    queryKey: ["night-shift-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("night_shift_rates")
        .select("*")
        .order("nightly_rate", { ascending: false });
      if (error) throw error;
      return data as NightShiftRate[];
    },
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["night-shift-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("night_shift_batches")
        .select(`*, night_shift_payments(*)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as NightShiftBatch[];
    },
  });

  const { data: schoolSettings } = useQuery({
    queryKey: ["school-settings-night-shift"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as SchoolSettings | null;
    },
  });

  const { data: wakasekSarpras } = useQuery({
    queryKey: ["wakasek-sarpras-night-shift", schoolSettings?.wakasek_sarpras_teacher_id],
    queryFn: async () => {
      const wakasekId = schoolSettings?.wakasek_sarpras_teacher_id;
      if (!wakasekId) return null;

      const { data: teacherData, error: teacherError } = await supabase
        .from("teachers")
        .select("id, nip, jabatan, pangkat_golongan, user_id")
        .eq("id", wakasekId)
        .maybeSingle();

      if (teacherError) throw teacherError;
      if (!teacherData) return null;

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", teacherData.user_id)
        .maybeSingle();

      if (profileError) throw profileError;

      return { ...teacherData, full_name: profileData?.full_name || "" };
    },
    enabled: !!schoolSettings?.wakasek_sarpras_teacher_id,
  });

  // ============================================
  // MUTATIONS — RATES
  // ============================================
  const createRateMutation = useMutation({
    mutationFn: async (data: { position_type: string; nightly_rate: number; description: string }) => {
      const { error } = await supabase.from("night_shift_rates").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["night-shift-rates"] });
      toast.success("Tarif piket malam berhasil ditambahkan");
      setIsRateDialogOpen(false);
      setRateForm({ position_type: "", nightly_rate: 0, description: "" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateRateMutation = useMutation({
    mutationFn: async (data: { id: string; position_type: string; nightly_rate: number; description: string }) => {
      const { error } = await supabase
        .from("night_shift_rates")
        .update({
          position_type: data.position_type,
          nightly_rate: data.nightly_rate,
          description: data.description,
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["night-shift-rates"] });
      toast.success("Tarif piket malam berhasil diperbarui");
      setIsRateDialogOpen(false);
      setEditingRate(null);
      setRateForm({ position_type: "", nightly_rate: 0, description: "" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteRateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("night_shift_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["night-shift-rates"] });
      toast.success("Tarif piket malam berhasil dihapus");
      setDeleteRateId(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ============================================
  // MUTATIONS — BATCH (CREATE)
  // ============================================
  const createBatchMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not found");
      if (tempWorkers.length === 0) throw new Error("Tambahkan minimal 1 petugas piket");

      const total_gross = tempWorkers.reduce((sum, w) => sum + w.gross_amount, 0);
      const total_tax = tempWorkers.reduce((sum, w) => sum + w.tax_amount, 0);
      const total_net = tempWorkers.reduce((sum, w) => sum + w.net_amount, 0);

      const batch_number = `KPM-${format(new Date(), "yyyyMMdd")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const { data: batchData, error: batchError } = await supabase
        .from("night_shift_batches")
        .insert({
          batch_number,
          job_title: batchForm.job_title,
          description: batchForm.description || null,
          receipt_date: format(batchForm.receipt_date, "yyyy-MM-dd"),
          tax_rate: batchForm.tax_rate,
          tax_type: batchForm.tax_type,
          shift_type: batchForm.shift_type,
          total_gross,
          total_tax,
          total_net,
          created_by: user.id,
        })
        .select()
        .single();

      if (batchError) throw batchError;

      const today = format(new Date(), "yyyy-MM-dd");
      const workersToInsert = tempWorkers.map((w) => ({
        batch_id: batchData.id,
        worker_name: w.worker_name,
        position_type: w.position_type,
        start_date: today,
        end_date: today,
        shift_count: w.shift_count,
        nightly_rate: w.nightly_rate,
        gross_amount: w.gross_amount,
        tax_amount: w.tax_amount,
        net_amount: w.net_amount,
        notes: w.notes || null,
      }));

      const { error: workersError } = await supabase
        .from("night_shift_payments")
        .insert(workersToInsert);

      if (workersError) {
        await supabase.from("night_shift_batches").delete().eq("id", batchData.id);
        throw workersError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["night-shift-batches"] });
      toast.success("Kwitansi piket malam berhasil dibuat");
      closeBatchDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ============================================
  // MUTATIONS — BATCH (UPDATE)
  // ============================================
  const updateBatchMutation = useMutation({
    mutationFn: async () => {
      if (!editingBatch) throw new Error("No batch to update");
      if (tempWorkers.length === 0) throw new Error("Tambahkan minimal 1 petugas piket");

      const total_gross = tempWorkers.reduce((sum, w) => sum + w.gross_amount, 0);
      const total_tax = tempWorkers.reduce((sum, w) => sum + w.tax_amount, 0);
      const total_net = tempWorkers.reduce((sum, w) => sum + w.net_amount, 0);

      // 1. Update batch header
      const { error: batchError } = await supabase
        .from("night_shift_batches")
        .update({
          job_title: batchForm.job_title,
          description: batchForm.description || null,
          receipt_date: format(batchForm.receipt_date, "yyyy-MM-dd"),
          tax_rate: batchForm.tax_rate,
          tax_type: batchForm.tax_type,
          shift_type: batchForm.shift_type,
          total_gross,
          total_tax,
          total_net,
        })
        .eq("id", editingBatch.id);

      if (batchError) throw batchError;

      // 2. Delete semua worker lama, insert ulang
      const { error: deleteError } = await supabase
        .from("night_shift_payments")
        .delete()
        .eq("batch_id", editingBatch.id);

      if (deleteError) throw deleteError;

      const today = format(new Date(), "yyyy-MM-dd");
      const workersToInsert = tempWorkers.map((w) => ({
        batch_id: editingBatch.id,
        worker_name: w.worker_name,
        position_type: w.position_type,
        start_date: today,
        end_date: today,
        shift_count: w.shift_count,
        nightly_rate: w.nightly_rate,
        gross_amount: w.gross_amount,
        tax_amount: w.tax_amount,
        net_amount: w.net_amount,
        notes: w.notes || null,
      }));

      const { error: workersError } = await supabase
        .from("night_shift_payments")
        .insert(workersToInsert);

      if (workersError) throw workersError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["night-shift-batches"] });
      toast.success("Kwitansi berhasil diperbarui");
      closeBatchDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("night_shift_batches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["night-shift-batches"] });
      toast.success("Kwitansi berhasil dihapus");
      setDeleteBatchId(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ============================================
  // MUTATIONS — COPY BATCH
  // ============================================
  const copyBatchMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not found");
      if (!copyDialogBatch) throw new Error("Tidak ada kwitansi untuk disalin");

      const originalWorkers = copyDialogBatch.night_shift_payments || [];
      if (originalWorkers.length === 0) throw new Error("Kwitansi asal tidak memiliki petugas");

      // Tanggal baru berdasarkan bulan & tahun yang dipilih
      const targetDate = new Date(copyTargetYear, copyTargetMonth - 1, 1);
      const monthNames = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
      ];
      const monthName = monthNames[copyTargetMonth - 1];

      // Generate new batch_number
      const batch_number = `KPM-${format(new Date(), "yyyyMMdd")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      // Judul baru: replace bulan & tahun dalam judul asal
      let newTitle = copyDialogBatch.job_title;
      const monthRegex = /(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+\d{4}/i;
      if (monthRegex.test(newTitle)) {
        newTitle = newTitle.replace(monthRegex, `${monthName} ${copyTargetYear}`);
      } else {
        newTitle = `${newTitle} - ${monthName} ${copyTargetYear}`;
      }

      // Insert batch baru
      const { data: newBatch, error: batchError } = await supabase
        .from("night_shift_batches")
        .insert({
          batch_number,
          job_title: newTitle,
          description: copyDialogBatch.description,
          receipt_date: format(targetDate, "yyyy-MM-dd"),
          tax_rate: copyDialogBatch.tax_rate,
          tax_type: copyDialogBatch.tax_type,
          shift_type: copyDialogBatch.shift_type,
          total_gross: copyDialogBatch.total_gross,
          total_tax: copyDialogBatch.total_tax,
          total_net: copyDialogBatch.total_net,
          created_by: user.id,
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Insert semua worker
      const today = format(new Date(), "yyyy-MM-dd");
      const workersToInsert = originalWorkers.map((w) => ({
        batch_id: newBatch.id,
        worker_name: w.worker_name,
        position_type: w.position_type,
        start_date: today,
        end_date: today,
        shift_count: w.shift_count,
        nightly_rate: w.nightly_rate,
        gross_amount: w.gross_amount,
        tax_amount: w.tax_amount,
        net_amount: w.net_amount,
        notes: w.notes || null,
      }));

      const { error: workersError } = await supabase
        .from("night_shift_payments")
        .insert(workersToInsert);

      if (workersError) {
        await supabase.from("night_shift_batches").delete().eq("id", newBatch.id);
        throw workersError;
      }

      return { newBatchNumber: batch_number, newTitle };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["night-shift-batches"] });
      toast.success(`Kwitansi berhasil disalin menjadi "${data.newTitle}"`);
      setCopyDialogBatch(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });


  // ============================================
  // HELPERS
  // ============================================
  const resetBatchForm = () => {
    setBatchForm({
      job_title: "", description: "", receipt_date: new Date(),
      tax_rate: 0, tax_type: "pph21", shift_type: "malam",
    });
    setTempWorkers([]);
    setEditingBatch(null);
  };

  const closeBatchDialog = () => {
    setIsBatchDialogOpen(false);
    resetBatchForm();
  };

  const openCreateDialog = () => {
    resetBatchForm();
    setIsBatchDialogOpen(true);
  };

  const openEditDialog = (batch: NightShiftBatch) => {
    setEditingBatch(batch);
    setBatchForm({
      job_title: batch.job_title,
      description: batch.description || "",
      receipt_date: new Date(batch.receipt_date),
      tax_rate: batch.tax_rate,
      tax_type: (batch.tax_type || "pph21") as TaxType,
      shift_type: batch.shift_type || "malam",
    });

    // Convert night_shift_payments ke TempWorker
    const workers: TempWorker[] = (batch.night_shift_payments || []).map((w) => ({
      id: w.id,
      worker_name: w.worker_name,
      position_type: w.position_type,
      shift_count: w.shift_count,
      nightly_rate: w.nightly_rate,
      gross_amount: w.gross_amount,
      tax_amount: w.tax_amount,
      net_amount: w.net_amount,
      notes: w.notes || "",
    }));

    setTempWorkers(workers);
    setIsBatchDialogOpen(true);
  };

  const calculateWorkerPayment = () => {
    if (!workerForm.position_type || !workerForm.shift_count) return null;

    const rate = rates.find((r) => r.position_type === workerForm.position_type);
    if (!rate) return null;

    const shift_count = workerForm.shift_count;
    const nightly_rate = rate.nightly_rate;
    const gross_amount = shift_count * nightly_rate;
    const tax_amount = (gross_amount * batchForm.tax_rate) / 100;
    const net_amount = gross_amount - tax_amount;

    return { shift_count, nightly_rate, gross_amount, tax_amount, net_amount };
  };

  const addWorkerToList = () => {
    if (!workerForm.worker_name || !workerForm.position_type || !workerForm.shift_count) {
      toast.error("Lengkapi semua data petugas piket");
      return;
    }

    const calc = calculateWorkerPayment();
    if (!calc) {
      toast.error("Tidak dapat menghitung pembayaran");
      return;
    }

    if (editingWorkerIndex !== null) {
      // Mode edit — replace worker
      setTempWorkers((prev) => prev.map((w, i) =>
        i === editingWorkerIndex
          ? {
              ...w,
              worker_name: workerForm.worker_name,
              position_type: workerForm.position_type,
              shift_count: workerForm.shift_count,
              notes: workerForm.notes,
              ...calc,
            }
          : w
      ));
      toast.success("Data petugas diperbarui");
    } else {
      // Mode tambah baru
      setTempWorkers((prev) => [
        ...prev,
        {
          worker_name: workerForm.worker_name,
          position_type: workerForm.position_type,
          shift_count: workerForm.shift_count,
          notes: workerForm.notes,
          ...calc,
        },
      ]);
    }

    setWorkerForm({ worker_name: "", position_type: "", shift_count: 1, notes: "" });
    setEditingWorkerIndex(null);
    setIsWorkerDialogOpen(false);
  };

  const editWorkerInList = (index: number) => {
    const w = tempWorkers[index];
    setWorkerForm({
      worker_name: w.worker_name,
      position_type: w.position_type,
      shift_count: w.shift_count,
      notes: w.notes,
    });
    setEditingWorkerIndex(index);
    setIsWorkerDialogOpen(true);
  };

  const removeWorkerFromList = (index: number) => {
    setTempWorkers((prev) => prev.filter((_, i) => i !== index));
  };

  const getTaxLabel = (taxType: TaxType) => TAX_TYPE_LABELS[taxType] || "PPh 21";

  // ============================================
  // PDF EXPORT — KWITANSI
  // ============================================
  const exportPDF = async (batch: NightShiftBatch) => {
    const doc = new jsPDF();
    const workers = batch.night_shift_payments || [];
    const startY = await addLetterheadToPDF(doc, schoolSettings);

    let currentY = startY + 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("No TB : ........", 196, currentY, { align: "right" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("KWITANSI PEMBAYARAN PIKET MALAM", 105, currentY, { align: "center" });
    currentY += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Sudah Diterima Dari", 14, currentY);
    doc.text(":", 55, currentY);
    doc.setFont("helvetica", "bold");
    doc.text(`Bendahara BOS ${schoolSettings?.school_name || ""}`, 58, currentY);

    currentY += 6;
    doc.setFont("helvetica", "normal");
    doc.text("Untuk Pembayaran", 14, currentY);
    doc.text(":", 55, currentY);
    doc.setFont("helvetica", "italic");
    const paymentDesc = batch.description || batch.job_title;
    const splitPaymentDesc = doc.splitTextToSize(paymentDesc, 135);
    doc.text(splitPaymentDesc, 58, currentY);
    currentY += splitPaymentDesc.length * 5 + 5;

    const taxType = (batch.tax_type || "pph21") as TaxType;
    const taxLabel = getTaxLabel(taxType);

    const tableData = workers.map((w, i) => [
      (i + 1).toString(),
      w.worker_name,
      w.position_type,
      w.shift_count.toString(),
      `Rp ${formatCurrency(w.nightly_rate).replace("Rp", "").trim()}`,
      `Rp ${formatCurrency(w.gross_amount).replace("Rp", "").trim()}`,
      batch.tax_type === "none" ? "-" : (w.tax_amount > 0 ? `Rp ${formatCurrency(w.tax_amount).replace("Rp", "").trim()}` : "Rp 0"),
      `Rp ${formatCurrency(w.net_amount).replace("Rp", "").trim()}`,
      "",
    ]);

    tableData.push([
      "",
      "TOTAL",
      "",
      workers.reduce((sum, w) => sum + w.shift_count, 0).toString(),
      "",
      `Rp ${formatCurrency(batch.total_gross).replace("Rp", "").trim()}`,
      batch.tax_type === "none" ? "-" : `Rp ${formatCurrency(batch.total_tax).replace("Rp", "").trim()}`,
      `Rp ${formatCurrency(batch.total_net).replace("Rp", "").trim()}`,
      "",
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["No", "Nama Petugas", "Jabatan", "Hadir Piket", "Tarif/Malam", "Bruto", taxLabel, "Netto", "TTD"]],
      body: tableData,
      theme: "grid",
      margin: { left: 15 },
      tableWidth: 180,
      headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontSize: 8, halign: "center", fontStyle: "bold" },
      bodyStyles: { fontSize: 8, textColor: [0, 0, 0] },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 32 },
        2: { cellWidth: 22, halign: "center" },
        3: { cellWidth: 16, halign: "center" },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 20, halign: "right" },
        7: { cellWidth: 22, halign: "right" },
        8: { cellWidth: 16, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1 && data.section === "body") {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Terbilang:", 14, finalY);
    doc.setFont("helvetica", "italic");
    doc.text(`${capitalizeFirst(numberToWords(batch.total_gross))} rupiah`, 35, finalY);

    const taxInfoY = finalY + 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const taxInfo = batch.tax_type === "none"
      ? "Tidak ada potongan pajak"
      : `${taxLabel} (${batch.tax_rate}%): ${formatCurrency(batch.total_tax)}`;
    doc.text(`Informasi Potongan Pajak: ${taxInfo}`, 14, taxInfoY);

    const signY = taxInfoY + 18;
    const receiptDateFormatted = format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id });
    const city = schoolSettings?.city || "";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Kepala Sekolah
    const ksX = 55;
    doc.text("Menyetujui,", ksX, signY, { align: "center" });
    doc.text(`${schoolSettings?.headmaster_position || "Kepala"} ${schoolSettings?.school_name || "Sekolah"}`, ksX, signY + 5, { align: "center" });
    if (schoolSettings?.headmaster_name) {
      doc.setFont("helvetica", "bold");
      doc.text(schoolSettings.headmaster_name, ksX, signY + 30, { align: "center" });
      doc.setFont("helvetica", "normal");
      if (schoolSettings?.headmaster_nip) doc.text(`NIP. ${schoolSettings.headmaster_nip}`, ksX, signY + 35, { align: "center" });
    } else {
      doc.text("(___________________)", ksX, signY + 30, { align: "center" });
    }

    // Bendahara
    const bendaharaX = 155;
    doc.text(`${city ? city + ", " : ""}${receiptDateFormatted}`, bendaharaX, signY, { align: "center" });
    doc.text("Bendahara BOS", bendaharaX, signY + 5, { align: "center" });
    doc.setFontSize(9);
    doc.text(`Lunas Dibayar Tanggal: ${receiptDateFormatted}`, bendaharaX, signY + 11, { align: "center" });
    doc.setFontSize(10);
    if (schoolSettings?.bendahara_name) {
      doc.setFont("helvetica", "bold");
      doc.text(schoolSettings.bendahara_name, bendaharaX, signY + 30, { align: "center" });
      doc.setFont("helvetica", "normal");
      if (schoolSettings?.bendahara_nip) doc.text(`NIP. ${schoolSettings.bendahara_nip}`, bendaharaX, signY + 35, { align: "center" });
    } else {
      doc.text("(___________________)", bendaharaX, signY + 30, { align: "center" });
    }

    doc.save(`Kwitansi-Piket-Malam-${batch.batch_number}.pdf`);
  };

  // ============================================
  // PDF EXPORT — DAFTAR HADIR
  // ============================================
  const exportAttendancePDF = async (batch: NightShiftBatch) => {
    const doc = new jsPDF();
    const workers = batch.night_shift_payments || [];
    const startY = await addLetterheadToPDF(doc, schoolSettings);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("DAFTAR HADIR PETUGAS PIKET MALAM", 105, startY + 5, { align: "center" });
    doc.setFontSize(11);
    doc.text(batch.job_title.toUpperCase(), 105, startY + 12, { align: "center" });

    let infoY = startY + 22;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`No. Kwitansi: ${batch.batch_number}`, 14, infoY);
    doc.text(`Tanggal: ${format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id })}`, 14, infoY + 6);
    if (batch.description) {
      doc.text(`Keterangan: ${batch.description}`, 14, infoY + 12);
      infoY += 6;
    }

    const tableData = workers.map((w, i) => [
      (i + 1).toString(),
      w.worker_name,
      w.position_type,
      `${w.shift_count} malam`,
      "",
    ]);

    tableData.push([
      "",
      "TOTAL",
      "",
      `${workers.reduce((sum, w) => sum + w.shift_count, 0)} malam`,
      "",
    ]);

    autoTable(doc, {
      startY: infoY + 14,
      head: [["No", "Nama Petugas", "Jabatan", "Jumlah Hadir Piket", "Tanda Tangan"]],
      body: tableData,
      theme: "grid",
      margin: { left: 15 },
      tableWidth: 180,
      headStyles: { fillColor: [41, 128, 185], fontSize: 9, halign: "center", textColor: [255, 255, 255] },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 55 },
        2: { cellWidth: 40 },
        3: { cellWidth: 40, halign: "center" },
        4: { cellWidth: 33, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1 && data.section === "body") {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    const receiptDateFormatted = format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id });
    const city = schoolSettings?.city || "";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Wakasek Sarpras
    doc.text("Wakasek Sarana Prasarana,", 50, finalY, { align: "center" });
    if (wakasekSarpras?.full_name) {
      doc.setFont("helvetica", "bold");
      doc.text(wakasekSarpras.full_name, 50, finalY + 28, { align: "center" });
      doc.setFont("helvetica", "normal");
      if (wakasekSarpras.nip) doc.text(`NIP. ${wakasekSarpras.nip}`, 50, finalY + 33, { align: "center" });
    } else {
      doc.text("(___________________)", 50, finalY + 28, { align: "center" });
      doc.text("NIP. ___________________", 50, finalY + 33, { align: "center" });
    }

    // Kepala Sekolah
    doc.text(`${city ? city + ", " : ""}${receiptDateFormatted}`, 155, finalY - 8, { align: "center" });
    doc.text("Mengetahui,", 155, finalY, { align: "center" });
    doc.text(schoolSettings?.headmaster_position || "Kepala Sekolah", 155, finalY + 5, { align: "center" });
    if (schoolSettings?.headmaster_name) {
      doc.setFont("helvetica", "bold");
      doc.text(schoolSettings.headmaster_name, 155, finalY + 28, { align: "center" });
      doc.setFont("helvetica", "normal");
      if (schoolSettings?.headmaster_nip) doc.text(`NIP. ${schoolSettings.headmaster_nip}`, 155, finalY + 33, { align: "center" });
    } else {
      doc.text("(___________________)", 155, finalY + 28, { align: "center" });
    }

    doc.save(`Daftar-Hadir-Piket-Malam-${batch.batch_number}.pdf`);
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <ProtectedRoute allowedRoles={["bendahara", "admin"]}>
      <DashboardLayout>
        <div className="space-y-6 p-4 md:p-6">
          {/* Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-500/10 p-2">
                <Moon className="h-6 w-6 text-indigo-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Kwitansi Piket Malam</h1>
                <p className="text-muted-foreground">Kelola pembayaran upah petugas piket malam dan cetak kwitansi kolektif</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Receipt className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Kwitansi</p>
                    <p className="text-2xl font-bold">{batches.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-500/10 p-2">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Petugas</p>
                    <p className="text-2xl font-bold">
                      {batches.reduce((sum, b) => sum + (b.night_shift_payments?.length || 0), 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-green-500/10 p-2">
                    <Wallet className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Netto</p>
                    <p className="text-lg font-bold">
                      {formatCurrency(batches.reduce((sum, b) => sum + Number(b.total_net), 0))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-orange-500/10 p-2">
                    <Percent className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Pajak</p>
                    <p className="text-lg font-bold">
                      {formatCurrency(batches.reduce((sum, b) => sum + Number(b.total_tax), 0))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="batches">Daftar Kwitansi</TabsTrigger>
              <TabsTrigger value="rates">Pengaturan Tarif</TabsTrigger>
              <TabsTrigger value="attendance">Daftar Hadir</TabsTrigger>
            </TabsList>

            {/* Batches Tab */}
            <TabsContent value="batches" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={isBatchDialogOpen} onOpenChange={(open) => {
                  if (!open) closeBatchDialog();
                  else setIsBatchDialogOpen(true);
                }}>
                  <DialogTrigger asChild>
                    <Button onClick={openCreateDialog}>
                      <Plus className="mr-2 h-4 w-4" /> Buat Kwitansi
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {editingBatch ? `Edit Kwitansi: ${editingBatch.batch_number}` : "Buat Kwitansi Piket Malam"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Judul Pekerjaan *</Label>
                          <Input
                            value={batchForm.job_title}
                            onChange={(e) => setBatchForm({ ...batchForm, job_title: e.target.value })}
                            placeholder="Contoh: Piket Malam Bulan Januari 2025"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tanggal Kwitansi</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {format(batchForm.receipt_date, "dd MMMM yyyy", { locale: id })}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={batchForm.receipt_date}
                                onSelect={(date) => date && setBatchForm({ ...batchForm, receipt_date: date })}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-2">
                          <Label>Keterangan</Label>
                          <Input
                            value={batchForm.description}
                            onChange={(e) => setBatchForm({ ...batchForm, description: e.target.value })}
                            placeholder="Keterangan tambahan (opsional)"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Jenis Pajak</Label>
                          <Select
                            value={batchForm.tax_type}
                            onValueChange={(value: TaxType) => {
                              const newTaxRate = value === "none" ? 0 : batchForm.tax_rate;
                              setBatchForm((prev) => ({ ...prev, tax_type: value, tax_rate: newTaxRate }));
                              setTempWorkers((prev) => prev.map((w) => {
                                const tax_amount = (w.gross_amount * newTaxRate) / 100;
                                return { ...w, tax_amount, net_amount: w.gross_amount - tax_amount };
                              }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pph21">PPh 21 (PPh Karyawan)</SelectItem>
                              <SelectItem value="pph22">PPh 22 (PPh Badan)</SelectItem>
                              <SelectItem value="pph23">PPh 23 (Jasa)</SelectItem>
                              <SelectItem value="ppn">PPN</SelectItem>
                              <SelectItem value="none">Tanpa Pajak</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Tarif Pajak (%)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={batchForm.tax_rate}
                            disabled={batchForm.tax_type === "none"}
                            onChange={(e) => {
                              const newTaxRate = Number(e.target.value);
                              setBatchForm((prev) => ({ ...prev, tax_rate: newTaxRate }));
                              setTempWorkers((prev) => prev.map((w) => {
                                const tax_amount = (w.gross_amount * newTaxRate) / 100;
                                return { ...w, tax_amount, net_amount: w.gross_amount - tax_amount };
                              }));
                            }}
                          />
                        </div>
                      </div>

                      {/* Workers List */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">Daftar Petugas Piket</Label>
                          <Dialog open={isWorkerDialogOpen} onOpenChange={(open) => {
                            setIsWorkerDialogOpen(open);
                            if (!open) {
                              setEditingWorkerIndex(null);
                              setWorkerForm({ worker_name: "", position_type: "", shift_count: 1, notes: "" });
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => {
                                setEditingWorkerIndex(null);
                                setWorkerForm({ worker_name: "", position_type: "", shift_count: 1, notes: "" });
                              }}>
                                <Plus className="mr-2 h-4 w-4" /> Tambah Petugas
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>
                                  {editingWorkerIndex !== null ? "Edit Petugas Piket" : "Tambah Petugas Piket"}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label>Nama Petugas *</Label>
                                  <Input
                                    value={workerForm.worker_name}
                                    onChange={(e) => setWorkerForm({ ...workerForm, worker_name: e.target.value })}
                                    placeholder="Nama lengkap petugas"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Jabatan *</Label>
                                  <Select
                                    value={workerForm.position_type}
                                    onValueChange={(value) => setWorkerForm({ ...workerForm, position_type: value })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Pilih jabatan" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {rates.map((rate) => (
                                        <SelectItem key={rate.id} value={rate.position_type}>
                                          {rate.position_type} - {formatCurrency(rate.nightly_rate)}/malam
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Jumlah Hadir Piket *</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={workerForm.shift_count}
                                    onChange={(e) => setWorkerForm({ ...workerForm, shift_count: Number(e.target.value) })}
                                    placeholder="Contoh: 15"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Masukkan jumlah malam kehadiran piket
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  <Label>Catatan</Label>
                                  <Input
                                    value={workerForm.notes}
                                    onChange={(e) => setWorkerForm({ ...workerForm, notes: e.target.value })}
                                    placeholder="Catatan (opsional)"
                                  />
                                </div>

                                {calculateWorkerPayment() && (
                                  <Card className="bg-muted/50">
                                    <CardContent className="p-3 space-y-1 text-sm">
                                      <div className="flex justify-between">
                                        <span>Jumlah Hadir Piket:</span>
                                        <span className="font-medium">{calculateWorkerPayment()?.shift_count} malam</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Tarif/Malam:</span>
                                        <span className="font-medium">{formatCurrency(calculateWorkerPayment()?.nightly_rate || 0)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Bruto:</span>
                                        <span className="font-medium">{formatCurrency(calculateWorkerPayment()?.gross_amount || 0)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Pajak ({batchForm.tax_rate}% - {getTaxLabel(batchForm.tax_type)}):</span>
                                        <span className="font-medium text-destructive">
                                          -{formatCurrency(calculateWorkerPayment()?.tax_amount || 0)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between pt-2 border-t">
                                        <span className="font-semibold">Netto:</span>
                                        <span className="font-bold text-primary">{formatCurrency(calculateWorkerPayment()?.net_amount || 0)}</span>
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => {
                                  setIsWorkerDialogOpen(false);
                                  setEditingWorkerIndex(null);
                                  setWorkerForm({ worker_name: "", position_type: "", shift_count: 1, notes: "" });
                                }}>Batal</Button>
                                <Button onClick={addWorkerToList}>
                                  {editingWorkerIndex !== null ? "Simpan Perubahan" : "Tambah"}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>

                        {tempWorkers.length > 0 ? (
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Nama</TableHead>
                                  <TableHead>Jabatan</TableHead>
                                  <TableHead className="text-center">Hadir Piket</TableHead>
                                  <TableHead className="text-right">Netto</TableHead>
                                  <TableHead className="text-center">Aksi</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {tempWorkers.map((worker, index) => (
                                  <TableRow key={index}>
                                    <TableCell className="font-medium">{worker.worker_name}</TableCell>
                                    <TableCell>{worker.position_type}</TableCell>
                                    <TableCell className="text-center">{worker.shift_count}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(worker.net_amount)}</TableCell>
                                    <TableCell className="text-center">
                                      <div className="flex justify-center gap-1">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => editWorkerInList(index)}
                                          title="Edit petugas"
                                        >
                                          <Pencil className="h-4 w-4 text-blue-500" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => removeWorkerFromList(index)}
                                          title="Hapus petugas"
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-muted/50">
                                  <TableCell colSpan={3} className="font-semibold">Total</TableCell>
                                  <TableCell className="text-right font-bold text-primary">
                                    {formatCurrency(tempWorkers.reduce((sum, w) => sum + w.net_amount, 0))}
                                  </TableCell>
                                  <TableCell></TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
                            Belum ada petugas ditambahkan
                          </div>
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={closeBatchDialog}>Batal</Button>
                      <Button
                        onClick={() => {
                          if (editingBatch) updateBatchMutation.mutate();
                          else createBatchMutation.mutate();
                        }}
                        disabled={
                          !batchForm.job_title ||
                          tempWorkers.length === 0 ||
                          createBatchMutation.isPending ||
                          updateBatchMutation.isPending
                        }
                      >
                        {createBatchMutation.isPending || updateBatchMutation.isPending
                          ? "Menyimpan..."
                          : editingBatch
                            ? "Simpan Perubahan"
                            : "Simpan Kwitansi"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <CardContent className="p-0">
                  {batchesLoading ? (
                    <div className="p-8 text-center text-muted-foreground">Memuat data...</div>
                  ) : batches.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">Belum ada kwitansi</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>No. Kwitansi</TableHead>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Pekerjaan</TableHead>
                          <TableHead className="text-center">Petugas</TableHead>
                          <TableHead className="text-right">Total Netto</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batches.map((batch) => (
                          <TableRow key={batch.id}>
                            <TableCell className="font-mono text-sm">{batch.batch_number}</TableCell>
                            <TableCell>{format(new Date(batch.receipt_date), "dd MMM yyyy", { locale: id })}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{batch.job_title}</p>
                                {batch.description && <p className="text-sm text-muted-foreground">{batch.description}</p>}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{batch.night_shift_payments?.length || 0}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(Number(batch.total_net))}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => openEditDialog(batch)}
                                  title="Edit Kwitansi"
                                >
                                  <Pencil className="h-4 w-4 text-blue-500" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => setReceiptPreviewBatch(batch)} title="Preview Kwitansi">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => exportPDF(batch)} title="Download PDF">
                                  <FileDown className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteBatchId(batch.id)} title="Hapus">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Rates Tab */}
            <TabsContent value="rates" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Pengaturan Tarif Piket Malam
                    </CardTitle>
                    <CardDescription>Atur tarif per malam berdasarkan jabatan petugas</CardDescription>
                  </div>
                  <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => {
                        setEditingRate(null);
                        setRateForm({ position_type: "", nightly_rate: 0, description: "" });
                      }}>
                        <Plus className="mr-2 h-4 w-4" /> Tambah Tarif
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editingRate ? "Edit Tarif" : "Tambah Tarif Baru"}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Jabatan *</Label>
                          <Input
                            value={rateForm.position_type}
                            onChange={(e) => setRateForm({ ...rateForm, position_type: e.target.value })}
                            placeholder="Contoh: Koordinator Piket, Petugas Piket"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tarif per Malam (Rp) *</Label>
                          <Input
                            type="number"
                            value={rateForm.nightly_rate}
                            onChange={(e) => setRateForm({ ...rateForm, nightly_rate: Number(e.target.value) })}
                            placeholder="75000"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Deskripsi</Label>
                          <Input
                            value={rateForm.description}
                            onChange={(e) => setRateForm({ ...rateForm, description: e.target.value })}
                            placeholder="Deskripsi (opsional)"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRateDialogOpen(false)}>Batal</Button>
                        <Button
                          onClick={() => {
                            if (editingRate) updateRateMutation.mutate({ id: editingRate.id, ...rateForm });
                            else createRateMutation.mutate(rateForm);
                          }}
                          disabled={!rateForm.position_type || rateForm.nightly_rate <= 0}
                        >
                          {editingRate ? "Simpan Perubahan" : "Tambah"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {rates.length === 0 ? (
                    <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
                      Belum ada tarif piket malam. Tambahkan tarif untuk mulai membuat kwitansi.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Jabatan</TableHead>
                          <TableHead>Deskripsi</TableHead>
                          <TableHead className="text-right">Tarif per Malam</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rates.map((rate) => (
                          <TableRow key={rate.id}>
                            <TableCell className="font-medium">{rate.position_type}</TableCell>
                            <TableCell className="text-muted-foreground">{rate.description || "-"}</TableCell>
                            <TableCell className="text-right">{formatCurrency(rate.nightly_rate)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => {
                                    setEditingRate(rate);
                                    setRateForm({
                                      position_type: rate.position_type,
                                      nightly_rate: rate.nightly_rate,
                                      description: rate.description || "",
                                    });
                                    setIsRateDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteRateId(rate.id)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Attendance Tab */}
            <TabsContent value="attendance" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Daftar Hadir Petugas Piket Malam
                  </CardTitle>
                  <CardDescription>Cetak daftar hadir dari kwitansi yang telah dibuat</CardDescription>
                </CardHeader>
                <CardContent>
                  {batchesLoading ? (
                    <div className="p-8 text-center text-muted-foreground">Memuat data...</div>
                  ) : batches.length === 0 ? (
                    <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
                      Belum ada kwitansi. Buat kwitansi terlebih dahulu untuk generate daftar hadir.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>No. Kwitansi</TableHead>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Pekerjaan</TableHead>
                          <TableHead className="text-center">Jumlah Petugas</TableHead>
                          <TableHead className="text-center">Total Malam</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batches.map((batch) => {
                          const totalShifts = batch.night_shift_payments?.reduce((sum, w) => sum + w.shift_count, 0) || 0;
                          return (
                            <TableRow key={batch.id}>
                              <TableCell className="font-mono text-sm">{batch.batch_number}</TableCell>
                              <TableCell>{format(new Date(batch.receipt_date), "dd MMM yyyy", { locale: id })}</TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{batch.job_title}</p>
                                  {batch.description && <p className="text-sm text-muted-foreground">{batch.description}</p>}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">{batch.night_shift_payments?.length || 0}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">{totalShifts}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button variant="outline" size="sm" onClick={() => setAttendancePreviewBatch(batch)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Preview
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => exportAttendancePDF(batch)}>
                                    <FileDown className="mr-2 h-4 w-4" />
                                    Download
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Preview Dialogs */}
          <NightShiftReceiptPreview
            isOpen={!!receiptPreviewBatch}
            onClose={() => setReceiptPreviewBatch(null)}
            batch={receiptPreviewBatch}
            schoolSettings={schoolSettings}
            onDownload={() => {
              if (receiptPreviewBatch) {
                exportPDF(receiptPreviewBatch);
                setReceiptPreviewBatch(null);
              }
            }}
          />

          <NightShiftAttendancePreview
            isOpen={!!attendancePreviewBatch}
            onClose={() => setAttendancePreviewBatch(null)}
            batch={attendancePreviewBatch}
            schoolSettings={schoolSettings}
            wakasekSarpras={wakasekSarpras}
            onDownload={() => {
              if (attendancePreviewBatch) {
                exportAttendancePDF(attendancePreviewBatch);
                setAttendancePreviewBatch(null);
              }
            }}
          />

          {/* Delete Confirmations */}
          {/* ============================================ */}
          {/* COPY DIALOG                                   */}
          {/* ============================================ */}
          <Dialog open={!!copyDialogBatch} onOpenChange={(open) => !open && setCopyDialogBatch(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CopyPlus className="h-5 w-5 text-emerald-600" />
                  Salin Kwitansi ke Bulan Lain
                </DialogTitle>
              </DialogHeader>

              {copyDialogBatch && (
                <div className="space-y-4">
                  <Card className="bg-muted/50">
                    <CardContent className="p-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Kwitansi Asal:</span>
                        <span className="font-mono text-xs">{copyDialogBatch.batch_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Judul:</span>
                        <span className="font-medium text-right max-w-[200px] truncate">{copyDialogBatch.job_title}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Jumlah Petugas:</span>
                        <span className="font-medium">{copyDialogBatch.night_shift_payments?.length || 0} orang</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Netto:</span>
                        <span className="font-bold text-primary">
                          {formatCurrency(Number(copyDialogBatch.total_net))}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 grid-cols-2">
                    <div className="space-y-2">
                      <Label>Bulan Tujuan *</Label>
                      <Select
                        value={String(copyTargetMonth)}
                        onValueChange={(value) => setCopyTargetMonth(Number(value))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Januari</SelectItem>
                          <SelectItem value="2">Februari</SelectItem>
                          <SelectItem value="3">Maret</SelectItem>
                          <SelectItem value="4">April</SelectItem>
                          <SelectItem value="5">Mei</SelectItem>
                          <SelectItem value="6">Juni</SelectItem>
                          <SelectItem value="7">Juli</SelectItem>
                          <SelectItem value="8">Agustus</SelectItem>
                          <SelectItem value="9">September</SelectItem>
                          <SelectItem value="10">Oktober</SelectItem>
                          <SelectItem value="11">November</SelectItem>
                          <SelectItem value="12">Desember</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tahun Tujuan *</Label>
                      <Input
                        type="number"
                        min={2020}
                        max={2100}
                        value={copyTargetYear}
                        onChange={(e) => setCopyTargetYear(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-900 dark:text-emerald-100">
                    <p className="font-semibold mb-1">📋 Yang akan disalin:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>{copyDialogBatch.night_shift_payments?.length || 0} petugas + data lengkap</li>
                      <li>Jenis pajak & tarif pajak</li>
                      <li>Judul akan otomatis diubah ke bulan tujuan</li>
                    </ul>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setCopyDialogBatch(null)}>
                  Batal
                </Button>
                <Button
                  onClick={() => copyBatchMutation.mutate()}
                  disabled={copyBatchMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {copyBatchMutation.isPending ? "Menyalin..." : "Salin Kwitansi"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog open={!!deleteBatchId} onOpenChange={(open) => !open && setDeleteBatchId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus Kwitansi?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tindakan ini tidak dapat dibatalkan. Semua data petugas dalam kwitansi ini akan terhapus.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteBatchId && deleteBatchMutation.mutate(deleteBatchId)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Hapus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={!!deleteRateId} onOpenChange={(open) => !open && setDeleteRateId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus Tarif?</AlertDialogTitle>
                <AlertDialogDescription>Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteRateId && deleteRateMutation.mutate(deleteRateId)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Hapus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
};

export default NightShiftPayments;
