#!/bin/bash
# =====================================================================
# AUTO-GENERATE FITUR KWITANSI PIKET MALAM
# Mirip struktur Kwitansi Upah Tukang (WorkerPayments)
# Jalankan dari root project: bash generate-night-shift-feature.sh
# =====================================================================

set -e

echo "🚀 Generating Night Shift Payment Feature..."
echo ""

# ============================================
# 1. CREATE DIRECTORIES
# ============================================
mkdir -p src/types
mkdir -p src/lib
mkdir -p src/components/night-shift
mkdir -p src/pages
mkdir -p supabase/migrations

echo "✅ Directories created"

# ============================================
# 2. TYPES
# ============================================
cat > src/types/nightShift.ts << 'EOF'
// ============================================
// Night Shift (Piket Malam) Types
// ============================================

export interface NightShiftRate {
  id: string;
  position_type: string;
  nightly_rate: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface NightShiftPayment {
  id: string;
  batch_id: string;
  worker_name: string;
  position_type: string;
  start_date: string;
  end_date: string;
  shift_count: number;
  nightly_rate: number;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
  notes: string | null;
  created_at: string;
}

export interface NightShiftBatch {
  id: string;
  batch_number: string;
  receipt_date: string;
  job_title: string;
  description: string | null;
  total_gross: number;
  total_tax: number;
  total_net: number;
  tax_rate: number;
  shift_type: string;
  created_by: string;
  created_at: string;
  night_shift_payments?: NightShiftPayment[];
}

export interface SchoolSettings {
  school_name?: string;
  school_address?: string;
  city?: string;
  headmaster_name?: string;
  headmaster_nip?: string;
  headmaster_position?: string;
  bendahara_name?: string;
  bendahara_nip?: string;
  wakasek_sarpras_teacher_id?: string;
}
EOF

echo "✅ Created: src/types/nightShift.ts"

# ============================================
# 3. SHARED UTILITY: terbilang.ts
# ============================================
cat > src/lib/terbilang.ts << 'EOF'
// ============================================
// Shared Utility: Number to Words (Terbilang)
// + Currency Formatter
// ============================================

export const numberToWords = (num: number): string => {
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

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);

export const capitalizeFirst = (str: string): string =>
  str.charAt(0).toUpperCase() + str.slice(1);
EOF

echo "✅ Created: src/lib/terbilang.ts"

# ============================================
# 4. RECEIPT PREVIEW COMPONENT
# ============================================
cat > src/components/night-shift/NightShiftReceiptPreview.tsx << 'EOF'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown, X } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { numberToWords, formatCurrency, capitalizeFirst } from "@/lib/terbilang";
import type { NightShiftBatch, SchoolSettings } from "@/types/nightShift";

interface NightShiftReceiptPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  batch: NightShiftBatch | null;
  schoolSettings: SchoolSettings | null;
  onDownload: () => void;
}

