import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Printer } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useExamSettings, useSaveExamSettings } from '@/hooks/useExamSettings';
import { ATT_LABEL, collectAbsent, fmtDateId, wibNow, type AbsentOrder, type OvRoom } from '@/lib/examAttendance';
import { absentFileName, buildAbsentPdf } from '@/lib/examAbsentPdf';
import { PAPER_LABEL, type PdfPaper } from '@/lib/pdfPaper';

const STATUS_COLOR = { sakit: 'text-orange-600', izin: 'text-blue-600', alpa: 'text-red-600' } as const;

/** Panitia ujian: cetak daftar siswa tidak hadir (dari absensi pengawas ruang) dengan kop dan tanda tangan ketua panitia. */
export default function PanitiaUjianTidakHadir() {
  const [params] = useSearchParams();
  const { data: settings } = useExamSettings();
  const saveSettings = useSaveExamSettings();
  const [date, setDate] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(params.get('tanggal') ?? '') ? params.get('tanggal')! : wibNow().date));
  const [order, setOrder] = useState<AbsentOrder>('ruang');
  const [paper, setPaper] = useState<PdfPaper>('a4');
  const [signDate, setSignDate] = useState(() => wibNow().date);
  const [chair, setChair] = useState({ title: 'Ketua Panitia', name: '', nip: '' });
  const [loadedChair, setLoadedChair] = useState(false);
  const [printing, setPrinting] = useState(false);

  // nama ketua panitia disimpan di pengaturan ujian (exam_card_settings.committee_chair) agar sama untuk semua panitia
  useEffect(() => {
    if (!settings || loadedChair) return;
    const c = (settings as any)?.exam_card_settings?.committee_chair;
    if (c && typeof c === 'object') setChair({ title: String(c.title || 'Ketua Panitia'), name: String(c.name || ''), nip: String(c.nip || '') });
    setLoadedChair(true);
  }, [settings, loadedChair]);

  const q = useQuery({
    queryKey: ['panitia-kehadiran-ruang', date],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('exam_room_attendance_overview', { p_date: date });
      if (error) throw error;
      return data as { rooms: OvRoom[] };
    },
  });
  const res = useMemo(() => collectAbsent(q.data?.rooms ?? [], order), [q.data, order]);
  const totalAbsent = res.rows.length;

  const doPrint = async () => {
    setPrinting(true);
    try {
      // simpan data ketua panitia bila berubah (tidak menghalangi cetak)
      const prev = (settings as any)?.exam_card_settings?.committee_chair;
      if (settings && (prev?.name !== chair.name || prev?.nip !== chair.nip || prev?.title !== chair.title)) {
        try {
          await saveSettings.mutateAsync({ cardSettings: { ...((settings as any).exam_card_settings || {}), committee_chair: chair } });
        } catch (e: any) { toast.warning(`Data ketua panitia belum tersimpan: ${e?.message || e}`); }
      }
      const doc = await buildAbsentPdf({
        examName: settings?.exam_name as string | undefined, academicYear: settings?.academic_year as string | undefined,
        examDate: date, rows: res.rows, counts: res.counts, totalStudents: res.total, notRecorded: res.notRecorded,
        paper, place: (settings as any)?.city_name || 'Ciamis', signDate,
        chairTitle: chair.title, chairName: chair.name, chairNip: chair.nip,
      }, settings as any);
      doc.save(absentFileName(date, paper));
    } catch (e: any) {
      console.error(e);
      toast.error(`Gagal membuat PDF: ${e?.message || e}`);
    } finally { setPrinting(false); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cetak Siswa Tidak Hadir</h1>
            <p className="text-muted-foreground">Daftar siswa sakit, izin, dan alpa dari absensi pengawas ruang. PDF berkop dengan tanda tangan ketua panitia.</p>
          </div>
          <Button variant="outline" asChild><Link to="/panitia-ujian/kehadiran">Pantau kehadiran per ruang</Link></Button>
        </div>

        {q.error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(q.error as any)?.message || 'Gagal memuat data.'} Bila pesan menyebut fungsi tidak ditemukan, migrasi absensi pengawas belum dijalankan.
          </p>
        )}

        <Card>
          <CardHeader><CardTitle>Pengaturan cetak</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="tgl">Tanggal ujian</Label><Input id="tgl" type="date" value={date} onChange={(e) => setDate(e.target.value || wibNow().date)} /></div>
            <div className="space-y-1.5">
              <Label>Urutan daftar</Label>
              <Select value={order} onValueChange={(v) => setOrder(v as AbsentOrder)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ruang">Per ruang</SelectItem><SelectItem value="kelas">Per kelas</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kertas</Label>
              <Select value={paper} onValueChange={(v) => setPaper(v as PdfPaper)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(PAPER_LABEL) as PdfPaper[]).map((p) => <SelectItem key={p} value={p}>{PAPER_LABEL[p]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="jab">Jabatan penandatangan</Label><Input id="jab" value={chair.title} maxLength={60} onChange={(e) => setChair({ ...chair, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="nm">Nama ketua panitia</Label><Input id="nm" value={chair.name} maxLength={80} placeholder="Nama lengkap beserta gelar" onChange={(e) => setChair({ ...chair, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="nip">NIP ketua panitia</Label><Input id="nip" value={chair.nip} maxLength={30} placeholder="Kosongkan bila tidak ada" onChange={(e) => setChair({ ...chair, nip: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="sd">Tanggal tanda tangan</Label><Input id="sd" type="date" value={signDate} onChange={(e) => setSignDate(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground md:col-span-2 self-end">Kop surat, nama ujian, dan tempat diambil dari Pengaturan Sekolah. Nama ketua panitia disimpan otomatis saat mencetak.</p>
          </CardContent>
        </Card>

        {res.notRecorded > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{res.notRecorded} siswa belum diabsen pengawas</AlertTitle>
            <AlertDescription>Mereka tidak dihitung sebagai tidak hadir. Cek ruangnya di <Link className="underline" to="/panitia-ujian/kehadiran">Kehadiran Siswa per Ruang</Link> sebelum mencetak laporan akhir.</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <span>Siswa tidak hadir — {fmtDateId(date)}</span>
              <span className="flex flex-wrap gap-1.5">
                <Badge variant="outline">Sakit {res.counts.sakit}</Badge><Badge variant="outline">Izin {res.counts.izin}</Badge><Badge variant="outline">Alpa {res.counts.alpa}</Badge>
                <Badge>{totalAbsent} dari {res.total} siswa</Badge>
              </span>
            </CardTitle>
            <CardDescription>Pratinjau isi PDF.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {q.isLoading ? <p className="text-sm text-muted-foreground">Memuat…</p> : totalAbsent === 0 ? (
              <p className="text-sm text-muted-foreground">{res.total === 0 ? 'Belum ada data ruang pada tanggal ini.' : 'Tidak ada siswa yang tidak hadir (nihil).'}</p>
            ) : (
              <div className="max-h-[50vh] overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted"><tr><th className="w-10 p-2 text-center">No</th><th className="p-2 text-left">Nama</th><th className="p-2 text-left">Kelas</th><th className="p-2 text-center">Ruang / Meja</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Keterangan</th></tr></thead>
                  <tbody>
                    {res.rows.map((r, i) => (
                      <tr key={r.student_id} className="border-t">
                        <td className="p-2 text-center">{i + 1}</td><td className="p-2">{r.full_name}</td><td className="p-2">{r.class_name}</td>
                        <td className="p-2 text-center">{r.room_no}{r.table_no ? ` / ${r.table_no}` : ''}</td>
                        <td className={`p-2 font-medium ${STATUS_COLOR[r.status]}`}>{ATT_LABEL[r.status]}</td><td className="p-2 text-muted-foreground">{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={doPrint} disabled={printing || q.isLoading || !settings}><Printer className="mr-2 h-4 w-4" />{printing ? 'Membuat…' : 'Cetak PDF'}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
