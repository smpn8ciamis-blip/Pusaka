#!/bin/bash
# =====================================================================
# SETUP FITUR PIKET SABTU MINGGU — ALL IN ONE
# Struktur sama dengan Piket Malam, hanya beda label
# Jalankan: bash setup-weekend-shift-all.sh
# =====================================================================

set -e

echo "╔════════════════════════════════════════════╗"
echo "║  SETUP FITUR PIKET SABTU MINGGU            ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# ============================================
# STEP 1: MIGRATION SQL
# ============================================
echo "🗄️  STEP 1/7: Membuat migration SQL..."
TIMESTAMP=$(date +%Y%m%d%H%M%S)
MIGRATION_FILE="supabase/migrations/${TIMESTAMP}_weekend_shift_payments.sql"

cat > "$MIGRATION_FILE" << 'SQLEOF'
-- ============================================
-- WEEKEND SHIFT (PIKET SABTU MINGGU) PAYMENTS
-- ============================================

-- Tarif piket sabtu minggu
CREATE TABLE IF NOT EXISTS public.weekend_shift_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_type TEXT NOT NULL,
  daily_rate NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(position_type)
);

-- Batch kwitansi piket sabtu minggu
CREATE TABLE IF NOT EXISTS public.weekend_shift_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT NOT NULL UNIQUE,
  receipt_date DATE NOT NULL,
  job_title TEXT NOT NULL,
  description TEXT,
  total_gross NUMERIC NOT NULL DEFAULT 0,
  total_tax NUMERIC NOT NULL DEFAULT 0,
  total_net NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_type TEXT DEFAULT 'pph21' CHECK (tax_type IN ('pph21', 'pph22', 'pph23', 'ppn', 'none')),
  shift_type TEXT DEFAULT 'sabtu_minggu',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Detail petugas piket per batch
CREATE TABLE IF NOT EXISTS public.weekend_shift_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.weekend_shift_batches(id) ON DELETE CASCADE,
  worker_name TEXT NOT NULL,
  position_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  shift_count INTEGER NOT NULL,
  daily_rate NUMERIC NOT NULL,
  gross_amount NUMERIC NOT NULL,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekend_shift_payments_batch ON public.weekend_shift_payments(batch_id);

-- RLS
ALTER TABLE public.weekend_shift_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekend_shift_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekend_shift_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view weekend shift rates" ON public.weekend_shift_rates;
CREATE POLICY "Authenticated can view weekend shift rates"
  ON public.weekend_shift_rates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Bendahara/Admin can manage weekend shift rates" ON public.weekend_shift_rates;
CREATE POLICY "Bendahara/Admin can manage weekend shift rates"
  ON public.weekend_shift_rates FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('bendahara', 'admin', 'super_admin')
  ));

DROP POLICY IF EXISTS "Authenticated can view weekend shift batches" ON public.weekend_shift_batches;
CREATE POLICY "Authenticated can view weekend shift batches"
  ON public.weekend_shift_batches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Bendahara/Admin can manage weekend shift batches" ON public.weekend_shift_batches;
CREATE POLICY "Bendahara/Admin can manage weekend shift batches"
  ON public.weekend_shift_batches FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('bendahara', 'admin', 'super_admin')
  ));

DROP POLICY IF EXISTS "Authenticated can view weekend shift payments" ON public.weekend_shift_payments;
CREATE POLICY "Authenticated can view weekend shift payments"
  ON public.weekend_shift_payments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Bendahara/Admin can manage weekend shift payments" ON public.weekend_shift_payments;
CREATE POLICY "Bendahara/Admin can manage weekend shift payments"
  ON public.weekend_shift_payments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('bendahara', 'admin', 'super_admin')
  ));

-- Triggers
DROP TRIGGER IF EXISTS update_weekend_shift_rates_updated_at ON public.weekend_shift_rates;
CREATE TRIGGER update_weekend_shift_rates_updated_at
  BEFORE UPDATE ON public.weekend_shift_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_weekend_shift_batches_updated_at ON public.weekend_shift_batches;
CREATE TRIGGER update_weekend_shift_batches_updated_at
  BEFORE UPDATE ON public.weekend_shift_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default rates
INSERT INTO public.weekend_shift_rates (position_type, daily_rate, description) VALUES
  ('Koordinator Piket', 100000, 'Koordinator piket sabtu minggu'),
  ('Petugas Piket', 75000, 'Petugas piket sabtu minggu reguler'),
  ('Petugas Pengganti', 60000, 'Petugas pengganti/cadangan')
ON CONFLICT (position_type) DO NOTHING;
SQLEOF

echo "✅ Migration: $MIGRATION_FILE"
echo ""

# ============================================
# STEP 2: TYPES
# ============================================
echo "📘 STEP 2/7: Membuat types..."

