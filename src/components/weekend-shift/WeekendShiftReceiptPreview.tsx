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
