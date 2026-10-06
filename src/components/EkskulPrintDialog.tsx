import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import type jsPDF from 'jspdf';
import { toast } from 'sonner';
import { Download, ExternalLink, Eye, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { EKSKUL_PHOTO_BUCKET, ekskulDb, type EkskulType } from '@/hooks/useEkskul';
import {
  generateEkskulJournalPdf,
  guessPlaceFromDistrict,
  type EkskulPdfJournal,
  type EkskulPdfPhoto,
  type EkskulSigner,
} from '@/lib/ekskulJournalPdf';
import { generateEkskulAttendancePdf, type AttendancePerson } from '@/lib/ekskulAttendancePdf';

export type EkskulDocKind = 'journal' | 'attendance';

interface Instructor {
  id: string;
  name: string;
  nip: string | null;
  nuptk: string | null;
  pangkat_golongan: string | null;
  jabatan: string | null;
}

interface PrintInfo {
  ekskul_name: string;
  instructors: Instructor[];
  wakasek: { full_name: string | null; nip: string | null; nuptk: string | null } | null;
}

interface MemberRow {
  full_name: string;
  class_name: string | null;
  status: 'aktif' | 'nonaktif' | 'keluar';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: EkskulType[];
  defaultTypeId?: string;
  defaultMonth?: string; // yyyy-MM
  defaultKind?: EkskulDocKind;
}

interface BuiltDoc {
  doc: jsPDF;
  filename: string;
  notes: string[];
}

const MAX_PHOTOS_IN_PDF = 60;

export function EkskulPrintDialog({ open, onOpenChange, types, defaultTypeId, defaultMonth, defaultKind = 'journal' }: Props) {
  const [kind, setKind] = useState<EkskulDocKind>(defaultKind);
  const [typeId, setTypeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [place, setPlace] = useState('');
  const [includePhotos, setIncludePhotos] = useState(true);
  const [busy, setBusy] = useState<null | 'preview' | 'print'>(null);

  const [preview, setPreview] = useState<{ url: string; built: BuiltDoc } | null>(null);

  // Reset isian setiap dialog dibuka
  useEffect(() => {
    if (!open) return;
    const base = defaultMonth ? new Date(`${defaultMonth}-01T00:00:00`) : new Date();
    setKind(defaultKind);
    setFrom(format(startOfMonth(base), 'yyyy-MM-dd'));
    setTo(format(endOfMonth(base), 'yyyy-MM-dd'));
    setTypeId(defaultTypeId && defaultTypeId !== 'all' ? defaultTypeId : types.length === 1 ? types[0].id : '');
    setInstructorId('');
    setIncludePhotos(true);
  }, [open, defaultMonth, defaultTypeId, defaultKind, types]);

  // Bersihkan object URL pratinjau
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const { data: info, isFetching: infoLoading } = useQuery({
    queryKey: ['ekskul-print-info', typeId],
    enabled: open && !!typeId,
    queryFn: async (): Promise<PrintInfo | null> => {
      const { data, error } = await ekskulDb.rpc('get_ekskul_print_info', { _type_id: typeId });
      if (error) throw error;
      return (data ?? null) as PrintInfo | null;
    },
  });

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings-letterhead'],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_school_settings_for_letterhead');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data as any;
    },
  });

  // Tempat tanda tangan default dari nama kabupaten/kota di kop
  useEffect(() => {
    if (open && !place && schoolSettings?.district_name) setPlace(guessPlaceFromDistrict(schoolSettings.district_name));
  }, [open, place, schoolSettings]);

  // Pilih pembina otomatis bila hanya ada satu
  useEffect(() => {
    if (!info) return;
    if (info.instructors.length === 1) setInstructorId(info.instructors[0].id);
    else if (!info.instructors.some((i) => i.id === instructorId)) setInstructorId('');
  }, [info, instructorId]);

  const instructor = useMemo(
    () => info?.instructors.find((i) => i.id === instructorId) ?? null,
    [info, instructorId],
  );

  const noInstructors = !!typeId && !infoLoading && !!info && info.instructors.length === 0;
  const noWakasek = !!typeId && !infoLoading && !!info && !info.wakasek?.full_name;
  const rangeInvalid = !from || !to || to < from;
  const needsInstructor = kind === 'journal';
  const canRun = !!typeId && !rangeInvalid && !infoLoading && (!needsInstructor || !!instructor);

  const toSigner = (s: { name?: string | null; nip?: string | null; nuptk?: string | null } | null): EkskulSigner | null =>
    s?.name ? { name: s.name, nip: s.nip, nuptk: s.nuptk } : null;

  const wakasekSigner = (): EkskulSigner | null =>
    toSigner(info?.wakasek ? { name: info.wakasek.full_name, nip: info.wakasek.nip, nuptk: info.wakasek.nuptk } : null);

  const periodLabel = () =>
    from === to
      ? format(new Date(`${from}T00:00:00`), 'd MMMM yyyy', { locale: idLocale })
      : `${format(new Date(`${from}T00:00:00`), 'd MMMM yyyy', { locale: idLocale })} s.d. ${format(new Date(`${to}T00:00:00`), 'd MMMM yyyy', { locale: idLocale })}`;

  /** Ambil jurnal pada rentang terpilih (urut tanggal). */
  const fetchJournals = async (select: string) => {
    const { data, error } = await ekskulDb
      .from('extracurricular_journals')
      .select(select)
      .eq('extracurricular_type_id', typeId)
      .gte('meeting_date', from)
      .lte('meeting_date', to)
      .order('meeting_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: true });
    if (error) throw error;
    return (data ?? []) as Array<Record<string, unknown>>;
  };

  const buildJournal = async (): Promise<BuiltDoc | null> => {
    if (!instructor) return null;
    const journals = (await fetchJournals(
      'id, meeting_date, start_time, end_time, title, activity_description, location, evaluation, students_present, students_absent',
    )) as unknown as EkskulPdfJournal[];
    if (journals.length === 0) {
      toast.warning('Tidak ada jurnal pada rentang tanggal tersebut');
      return null;
    }

    const notes: string[] = [];
    let photos: EkskulPdfPhoto[] = [];
    if (includePhotos) {
      const { data: photoRows, error: pErr } = await ekskulDb
        .from('extracurricular_journal_photos')
        .select('journal_id, file_path, created_at')
        .in('journal_id', journals.map((j) => j.id))
        .order('created_at', { ascending: true });
      if (pErr) throw pErr;

      let rows = (photoRows ?? []) as Array<{ journal_id: string; file_path: string }>;
      if (rows.length > MAX_PHOTOS_IN_PDF) {
        notes.push(`Foto dibatasi ${MAX_PHOTOS_IN_PDF} dari ${rows.length} agar file tidak terlalu besar.`);
        rows = rows.slice(0, MAX_PHOTOS_IN_PDF);
      }
      if (rows.length > 0) {
        const { data: signed, error: sErr } = await supabase.storage
          .from(EKSKUL_PHOTO_BUCKET)
          .createSignedUrls(rows.map((r) => r.file_path), 15 * 60);
        if (sErr) throw sErr;
        const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? '', s.signedUrl]));
        photos = rows
          .map((r) => ({ journal_id: r.journal_id, url: urlByPath.get(r.file_path) ?? '' }))
          .filter((p) => !!p.url);
      }
    }

    const doc = await generateEkskulJournalPdf({
      schoolSettings,
      ekskulName: info?.ekskul_name ?? types.find((t) => t.id === typeId)?.name ?? 'Ekstrakurikuler',
      periodLabel: periodLabel(),
      journals,
      photos,
      includePhotos,
      instructor: toSigner({ name: instructor.name, nip: instructor.nip, nuptk: instructor.nuptk }),
      wakasek: wakasekSigner(),
      place,
      printDate: new Date(),
    });
    const safe = (info?.ekskul_name ?? 'Ekskul').replace(/[^\w-]+/g, '_');
    return { doc, filename: `Jurnal_Ekskul_${safe}_${from}_${to}.pdf`, notes };
  };

  const buildAttendance = async (): Promise<BuiltDoc | null> => {
    const journals = (await fetchJournals('id, meeting_date')) as unknown as Array<{ id: string; meeting_date: string }>;
    if (journals.length === 0) {
      toast.warning('Belum ada jurnal pada rentang ini. Tanggal pertemuan diambil dari jurnal.');
      return null;
    }

    const { data: memberRows, error: mErr } = await ekskulDb.rpc('get_ekskul_members', { _type_id: typeId });
    if (mErr) throw mErr;
    const members = ((memberRows ?? []) as MemberRow[]).filter((m) => m.status === 'aktif');

    const people: AttendancePerson[] = [
      ...(info?.instructors ?? []).map((i) => ({
        name: i.name,
        role: i.jabatan?.trim() || 'Pembina',
        isInstructor: true,
      })),
      ...members.map((m) => ({ name: m.full_name, role: m.class_name ?? '-', isInstructor: false })),
    ];

    const notes: string[] = [];
    if (!(info?.instructors?.length)) notes.push('Belum ada pembina aktif di data instruktur, daftar hanya berisi anggota.');
    if (members.length === 0) notes.push('Belum ada anggota aktif untuk ekskul ini.');

    const doc = await generateEkskulAttendancePdf({
      schoolSettings,
      ekskulName: info?.ekskul_name ?? types.find((t) => t.id === typeId)?.name ?? 'Ekstrakurikuler',
      periodLabel: periodLabel(),
      meetings: journals.map((j) => ({ id: j.id, meeting_date: j.meeting_date })),
      people,
      wakasek: wakasekSigner(),
      place,
      printDate: new Date(),
    });
    const safe = (info?.ekskul_name ?? 'Ekskul').replace(/[^\w-]+/g, '_');
    return { doc, filename: `Daftar_Hadir_Ekskul_${safe}_${from}_${to}.pdf`, notes };
  };

  const build = async (mode: 'preview' | 'print') => {
    if (!canRun) return;
    setBusy(mode);
    try {
      const built = kind === 'journal' ? await buildJournal() : await buildAttendance();
      if (!built) return;

      if (mode === 'preview') {
        const url = URL.createObjectURL(built.doc.output('blob'));
        setPreview({ url, built });
      } else {
        built.doc.save(built.filename);
        toast.success(kind === 'journal' ? 'Jurnal berhasil dicetak' : 'Daftar hadir berhasil dicetak');
        onOpenChange(false);
      }
      built.notes.forEach((n) => toast.info(n));
      if (noWakasek) toast.warning('Wakasek Kesiswaan belum diatur di Pengaturan, kolom tanda tangan dikosongkan.');
    } catch (err) {
      console.error('Cetak/pratinjau ekskul gagal:', err);
      toast.error('Gagal membuat dokumen');
    } finally {
      setBusy(null);
    }
  };

  const closePreview = () => setPreview(null);

  return (
    <>
      <Dialog open={open && !preview} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cetak Jurnal &amp; Daftar Hadir Ekskul</DialogTitle>
            <DialogDescription>
              Dokumen memakai kop sekolah. Tanggal pertemuan mengikuti jurnal yang sudah diinput.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>Jenis dokumen</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as EkskulDocKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="journal">Jurnal kegiatan (TTD pembina &amp; Wakasek)</SelectItem>
                  <SelectItem value="attendance">Daftar hadir (TTD Wakasek Kesiswaan)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Ekstrakurikuler *</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger><SelectValue placeholder="Pilih ekskul" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dari tanggal</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Sampai tanggal</Label>
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>

            {kind === 'journal' ? (
              <div className="space-y-1.5">
                <Label>Pembina penandatangan *</Label>
                <Select value={instructorId} onValueChange={setInstructorId} disabled={!typeId || infoLoading || noInstructors}>
                  <SelectTrigger>
                    <SelectValue placeholder={infoLoading ? 'Memuat...' : noInstructors ? 'Belum ada pembina' : 'Pilih pembina'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(info?.instructors ?? []).map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}{i.nip ? ` — NIP. ${i.nip}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {noInstructors && (
                  <p className="text-xs text-destructive">
                    Belum ada pembina aktif untuk ekskul ini. Tambahkan di menu Honorarium Ekskul (data instruktur).
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Baris paling atas — Pembimbing</p>
                {infoLoading ? (
                  <p className="text-muted-foreground">Memuat...</p>
                ) : info?.instructors?.length ? (
                  <p className="font-medium">{info.instructors.map((i) => i.name).join(', ')}</p>
                ) : (
                  <p className="text-amber-600">Belum ada pembina aktif di data instruktur.</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">Dilanjutkan anggota ekskul berstatus aktif.</p>
              </div>
            )}

            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="text-xs text-muted-foreground">Mengetahui — Wakasek Kesiswaan</p>
              {infoLoading ? (
                <p className="text-muted-foreground">Memuat...</p>
              ) : info?.wakasek?.full_name ? (
                <p className="font-medium">
                  {info.wakasek.full_name}
                  {info.wakasek.nip ? <span className="ml-2 font-normal text-muted-foreground">NIP. {info.wakasek.nip}</span> : null}
                </p>
              ) : (
                <p className="text-amber-600">Belum diatur. Admin dapat memilihnya di Pengaturan → Wakasek Kesiswaan.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Tempat penandatanganan</Label>
              <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Contoh: Ciamis" />
            </div>

            {kind === 'journal' && (
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={includePhotos} onCheckedChange={(v) => setIncludePhotos(v === true)} className="mt-0.5" />
                <span>
                  Sertakan lampiran foto kegiatan
                  <span className="block text-xs text-muted-foreground">Foto dikecilkan otomatis; maksimal {MAX_PHOTOS_IN_PDF} foto per cetakan.</span>
                </span>
              </label>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!busy}>Batal</Button>
            <Button variant="secondary" onClick={() => build('preview')} disabled={!!busy || !canRun}>
              {busy === 'preview' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Pratinjau
            </Button>
            <Button onClick={() => build('print')} disabled={!!busy || !canRun}>
              {busy === 'print' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              Cetak PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------- Pratinjau ----------------------------- */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && closePreview()}>
        <DialogContent className="flex h-[92vh] max-w-5xl flex-col gap-3 p-4">
          <DialogHeader>
            <DialogTitle>Pratinjau {kind === 'journal' ? 'Jurnal' : 'Daftar Hadir'} Ekskul</DialogTitle>
            <DialogDescription>Periksa dulu sebelum diunduh. Tutup untuk kembali mengubah pengaturan.</DialogDescription>
          </DialogHeader>
          {preview && (
            <iframe
              title="Pratinjau PDF"
              src={preview.url}
              className="min-h-0 w-full flex-1 rounded-md border bg-white"
            />
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closePreview}>Kembali</Button>
            {preview && (
              <Button variant="outline" onClick={() => window.open(preview.url, '_blank', 'noopener')}>
                <ExternalLink className="mr-2 h-4 w-4" /> Buka di tab baru
              </Button>
            )}
            <Button
              onClick={() => {
                if (!preview) return;
                preview.built.doc.save(preview.built.filename);
                toast.success('PDF diunduh');
                setPreview(null);
                onOpenChange(false);
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Unduh PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
