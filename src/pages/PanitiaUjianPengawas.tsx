import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, Eraser, Plus, Printer, Save, Trash2, Wand2, X } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { scheduleOf, useExamSettings } from '@/hooks/useExamSettings';
import { buildRooms, DEFAULT_START_NUMBERS } from '@/lib/examSeating';
import {
  buildInvSessions, cellKey, findProblems, fromRows, generateInvigilation, isOwnSubject, numberedTeachers, parseCellKey,
  sessionsOverlap, teacherLoads, toRows,
  type Assignment, type InvConfig, type InvMethod, type InvSession, type InvTeacher,
} from '@/lib/examInvigilation';
import { buildInvigilationPdf, DEFAULT_INVIGILATION_NOTES, invigilationFileName } from '@/lib/examInvigilationPdf';
import { PAPER_LABEL, type PdfPaper } from '@/lib/pdfPaper';

const MIGRATION = '20261123100000_exam_pengawas.sql dan 20261123140000_exam_pengawas_urutan.sql';
const db = supabase as any;

const isMissingTable = (e: any) => {
  const m = String(e?.message || '') + String(e?.code || '');
  return /PGRST20[25]|42P01|42883|does not exist|schema cache|Could not find/i.test(m);
};

/** Jumlah ruang menurut denah Administrasi Ujian (aturan sama: siswa aktif, bukan mutasi, tingkat terpilih). */
function useSuggestedRooms(settings: any) {
  return useQuery({
    queryKey: ['pengawas-saran-ruang', settings?.id ?? null, JSON.stringify(settings?.exam_card_settings ?? {})],
    enabled: !!settings,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<number> => {
      const { data, error } = await db
        .from('students')
        .select('id, full_name, classes ( name, grade )')
        .eq('status', 'aktif').eq('is_alumni', false).order('full_name');
      if (error) throw error;
      const mutated = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data: mut, error: mErr } = await db.from('student_mutations').select('student_id').order('id').range(from, from + 999);
        if (mErr) throw mErr;
        (mut || []).forEach((m: any) => mutated.add(m.student_id));
        if (!mut || mut.length < 1000) break;
      }
      const students = (data || []).filter((s: any) => s.classes && !mutated.has(s.id));
      const c = settings?.exam_card_settings && typeof settings.exam_card_settings === 'object' ? settings.exam_card_settings : {};
      const grades = Array.isArray(c.selectedGrades) && c.selectedGrades.length ? c.selectedGrades.map(String) : ['7', '8', '9'];
      const startNumbers = { ...DEFAULT_START_NUMBERS, ...(c.startNumbers || {}) };
      const rows = Number(c.rowsCount) >= 1 ? Math.floor(Number(c.rowsCount)) : 8;
      const cols = Number(c.columnsCount) >= 1 ? Math.floor(Number(c.columnsCount)) : 4;
      const mode = ['auto', 'alternating', 'by_class'].includes(c.seatingMode) ? c.seatingMode : 'auto';
      return buildRooms(students, { grades, rows, cols, mode, startNumbers }).rooms.length;
    },
  });
}

const DEFAULT_CFG: InvConfig = { rooms: 1, perRoom: 1, pool: [], method: 'putar', avoidOwnSubject: true };

