import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  Copy, Download, ExternalLink, Eye, FileText, Loader2, Pencil, Plus, Search, Settings2, Trash2, Wand2, X,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { PAPER_LABEL, type PdfPaper } from '@/lib/pdfPaper';
import {
  DEFAULT_SURAT_PATTERN, parseSuratSequence, renderSuratNumber, validateSuratPattern,
} from '@/lib/suratNumber';
import {
  DEFAULT_KETERANGAN_SURAT_PENGANTAR, buildSuratPengantarPdf, suratPengantarFileName,
  type SuratPengantarData, type SuratPengantarItem,
} from '@/lib/suratPengantarPdf';

// Tabel/RPC baru belum ada di types.ts yang digenerate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface SuratPengantarRow {
  id: string;
  nomor_surat: string;
  nomor_urut: number | null;
  nomor_tahun: number;
  tanggal_surat: string;
  tempat_surat: string | null;
  kepada_yth: string;
  di_tempat: string | null;
  items: SuratPengantarItem[];
  penandatangan_nama: string | null;
  penandatangan_nip: string | null;
  catatan: string | null;
  created_at: string;
}

type Mode = 'create' | 'edit' | 'copy';

const today = () => format(new Date(), 'yyyy-MM-dd');
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? 'Terjadi kesalahan';
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const emptyItem = (keterangan = ''): SuratPengantarItem => ({ uraian: '', jumlah: '', keterangan });
const normItems = (v: unknown): SuratPengantarItem[] =>
  Array.isArray(v)
    ? v.map((x) => ({ uraian: String(x?.uraian ?? ''), jumlah: String(x?.jumlah ?? ''), keterangan: String(x?.keterangan ?? '') }))
    : [];
const ymd = (d: string) => ({ year: Number(d.slice(0, 4)) || new Date().getFullYear(), month: Number(d.slice(5, 7)) || 1 });
const longDate = (d: string) => format(new Date(`${d}T00:00:00`), 'd MMM yyyy', { locale: localeId });

const readPaper = (): PdfPaper => {
  try { return localStorage.getItem('sp-paper') === 'f4' ? 'f4' : 'a4'; } catch { return 'a4'; }
};

