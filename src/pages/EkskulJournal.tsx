import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  BookOpen, CalendarDays, Camera, ImagePlus, Loader2, MapPin, Pencil, Plus, Printer, Search, Trash2, Users, X,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { compressImage } from '@/lib/imageCompress';
import { EkskulPrintDialog } from '@/components/EkskulPrintDialog';
import { supabase } from '@/integrations/supabase/client';
import {
  EKSKUL_PHOTO_BUCKET, canEditEkskul, ekskulDb, useAccessibleEkskulTypes, useIsEkskulCoach,
} from '@/hooks/useEkskul';

interface Journal {
  id: string;
  extracurricular_type_id: string;
  meeting_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  activity_description: string;
  location: string | null;
  evaluation: string | null;
  students_present: number;
  students_absent: number;
  author_name: string | null;
  created_at: string;
  extracurricular_journal_photos?: Array<{ count: number }>;
}

interface JournalPhoto {
  id: string;
  file_path: string;
  caption: string | null;
  url?: string;
}

interface FormState {
  extracurricular_type_id: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  title: string;
  activity_description: string;
  location: string;
  evaluation: string;
  students_present: string;
  students_absent: string;
}

const MAX_PHOTOS_PER_JOURNAL = 12;
const MAX_FILE_MB = 15;

const emptyForm = (typeId = ''): FormState => ({
  extracurricular_type_id: typeId,
  meeting_date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '',
  end_time: '',
  title: '',
  activity_description: '',
  location: '',
  evaluation: '',
  students_present: '0',
  students_absent: '0',
});

const trimTime = (t: string | null) => (t ? t.slice(0, 5) : '');

