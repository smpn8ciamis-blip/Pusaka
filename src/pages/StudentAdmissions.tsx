import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { AlertTriangle, Loader2, Pencil, Plus, Search, Settings2, Trash2, UserPlus, Wand2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { DataPagination } from '@/components/ui/data-pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useStudentIntake } from '@/hooks/useStudentIntake';
import { useDirectoryStudents } from '@/hooks/useStudentDirectory';
import { isActiveStudent } from '@/lib/studentDirectory';
import { cleanPhoneNumber, isValidPhoneNumber } from '@/lib/phone';
import { cohortYearFor, renderNis, suggestNis, validateNisPattern } from '@/lib/nis';
import { toTitleCase } from '@/lib/utils';

// Tabel/RPC baru belum ada di types.ts yang digenerate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ClassRow { id: string; name: string; grade: number; academic_year: string | null }

interface Admission {
  id: string;
  student_id: string;
  class_id: string | null;
  admission_date: string;
  academic_year: string | null;
  semester: number | null;
  origin_school: string;
  origin_class: string | null;
  transfer_letter_no: string | null;
  transfer_letter_date: string | null;
  reason: string | null;
  notes: string | null;
  assigned_nis: string | null;
  students: { full_name: string; nis: string; nisn: string | null; status: string | null } | null;
  classes: { name: string } | null;
}

const today = () => format(new Date(), 'yyyy-MM-dd');

const EMPTY_FORM = {
  class_id: '', nis: '', nisn: '', full_name: '', gender: '', birth_place: '', birth_date: '',
  address: '', parent_name: '', parent_phone: '',
  admission_date: today(), origin_school: '', origin_class: '', transfer_letter_no: '', transfer_letter_date: '', reason: '', notes: '',
};
type FormState = typeof EMPTY_FORM;

const errMsg = (e: unknown) => (e as { message?: string })?.message ?? 'Terjadi kesalahan';

/* ------------------------------------------------------------------ */
/* Form catat mutasi masuk                                             */
/* ------------------------------------------------------------------ */
function AdmissionFormDialog({
  open, onOpenChange, classes,
}: { open: boolean; onOpenChange: (o: boolean) => void; classes: ClassRow[] }) {
  const queryClient = useQueryClient();
  const { settings } = useStudentIntake();
  const { data: students = [] } = useDirectoryStudents();
  const [f, setF] = useState<FormState>(EMPTY_FORM);
  const [nisTouched, setNisTouched] = useState(false);

  useEffect(() => {
    if (open) { setF({ ...EMPTY_FORM, admission_date: today() }); setNisTouched(false); }
  }, [open]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const cls = classes.find((c) => c.id === f.class_id);
  const pattern = settings?.nis_pattern ?? '{TAHUN}{URUT:3}';

  const gradeByClass = useMemo(() => new Map(classes.map((c) => [c.id, c.grade])), [classes]);
  const nisOwner = useMemo(() => new Map(students.map((s) => [s.nis.trim(), s.full_name])), [students]);

  // NIS terakhir siswa AKTIF di tingkat yang sama + saran NIS berikutnya
  const suggestion = useMemo(() => {
    if (!cls) return null;
    const peers = students
      .filter((s) => isActiveStudent(s) && s.class_id && gradeByClass.get(s.class_id) === cls.grade)
      .map((s) => ({ nis: s.nis, name: s.full_name }));
    return suggestNis({
      pattern,
      ctx: { cohortYear: cohortYearFor(settings?.academic_year, cls.grade), grade: cls.grade },
      peers,
      usedNis: students.map((s) => s.nis),
    });
  }, [cls, students, gradeByClass, pattern, settings?.academic_year]);

  // isi NIS otomatis selama belum diubah manual
  useEffect(() => {
    if (suggestion && !nisTouched) setF((p) => (p.nis === suggestion.suggested ? p : { ...p, nis: suggestion.suggested }));
  }, [suggestion, nisTouched]);

  const nisTrim = f.nis.trim();
  const nisTakenBy = nisTrim ? nisOwner.get(nisTrim) : undefined;
  const phoneClean = cleanPhoneNumber(f.parent_phone);
  const phoneOk = isValidPhoneNumber(phoneClean);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc('mutasi_masuk_create', {
        p: { ...f, nis: nisTrim, parent_phone: phoneClean },
      });
      if (error) throw error;
      return data as { nis: string };
    },
    onSuccess: (r) => {
      ['mutasi-masuk', 'student-directory', 'students', 'students-count', 'active-students-for-mutation'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(`Mutasi masuk dicatat. NIS ${r.nis}`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const missing =
    !f.class_id ? 'Pilih kelas tujuan'
      : !nisTrim ? 'NIS wajib diisi'
        : nisTakenBy ? `NIS sudah dipakai ${nisTakenBy}`
          : !f.full_name.trim() ? 'Nama lengkap wajib diisi'
            : !f.gender ? 'Pilih jenis kelamin'
              : !f.origin_school.trim() ? 'Sekolah asal wajib diisi'
                : !phoneOk ? 'No. HP orang tua harus 9–15 digit'
                  : '';

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="flex max-h-[94dvh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-6 pb-3 pr-12 pt-6">
          <DialogTitle>Catat Mutasi Masuk</DialogTitle>
          <DialogDescription>
            Siswa pindahan yang masuk pada tahun ajaran {settings?.academic_year ?? '—'}, semester {settings?.semester ?? '—'}.
            Siswa baru dibuat dengan status aktif.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-4">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Kelas tujuan & NIS</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Kelas tujuan *</Label>
                <Select value={f.class_id} onValueChange={(v) => { set('class_id', v); setNisTouched(false); }}>
                  <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} (tingkat {c.grade})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mm-nis">NIS *</Label>
                <div className="flex gap-2">
                  <Input id="mm-nis" value={f.nis} onChange={(e) => { set('nis', e.target.value); setNisTouched(true); }} placeholder="Pilih kelas dulu" aria-invalid={!!nisTakenBy} />
                  <Button
                    type="button" variant="outline" size="icon" title="Pakai saran NIS" aria-label="Pakai saran NIS"
                    disabled={!suggestion}
                    onClick={() => { if (suggestion) { set('nis', suggestion.suggested); setNisTouched(false); } }}
                  >
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </div>
                {nisTakenBy && <p className="text-xs text-destructive">NIS ini sudah dipakai {nisTakenBy}.</p>}
              </div>
            </div>
            {suggestion && cls && (
              <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                {suggestion.last ? (
                  <p>
                    NIS terakhir siswa aktif tingkat {cls.grade}: <b className="text-foreground">{suggestion.last.nis}</b> ({toTitleCase(suggestion.last.name)}),
                    dari {suggestion.peers} siswa aktif.
                  </p>
                ) : (
                  <p>Belum ada siswa aktif di tingkat {cls.grade}; NIS dibuat dari pola <code>{pattern}</code>.</p>
                )}
                <p>
                  Saran NIS berikutnya: <b className="text-foreground">{suggestion.suggested}</b>. NIS boleh diubah untuk menyesuaikan.
                </p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Data siswa</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mm-name">Nama lengkap *</Label>
                <Input id="mm-name" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Jenis kelamin *</Label>
                <Select value={f.gender} onValueChange={(v) => set('gender', v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L">Laki-laki</SelectItem>
                    <SelectItem value="P">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mm-nisn">NISN</Label>
                <Input id="mm-nisn" value={f.nisn} onChange={(e) => set('nisn', e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mm-bp">Tempat lahir</Label>
                <Input id="mm-bp" value={f.birth_place} onChange={(e) => set('birth_place', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mm-bd">Tanggal lahir</Label>
                <Input id="mm-bd" type="date" value={f.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mm-addr">Alamat</Label>
                <Textarea id="mm-addr" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mm-pn">Nama orang tua/wali</Label>
                <Input id="mm-pn" value={f.parent_name} onChange={(e) => set('parent_name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mm-pp">No. HP orang tua/wali</Label>
                <Input id="mm-pp" value={f.parent_phone} onChange={(e) => set('parent_phone', e.target.value)} inputMode="tel" aria-invalid={!phoneOk} />
                {!phoneOk && <p className="text-xs text-destructive">Nomor harus 9–15 digit.</p>}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Data kepindahan</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mm-os">Sekolah asal *</Label>
                <Input id="mm-os" value={f.origin_school} onChange={(e) => set('origin_school', e.target.value)} placeholder="Contoh: SMPN 1 Tasikmalaya" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mm-oc">Kelas asal</Label>
                <Input id="mm-oc" value={f.origin_class} onChange={(e) => set('origin_class', e.target.value)} placeholder="Contoh: VIII-2" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mm-ad">Tanggal masuk *</Label>
                <Input id="mm-ad" type="date" value={f.admission_date} onChange={(e) => set('admission_date', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mm-ln">Nomor surat pindah</Label>
                <Input id="mm-ln" value={f.transfer_letter_no} onChange={(e) => set('transfer_letter_no', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mm-ld">Tanggal surat pindah</Label>
                <Input id="mm-ld" type="date" value={f.transfer_letter_date} onChange={(e) => set('transfer_letter_date', e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mm-rs">Alasan pindah</Label>
                <Input id="mm-rs" value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Contoh: mengikuti tugas orang tua" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mm-nt">Catatan</Label>
                <Textarea id="mm-nt" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 items-center gap-2 border-t px-6 py-4 sm:justify-between">
          <span className="text-xs text-destructive">{missing}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Batal</Button>
            <Button onClick={() => save.mutate()} disabled={!!missing || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan Mutasi Masuk
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Ubah keterangan kepindahan                                          */
/* ------------------------------------------------------------------ */
function EditAdmissionDialog({ item, onClose }: { item: Admission | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({ admission_date: '', origin_school: '', origin_class: '', transfer_letter_no: '', transfer_letter_date: '', reason: '', notes: '' });

  useEffect(() => {
    if (item) {
      setF({
        admission_date: item.admission_date, origin_school: item.origin_school, origin_class: item.origin_class ?? '',
        transfer_letter_no: item.transfer_letter_no ?? '', transfer_letter_date: item.transfer_letter_date ?? '',
        reason: item.reason ?? '', notes: item.notes ?? '',
      });
    }
  }, [item]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('student_admissions').update({
        admission_date: f.admission_date, origin_school: f.origin_school.trim(),
        origin_class: f.origin_class.trim() || null, transfer_letter_no: f.transfer_letter_no.trim() || null,
        transfer_letter_date: f.transfer_letter_date || null, reason: f.reason.trim() || null, notes: f.notes.trim() || null,
      }).eq('id', item!.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mutasi-masuk'] }); toast.success('Keterangan diperbarui'); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ubah Keterangan Mutasi Masuk</DialogTitle>
          <DialogDescription>
            {item?.students ? `${toTitleCase(item.students.full_name)} • NIS ${item.students.nis}. ` : ''}
            Data pribadi, kelas, dan NIS siswa diubah di menu Siswa.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Sekolah asal *</Label><Input value={f.origin_school} onChange={(e) => set('origin_school', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Kelas asal</Label><Input value={f.origin_class} onChange={(e) => set('origin_class', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Tanggal masuk *</Label><Input type="date" value={f.admission_date} onChange={(e) => set('admission_date', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Nomor surat pindah</Label><Input value={f.transfer_letter_no} onChange={(e) => set('transfer_letter_no', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Tanggal surat pindah</Label><Input type="date" value={f.transfer_letter_date} onChange={(e) => set('transfer_letter_date', e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Alasan pindah</Label><Input value={f.reason} onChange={(e) => set('reason', e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Catatan</Label><Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Batal</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !f.origin_school.trim() || !f.admission_date}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Pengaturan (admin): pola NIS & penerimaan awal tahun ajaran         */
/* ------------------------------------------------------------------ */
function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const { settings } = useStudentIntake();
  const [pattern, setPattern] = useState('{TAHUN}{URUT:3}');
  const [allow, setAllow] = useState(false);

  useEffect(() => {
    if (open && settings) { setPattern(settings.nis_pattern); setAllow(settings.allow_direct); }
  }, [open, settings]);

  const patternError = validateNisPattern(pattern);
  const sample = useMemo(
    () => (patternError ? '' : renderNis(pattern, { cohortYear: cohortYearFor(settings?.academic_year, 7), grade: 7 }, 12)),
    [pattern, patternError, settings?.academic_year],
  );

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('mutasi_masuk_save_settings', { p_pattern: pattern.trim(), p_allow: allow });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mutasi-masuk-settings'] }); toast.success('Pengaturan disimpan'); onOpenChange(false); },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pengaturan Mutasi Masuk</DialogTitle>
          <DialogDescription>Hanya admin yang dapat mengubah pengaturan ini.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="nis-pattern">Pola NIS</Label>
            <Input id="nis-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} maxLength={40} aria-invalid={!!patternError} />
            {patternError
              ? <p className="text-xs text-destructive">{patternError}</p>
              : <p className="text-xs text-muted-foreground">Contoh hasil (tingkat 7, nomor 12): <b className="text-foreground">{sample}</b></p>}
            <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              <p><code>{'{TAHUN}'}</code> tahun masuk angkatan • <code>{'{YY}'}</code> 2 digit tahun • <code>{'{TINGKAT}'}</code> tingkat kelas • <code>{'{URUT:3}'}</code> nomor urut 3 digit.</p>
              <p className="mt-1">
                Saran NIS melanjutkan <b>NIS terakhir siswa aktif di tingkat yang sama</b>; pola dipakai untuk membaca NIS yang ada
                dan untuk membuat NIS pertama bila belum ada siswa di tingkat itu.
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-md border p-3 text-sm">
            <span>
              Penerimaan awal tahun ajaran
              <span className="block text-xs text-muted-foreground">
                Bila menyala, siswa baru boleh ditambahkan langsung di menu Siswa (form & impor) dan Editor Data Massal, misalnya untuk impor
                peserta didik baru. Matikan lagi setelah selesai agar siswa baru hanya lewat Mutasi Masuk.
              </span>
            </span>
            <Switch checked={allow} onCheckedChange={setAllow} />
          </label>
          {allow && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Selama menyala, siapa pun dengan akses tambah siswa dapat menambah siswa tanpa catatan mutasi.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Batal</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !!patternError}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman                                                             */
/* ------------------------------------------------------------------ */
export default function StudentAdmissions() {
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const { settings } = useStudentIntake();
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  const [formOpen, setFormOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<Admission | null>(null);
  const [deleting, setDeleting] = useState<Admission | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date-desc');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const { data: admissions = [], isLoading, isError } = useQuery({
    queryKey: ['mutasi-masuk'],
    queryFn: async (): Promise<Admission[]> => {
      const { data, error } = await db
        .from('student_admissions')
        .select('*, students(full_name, nis, nisn, status), classes(name)')
        .order('admission_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Admission[];
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ['mutasi-masuk-classes', settings?.academic_year ?? null],
    enabled: !!settings,
    queryFn: async (): Promise<ClassRow[]> => {
      let q = supabase.from('classes').select('id, name, grade, academic_year').order('grade').order('name');
      if (settings?.academic_year) q = q.eq('academic_year', settings.academic_year);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const remove = useMutation({
    mutationFn: async (a: Admission) => {
      const { error } = await db.from('student_admissions').delete().eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mutasi-masuk'] }); toast.success('Catatan dihapus (data siswa tetap ada)'); setDeleting(null); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = admissions.filter((a) =>
      !term || `${a.students?.full_name ?? ''} ${a.students?.nis ?? ''} ${a.students?.nisn ?? ''} ${a.origin_school} ${a.transfer_letter_no ?? ''} ${a.classes?.name ?? ''}`.toLowerCase().includes(term));
    const [key, dir] = sort.split('-') as ['date' | 'name' | 'school', 'asc' | 'desc'];
    const m = dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = key === 'name' ? a.students?.full_name ?? '' : key === 'school' ? a.origin_school : a.admission_date;
      const vb = key === 'name' ? b.students?.full_name ?? '' : key === 'school' ? b.origin_school : b.admission_date;
      return va.localeCompare(vb, 'id', { numeric: true }) * m;
    });
  }, [admissions, search, sort]);

  useEffect(() => { setPage(1); }, [search, sort, pageSize]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold"><UserPlus className="h-6 w-6 text-primary" /> Mutasi Masuk</h1>
            <p className="text-sm text-muted-foreground">
              Siswa pindahan yang masuk saat tahun ajaran {settings?.academic_year ?? '—'} (semester {settings?.semester ?? '—'}) berjalan dicatat di sini; NIS dibuat otomatis.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="mr-2 h-4 w-4" /> Pengaturan
              </Button>
            )}
            <Button onClick={() => setFormOpen(true)} disabled={!settings}>
              <Plus className="mr-2 h-4 w-4" /> Catat Mutasi Masuk
            </Button>
          </div>
        </div>

        {settings?.allow_direct && (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            “Penerimaan awal tahun ajaran” sedang menyala: siswa baru juga bisa ditambahkan langsung di menu Siswa. {isAdmin ? 'Matikan di Pengaturan bila sudah selesai.' : 'Minta admin mematikannya bila sudah selesai.'}
          </p>
        )}

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Cari nama, NIS, sekolah asal, atau nomor surat…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger><SelectValue placeholder="Urutkan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Tanggal masuk (terbaru)</SelectItem>
                <SelectItem value="date-asc">Tanggal masuk (terlama)</SelectItem>
                <SelectItem value="name-asc">Nama A–Z</SelectItem>
                <SelectItem value="name-desc">Nama Z–A</SelectItem>
                <SelectItem value="school-asc">Sekolah asal A–Z</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : isError ? (
          <Card><CardContent className="py-10 text-center text-destructive">
            Gagal memuat data. Pastikan migrasi <code>20261105100000_mutasi_masuk.sql</code> sudah dijalankan.
          </CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0 sm:p-2">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Tgl masuk</TableHead>
                      <TableHead className="min-w-[180px]">Nama</TableHead>
                      <TableHead>NIS</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead className="min-w-[160px]">Sekolah asal</TableHead>
                      <TableHead className="min-w-[140px]">Surat pindah</TableHead>
                      <TableHead className="w-24 text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        {admissions.length === 0 ? 'Belum ada mutasi masuk. Klik “Catat Mutasi Masuk”.' : 'Tidak ada data yang cocok.'}
                      </TableCell></TableRow>
                    ) : pageItems.map((a, i) => (
                      <TableRow key={a.id}>
                        <TableCell>{(safePage - 1) * pageSize + i + 1}</TableCell>
                        <TableCell className="whitespace-nowrap">{format(new Date(a.admission_date), 'd MMM yyyy', { locale: localeId })}</TableCell>
                        <TableCell className="font-medium">
                          {a.students ? toTitleCase(a.students.full_name) : '-'}
                          {a.students && (a.students.status ?? 'aktif') !== 'aktif' && <Badge variant="secondary" className="ml-2 text-[10px]">{a.students.status}</Badge>}
                          {a.academic_year && <p className="text-xs font-normal text-muted-foreground">{a.academic_year} • smt {a.semester ?? '-'}</p>}
                        </TableCell>
                        <TableCell>{a.students?.nis ?? a.assigned_nis ?? '-'}</TableCell>
                        <TableCell>{a.classes?.name ?? '-'}</TableCell>
                        <TableCell>
                          {a.origin_school}
                          {a.origin_class && <p className="text-xs text-muted-foreground">Kelas {a.origin_class}</p>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {a.transfer_letter_no ?? <span className="text-muted-foreground">-</span>}
                          {a.transfer_letter_date && <p className="text-xs text-muted-foreground">{format(new Date(a.transfer_letter_date), 'd MMM yyyy', { locale: localeId })}</p>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(a)} aria-label="Ubah keterangan"><Pencil className="h-4 w-4" /></Button>
                          {isAdmin && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleting(a)} aria-label="Hapus catatan"><Trash2 className="h-4 w-4" /></Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="px-4 pb-4">
                <DataPagination
                  currentPage={safePage} totalPages={totalPages} totalItems={rows.length} pageSize={pageSize}
                  onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={[10, 25, 50, 100]}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <AdmissionFormDialog open={formOpen} onOpenChange={setFormOpen} classes={classes} />
      <EditAdmissionDialog item={editing} onClose={() => setEditing(null)} />
      {isAdmin && <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && !remove.isPending && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus catatan mutasi masuk?</AlertDialogTitle>
            <AlertDialogDescription>
              Hanya catatan kepindahan {deleting?.students ? `“${toTitleCase(deleting.students.full_name)}”` : ''} yang dihapus. Data siswa, NIS, dan nilainya tetap ada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={remove.isPending} onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting); }}>
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
