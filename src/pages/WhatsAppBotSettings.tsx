import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Link2, Unlink, RefreshCw, Send, RotateCcw, Save, Copy, Wand2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { WA_TEMPLATES, WaTemplateDef, fillWaTemplate, waAdminFetch } from '@/lib/waBot';

interface BotStatus {
  connected: boolean;
  phone: string | null;
  name: string | null;
  queue_length: number;
  pairing_code: string | null;
  pairing_phone: string | null;
  last_disconnect: { reason: string; statusCode: number; at: string } | null;
}

/* ------------------------------ Koneksi ------------------------------ */
function ConnectionTab() {
  const [phone, setPhone] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [confirmBroadcast, setConfirmBroadcast] = useState(false);

  const { data: status, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['wa-bot-status'],
    queryFn: () => waAdminFetch<BotStatus>('/admin/status'),
    refetchInterval: 5000,
    retry: false,
  });

  const pair = useMutation({
    mutationFn: () => waAdminFetch<{ code: string }>('/admin/pair', { method: 'POST', body: { phone } }),
    onSuccess: (r) => { setLocalCode(r.code); toast.success('Kode pairing dibuat. Masukkan di WhatsApp dalam 2 menit.'); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const logout = useMutation({
    mutationFn: () => waAdminFetch('/admin/logout', { method: 'POST' }),
    onSuccess: () => { setLocalCode(null); toast.success('Tautan WhatsApp diputus.'); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => waAdminFetch('/admin/test-send', {
      method: 'POST',
      body: { phone: testPhone, text: '✅ Tes bot WhatsApp Pusaka berhasil.\n_SMP Negeri 8 Ciamis_' },
    }),
    onSuccess: () => toast.success('Pesan uji masuk antrian.'),
    onError: (e: Error) => toast.error(e.message),
  });

  const contacts = useQuery({
    queryKey: ['wa-teacher-contacts'],
    enabled: confirmBroadcast,
    queryFn: () => waAdminFetch<{ total: number; with_phone: number; without_phone: number }>('/admin/teacher-contacts'),
    retry: false,
  });

  const broadcast = useMutation({
    mutationFn: () => waAdminFetch<{ queued: number; skipped_no_phone: number; message: string }>('/admin/test-connection-teachers', { method: 'POST' }),
    onSuccess: (r) => {
      setConfirmBroadcast(false);
      toast.success(`${r.queued} pesan tes koneksi masuk antrian${r.skipped_no_phone ? ` (${r.skipped_no_phone} guru tanpa nomor dilewati)` : ''}.`);
    },
    onError: (e: Error) => { setConfirmBroadcast(false); toast.error(e.message); },
  });

  const code = status?.pairing_code || localCode;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Status Koneksi</CardTitle>
              <CardDescription>Bot WhatsApp (Baileys) yang mengirim notifikasi sekolah.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} /> Muat ulang
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Menghubungi bot…</p>}
          {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
          {status && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={status.connected ? 'default' : 'secondary'}>
                  {status.connected ? 'Terhubung' : 'Belum terhubung'}
                </Badge>
                {status.connected && status.phone && <span className="text-sm">Nomor bot: <b>+{status.phone}</b>{status.name ? ` (${status.name})` : ''}</span>}
                <span className="text-xs text-muted-foreground">Antrian pesan: {status.queue_length}</span>
              </div>
              {!status.connected && status.last_disconnect && (
                <p className="text-xs text-muted-foreground">
                  Terputus terakhir: {status.last_disconnect.reason} (kode {status.last_disconnect.statusCode})
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {status && !status.connected && (
        <Card>
          <CardHeader>
            <CardTitle>Tautkan Nomor WhatsApp</CardTitle>
            <CardDescription>
              Masukkan nomor WhatsApp yang akan dipakai bot, lalu buka WhatsApp → Perangkat tertaut → Tautkan perangkat → "Tautkan dengan nomor telepon", dan masukkan kode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input placeholder="08xxxxxxxxxx atau 628xxxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Button onClick={() => pair.mutate()} disabled={pair.isPending || phone.replace(/\D/g, '').length < 9}>
                {pair.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
                Buat Kode Pairing
              </Button>
            </div>
            {code && (
              <div className="rounded-lg border bg-muted/40 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Kode pairing (berlaku ±2 menit)</p>
                <p className="text-3xl font-bold tracking-[0.3em]">{code}</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => { navigator.clipboard?.writeText(code); toast.success('Kode disalin'); }}>
                  <Copy className="h-4 w-4 mr-1" /> Salin
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {status?.connected && (
        <Card>
          <CardHeader>
            <CardTitle>Kelola Tautan</CardTitle>
            <CardDescription>Kirim pesan uji atau putuskan tautan untuk mengganti nomor bot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input placeholder="Nomor tujuan tes, mis. 08xxxxxxxxxx" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || testPhone.replace(/\D/g, '').length < 9}>
                {test.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Kirim Pesan Uji
              </Button>
            </div>
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm">
                Kirim pesan <b>Tes Koneksi</b> ke semua guru agar mereka menyimpan nomor bot. Isi pesan diambil dari template "Tes Koneksi ke Guru" (tab Template Pesan).
              </p>
              <Button onClick={() => setConfirmBroadcast(true)} disabled={broadcast.isPending}>
                {broadcast.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Kirim Tes Koneksi ke Semua Guru
              </Button>
            </div>
            <Button variant="destructive" onClick={() => setConfirmLogout(true)}>
              <Unlink className="h-4 w-4 mr-1" /> Putuskan Tautan
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmBroadcast} onOpenChange={setConfirmBroadcast}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kirim tes koneksi ke semua guru?</AlertDialogTitle>
            <AlertDialogDescription>
              {contacts.isLoading && 'Menghitung guru yang punya nomor WhatsApp…'}
              {contacts.error && (contacts.error as Error).message}
              {contacts.data && `${contacts.data.with_phone} guru akan menerima pesan${contacts.data.without_phone ? `, ${contacts.data.without_phone} guru tanpa nomor WA dilewati` : ''}. Pesan dikirim bertahap (jeda beberapa detik per pesan) agar aman dari pemblokiran WhatsApp.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={!contacts.data || contacts.data.with_phone === 0 || broadcast.isPending}
              onClick={(e) => { e.preventDefault(); broadcast.mutate(); }}
            >
              Kirim Sekarang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Putuskan tautan WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Bot berhenti mengirim notifikasi sampai nomor ditautkan kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => logout.mutate()}>Putuskan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------ Template ------------------------------ */
interface TemplateRow { key: string; body: string; is_enabled: boolean }

function TemplateEditor({ def, row, connected }: { def: WaTemplateDef; row?: TemplateRow; connected: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState(row?.body ?? def.defaultBody);
  const [enabled, setEnabled] = useState(row?.is_enabled ?? true);
  const [testPhone, setTestPhone] = useState('');

  useEffect(() => {
    setBody(row?.body ?? def.defaultBody);
    setEnabled(row?.is_enabled ?? true);
  }, [row, def.defaultBody]);

  const sampleVars = Object.fromEntries(def.variables.map((v) => [v.name, v.sample]));
  const preview = fillWaTemplate(body, sampleVars);
  const unknown = Array.from(body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)).map((m) => m[1]).filter((n) => !def.variables.some((v) => v.name === n));
  const dirty = body !== (row?.body ?? def.defaultBody) || enabled !== (row?.is_enabled ?? true);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('wa_message_templates').upsert({
        key: def.key, title: def.title, body, is_enabled: enabled,
        updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      });
      if (error) throw error;
      waAdminFetch('/admin/reload-config', { method: 'POST' }).catch(() => {});
    },
    onSuccess: () => { toast.success('Template disimpan'); qc.invalidateQueries({ queryKey: ['wa-templates'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => waAdminFetch('/admin/test-send', { method: 'POST', body: { phone: testPhone, text: preview } }),
    onSuccess: () => toast.success('Pesan uji masuk antrian.'),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{def.title}</CardTitle>
            <CardDescription>{def.description}</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor={`en-${def.key}`} className="text-xs">Aktif</Label>
            <Switch id={`en-${def.key}`} checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-sm" />
            <div className="flex flex-wrap gap-1">
              {def.variables.map((v) => (
                <button key={v.name} type="button" title={v.hint}
                  className="rounded border px-2 py-0.5 text-xs hover:bg-muted"
                  onClick={() => setBody((b) => `${b}{{${v.name}}}`)}>
                  {`{{${v.name}}}`}
                </button>
              ))}
            </div>
            {unknown.length > 0 && (
              <p className="text-xs text-destructive">Variabel tidak dikenal (akan kosong): {unknown.join(', ')}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Pratinjau (data contoh)</Label>
            <div className="rounded-lg bg-[#dcf8c6] dark:bg-emerald-900/40 p-3 text-sm whitespace-pre-wrap break-words min-h-[16rem]">
              {preview}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending || !body.trim()}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Simpan
          </Button>
          <Button variant="outline" onClick={() => setBody(def.defaultBody)}>
            <RotateCcw className="h-4 w-4 mr-1" /> Kembalikan bawaan
          </Button>
          {connected && (
            <div className="flex items-center gap-2 ml-auto">
              <Input className="w-44" placeholder="Nomor tes" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || testPhone.replace(/\D/g, '').length < 9}>
                <Send className="h-4 w-4 mr-1" /> Tes
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TemplatesTab() {
  const { data: status } = useQuery({
    queryKey: ['wa-bot-status'],
    queryFn: () => waAdminFetch<BotStatus>('/admin/status'),
    refetchInterval: 15000,
    retry: false,
  });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['wa-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wa_message_templates').select('key, body, is_enabled');
      if (error) throw error;
      return data as TemplateRow[];
    },
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Gunakan penanda <code>{'{{variabel}}'}</code> untuk data otomatis. Format WhatsApp: <code>*tebal*</code>, <code>_miring_</code>. Template yang dinonaktifkan tidak akan dikirim.
      </p>
      {WA_TEMPLATES.map((def) => (
        <TemplateEditor key={def.key} def={def} row={rows.find((r) => r.key === def.key)} connected={!!status?.connected} />
      ))}
    </div>
  );
}

/* ------------------------------ Pengingat Guru ------------------------------ */
function ReminderTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [lead, setLead] = useState(10);
  const [follow, setFollow] = useState(15);
  const [scope, setScope] = useState<'first' | 'all'>('all');
  const [chkJournal, setChkJournal] = useState(true);
  const [chkAttendance, setChkAttendance] = useState(true);
  const [remindNext, setRemindNext] = useState(true);
  const [recap, setRecap] = useState(false);
  const [recapTime, setRecapTime] = useState('06:00');
  const [satGreet, setSatGreet] = useState(true);
  const [satTime, setSatTime] = useState('07:00');
  const [hrOn, setHrOn] = useState(false);
  const [hrTimes, setHrTimes] = useState('08:30');
  const [piketWa, setPiketWa] = useState(true);
  const [wkOn, setWkOn] = useState(false);
  const [wkDay, setWkDay] = useState('6');
  const [wkTime, setWkTime] = useState('13:00');
  const [wkThreshold, setWkThreshold] = useState(3);
  const [wkGroup, setWkGroup] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['wa-bot-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wa_bot_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      setEnabled(data.teacher_reminder_enabled);
      setLead(data.reminder_lead_min);
      setFollow(data.reminder_followup_min);
      setScope(data.reminder_scope === 'first' ? 'first' : 'all');
      setChkJournal(data.followup_journal);
      setChkAttendance(data.followup_attendance);
      setRemindNext(data.followup_attendance_next_teachers !== false);
      setRecap(data.daily_recap_enabled);
      setRecapTime(String(data.daily_recap_time || '06:00').slice(0, 5));
      setSatGreet(data.saturday_greeting_enabled !== false);
      setSatTime(String(data.saturday_greeting_time || '07:00').slice(0, 5));
      setHrOn(!!data.homeroom_att_reminder_enabled);
      setHrTimes(String(data.homeroom_att_reminder_times || '08:30'));
      setPiketWa(data.piket_wa_enabled !== false);
      setWkOn(!!data.weekly_absence_enabled);
      setWkDay(String(data.weekly_absence_day || 6));
      setWkTime(String(data.weekly_absence_time || '13:00').slice(0, 5));
      setWkThreshold(data.weekly_absence_threshold || 3);
      setWkGroup(!!data.weekly_absence_to_group);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('wa_bot_settings').upsert({
        id: 1, teacher_reminder_enabled: enabled,
        reminder_lead_min: Math.min(120, Math.max(1, lead || 10)),
        reminder_followup_min: Math.min(120, Math.max(1, follow || 15)),
        reminder_scope: scope,
        followup_journal: chkJournal,
        followup_attendance: chkAttendance,
        followup_attendance_next_teachers: remindNext,
        daily_recap_enabled: recap,
        daily_recap_time: /^\d{2}:\d{2}$/.test(recapTime) ? recapTime : '06:00',
        saturday_greeting_enabled: satGreet,
        saturday_greeting_time: /^\d{2}:\d{2}$/.test(satTime) ? satTime : '07:00',
        homeroom_att_reminder_enabled: hrOn,
        homeroom_att_reminder_times: hrTimes.split(/[,\s;]+/).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, '0')).join(', ') || '08:30',
        piket_wa_enabled: piketWa,
        weekly_absence_enabled: wkOn,
        weekly_absence_day: Math.min(7, Math.max(1, parseInt(wkDay, 10) || 6)),
        weekly_absence_time: /^\d{2}:\d{2}$/.test(wkTime) ? wkTime : '13:00',
        weekly_absence_threshold: Math.min(10, Math.max(1, wkThreshold || 3)),
        weekly_absence_to_group: wkGroup,
        updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      });
      if (error) throw error;
      waAdminFetch('/admin/reload-config', { method: 'POST' }).catch(() => {});
    },
    onSuccess: () => { toast.success('Pengaturan disimpan'); qc.invalidateQueries({ queryKey: ['wa-bot-settings'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendWeekly = useMutation({
    mutationFn: () => waAdminFetch<{ message: string }>('/admin/send-weekly-absence', { method: 'POST' }),
    onSuccess: (r) => toast.success(r?.message || 'Rekap mingguan dikirim'),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pengingat Mengajar Guru</CardTitle>
        <CardDescription>Pengingat WA otomatis untuk guru yang punya jadwal mengajar (nomor diambil dari profil guru).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="rem-en">Aktifkan pengingat sebelum mengajar</Label>
            <p className="text-xs text-muted-foreground">Pengingat menjelang jam mengajar beserta pesan tindak lanjut jurnal/absensi. Tidak memengaruhi rekap jadwal harian di bawah.</p>
          </div>
          <Switch id="rem-en" checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="space-y-1">
          <Label>Kirim pengingat berapa menit sebelum jam mengajar</Label>
          <Input type="number" min={1} max={120} value={lead} onChange={(e) => setLead(parseInt(e.target.value, 10))} />
        </div>
        <div className="space-y-1">
          <Label>Cek absensi/jurnal berapa menit setelah jam mulai</Label>
          <Input type="number" min={1} max={120} value={follow} onChange={(e) => setFollow(parseInt(e.target.value, 10))} />
          <p className="text-xs text-muted-foreground">Jika belum terisi, guru menerima pesan tindak lanjut.</p>
        </div>
        <div className="space-y-1">
          <Label>Pengingat sebelum mengajar untuk</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as 'first' | 'all')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua jam mengajar</SelectItem>
              <SelectItem value="first">Jam pertama saja (jam mengajar paling awal hari itu)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <Label>Pesan tindak lanjut memeriksa</Label>
          <div className="flex items-center justify-between">
            <Label htmlFor="chk-j" className="font-normal">Jurnal mengajar</Label>
            <Switch id="chk-j" checked={chkJournal} onCheckedChange={setChkJournal} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="chk-a" className="font-normal">Daftar hadir (absensi) siswa</Label>
            <Switch id="chk-a" checked={chkAttendance} onCheckedChange={setChkAttendance} />
          </div>
          {chkAttendance && (
            <div className="flex items-start justify-between gap-3 pl-3 border-l-2">
              <div>
                <Label htmlFor="chk-next" className="font-normal">Ingatkan juga guru jam berikutnya</Label>
                <p className="text-xs text-muted-foreground">
                  Mati: guru jam ke-2 dst tidak diingatkan mengisi absensi bila kelas itu sudah diabsen guru sebelumnya hari ini (jurnal tetap diingatkan).
                </p>
              </div>
              <Switch id="chk-next" checked={remindNext} onCheckedChange={setRemindNext} />
            </div>
          )}
          {!chkJournal && !chkAttendance && (
            <p className="text-xs text-muted-foreground">Keduanya mati: pesan tindak lanjut tidak akan dikirim.</p>
          )}
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="recap-en">Kirim rekap jadwal harian</Label>
            <Switch id="recap-en" checked={recap} onCheckedChange={setRecap} />
          </div>
          <p className="text-xs text-muted-foreground">Berisi daftar jadwal mengajar guru pada hari itu. Guru yang tidak mengajar hari itu tidak dikirimi. Saklar ini berdiri sendiri, tetap berjalan walau pengingat sebelum mengajar dimatikan.</p>
          {recap && (
            <div className="space-y-1">
              <Label>Jam kirim (WIB)</Label>
              <Input type="time" value={recapTime} onChange={(e) => setRecapTime(e.target.value)} className="w-32" />
            </div>
          )}
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="sat-en">Ucapan akhir pekan hari Sabtu</Label>
            <Switch id="sat-en" checked={satGreet} onCheckedChange={setSatGreet} />
          </div>
          <p className="text-xs text-muted-foreground">Ucapan terima kasih dan pesan menikmati akhir pekan bersama keluarga untuk guru yang tidak mengajar hari Sabtu. Isi pesan bisa diubah di tab Template Pesan.</p>
          {satGreet && (
            <div className="space-y-1">
              <Label>Jam kirim (WIB)</Label>
              <Input type="time" value={satTime} onChange={(e) => setSatTime(e.target.value)} className="w-32" />
            </div>
          )}
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="hr-en">Ingatkan wali kelas bila absensi belum diisi</Label>
            <Switch id="hr-en" checked={hrOn} onCheckedChange={setHrOn} />
          </div>
          <p className="text-xs text-muted-foreground">
            Pada jam pengecekan, bila absensi jam pertama suatu kelas belum terisi, wali kelasnya menerima WA yang menyebut nama guru pengajar jam pertama. Sekali per kelas per hari. Isi pesan bisa diubah di tab Template Pesan.
          </p>
          {hrOn && (
            <div className="space-y-1">
              <Label>Jam pengecekan (WIB)</Label>
              <Input value={hrTimes} onChange={(e) => setHrTimes(e.target.value)} placeholder="08:30, 10:00" className="w-48" />
              <p className="text-xs text-muted-foreground">Boleh lebih dari satu, pisahkan dengan koma (format 24 jam).</p>
            </div>
          )}
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="wk-en">Rekap mingguan siswa tidak hadir</Label>
            <Switch id="wk-en" checked={wkOn} onCheckedChange={setWkOn} />
          </div>
          <p className="text-xs text-muted-foreground">
            Wali kelas menerima daftar siswa kelasnya yang sakit/izin/alfa selama sepekan (berdasarkan absensi jam pertama), dengan penanda siswa yang sering tidak hadir. Kelas tanpa siswa tidak hadir tidak dikirimi.
          </p>
          {wkOn && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label>Hari kirim</Label>
                  <Select value={wkDay} onValueChange={setWkDay}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map((n, i) => (
                        <SelectItem key={n} value={String(i + 1)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Jam kirim (WIB)</Label>
                  <Input type="time" value={wkTime} onChange={(e) => setWkTime(e.target.value)} className="w-32" />
                </div>
                <div className="space-y-1">
                  <Label>Sering = tidak hadir ≥ (hari)</Label>
                  <Input type="number" min={1} max={10} value={wkThreshold} onChange={(e) => setWkThreshold(parseInt(e.target.value, 10))} className="w-24" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Siswa juga ditandai "sering" bila alfa 2 hari atau lebih. Dikirim Senin, rekap pekan sebelumnya.</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="wk-grp" className="font-normal">Kirim juga ringkasan siswa yang sering tidak hadir ke grup rekap</Label>
                <Switch id="wk-grp" checked={wkGroup} onCheckedChange={setWkGroup} />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => sendWeekly.mutate()} disabled={sendWeekly.isPending}>
                {sendWeekly.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Kirim rekap pekan ini sekarang
              </Button>
              <p className="text-xs text-muted-foreground">Simpan pengaturan lebih dulu agar tombol ini memakai pengaturan terbaru.</p>
            </div>
          )}
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="pk-en">Notifikasi absensi petugas piket</Label>
            <Switch id="pk-en" checked={piketWa} onCheckedChange={setPiketWa} />
          </div>
          <p className="text-xs text-muted-foreground">
            Petugas piket (malam / Sabtu-Minggu) menerima WA saat absen masuk atau pulangnya tercatat di mesin fingerprint. Nomor diambil dari profil guru atau data staf.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Simpan
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Rekap Grup ------------------------------ */
interface WaGroup { id: string; name: string; size: number }

function GroupRecapTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [jid, setJid] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groups, setGroups] = useState<WaGroup[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['wa-bot-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wa_bot_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      setEnabled(!!data.class_recap_enabled);
      setJid(data.class_recap_group_jid || '');
      setGroupName(data.class_recap_group_name || '');
    }
  }, [data]);

  const loadGroups = useMutation({
    mutationFn: () => waAdminFetch<{ groups: WaGroup[] }>('/admin/groups'),
    onSuccess: (r) => { setGroups(r.groups); toast.success(`${r.groups.length} grup ditemukan`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (enabled && !jid) throw new Error('Pilih grup tujuan terlebih dahulu.');
      const { error } = await supabase.from('wa_bot_settings').upsert({
        id: 1,
        class_recap_enabled: enabled,
        class_recap_group_jid: jid || null,
        class_recap_group_name: groupName || null,
        updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      });
      if (error) throw error;
      waAdminFetch('/admin/reload-config', { method: 'POST' }).catch(() => {});
    },
    onSuccess: () => { toast.success('Pengaturan disimpan'); qc.invalidateQueries({ queryKey: ['wa-bot-settings'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendNow = useMutation({
    mutationFn: () => waAdminFetch<{ message: string }>('/admin/send-class-recap', { method: 'POST' }),
    onSuccess: (r) => toast.success(r.message),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rekap Absensi Per Kelas ke Grup</CardTitle>
        <CardDescription>
          Rekap dikirim ke grup WhatsApp otomatis setelah absen jam pertama <b>semua kelas</b> yang punya jadwal aktif hari itu terisi.
          Aplikasi yang memberi tahu bot saat absen sudah lengkap, bot tidak mengecek terus-menerus. Jika belum lengkap, rekap tidak dikirim.
          Dikirim satu kali per hari.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="flex items-center justify-between">
          <Label htmlFor="grp-en">Aktifkan rekap ke grup</Label>
          <Switch id="grp-en" checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="space-y-2">
          <Label>Grup tujuan</Label>
          {jid ? (
            <div className="rounded-md border p-2 text-sm">
              <div className="font-medium">{groupName || 'Grup terpilih'}</div>
              <div className="text-xs text-muted-foreground break-all">{jid}</div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Belum ada grup dipilih.</p>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => loadGroups.mutate()} disabled={loadGroups.isPending}>
            {loadGroups.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Ambil daftar grup dari bot
          </Button>
          {groups.length > 0 && (
            <Select
              value={jid}
              onValueChange={(v) => { setJid(v); setGroupName(groups.find((g) => g.id === v)?.name || ''); }}
            >
              <SelectTrigger><SelectValue placeholder="Pilih grup" /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name} ({g.size})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">Nomor bot harus sudah menjadi anggota grup tujuan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Simpan
          </Button>
          <Button variant="outline" onClick={() => sendNow.mutate()} disabled={sendNow.isPending || !jid}>
            {sendNow.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Kirim rekap uji coba
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          &quot;Kirim rekap uji coba&quot; bisa dipakai kapan saja, tanpa perlu jadwal aktif. Isinya diambil dari data absensi terakhir yang tercatat (simpan pengaturan dulu bila baru memilih grup).
          Isi pesan dapat diubah di tab Template Pesan.
        </p>
      </CardContent>
    </Card>
  );
}

/* --------------------- Grup Kelas (rekap per kelas) --------------------- */
interface ClassRow { id: string; name: string }
interface ClassGroupRow { class_id: string; group_jid: string; group_name: string | null; enabled: boolean }

/** "VIII A" / "8A" / "Kelas 8-A" -> "8A" (kunci pencocokan nama kelas dengan nama grup) */
function classKey(raw: string): string {
  const m = String(raw).toUpperCase().match(/\b(VIII|VII|IX|7|8|9)\s*[-_./]?\s*([A-Z0-9]{1,2})\b/);
  if (!m) return '';
  const grade = ({ VII: '7', VIII: '8', IX: '9' } as Record<string, string>)[m[1]] ?? m[1];
  return grade + m[2];
}

function ClassGroupsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [map, setMap] = useState<Record<string, { jid: string; name: string }>>({});

  const settings = useQuery({
    queryKey: ['wa-bot-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wa_bot_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const classes = useQuery({
    queryKey: ['wa-class-list'],
    queryFn: async (): Promise<ClassRow[]> => {
      const { data: st } = await supabase.from('school_settings').select('academic_year').limit(1).maybeSingle();
      let q = supabase.from('classes').select('id, name').order('name');
      if (st?.academic_year) q = q.eq('academic_year', st.academic_year);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const saved = useQuery({
    queryKey: ['wa-class-groups'],
    queryFn: async (): Promise<ClassGroupRow[]> => {
      const { data, error } = await (supabase as any).from('wa_class_groups').select('class_id, group_jid, group_name, enabled');
      if (error) throw error;
      return (data ?? []) as ClassGroupRow[];
    },
  });

  useEffect(() => { if (settings.data) setEnabled(!!settings.data.class_group_recap_enabled); }, [settings.data]);
  useEffect(() => {
    if (!saved.data) return;
    const m: Record<string, { jid: string; name: string }> = {};
    saved.data.forEach((r) => { m[r.class_id] = { jid: r.group_jid, name: r.group_name || '' }; });
    setMap(m);
  }, [saved.data]);

  const loadGroups = useMutation({
    mutationFn: () => waAdminFetch<{ groups: WaGroup[] }>('/admin/groups'),
    onSuccess: (r) => { setGroups(r.groups); toast.success(`${r.groups.length} grup ditemukan`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoMatch = () => {
    const byKey = new Map<string, WaGroup[]>();
    groups.forEach((g) => { const k = classKey(g.name); if (k) byKey.set(k, [...(byKey.get(k) ?? []), g]); });
    const next = { ...map };
    let hit = 0;
    (classes.data ?? []).forEach((c) => {
      const cands = byKey.get(classKey(c.name)) ?? [];
      if (cands.length === 1) { next[c.id] = { jid: cands[0].id, name: cands[0].name }; hit++; }
    });
    setMap(next);
    toast.success(`${hit} dari ${(classes.data ?? []).length} kelas dicocokkan. Periksa lalu klik Simpan.`);
  };

  const save = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(map).filter(([, v]) => v.jid)
        .map(([class_id, v]) => ({ class_id, group_jid: v.jid, group_name: v.name || null, enabled: true, updated_at: new Date().toISOString(), updated_by: user?.id ?? null }));
      const keep = new Set(rows.map((r) => r.class_id));
      const remove = (saved.data ?? []).map((r) => r.class_id).filter((id) => !keep.has(id));
      if (rows.length) { const { error } = await (supabase as any).from('wa_class_groups').upsert(rows); if (error) throw error; }
      if (remove.length) { const { error } = await (supabase as any).from('wa_class_groups').delete().in('class_id', remove); if (error) throw error; }
      const { error: e2 } = await supabase.from('wa_bot_settings').upsert({
        id: 1, class_group_recap_enabled: enabled, updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      } as any);
      if (e2) throw e2;
      waAdminFetch('/admin/reload-config', { method: 'POST' }).catch(() => {});
    },
    onSuccess: () => {
      toast.success('Pengaturan grup kelas disimpan');
      qc.invalidateQueries({ queryKey: ['wa-class-groups'] });
      qc.invalidateQueries({ queryKey: ['wa-bot-settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendNow = useMutation({
    mutationFn: (force: boolean) => waAdminFetch<{ queued: string[]; already_sent: string[]; not_filled: string[]; no_group: string[] }>(
      '/admin/send-class-group-recaps', { method: 'POST', body: { force } }),
    onSuccess: (r) => toast.success(
      `Masuk antrian: ${r.queued.length} kelas. Sudah terkirim: ${r.already_sent.length}. Absen belum terisi: ${r.not_filled.length}.`),
    onError: (e: Error) => toast.error(e.message),
  });

  if (settings.isLoading || classes.isLoading || saved.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  const list = classes.data ?? [];
  const mapped = list.filter((c) => map[c.id]?.jid).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rekap Absensi ke Grup Kelas</CardTitle>
        <CardDescription>
          Setiap kelas dihubungkan ke grup WhatsApp-nya sendiri. Begitu absen sebuah kelas tersimpan, bot mengirim ke grup kelas itu:
          jumlah hadir/sakit/izin/alfa dan nama siswa yang tidak masuk. Tiap kelas dikirim satu kali per hari, tanpa menunggu kelas lain.
          Nomor bot harus sudah menjadi anggota semua grup tujuan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between max-w-md">
          <Label htmlFor="cg-en">Aktifkan rekap ke grup kelas</Label>
          <Switch id="cg-en" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => loadGroups.mutate()} disabled={loadGroups.isPending}>
            {loadGroups.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Ambil daftar grup dari bot
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={autoMatch} disabled={groups.length === 0}>
            <Wand2 className="h-4 w-4 mr-1" /> Cocokkan otomatis dari nama grup
          </Button>
          <Badge variant="secondary">{mapped}/{list.length} kelas sudah punya grup</Badge>
        </div>

        <div className="rounded-md border divide-y">
          {list.map((c) => {
            const cur = map[c.id];
            const options = groups.some((g) => g.id === cur?.jid) || !cur?.jid
              ? groups : [{ id: cur.jid, name: cur.name || cur.jid, size: 0 }, ...groups];
            return (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2">
                <div className="sm:w-32 font-medium">{c.name}</div>
                <Select
                  value={cur?.jid || '__none__'}
                  onValueChange={(v) => setMap((m) => {
                    const n = { ...m };
                    if (v === '__none__') delete n[c.id];
                    else n[c.id] = { jid: v, name: options.find((g) => g.id === v)?.name || '' };
                    return n;
                  })}
                >
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Pilih grup" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Tanpa grup —</SelectItem>
                    {options.map((g) => (<SelectItem key={g.id} value={g.id}>{g.name}{g.size ? ` (${g.size})` : ''}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
          {list.length === 0 && <p className="p-3 text-sm text-muted-foreground">Belum ada data kelas.</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Simpan
          </Button>
          <Button variant="outline" onClick={() => sendNow.mutate(false)} disabled={sendNow.isPending || !enabled}>
            {sendNow.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Kirim rekap hari ini sekarang
          </Button>
          <Button variant="ghost" onClick={() => sendNow.mutate(true)} disabled={sendNow.isPending || !enabled}>Kirim ulang semua</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          &quot;Kirim rekap hari ini sekarang&quot; hanya mengirim kelas yang absennya sudah terisi dan belum pernah terkirim hari ini.
          Simpan pengaturan dulu sebelum menekan tombol kirim. Isi pesan bisa diubah di tab Template Pesan.
        </p>
      </CardContent>
    </Card>
  );
}

export default function WhatsAppBotSettings() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Bot</h1>
          <p className="text-sm text-muted-foreground">Atur penautan WhatsApp (Baileys), template pesan, dan pengingat guru.</p>
        </div>
        <Tabs defaultValue="connection">
          <TabsList>
            <TabsTrigger value="connection">Koneksi</TabsTrigger>
            <TabsTrigger value="templates">Template Pesan</TabsTrigger>
            <TabsTrigger value="reminder">Pengingat Guru</TabsTrigger>
            <TabsTrigger value="group-recap">Rekap Grup</TabsTrigger>
            <TabsTrigger value="class-groups">Grup Kelas</TabsTrigger>
          </TabsList>
          <TabsContent value="connection"><ConnectionTab /></TabsContent>
          <TabsContent value="templates"><TemplatesTab /></TabsContent>
          <TabsContent value="reminder"><ReminderTab /></TabsContent>
          <TabsContent value="group-recap"><GroupRecapTab /></TabsContent>
          <TabsContent value="class-groups"><ClassGroupsTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
