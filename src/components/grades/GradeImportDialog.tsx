import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { GradeComponent } from '@/lib/gradeComponents';
import {
  buildTemplateRows,
  matchImport,
  parseDelimited,
  type ImportResult,
  type ImportRow,
  type ImportStudent,
} from '@/lib/gradeImport';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleLabel: string;
  students: ImportStudent[];
  components: GradeComponent[];
  /** nilai yang saat ini tampil di tabel input (untuk templat terisi) */
  valueOf: (studentId: string, c: GradeComponent) => number | '' | undefined;
  /** hanya baris tanpa galat; sel kosong = tidak mengubah nilai yang ada */
  onApply: (rows: ImportRow[]) => void;
}

const MAX_BYTES = 5 * 1024 * 1024;

export function GradeImportDialog({ open, onOpenChange, scheduleLabel, students, components, valueOf, onApply }: Props) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setResult(null);
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const safeName = scheduleLabel.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'nilai';

  const downloadTemplate = (kind: 'xlsx' | 'csv') => {
    const rows = buildTemplateRows(students, components, valueOf);
    if (kind === 'csv') {
      const csv = rows.map((r) => r.map((c) => (/[",;\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `templat-nilai-${safeName}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 32 }, ...components.map(() => ({ wch: 14 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nilai');
    XLSX.writeFile(wb, `templat-nilai-${safeName}.xlsx`);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { toast.error('Berkas terlalu besar (maks. 5 MB)'); return; }
    setFileName(file.name);
    try {
      let table: string[][];
      if (/\.csv$|\.txt$/i.test(file.name)) {
        table = parseDelimited(await file.text());
      } else {
        const wb = XLSX.read(await file.arrayBuffer());
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // NIS harus tetap teks: baca sebagai string tampilan (raw:false)
        const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false });
        table = aoa.map((r) => r.map((c) => String(c ?? '')));
      }
      setResult(matchImport(table, students, components));
    } catch (e: any) {
      console.error(e);
      toast.error('Berkas tidak dapat dibaca. Gunakan templat dari tombol di atas.');
      setResult(null);
    }
  };

  const apply = () => {
    if (!result) return;
    const ok = result.rows.filter((r) => r.errors.length === 0 && r.studentId);
    if (ok.length === 0) { toast.error('Tidak ada baris yang valid'); return; }
    onApply(ok);
    toast.success(`${ok.length} siswa dimasukkan ke tabel. Periksa lalu klik Simpan Nilai.`);
    reset();
    onOpenChange(false);
  };

  const errorRows = result?.rows.filter((r) => r.errors.length > 0) ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Impor Nilai dari Excel / CSV</DialogTitle>
          <DialogDescription>
            {scheduleLabel}. Nilai dimasukkan ke tabel input dulu; belum tersimpan sampai Anda klik Simpan Nilai.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border p-3 space-y-2">
            <p className="font-medium">1. Unduh templat</p>
            <p className="text-xs text-muted-foreground">
              Berisi daftar siswa kelas ini dan satu kolom per jenis penilaian ({components.map((c) => c.name).join(', ')}), terisi nilai yang sudah ada.
              Kolom NIS dipakai untuk mencocokkan siswa; sel nilai yang dikosongkan tidak mengubah nilai lama.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => downloadTemplate('xlsx')}><Download className="h-4 w-4" />Excel (.xlsx)</Button>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => downloadTemplate('csv')}><Download className="h-4 w-4" />CSV</Button>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <p className="font-medium">2. Unggah berkas yang sudah diisi</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {fileName && <p className="text-xs text-muted-foreground flex items-center gap-1"><Upload className="h-3 w-3" />{fileName}</p>}
          </div>

          {result?.fatal && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{result.fatal}</p>}

          {result && !result.fatal && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-green-50 px-3 py-1 font-semibold text-green-700">{result.okCount} siswa siap dimasukkan</span>
                {result.errorCount > 0 && <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700">{result.errorCount} baris bermasalah (dilewati)</span>}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Kolom terbaca: {result.matchedColumns.map((c) => (c.header === c.component ? c.component : `${c.header} → ${c.component}`)).join(', ')}</p>
                {result.missingComponents.length > 0 && <p>Tidak ada kolomnya di berkas (nilai tidak berubah): {result.missingComponents.join(', ')}</p>}
                {result.ignoredHeaders.length > 0 && <p>Kolom diabaikan: {result.ignoredHeaders.join(', ')}</p>}
              </div>
              {errorRows.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left"><tr><th className="p-2 w-16">Baris</th><th className="p-2">Siswa</th><th className="p-2">Masalah</th></tr></thead>
                    <tbody>
                      {errorRows.map((r) => (
                        <tr key={r.line} className="border-t align-top">
                          <td className="p-2">{r.line}</td>
                          <td className="p-2">{r.name || r.nis || '-'}</td>
                          <td className="p-2 text-red-700">{r.errors.join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="button" className="bg-gradient-primary" disabled={!result || !!result.fatal || result.okCount === 0} onClick={apply}>
            Masukkan ke tabel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
