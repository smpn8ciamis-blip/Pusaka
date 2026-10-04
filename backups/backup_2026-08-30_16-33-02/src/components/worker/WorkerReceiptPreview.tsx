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
  daily_rate: number;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
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
  worker_payments?: WorkerPayment[];
}

interface SchoolSettings {
  school_name?: string;
  bendahara_name?: string;
  bendahara_nip?: string;
  headmaster_name?: string;
  headmaster_nip?: string;
}

interface WorkerReceiptPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  batch: WorkerPaymentBatch | null;
  schoolSettings: SchoolSettings | null;
  onDownload: () => void;
}

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

export function WorkerReceiptPreview({ isOpen, onClose, batch, schoolSettings, onDownload }: WorkerReceiptPreviewProps) {
  if (!batch) return null;

  const workers = batch.worker_payments || [];
  const receiptDateFormatted = format(new Date(batch.receipt_date), "dd MMMM yyyy", { locale: id });
  const paymentDesc = batch.description || batch.job_title;
  const pph21 = batch.tax_rate > 0 ? formatCurrency(batch.total_tax) : "-";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Kwitansi Pembayaran Tukang</DialogTitle>
        </DialogHeader>
        
        <div className="bg-white text-black p-6 rounded-lg border space-y-4" style={{ fontFamily: 'serif' }}>
          {/* Header */}
          <div className="flex justify-between items-start">
            <div></div>
            <div className="text-center flex-1">
              <h2 className="text-lg font-bold">KWITANSI PEMBAYARAN TUKANG</h2>
            </div>
            <div className="text-right text-sm">
              No TB : ........
            </div>
          </div>
          
          {/* Info */}
          <div className="space-y-1 text-sm">
            <div className="flex">
              <span className="w-40">Sudah Diterima Dari</span>
              <span className="mr-2">:</span>
              <span className="font-bold">Bendahara BOS {schoolSettings?.school_name || ''}</span>
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
                  <th className="border border-gray-400 p-2" style={{ minWidth: '120px' }}>Nama Tukang</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: '70px' }}>Jabatan</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: '100px' }}>Periode Kerja</th>
                  <th className="border border-gray-400 p-2 w-12">Hari</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: '85px' }}>Tarif/Hari</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: '85px' }}>Bruto</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: '65px' }}>Pajak</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: '85px' }}>Netto</th>
                  <th className="border border-gray-400 p-2" style={{ minWidth: '50px' }}>TTD</th>
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
                      <td className="border border-gray-400 p-2 text-center">{w.work_days}</td>
                      <td className="border border-gray-400 p-2 text-right">{formatCurrency(w.daily_rate)}</td>
                      <td className="border border-gray-400 p-2 text-right">{formatCurrency(w.gross_amount)}</td>
                      <td className="border border-gray-400 p-2 text-right">{w.tax_amount > 0 ? formatCurrency(w.tax_amount) : 'Rp 0'}</td>
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
                  <td className="border border-gray-400 p-2 text-center">{workers.reduce((sum, w) => sum + w.work_days, 0)}</td>
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
            <span className="italic">{numberToWords(batch.total_gross).charAt(0).toUpperCase() + numberToWords(batch.total_gross).slice(1)} rupiah</span>
          </div>

          {/* Tax Info */}
          <div className="text-xs text-gray-700">
            Informasi Potongan Pajak: PPh 21: {pph21} | PPh 23: - | PPN: - | Jumlah Potongan: {batch.tax_rate > 0 ? formatCurrency(batch.total_tax) : "-"}
          </div>

          {/* Signatures */}
          <div className="flex justify-between mt-8 text-sm">
            {/* Kepala Sekolah (left) */}
            <div className="text-center">
              <p>Menyetujui,</p>
              <p>{(schoolSettings as any)?.headmaster_position ? `${(schoolSettings as any).headmaster_position} ${schoolSettings?.school_name || ''}`.trim() : `Kepala ${schoolSettings?.school_name || 'Sekolah'}`}</p>
              <div className="h-20"></div>
              <p className="font-bold">{schoolSettings?.headmaster_name || '(___________________)'}</p>
              {schoolSettings?.headmaster_nip && (
                <p>NIP. {schoolSettings.headmaster_nip}</p>
              )}
            </div>

            {/* Bendahara (right) */}
            <div className="text-center">
              <p>Ciamis, {receiptDateFormatted}</p>
              <p>Bendahara BOS</p>
              <p className="text-xs mt-1">Lunas Dibayar Tanggal: {receiptDateFormatted}</p>
              <div className="h-14"></div>
              <p className="font-bold">{schoolSettings?.bendahara_name || '(___________________)'}</p>
              {schoolSettings?.bendahara_nip && (
                <p>NIP. {schoolSettings.bendahara_nip}</p>
              )}
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