/* ------------------------------------------------------------------ */
/* Pratinjau PDF                                                       */
/* ------------------------------------------------------------------ */
function PreviewDialog({
  letter, onClose, schoolSettings,
}: { letter: SuratPengantarData | null; onClose: () => void; schoolSettings: unknown }) {
  const [paper, setPaper] = useState<PdfPaper>(readPaper);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!letter) { setUrl(null); return; }
    let cancelled = false;
    let made: string | null = null;
    setBusy(true);
    setFailed(false);
    buildSuratPengantarPdf(letter, schoolSettings as never, paper)
      .then((doc) => {
        if (cancelled) return;
        made = URL.createObjectURL(doc.output('blob'));
        setUrl(made);
      })
      .catch((e) => { console.error(e); if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [letter, paper, schoolSettings]);

  const changePaper = (p: PdfPaper) => {
    setPaper(p);
    try { localStorage.setItem('sp-paper', p); } catch { /* abaikan */ }
  };

  const download = async () => {
    if (!letter) return;
    try {
      const doc = await buildSuratPengantarPdf(letter, schoolSettings as never, paper);
      doc.save(suratPengantarFileName(letter.nomor_surat));
    } catch (e) {
      console.error(e);
      toast.error('Gagal membuat PDF');
    }
  };

  return (
    <Dialog open={!!letter} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[95dvh] max-w-5xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Pratinjau Surat Pengantar</DialogTitle>
          <DialogDescription>{letter?.nomor_surat}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={paper} onValueChange={(v) => changePaper(v as PdfPaper)}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PAPER_LABEL) as PdfPaper[]).map((p) => <SelectItem key={p} value={p}>{PAPER_LABEL[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={download} disabled={busy || failed}><Download className="mr-2 h-4 w-4" /> Unduh PDF</Button>
          {url && (
            <Button variant="outline" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Buka di tab baru</a>
            </Button>
          )}
        </div>
        <div className="min-h-[60dvh] flex-1 overflow-hidden rounded-md border bg-muted/40">
          {busy ? (
            <div className="flex h-full min-h-[60dvh] items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Membuat pratinjau…
            </div>
          ) : failed ? (
            <div className="flex h-full min-h-[60dvh] items-center justify-center text-destructive">Gagal membuat pratinjau.</div>
          ) : url ? (
            <iframe src={url} title="Pratinjau surat pengantar" className="h-full min-h-[60dvh] w-full" />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Form buat / ubah / salin                                            */
/* ------------------------------------------------------------------ */
interface FormState {
  nomor_surat: string;
  tanggal_surat: string;
  tempat_surat: string;
  kepada_yth: string;
  di_tempat: string;
  items: SuratPengantarItem[];
  catatan: string;
}

function LetterFormDialog({
  open, mode, source, onClose, pattern, defaultPlace, schoolSettings, onPreview,
}: {
  open: boolean; mode: Mode; source: SuratPengantarRow | null; onClose: () => void;
  pattern: string; defaultPlace: string; schoolSettings: unknown; onPreview: (d: SuratPengantarData) => void;
}) {
  const queryClient = useQueryClient();
  const [f, setF] = useState<FormState>({
    nomor_surat: '', tanggal_surat: today(), tempat_surat: '', kepada_yth: '', di_tempat: '',
    items: [emptyItem(DEFAULT_KETERANGAN_SURAT_PENGANTAR)], catatan: '',
  });
  const [nomorTouched, setNomorTouched] = useState(false);
  const [numbering, setNumbering] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  // isi form setiap dialog dibuka
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && source) {
      setF({
        nomor_surat: source.nomor_surat, tanggal_surat: source.tanggal_surat, tempat_surat: source.tempat_surat ?? '',
        kepada_yth: source.kepada_yth, di_tempat: source.di_tempat ?? '',
        items: normItems(source.items).length ? normItems(source.items) : [emptyItem()], catatan: source.catatan ?? '',
      });
      setNomorTouched(true);
    } else if (mode === 'copy' && source) {
      setF({
        nomor_surat: '', tanggal_surat: today(), tempat_surat: source.tempat_surat ?? defaultPlace,
        kepada_yth: source.kepada_yth, di_tempat: source.di_tempat ?? '',
        items: normItems(source.items).length ? normItems(source.items) : [emptyItem()], catatan: source.catatan ?? '',
      });
      setNomorTouched(false);
    } else {
      setF({
        nomor_surat: '', tanggal_surat: today(), tempat_surat: defaultPlace, kepada_yth: '', di_tempat: '',
        items: [emptyItem(DEFAULT_KETERANGAN_SURAT_PENGANTAR)], catatan: '',
      });
      setNomorTouched(false);
    }
  }, [open, mode, source, defaultPlace]);

  const suggestNumber = useCallback(async (date: string) => {
    const { year, month } = ymd(date);
    setNumbering(true);
    try {
      const { data, error } = await db.rpc('surat_pengantar_next', { p_year: year });
      const seq = error ? 1 : Math.max(1, Number(data) || 1);
      return renderSuratNumber(pattern, { year, month }, seq);
    } finally {
      setNumbering(false);
    }
  }, [pattern]);

  // nomor otomatis (selama belum diubah manual) mengikuti tanggal surat
  useEffect(() => {
    if (!open || mode === 'edit' || nomorTouched || !f.tanggal_surat) return;
    let cancelled = false;
    suggestNumber(f.tanggal_surat).then((n) => { if (!cancelled) setF((p) => ({ ...p, nomor_surat: n })); });
    return () => { cancelled = true; };
  }, [open, mode, nomorTouched, f.tanggal_surat, suggestNumber]);

  const setItem = (i: number, patch: Partial<SuratPengantarItem>) =>
    setF((p) => ({ ...p, items: p.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));

  const asLetter = (): SuratPengantarData => ({
    nomor_surat: f.nomor_surat.trim(), tanggal_surat: f.tanggal_surat, tempat_surat: f.tempat_surat.trim(),
    kepada_yth: f.kepada_yth, di_tempat: f.di_tempat.trim(), items: f.items,
    penandatangan_nama: mode === 'edit' ? source?.penandatangan_nama : null,
    penandatangan_nip: mode === 'edit' ? source?.penandatangan_nip : null,
  });

  const save = useMutation({
    mutationFn: async () => {
      const { year, month } = ymd(f.tanggal_surat);
      const nomor = f.nomor_surat.trim();
      const ss = (schoolSettings ?? {}) as { headmaster_name?: string; headmaster_nip?: string };
      const items = f.items
        .map((it) => ({ uraian: it.uraian.trim(), jumlah: it.jumlah.trim(), keterangan: it.keterangan.trim() }))
        .filter((it) => it.uraian || it.jumlah || it.keterangan);
      const payload = {
        nomor_surat: nomor,
        nomor_urut: parseSuratSequence(pattern, nomor, { year, month }),
        nomor_tahun: year,
        tanggal_surat: f.tanggal_surat,
        tempat_surat: f.tempat_surat.trim() || null,
        kepada_yth: f.kepada_yth.trim(),
        di_tempat: f.di_tempat.trim() || null,
        items,
        catatan: f.catatan.trim() || null,
      };
      if (mode === 'edit' && source) {
        const { error } = await db.from('surat_pengantar').update(payload).eq('id', source.id);
        if (error) throw error;
      } else {
        // nama & NIP kepala sekolah disalin saat surat dibuat, agar surat lama tidak berubah bila KS diganti
        const { error } = await db.from('surat_pengantar').insert({
          ...payload,
          penandatangan_nama: ss.headmaster_name || null,
          penandatangan_nip: ss.headmaster_nip || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surat-pengantar'] });
      toast.success(mode === 'edit' ? 'Surat pengantar diperbarui' : 'Surat pengantar disimpan');
      onClose();
    },
    onError: (e: { code?: string; message?: string }) => {
      if (e?.code === '23505') toast.error('Nomor surat sudah dipakai. Klik “Nomor otomatis” untuk nomor berikutnya.');
      else toast.error(errMsg(e));
    },
  });

  const problem =
    !f.nomor_surat.trim() ? 'Nomor surat wajib diisi'
      : !f.tanggal_surat ? 'Tanggal surat wajib diisi'
        : !f.kepada_yth.trim() ? 'Tujuan surat (Yth.) wajib diisi'
          : !f.items.some((it) => it.uraian.trim()) ? 'Isi minimal satu uraian'
            : '';

  const title = mode === 'edit' ? 'Ubah Surat Pengantar' : mode === 'copy' ? 'Salin Surat Pengantar' : 'Buat Surat Pengantar';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="flex max-h-[94dvh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-6 pb-3 pr-12 pt-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Kop surat dan tanda tangan kepala sekolah (nama &amp; NIP) diambil otomatis dari pengaturan sekolah.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sp-tgl">Tanggal surat *</Label>
              <Input id="sp-tgl" type="date" value={f.tanggal_surat} onChange={(e) => set('tanggal_surat', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-tempat">Tempat surat</Label>
              <Input id="sp-tempat" value={f.tempat_surat} onChange={(e) => set('tempat_surat', e.target.value)} placeholder="Contoh: Ciamis" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sp-nomor">Nomor surat *</Label>
              <div className="flex gap-2">
                <Input
                  id="sp-nomor" value={f.nomor_surat}
                  onChange={(e) => { set('nomor_surat', e.target.value); setNomorTouched(true); }}
                />
                <Button
                  type="button" variant="outline" disabled={numbering || !f.tanggal_surat}
                  onClick={async () => { set('nomor_surat', await suggestNumber(f.tanggal_surat)); setNomorTouched(false); }}
                >
                  {numbering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />} Nomor otomatis
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Nomor dibuat otomatis dari pola dan nomor terakhir tahun ini; boleh diubah manual.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-kepada">Kepada Yth. *</Label>
              <Textarea
                id="sp-kepada" rows={3} value={f.kepada_yth} onChange={(e) => set('kepada_yth', e.target.value)}
                placeholder={'Kepala Dinas Pendidikan\nKabupaten Ciamis'}
              />
              <p className="text-xs text-muted-foreground">Satu baris per baris cetak; kata “Yth.” ditambahkan otomatis.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-di">Di (kota/tempat tujuan)</Label>
              <Input id="sp-di" value={f.di_tempat} onChange={(e) => set('di_tempat', e.target.value)} placeholder="Contoh: Ciamis" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Uraian</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => set('items', [...f.items, emptyItem(DEFAULT_KETERANGAN_SURAT_PENGANTAR)])}>
                <Plus className="mr-1 h-4 w-4" /> Tambah baris
              </Button>
            </div>
            {f.items.map((it, i) => (
              <div key={i} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Baris {i + 1}</span>
                  {f.items.length > 1 && (
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" aria-label="Hapus baris"
                      onClick={() => set('items', f.items.filter((_, idx) => idx !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Textarea rows={3} value={it.uraian} onChange={(e) => setItem(i, { uraian: e.target.value })}
                  placeholder={'Uraian berkas yang disampaikan (boleh beberapa baris)'} />
                <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                  <Input value={it.jumlah} onChange={(e) => setItem(i, { jumlah: e.target.value })} placeholder="Jumlah, mis. 1 bendel" />
                  <Textarea rows={2} value={it.keterangan} onChange={(e) => setItem(i, { keterangan: e.target.value })} placeholder="Keterangan" />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-cat">Catatan internal (tidak dicetak)</Label>
            <Textarea id="sp-cat" rows={2} value={f.catatan} onChange={(e) => set('catatan', e.target.value)} />
          </div>
        </div>

        <DialogFooter className="shrink-0 items-center gap-2 border-t px-6 py-4 sm:justify-between">
          <span className="text-xs text-destructive">{problem}</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onPreview(asLetter())} disabled={!!problem}>
              <Eye className="mr-2 h-4 w-4" /> Pratinjau
            </Button>
            <Button variant="outline" onClick={onClose} disabled={save.isPending}>Batal</Button>
            <Button onClick={() => save.mutate()} disabled={!!problem || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Pengaturan nomor                                                    */
/* ------------------------------------------------------------------ */
function SettingsDialog({
  open, onOpenChange, pattern, place,
}: { open: boolean; onOpenChange: (o: boolean) => void; pattern: string; place: string }) {
  const queryClient = useQueryClient();
  const [p, setP] = useState(pattern);
  const [pl, setPl] = useState(place);
  useEffect(() => { if (open) { setP(pattern); setPl(place); } }, [open, pattern, place]);

  const error = validateSuratPattern(p);
  const now = new Date();
  const sample = error ? '' : renderSuratNumber(p, { year: now.getFullYear(), month: now.getMonth() + 1 }, 53);

  const save = useMutation({
    mutationFn: async () => {
      const { error: e } = await db.rpc('surat_pengantar_save_settings', { p_pattern: p.trim(), p_place: pl.trim() });
      if (e) throw e;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surat-pengantar-settings'] });
      toast.success('Pengaturan disimpan');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pengaturan Surat Pengantar</DialogTitle>
          <DialogDescription>Pola nomor surat dan tempat surat bawaan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sp-pola">Pola nomor surat</Label>
            <Input id="sp-pola" value={p} onChange={(e) => setP(e.target.value)} maxLength={80} aria-invalid={!!error} />
            {error
              ? <p className="text-xs text-destructive">{error}</p>
              : <p className="text-xs text-muted-foreground">Contoh hasil (nomor 53): <b className="text-foreground">{sample}</b></p>}
            <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              <p><code>{'{URUT:3}'}</code> nomor urut 3 digit • <code>{'{TAHUN}'}</code> tahun • <code>{'{YY}'}</code> 2 digit tahun • <code>{'{BULAN}'}</code> bulan 2 digit • <code>{'{ROMAWI}'}</code> bulan romawi.</p>
              <p className="mt-1">Contoh: <code>{'800 / {URUT:3} / 426.101.03.SMK.1/{TAHUN}'}</code>. Nomor urut berlanjut per tahun dari nomor terakhir yang tercatat.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-place">Tempat surat bawaan</Label>
            <Input id="sp-place" value={pl} onChange={(e) => setPl(e.target.value)} maxLength={60} placeholder="Contoh: Ciamis" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Batal</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !!error}>
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
const toData = (r: SuratPengantarRow): SuratPengantarData => ({
  nomor_surat: r.nomor_surat, tanggal_surat: r.tanggal_surat, tempat_surat: r.tempat_surat, kepada_yth: r.kepada_yth,
  di_tempat: r.di_tempat, items: normItems(r.items), penandatangan_nama: r.penandatangan_nama, penandatangan_nip: r.penandatangan_nip,
});

export default function SuratPengantar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('create');
  const [source, setSource] = useState<SuratPengantarRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preview, setPreview] = useState<SuratPengantarData | null>(null);
  const [deleting, setDeleting] = useState<SuratPengantarRow | null>(null);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('all');
  const [month, setMonth] = useState('all');
  const [sort, setSort] = useState('date-desc');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const { data: rowsRaw = [], isLoading, isError } = useQuery({
    queryKey: ['surat-pengantar'],
    enabled: !!user,
    queryFn: async (): Promise<SuratPengantarRow[]> => {
      const { data, error } = await db.from('surat_pengantar').select('*').order('tanggal_surat', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SuratPengantarRow[];
    },
  });

  const { data: cfg } = useQuery({
    queryKey: ['surat-pengantar-settings'],
    enabled: !!user,
    queryFn: async (): Promise<{ pattern: string; place: string }> => {
      const { data, error } = await db.rpc('surat_pengantar_settings');
      if (error) throw error;
      return data as { pattern: string; place: string };
    },
  });
  const pattern = cfg?.pattern && !validateSuratPattern(cfg.pattern) ? cfg.pattern : DEFAULT_SURAT_PATTERN;
  const defaultPlace = cfg?.place || rowsRaw[0]?.tempat_surat || '';

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings-letterhead'],
    queryFn: async () => (await supabase.rpc('get_school_settings_for_letterhead')).data,
  });

  const remove = useMutation({
    mutationFn: async (r: SuratPengantarRow) => {
      const { error } = await db.from('surat_pengantar').delete().eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['surat-pengantar'] }); toast.success('Surat pengantar dihapus'); setDeleting(null); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const years = useMemo(() => Array.from(new Set(rowsRaw.map((r) => r.nomor_tahun))).sort((a, b) => b - a), [rowsRaw]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = rowsRaw.filter((r) => {
      if (year !== 'all' && String(r.nomor_tahun) !== year) return false;
      if (month !== 'all' && Number(r.tanggal_surat.slice(5, 7)) !== Number(month)) return false;
      if (!term) return true;
      const hay = `${r.nomor_surat} ${r.kepada_yth} ${r.di_tempat ?? ''} ${r.tempat_surat ?? ''} ${normItems(r.items).map((i) => `${i.uraian} ${i.keterangan}`).join(' ')}`.toLowerCase();
      return hay.includes(term);
    });
    const [key, dir] = sort.split('-') as ['date' | 'nomor' | 'kepada', 'asc' | 'desc'];
    const m = dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (key === 'date') return (a.tanggal_surat.localeCompare(b.tanggal_surat) || a.created_at.localeCompare(b.created_at)) * m;
      if (key === 'nomor') return ((a.nomor_urut ?? 0) - (b.nomor_urut ?? 0) || a.nomor_surat.localeCompare(b.nomor_surat, 'id', { numeric: true })) * m;
      return a.kepada_yth.localeCompare(b.kepada_yth, 'id') * m;
    });
  }, [rowsRaw, search, year, month, sort]);

  useEffect(() => { setPage(1); }, [search, year, month, sort, pageSize]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openForm = (m: Mode, r: SuratPengantarRow | null = null) => { setMode(m); setSource(r); setFormOpen(true); };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold"><FileText className="h-6 w-6 text-primary" /> Surat Pengantar</h1>
            <p className="text-sm text-muted-foreground">Buat surat pengantar berkop sekolah dengan nomor otomatis; tersimpan dan bisa disalin untuk surat berikutnya.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 className="mr-2 h-4 w-4" /> Pengaturan nomor</Button>
            <Button onClick={() => openForm('create')}><Plus className="mr-2 h-4 w-4" /> Buat Surat Pengantar</Button>
          </div>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative lg:col-span-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Cari nomor, tujuan, uraian…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue placeholder="Tahun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua tahun</SelectItem>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue placeholder="Bulan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua bulan</SelectItem>
                {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger><SelectValue placeholder="Urutkan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Tanggal (terbaru)</SelectItem>
                <SelectItem value="date-asc">Tanggal (terlama)</SelectItem>
                <SelectItem value="nomor-desc">Nomor (terbesar)</SelectItem>
                <SelectItem value="nomor-asc">Nomor (terkecil)</SelectItem>
                <SelectItem value="kepada-asc">Tujuan A–Z</SelectItem>
                <SelectItem value="kepada-desc">Tujuan Z–A</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : isError ? (
          <Card><CardContent className="py-10 text-center text-destructive">
            Gagal memuat data. Pastikan migrasi <code>20261108130000_surat_pengantar.sql</code> sudah dijalankan dan Anda login sebagai tata usaha atau admin.
          </CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0 sm:p-2">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead className="min-w-[210px]">Nomor &amp; tanggal</TableHead>
                      <TableHead className="min-w-[200px]">Kepada</TableHead>
                      <TableHead className="min-w-[220px]">Uraian</TableHead>
                      <TableHead className="min-w-[190px] text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        {rowsRaw.length === 0 ? 'Belum ada surat pengantar. Klik “Buat Surat Pengantar”.' : 'Tidak ada surat yang cocok dengan filter.'}
                      </TableCell></TableRow>
                    ) : pageRows.map((r, i) => {
                      const items = normItems(r.items);
                      const first = items[0]?.uraian.split('\n')[0] ?? '';
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{(safePage - 1) * pageSize + i + 1}</TableCell>
                          <TableCell>
                            <p className="font-medium">{r.nomor_surat}</p>
                            <p className="text-xs text-muted-foreground">{longDate(r.tanggal_surat)}{r.tempat_surat ? ` • ${r.tempat_surat}` : ''}</p>
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.kepada_yth.split('\n')[0]}
                            {(r.di_tempat || r.kepada_yth.includes('\n')) && (
                              <p className="text-xs text-muted-foreground">{[r.kepada_yth.split('\n')[1], r.di_tempat && `di ${r.di_tempat}`].filter(Boolean).join(' • ')}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <p className="line-clamp-2">{first || '-'}</p>
                            {items.length > 1 && <p className="text-xs text-muted-foreground">+{items.length - 1} baris lain</p>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-0.5">
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Pratinjau / unduh PDF" aria-label="Pratinjau" onClick={() => setPreview(toData(r))}><Eye className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Salin surat" aria-label="Salin" onClick={() => openForm('copy', r)}><Copy className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Ubah" aria-label="Ubah" onClick={() => openForm('edit', r)}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Hapus" aria-label="Hapus" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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

      <LetterFormDialog
        open={formOpen} mode={mode} source={source} onClose={() => setFormOpen(false)}
        pattern={pattern} defaultPlace={defaultPlace} schoolSettings={schoolSettings} onPreview={setPreview}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} pattern={pattern} place={cfg?.place ?? ''} />
      <PreviewDialog letter={preview} onClose={() => setPreview(null)} schoolSettings={schoolSettings} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && !remove.isPending && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus surat pengantar?</AlertDialogTitle>
            <AlertDialogDescription>
              Surat nomor “{deleting?.nomor_surat}” akan dihapus permanen. Nomor tersebut dapat dipakai lagi.
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
