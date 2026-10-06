import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import { Loader2, Printer } from 'lucide-react';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: EkskulType[];
  defaultTypeId?: string;
  defaultMonth?: string; // yyyy-MM
}

const MAX_PHOTOS_IN_PDF = 60;

export function EkskulJournalPrintDialog({ open, onOpenChange, types, defaultTypeId, defaultMonth }: Props) {
  const [typeId, setTypeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [place, setPlace] = useState('');
  const [includePhotos, setIncludePhotos] = useState(true);
  const [busy, setBusy] = useState(false);

  // Reset isian setiap dialog dibuka
  useEffect(() => {
    if (!open) return;
    const base = defaultMonth ? new Date(`${defaultMonth}-01T00:00:00`) : new Date();
    setFrom(format(startOfMonth(base), 'yyyy-MM-dd'));
    setTo(format(endOfMonth(base), 'yyyy-MM-dd'));
    setTypeId(defaultTypeId && defaultTypeId !== 'all' ? defaultTypeId : types.length === 1 ? types[0].id : '');
    setInstructorId('');
    setIncludePhotos(true);
  }, [open, defaultMonth, defaultTypeId, types]);

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

  const handlePrint = async () => {
    if (!typeId) return toast.error('Pilih ekstrakurikuler');
    if (rangeInvalid) return toast.error('Rentang tanggal tidak valid');
    if (!instructor) return toast.error('Pilih pembina yang menandatangani');

    setBusy(true);
    try {
      const { data: journalRows, error: jErr } = await ekskulDb
        .from('extracurricular_journals')
        .select('id, meeting_date, start_time, end_time, title, activity_description, location, evaluation, students_present, students_absent')
        .eq('extracurricular_type_id', typeId)
        .gte('meeting_date', from)
        .lte('meeting_date', to)
        .order('meeting_date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: true });
      if (jErr) throw jErr;
      const journals = (journalRows ?? []) as EkskulPdfJournal[];
      if (journals.length === 0) {
        toast.warning('Tidak ada jurnal pada rentang tanggal tersebut');
        return;
      }

      let photos: EkskulPdfPhoto[] = [];
      let photoNote = '';
      if (includePhotos) {
        const { data: photoRows, error: pErr } = await ekskulDb
          .from('extracurricular_journal_photos')
          .select('journal_id, file_path, created_at')
          .in('journal_id', journals.map((j) => j.id))
          .order('created_at', { ascending: true });
        if (pErr) throw pErr;

        let rows = (photoRows ?? []) as Array<{ journal_id: string; file_path: string }>;
        if (rows.length > MAX_PHOTOS_IN_PDF) {
          photoNote = ` (foto dibatasi ${MAX_PHOTOS_IN_PDF} dari ${rows.length} agar file tidak terlalu besar)`;
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

      const toSigner = (s: { name?: string | null; nip?: string | null; nuptk?: string | null } | null): EkskulSigner | null =>
        s?.name ? { name: s.name, nip: s.nip, nuptk: s.nuptk } : null;

      const periodLabel =
        from === to
          ? format(new Date(`${from}T00:00:00`), 'd MMMM yyyy', { locale: idLocale })
          : `${format(new Date(`${from}T00:00:00`), 'd MMMM yyyy', { locale: idLocale })} s.d. ${format(new Date(`${to}T00:00:00`), 'd MMMM yyyy', { locale: idLocale })}`;

      const doc = await generateEkskulJournalPdf({
        schoolSettings,
        ekskulName: info?.ekskul_name ?? types.find((t) => t.id === typeId)?.name ?? 'Ekstrakurikuler',
        periodLabel,
        journals,
        photos,
        includePhotos,
        instructor: toSigner({ name: instructor.name, nip: instructor.nip, nuptk: instructor.nuptk }),
        wakasek: toSigner(
          info?.wakasek ? { name: info.wakasek.full_name, nip: info.wakasek.nip, nuptk: info.wakasek.nuptk } : null,
        ),
        place,
        printDate: new Date(),
      });

      const safeName = (info?.ekskul_name ?? 'Ekskul').replace(/[^\w-]+/g, '_');
      doc.save(`Jurnal_Ekskul_${safeName}_${from}_${to}.pdf`);
      toast.success(`Jurnal dicetak (${journals.length} pertemuan)${photoNote}`);
      if (noWakasek) toast.warning('Wakasek Kesiswaan belum diatur di Pengaturan, kolom tanda tangan dikosongkan.');
      onOpenChange(false);
    } catch (err) {
      console.error('Cetak jurnal ekskul gagal:', err);
      toast.error('Gagal mencetak jurnal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cetak Jurnal Ekstrakurikuler</DialogTitle>
          <DialogDescription>
            PDF memakai kop sekolah, ditandatangani pembina dan diketahui Wakasek Kesiswaan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
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

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox checked={includePhotos} onCheckedChange={(v) => setIncludePhotos(v === true)} className="mt-0.5" />
            <span>
              Sertakan lampiran foto kegiatan
              <span className="block text-xs text-muted-foreground">Foto dikecilkan otomatis; maksimal {MAX_PHOTOS_IN_PDF} foto per cetakan.</span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Batal</Button>
          <Button onClick={handlePrint} disabled={busy || !typeId || !instructor || rangeInvalid}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
            Cetak PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
