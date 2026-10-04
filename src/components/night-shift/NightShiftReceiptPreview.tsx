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
          <div className="flex justify-between items-start">
            <div></div>
            <div className="text-center flex-1">
              <h2 className="text-lg font-bold">KWITANSI PEMBAYARAN PIKET MALAM</h2>
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

          <div className="text-sm">
            <span className="font-medium">Terbilang: </span>
            <span className="italic">{capitalizeFirst(numberToWords(batch.total_gross))} rupiah</span>
          </div>

          <div className="text-xs text-gray-700">
            Informasi Potongan Pajak: PPh 21: {pph21} | PPh 23: - | PPN: - | Jumlah Potongan: {batch.tax_rate > 0 ? formatCurrency(batch.total_tax) : "-"}
          </div>

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