cat > src/types/weekendShift.ts << 'TYPEEOF'
export type TaxType = 'pph21' | 'pph22' | 'pph23' | 'ppn' | 'none';

export interface WeekendShiftRate {
  id: string;
  position_type: string;
  daily_rate: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeekendShiftPayment {
  id: string;
  batch_id: string;
  worker_name: string;
  position_type: string;
  start_date: string;
  end_date: string;
  shift_count: number;
  daily_rate: number;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
  notes: string | null;
  created_at: string;
}

export interface WeekendShiftBatch {
  id: string;
  batch_number: string;
  receipt_date: string;
  job_title: string;
  description: string | null;
  total_gross: number;
  total_tax: number;
  total_net: number;
  tax_rate: number;
  tax_type: TaxType;
  shift_type: string;
  created_by: string;
  created_at: string;
  weekend_shift_payments?: WeekendShiftPayment[];
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

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  pph21: 'PPh 21',
  pph22: 'PPh 22',
  pph23: 'PPh 23',
  ppn: 'PPN',
  none: 'Tanpa Pajak',
};
TYPEEOF

echo "✅ src/types/weekendShift.ts"
echo ""

# ============================================
# STEP 3: RECEIPT PREVIEW
# ============================================
echo "🎨 STEP 3/7: Membuat ReceiptPreview..."

cat > src/components/weekend-shift/WeekendShiftReceiptPreview.tsx << 'PREVIEWEOF'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown, X } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { numberToWords, formatCurrency, capitalizeFirst } from "@/lib/terbilang";
import type { WeekendShiftBatch, SchoolSettings, TaxType } from "@/types/weekendShift";
import { TAX_TYPE_LABELS } from "@/types/weekendShift";

interface WeekendShiftReceiptPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  batch: WeekendShiftBatch | null;
  schoolSettings: SchoolSettings | null;
  onDownload: () => void;
}

