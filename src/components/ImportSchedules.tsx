import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ImportSchedulesProps {
  academicYear: string; // dari filter aktif di halaman
  semester: number; // dari filter aktif di halaman
  onSuccess?: () => void;
}

type ScheduleInsert = {
  day_of_week: number;
  class_id: string;
  teacher_id: string;
  subject: string;
  start_time: string;
  end_time: string;
  semester: number;
  academic_year: string;
};

interface Issue {
  line: number;
  message: string;
}

interface Preview {
  fileName: string;
  totalRows: number;
  valid: ScheduleInsert[];
  errors: Issue[];
  warnings: Issue[];
  duplicates: number;
}

type Slot = { start: string; end: string; label: string };

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 3000;
const INSERT_CHUNK = 100;
const PAGE_SIZE = 1000; // batas default Supabase per request
const DAY_NAMES = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

// Alias header kolom (sudah dinormalisasi: huruf kecil, tanpa spasi/simbol)
const COL = {
  day: ['hari', 'hari16', 'hari17'],
  class: ['kelas'],
  subject: ['matapelajaran', 'mapel'],
  teacherName: ['namaguru', 'guru'],
  nip: ['nipguru', 'nip'],
  start: ['jammulai', 'mulai'],
  end: ['jamselesai', 'selesai'],
};

// ---------- helpers ----------
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const normKey = (v: unknown) => norm(v).replace(/[^a-z0-9]/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
const errMsg = (e: unknown) => (e as any)?.message ?? String(e);

const pick = (r: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) if (k in r) return r[k];
  return '';
};

// Terima "07:30", "7:30", "07.30", "07:30:00", dan angka pecahan Excel (0.3125)
const parseTime = (v: unknown): string | null => {
  if (typeof v === 'number') {
    let frac: number;
    if (v > 0 && v < 1) frac = v;
    else if (v >= 36526) frac = v - Math.floor(v); // serial tanggal+waktu
    else return null; // mis. 7.3 -> ambigu, tolak
    const total = Math.round(frac * 1440);
    return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
  }
  const m = String(v ?? '')
    .trim()
    .match(/^(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*\d{2})?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
};

// Terima 1-6 atau nama hari (Senin..Sabtu)
const parseDay = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 6 ? v : null;
  const s = norm(v);
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return n >= 1 && n <= 6 ? n : null;
  }
  const idx = DAY_NAMES.indexOf(s.replace(/[^a-z]/g, ''));
  return idx >= 0 ? idx + 1 : null;
};

// Ambil semua baris dengan paginasi (Supabase membatasi 1000 baris/request)
async function fetchAll<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

const overlaps = (list: Slot[] | undefined, s: string, e: string) =>
  list?.find((x) => s < x.end && x.start < e);

const addSlot = (map: Map<string, Slot[]>, key: string, slot: Slot) => {
  const list = map.get(key);
  if (list) list.push(slot);
  else map.set(key, [slot]);
};

