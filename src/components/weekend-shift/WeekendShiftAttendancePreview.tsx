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
