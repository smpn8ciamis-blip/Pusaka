import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Link2, Unlink, RefreshCw, Send, RotateCcw, Save, Copy } from 'lucide-react';
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
  const [recap, setRecap] = useState(false);
  const [recapTime, setRecapTime] = useState('06:00');

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
      setRecap(data.daily_recap_enabled);
      setRecapTime(String(data.daily_recap_time || '06:00').slice(0, 5));
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
        daily_recap_enabled: recap,
        daily_recap_time: /^\d{2}:\d{2}$/.test(recapTime) ? recapTime : '06:00',
        updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      });
      if (error) throw error;
      waAdminFetch('/admin/reload-config', { method: 'POST' }).catch(() => {});
    },
    onSuccess: () => { toast.success('Pengaturan disimpan'); qc.invalidateQueries({ queryKey: ['wa-bot-settings'] }); },
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
          <Label htmlFor="rem-en">Aktifkan pengingat guru</Label>
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
          <Label>Pengingat untuk jam mengajar</Label>
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
          {!chkJournal && !chkAttendance && (
            <p className="text-xs text-muted-foreground">Keduanya mati: pesan tindak lanjut tidak akan dikirim.</p>
          )}
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="recap-en">Kirim rekap jadwal harian</Label>
            <Switch id="recap-en" checked={recap} onCheckedChange={setRecap} />
          </div>
          <p className="text-xs text-muted-foreground">Berisi daftar jadwal mengajar guru pada hari itu. Guru yang tidak mengajar hari itu tidak dikirimi.</p>
          {recap && (
            <div className="space-y-1">
              <Label>Jam kirim (WIB)</Label>
              <Input type="time" value={recapTime} onChange={(e) => setRecapTime(e.target.value)} className="w-32" />
            </div>
          )}
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Simpan
        </Button>
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
          </TabsList>
          <TabsContent value="connection"><ConnectionTab /></TabsContent>
          <TabsContent value="templates"><TemplatesTab /></TabsContent>
          <TabsContent value="reminder"><ReminderTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
