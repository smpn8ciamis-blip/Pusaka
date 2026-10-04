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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { id } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Plus, Trash2, CalendarIcon, Settings, FileDown, Pencil, Users, Wallet, Receipt, Percent, ClipboardList, Eye } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import { WorkerReceiptPreview } from "@/components/worker/WorkerReceiptPreview";
import { WorkerAttendancePreview } from "@/components/worker/WorkerAttendancePreview";

interface WorkerRate {
  id: string;
  position_type: string;
  daily_rate: number;
  created_at: string;
  updated_at: string;
}

interface WorkerPayment {
  id: string;
  batch_id: string;
  worker_name: string;
  position_type: string;
  start_date: string;
  end_date: string;
  work_days: number;
  daily_rate: number;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
  created_at: string;
}

interface WorkerPaymentBatch {
  id: string;
  batch_number: string;
  receipt_date: string;
  job_title: string;
  description: string | null;
  total_gross: number;
  total_tax: number;
  total_net: number;
  tax_rate: number;
  created_by: string;
  created_at: string;
  worker_payments?: WorkerPayment[];
}

const WorkerPayments = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("batches");
  
  // Dialog states
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isWorkerDialogOpen, setIsWorkerDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<WorkerRate | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<WorkerPaymentBatch | null>(null);
  
  // Preview states
  const [receiptPreviewBatch, setReceiptPreviewBatch] = useState<WorkerPaymentBatch | null>(null);
  const [attendancePreviewBatch, setAttendancePreviewBatch] = useState<WorkerPaymentBatch | null>(null);
  
  // Form states
  const [rateForm, setRateForm] = useState({ position_type: "", daily_rate: 0 });
  const [batchForm, setBatchForm] = useState({
    job_title: "",
    description: "",
    receipt_date: new Date(),
    tax_rate: 0,
  });
  const [workerForm, setWorkerForm] = useState({
    worker_name: "",
    position_type: "",
    start_date: null as Date | null,
    end_date: null as Date | null,
  });
  const [tempWorkers, setTempWorkers] = useState<{
    worker_name: string;
    position_type: string;
    start_date: Date;
    end_date: Date;
    work_days: number;
    daily_rate: number;
    gross_amount: number;
    tax_amount: number;
    net_amount: number;
  }[]>([]);

  // Fetch worker rates
  const { data: rates = [] } = useQuery({
    queryKey: ["worker-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_rates")
        .select("*")
        .order("daily_rate", { ascending: false });
      if (error) throw error;
      return data as WorkerRate[];
    },
  });

  // Fetch payment batches
  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["worker-payment-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_payment_batches")
        .select(`
          *,
          worker_payments(*)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WorkerPaymentBatch[];
    },
  });

  // Fetch school settings for PDF
  const { data: schoolSettings } = useQuery({
    queryKey: ["school-settings-worker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch Wakasek Sarpras data if set
  const { data: wakasekSarpras } = useQuery({
    queryKey: ["wakasek-sarpras", (schoolSettings as any)?.wakasek_sarpras_teacher_id],
    queryFn: async () => {
      const wakasekId = (schoolSettings as any)?.wakasek_sarpras_teacher_id;
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
      
      return {
        ...teacherData,
        full_name: profileData?.full_name || ""
      };
    },
    enabled: !!(schoolSettings as any)?.wakasek_sarpras_teacher_id,
  });

  // Rate mutations
  const createRateMutation = useMutation({
    mutationFn: async (data: { position_type: string; daily_rate: number }) => {
      const { error } = await supabase.from("worker_rates").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker-rates"] });
      toast.success("Tarif tukang berhasil ditambahkan");
      setIsRateDialogOpen(false);
      setRateForm({ position_type: "", daily_rate: 0 });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateRateMutation = useMutation({
    mutationFn: async (data: { id: string; position_type: string; daily_rate: number }) => {
      const { error } = await supabase
        .from("worker_rates")
        .update({ position_type: data.position_type, daily_rate: data.daily_rate })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker-rates"] });
      toast.success("Tarif tukang berhasil diperbarui");
      setIsRateDialogOpen(false);
      setEditingRate(null);
      setRateForm({ position_type: "", daily_rate: 0 });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteRateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("worker_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker-rates"] });
      toast.success("Tarif tukang berhasil dihapus");
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Batch mutation
  const createBatchMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not found");
      if (tempWorkers.length === 0) throw new Error("Tambahkan minimal 1 tukang");

      const total_gross = tempWorkers.reduce((sum, w) => sum + w.gross_amount, 0);
      const total_tax = tempWorkers.reduce((sum, w) => sum + w.tax_amount, 0);
      const total_net = tempWorkers.reduce((sum, w) => sum + w.net_amount, 0);
      
      const batch_number = `KWT-${format(new Date(), "yyyyMMdd")}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

      const { data: batchData, error: batchError } = await supabase
        .from("worker_payment_batches")
        .insert({
          batch_number,
          job_title: batchForm.job_title,
          description: batchForm.description || null,
          receipt_date: format(batchForm.receipt_date, "yyyy-MM-dd"),
          tax_rate: batchForm.tax_rate,
          total_gross,
          total_tax,
          total_net,
          created_by: user.id,
        })
        .select()
        .single();

      if (batchError) throw batchError;

      const workersToInsert = tempWorkers.map((w) => ({
        batch_id: batchData.id,
        worker_name: w.worker_name,
        position_type: w.position_type,
        start_date: format(w.start_date, "yyyy-MM-dd"),
        end_date: format(w.end_date, "yyyy-MM-dd"),
        work_days: w.work_days,
        daily_rate: w.daily_rate,
        gross_amount: w.gross_amount,
        tax_amount: w.tax_amount,
        net_amount: w.net_amount,
      }));

      const { error: workersError } = await supabase
        .from("worker_payments")
        .insert(workersToInsert);

      if (workersError) throw workersError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker-payment-batches"] });
      toast.success("Kwitansi upah tukang berhasil dibuat");
      setIsBatchDialogOpen(false);
      setBatchForm({ job_title: "", description: "", receipt_date: new Date(), tax_rate: 0 });
      setTempWorkers([]);
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Delete batch mutation
  const deleteBatchMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("worker_payment_batches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker-payment-batches"] });
      toast.success("Kwitansi berhasil dihapus");
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Helper functions
  const calculateWorkerPayment = () => {
    if (!workerForm.start_date || !workerForm.end_date || !workerForm.position_type) return null;
    
    const rate = rates.find((r) => r.position_type === workerForm.position_type);
    if (!rate) return null;

    const work_days = differenceInDays(workerForm.end_date, workerForm.start_date) + 1;
    const daily_rate = rate.daily_rate;
    const gross_amount = work_days * daily_rate;
    const tax_amount = (gross_amount * batchForm.tax_rate) / 100;
    const net_amount = gross_amount - tax_amount;

    return { work_days, daily_rate, gross_amount, tax_amount, net_amount };
  };

  const addWorkerToList = () => {
    if (!workerForm.worker_name || !workerForm.position_type || !workerForm.start_date || !workerForm.end_date) {
      toast.error("Lengkapi semua data tukang");
      return;
    }

    const calc = calculateWorkerPayment();
    if (!calc) {
      toast.error("Tidak dapat menghitung pembayaran");
      return;
    }

    setTempWorkers([...tempWorkers, {
      worker_name: workerForm.worker_name,
      position_type: workerForm.position_type,
      start_date: workerForm.start_date,
      end_date: workerForm.end_date,
      ...calc,
    }]);

    setWorkerForm({ worker_name: "", position_type: "", start_date: null, end_date: null });
    setIsWorkerDialogOpen(false);
  };

  const removeWorkerFromList = (index: number) => {
    setTempWorkers(tempWorkers.filter((_, i) => i !== index));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const numberToWords = (num: number): string => {
    const ones = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
    
    if (num < 12) return ones[num];
    if (num < 20) return ones[num - 10] + ' belas';
    if (num < 100) return ones[Math.floor(num / 10)] + ' puluh' + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 200) return 'seratus' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' ratus' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
    if (num < 2000) return 'seribu' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
    if (num < 1000000) return numberToWords(Math.floor(num / 1000)) + ' ribu' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
    if (num < 1000000000) return numberToWords(Math.floor(num / 1000000)) + ' juta' + (num % 1000000 ? ' ' + numberToWords(num % 1000000) : '');
    return numberToWords(Math.floor(num / 1000000000)) + ' miliar' + (num % 1000000000 ? ' ' + numberToWords(num % 1000000000) : '');
  };

  // PDF Export function
  const exportPDF = async (batch: WorkerPaymentBatch) => {
    const doc = new jsPDF();
    const workers = batch.worker_payments || [];
    
    // Add letterhead (kop surat)
    const startY = await addLetterheadToPDF(doc, schoolSettings);

    // Title and No TB on right
    let currentY = startY + 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("No TB : ........", 196, currentY, { align: "right" });
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("KWITANSI PEMBAYARAN TUKANG", 105, currentY, { align: "center" });
    currentY += 10;

    // Sudah Diterima Dari and Untuk Pembayaran
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Sudah Diterima Dari", 14, currentY);
    doc.text(":", 55, currentY);
    doc.setFont("helvetica", "bold");
    doc.text(`Bendahara BOS ${schoolSettings?.school_name || ''}`, 58, currentY);
    
    currentY += 6;
    doc.setFont("helvetica", "normal");
    doc.text("Untuk Pembayaran", 14, currentY);
    doc.text(":", 55, currentY);
    doc.setFont("helvetica", "italic");
    const paymentDesc = batch.description || batch.job_title;
    const splitPaymentDesc = doc.splitTextToSize(paymentDesc, 135);
    doc.text(splitPaymentDesc, 58, currentY);
    currentY += splitPaymentDesc.length * 5 + 5;

    // Workers table with new format matching reference image
    const tableData = workers.map((w, i) => {
      const startDate = format(new Date(w.start_date), "dd/MM/yy");
      const endDate = format(new Date(w.end_date), "dd/MM/yy");
      const periodeKerja = `${startDate} - ${endDate}`;
      
      return [
        (i + 1).toString(),
        w.worker_name,
        w.position_type,
        periodeKerja,
        w.work_days.toString(),
        `Rp ${formatCurrency(w.daily_rate).replace("Rp", "").trim()}`,
        `Rp ${formatCurrency(w.gross_amount).replace("Rp", "").trim()}`,
        w.tax_amount > 0 ? `Rp ${formatCurrency(w.tax_amount).replace("Rp", "").trim()}` : "Rp 0",
        `Rp ${formatCurrency(w.net_amount).replace("Rp", "").trim()}`,
        "", // Empty cell for signature
      ];
    });

    // Add TOTAL row
    tableData.push([
      "",
      "TOTAL",
      "",
      "",
      workers.reduce((sum, w) => sum + w.work_days, 0).toString(),
      "",
      `Rp ${formatCurrency(batch.total_gross).replace("Rp", "").trim()}`,
      `Rp ${formatCurrency(batch.total_tax).replace("Rp", "").trim()}`,
      `Rp ${formatCurrency(batch.total_net).replace("Rp", "").trim()}`,
      ""
    ]);

    // Calculate page width and center the table with better column widths
    const pageWidth = doc.internal.pageSize.getWidth();
    const tableWidth = 180; // Adjusted table width for better fit
    const marginLeft = (pageWidth - tableWidth) / 2;

    autoTable(doc, {
      startY: currentY,
      head: [["No", "Nama Tukang", "Jabatan", "Periode Kerja", "Hari", "Tarif/Hari", "Bruto", "Pajak", "Netto", "TTD"]],
      body: tableData,
      theme: "grid",
      margin: { left: marginLeft },
      tableWidth: tableWidth,
      headStyles: { 
        fillColor: [41, 128, 185], 
        textColor: [255, 255, 255], 
        fontSize: 8, 
        halign: "center", 
        fontStyle: "bold" 
      },
      bodyStyles: { fontSize: 8, textColor: [0, 0, 0] },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 28 },
        2: { cellWidth: 16, halign: "center" },
        3: { cellWidth: 28, halign: "center" },
        4: { cellWidth: 10, halign: "center" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 22, halign: "right" },
        7: { cellWidth: 15, halign: "right" },
        8: { cellWidth: 22, halign: "right" },
        9: { cellWidth: 18, halign: "center" },
      },
      didParseCell: function(data) {
        // Make TOTAL row bold
        if (data.row.index === tableData.length - 1 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // Terbilang
    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Terbilang:", 14, finalY);
    doc.setFont("helvetica", "italic");
    doc.text(`${numberToWords(batch.total_gross).charAt(0).toUpperCase() + numberToWords(batch.total_gross).slice(1)} rupiah`, 35, finalY);

    // Tax information line
    const taxInfoY = finalY + 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const pph21 = batch.tax_rate > 0 ? formatCurrency(batch.total_tax) : "-";
    doc.text(`Informasi Potongan Pajak: PPh 21: ${pph21}  |  PPh 23: -  |  PPN: -  |  Jumlah Potongan: ${batch.tax_rate > 0 ? formatCurrency(batch.total_tax) : "-"}`, 14, taxInfoY);

    // Signatures - Kepala Sekolah (left) and Bendahara (right)
    const signY = taxInfoY + 18;
    const receiptDateFormatted = format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Kepala Sekolah (left side) - centered at 55
    const ksX = 55;
    doc.text("Menyetujui,", ksX, signY, { align: "center" });
    doc.text(`Kepala ${schoolSettings?.school_name || 'Sekolah'}`, ksX, signY + 5, { align: "center" });
    if (schoolSettings?.headmaster_name) {
      doc.setFont("helvetica", "bold");
      doc.text(schoolSettings.headmaster_name, ksX, signY + 30, { align: "center" });
      doc.setFont("helvetica", "normal");
      if (schoolSettings?.headmaster_nip) {
        doc.text(`NIP. ${schoolSettings.headmaster_nip}`, ksX, signY + 35, { align: "center" });
      }
    } else {
      doc.text("(___________________)", ksX, signY + 30, { align: "center" });
    }

    // Bendahara (right side) - centered at 155
    const bendaharaX = 155;
    doc.text(`Ciamis, ${receiptDateFormatted}`, bendaharaX, signY, { align: "center" });
    doc.text("Bendahara BOS", bendaharaX, signY + 5, { align: "center" });
    doc.setFontSize(9);
    doc.text(`Lunas Dibayar Tanggal: ${receiptDateFormatted}`, bendaharaX, signY + 11, { align: "center" });
    doc.setFontSize(10);
    if (schoolSettings?.bendahara_name) {
      doc.setFont("helvetica", "bold");
      doc.text(schoolSettings.bendahara_name, bendaharaX, signY + 30, { align: "center" });
      doc.setFont("helvetica", "normal");
      if (schoolSettings?.bendahara_nip) {
        doc.text(`NIP. ${schoolSettings.bendahara_nip}`, bendaharaX, signY + 35, { align: "center" });
      }
    } else {
      doc.text("(___________________)", bendaharaX, signY + 30, { align: "center" });
    }

    doc.save(`Kwitansi-Tukang-${batch.batch_number}.pdf`);
  };

  // PDF Export Attendance List function
  const exportAttendancePDF = async (batch: WorkerPaymentBatch) => {
    const doc = new jsPDF();
    const workers = batch.worker_payments || [];
    
    // Add letterhead (kop surat)
    const startY = await addLetterheadToPDF(doc, schoolSettings);

    // Title
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("DAFTAR HADIR TUKANG", 105, startY + 5, { align: "center" });
    doc.setFontSize(11);
    doc.text(batch.job_title.toUpperCase(), 105, startY + 12, { align: "center" });

    // Batch info
    let infoY = startY + 22;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`No. Kwitansi: ${batch.batch_number}`, 14, infoY);
    doc.text(`Tanggal: ${format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id })}`, 14, infoY + 6);
    if (batch.description) {
      doc.text(`Keterangan: ${batch.description}`, 14, infoY + 12);
      infoY += 6;
    }

    // Get date range from workers
    const allDates: Date[] = [];
    workers.forEach(w => {
      const start = new Date(w.start_date);
      const end = new Date(w.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        allDates.push(new Date(d));
      }
    });
    
    // Get unique dates sorted
    const uniqueDates = Array.from(new Set(allDates.map(d => d.toISOString().split('T')[0])))
      .sort()
      .map(d => new Date(d));

    // Build table headers
    const dateHeaders = uniqueDates.map(d => format(d, "dd/MM"));
    const tableHead = ["No", "Nama Tukang", "Jabatan", ...dateHeaders, "Total\nHari"];

    // Build table data
    const tableData = workers.map((w, i) => {
      const workerStart = new Date(w.start_date);
      const workerEnd = new Date(w.end_date);
      
      const datePresence = uniqueDates.map(d => {
        if (d >= workerStart && d <= workerEnd) {
          return "✓";
        }
        return "";
      });

      return [
        (i + 1).toString(),
        w.worker_name,
        w.position_type,
        ...datePresence,
        w.work_days.toString(),
      ];
    });

    // Calculate column widths dynamically
    const fixedWidth = 8 + 35 + 25 + 15; // No, Nama, Jabatan, Total
    const dateColWidth = Math.min(12, (182 - fixedWidth) / Math.max(uniqueDates.length, 1));

    const columnStyles: { [key: number]: { cellWidth: number; halign?: "center" | "left" | "right" } } = {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 35 },
      2: { cellWidth: 25 },
    };
    
    uniqueDates.forEach((_, idx) => {
      columnStyles[3 + idx] = { cellWidth: dateColWidth, halign: "center" };
    });
    columnStyles[3 + uniqueDates.length] = { cellWidth: 15, halign: "center" };

    autoTable(doc, {
      startY: infoY + 14,
      head: [tableHead],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185], fontSize: 7, halign: "center" },
      bodyStyles: { fontSize: 7 },
      columnStyles,
    });

    // Signatures - Wakasek Sarpras and Kepala Sekolah
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    const receiptDateFormatted = format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Wakasek Sarpras (left side)
    doc.text("Wakasek Sarana Prasarana,", 50, finalY, { align: "center" });
    if (wakasekSarpras?.full_name) {
      doc.setFont("helvetica", "bold");
      doc.text(wakasekSarpras.full_name, 50, finalY + 28, { align: "center" });
      doc.setFont("helvetica", "normal");
      if (wakasekSarpras.nip) {
        doc.text(`NIP. ${wakasekSarpras.nip}`, 50, finalY + 33, { align: "center" });
      }
    } else {
      doc.text("(___________________)", 50, finalY + 28, { align: "center" });
      doc.text("NIP. ___________________", 50, finalY + 33, { align: "center" });
    }

    // Kepala Sekolah (right side)
    doc.text(`Ciamis, ${receiptDateFormatted}`, 155, finalY - 8, { align: "center" });
    doc.text("Mengetahui,", 155, finalY, { align: "center" });
    doc.text((schoolSettings as any)?.headmaster_position || "Kepala Sekolah", 155, finalY + 5, { align: "center" });
    if (schoolSettings?.headmaster_name) {
      doc.setFont("helvetica", "bold");
      doc.text(schoolSettings.headmaster_name, 155, finalY + 28, { align: "center" });
      doc.setFont("helvetica", "normal");
      if (schoolSettings?.headmaster_nip) {
        doc.text(`NIP. ${schoolSettings.headmaster_nip}`, 155, finalY + 33, { align: "center" });
      }
    } else {
      doc.text("(___________________)", 155, finalY + 28, { align: "center" });
    }

    doc.save(`Daftar-Hadir-Tukang-${batch.batch_number}.pdf`);
  };

  return (
    <ProtectedRoute allowedRoles={["bendahara", "admin"]}>
      <DashboardLayout>
        <div className="space-y-6 p-4 md:p-6">
          {/* Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Kwitansi Upah Tukang</h1>
              <p className="text-muted-foreground">Kelola pembayaran upah tukang dan cetak kwitansi kolektif</p>
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
                    <p className="text-sm text-muted-foreground">Total Tukang</p>
                    <p className="text-2xl font-bold">
                      {batches.reduce((sum, b) => sum + (b.worker_payments?.length || 0), 0)}
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
                <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => {
                      setBatchForm({ job_title: "", description: "", receipt_date: new Date(), tax_rate: 0 });
                      setTempWorkers([]);
                    }}>
                      <Plus className="mr-2 h-4 w-4" /> Buat Kwitansi
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Buat Kwitansi Upah Tukang</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      {/* Batch Form */}
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Judul Pekerjaan *</Label>
                          <Input
                            value={batchForm.job_title}
                            onChange={(e) => setBatchForm({ ...batchForm, job_title: e.target.value })}
                            placeholder="Contoh: Renovasi Ruang Kelas"
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
                          <Label>Tarif Pajak (%)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={batchForm.tax_rate}
                            onChange={(e) => {
                              const newTaxRate = Number(e.target.value);
                              setBatchForm({ ...batchForm, tax_rate: newTaxRate });
                              // Recalculate temp workers with new tax rate
                              setTempWorkers(tempWorkers.map(w => {
                                const tax_amount = (w.gross_amount * newTaxRate) / 100;
                                const net_amount = w.gross_amount - tax_amount;
                                return { ...w, tax_amount, net_amount };
                              }));
                            }}
                          />
                        </div>
                      </div>

                      {/* Workers List */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">Daftar Tukang</Label>
                          <Dialog open={isWorkerDialogOpen} onOpenChange={setIsWorkerDialogOpen}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Plus className="mr-2 h-4 w-4" /> Tambah Tukang
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Tambah Tukang</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label>Nama Tukang *</Label>
                                  <Input
                                    value={workerForm.worker_name}
                                    onChange={(e) => setWorkerForm({ ...workerForm, worker_name: e.target.value })}
                                    placeholder="Nama lengkap tukang"
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
                                          {rate.position_type} - {formatCurrency(rate.daily_rate)}/hari
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="grid gap-4 grid-cols-2">
                                  <div className="space-y-2">
                                    <Label>Tanggal Mulai *</Label>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start">
                                          <CalendarIcon className="mr-2 h-4 w-4" />
                                          {workerForm.start_date
                                            ? format(workerForm.start_date, "dd/MM/yyyy")
                                            : "Pilih tanggal"}
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0">
                                        <Calendar
                                          mode="single"
                                          selected={workerForm.start_date || undefined}
                                          onSelect={(date) => setWorkerForm({ ...workerForm, start_date: date || null })}
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Tanggal Selesai *</Label>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start">
                                          <CalendarIcon className="mr-2 h-4 w-4" />
                                          {workerForm.end_date
                                            ? format(workerForm.end_date, "dd/MM/yyyy")
                                            : "Pilih tanggal"}
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0">
                                        <Calendar
                                          mode="single"
                                          selected={workerForm.end_date || undefined}
                                          onSelect={(date) => setWorkerForm({ ...workerForm, end_date: date || null })}
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                </div>

                                {/* Preview calculation */}
                                {calculateWorkerPayment() && (
                                  <Card className="bg-muted/50">
                                    <CardContent className="p-3 space-y-1 text-sm">
                                      <div className="flex justify-between">
                                        <span>Hari Kerja:</span>
                                        <span className="font-medium">{calculateWorkerPayment()?.work_days} hari</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Tarif/Hari:</span>
                                        <span className="font-medium">{formatCurrency(calculateWorkerPayment()?.daily_rate || 0)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Bruto:</span>
                                        <span className="font-medium">{formatCurrency(calculateWorkerPayment()?.gross_amount || 0)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Pajak ({batchForm.tax_rate}%):</span>
                                        <span className="font-medium text-destructive">-{formatCurrency(calculateWorkerPayment()?.tax_amount || 0)}</span>
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
                                <Button variant="outline" onClick={() => setIsWorkerDialogOpen(false)}>Batal</Button>
                                <Button onClick={addWorkerToList}>Tambah</Button>
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
                                  <TableHead>Periode</TableHead>
                                  <TableHead className="text-center">Hari</TableHead>
                                  <TableHead className="text-right">Netto</TableHead>
                                  <TableHead></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {tempWorkers.map((worker, index) => (
                                  <TableRow key={index}>
                                    <TableCell className="font-medium">{worker.worker_name}</TableCell>
                                    <TableCell>{worker.position_type}</TableCell>
                                    <TableCell className="text-sm">
                                      {format(worker.start_date, "dd/MM")} - {format(worker.end_date, "dd/MM/yyyy")}
                                    </TableCell>
                                    <TableCell className="text-center">{worker.work_days}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(worker.net_amount)}</TableCell>
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeWorkerFromList(index)}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-muted/50">
                                  <TableCell colSpan={4} className="font-semibold">Total</TableCell>
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
                            Belum ada tukang ditambahkan
                          </div>
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsBatchDialogOpen(false)}>Batal</Button>
                      <Button 
                        onClick={() => createBatchMutation.mutate()}
                        disabled={!batchForm.job_title || tempWorkers.length === 0 || createBatchMutation.isPending}
                      >
                        {createBatchMutation.isPending ? "Menyimpan..." : "Simpan Kwitansi"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Batches List */}
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
                          <TableHead className="text-center">Tukang</TableHead>
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
                                {batch.description && (
                                  <p className="text-sm text-muted-foreground">{batch.description}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{batch.worker_payments?.length || 0}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(Number(batch.total_net))}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="outline" 
                                  size="icon" 
                                  onClick={() => setReceiptPreviewBatch(batch)}
                                  title="Preview Kwitansi"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="icon" 
                                  onClick={() => exportPDF(batch)}
                                  title="Download PDF"
                                >
                                  <FileDown className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteBatchMutation.mutate(batch.id)}
                                >
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
                      Pengaturan Tarif Tukang
                    </CardTitle>
                    <CardDescription>Atur tarif harian berdasarkan jabatan tukang</CardDescription>
                  </div>
                  <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => {
                        setEditingRate(null);
                        setRateForm({ position_type: "", daily_rate: 0 });
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
                            placeholder="Contoh: Kepala Tukang, Tukang, Kenek"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tarif per Hari (Rp) *</Label>
                          <Input
                            type="number"
                            value={rateForm.daily_rate}
                            onChange={(e) => setRateForm({ ...rateForm, daily_rate: Number(e.target.value) })}
                            placeholder="150000"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRateDialogOpen(false)}>Batal</Button>
                        <Button
                          onClick={() => {
                            if (editingRate) {
                              updateRateMutation.mutate({ id: editingRate.id, ...rateForm });
                            } else {
                              createRateMutation.mutate(rateForm);
                            }
                          }}
                          disabled={!rateForm.position_type || rateForm.daily_rate <= 0}
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
                      Belum ada tarif tukang. Tambahkan tarif untuk mulai membuat kwitansi.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Jabatan</TableHead>
                          <TableHead className="text-right">Tarif per Hari</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rates.map((rate) => (
                          <TableRow key={rate.id}>
                            <TableCell className="font-medium">{rate.position_type}</TableCell>
                            <TableCell className="text-right">{formatCurrency(rate.daily_rate)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => {
                                    setEditingRate(rate);
                                    setRateForm({ position_type: rate.position_type, daily_rate: rate.daily_rate });
                                    setIsRateDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteRateMutation.mutate(rate.id)}
                                >
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
                    Daftar Hadir Tukang
                  </CardTitle>
                  <CardDescription>
                    Cetak daftar hadir dari kwitansi yang telah dibuat
                  </CardDescription>
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
                          <TableHead className="text-center">Jumlah Tukang</TableHead>
                          <TableHead className="text-center">Total Hari</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batches.map((batch) => {
                          const totalDays = batch.worker_payments?.reduce((sum, w) => sum + w.work_days, 0) || 0;
                          return (
                            <TableRow key={batch.id}>
                              <TableCell className="font-mono text-sm">{batch.batch_number}</TableCell>
                              <TableCell>{format(new Date(batch.receipt_date), "dd MMM yyyy", { locale: id })}</TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{batch.job_title}</p>
                                  {batch.description && (
                                    <p className="text-sm text-muted-foreground">{batch.description}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">{batch.worker_payments?.length || 0}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">{totalDays}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setAttendancePreviewBatch(batch)}
                                  >
                                    <Eye className="mr-2 h-4 w-4" />
                                    Preview
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => exportAttendancePDF(batch)}
                                  >
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

          {/* Receipt Preview Dialog */}
          <WorkerReceiptPreview
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

          {/* Attendance Preview Dialog */}
          <WorkerAttendancePreview
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
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
};

export default WorkerPayments;