export default function PanitiaUjianPengawas() {
  const qc = useQueryClient();
  const { data: settings, isLoading: settingsLoading, error: settingsError } = useExamSettings();
  const suggested = useSuggestedRooms(settings);

  const { sessions, skipped } = useMemo(() => buildInvSessions(scheduleOf(settings)), [settings]);

  const teachersQ = useQuery({
    queryKey: ['pengawas-guru'],
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<InvTeacher[]> => {
      const { data, error } = await db.rpc('exam_teacher_list');
      if (error) throw error;
      return (data || []).map((r: any) => ({ id: r.teacher_id, name: String(r.full_name || '').trim(), nip: r.nip, subject: String(r.subject || ''), jabatan: r.jabatan }));
    },
  });
  const teachers = teachersQ.data ?? [];
  const teacherById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);

  const savedQ = useQuery({
    queryKey: ['pengawas-tersimpan'],
    retry: false,
    queryFn: async () => {
      const { data: c, error: e1 } = await db.from('exam_invigilation_config').select('*').maybeSingle();
      if (e1) throw e1;
      const rows: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from('exam_invigilators').select('exam_date, start_time, room_no, slot, teacher_id').order('exam_date').order('start_time').range(from, from + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return { config: c, rows };
    },
  });

  // ---------- keadaan lokal (draf) ----------
  const [cfg, setCfg] = useState<InvConfig>(DEFAULT_CFG);
  const [assign, setAssign] = useState<Assignment>({});
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const draftKey = JSON.stringify([cfg, assign]);
  const dirty = snapshot !== null && snapshot !== draftKey;

  useEffect(() => {
    if (!savedQ.data || dirty) return;
    const c = savedQ.data.config;
    const next: InvConfig = c
      ? { rooms: Number(c.rooms_count) || 1, perRoom: Number(c.per_room) || 1, pool: c.pool_teacher_ids || [], method: (c.method === 'seimbang' ? 'seimbang' : 'putar') as InvMethod, avoidOwnSubject: c.avoid_own_subject !== false }
      : { ...DEFAULT_CFG, rooms: suggested.data || 1 };
    const a = fromRows(savedQ.data.rows);
    setCfg(next); setAssign(a);
    setSnapshot(JSON.stringify([next, a]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedQ.data]);

  // pengguna baru (belum ada pengaturan tersimpan): isi jumlah ruang dari denah begitu tersedia
  useEffect(() => {
    if (savedQ.data && !savedQ.data.config && suggested.data && !dirty) {
      const next = { ...DEFAULT_CFG, rooms: suggested.data };
      setCfg((cur) => (cur.rooms === 1 && cur.pool.length === 0 ? next : cur));
      setSnapshot((s) => (s === null ? s : JSON.stringify([{ ...DEFAULT_CFG, rooms: suggested.data }, fromRows(savedQ.data!.rows)])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested.data, savedQ.data]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const sessionKeys = useMemo(() => new Set(sessions.map((s) => s.key)), [sessions]);
  const validCell = (k: string) => {
    const p = parseCellKey(k);
    return sessionKeys.has(p.sessionKey) && p.room >= 1 && p.room <= cfg.rooms && p.slot >= 1 && p.slot <= cfg.perRoom;
  };
  const orphanCount = useMemo(() => Object.keys(assign).filter((k) => !validCell(k)).length, [assign, sessionKeys, cfg.rooms, cfg.perRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems = useMemo(() => findProblems(sessions, teachers, cfg, assign), [sessions, teachers, cfg, assign]);
  const problemCells = useMemo(() => new Set(problems.filter((p) => p.cell && p.kind !== 'kosong').map((p) => p.cell as string)), [problems]);
  const numbered = useMemo(() => numberedTeachers(teachers, cfg.pool, assign), [teachers, cfg.pool, assign]);
  const numOf = useMemo(() => new Map(numbered.map((t, i) => [t.id, i + 1])), [numbered]);
  const loads = useMemo(() => {
    const m = new Map(teacherLoads(sessions, teachers, assign).map((l) => [l.id, l]));
    return numbered.map((t) => m.get(t.id)!).filter(Boolean);
  }, [sessions, teachers, assign, numbered]);
  const days = useMemo(() => {
    const g: { date: string; sessions: InvSession[] }[] = [];
    sessions.forEach((s) => { const last = g[g.length - 1]; if (last && last.date === s.date) last.sessions.push(s); else g.push({ date: s.date, sessions: [s] }); });
    return g;
  }, [sessions]);
  const totalCells = sessions.length * cfg.rooms * cfg.perRoom;
  const filledCells = useMemo(() => Object.keys(assign).filter(validCell).length, [assign, sessionKeys, cfg.rooms, cfg.perRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- simpan ----------
  const saveMut = useMutation({
    mutationFn: async () => {
      const kept: Assignment = {};
      Object.entries(assign).forEach(([k, v]) => { if (validCell(k)) kept[k] = v; });
      const { error } = await db.rpc('exam_invigilation_save', {
        p_config: { rooms_count: cfg.rooms, per_room: cfg.perRoom, pool_teacher_ids: cfg.pool, method: cfg.method, avoid_own_subject: cfg.avoidOwnSubject },
        p_rows: toRows(kept, sessions),
      });
      if (error) throw error;
      return kept;
    },
    onSuccess: (kept) => {
      setAssign(kept);
      setSnapshot(JSON.stringify([cfg, kept]));
      qc.invalidateQueries({ queryKey: ['pengawas-tersimpan'] });
      toast.success('Jadwal pengawas disimpan');
    },
    onError: (e: any) => toast.error(e?.message ? `Gagal menyimpan: ${e.message}` : 'Gagal menyimpan jadwal pengawas'),
  });

  // ---------- generate ----------
  const [genOpen, setGenOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const runGenerate = (mode: 'all' | 'empty') => {
    setGenOpen(false);
    if (teachers.length === 0) { toast.error('Belum ada data guru'); return; }
    if (cfg.pool.length === 0) { toast.error('Pilih dulu guru pengawas dari daftar guru.'); return; }
    const r = generateInvigilation(sessions, teachers, cfg, assign, mode);
    setAssign(r.assignment);
    const notes: string[] = [];
    if (r.unfilled) notes.push(`${r.unfilled} tempat belum terisi (guru terpilih kurang dari jumlah tempat)`);
    if (r.relaxedOwnSubject) notes.push(`${r.relaxedOwnSubject} penugasan jatuh pada mapel yang diajar guru itu sendiri`);
    if (notes.length) toast.warning(`Jadwal disusun. ${notes.join('; ')}. Periksa tab Peringatan, lalu simpan.`, { duration: 8000 });
    else toast.success('Jadwal disusun. Periksa matriks, ubah manual bila perlu, lalu klik Simpan.');
  };
  const onGenerateClick = () => {
    if (sessions.length === 0) { toast.error('Isi jadwal ujian dulu (tanggal dan jam mulai).'); return; }
    if (cfg.pool.length === 0) { toast.error('Pilih dulu guru pengawas dari daftar guru.'); return; }
    if (Object.keys(assign).filter(validCell).length > 0) setGenOpen(true); else runGenerate('all');
  };

  // ---------- pilih guru per sel ----------
  const [pick, setPick] = useState<{ key: string } | null>(null);
  const [q, setQ] = useState('');
  const byTeacher = useMemo(() => {
    const m = new Map<string, { key: string; session: InvSession; room: number }[]>();
    const sBy = new Map(sessions.map((s) => [s.key, s]));
    for (const [k, tid] of Object.entries(assign)) {
      const p = parseCellKey(k); const s = sBy.get(p.sessionKey);
      if (!s) continue;
      const l = m.get(tid) || []; l.push({ key: k, session: s, room: p.room }); m.set(tid, l);
    }
    return m;
  }, [assign, sessions]);
  const setCell = (k: string, tid: string | null) => setAssign((cur) => {
    const n = { ...cur };
    if (tid) n[k] = tid; else delete n[k];
    return n;
  });

  const pickInfo = useMemo(() => {
    if (!pick) return null;
    const p = parseCellKey(pick.key);
    const s = sessions.find((x) => x.key === p.sessionKey);
    return s ? { ...p, session: s } : null;
  }, [pick, sessions]);

  const candidates = useMemo(() => {
    if (!pickInfo) return [];
    const needle = q.trim().toLowerCase();
    return teachers
      .filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.subject.toLowerCase().includes(needle))
      .map((t) => {
        const others = (byTeacher.get(t.id) || []).filter((x) => x.key !== pick!.key);
        const clash = others.find((x) => sessionsOverlap(x.session, pickInfo.session) || x.session.key === pickInfo.session.key);
        const reasons: string[] = [];
        if (cfg.pool.length > 0 && !cfg.pool.includes(t.id)) reasons.push('di luar daftar pengawas');
        if (isOwnSubject(t.subject, pickInfo.session.subject)) reasons.push('mapel sendiri');
        return { t, total: (byTeacher.get(t.id) || []).length - (assign[pick!.key] === t.id ? 1 : 0), clash, reasons };
      })
      .sort((a, b) => Number(!!a.clash) - Number(!!b.clash) || a.reasons.length - b.reasons.length || a.total - b.total || a.t.name.localeCompare(b.t.name, 'id'));
  }, [pickInfo, teachers, q, byTeacher, cfg.pool, assign, pick]);

  // ---------- cetak ----------
  const [printOpen, setPrintOpen] = useState(false);
  const [paper, setPaper] = useState<PdfPaper>('f4');
  const [notesText, setNotesText] = useState(DEFAULT_INVIGILATION_NOTES.join('\n'));
  const [signDate, setSignDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pengawas_notes');
      if (saved !== null) setNotesText(saved);
    } catch { /* penyimpanan peramban tidak tersedia */ }
  }, []);
  const doPrint = async () => {
    setPrinting(true);
    try {
      try { localStorage.setItem('pengawas_notes', notesText); } catch { /* abaikan */ }
      const kept: Assignment = {};
      Object.entries(assign).forEach(([k, v]) => { if (validCell(k)) kept[k] = v; });
      const doc = await buildInvigilationPdf({
        examName: settings?.exam_name as string | undefined,
        academicYear: settings?.academic_year as string | undefined,
        sessions, teachers, assignment: kept, pool: cfg.pool, rooms: cfg.rooms, perRoom: cfg.perRoom, paper,
        place: (settings as any)?.city_name || 'Ciamis', signDate,
        principalTitle: (settings as any)?.headmaster_position,
        principalName: (settings as any)?.headmaster_name, principalNip: (settings as any)?.headmaster_nip,
        notes: notesText.split('\n'),
      }, settings as any);
      doc.save(invigilationFileName(paper));
      setPrintOpen(false);
      if (dirty) toast.warning('PDF dibuat dari draf di layar. Klik Simpan agar jadwal ini tersimpan.');
    } catch (e: any) {
      console.error(e);
      toast.error(`Gagal membuat PDF: ${e?.message || e}`);
    } finally { setPrinting(false); }
  };

  const togglePool = (id: string, on: boolean) => setCfg((c) => ({ ...c, pool: on ? [...new Set([...c.pool, id])] : c.pool.filter((x) => x !== id) }));
  const movePool = (i: number, d: -1 | 1) => setCfg((c) => {
    const j = i + d; if (j < 0 || j >= c.pool.length) return c;
    const pool = [...c.pool]; [pool[i], pool[j]] = [pool[j], pool[i]];
    return { ...c, pool };
  });
  const [exQ, setExQ] = useState('');
  const slotsNeeded = cfg.rooms * cfg.perRoom;
  const missing = isMissingTable(savedQ.error) || isMissingTable(teachersQ.error);
  const loadError = (savedQ.error || teachersQ.error) as any;
  const sName = (s: InvSession) => `${[s.day, s.dateLabel || s.date].filter(Boolean).join(', ')} • ${s.start}${s.end ? `–${s.end}` : ''}`;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Jadwal Pengawas Ujian</h1>
            <p className="text-muted-foreground">Susun pengawas tiap ruang untuk setiap sesi ujian, otomatis atau manual.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPrintOpen(true)} disabled={sessions.length === 0 || teachers.length === 0}>
              <Printer className="mr-2 h-4 w-4" /> Cetak PDF
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending || missing}>
              <Save className="mr-2 h-4 w-4" /> {saveMut.isPending ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </div>

        {dirty && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Ada perubahan yang belum disimpan. Klik <b>Simpan</b> agar jadwal pengawas tersimpan.
          </p>
        )}
        {missing && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Basis data belum siap</AlertTitle>
            <AlertDescription>Minta admin menjalankan migrasi <code>{MIGRATION}</code> di SQL Editor, lalu muat ulang halaman ini.</AlertDescription>
          </Alert>
        )}
        {!missing && loadError && (
          <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Gagal memuat</AlertTitle><AlertDescription>{loadError?.message || 'Terjadi kesalahan.'}</AlertDescription></Alert>
        )}
        {settingsError && (
          <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Pengaturan ujian gagal dimuat</AlertTitle><AlertDescription>{(settingsError as any)?.message}</AlertDescription></Alert>
        )}
        {!settingsLoading && sessions.length === 0 && (
          <Alert>
            <CalendarClock className="h-4 w-4" />
            <AlertTitle>Jadwal ujian belum diisi</AlertTitle>
            <AlertDescription>
              Matriks pengawas mengikuti jadwal ujian. Isi tanggal dan jam di{' '}
              <Link className="font-medium underline" to="/panitia-ujian/jadwal">Nama &amp; Jadwal Ujian</Link>, lalu kembali ke sini.
            </AlertDescription>
          </Alert>
        )}
        {skipped > 0 && sessions.length > 0 && (
          <p className="text-sm text-amber-700">{skipped} sesi di jadwal ujian dilewati karena tanggal atau jam mulainya belum diisi.</p>
        )}
        {orphanCount > 0 && (
          <p className="text-sm text-amber-700">
            {orphanCount} penugasan tersimpan sudah tidak cocok dengan jadwal/ruang saat ini (sesi dihapus atau jumlah ruang dikurangi). Penugasan itu akan dibuang saat Anda klik Simpan.
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>1. Pilih guru pengawas</CardTitle>
            <CardDescription>
              Centang guru dari database yang akan mengawas. Urutannya menjadi <b>nomor guru</b> di matriks: pada pola putar,
              guru nomor 1 mengawas ruang 1 di sesi pertama, ruang 2 di sesi kedua, dan seterusnya.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Daftar guru ({teachers.length})</Label>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => setCfg((c) => ({ ...c, pool: [...c.pool, ...teachers.filter((t) => !c.pool.includes(t.id)).map((t) => t.id)] }))}>Pilih semua</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setCfg((c) => ({ ...c, pool: [] }))} disabled={cfg.pool.length === 0}>Kosongkan</Button>
                  </div>
                </div>
                <Input placeholder="Cari nama guru…" value={exQ} onChange={(e) => setExQ(e.target.value)} />
                <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border p-1">
                  {teachers.filter((t) => !exQ.trim() || t.name.toLowerCase().includes(exQ.trim().toLowerCase())).map((t) => (
                    <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                      <Checkbox checked={cfg.pool.includes(t.id)} onCheckedChange={(v) => togglePool(t.id, v === true)} />
                      <span className="truncate">{t.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t.subject}</span>
                    </label>
                  ))}
                  {teachers.length === 0 && <p className="p-3 text-sm text-muted-foreground">{teachersQ.isLoading ? 'Memuat guru…' : 'Belum ada data guru.'}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Guru terpilih &amp; urutan ({cfg.pool.length})</Label>
                  <Button type="button" size="sm" variant="outline" disabled={cfg.pool.length < 2}
                    onClick={() => setCfg((c) => ({ ...c, pool: [...c.pool].sort((x, y) => (teacherById.get(x)?.name || '').localeCompare(teacherById.get(y)?.name || '', 'id')) }))}>
                    Urutkan A–Z
                  </Button>
                </div>
                <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border p-1">
                  {cfg.pool.map((id, i) => (
                    <div key={id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                      <Badge variant="secondary" className="w-8 shrink-0 justify-center">{i + 1}</Badge>
                      <span className="truncate">{teacherById.get(id)?.name ?? 'Guru tidak ditemukan'}</span>
                      <span className="ml-auto flex shrink-0 gap-0.5">
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => movePool(i, -1)} aria-label="Naikkan"><ArrowUp className="h-3.5 w-3.5" /></Button>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={i === cfg.pool.length - 1} onClick={() => movePool(i, 1)} aria-label="Turunkan"><ArrowDown className="h-3.5 w-3.5" /></Button>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => togglePool(id, false)} aria-label="Hapus dari daftar"><X className="h-3.5 w-3.5" /></Button>
                      </span>
                    </div>
                  ))}
                  {cfg.pool.length === 0 && <p className="p-3 text-sm text-muted-foreground">Belum ada guru dipilih. Centang guru di kolom kiri.</p>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Atur ruang lalu generate</CardTitle>
            <CardDescription>Isian manual tetap bisa dilakukan kapan saja dengan mengklik sel matriks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="rooms">Jumlah ruang</Label>
                <div className="flex gap-2">
                  <Input id="rooms" type="number" min={1} max={200} value={cfg.rooms}
                    onChange={(e) => setCfg((c) => ({ ...c, rooms: Math.max(1, Math.min(200, Math.floor(Number(e.target.value)) || 1)) }))} />
                  {suggested.data ? (
                    <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setCfg((c) => ({ ...c, rooms: suggested.data! }))}>
                      Dari denah ({suggested.data})
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">"Dari denah" memakai jumlah ruang hasil Administrasi Ujian.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Pengawas per ruang</Label>
                <Select value={String(cfg.perRoom)} onValueChange={(v) => setCfg((c) => ({ ...c, perRoom: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n} guru</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cara menyusun</Label>
                <Select value={cfg.method} onValueChange={(v) => setCfg((c) => ({ ...c, method: v as InvMethod }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="putar">Putar berurutan (pindah 1 ruang tiap sesi)</SelectItem>
                    <SelectItem value="seimbang">Seimbang otomatis (beban dibagi rata)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {cfg.method === 'seimbang' && (
              <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div>
                  <Label htmlFor="own">Hindari mapel sendiri</Label>
                  <p className="text-xs text-muted-foreground">Guru tidak mengawas sesi mapel yang ia ajar (dicocokkan dari nama mapel).</p>
                </div>
                <Switch id="own" checked={cfg.avoidOwnSubject} onCheckedChange={(v) => setCfg((c) => ({ ...c, avoidOwnSubject: v }))} />
              </div>
            )}
            {cfg.method === 'putar' && (
              <p className="text-xs text-muted-foreground">
                Pola putar mengikuti nomor guru apa adanya; guru yang kebetulan mengawas mapelnya sendiri hanya ditandai di tab Peringatan.
              </p>
            )}
            {cfg.pool.length > 0 && cfg.pool.length < slotsNeeded && (
              <p className="text-sm text-amber-700">
                Guru terpilih ({cfg.pool.length}) lebih sedikit dari jumlah tempat per sesi ({slotsNeeded}), sehingga {slotsNeeded - cfg.pool.length} tempat tiap sesi akan kosong.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={onGenerateClick} disabled={missing || teachersQ.isLoading}>
                <Wand2 className="mr-2 h-4 w-4" /> Generate otomatis
              </Button>
              <Button variant="outline" onClick={() => setClearOpen(true)} disabled={Object.keys(assign).length === 0}>
                <Eraser className="mr-2 h-4 w-4" /> Kosongkan semua
              </Button>
              <div className="ml-auto flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{sessions.length} sesi</Badge>
                <Badge variant="outline">{cfg.rooms} ruang</Badge>
                <Badge variant="outline">Terisi {filledCells}/{totalCells}</Badge>
                <Badge variant="outline">{cfg.pool.length} guru terpilih</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="ruang">
          <TabsList>
            <TabsTrigger value="ruang">Matriks per Ruang</TabsTrigger>
            <TabsTrigger value="guru">Matriks per Guru</TabsTrigger>
            <TabsTrigger value="masalah">
              Peringatan {problems.length > 0 && <Badge variant="destructive" className="ml-2">{problems.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ruang">
            <Card>
              <CardContent className="p-0">
                {sessions.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Belum ada sesi ujian.</p>
                ) : (
                  <div className="flex flex-col gap-4 p-3 lg:flex-row">
                    <div className="max-h-[70vh] min-w-0 flex-1 overflow-auto">
                      <table className="border-collapse text-xs">
                        <thead className="sticky top-0 z-20 bg-muted">
                          <tr>
                            <th rowSpan={2} className="border p-1.5">NO</th>
                            <th rowSpan={2} className="border p-1.5">HARI / TANGGAL</th>
                            <th rowSpan={2} className="border p-1.5">MATA PELAJARAN</th>
                            <th rowSpan={2} className="border p-1.5">WAKTU</th>
                            <th colSpan={cfg.rooms} className="border p-1.5">RUANG</th>
                          </tr>
                          <tr>
                            {Array.from({ length: cfg.rooms }, (_, i) => i + 1).map((r) => <th key={r} className="min-w-[34px] border p-1 text-center">{r}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {days.map((d, di) => d.sessions.map((s, si) => (
                            <tr key={s.key}>
                              {si === 0 && <td rowSpan={d.sessions.length} className="border p-1.5 text-center align-middle">{di + 1}</td>}
                              {si === 0 && <td rowSpan={d.sessions.length} className="border p-1.5 align-middle font-semibold">{[s.day, (s.dateLabel || s.date).replace(/^0/, '')].filter(Boolean).join(', ')}</td>}
                              <td className="border p-1.5">{s.subject || '-'}</td>
                              <td className="whitespace-nowrap border p-1.5 text-center">{s.start.replace(':', '.')}{s.end ? ` - ${s.end.replace(':', '.')}` : ''}</td>
                              {Array.from({ length: cfg.rooms }, (_, i) => i + 1).map((room) => (
                                <td key={room} className="border p-0.5 align-middle">
                                  <div className="flex flex-col gap-0.5">
                                    {Array.from({ length: cfg.perRoom }, (_, i) => i + 1).map((slot) => {
                                      const k = cellKey(s.key, room, slot);
                                      const t = teacherById.get(assign[k] ?? '');
                                      const bad = problemCells.has(k);
                                      return (
                                        <button
                                          key={slot}
                                          type="button"
                                          onClick={() => { setQ(''); setPick({ key: k }); }}
                                          className={`h-6 w-full min-w-[30px] rounded text-center text-xs font-medium transition-colors ${
                                            t ? (bad ? 'border border-destructive bg-destructive/10 text-destructive' : 'bg-primary/10 hover:bg-primary/20')
                                              : 'border border-dashed text-muted-foreground hover:bg-muted'}`}
                                          title={t ? `${numOf.get(t.id)}. ${t.name}` : 'Klik untuk memilih pengawas'}
                                        >
                                          {t ? (numOf.get(t.id) ?? '?') : <Plus className="mx-auto h-3 w-3" />}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          )))}
                        </tbody>
                      </table>
                    </div>
                    <div className="max-h-[70vh] w-full shrink-0 overflow-auto lg:w-64">
                      <table className="w-full border-collapse text-xs">
                        <thead className="sticky top-0 bg-muted"><tr><th className="w-10 border p-1.5">NO</th><th className="border p-1.5 text-left">NAMA</th></tr></thead>
                        <tbody>
                          {numbered.map((t, i) => (
                            <tr key={t.id}><td className="border p-1 text-center">{i + 1}</td><td className="border p-1">{t.name}</td></tr>
                          ))}
                          {numbered.length === 0 && <tr><td colSpan={2} className="border p-2 text-muted-foreground">Pilih guru pengawas dulu.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="guru">
            <Card>
              <CardContent className="p-0">
                <div className="max-h-[70vh] overflow-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="border p-2 text-center">No</th>
                        <th className="border p-2 text-left">Guru</th>
                        <th className="border p-2 text-left">Mapel</th>
                        <th className="border p-2 text-center">Tugas</th>
                        <th className="border p-2 text-center">Hari</th>
                        <th className="border p-2 text-left">Jadwal mengawas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loads.map((l) => {
                        const t = teacherById.get(l.id);
                        const out = cfg.pool.length > 0 && !cfg.pool.includes(l.id);
                        return (
                          <tr key={l.id} className={out ? 'opacity-70' : ''}>
                            <td className="border p-2 text-center font-semibold">{numOf.get(l.id)}</td>
                            <td className="border p-2">{l.name}{out && <Badge variant="secondary" className="ml-2">di luar daftar</Badge>}</td>
                            <td className="border p-2 text-muted-foreground">{t?.subject}</td>
                            <td className="border p-2 text-center font-semibold">{l.total}</td>
                            <td className="border p-2 text-center">{l.days}</td>
                            <td className="border p-2">
                              <div className="flex flex-wrap gap-1">
                                {l.items.map((it) => (
                                  <Badge key={`${it.session.key}${it.room}${it.slot}`} variant="outline" className="font-normal">
                                    {(it.session.dateLabel || it.session.date)} {it.session.start} • Ruang {it.room}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="masalah">
            <Card>
              <CardContent className="space-y-2 p-4">
                {problems.length === 0 ? (
                  <p className="text-sm text-emerald-700">Tidak ada masalah: tidak ada guru yang bentrok, semua tempat terisi.</p>
                ) : problems.map((p, i) => (
                  <p key={i} className={`flex gap-2 text-sm ${p.kind === 'kosong' ? 'text-amber-700' : 'text-destructive'}`}>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {p.message}
                  </p>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Pilih pengawas */}
      <Dialog open={!!pick} onOpenChange={(o) => { if (!o) setPick(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pilih pengawas</DialogTitle>
            <DialogDescription>
              {pickInfo ? `Ruang ${pickInfo.room}${cfg.perRoom > 1 ? ` • Pengawas ${pickInfo.slot}` : ''} — ${sName(pickInfo.session)} — ${pickInfo.session.subject || '-'}` : ''}
            </DialogDescription>
          </DialogHeader>
          <Input placeholder="Cari nama atau mapel…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {candidates.map(({ t, total, clash, reasons }) => (
              <button
                key={t.id}
                type="button"
                disabled={!!clash}
                onClick={() => { setCell(pick!.key, t.id); setPick(null); }}
                className={`flex w-full items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm ${clash ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted'} ${assign[pick!.key] === t.id ? 'border-primary bg-primary/10' : ''}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.subject}
                    {clash ? ` • sudah mengawas Ruang ${clash.room} (${clash.session.start})` : ''}
                    {reasons.length ? ` • ${reasons.join(', ')}` : ''}
                  </span>
                </span>
                <Badge variant="outline" className="shrink-0">{total}×</Badge>
              </button>
            ))}
            {candidates.length === 0 && <p className="p-3 text-sm text-muted-foreground">Guru tidak ditemukan.</p>}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" disabled={!pick || !assign[pick.key]} onClick={() => { setCell(pick!.key, null); setPick(null); }}>
              <Trash2 className="mr-2 h-4 w-4" /> Kosongkan
            </Button>
            <Button variant="ghost" onClick={() => setPick(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate */}
      <AlertDialog open={genOpen} onOpenChange={setGenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Jadwal sudah terisi sebagian</AlertDialogTitle>
            <AlertDialogDescription>
              Pilih <b>Lengkapi yang kosong</b> untuk menjaga isian yang sudah ada, atau <b>Susun ulang semua</b> untuk menimpa seluruh jadwal pengawas di layar (belum tersimpan sampai Anda klik Simpan).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <Button variant="outline" onClick={() => runGenerate('empty')}>Lengkapi yang kosong</Button>
            <AlertDialogAction onClick={() => runGenerate('all')}>Susun ulang semua</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kosongkan semua pengawas?</AlertDialogTitle>
            <AlertDialogDescription>Seluruh isian di layar dihapus. Jadwal tersimpan baru berubah setelah Anda klik Simpan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setAssign({}); setClearOpen(false); }}>Kosongkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cetak */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cetak jadwal pengawas</DialogTitle>
            <DialogDescription>Format matriks sekolah dengan kop: nomor guru per ruang dan sesi, daftar nama, keterangan, dan tanda tangan kepala sekolah.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kertas</Label>
              <Select value={paper} onValueChange={(v) => setPaper(v as PdfPaper)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(PAPER_LABEL) as PdfPaper[]).map((p) => <SelectItem key={p} value={p}>{PAPER_LABEL[p]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Tanggal tanda tangan</Label><Input type="date" value={signDate} onChange={(e) => setSignDate(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Keterangan (satu baris = satu poin)</Label>
              <Textarea rows={4} value={notesText} onChange={(e) => setNotesText(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Kop surat, tempat, dan nama kepala sekolah diambil dari Pengaturan Sekolah. Matriks berisi nomor guru, tabel nomor-nama ada di sisi kanan.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintOpen(false)}>Batal</Button>
            <Button onClick={doPrint} disabled={printing}><Printer className="mr-2 h-4 w-4" />{printing ? 'Membuat…' : 'Cetak PDF'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
