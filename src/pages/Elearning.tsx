import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, EyeOff, FileText, GraduationCap, Image as ImageIcon, Loader2, Plus, Search, Trash2, Upload } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ElearningViewer } from '@/components/ElearningViewer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { compressImage } from '@/lib/imageCompress';
import {
  ELEARNING_ACCEPT, ELEARNING_BUCKET, ELEARNING_MAX_BYTES, KIND_LABEL, detectElearningKind, elearningMime,
  formatFileSize, safeFileName, type ElearningMaterial,
} from '@/lib/elearning';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface TeachingGroup {
  key: string;
  class_id: string;
  class_name: string;
  subject: string;
}

export default function Elearning() {
  const { user, schoolId } = useAuth();
  const { selectedYear } = useAcademicYear();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [groupKey, setGroupKey] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [published, setPublished] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [viewing, setViewing] = useState<ElearningMaterial | null>(null);
  const [deleting, setDeleting] = useState<ElearningMaterial | null>(null);

  const { data: teacher } = useQuery({
    queryKey: ['elearning-teacher', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('teachers').select('id').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Kelas + mapel yang diajar guru ini
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['elearning-groups', teacher?.id, selectedYear],
    enabled: !!teacher?.id,
    queryFn: async (): Promise<TeachingGroup[]> => {
      let q = supabase.from('schedules').select('class_id, subject, classes(name)').eq('teacher_id', teacher!.id);
      if (selectedYear) q = q.eq('academic_year', selectedYear);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, TeachingGroup>();
      (data ?? []).forEach((s: { class_id: string; subject: string; classes: { name: string } | null }) => {
        const key = `${s.class_id}|${s.subject}`;
        if (!map.has(key)) map.set(key, { key, class_id: s.class_id, class_name: s.classes?.name ?? 'Kelas', subject: s.subject });
      });
      return [...map.values()].sort((a, b) => `${a.class_name} ${a.subject}`.localeCompare(`${b.class_name} ${b.subject}`));
    },
  });

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ['elearning-materials', teacher?.id],
    enabled: !!teacher?.id,
    queryFn: async (): Promise<ElearningMaterial[]> => {
      const { data, error } = await db
        .from('elearning_materials')
        .select('*, classes(name)')
        .eq('teacher_id', teacher!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ElearningMaterial[];
    },
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (filterGroup !== 'all' && `${m.class_id}|${m.subject}` !== filterGroup) return false;
      return !term || `${m.title} ${m.subject} ${m.description ?? ''}`.toLowerCase().includes(term);
    });
  }, [materials, search, filterGroup]);

  const openForm = () => {
    setGroupKey(filterGroup !== 'all' ? filterGroup : '');
    setTitle('');
    setDescription('');
    setPublished(true);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setFormOpen(true);
  };

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const kind = detectElearningKind(f);
    if (!kind) {
      toast.error('Format tidak didukung. Gunakan gambar (JPG/PNG/WEBP/GIF), PDF, atau DOCX.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (f.size > ELEARNING_MAX_BYTES) {
      toast.error('Ukuran file maksimal 20 MB');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const selectedGroup = groups.find((g) => g.key === groupKey);

  const save = useMutation({
    mutationFn: async () => {
      if (!file || !selectedGroup || !teacher?.id || !schoolId) throw new Error('Data belum lengkap');
      const kind = detectElearningKind(file)!;

      let upload: File = file;
      // Foto besar dikompres agar hemat kuota siswa (GIF dibiarkan agar animasinya utuh)
      if (kind === 'image' && file.type !== 'image/gif' && file.size > 600 * 1024) {
        try { upload = await compressImage(file, { maxWidth: 2000, maxHeight: 2000, quality: 0.82 }); } catch { upload = file; }
      }
      const mime = elearningMime(kind, upload);
      const fileName = upload === file ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg';
      const path = `${schoolId}/${selectedGroup.class_id}/${crypto.randomUUID()}-${safeFileName(fileName)}`;

      const { error: upErr } = await supabase.storage
        .from(ELEARNING_BUCKET)
        .upload(path, upload, { contentType: mime, upsert: false });
      if (upErr) throw upErr;

      const { error } = await db.from('elearning_materials').insert({
        teacher_id: teacher.id,
        class_id: selectedGroup.class_id,
        subject: selectedGroup.subject,
        title: title.trim(),
        description: description.trim() || null,
        file_path: path,
        file_name: fileName,
        file_type: kind,
        mime_type: mime,
        file_size: upload.size,
        is_published: published,
      });
      if (error) {
        await supabase.storage.from(ELEARNING_BUCKET).remove([path]); // jangan tinggalkan file yatim
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elearning-materials'] });
      toast.success(published ? 'Materi diunggah dan terlihat oleh siswa' : 'Materi disimpan sebagai draf');
      setFormOpen(false);
    },
    onError: (err: { message?: string }) => toast.error(`Gagal menyimpan materi${err?.message ? `: ${err.message}` : ''}`),
  });

  const togglePublish = useMutation({
    mutationFn: async (m: ElearningMaterial) => {
      const { error } = await db.from('elearning_materials').update({ is_published: !m.is_published }).eq('id', m.id);
      if (error) throw error;
      return !m.is_published;
    },
    onSuccess: (now) => {
      queryClient.invalidateQueries({ queryKey: ['elearning-materials'] });
      toast.success(now ? 'Materi ditampilkan ke siswa' : 'Materi disembunyikan dari siswa');
    },
    onError: () => toast.error('Gagal mengubah status materi'),
  });

  const remove = useMutation({
    mutationFn: async (m: ElearningMaterial) => {
      const { error } = await db.from('elearning_materials').delete().eq('id', m.id);
      if (error) throw error;
      await supabase.storage.from(ELEARNING_BUCKET).remove([m.file_path]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elearning-materials'] });
      toast.success('Materi dihapus');
      setDeleting(null);
    },
    onError: () => toast.error('Gagal menghapus materi'),
  });

  const canSave = !!file && !!selectedGroup && title.trim().length > 0 && !save.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <GraduationCap className="h-6 w-6 text-primary" /> E-Learning
            </h1>
            <p className="text-sm text-muted-foreground">
              Unggah materi (gambar, PDF, DOCX) untuk kelas dan mapel yang Anda ajar. Siswa membukanya dari akun mereka.
            </p>
          </div>
          <Button onClick={openForm} disabled={groups.length === 0}>
            <Plus className="mr-2 h-4 w-4" /> Unggah Materi
          </Button>
        </div>

        {!groupsLoading && teacher && groups.length === 0 && (
          <Card><CardContent className="py-6 text-sm text-muted-foreground">
            Belum ada jadwal mengajar{selectedYear ? ` pada tahun ajaran ${selectedYear}` : ''}. Materi hanya dapat diunggah untuk kelas dan mapel yang tercantum di jadwal Anda.
          </CardContent></Card>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Cari materi..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterGroup} onValueChange={setFilterGroup}>
            <SelectTrigger className="sm:w-64"><SelectValue placeholder="Semua kelas & mapel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua kelas & mapel</SelectItem>
              {groups.map((g) => <SelectItem key={g.key} value={g.key}>{g.class_name} — {g.subject}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : visible.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">
            {materials.length === 0 ? 'Belum ada materi. Klik “Unggah Materi” untuk memulai.' : 'Tidak ada materi yang cocok.'}
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((m) => (
              <Card key={m.id} className={m.is_published ? '' : 'border-dashed opacity-80'}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {m.file_type === 'image' ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.classes?.name ?? 'Kelas'} • {m.subject}
                      </p>
                      {m.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>}
                    </div>
                    <Badge variant={m.is_published ? 'secondary' : 'outline'} className="shrink-0 gap-1">
                      {m.is_published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      {m.is_published ? 'Tampil' : 'Draf'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {KIND_LABEL[m.file_type]} {m.file_size ? `• ${formatFileSize(m.file_size)}` : ''}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => setViewing(m)}>Buka</Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={togglePublish.isPending}
                        onClick={() => togglePublish.mutate(m)}
                      >
                        {m.is_published ? 'Sembunyikan' : 'Tampilkan'}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleting(m)} aria-label="Hapus">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={(o) => !save.isPending && setFormOpen(o)}>
        <DialogContent className="flex max-h-[90dvh] max-w-lg flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 px-6 pb-3 pr-12 pt-6">
            <DialogTitle>Unggah Materi</DialogTitle>
            <DialogDescription>Format: gambar, PDF, atau DOCX. Maksimal 20 MB.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 py-3">
            <div className="space-y-1.5">
              <Label>Kelas & mata pelajaran *</Label>
              <Select value={groupKey} onValueChange={setGroupKey}>
                <SelectTrigger><SelectValue placeholder="Pilih kelas dan mapel" /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => <SelectItem key={g.key} value={g.key}>{g.class_name} — {g.subject}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>File materi *</Label>
              <input
                ref={fileRef}
                type="file"
                accept={ELEARNING_ACCEPT}
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <Button type="button" variant="outline" className="w-full justify-start" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{file ? `${file.name} (${formatFileSize(file.size)})` : 'Pilih file...'}</span>
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>Judul *</Label>
              <Input value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Bab 3 — Aljabar" />
            </div>
            <div className="space-y-1.5">
              <Label>Keterangan</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opsional: petunjuk belajar atau tugas terkait" />
            </div>
            <label className="flex cursor-pointer items-center justify-between rounded-md border p-3 text-sm">
              <span>
                Tampilkan ke siswa
                <span className="block text-xs text-muted-foreground">Matikan untuk menyimpan sebagai draf.</span>
              </span>
              <Switch checked={published} onCheckedChange={setPublished} />
            </label>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:gap-0">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={save.isPending}>Batal</Button>
            <Button onClick={() => save.mutate()} disabled={!canSave}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unggah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ElearningViewer material={viewing} onClose={() => setViewing(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && !remove.isPending && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus materi?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” akan dihapus beserta filenya dan tidak dapat dibuka lagi oleh siswa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting); }}
            >
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
