import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2, Save, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { waAdminFetch, wibToday } from '@/lib/waBot';

interface SendResult {
  month?: string;
  periode: string;
  rombel: number;
  siswa: number;
  queued: string[];
  already_sent: string[];
  no_group: string[];
  waiting_retry: string[];
  gave_up: string[];
}

const HOLIDAY_EXAMPLE = '2026-11-10 Hari Pahlawan\n2026-12-22..2027-01-02 Libur semester';

/** Tab "Rekap Bulanan": PDF rekap kehadiran akhir bulan ke grup tiap kelas dan grup utama sekolah. */
export function MonthlyRecapTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState('16:00');
  const [classGroups, setClassGroups] = useState(true);
  const [mainGroup, setMainGroup] = useState(true);
  const [paper, setPaper] = useState<'a4' | 'f4'>('a4');
  const [place, setPlace] = useState('Ciamis');
  const [holidays, setHolidays] = useState('');
  const [month, setMonth] = useState(() => wibToday().slice(0, 7));
  const [testTo, setTestTo] = useState('');
  const [confirmForce, setConfirmForce] = useState<boolean | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['wa-bot-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wa_bot_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (!data) return;
    setEnabled(!!data.monthly_recap_enabled);
    setTime(String(data.monthly_recap_time || '16:00').slice(0, 5));
    setClassGroups(data.monthly_recap_class_groups !== false);
    setMainGroup(data.monthly_recap_main_group !== false);
    setPaper(data.monthly_recap_paper === 'f4' ? 'f4' : 'a4');
    setPlace(String(data.monthly_recap_place ?? 'Ciamis'));
    setHolidays(String(data.monthly_recap_holidays ?? ''));
  }, [data]);

  // Kolom baru berasal dari migrasi 20261125120000; bila belum dijalankan, tampilkan petunjuk jelas.
  const columnsMissing = !!data && !('monthly_recap_enabled' in data);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('wa_bot_settings').upsert({
        id: 1,
        monthly_recap_enabled: enabled,
        monthly_recap_time: /^\d{2}:\d{2}$/.test(time) ? time : '16:00',
        monthly_recap_class_groups: classGroups,
        monthly_recap_main_group: mainGroup,
        monthly_recap_paper: paper,
        monthly_recap_place: place.trim() || 'Ciamis',
        monthly_recap_holidays: holidays.trim(),
        updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      } as any);
      if (error) throw error;
      waAdminFetch('/admin/reload-config', { method: 'POST' }).catch(() => {});
    },
    onSuccess: () => { toast.success('Pengaturan rekap bulanan disimpan'); qc.invalidateQueries({ queryKey: ['wa-bot-settings'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendNow = useMutation({
    mutationFn: (force: boolean) => waAdminFetch<SendResult>('/admin/send-monthly-recap', { method: 'POST', body: { month, force } }),
    onSuccess: (r) => {
      const parts = [`Masuk antrian: ${r.queued.length} PDF`];
      if (r.already_sent.length) parts.push(`sudah terkirim: ${r.already_sent.length}`);
      if (r.no_group.length) parts.push(`kelas tanpa grup: ${r.no_group.length}`);
      toast.success(`${parts.join(', ')}. Periode ${r.periode}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: () => waAdminFetch<SendResult>('/admin/send-monthly-recap', { method: 'POST', body: { month, test_to: testTo.trim() } }),
    onSuccess: (r) => toast.success(`PDF uji (semua rombel, ${r.rombel} kelas) masuk antrian ke ${testTo.trim()}.`),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Rekap Kehadiran Bulanan (PDF)</CardTitle>
        <CardDescription>
          Pada hari terakhir tiap bulan, bot mengirim file PDF rekap kehadiran tanggal 1 sampai akhir bulan: PDF masing-masing kelas ke grup kelasnya,
          dan satu PDF berisi semua rombel ke grup utama sekolah. Semua tanggal tampil di tabel; Sabtu, Minggu, dan hari libur diarsir abu-abu.
          Nomor bot harus sudah menjadi anggota grup tujuan. Grup kelas diatur di tab Grup Kelas, grup utama di tab Rekap Grup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {columnsMissing && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            Kolom pengaturan belum ada di database. Jalankan dulu berkas <code>supabase/migrations/20261125120000_wa_rekap_bulanan.sql</code> di SQL Editor, lalu muat ulang halaman ini.
          </p>
        )}

        <div className="max-w-xl space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="mr-en">Aktifkan pengiriman otomatis akhir bulan</Label>
              <p className="text-xs text-muted-foreground">Bawaan mati. Cobalah dulu lewat &quot;Kirim uji&quot; di bawah sebelum mengaktifkan.</p>
            </div>
            <Switch id="mr-en" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="mr-time">Jam kirim (WIB) pada hari terakhir bulan</Label>
              <Input id="mr-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Ukuran kertas</Label>
              <Select value={paper} onValueChange={(v) => setPaper(v as 'a4' | 'f4')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4 (210 × 297 mm)</SelectItem>
                  <SelectItem value="f4">F4 / Folio (215 × 330 mm)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="mr-place">Kota pada tanda tangan wali kelas</Label>
            <Input id="mr-place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Ciamis" />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="mr-cls">Kirim PDF tiap kelas ke grup kelasnya</Label>
            <Switch id="mr-cls" checked={classGroups} onCheckedChange={setClassGroups} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="mr-main">Kirim PDF semua rombel ke grup utama sekolah</Label>
            <Switch id="mr-main" checked={mainGroup} onCheckedChange={setMainGroup} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="mr-hol">Tanggal libur (satu per baris)</Label>
            <Textarea
              id="mr-hol" rows={5} value={holidays} onChange={(e) => setHolidays(e.target.value)}
              placeholder={HOLIDAY_EXAMPLE} className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground text-pretty">
              Format <code>TAHUN-BULAN-TANGGAL Keterangan</code>, atau rentang <code>2026-12-22..2027-01-02 Keterangan</code>.
              Sabtu dan Minggu otomatis diarsir. Hari kerja yang tidak punya satu pun data absensi di seluruh sekolah juga dianggap libur,
              jadi daftar ini terutama berguna agar keterangan libur tercetak di PDF.
            </p>
          </div>

          <Button onClick={() => save.mutate()} disabled={save.isPending || columnsMissing}>
            {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Simpan
          </Button>
        </div>

        <div className="max-w-xl space-y-4 rounded-lg border p-4">
          <h3 className="font-semibold">Kirim sekarang / uji</h3>
          <p className="text-xs text-muted-foreground">Simpan pengaturan dulu. Pembuatan PDF semua rombel butuh beberapa detik.</p>
          <div className="space-y-1">
            <Label htmlFor="mr-month">Bulan rekap</Label>
            <Input id="mr-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-48" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mr-test">Kirim uji ke nomor WhatsApp (atau JID grup)</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="mr-test" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="08xxxxxxxxxx" inputMode="tel" />
              <Button
                variant="outline" className="shrink-0"
                onClick={() => sendTest.mutate()} disabled={sendTest.isPending || !testTo.trim() || !month}
              >
                {sendTest.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Kirim uji
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Mengirim PDF gabungan semua rombel hanya ke tujuan ini. Tidak dicatat sebagai terkirim, jadi jadwal otomatis tidak terpengaruh.</p>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button onClick={() => setConfirmForce(false)} disabled={sendNow.isPending || !month}>
              {sendNow.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Kirim ke grup sekarang
            </Button>
            <Button variant="ghost" onClick={() => setConfirmForce(true)} disabled={sendNow.isPending || !month}>Kirim ulang semua</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Mengirim ke grup sungguhan. Tujuan yang sudah menerima bulan itu dilewati, kecuali memakai &quot;Kirim ulang semua&quot;.
            Yang sudah terkirim di sini tidak dikirim lagi oleh jadwal otomatis.
          </p>
        </div>
      </CardContent>

      <AlertDialog open={confirmForce !== null} onOpenChange={(o) => { if (!o) setConfirmForce(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmForce ? 'Kirim ulang rekap bulanan?' : 'Kirim rekap bulanan ke grup?'}</AlertDialogTitle>
            <AlertDialogDescription>
              PDF rekap bulan {month} akan dikirim ke grup tiap kelas dan grup utama sesuai pengaturan yang tersimpan
              {confirmForce ? ', termasuk yang sudah pernah terkirim' : ''}. Pesan yang sudah masuk ke grup tidak bisa ditarik dari sini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmForce !== null) sendNow.mutate(confirmForce); setConfirmForce(null); }}>Kirim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