export function NightShiftReceiptPreview({
  isOpen,
  onClose,
  batch,
  schoolSettings,
  onDownload,
}: NightShiftReceiptPreviewProps) {
  if (!batch) return null;

  const workers = batch.night_shift_payments || [];
  const receiptDateFormatted = format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id });
  const paymentDesc = batch.description || batch.job_title;
  const pph21 = batch.tax_rate > 0 ? formatCurrency(batch.total_tax) : "-";
  const city = schoolSettings?.city || "";
  const headmasterTitle = schoolSettings?.headmaster_position
    ? `${schoolSettings.headmaster_position} ${schoolSettings.school_name || ""}`.trim()
    : `Kepala ${schoolSettings?.school_name || "Sekolah"}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Kwitansi Pembayaran Piket Malam</DialogTitle>
        </DialogHeader>

        <div className="bg-white text-black p-6 rounded-lg border space-y-4" style={{ fontFamily: "serif" }}>
          {/* Header */}
          <div className="flex justify-between items-start">
            <div></div>
            <div className="text-center flex-1">
              <h2 className="text-lg font-bold">KWITANSI PEMBAYARAN PIKET MALAM</h2>
            </div>
            <div className="text-right text-sm">No TB : ........</div>
          </div>

          {/* Info */}
          <div className="space-y-1 text-sm">
            <div className="flex">
              <span className="w-40">Sudah Diterima Dari</span>
              <span className="mr-2">:</span>
              <span className="font-bold">Bendahara BOS {schoolSettings?.school_name || ""}</span>
            </div>
            <div className="flex">
              <span className="w-40">Untuk Pembayaran</span>
              <span className="mr-2">:</span>
              <span className="italic">{paymentDesc}</span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="border border-gray-400 p-2 w-8">No</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "120px" }}>Nama Petugas</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "70px" }}>Jabatan</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "100px" }}>Periode Piket</th>
                  <th className="border border-gray-400 p-2 w-12">Malam</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "85px" }}>Tarif/Malam</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "85px" }}>Bruto</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "65px" }}>Pajak</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "85px" }}>Netto</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "50px" }}>TTD</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w, i) => {
                  const startDate = format(new Date(w.start_date), "dd/MM/yy");
                  const endDate = format(new Date(w.end_date), "dd/MM/yy");
                  return (
                    <tr key={w.id}>
                      <td className="border border-gray-400 p-2 text-center">{i + 1}</td>
                      <td className="border border-gray-400 p-2">{w.worker_name}</td>
                      <td className="border border-gray-400 p-2 text-center">{w.position_type}</td>
                      <td className="border border-gray-400 p-2 text-center">{startDate} - {endDate}</td>
                      <td className="border border-gray-400 p-2 text-center">{w.shift_count}</td>
                      <td className="border border-gray-400 p-2 text-right">{formatCurrency(w.nightly_rate)}</td>
                      <td className="border border-gray-400 p-2 text-right">{formatCurrency(w.gross_amount)}</td>
                      <td className="border border-gray-400 p-2 text-right">{w.tax_amount > 0 ? formatCurrency(w.tax_amount) : "Rp 0"}</td>
                      <td className="border border-gray-400 p-2 text-right">{formatCurrency(w.net_amount)}</td>
                      <td className="border border-gray-400 p-2"></td>
                    </tr>
                  );
                })}
                <tr className="font-bold">
                  <td className="border border-gray-400 p-2"></td>
                  <td className="border border-gray-400 p-2">TOTAL</td>
                  <td className="border border-gray-400 p-2"></td>
                  <td className="border border-gray-400 p-2"></td>
                  <td className="border border-gray-400 p-2 text-center">{workers.reduce((sum, w) => sum + w.shift_count, 0)}</td>
                  <td className="border border-gray-400 p-2"></td>
                  <td className="border border-gray-400 p-2 text-right">{formatCurrency(batch.total_gross)}</td>
                  <td className="border border-gray-400 p-2 text-right">{formatCurrency(batch.total_tax)}</td>
                  <td className="border border-gray-400 p-2 text-right">{formatCurrency(batch.total_net)}</td>
                  <td className="border border-gray-400 p-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Terbilang */}
          <div className="text-sm">
            <span className="font-medium">Terbilang: </span>
            <span className="italic">{capitalizeFirst(numberToWords(batch.total_gross))} rupiah</span>
          </div>

          {/* Tax Info */}
          <div className="text-xs text-gray-700">
            Informasi Potongan Pajak: PPh 21: {pph21} | PPh 23: - | PPN: - | Jumlah Potongan: {batch.tax_rate > 0 ? formatCurrency(batch.total_tax) : "-"}
          </div>

          {/* Signatures */}
          <div className="flex justify-between mt-8 text-sm">
            <div className="text-center">
              <p>Menyetujui,</p>
              <p>{headmasterTitle}</p>
              <div className="h-20"></div>
              <p className="font-bold">{schoolSettings?.headmaster_name || "(___________________)"}</p>
              {schoolSettings?.headmaster_nip && <p>NIP. {schoolSettings.headmaster_nip}</p>}
            </div>

            <div className="text-center">
              <p>{city ? `${city}, ` : ""}{receiptDateFormatted}</p>
              <p>Bendahara BOS</p>
              <p className="text-xs mt-1">Lunas Dibayar Tanggal: {receiptDateFormatted}</p>
              <div className="h-14"></div>
              <p className="font-bold">{schoolSettings?.bendahara_name || "(___________________)"}</p>
              {schoolSettings?.bendahara_nip && <p>NIP. {schoolSettings.bendahara_nip}</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="mr-2 h-4 w-4" /> Tutup
          </Button>
          <Button onClick={onDownload}>
            <FileDown className="mr-2 h-4 w-4" /> Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
EOF

echo "✅ Created: src/components/night-shift/NightShiftReceiptPreview.tsx"

# ============================================
# 5. ATTENDANCE PREVIEW COMPONENT
# ============================================
cat > src/components/night-shift/NightShiftAttendancePreview.tsx << 'EOF'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown, X } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import type { NightShiftBatch, SchoolSettings } from "@/types/nightShift";

interface WakasekSarpras {
  full_name: string;
  nip: string | null;
}

interface NightShiftAttendancePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  batch: NightShiftBatch | null;
  schoolSettings: SchoolSettings | null;
  wakasekSarpras: WakasekSarpras | null;
  onDownload: () => void;
}

export function NightShiftAttendancePreview({
  isOpen,
  onClose,
  batch,
  schoolSettings,
  wakasekSarpras,
  onDownload,
}: NightShiftAttendancePreviewProps) {
  if (!batch) return null;

  const workers = batch.night_shift_payments || [];
  const receiptDateFormatted = format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id });
  const city = schoolSettings?.city || "";

  // Get all unique dates
  const allDates: Date[] = [];
  workers.forEach((w) => {
    const start = new Date(w.start_date);
    const end = new Date(w.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      allDates.push(new Date(d));
    }
  });

  const uniqueDates = Array.from(new Set(allDates.map((d) => d.toISOString().split("T")[0])))
    .sort()
    .map((d) => new Date(d));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Daftar Hadir Petugas Piket Malam</DialogTitle>
        </DialogHeader>

        <div className="bg-white text-black p-6 rounded-lg border space-y-4" style={{ fontFamily: "serif" }}>
          <div className="text-center">
            <h2 className="text-lg font-bold">DAFTAR HADIR PETUGAS PIKET MALAM</h2>
            <p className="text-sm font-semibold uppercase mt-1">{batch.job_title}</p>
          </div>

          <div className="text-sm space-y-1">
            <p><span className="inline-block w-32">No. Kwitansi</span>: {batch.batch_number}</p>
            <p><span className="inline-block w-32">Tanggal</span>: {receiptDateFormatted}</p>
            {batch.description && (
              <p><span className="inline-block w-32">Keterangan</span>: {batch.description}</p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="border border-gray-400 p-1 w-8">No</th>
                  <th className="border border-gray-400 p-1" style={{ minWidth: "120px" }}>Nama Petugas</th>
                  <th className="border border-gray-400 p-1" style={{ minWidth: "80px" }}>Jabatan</th>
                  {uniqueDates.map((d, i) => (
                    <th key={i} className="border border-gray-400 p-1 text-center" style={{ minWidth: "35px" }}>
                      {format(d, "dd/MM")}
                    </th>
                  ))}
                  <th className="border border-gray-400 p-1 text-center" style={{ minWidth: "50px" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w, i) => {
                  const workerStart = new Date(w.start_date);
                  const workerEnd = new Date(w.end_date);
                  return (
                    <tr key={w.id}>
                      <td className="border border-gray-400 p-1 text-center">{i + 1}</td>
                      <td className="border border-gray-400 p-1">{w.worker_name}</td>
                      <td className="border border-gray-400 p-1 text-center">{w.position_type}</td>
                      {uniqueDates.map((d, idx) => (
                        <td key={idx} className="border border-gray-400 p-1 text-center">
                          {d >= workerStart && d <= workerEnd ? "✓" : ""}
                        </td>
                      ))}
                      <td className="border border-gray-400 p-1 text-center font-bold">{w.shift_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-8 text-sm">
            <div className="text-center">
              <p>Wakasek Sarana Prasarana,</p>
              <div className="h-20"></div>
              <p className="font-bold">{wakasekSarpras?.full_name || "(___________________)"}</p>
              <p>NIP. {wakasekSarpras?.nip || "___________________"}</p>
            </div>

            <div className="text-center">
              <p>{city ? `${city}, ` : ""}{receiptDateFormatted}</p>
              <p>Mengetahui,</p>
              <p>{schoolSettings?.headmaster_position || "Kepala Sekolah"}</p>
              <div className="h-14"></div>
              <p className="font-bold">{schoolSettings?.headmaster_name || "(___________________)"}</p>
              {schoolSettings?.headmaster_nip && <p>NIP. {schoolSettings.headmaster_nip}</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="mr-2 h-4 w-4" /> Tutup
          </Button>
          <Button onClick={onDownload}>
            <FileDown className="mr-2 h-4 w-4" /> Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
EOF

echo "✅ Created: src/components/night-shift/NightShiftAttendancePreview.tsx"

# ============================================
# 6. MAIN PAGE
# ============================================
cat > src/pages/NightShiftPayments.tsx << 'PAGE_EOF'
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
import { format, differenceInDays } from "date-fns";
import { id } from "date-fns/locale";
import {
  Plus, Trash2, CalendarIcon, Settings, FileDown, Pencil,
  Users, Wallet, Receipt, Percent, ClipboardList, Eye, Moon
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import { numberToWords, formatCurrency, capitalizeFirst } from "@/lib/terbilang";
import { NightShiftReceiptPreview } from "@/components/night-shift/NightShiftReceiptPreview";
import { NightShiftAttendancePreview } from "@/components/night-shift/NightShiftAttendancePreview";
import type { NightShiftRate, NightShiftBatch, SchoolSettings } from "@/types/nightShift";

const NightShiftPayments = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("batches");

  // Dialog states
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isWorkerDialogOpen, setIsWorkerDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<NightShiftRate | null>(null);

  // Delete confirmation
  const [deleteBatchId, setDeleteBatchId] = useState<string | null>(null);
  const [deleteRateId, setDeleteRateId] = useState<string | null>(null);

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
    shift_type: "malam",
  });
  const [workerForm, setWorkerForm] = useState({
    worker_name: "",
    position_type: "",
    start_date: null as Date | null,
    end_date: null as Date | null,
    notes: "",
  });
  const [tempWorkers, setTempWorkers] = useState<{
    worker_name: string;
    position_type: string;
    start_date: Date;
    end_date: Date;
    shift_count: number;
    nightly_rate: number;
    gross_amount: number;
    tax_amount: number;
    net_amount: number;
    notes: string;
  }[]>([]);

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
  // MUTATIONS — BATCH
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
          shift_type: batchForm.shift_type,
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
      setIsBatchDialogOpen(false);
      setBatchForm({ job_title: "", description: "", receipt_date: new Date(), tax_rate: 0, shift_type: "malam" });
      setTempWorkers([]);
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
  // HELPERS
  // ============================================
  const calculateWorkerPayment = () => {
    if (!workerForm.start_date || !workerForm.end_date || !workerForm.position_type) return null;
    const rate = rates.find((r) => r.position_type === workerForm.position_type);
    if (!rate) return null;

    const shift_count = differenceInDays(workerForm.end_date, workerForm.start_date) + 1;
    const nightly_rate = rate.nightly_rate;
    const gross_amount = shift_count * nightly_rate;
    const tax_amount = (gross_amount * batchForm.tax_rate) / 100;
    const net_amount = gross_amount - tax_amount;

    return { shift_count, nightly_rate, gross_amount, tax_amount, net_amount };
  };

  const addWorkerToList = () => {
    if (!workerForm.worker_name || !workerForm.position_type || !workerForm.start_date || !workerForm.end_date) {
      toast.error("Lengkapi semua data petugas piket");
      return;
    }
    const calc = calculateWorkerPayment();
    if (!calc) {
      toast.error("Tidak dapat menghitung pembayaran");
      return;
    }
    setTempWorkers((prev) => [
      ...prev,
      {
        worker_name: workerForm.worker_name,
        position_type: workerForm.position_type,
        start_date: workerForm.start_date!,
        end_date: workerForm.end_date!,
        notes: workerForm.notes,
        ...calc,
      },
    ]);
    setWorkerForm({ worker_name: "", position_type: "", start_date: null, end_date: null, notes: "" });
    setIsWorkerDialogOpen(false);
  };

  const removeWorkerFromList = (index: number) => {
    setTempWorkers((prev) => prev.filter((_, i) => i !== index));
  };

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

    const tableData = workers.map((w, i) => {
      const startDate = format(new Date(w.start_date), "dd/MM/yy");
      const endDate = format(new Date(w.end_date), "dd/MM/yy");
      return [
        (i + 1).toString(),
        w.worker_name,
        w.position_type,
        `${startDate} - ${endDate}`,
        w.shift_count.toString(),
        `Rp ${formatCurrency(w.nightly_rate).replace("Rp", "").trim()}`,
        `Rp ${formatCurrency(w.gross_amount).replace("Rp", "").trim()}`,
        w.tax_amount > 0 ? `Rp ${formatCurrency(w.tax_amount).replace("Rp", "").trim()}` : "Rp 0",
        `Rp ${formatCurrency(w.net_amount).replace("Rp", "").trim()}`,
        "",
      ];
    });

    tableData.push([
      "", "TOTAL", "", "",
      workers.reduce((sum, w) => sum + w.shift_count, 0).toString(),
      "",
      `Rp ${formatCurrency(batch.total_gross).replace("Rp", "").trim()}`,
      `Rp ${formatCurrency(batch.total_tax).replace("Rp", "").trim()}`,
      `Rp ${formatCurrency(batch.total_net).replace("Rp", "").trim()}`,
      "",
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["No", "Nama Petugas", "Jabatan", "Periode Piket", "Malam", "Tarif/Malam", "Bruto", "Pajak", "Netto", "TTD"]],
      body: tableData,
      theme: "grid",
      margin: { left: 15 },
      tableWidth: 180,
      headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontSize: 8, halign: "center", fontStyle: "bold" },
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
    const pph21 = batch.tax_rate > 0 ? formatCurrency(batch.total_tax) : "-";
    doc.text(
      `Informasi Potongan Pajak: PPh 21: ${pph21}  |  PPh 23: -  |  PPN: -  |  Jumlah Potongan: ${batch.tax_rate > 0 ? formatCurrency(batch.total_tax) : "-"}`,
      14, taxInfoY
    );

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

    const allDates: Date[] = [];
    workers.forEach((w) => {
      const start = new Date(w.start_date);
      const end = new Date(w.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) allDates.push(new Date(d));
    });

    const uniqueDates = Array.from(new Set(allDates.map((d) => d.toISOString().split("T")[0])))
      .sort().map((d) => new Date(d));

    const dateHeaders = uniqueDates.map((d) => format(d, "dd/MM"));
    const tableHead = ["No", "Nama Petugas", "Jabatan", ...dateHeaders, "Total\nMalam"];

    const tableData = workers.map((w, i) => {
      const workerStart = new Date(w.start_date);
      const workerEnd = new Date(w.end_date);
      const datePresence = uniqueDates.map((d) => (d >= workerStart && d <= workerEnd ? "✓" : ""));
      return [(i + 1).toString(), w.worker_name, w.position_type, ...datePresence, w.shift_count.toString()];
    });

    const fixedWidth = 8 + 35 + 25 + 15;
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

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    const receiptDateFormatted = format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id });
    const city = schoolSettings?.city || "";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    // Wakasek Sarpras (left)
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

    // Kepala Sekolah (right)
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
                <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => {
                      setBatchForm({ job_title: "", description: "", receipt_date: new Date(), tax_rate: 0, shift_type: "malam" });
                      setTempWorkers([]);
                    }}>
                      <Plus className="mr-2 h-4 w-4" /> Buat Kwitansi
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Buat Kwitansi Piket Malam</DialogTitle>
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
                          <Label>Tarif Pajak (%)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={batchForm.tax_rate}
                            onChange={(e) => {
                              const newTaxRate = Number(e.target.value);
                              setBatchForm({ ...batchForm, tax_rate: newTaxRate });
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
                          <Dialog open={isWorkerDialogOpen} onOpenChange={setIsWorkerDialogOpen}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Plus className="mr-2 h-4 w-4" /> Tambah Petugas
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Tambah Petugas Piket</DialogTitle>
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
                                <div className="grid gap-4 grid-cols-2">
                                  <div className="space-y-2">
                                    <Label>Tanggal Mulai *</Label>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start">
                                          <CalendarIcon className="mr-2 h-4 w-4" />
                                          {workerForm.start_date ? format(workerForm.start_date, "dd/MM/yyyy") : "Pilih tanggal"}
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
                                          {workerForm.end_date ? format(workerForm.end_date, "dd/MM/yyyy") : "Pilih tanggal"}
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
                                        <span>Jumlah Malam:</span>
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
                                  <TableHead className="text-center">Malam</TableHead>
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
                                    <TableCell className="text-center">{worker.shift_count}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(worker.net_amount)}</TableCell>
                                    <TableCell>
                                      <Button variant="ghost" size="icon" onClick={() => removeWorkerFromList(index)}>
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
                            Belum ada petugas ditambahkan
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
                                <Button variant="outline" size="icon" onClick={() => setReceiptPreviewBatch(batch)} title="Preview Kwitansi">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => exportPDF(batch)} title="Download PDF">
                                  <FileDown className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteBatchId(batch.id)}>
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
                <AlertDialogDescription>
                  Tindakan ini tidak dapat dibatalkan.
                </AlertDialogDescription>
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
PAGE_EOF

echo "✅ Created: src/pages/NightShiftPayments.tsx"

# ============================================
# 7. SQL MIGRATION
# ============================================
TIMESTAMP=$(date +%Y%m%d%H%M%S)
MIGRATION_FILE="supabase/migrations/${TIMESTAMP}_night_shift_payments.sql"

cat > "$MIGRATION_FILE" << 'EOF'
-- ============================================
-- NIGHT SHIFT (PIKET MALAM) PAYMENTS
-- Auto-generated migration
-- ============================================

-- Tarif piket malam
CREATE TABLE IF NOT EXISTS public.night_shift_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_type TEXT NOT NULL,
  nightly_rate NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(position_type)
);

-- Batch kwitansi piket malam
CREATE TABLE IF NOT EXISTS public.night_shift_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT NOT NULL UNIQUE,
  receipt_date DATE NOT NULL,
  job_title TEXT NOT NULL,
  description TEXT,
  total_gross NUMERIC NOT NULL DEFAULT 0,
  total_tax NUMERIC NOT NULL DEFAULT 0,
  total_net NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  shift_type TEXT DEFAULT 'malam',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Detail petugas piket per batch
CREATE TABLE IF NOT EXISTS public.night_shift_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.night_shift_batches(id) ON DELETE CASCADE,
  worker_name TEXT NOT NULL,
  position_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  shift_count INTEGER NOT NULL,
  nightly_rate NUMERIC NOT NULL,
  gross_amount NUMERIC NOT NULL,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_night_shift_payments_batch ON public.night_shift_payments(batch_id);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE public.night_shift_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.night_shift_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.night_shift_payments ENABLE ROW LEVEL SECURITY;

-- Rates policies
DROP POLICY IF EXISTS "Authenticated can view night shift rates" ON public.night_shift_rates;
CREATE POLICY "Authenticated can view night shift rates"
  ON public.night_shift_rates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Bendahara/Admin can manage night shift rates" ON public.night_shift_rates;
CREATE POLICY "Bendahara/Admin can manage night shift rates"
  ON public.night_shift_rates FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('bendahara', 'admin', 'super_admin')
  ));

-- Batches policies
DROP POLICY IF EXISTS "Authenticated can view night shift batches" ON public.night_shift_batches;
CREATE POLICY "Authenticated can view night shift batches"
  ON public.night_shift_batches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Bendahara/Admin can manage night shift batches" ON public.night_shift_batches;
CREATE POLICY "Bendahara/Admin can manage night shift batches"
  ON public.night_shift_batches FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('bendahara', 'admin', 'super_admin')
  ));

-- Payments policies
DROP POLICY IF EXISTS "Authenticated can view night shift payments" ON public.night_shift_payments;
CREATE POLICY "Authenticated can view night shift payments"
  ON public.night_shift_payments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Bendahara/Admin can manage night shift payments" ON public.night_shift_payments;
CREATE POLICY "Bendahara/Admin can manage night shift payments"
  ON public.night_shift_payments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('bendahara', 'admin', 'super_admin')
  ));

-- ============================================
-- TRIGGERS
-- ============================================
DROP TRIGGER IF EXISTS update_night_shift_rates_updated_at ON public.night_shift_rates;
CREATE TRIGGER update_night_shift_rates_updated_at
  BEFORE UPDATE ON public.night_shift_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_night_shift_batches_updated_at ON public.night_shift_batches;
CREATE TRIGGER update_night_shift_batches_updated_at
  BEFORE UPDATE ON public.night_shift_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SEED DEFAULT RATES
-- ============================================
INSERT INTO public.night_shift_rates (position_type, nightly_rate, description) VALUES
  ('Koordinator Piket', 100000, 'Koordinator jaga malam'),
  ('Petugas Piket', 75000, 'Petugas jaga malam reguler'),
  ('Petugas Pengganti', 60000, 'Petugas pengganti/cadangan')
ON CONFLICT (position_type) DO NOTHING;
EOF

echo "✅ Created: $MIGRATION_FILE"

# ============================================
# 8. INSTRUCTIONS
# ============================================
echo ""
echo "=========================================="
echo "🎉 GENERATION COMPLETE!"
echo "=========================================="
echo ""
echo "📁 Files created:"
echo "  ├── src/types/nightShift.ts"
echo "  ├── src/lib/terbilang.ts (SHARED UTILITY)"
echo "  ├── src/components/night-shift/NightShiftReceiptPreview.tsx"
echo "  ├── src/components/night-shift/NightShiftAttendancePreview.tsx"
echo "  ├── src/pages/NightShiftPayments.tsx"
echo "  └── $MIGRATION_FILE"
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "1️⃣  Jalankan migration SQL ke Supabase:"
echo "    • Via Supabase CLI:"
echo "      npx supabase db push"
echo "    • Atau copy isi $MIGRATION_FILE"
echo "      ke Supabase SQL Editor"
echo ""
echo "2️⃣  Tambahkan route di src/App.tsx:"
echo ""
echo "    const NightShiftPayments = lazy(() => import(\"./pages/NightShiftPayments\"));"
echo ""
echo "    <Route"
echo "      path=\"/night-shift-payments\""
echo "      element={"
echo "        <ProtectedRoute allowedRoles={['bendahara', 'admin']}>"
echo "          <NightShiftPayments />"
echo "        </ProtectedRoute>"
echo "      }"
echo "    />"
echo ""
echo "3️⃣  Tambahkan menu di sidebar (contoh):"
echo ""
echo "    {"
echo "      title: \"Piket Malam\","
echo "      url: \"/night-shift-payments\","
echo "      icon: Moon,"
echo "      roles: [\"bendahara\", \"admin\"]"
echo "    }"
echo ""
echo "4️⃣  Test:"
echo "    npm run dev"
echo "    Buka: /night-shift-payments"
echo ""
echo "=========================================="