export function WeekendShiftReceiptPreview({
  isOpen,
  onClose,
  batch,
  schoolSettings,
  onDownload,
}: WeekendShiftReceiptPreviewProps) {
  if (!batch) return null;

  const workers = batch.weekend_shift_payments || [];
  const receiptDateFormatted = format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id });
  const paymentDesc = batch.description || batch.job_title;
  const taxType = (batch.tax_type || 'pph21') as TaxType;
  const taxLabel = TAX_TYPE_LABELS[taxType] || 'PPh 21';
  const city = schoolSettings?.city || "";
  const headmasterTitle = schoolSettings?.headmaster_position
    ? `${schoolSettings.headmaster_position} ${schoolSettings.school_name || ""}`.trim()
    : `Kepala ${schoolSettings?.school_name || "Sekolah"}`;
  const schoolAny = schoolSettings as any;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Kwitansi Pembayaran Piket Sabtu Minggu</DialogTitle>
        </DialogHeader>

        <div className="bg-white text-black p-6 rounded-lg border space-y-4" style={{ fontFamily: "serif" }}>
          {/* KOP SURAT */}
          <div className="border-b-4 border-double border-black pb-3">
            <div className="flex items-center gap-4">
              {schoolAny?.logo_url && (
                <img src={schoolAny.logo_url} alt="Logo" className="w-20 h-20 object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
              <div className="flex-1 text-center">
                <p className="text-sm font-semibold uppercase tracking-wide">Pemerintah Kabupaten/Kota</p>
                <p className="text-sm font-semibold uppercase tracking-wide">Dinas Pendidikan dan Kebudayaan</p>
                <h1 className="text-xl font-bold uppercase mt-1">{schoolSettings?.school_name || "NAMA SEKOLAH"}</h1>
                <p className="text-xs mt-1">{schoolSettings?.school_address || "Alamat sekolah belum diatur"}</p>
                {city && <p className="text-xs">{city}</p>}
              </div>
              {schoolAny?.right_logo_url && (
                <img src={schoolAny.right_logo_url} alt="Logo Kanan" className="w-20 h-20 object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              )}
            </div>
          </div>

          <div className="flex justify-between items-start">
            <div></div>
            <div className="text-center flex-1">
              <h2 className="text-lg font-bold underline">KWITANSI PEMBAYARAN PIKET SABTU MINGGU</h2>
            </div>
            <div className="text-right text-sm">No TB : ........</div>
          </div>

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

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="border border-gray-400 p-2 w-8">No</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "130px" }}>Nama Petugas</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "80px" }}>Jabatan</th>
                  <th className="border border-gray-400 p-2 w-16">Hadir<br/>Piket</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "85px" }}>Tarif/Hari</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "85px" }}>Bruto</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "70px" }}>{taxLabel}</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "85px" }}>Netto</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: "50px" }}>TTD</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w, i) => (
                  <tr key={w.id}>
                    <td className="border border-gray-400 p-2 text-center">{i + 1}</td>
                    <td className="border border-gray-400 p-2">{w.worker_name}</td>
                    <td className="border border-gray-400 p-2 text-center">{w.position_type}</td>
                    <td className="border border-gray-400 p-2 text-center font-semibold">{w.shift_count}</td>
                    <td className="border border-gray-400 p-2 text-right">{formatCurrency(w.daily_rate)}</td>
                    <td className="border border-gray-400 p-2 text-right">{formatCurrency(w.gross_amount)}</td>
                    <td className="border border-gray-400 p-2 text-right">
                      {batch.tax_type === 'none' ? '-' : (w.tax_amount > 0 ? formatCurrency(w.tax_amount) : "Rp 0")}
                    </td>
                    <td className="border border-gray-400 p-2 text-right">{formatCurrency(w.net_amount)}</td>
                    <td className="border border-gray-400 p-2"></td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td className="border border-gray-400 p-2"></td>
                  <td className="border border-gray-400 p-2">TOTAL</td>
                  <td className="border border-gray-400 p-2"></td>
                  <td className="border border-gray-400 p-2 text-center">{workers.reduce((sum, w) => sum + w.shift_count, 0)}</td>
                  <td className="border border-gray-400 p-2"></td>
                  <td className="border border-gray-400 p-2 text-right">{formatCurrency(batch.total_gross)}</td>
                  <td className="border border-gray-400 p-2 text-right">
                    {batch.tax_type === 'none' ? '-' : formatCurrency(batch.total_tax)}
                  </td>
                  <td className="border border-gray-400 p-2 text-right">{formatCurrency(batch.total_net)}</td>
                  <td className="border border-gray-400 p-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-sm">
            <span className="font-medium">Terbilang: </span>
            <span className="italic">{capitalizeFirst(numberToWords(batch.total_gross))} rupiah</span>
          </div>

          <div className="text-xs text-gray-700 border-t pt-2">
            <span className="font-semibold">Informasi Potongan Pajak:</span>{" "}
            {batch.tax_type === 'none' ? (
              <span>Tidak ada potongan pajak</span>
            ) : (
              <span>{taxLabel} ({batch.tax_rate}%): {formatCurrency(batch.total_tax)}</span>
            )}
          </div>

          <div className="flex justify-between mt-8 text-sm">
            <div className="text-center">
              <p>Menyetujui,</p>
              <p>{headmasterTitle}</p>
              <div className="h-20"></div>
              <p className="font-bold underline">{schoolSettings?.headmaster_name || "(___________________)"}</p>
              {schoolSettings?.headmaster_nip && <p>NIP. {schoolSettings.headmaster_nip}</p>}
            </div>

            <div className="text-center">
              <p>{city ? `${city}, ` : ""}{receiptDateFormatted}</p>
              <p>Bendahara BOS</p>
              <p className="text-xs mt-1">Lunas Dibayar Tanggal: {receiptDateFormatted}</p>
              <div className="h-14"></div>
              <p className="font-bold underline">{schoolSettings?.bendahara_name || "(___________________)"}</p>
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
PREVIEWEOF

echo "✅ src/components/weekend-shift/WeekendShiftReceiptPreview.tsx"
echo ""

# ============================================
# STEP 4: ATTENDANCE PREVIEW
# ============================================
echo "🎨 STEP 4/7: Membuat AttendancePreview..."

cat > src/components/weekend-shift/WeekendShiftAttendancePreview.tsx << 'ATTEOF'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown, X } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import type { WeekendShiftBatch, SchoolSettings } from "@/types/weekendShift";

interface WakasekSarpras {
  full_name: string;
  nip: string | null;
}

interface WeekendShiftAttendancePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  batch: WeekendShiftBatch | null;
  schoolSettings: SchoolSettings | null;
  wakasekSarpras: WakasekSarpras | null;
  onDownload: () => void;
}