// ---------- component ----------
export const ImportSchedules = ({ academicYear, semester, onSuccess }: ImportSchedulesProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const semesterLabel = semester === 2 ? 'Genap' : 'Ganjil';

  const handleOpenChange = (open: boolean) => {
    if (isProcessing) return; // jangan tutup saat proses berjalan
    setIsOpen(open);
    if (!open) {
      setPreview(null);
      setProgress(null);
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        'Hari (1-6)': 1,
        Kelas: '7A',
        'Mata Pelajaran': 'Matematika',
        'Nama Guru': 'John Doe',
        'NIP Guru': '123456789',
        'Jam Mulai': '07:30',
        'Jam Selesai': '09:00',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'template-jadwal.xlsx');
    toast.success('Template berhasil diunduh');
  };

  const downloadReport = () => {
    if (!preview) return;
    const rows = [
      ...preview.errors.map((i) => ({ Baris: i.line, Jenis: 'Error', Keterangan: i.message })),
      ...preview.warnings.map((i) => ({ Baris: i.line, Jenis: 'Peringatan', Keterangan: i.message })),
    ].sort((a, b) => a.Baris - b.Baris);
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 80 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
    XLSX.writeFile(wb, 'laporan-import-jadwal.xlsx');
  };

  // Validasi seluruh file tanpa menulis ke database
  const buildPreview = async (fileName: string, rawRows: Record<string, unknown>[]): Promise<Preview> => {
    // Cek header
    const headers = new Set(Object.keys(rawRows[0]).map(normKey));
    const has = (keys: string[]) => keys.some((k) => headers.has(k));
    const missing: string[] = [];
    if (!has(COL.day)) missing.push('Hari');
    if (!has(COL.class)) missing.push('Kelas');
    if (!has(COL.subject)) missing.push('Mata Pelajaran');
    if (!has(COL.start)) missing.push('Jam Mulai');
    if (!has(COL.end)) missing.push('Jam Selesai');
    if (!has(COL.nip) && !has(COL.teacherName)) missing.push('NIP Guru atau Nama Guru');
    if (missing.length) throw new Error(`Kolom tidak ditemukan: ${missing.join(', ')}`);

    // Data referensi (dengan paginasi)
    const [classes, teachers, profiles, existing] = await Promise.all([
      fetchAll<{ id: string; name: string }>((f, t) =>
        supabase.from('classes').select('id, name').eq('academic_year', academicYear).order('id').range(f, t)
      ),
      fetchAll<{ id: string; nip: string | null; user_id: string }>((f, t) =>
        supabase.from('teachers').select('id, nip, user_id').order('id').range(f, t)
      ),
      fetchAll<{ id: string; full_name: string | null }>((f, t) =>
        supabase.from('profiles').select('id, full_name').order('id').range(f, t)
      ),
      fetchAll<any>((f, t) =>
        supabase
          .from('schedules')
          .select('id, class_id, teacher_id, day_of_week, start_time, end_time, subject')
          .eq('academic_year', academicYear)
          .eq('semester', semester)
          .order('id')
          .range(f, t)
      ),
    ]);

    // Peta kelas (nama dinormalisasi, deteksi nama ganda)
    const classByName = new Map<string, string[]>();
    const classNameById = new Map<string, string>();
    classes.forEach((c) => {
      const k = normKey(c.name);
      classByName.set(k, [...(classByName.get(k) ?? []), c.id]);
      classNameById.set(c.id, c.name);
    });

    // Peta guru: NIP (hanya yang terisi) dan nama
    const profileName = new Map(profiles.map((p) => [p.id, normKey(p.full_name)]));
    const teacherByNip = new Map<string, string>();
    const teacherByName = new Map<string, string[]>();
    teachers.forEach((t) => {
      const nip = normKey(t.nip);
      if (nip) teacherByNip.set(nip, t.id);
      const name = profileName.get(t.user_id);
      if (name) teacherByName.set(name, [...(teacherByName.get(name) ?? []), t.id]);
    });

    // Seed pengecekan bentrok & duplikat dengan jadwal yang sudah ada
    const classSlots = new Map<string, Slot[]>();
    const teacherSlots = new Map<string, Slot[]>();
    const seen = new Set<string>();
    existing.forEach((s) => {
      const start = String(s.start_time).slice(0, 5);
      const end = String(s.end_time).slice(0, 5);
      const label = `jadwal yang sudah ada (${s.subject} ${start}-${end})`;
      addSlot(classSlots, `${s.class_id}|${s.day_of_week}`, { start, end, label });
      addSlot(teacherSlots, `${s.teacher_id}|${s.day_of_week}`, { start, end, label });
      seen.add(`${s.class_id}|${s.day_of_week}|${start}|${end}|${normKey(s.subject)}|${s.teacher_id}`);
    });

    const valid: ScheduleInsert[] = [];
    const errors: Issue[] = [];
    const warnings: Issue[] = [];
    let duplicates = 0;

    rawRows.forEach((raw, i) => {
      const line = (raw as any).__rowNum__ != null ? (raw as any).__rowNum__ + 1 : i + 2;
      const fail = (message: string) => errors.push({ line, message });

      // Normalisasi nama kolom
      const r: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) r[normKey(k)] = v;

      // Hari
      const day = parseDay(pick(r, COL.day));
      if (day == null) return fail(`hari "${pick(r, COL.day)}" tidak valid (harus 1-6 atau Senin-Sabtu)`);

      // Kelas
      const className = String(pick(r, COL.class) ?? '').trim();
      if (!className) return fail('kelas kosong');
      const classIds = classByName.get(normKey(className));
      if (!classIds) return fail(`kelas "${className}" tidak ada di TP ${academicYear}`);
      if (classIds.length > 1) return fail(`nama kelas "${className}" ganda di TP ${academicYear}`);
      const classId = classIds[0];

      // Mata pelajaran
      const subject = String(pick(r, COL.subject) ?? '').trim();
      if (!subject) return fail('mata pelajaran kosong');

      // Jam
      const start = parseTime(pick(r, COL.start));
      const end = parseTime(pick(r, COL.end));
      if (!start) return fail(`jam mulai "${pick(r, COL.start)}" tidak valid (format HH:MM)`);
      if (!end) return fail(`jam selesai "${pick(r, COL.end)}" tidak valid (format HH:MM)`);
      if (start >= end) return fail(`jam selesai (${end}) harus setelah jam mulai (${start})`);

      // Guru: NIP dulu, kalau kosong pakai nama
      const nipRaw = pick(r, COL.nip);
      if (typeof nipRaw === 'number' && !Number.isSafeInteger(nipRaw)) {
        return fail('NIP terbaca sebagai angka dan digitnya terpotong; ubah format kolom NIP menjadi Teks');
      }
      const nip = normKey(nipRaw);
      const nameRaw = String(pick(r, COL.teacherName) ?? '').trim();
      let teacherId: string | undefined;
      if (nip) {
        teacherId = teacherByNip.get(nip);
        if (!teacherId) return fail(`NIP "${nipRaw}" tidak ditemukan`);
      } else {
        if (!nameRaw) return fail('NIP dan Nama Guru sama-sama kosong');
        const ids = teacherByName.get(normKey(nameRaw));
        if (!ids) return fail(`guru "${nameRaw}" tidak ditemukan`);
        if (ids.length > 1) return fail(`nama guru "${nameRaw}" ganda, isi NIP`);
        teacherId = ids[0];
      }

      // Duplikat persis (sudah ada di DB atau di file ini): dilewati diam-diam
      const dupKey = `${classId}|${day}|${start}|${end}|${normKey(subject)}|${teacherId}`;
      if (seen.has(dupKey)) {
        duplicates++;
        return;
      }

      // Bentrok kelas = error
      const classHit = overlaps(classSlots.get(`${classId}|${day}`), start, end);
      if (classHit) {
        return fail(`kelas ${classNameById.get(classId)} bentrok dengan ${classHit.label}`);
      }

      // Bentrok guru = peringatan (tetap diimport)
      const teacherHit = overlaps(teacherSlots.get(`${teacherId}|${day}`), start, end);
      if (teacherHit) {
        warnings.push({ line, message: `guru bentrok dengan ${teacherHit.label}` });
      }

      seen.add(dupKey);
      addSlot(classSlots, `${classId}|${day}`, { start, end, label: `baris ${line}` });
      addSlot(teacherSlots, `${teacherId}|${day}`, { start, end, label: `baris ${line}` });

      valid.push({
        day_of_week: day,
        class_id: classId,
        teacher_id: teacherId,
        subject,
        start_time: start,
        end_time: end,
        semester,
        academic_year: academicYear,
      });
    });

    return { fileName, totalRows: rawRows.length, valid, errors, warnings, duplicates };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setPreview(null);
    try {
      if (!academicYear) throw new Error('Tahun ajaran belum dipilih');
      if (semester !== 1 && semester !== 2) throw new Error('Semester tidak valid');
      if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('File harus berformat .xlsx atau .xls');
      if (file.size > MAX_FILE_SIZE) throw new Error('Ukuran file maksimal 5 MB');

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      if (workbook.SheetNames.length === 0) throw new Error('File tidak punya sheet');
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      const rows = (XLSX.utils.sheet_to_json(worksheet, { defval: '', blankrows: false }) as Record<
        string,
        unknown
      >[]).filter((row) => Object.values(row).some((v) => String(v ?? '').trim() !== ''));

      if (rows.length === 0) throw new Error('File Excel kosong');
      if (rows.length > MAX_ROWS) throw new Error(`Maksimal ${MAX_ROWS} baris per import (file ini ${rows.length})`);

      setPreview(await buildPreview(file.name, rows));
    } catch (err) {
      toast.error('Gagal membaca file: ' + errMsg(err));
    } finally {
      setIsProcessing(false);
      input.value = ''; // supaya file yang sama bisa dipilih ulang
    }
  };

  const handleConfirm = async () => {
    if (!preview || preview.valid.length === 0 || isProcessing) return;
    const rows = preview.valid;
    const insertedIds: string[] = [];

    setIsProcessing(true);
    setProgress({ done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK);
        const { data, error } = await supabase.from('schedules').insert(chunk).select('id');
        if (error) throw error;
        data?.forEach((r: any) => insertedIds.push(r.id));
        setProgress({ done: Math.min(i + INSERT_CHUNK, rows.length), total: rows.length });
      }

      toast.success(`${rows.length} jadwal berhasil diimport`);
      setPreview(null);
      setProgress(null);
      setIsOpen(false);
      onSuccess?.();
    } catch (err) {
      // Batalkan batch yang sudah masuk supaya tidak ada import setengah jalan
      let rollbackFailed = 0;
      for (let i = 0; i < insertedIds.length; i += INSERT_CHUNK) {
        const ids = insertedIds.slice(i, i + INSERT_CHUNK);
        const { error } = await supabase.from('schedules').delete().in('id', ids);
        if (error) rollbackFailed += ids.length;
      }
      if (rollbackFailed > 0) {
        toast.error(
          `Import gagal: ${errMsg(err)}. ${rollbackFailed} jadwal sudah masuk dan gagal dibatalkan otomatis, cek tabel jadwal.`
        );
        onSuccess?.();
      } else {
        toast.error(`Import gagal dan dibatalkan, tidak ada data yang tersimpan: ${errMsg(err)}`);
      }
      setProgress(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const issues = preview ? [...preview.errors.map((i) => ({ ...i, type: 'error' as const })), ...preview.warnings.map((i) => ({ ...i, type: 'warn' as const }))].sort((a, b) => a.line - b.line) : [];

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Import Jadwal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Jadwal dari Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Jadwal akan masuk ke TP <span className="font-medium text-foreground">{academicYear || '-'}</span>, Semester{' '}
            <span className="font-medium text-foreground">{semesterLabel}</span> (mengikuti filter di halaman).
          </p>

          {!preview && (
            <>
              <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2" disabled={isProcessing}>
                <Download className="h-4 w-4" />
                Download Template
              </Button>
              <div className="space-y-2">
                <p className="text-sm font-medium">Upload File Excel</p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={isProcessing || !academicYear}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                />
                {isProcessing && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memeriksa file...
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-muted p-3">
                <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                  <li>Hari: 1-6 (1 = Senin) atau nama hari</li>
                  <li>Guru: isi NIP, atau kosongkan NIP dan isi Nama Guru sesuai profil</li>
                  <li>Format NIP kolom sebagai Teks agar digit tidak terpotong</li>
                  <li>Jam: HH:MM, contoh 07:30</li>
                  <li>Kelas harus sudah ada di TP yang dipilih</li>
                </ul>
              </div>
            </>
          )}

          {preview && (
            <>
              <p className="truncate text-xs text-muted-foreground">{preview.fileName}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Siap diimport</div>
                  <div className="text-lg font-semibold">{preview.valid.length}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Bermasalah</div>
                  <div className={`text-lg font-semibold ${preview.errors.length ? 'text-destructive' : ''}`}>
                    {preview.errors.length}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Sudah ada (dilewati)</div>
                  <div className="text-lg font-semibold">{preview.duplicates}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Peringatan guru bentrok</div>
                  <div className="text-lg font-semibold">{preview.warnings.length}</div>
                </div>
              </div>

              {issues.length > 0 && (
                <div className="space-y-2">
                  <div className="max-h-48 overflow-y-auto rounded-md border p-2 text-xs">
                    {issues.slice(0, 100).map((i, idx) => (
                      <p key={idx} className={i.type === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
                        Baris {i.line}: {i.message}
                      </p>
                    ))}
                    {issues.length > 100 && (
                      <p className="mt-1 text-muted-foreground">... dan {issues.length - 100} lainnya (lihat laporan)</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadReport} disabled={isProcessing}>
                    <Download className="mr-2 h-4 w-4" />
                    Unduh laporan
                  </Button>
                </div>
              )}

              {progress && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan {progress.done} / {progress.total}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setPreview(null)} disabled={isProcessing}>
                  Pilih file lain
                </Button>
                <Button onClick={handleConfirm} disabled={isProcessing || preview.valid.length === 0}>
                  {preview.errors.length > 0
                    ? `Import ${preview.valid.length} baris valid (lewati ${preview.errors.length})`
                    : `Import ${preview.valid.length} jadwal`}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
