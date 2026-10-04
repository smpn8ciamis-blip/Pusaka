import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown, X } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

interface WorkerPayment {
  id: string;
  worker_name: string;
  position_type: string;
  start_date: string;
  end_date: string;
  work_days: number;
}

interface WorkerPaymentBatch {
  id: string;
  batch_number: string;
  receipt_date: string;
  job_title: string;
  description: string | null;
  worker_payments?: WorkerPayment[];
}

interface SchoolSettings {
  school_name?: string;
  headmaster_name?: string;
  headmaster_nip?: string;
}

interface WakasekSarpras {
  full_name: string;
  nip?: string | null;
}

interface WorkerAttendancePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  batch: WorkerPaymentBatch | null;
  schoolSettings: SchoolSettings | null;
  wakasekSarpras: WakasekSarpras | null;
  onDownload: () => void;
}

export function WorkerAttendancePreview({ 
  isOpen, 
  onClose, 
  batch, 
  schoolSettings, 
  wakasekSarpras,
  onDownload 
}: WorkerAttendancePreviewProps) {
  if (!batch) return null;

  const workers = batch.worker_payments || [];
  const receiptDateFormatted = format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id });

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Daftar Hadir Tukang</DialogTitle>
        </DialogHeader>
        
        <div className="bg-white text-black p-6 rounded-lg border space-y-4" style={{ fontFamily: 'serif' }}>
          {/* Title */}
          <div className="text-center">
            <h2 className="text-lg font-bold">DAFTAR HADIR TUKANG</h2>
            <h3 className="text-base font-bold">{batch.job_title.toUpperCase()}</h3>
          </div>
          
          {/* Info */}
          <div className="space-y-1 text-sm">
            <p>Tanggal: {receiptDateFormatted}</p>
            {batch.description && (
              <p>Keterangan: {batch.description}</p>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="border border-gray-400 p-1.5">No</th>
                  <th className="border border-gray-400 p-1.5">Nama Tukang</th>
                  <th className="border border-gray-400 p-1.5">Jabatan</th>
                  {uniqueDates.map((d, i) => (
                    <th key={i} className="border border-gray-400 p-1.5">
                      {format(d, "dd/MM")}
                    </th>
                  ))}
                  <th className="border border-gray-400 p-1.5">Total<br/>Hari</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w, i) => {
                  const workerStart = new Date(w.start_date);
                  const workerEnd = new Date(w.end_date);
                  
                  return (
                    <tr key={w.id}>
                      <td className="border border-gray-400 p-1.5 text-center">{i + 1}</td>
                      <td className="border border-gray-400 p-1.5">{w.worker_name}</td>
                      <td className="border border-gray-400 p-1.5 text-center">{w.position_type}</td>
                      {uniqueDates.map((d, di) => (
                        <td key={di} className="border border-gray-400 p-1.5 text-center">
                          {d >= workerStart && d <= workerEnd ? "✓" : ""}
                        </td>
                      ))}
                      <td className="border border-gray-400 p-1.5 text-center font-medium"></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Signatures */}
          <div className="flex justify-between mt-8 text-sm">
            {/* Kepala Sekolah (left) */}
            <div className="text-center">
              <p>Mengetahui,</p>
              <p>{(schoolSettings as any)?.headmaster_position || 'Kepala Sekolah'}</p>
              <div className="h-16"></div>
              <p className="font-bold">{schoolSettings?.headmaster_name || '(___________________)'}</p>
              {schoolSettings?.headmaster_nip && (
                <p>NIP. {schoolSettings.headmaster_nip}</p>
              )}
            </div>

            {/* Wakasek Sarpras (right) */}
            <div className="text-center">
              <p>Ciamis, {receiptDateFormatted}</p>
              <p>Wakasek Sarana Prasarana,</p>
              <div className="h-16"></div>
              <p className="font-bold">{wakasekSarpras?.full_name || '(___________________)'}</p>
              <p>NIP. {wakasekSarpras?.nip || '___________________'}</p>
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