export function WeekendShiftAttendancePreview({
  isOpen,
  onClose,
  batch,
  schoolSettings,
  wakasekSarpras,
  onDownload,
}: WeekendShiftAttendancePreviewProps) {
  if (!batch) return null;

  const workers = batch.weekend_shift_payments || [];
  const receiptDateFormatted = format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id });
  const city = schoolSettings?.city || "";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Daftar Hadir Petugas Piket Sabtu Minggu</DialogTitle>
        </DialogHeader>

        <div className="bg-white text-black p-6 rounded-lg border space-y-4" style={{ fontFamily: "serif" }}>
          <div className="text-center">
            <h2 className="text-lg font-bold underline">DAFTAR HADIR PETUGAS PIKET SABTU MINGGU</h2>
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
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="border border-gray-400 p-2 w-12">No</th>
                  <th className="border border-gray-400 p-2">Nama Petugas</th>
                  <th className="border border-gray-400 p-2">Jabatan</th>
                  <th className="border border-gray-400 p-2 w-28">Jumlah Hadir Piket</th>
                  <th className="border border-gray-400 p-2 w-40">Tanda Tangan</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w, i) => (
                  <tr key={w.id}>
                    <td className="border border-gray-400 p-2 text-center">{i + 1}</td>
                    <td className="border border-gray-400 p-2">{w.worker_name}</td>
                    <td className="border border-gray-400 p-2 text-center">{w.position_type}</td>
                    <td className="border border-gray-400 p-2 text-center font-bold">{w.shift_count} hari</td>
                    <td className="border border-gray-400 p-2"></td>
                  </tr>
                ))}
                <tr className="font-bold bg-gray-100">
                  <td className="border border-gray-400 p-2"></td>
                  <td className="border border-gray-400 p-2" colSpan={2}>TOTAL</td>
                  <td className="border border-gray-400 p-2 text-center">
                    {workers.reduce((sum, w) => sum + w.shift_count, 0)} hari
                  </td>
                  <td className="border border-gray-400 p-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-8 text-sm">
            <div className="text-center">
              <p>Wakasek Sarana Prasarana,</p>
              <div className="h-20"></div>
              <p className="font-bold underline">{wakasekSarpras?.full_name || "(___________________)"}</p>
              <p>NIP. {wakasekSarpras?.nip || "___________________"}</p>
            </div>

            <div className="text-center">
              <p>{city ? `${city}, ` : ""}{receiptDateFormatted}</p>
              <p>Mengetahui,</p>
              <p>{schoolSettings?.headmaster_position || "Kepala Sekolah"}</p>
              <div className="h-14"></div>
              <p className="font-bold underline">{schoolSettings?.headmaster_name || "(___________________)"}</p>
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
ATTEOF

echo "✅ src/components/weekend-shift/WeekendShiftAttendancePreview.tsx"
echo ""

# ============================================
# STEP 5: MAIN PAGE
# ============================================
echo "📄 STEP 5/7: Membuat halaman WeekendShiftPayments.tsx..."

cat > src/pages/WeekendShiftPayments.tsx << 'PAGEEOF'
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
  Plus, Trash2, CalendarIcon, Settings, FileDown, Pencil,
  Users, Wallet, Receipt, Percent, ClipboardList, Eye, CalendarDays
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import { numberToWords, formatCurrency, capitalizeFirst } from "@/lib/terbilang";
import { WeekendShiftReceiptPreview } from "@/components/weekend-shift/WeekendShiftReceiptPreview";
import { WeekendShiftAttendancePreview } from "@/components/weekend-shift/WeekendShiftAttendancePreview";
import type { WeekendShiftRate, WeekendShiftBatch, SchoolSettings, TaxType } from "@/types/weekendShift";
import { TAX_TYPE_LABELS } from "@/types/weekendShift";

interface TempWorker {
  id?: string;
  worker_name: string;
  position_type: string;
  shift_count: number;
  daily_rate: number;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
  notes: string;
}

