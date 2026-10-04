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