export default function EkskulJournal() {
  const { user, userRole, schoolId } = useAuth();
  const queryClient = useQueryClient();
  const { isCoach } = useIsEkskulCoach();
  const canEdit = canEditEkskul(userRole, isCoach);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: types = [], isLoading: typesLoading } = useAccessibleEkskulTypes();
  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);

  const [selectedType, setSelectedType] = useState<string>('all');
  const [month, setMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Journal | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [existingPhotos, setExistingPhotos] = useState<JournalPhoto[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<Journal | null>(null);
  const [detailPhotos, setDetailPhotos] = useState<JournalPhoto[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Journal | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  const { data: journals = [], isLoading } = useQuery({
    queryKey: ['ekskul-journals', selectedType, month, types.map((t) => t.id).join(',')],
    enabled: types.length > 0,
    queryFn: async (): Promise<Journal[]> => {
      let q = ekskulDb
        .from('extracurricular_journals')
        .select('*, extracurricular_journal_photos(count)')
        .order('meeting_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300);

      if (selectedType !== 'all') q = q.eq('extracurricular_type_id', selectedType);
      if (month) {
        const [y, m] = month.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        q = q.gte('meeting_date', `${month}-01`).lte('meeting_date', `${month}-${String(lastDay).padStart(2, '0')}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Journal[];
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return journals;
    return journals.filter((j) =>
      [j.title, j.activity_description, j.location, j.author_name, typeName.get(j.extracurricular_type_id)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [journals, search, typeName]);

  const photoCount = (j: Journal) => j.extracurricular_journal_photos?.[0]?.count ?? 0;

  // ---------------------------------------------------------------------------
  // Foto helper
  // ---------------------------------------------------------------------------
  const signPhotos = async (rows: Array<{ id: string; file_path: string; caption: string | null }>) => {
    if (rows.length === 0) return [] as JournalPhoto[];
    const { data, error } = await supabase.storage
      .from(EKSKUL_PHOTO_BUCKET)
      .createSignedUrls(rows.map((r) => r.file_path), 60 * 60);
    if (error) throw error;
    const urlByPath = new Map((data ?? []).map((d) => [d.path ?? '', d.signedUrl]));
    return rows.map((r) => ({ ...r, url: urlByPath.get(r.file_path) }));
  };

  const loadPhotos = async (journalId: string): Promise<JournalPhoto[]> => {
    const { data, error } = await ekskulDb
      .from('extracurricular_journal_photos')
      .select('id, file_path, caption')
      .eq('journal_id', journalId)
      .order('created_at');
    if (error) throw error;
    return signPhotos(data ?? []);
  };

  const uploadPhotos = async (journal: { id: string; extracurricular_type_id: string }, files: File[]) => {
    if (!schoolId) throw new Error('Sekolah tidak ditemukan pada akun ini.');
    let failed = 0;
    for (const original of files) {
      try {
        const file = await compressImage(original, { maxWidth: 1600, maxHeight: 1600, quality: 0.75 });
        const path = `${schoolId}/${journal.extracurricular_type_id}/${journal.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(EKSKUL_PHOTO_BUCKET)
          .upload(path, file, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        const { error: rowErr } = await ekskulDb.from('extracurricular_journal_photos').insert({
          journal_id: journal.id,
          file_path: path,
          file_name: original.name,
          file_size: file.size,
        });
        if (rowErr) {
          await supabase.storage.from(EKSKUL_PHOTO_BUCKET).remove([path]);
          throw rowErr;
        }
      } catch (err) {
        console.error('Upload foto ekskul gagal:', err);
        failed += 1;
      }
    }
    return failed;
  };

  // ---------------------------------------------------------------------------
  // Form handlers
  // ---------------------------------------------------------------------------
  const resetPickedFiles = () => {
    newPreviews.forEach((u) => URL.revokeObjectURL(u));
    setNewFiles([]);
    setNewPreviews([]);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(types.length === 1 ? types[0].id : selectedType !== 'all' ? selectedType : ''));
    setExistingPhotos([]);
    resetPickedFiles();
    setFormOpen(true);
  };

  const openEdit = async (j: Journal) => {
    setEditing(j);
    setForm({
      extracurricular_type_id: j.extracurricular_type_id,
      meeting_date: j.meeting_date,
      start_time: trimTime(j.start_time),
      end_time: trimTime(j.end_time),
      title: j.title,
      activity_description: j.activity_description,
      location: j.location ?? '',
      evaluation: j.evaluation ?? '',
      students_present: String(j.students_present ?? 0),
      students_absent: String(j.students_absent ?? 0),
    });
    resetPickedFiles();
    setExistingPhotos([]);
    setFormOpen(true);
    try {
      setExistingPhotos(await loadPhotos(j.id));
    } catch {
      toast.error('Gagal memuat foto jurnal');
    }
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted: File[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith('image/')) {
        toast.error(`${f.name} bukan file gambar`);
        continue;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name} lebih dari ${MAX_FILE_MB} MB`);
        continue;
      }
      accepted.push(f);
    }
    const room = MAX_PHOTOS_PER_JOURNAL - existingPhotos.length - newFiles.length;
    if (accepted.length > room) {
      toast.warning(`Maksimal ${MAX_PHOTOS_PER_JOURNAL} foto per pertemuan`);
    }
    const take = accepted.slice(0, Math.max(room, 0));
    setNewFiles((prev) => [...prev, ...take]);
    setNewPreviews((prev) => [...prev, ...take.map((f) => URL.createObjectURL(f))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeNewFile = (index: number) => {
    URL.revokeObjectURL(newPreviews[index]);
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
    setNewPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingPhoto = useMutation({
    mutationFn: async (photo: JournalPhoto) => {
      const { error } = await ekskulDb.from('extracurricular_journal_photos').delete().eq('id', photo.id);
      if (error) throw error;
      await supabase.storage.from(EKSKUL_PHOTO_BUCKET).remove([photo.file_path]);
      return photo.id;
    },
    onSuccess: (photoId) => {
      setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
      queryClient.invalidateQueries({ queryKey: ['ekskul-journals'] });
      toast.success('Foto dihapus');
    },
    onError: () => toast.error('Gagal menghapus foto'),
  });

  const handleSave = async () => {
    if (!form.extracurricular_type_id) return toast.error('Pilih ekstrakurikuler');
    if (!form.meeting_date) return toast.error('Tanggal pertemuan wajib diisi');
    if (!form.title.trim()) return toast.error('Judul/materi kegiatan wajib diisi');
    if (!form.activity_description.trim()) return toast.error('Uraian kegiatan wajib diisi');
    if (form.start_time && form.end_time && form.end_time < form.start_time) {
      return toast.error('Jam selesai tidak boleh sebelum jam mulai');
    }

    const payload = {
      extracurricular_type_id: form.extracurricular_type_id,
      meeting_date: form.meeting_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      title: form.title.trim(),
      activity_description: form.activity_description.trim(),
      location: form.location.trim() || null,
      evaluation: form.evaluation.trim() || null,
      students_present: Math.max(0, parseInt(form.students_present, 10) || 0),
      students_absent: Math.max(0, parseInt(form.students_absent, 10) || 0),
    };

    setSaving(true);
    try {
      let journalRef: { id: string; extracurricular_type_id: string };
      if (editing) {
        const { error } = await ekskulDb.from('extracurricular_journals').update(payload).eq('id', editing.id);
        if (error) throw error;
        journalRef = { id: editing.id, extracurricular_type_id: editing.extracurricular_type_id };
      } else {
        const { data, error } = await ekskulDb
          .from('extracurricular_journals')
          .insert({ ...payload, created_by: user?.id })
          .select('id, extracurricular_type_id')
          .single();
        if (error) throw error;
        journalRef = data;
      }

      let failedUploads = 0;
      if (newFiles.length > 0) failedUploads = await uploadPhotos(journalRef, newFiles);

      await queryClient.invalidateQueries({ queryKey: ['ekskul-journals'] });
      if (failedUploads > 0) {
        toast.warning(`Jurnal tersimpan, tetapi ${failedUploads} foto gagal diunggah. Buka jurnal dan coba unggah lagi.`);
      } else {
        toast.success(editing ? 'Jurnal diperbarui' : 'Jurnal tersimpan');
      }
      resetPickedFiles();
      setFormOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan jurnal');
    } finally {
      setSaving(false);
    }
  };

  const deleteJournal = useMutation({
    mutationFn: async (j: Journal) => {
      const { data: photos, error: photoErr } = await ekskulDb
        .from('extracurricular_journal_photos')
        .select('file_path')
        .eq('journal_id', j.id);
      if (photoErr) throw photoErr;

      const { error } = await ekskulDb.from('extracurricular_journals').delete().eq('id', j.id);
      if (error) throw error;

      const paths = ((photos ?? []) as Array<{ file_path: string }>).map((p) => p.file_path);
      if (paths.length > 0) await supabase.storage.from(EKSKUL_PHOTO_BUCKET).remove(paths);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ekskul-journals'] });
      toast.success('Jurnal dihapus');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Gagal menghapus jurnal'),
  });

  const openDetail = async (j: Journal) => {
    setDetail(j);
    setDetailPhotos([]);
    setDetailLoading(true);
    try {
      setDetailPhotos(await loadPhotos(j.id));
    } catch {
      toast.error('Gagal memuat foto kegiatan');
    } finally {
      setDetailLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const noAssignment = !typesLoading && types.length === 0;
  const remainingSlots = MAX_PHOTOS_PER_JOURNAL - existingPhotos.length - newFiles.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <BookOpen className="h-6 w-6 text-primary" /> Jurnal Ekstrakurikuler
            </h1>
            <p className="text-sm text-muted-foreground">
              {canEdit
                ? 'Catat kegiatan dan dokumentasi foto setiap pertemuan ekskul yang Anda bina.'
                : 'Pantau jurnal kegiatan dan dokumentasi foto seluruh ekstrakurikuler.'}
            </p>
          </div>
          {!noAssignment && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPrintOpen(true)}>
                <Printer className="mr-2 h-4 w-4" /> Cetak / Pratinjau
              </Button>
              {canEdit && (
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" /> Tambah Jurnal
                </Button>
              )}
            </div>
          )}
        </div>

        {noAssignment ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {canEdit
                ? 'Akun Anda belum ditugaskan ke ekstrakurikuler mana pun. Hubungi admin sekolah untuk penugasan pembina.'
                : 'Belum ada ekstrakurikuler aktif.'}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Ekstrakurikuler</Label>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{canEdit ? 'Semua ekskul saya' : 'Semua ekskul'}</SelectItem>
                      {types.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Bulan</Label>
                  <div className="flex gap-2">
                    <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                    {month && (
                      <Button variant="outline" size="icon" onClick={() => setMonth('')} title="Semua waktu">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Cari</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Judul, uraian, lokasi, atau nama pembina..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Belum ada jurnal untuk filter ini.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filtered.map((j) => (
                  <Card key={j.id} className="transition-shadow hover:shadow-md">
                    <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <button type="button" className="flex-1 text-left" onClick={() => openDetail(j)}>
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{typeName.get(j.extracurricular_type_id) ?? 'Ekskul'}</Badge>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {format(new Date(`${j.meeting_date}T00:00:00`), 'EEEE, d MMMM yyyy', { locale: idLocale })}
                            {j.start_time && ` · ${trimTime(j.start_time)}${j.end_time ? `–${trimTime(j.end_time)}` : ''}`}
                          </span>
                        </div>
                        <h3 className="font-semibold">{j.title}</h3>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{j.activity_description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />Hadir {j.students_present} · Tidak hadir {j.students_absent}</span>
                          <span className="flex items-center gap-1"><Camera className="h-3.5 w-3.5" />{photoCount(j)} foto</span>
                          {j.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{j.location}</span>}
                          {j.author_name && <span>Pembina: {j.author_name}</span>}
                        </div>
                      </button>
                      {canEdit && (
                        <div className="flex gap-2 sm:flex-col">
                          <Button size="sm" variant="outline" onClick={() => openEdit(j)}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Ubah
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteTarget(j)}>
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Hapus
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <EkskulPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        types={types}
        defaultTypeId={selectedType}
        defaultMonth={month || undefined}
      />

      {/* ----------------------------- Form tambah/ubah ----------------------------- */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!saving) { setFormOpen(o); if (!o) resetPickedFiles(); } }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Ubah Jurnal Pertemuan' : 'Tambah Jurnal Pertemuan'}</DialogTitle>
            <DialogDescription>Isi kegiatan pertemuan dan unggah foto dokumentasi.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Ekstrakurikuler *</Label>
                <Select
                  value={form.extracurricular_type_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, extracurricular_type_id: v }))}
                  disabled={!!editing}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih ekskul" /></SelectTrigger>
                  <SelectContent>
                    {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tanggal pertemuan *</Label>
                <Input type="date" value={form.meeting_date} onChange={(e) => setForm((f) => ({ ...f, meeting_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Jam mulai</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Jam selesai</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Judul / materi kegiatan *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Contoh: Latihan baris-berbaris dasar" />
            </div>
            <div className="space-y-1.5">
              <Label>Uraian kegiatan *</Label>
              <Textarea rows={4} value={form.activity_description} onChange={(e) => setForm((f) => ({ ...f, activity_description: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Lokasi</Label>
                <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Lapangan, aula, ..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Hadir</Label>
                  <Input type="number" min={0} value={form.students_present} onChange={(e) => setForm((f) => ({ ...f, students_present: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tidak hadir</Label>
                  <Input type="number" min={0} value={form.students_absent} onChange={(e) => setForm((f) => ({ ...f, students_absent: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Evaluasi / catatan</Label>
              <Textarea rows={3} value={form.evaluation} onChange={(e) => setForm((f) => ({ ...f, evaluation: e.target.value }))} placeholder="Capaian, kendala, tindak lanjut..." />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Foto kegiatan ({existingPhotos.length + newFiles.length}/{MAX_PHOTOS_PER_JOURNAL})</Label>
                <Button type="button" size="sm" variant="outline" disabled={remainingSlots <= 0} onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="mr-1.5 h-4 w-4" /> Pilih foto
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
              </div>
              {existingPhotos.length + newFiles.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Belum ada foto dipilih.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {existingPhotos.map((p) => (
                    <div key={p.id} className="group relative aspect-square overflow-hidden rounded-md border">
                      {p.url && <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-destructive"
                        onClick={() => removeExistingPhoto.mutate(p)}
                        disabled={removeExistingPhoto.isPending}
                        aria-label="Hapus foto"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {newPreviews.map((src, i) => (
                    <div key={src} className="relative aspect-square overflow-hidden rounded-md border border-primary/50">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 text-[10px] text-primary-foreground">Baru</span>
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-destructive"
                        onClick={() => removeNewFile(i)}
                        aria-label="Batalkan foto"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Foto dikompres otomatis. Maks {MAX_FILE_MB} MB per foto.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setFormOpen(false); resetPickedFiles(); }} disabled={saving}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Simpan Perubahan' : 'Simpan Jurnal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------- Detail ----------------------------- */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title}</DialogTitle>
                <DialogDescription>
                  {typeName.get(detail.extracurricular_type_id) ?? 'Ekskul'} ·{' '}
                  {format(new Date(`${detail.meeting_date}T00:00:00`), 'EEEE, d MMMM yyyy', { locale: idLocale })}
                  {detail.start_time && ` · ${trimTime(detail.start_time)}${detail.end_time ? `–${trimTime(detail.end_time)}` : ''}`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <section>
                  <h4 className="mb-1 font-medium">Uraian kegiatan</h4>
                  <p className="whitespace-pre-wrap text-muted-foreground">{detail.activity_description}</p>
                </section>
                {detail.evaluation && (
                  <section>
                    <h4 className="mb-1 font-medium">Evaluasi / catatan</h4>
                    <p className="whitespace-pre-wrap text-muted-foreground">{detail.evaluation}</p>
                  </section>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                  <span>Hadir: {detail.students_present}</span>
                  <span>Tidak hadir: {detail.students_absent}</span>
                  {detail.location && <span>Lokasi: {detail.location}</span>}
                  {detail.author_name && <span>Pembina: {detail.author_name}</span>}
                </div>
                <section>
                  <h4 className="mb-2 font-medium">Foto kegiatan</h4>
                  {detailLoading ? (
                    <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-square" />)}</div>
                  ) : detailPhotos.length === 0 ? (
                    <p className="text-muted-foreground">Tidak ada foto.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {detailPhotos.map((p) => (
                        <button key={p.id} type="button" className="aspect-square overflow-hidden rounded-md border" onClick={() => p.url && setZoomUrl(p.url)}>
                          {p.url && <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!zoomUrl} onOpenChange={(o) => !o && setZoomUrl(null)}>
        <DialogContent className="max-w-4xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Foto kegiatan</DialogTitle>
            <DialogDescription>Pratinjau foto ukuran penuh</DialogDescription>
          </DialogHeader>
          {zoomUrl && <img src={zoomUrl} alt="Foto kegiatan" className="max-h-[80vh] w-full rounded object-contain" />}
        </DialogContent>
      </Dialog>

      {/* ----------------------------- Konfirmasi hapus ----------------------------- */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus jurnal ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Jurnal “{deleteTarget?.title}” beserta seluruh foto kegiatannya akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteJournal.mutate(deleteTarget)}
            >
              {deleteJournal.isPending ? 'Menghapus...' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
