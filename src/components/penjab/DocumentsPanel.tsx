import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Download, FileText, Loader2, Plus, Search, Settings2, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  canManageSnp, formatBytes, SNP_BUCKET, SNP_MAX_FILE_MB, snpDb,
  type SnpDocCategory, type SnpDocType, type SnpDocument,
} from '@/hooks/usePenjabSnp';

const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'zip', 'rar', 'txt', 'csv'];
const ALL = '__all__';
const NONE = '__none__';

/** Berkas disimpan di database sebagai potongan base64 (tidak melewati storage.objects). */
const RAW_CHUNK = 384 * 1024;   // 384 KB mentah ≈ 512 KB base64
const CHUNKS_PER_REQUEST = 4;

const bytesToBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const safeName = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);

/** Daftar + unggah dokumen untuk satu standar (opsional: satu sub tugas). */
export function DocumentsPanel({
  standardId, subtaskId, schoolId,
}: { standardId: string; subtaskId?: string; schoolId?: string | null }) {
  const { user, userRole, schoolId: authSchoolId } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = canManageSnp(userRole);
  const fileRef = useRef<HTMLInputElement>(null);

  const [filterCat, setFilterCat] = useState(ALL);
  const [filterType, setFilterType] = useState(ALL);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SnpDocument | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({ title: '', description: '', categoryId: NONE, typeId: NONE });
  const [file, setFile] = useState<File | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['snp-doc-categories'],
    queryFn: async (): Promise<SnpDocCategory[]> => {
      const { data, error } = await snpDb.from('snp_doc_categories').select('*').order('sort_order').order('name');
      if (error) throw error;
      return (data ?? []) as SnpDocCategory[];
    },
  });
  const { data: types = [] } = useQuery({
    queryKey: ['snp-doc-types'],
    queryFn: async (): Promise<SnpDocType[]> => {
      const { data, error } = await snpDb.from('snp_doc_types').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as SnpDocType[];
    },
  });

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['snp-documents', standardId, subtaskId ?? 'all'],
    queryFn: async (): Promise<SnpDocument[]> => {
      let q = snpDb.from('snp_documents').select('*').eq('standard_id', standardId).eq('ready', true).order('created_at', { ascending: false });
      if (subtaskId) q = q.eq('subtask_id', subtaskId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SnpDocument[];
    },
  });

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name;
  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name;
  const typesOf = (catId: string) => types.filter((t) => t.category_id === catId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) =>
      (filterCat === ALL || d.category_id === filterCat) && (filterType === ALL || d.type_id === filterType) &&
      (!q || `${d.title} ${d.file_name} ${d.description ?? ''} ${d.uploader_name ?? ''}`.toLowerCase().includes(q)));
  }, [docs, filterCat, filterType, search]);

  const resetForm = () => {
    setForm({ title: '', description: '', categoryId: NONE, typeId: NONE });
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const pickFile = (f: File | null) => {
    if (!f) { setFile(null); return; }
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.includes(ext)) { toast.error(`Jenis file .${ext} tidak diizinkan`); return; }
    if (f.size > SNP_MAX_FILE_MB * 1024 * 1024) { toast.error(`Ukuran file maksimal ${SNP_MAX_FILE_MB} MB`); return; }
    setFile(f);
    setForm((p) => (p.title ? p : { ...p, title: f.name.replace(/\.[^.]+$/, '') }));
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Pilih file terlebih dahulu');
      setProgress(0);
      const buf = new Uint8Array(await file.arrayBuffer());
      const total = Math.max(1, Math.ceil(buf.length / RAW_CHUNK));
      // 1) catat dokumen (belum siap dipakai sampai semua potongan masuk)
      const { data: doc, error } = await snpDb.from('snp_documents').insert({
        standard_id: standardId,
        subtask_id: subtaskId ?? null,
        category_id: form.categoryId === NONE ? null : form.categoryId,
        type_id: form.typeId === NONE ? null : form.typeId,
        title: form.title.trim() || file.name,
        description: form.description.trim() || null,
        file_path: `db:${crypto.randomUUID()}`, file_name: file.name, file_size: file.size, mime_type: file.type || null,
        storage_kind: 'db', chunk_count: total, ready: false,
      }).select('id').single();
      if (error) throw error;
      try {
        // 2) kirim potongan berkas
        for (let i = 0; i < total; i += CHUNKS_PER_REQUEST) {
          const rows = [];
          for (let k = i; k < Math.min(total, i + CHUNKS_PER_REQUEST); k++) {
            rows.push({ document_id: doc.id, idx: k, standard_id: standardId, data: bytesToBase64(buf.subarray(k * RAW_CHUNK, (k + 1) * RAW_CHUNK)) });
          }
          const { error: e2 } = await snpDb.from('snp_file_chunks').insert(rows);
          if (e2) throw e2;
          setProgress(Math.round((Math.min(total, i + CHUNKS_PER_REQUEST) / total) * 100));
        }
        // 3) tandai siap
        const { error: e3 } = await snpDb.from('snp_documents').update({ ready: true }).eq('id', doc.id);
        if (e3) throw e3;
      } catch (e) {
        await snpDb.from('snp_documents').delete().eq('id', doc.id); // potongan ikut terhapus (cascade)
        throw e;
      }
    },
    onSuccess: () => {
      toast.success('Berkas berhasil diunggah ke repositori');
      setUploadOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['snp-documents'] });
      queryClient.invalidateQueries({ queryKey: ['snp-overview'] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error && e.message ? `Gagal mengunggah: ${e.message}` : 'Gagal mengunggah berkas'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (d: SnpDocument) => {
      const { error } = await snpDb.from('snp_documents').delete().eq('id', d.id);
      if (error) throw error;
      if (d.storage_kind !== 'db') await snpDb.storage.from(SNP_BUCKET).remove([d.file_path]);
    },
    onSuccess: () => {
      toast.success('Berkas dihapus');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['snp-documents'] });
      queryClient.invalidateQueries({ queryKey: ['snp-overview'] });
    },
    onError: () => toast.error('Gagal menghapus dokumen'),
  });

  const download = async (d: SnpDocument) => {
    setDownloading(d.id);
    try {
      if (d.storage_kind === 'db') {
        const parts: Uint8Array[] = [];
        const total = d.chunk_count ?? 0;
        for (let from = 0; from < total; from += 8) {
          const { data, error } = await snpDb.from('snp_file_chunks').select('idx, data').eq('document_id', d.id)
            .gte('idx', from).lt('idx', from + 8).order('idx', { ascending: true });
          if (error) throw error;
          (data ?? []).forEach((r: { data: string }) => parts.push(base64ToBytes(r.data)));
        }
        if (parts.length !== total) throw new Error('Potongan berkas tidak lengkap');
        const blob = new Blob(parts as BlobPart[], { type: d.mime_type || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = d.file_name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else {
        const { data, error } = await snpDb.storage.from(SNP_BUCKET).createSignedUrl(d.file_path, 120, { download: d.file_name });
        if (error || !data?.signedUrl) throw error ?? new Error('no url');
        window.open(data.signedUrl, '_blank', 'noopener');
      }
    } catch {
      toast.error('Gagal membuka berkas');
    } finally {
      setDownloading(null);
    }
  };

  const canDelete = (d: SnpDocument) => isAdmin || d.uploaded_by === user?.id;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Kategori</Label>
          <Select value={filterCat} onValueChange={(v) => { setFilterCat(v); setFilterType(ALL); }}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua kategori</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Jenis</Label>
          <Select value={filterType} onValueChange={setFilterType} disabled={filterCat === ALL}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua jenis</SelectItem>
              {(filterCat === ALL ? [] : typesOf(filterCat)).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari berkas…" className="pl-8 pr-8" />
          {search && (
            <button type="button" aria-label="Hapus pencarian" onClick={() => setSearch('')} className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setManageOpen(true)}>
              <Settings2 className="h-4 w-4" /> Kategori & Jenis
            </Button>
          )}
          <Button size="sm" className="gap-1" onClick={() => { resetForm(); setUploadOpen(true); }}>
            <Plus className="h-4 w-4" /> Unggah Berkas
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{search ? 'Tidak ada berkas yang cocok.' : 'Belum ada berkas di repositori.'}</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm break-words">{d.title}</p>
                    {d.description && <p className="text-xs text-muted-foreground line-clamp-2">{d.description}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {catName(d.category_id) && <Badge variant="secondary" className="text-[10px]">{catName(d.category_id)}</Badge>}
                      {typeName(d.type_id) && <Badge variant="outline" className="text-[10px]">{typeName(d.type_id)}</Badge>}
                      {d.from_admin && <Badge className="text-[10px] bg-indigo-100 text-indigo-700 hover:bg-indigo-100">Dari Admin</Badge>}
                      <span className="text-[11px] text-muted-foreground">
                        {d.file_name} · {formatBytes(d.file_size)} · {d.uploader_name ?? '-'} · {new Date(d.created_at).toLocaleDateString('id-ID')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 sm:shrink-0">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => download(d)} disabled={downloading === d.id}>
                    {downloading === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Unduh
                  </Button>
                  {canDelete(d) && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(d)} aria-label="Hapus dokumen">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Unggah */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!uploadMutation.isPending) setUploadOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unggah ke Repositori</DialogTitle>
            <DialogDescription>Maksimal {SNP_MAX_FILE_MB} MB. Format: {ALLOWED_EXT.join(', ')}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>File</Label>
              <input ref={fileRef} type="file" accept={ALLOWED_EXT.map((e) => `.${e}`).join(',')} className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              <Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 shrink-0" /> <span className="truncate">{file ? `${file.name} (${formatBytes(file.size)})` : 'Pilih file...'}</span>
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>Judul</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Judul dokumen" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v, typeId: NONE })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Tanpa kategori</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Jenis</Label>
                <Select value={form.typeId} onValueChange={(v) => setForm({ ...form, typeId: v })} disabled={form.categoryId === NONE}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Tanpa jenis</SelectItem>
                    {(form.categoryId === NONE ? [] : typesOf(form.categoryId)).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {categories.length === 0 && (
              <p className="text-xs text-muted-foreground">Kategori dan jenis dokumen belum dibuat oleh admin.</p>
            )}
            <div className="space-y-1.5">
              <Label>Keterangan (opsional)</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {uploadMutation.isPending && (
              <div className="space-y-1"><Progress value={progress} /><p className="text-xs text-muted-foreground">Mengunggah… {progress}%</p></div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploadMutation.isPending}>Batal</Button>
              <Button onClick={() => uploadMutation.mutate()} disabled={!file || uploadMutation.isPending} className="gap-2">
                {uploadMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Unggah
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isAdmin && <CategoryManager open={manageOpen} onOpenChange={setManageOpen} categories={categories} types={types} />}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus berkas?</AlertDialogTitle>
            <AlertDialogDescription>"{deleteTarget?.title}" akan dihapus permanen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Admin menentukan kategori dan jenis dokumen. */
function CategoryManager({
  open, onOpenChange, categories, types,
}: { open: boolean; onOpenChange: (o: boolean) => void; categories: SnpDocCategory[]; types: SnpDocType[] }) {
  const queryClient = useQueryClient();
  const [newCat, setNewCat] = useState('');
  const [newType, setNewType] = useState<Record<string, string>>({});

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['snp-doc-categories'] });
    queryClient.invalidateQueries({ queryKey: ['snp-doc-types'] });
  };

  const addCat = useMutation({
    mutationFn: async () => {
      const name = newCat.trim();
      if (!name) return;
      const { error } = await snpDb.from('snp_doc_categories').insert({ name, sort_order: categories.length + 1 });
      if (error) throw error;
    },
    onSuccess: () => { setNewCat(''); refresh(); },
    onError: () => toast.error('Gagal menambah kategori'),
  });
  const delCat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await snpDb.from('snp_doc_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error('Gagal menghapus kategori'),
  });
  const addType = useMutation({
    mutationFn: async (catId: string) => {
      const name = (newType[catId] ?? '').trim();
      if (!name) return;
      const { error } = await snpDb.from('snp_doc_types').insert({ category_id: catId, name });
      if (error) throw error;
    },
    onSuccess: (_d, catId) => { setNewType((p) => ({ ...p, [catId]: '' })); refresh(); },
    onError: () => toast.error('Gagal menambah jenis'),
  });
  const delType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await snpDb.from('snp_doc_types').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error('Gagal menghapus jenis'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kategori & Jenis Dokumen</DialogTitle>
          <DialogDescription>Berlaku untuk semua standar. Menghapus kategori/jenis tidak menghapus dokumen yang sudah ada.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addCat.mutate(); }}>
            <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Kategori baru, mis. Perencanaan" />
            <Button type="submit" disabled={!newCat.trim() || addCat.isPending}>Tambah</Button>
          </form>
          {categories.length === 0 && <p className="text-sm text-muted-foreground">Belum ada kategori.</p>}
          {categories.map((c) => (
            <div key={c.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">{c.name}</p>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => delCat.mutate(c.id)} aria-label={`Hapus kategori ${c.name}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {types.filter((t) => t.category_id === c.id).map((t) => (
                  <Badge key={t.id} variant="secondary" className="gap-1 pr-1">
                    {t.name}
                    <button type="button" className="rounded-full p-0.5 hover:bg-destructive/20" onClick={() => delType.mutate(t.id)} aria-label={`Hapus jenis ${t.name}`}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addType.mutate(c.id); }}>
                <Input className="h-8" value={newType[c.id] ?? ''} onChange={(e) => setNewType((p) => ({ ...p, [c.id]: e.target.value }))} placeholder="Jenis baru, mis. SK / Laporan" />
                <Button type="submit" size="sm" variant="outline" disabled={!(newType[c.id] ?? '').trim()}>Tambah jenis</Button>
              </form>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