const WeekendShiftPayments = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("batches");

  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isWorkerDialogOpen, setIsWorkerDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<WeekendShiftRate | null>(null);
  const [editingBatch, setEditingBatch] = useState<WeekendShiftBatch | null>(null);
  const [editingWorkerIndex, setEditingWorkerIndex] = useState<number | null>(null);

  const [deleteBatchId, setDeleteBatchId] = useState<string | null>(null);
  const [deleteRateId, setDeleteRateId] = useState<string | null>(null);

  const [receiptPreviewBatch, setReceiptPreviewBatch] = useState<WeekendShiftBatch | null>(null);
  const [attendancePreviewBatch, setAttendancePreviewBatch] = useState<WeekendShiftBatch | null>(null);

  const [rateForm, setRateForm] = useState({ position_type: "", daily_rate: 0, description: "" });
  const [batchForm, setBatchForm] = useState({
    job_title: "",
    description: "",
    receipt_date: new Date(),
    tax_rate: 0,
    tax_type: "pph21" as TaxType,
    shift_type: "sabtu_minggu",
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
    queryKey: ["weekend-shift-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekend_shift_rates")
        .select("*")
        .order("daily_rate", { ascending: false });
      if (error) throw error;
      return data as WeekendShiftRate[];
    },
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["weekend-shift-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekend_shift_batches")
        .select(`*, weekend_shift_payments(*)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WeekendShiftBatch[];
    },
  });

  const { data: schoolSettings } = useQuery({
    queryKey: ["school-settings-weekend-shift"],
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
    queryKey: ["wakasek-sarpras-weekend-shift", schoolSettings?.wakasek_sarpras_teacher_id],
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
    mutationFn: async (data: { position_type: string; daily_rate: number; description: string }) => {
      const { error } = await supabase.from("weekend_shift_rates").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekend-shift-rates"] });
      toast.success("Tarif piket sabtu minggu berhasil ditambahkan");
      setIsRateDialogOpen(false);
      setRateForm({ position_type: "", daily_rate: 0, description: "" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateRateMutation = useMutation({
    mutationFn: async (data: { id: string; position_type: string; daily_rate: number; description: string }) => {
      const { error } = await supabase
        .from("weekend_shift_rates")
        .update({ position_type: data.position_type, daily_rate: data.daily_rate, description: data.description })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekend-shift-rates"] });
      toast.success("Tarif berhasil diperbarui");
      setIsRateDialogOpen(false);
      setEditingRate(null);
      setRateForm({ position_type: "", daily_rate: 0, description: "" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteRateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("weekend_shift_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekend-shift-rates"] });
      toast.success("Tarif berhasil dihapus");
      setDeleteRateId(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ============================================
  // MUTATIONS — BATCH CREATE
  // ============================================
  const createBatchMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not found");
      if (tempWorkers.length === 0) throw new Error("Tambahkan minimal 1 petugas piket");

      const total_gross = tempWorkers.reduce((sum, w) => sum + w.gross_amount, 0);
      const total_tax = tempWorkers.reduce((sum, w) => sum + w.tax_amount, 0);
      const total_net = tempWorkers.reduce((sum, w) => sum + w.net_amount, 0);

      const batch_number = `KPSM-${format(new Date(), "yyyyMMdd")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const { data: batchData, error: batchError } = await supabase
        .from("weekend_shift_batches")
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
        daily_rate: w.daily_rate,
        gross_amount: w.gross_amount,
        tax_amount: w.tax_amount,
        net_amount: w.net_amount,
        notes: w.notes || null,
      }));

      const { error: workersError } = await supabase
        .from("weekend_shift_payments")
        .insert(workersToInsert);

      if (workersError) {
        await supabase.from("weekend_shift_batches").delete().eq("id", batchData.id);
        throw workersError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekend-shift-batches"] });
      toast.success("Kwitansi piket sabtu minggu berhasil dibuat");
      closeBatchDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ============================================
  // MUTATIONS — BATCH UPDATE
  // ============================================
  const updateBatchMutation = useMutation({
    mutationFn: async () => {
      if (!editingBatch) throw new Error("No batch to update");
      if (tempWorkers.length === 0) throw new Error("Tambahkan minimal 1 petugas piket");

      const total_gross = tempWorkers.reduce((sum, w) => sum + w.gross_amount, 0);
      const total_tax = tempWorkers.reduce((sum, w) => sum + w.tax_amount, 0);
      const total_net = tempWorkers.reduce((sum, w) => sum + w.net_amount, 0);

      const { error: batchError } = await supabase
        .from("weekend_shift_batches")
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

      const { error: deleteError } = await supabase
        .from("weekend_shift_payments")
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
        daily_rate: w.daily_rate,
        gross_amount: w.gross_amount,
        tax_amount: w.tax_amount,
        net_amount: w.net_amount,
        notes: w.notes || null,
      }));

      const { error: workersError } = await supabase
        .from("weekend_shift_payments")
        .insert(workersToInsert);

      if (workersError) throw workersError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekend-shift-batches"] });
      toast.success("Kwitansi berhasil diperbarui");
      closeBatchDialog();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("weekend_shift_batches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekend-shift-batches"] });
      toast.success("Kwitansi berhasil dihapus");
      setDeleteBatchId(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // ============================================
  // HELPERS
  // ============================================
  const resetBatchForm = () => {
    setBatchForm({
      job_title: "", description: "", receipt_date: new Date(),
      tax_rate: 0, tax_type: "pph21", shift_type: "sabtu_minggu",
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

  const openEditDialog = (batch: WeekendShiftBatch) => {
    setEditingBatch(batch);
    setBatchForm({
      job_title: batch.job_title,
      description: batch.description || "",
      receipt_date: new Date(batch.receipt_date),
      tax_rate: batch.tax_rate,
      tax_type: (batch.tax_type || "pph21") as TaxType,
      shift_type: batch.shift_type || "sabtu_minggu",
    });

    const workers: TempWorker[] = (batch.weekend_shift_payments || []).map((w) => ({
      id: w.id,
      worker_name: w.worker_name,
      position_type: w.position_type,
      shift_count: w.shift_count,
      daily_rate: w.daily_rate,
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
    const daily_rate = rate.daily_rate;
    const gross_amount = shift_count * daily_rate;
    const tax_amount = (gross_amount * batchForm.tax_rate) / 100;
    const net_amount = gross_amount - tax_amount;

    return { shift_count, daily_rate, gross_amount, tax_amount, net_amount };
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
  const exportPDF = async (batch: WeekendShiftBatch) => {
    const doc = new jsPDF();
    const workers = batch.weekend_shift_payments || [];
    const startY = await addLetterheadToPDF(doc, schoolSettings);

    let currentY = startY + 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("No TB : ........", 196, currentY, { align: "right" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("KWITANSI PEMBAYARAN PIKET SABTU MINGGU", 105, currentY, { align: "center" });
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
      `Rp ${formatCurrency(w.daily_rate).replace("Rp", "").trim()}`,
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
      head: [["No", "Nama Petugas", "Jabatan", "Hadir Piket", "Tarif/Hari", "Bruto", taxLabel, "Netto", "TTD"]],
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

    doc.save(`Kwitansi-Piket-Sabtu-Minggu-${batch.batch_number}.pdf`);
  };

  // ============================================
  // PDF EXPORT — DAFTAR HADIR
  // ============================================
  const exportAttendancePDF = async (batch: WeekendShiftBatch) => {
    const doc = new jsPDF();
    const workers = batch.weekend_shift_payments || [];
    const startY = await addLetterheadToPDF(doc, schoolSettings);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("DAFTAR HADIR PETUGAS PIKET SABTU MINGGU", 105, startY + 5, { align: "center" });
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
      `${w.shift_count} hari`,
      "",
    ]);

    tableData.push([
      "",
      "TOTAL",
      "",
      `${workers.reduce((sum, w) => sum + w.shift_count, 0)} hari`,
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

    doc.save(`Daftar-Hadir-Piket-Sabtu-Minggu-${batch.batch_number}.pdf`);
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <ProtectedRoute allowedRoles={["bendahara", "admin"]}>
      <DashboardLayout>
        <div className="space-y-6 p-4 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/10 p-2">
                <CalendarDays className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Kwitansi Piket Sabtu Minggu</h1>
                <p className="text-muted-foreground">Kelola pembayaran upah petugas piket sabtu minggu dan cetak kwitansi kolektif</p>
              </div>
            </div>
          </div>

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
                      {batches.reduce((sum, b) => sum + (b.weekend_shift_payments?.length || 0), 0)}
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

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="batches">Daftar Kwitansi</TabsTrigger>
              <TabsTrigger value="rates">Pengaturan Tarif</TabsTrigger>
              <TabsTrigger value="attendance">Daftar Hadir</TabsTrigger>
            </TabsList>

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
                        {editingBatch ? `Edit Kwitansi: ${editingBatch.batch_number}` : "Buat Kwitansi Piket Sabtu Minggu"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Judul Pekerjaan *</Label>
                          <Input
                            value={batchForm.job_title}
                            onChange={(e) => setBatchForm({ ...batchForm, job_title: e.target.value })}
                            placeholder="Contoh: Piket Sabtu Minggu Bulan Januari 2025"
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
                            <SelectTrigger><SelectValue /></SelectTrigger>
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
                                    <SelectTrigger><SelectValue placeholder="Pilih jabatan" /></SelectTrigger>
                                    <SelectContent>
                                      {rates.map((rate) => (
                                        <SelectItem key={rate.id} value={rate.position_type}>
                                          {rate.position_type} - {formatCurrency(rate.daily_rate)}/hari
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
                                    placeholder="Contoh: 8"
                                  />
                                  <p className="text-xs text-muted-foreground">Masukkan jumlah hari kehadiran piket</p>
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
                                        <span className="font-medium">{calculateWorkerPayment()?.shift_count} hari</span>
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
                                        <Button variant="ghost" size="icon" onClick={() => editWorkerInList(index)} title="Edit petugas">
                                          <Pencil className="h-4 w-4 text-blue-500" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => removeWorkerFromList(index)} title="Hapus petugas">
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
                              <Badge variant="secondary">{batch.weekend_shift_payments?.length || 0}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(Number(batch.total_net))}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="icon" onClick={() => openEditDialog(batch)} title="Edit Kwitansi">
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

            <TabsContent value="rates" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Pengaturan Tarif Piket Sabtu Minggu
                    </CardTitle>
                    <CardDescription>Atur tarif per hari berdasarkan jabatan petugas</CardDescription>
                  </div>
                  <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => {
                        setEditingRate(null);
                        setRateForm({ position_type: "", daily_rate: 0, description: "" });
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
                          <Label>Tarif per Hari (Rp) *</Label>
                          <Input
                            type="number"
                            value={rateForm.daily_rate}
                            onChange={(e) => setRateForm({ ...rateForm, daily_rate: Number(e.target.value) })}
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
                      Belum ada tarif piket sabtu minggu. Tambahkan tarif untuk mulai membuat kwitansi.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Jabatan</TableHead>
                          <TableHead>Deskripsi</TableHead>
                          <TableHead className="text-right">Tarif per Hari</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rates.map((rate) => (
                          <TableRow key={rate.id}>
                            <TableCell className="font-medium">{rate.position_type}</TableCell>
                            <TableCell className="text-muted-foreground">{rate.description || "-"}</TableCell>
                            <TableCell className="text-right">{formatCurrency(rate.daily_rate)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => {
                                    setEditingRate(rate);
                                    setRateForm({
                                      position_type: rate.position_type,
                                      daily_rate: rate.daily_rate,
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

            <TabsContent value="attendance" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Daftar Hadir Petugas Piket Sabtu Minggu
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
                          <TableHead className="text-center">Total Hari</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batches.map((batch) => {
                          const totalShifts = batch.weekend_shift_payments?.reduce((sum, w) => sum + w.shift_count, 0) || 0;
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
                                <Badge variant="secondary">{batch.weekend_shift_payments?.length || 0}</Badge>
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

          <WeekendShiftReceiptPreview
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

          <WeekendShiftAttendancePreview
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

export default WeekendShiftPayments;
PAGEEOF

echo "✅ src/pages/WeekendShiftPayments.tsx"
echo ""

# ============================================
# STEP 6: PATCH App.tsx
# ============================================
echo "🔧 STEP 6/7: Patch App.tsx..."

APP_FILE="src/App.tsx"
if [ ! -f "$APP_FILE" ]; then
  echo "❌ ERROR: $APP_FILE tidak ditemukan!"
  exit 1
fi

cp "$APP_FILE" "$APP_FILE.bak-weekend-$(date +%Y%m%d%H%M%S)"

if grep -q "WeekendShiftPayments" "$APP_FILE"; then
  echo "  ⏭️  Route sudah ada, skip."
else
  # Tambah lazy import
  if grep -q 'const NightShiftPayments = lazy' "$APP_FILE"; then
    sed -i '/const NightShiftPayments = lazy/a const WeekendShiftPayments = lazy(() => import("./pages/WeekendShiftPayments"));' "$APP_FILE"
    echo "  ✅ Lazy import ditambahkan"
  else
    sed -i '/const WorkerPayments = lazy/a const WeekendShiftPayments = lazy(() => import("./pages/WeekendShiftPayments"));' "$APP_FILE"
    echo "  ✅ Lazy import ditambahkan (setelah WorkerPayments)"
  fi

  # Tambah route
  if grep -q 'path="/night-shift-payments"' "$APP_FILE"; then
    sed -i '/path="\/night-shift-payments"/a\              <Route path="/weekend-shift-payments" element={<ProtectedRoute allowedRoles={["bendahara", "admin"]}><WeekendShiftPayments /></ProtectedRoute>} />' "$APP_FILE"
    echo "  ✅ Route ditambahkan"
  else
    sed -i '/path="\/worker-payments"/a\              <Route path="/weekend-shift-payments" element={<ProtectedRoute allowedRoles={["bendahara", "admin"]}><WeekendShiftPayments /></ProtectedRoute>} />' "$APP_FILE"
    echo "  ✅ Route ditambahkan (setelah worker-payments)"
  fi
fi

# Verifikasi App.tsx — pastikan tidak ada duplikat
IMPORT_COUNT=$(grep -c "WeekendShiftPayments = lazy" "$APP_FILE")
ROUTE_COUNT=$(grep -c 'path="/weekend-shift-payments"' "$APP_FILE")

if [ "$IMPORT_COUNT" -gt 1 ] || [ "$ROUTE_COUNT" -gt 1 ]; then
  echo "  ⚠️  Duplikat terdeteksi! Membersihkan..."
  sed -i '/const WeekendShiftPayments = lazy/d' "$APP_FILE"
  sed -i '/path="\/weekend-shift-payments"/d' "$APP_FILE"

  if grep -q 'const NightShiftPayments = lazy' "$APP_FILE"; then
    sed -i '/const NightShiftPayments = lazy/a const WeekendShiftPayments = lazy(() => import("./pages/WeekendShiftPayments"));' "$APP_FILE"
  else
    sed -i '/const WorkerPayments = lazy/a const WeekendShiftPayments = lazy(() => import("./pages/WeekendShiftPayments"));' "$APP_FILE"
  fi

  if grep -q 'path="/night-shift-payments"' "$APP_FILE"; then
    sed -i '/path="\/night-shift-payments"/a\              <Route path="/weekend-shift-payments" element={<ProtectedRoute allowedRoles={["bendahara", "admin"]}><WeekendShiftPayments /></ProtectedRoute>} />' "$APP_FILE"
  else
    sed -i '/path="\/worker-payments"/a\              <Route path="/weekend-shift-payments" element={<ProtectedRoute allowedRoles={["bendahara", "admin"]}><WeekendShiftPayments /></ProtectedRoute>} />' "$APP_FILE"
  fi
  echo "  ✅ Duplikat dibersihkan"
fi

echo ""

# ============================================
# STEP 7: PATCH DashboardLayout.tsx
# ============================================
echo "🔧 STEP 7/7: Patch DashboardLayout.tsx..."

LAYOUT_FILE="src/components/DashboardLayout.tsx"
if [ ! -f "$LAYOUT_FILE" ]; then
  echo "❌ ERROR: $LAYOUT_FILE tidak ditemukan!"
  exit 1
fi

cp "$LAYOUT_FILE" "$LAYOUT_FILE.bak-weekend-$(date +%Y%m%d%H%M%S)"

if grep -q "weekend-shift-payments" "$LAYOUT_FILE"; then
  echo "  ⏭️  Menu sudah ada, skip."
else
  # 1. Tambah import CalendarDays (kalau belum ada)
  if ! grep -q "CalendarDays" "$LAYOUT_FILE"; then
    sed -i "s/LayoutDashboard, Search, Star, Moon$/LayoutDashboard, Search, Star, Moon, CalendarDays/" "$LAYOUT_FILE"
    # Fallback jika Moon belum ada (layout versi lama)
    if ! grep -q "CalendarDays" "$LAYOUT_FILE"; then
      sed -i "s/LayoutDashboard, Search, Star$/LayoutDashboard, Search, Star, Moon, CalendarDays/" "$LAYOUT_FILE"
    fi
    echo "  ✅ Import CalendarDays ditambahkan"
  fi

  # 2. Tambah menu setelah 'Piket Malam' (2 lokasi)
  perl -i -pe '
    if (/label: '"'"'Piket Malam'"'"', href: '"'"'\/night-shift-payments'"'"' },/) {
      $_ .= "    { icon: CalendarDays, label: '"'"'Piket Sabtu Minggu'"'"', href: '"'"'/weekend-shift-payments'"'"' },\n";
    }
  ' "$LAYOUT_FILE"

  MENU_COUNT=$(grep -c "Piket Sabtu Minggu" "$LAYOUT_FILE")
  echo "  ✅ Menu ditambahkan di $MENU_COUNT lokasi"
fi

echo ""

# ============================================
# VERIFIKASI
# ============================================
echo "🔍 Verifikasi:"
echo ""
echo "File baru:"
[ -f "src/types/weekendShift.ts" ] && echo "  ✅ src/types/weekendShift.ts"
[ -f "src/components/weekend-shift/WeekendShiftReceiptPreview.tsx" ] && echo "  ✅ ReceiptPreview"
[ -f "src/components/weekend-shift/WeekendShiftAttendancePreview.tsx" ] && echo "  ✅ AttendancePreview"
[ -f "src/pages/WeekendShiftPayments.tsx" ] && echo "  ✅ WeekendShiftPayments.tsx"
[ -f "$MIGRATION_FILE" ] && echo "  ✅ Migration SQL"
echo ""
echo "Patch App.tsx:"
grep -c "WeekendShiftPayments" "$APP_FILE" | xargs -I {} echo "  ✅ {} baris ditemukan (harusnya 2)"
echo ""
echo "Patch DashboardLayout:"
grep -c "Piket Sabtu Minggu" "$LAYOUT_FILE" | xargs -I {} echo "  ✅ {} menu ditambahkan (harusnya 2)"
echo ""

# ============================================
# BUILD & DEPLOY
# ============================================
echo "╔════════════════════════════════════════════╗"
echo "║  BUILD & DEPLOY                            ║"
echo "╚════════════════════════════════════════════╝"
echo ""

read -p "Lanjut build & deploy? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🔨 Build..."
  npm run build

  echo ""
  echo "🔄 Reload Nginx..."
  systemctl reload nginx

  echo ""
  echo "✅ BUILD & DEPLOY SELESAI!"
  echo ""
  echo "📋 JANGAN LUPA — Push migration SQL ke Supabase:"
  echo ""
  echo "   npx supabase db push"
  echo ""
  echo "   ATAU copy isi file ini ke Supabase SQL Editor:"
  echo "   $MIGRATION_FILE"
  echo ""
  echo "🌐 Buka: https://pusaka.smpn8ciamis.sch.id/weekend-shift-payments"
  echo ""
  echo "🎉 Fitur 'Piket Sabtu Minggu' siap digunakan!"
else
  echo ""
  echo "⏭️  Build dilewatkan."
  echo "   Jalankan manual: npm run build && systemctl reload nginx"
fi
