import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Fingerprint, Pencil, Plus, RefreshCw, Settings2, Trash2, FileDown, FileSpreadsheet, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  PiketDuty, PiketShift, PiketStatus, SHIFT_LABEL, STATUS_LABEL, bulanLabel, buildPiketPdf, exportPiketExcel,
  hariLabel, jamWIB, monthRange, parseISODate, toISODate, weekendDates, PiketPunch, verifyLabel,
} from "@/lib/piket";

const ROLES = ["admin", "bendahara", "super_admin"] as const;

const STATUS_VARIANT: Record<PiketStatus, "default" | "secondary" | "destructive" | "outline"> = {
  hadir: "default", dijadwalkan: "outline", tidak_hadir: "destructive", izin: "secondary",
};

type PersonOpt = { key: string; type: "staff" | "teacher"; id: string; name: string; position: string; pin: string | null };

function PiketPage({ shift }: { shift: PiketShift }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [ym, setYm] = useState(() => toISODate(new Date()).slice(0, 7));
  const [syncing, setSyncing] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [personKey, setPersonKey] = useState<string>("");
  const [manualName, setManualName] = useState("");
  const [manualPos, setManualPos] = useState("");
  const [fromDate, setFromDate] = useState(() => toISODate(new Date()));
  const [toDate, setToDate] = useState(() => toISODate(new Date()));

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkKeys, setBulkKeys] = useState<string[]>([]);

  const [editing, setEditing] = useState<PiketDuty | null>(null);
  const [editStatus, setEditStatus] = useState<PiketStatus>("hadir");
  const [editNotes, setEditNotes] = useState("");
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [deleting, setDeleting] = useState<PiketDuty | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cfg, setCfg] = useState<any>(null);

  const { from, to } = useMemo(() => monthRange(ym), [ym]);
  const key = ["piket-duties", shift, ym];

  const { data: rows = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piket_duties" as any).select("*").eq("shift_type", shift)
        .gte("duty_date", from).lte("duty_date", to)
        .order("duty_date").order("person_name");
      if (error) throw error;
      return (data as any[]) as PiketDuty[];
    },
  });

  const { data: punches = new Map<string, PiketPunch[]>() } = useQuery({
    queryKey: ["piket-punches", shift, ym],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("piket_punches" as any, { p_from: from, p_to: to, p_shift: shift });
      if (error) throw error;
      const m = new Map<string, PiketPunch[]>();
      ((data as any[]) as PiketPunch[]).forEach((p) => m.set(p.duty_id, [...(m.get(p.duty_id) ?? []), p]));
      return m;
    },
  });

  const { data: school } = useQuery({
    queryKey: ["school-settings-piket"],
    queryFn: async () => (await supabase.from("school_settings").select("*").maybeSingle()).data as any,
  });

  const { data: people = [] } = useQuery({
    queryKey: ["piket-people"],
    queryFn: async () => {
      const [st, tc] = await Promise.all([
        supabase.from("staff" as any).select("id, full_name, position, staff_type, fingerprint_pin, status").order("full_name"),
        supabase.from("teachers").select("id, user_id, jabatan, subject, fingerprint_pin" as any),
      ]);
      const out: PersonOpt[] = [];
      ((st.data as any[]) ?? []).filter((s) => s.status !== "nonaktif").forEach((s) =>
        out.push({ key: `staff:${s.id}`, type: "staff", id: s.id, name: s.full_name,
          position: s.position || (s.staff_type === "tata_usaha" ? "Tata Usaha" : "Karyawan"), pin: s.fingerprint_pin }));
      const teachers = ((tc.data as any[]) ?? []);
      if (teachers.length) {
        const { data: profs } = await supabase.from("profiles_public").select("id, full_name").in("id", teachers.map((t) => t.user_id));
        const nm = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
        teachers.forEach((t) => out.push({ key: `teacher:${t.id}`, type: "teacher", id: t.id,
          name: (nm.get(t.user_id) as string) || "Guru", position: t.jabatan || t.subject || "Guru", pin: t.fingerprint_pin }));
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["piket-duties", shift] });
    await qc.invalidateQueries({ queryKey: ["piket-punches", shift] });
  };

  const sync = async (opts?: { reset?: boolean; silent?: boolean }) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.rpc("piket_sync" as any, {
        p_from: from, p_to: to, p_shift: shift, p_reset_manual: !!opts?.reset,
      });
      if (error) throw error;
      await refresh();
      if (!opts?.silent) toast.success(`Sinkron fingerprint selesai${typeof data === "number" ? ` (${data} data diperbarui)` : ""}`);
    } catch (e: any) {
      toast.error(`Gagal menarik data fingerprint: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Tarik otomatis saat halaman / bulan dibuka
  useEffect(() => { sync({ silent: true }); /* eslint-disable-next-line */ }, [ym, shift]);

  const mkRow = (p: PersonOpt | null, date: string) => ({
    shift_type: shift,
    duty_date: date,
    person_type: p ? p.type : "manual",
    staff_id: p?.type === "staff" ? p.id : null,
    teacher_id: p?.type === "teacher" ? p.id : null,
    person_name: p ? p.name : manualName.trim(),
    position: p ? p.position : manualPos.trim() || null,
    created_by: user?.id ?? null,
  });

  const datesFor = (a: string, b: string) => {
    const out: string[] = [];
    for (let d = parseISODate(a); d <= parseISODate(b); d.setDate(d.getDate() + 1)) {
      if (shift === "sabtu_minggu" && ![0, 6].includes(d.getDay())) continue;
      out.push(toISODate(d));
    }
    return out;
  };

  const insertRows = async (payload: any[]) => {
    // abaikan duplikat (unique index) satu per satu agar sisanya tetap masuk
    let ok = 0, dup = 0;
    for (const r of payload) {
      const { error } = await supabase.from("piket_duties" as any).insert(r);
      if (!error) ok++;
      else if ((error as any).code === "23505") dup++;
      else throw error;
    }
    return { ok, dup };
  };

  const addMut = useMutation({
    mutationFn: async () => {
      const p = people.find((x) => x.key === personKey) ?? null;
      if (!p && !manualName.trim()) throw new Error("Pilih orang atau isi nama manual");
      const dates = datesFor(fromDate, toDate);
      if (!dates.length) throw new Error("Tidak ada tanggal yang cocok pada rentang tersebut");
      return insertRows(dates.map((d) => mkRow(p, d)));
    },
    onSuccess: async ({ ok, dup }) => {
      toast.success(`${ok} jadwal ditambahkan${dup ? `, ${dup} sudah ada` : ""}`);
      setAddOpen(false); setPersonKey(""); setManualName(""); setManualPos("");
      await sync({ silent: true });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkMut = useMutation({
    mutationFn: async () => {
      const chosen = people.filter((p) => bulkKeys.includes(p.key));
      if (!chosen.length) throw new Error("Pilih minimal satu orang");
      const dates = weekendDates(ym);
      return insertRows(chosen.flatMap((p) => dates.map((d) => mkRow(p, d))));
    },
    onSuccess: async ({ ok, dup }) => {
      toast.success(`${ok} jadwal dibuat${dup ? `, ${dup} sudah ada` : ""}`);
      setBulkOpen(false); setBulkKeys([]);
      await sync({ silent: true });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toLocalInput = (ts: string | null) => {
    if (!ts) return "";
    const s = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" }).format(new Date(ts));
    return s.replace(" ", "T");
  };
  const fromLocalInput = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : null);

  const openEdit = (r: PiketDuty) => {
    setEditing(r); setEditStatus(r.status === "dijadwalkan" ? "hadir" : r.status);
    setEditNotes(r.notes ?? ""); setEditIn(toLocalInput(r.check_in_at)); setEditOut(toLocalInput(r.check_out_at));
  };

  const editMut = useMutation({
    mutationFn: async (mode: "manual" | "fingerprint") => {
      if (!editing) return;
      const patch: any = mode === "manual"
        ? { status: editStatus, notes: editNotes.trim() || null, source: "manual",
            check_in_at: fromLocalInput(editIn), check_out_at: fromLocalInput(editOut) }
        : { source: "fingerprint", status: "dijadwalkan", notes: editNotes.trim() || null, check_in_at: null, check_out_at: null };
      const { error } = await supabase.from("piket_duties" as any).update(patch).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: async (_d, mode) => {
      toast.success(mode === "manual" ? "Kehadiran disimpan" : "Dikembalikan ke data fingerprint");
      setEditing(null);
      if (mode === "fingerprint") await sync({ silent: true }); else await refresh();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("piket_duties" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Jadwal dihapus"); setDeleting(null); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const openSettings = async () => {
    const { data } = await supabase.from("piket_settings" as any).select("*").eq("id", 1).maybeSingle();
    setCfg(data ?? { night_window_start: "16:00", night_window_end: "09:00", weekend_window_start: "05:00", weekend_window_end: "20:00", min_gap_minutes: 60 });
    setSettingsOpen(true);
  };
  const saveSettings = async () => {
    const t = (v: string) => (v?.length === 5 ? v : String(v).slice(0, 5));
    const { error } = await supabase.from("piket_settings" as any).upsert({
      id: 1,
      night_window_start: t(cfg.night_window_start), night_window_end: t(cfg.night_window_end),
      weekend_window_start: t(cfg.weekend_window_start), weekend_window_end: t(cfg.weekend_window_end),
      min_gap_minutes: Number(cfg.min_gap_minutes) || 60,
    });
    if (error) return toast.error(error.message);
    toast.success("Pengaturan disimpan");
    setSettingsOpen(false);
    await sync({ silent: true });
  };

  const exportPdf = async () => {
    const doc = await buildPiketPdf({ rows, shift, ym, school, punches });
    doc.save(`daftar-hadir-${shift}-${ym}.pdf`);
  };

  const summary = useMemo(() => ({
    total: rows.length,
    hadir: rows.filter((r) => r.status === "hadir").length,
    belum: rows.filter((r) => r.status === "dijadwalkan").length,
    absen: rows.filter((r) => r.status === "tidak_hadir" || r.status === "izin").length,
  }), [rows]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Kelola {SHIFT_LABEL[shift]}</h1>
            <p className="text-sm text-muted-foreground">
              Jadwal & daftar hadir {SHIFT_LABEL[shift].toLowerCase()}. Kehadiran otomatis dari data fingerprint (PIN pada data staf/guru).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={openSettings}><Settings2 className="mr-1 h-4 w-4" />Jam Piket</Button>
            <Button variant="outline" size="sm" onClick={() => sync()} disabled={syncing}>
              <RefreshCw className={`mr-1 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Tarik dari Fingerprint
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <CardTitle className="text-base">Periode {bulanLabel(ym)}</CardTitle>
                <CardDescription>
                  {summary.total} penugasan · {summary.hadir} hadir · {summary.belum} belum ada ketukan · {summary.absen} tidak hadir/izin
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div><Label className="text-xs">Bulan</Label><Input type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} className="w-40" /></div>
                {shift === "sabtu_minggu" && (
                  <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}><CalendarPlus className="mr-1 h-4 w-4" />Jadwalkan Sabtu–Minggu</Button>
                )}
                <Button size="sm" onClick={() => { setFromDate(from); setToDate(from); setAddOpen(true); }}><Plus className="mr-1 h-4 w-4" />Tambah</Button>
                <Button variant="outline" size="sm" onClick={exportPdf} disabled={!rows.length}><FileDown className="mr-1 h-4 w-4" />PDF</Button>
                <Button variant="outline" size="sm" onClick={() => exportPiketExcel(rows, shift, ym, punches)} disabled={!rows.length}><FileSpreadsheet className="mr-1 h-4 w-4" />Excel</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead><TableHead>Nama</TableHead>
                  <TableHead className="text-center">Datang</TableHead><TableHead className="text-center">Pulang</TableHead>
                  <TableHead>Ketukan (jenis absen)</TableHead><TableHead>Status</TableHead><TableHead>Sumber</TableHead><TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Memuat…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Belum ada jadwal pada bulan ini.</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{hariLabel(r.duty_date)}, {r.duty_date.split("-").reverse().join("/")}</TableCell>
                    <TableCell className="font-medium">
                      {r.person_name}
                      <div className="text-xs text-muted-foreground">{r.position || "-"}{r.fingerprint_pin ? ` · PIN ${r.fingerprint_pin}` : r.person_type !== "manual" ? " · PIN belum diisi" : ""}</div>
                    </TableCell>
                    <TableCell className="text-center">{jamWIB(r.check_in_at)}</TableCell>
                    <TableCell className="text-center">{jamWIB(r.check_out_at)}</TableCell>
                    <TableCell className="min-w-[12rem]">
                      {(punches.get(r.id) ?? []).length === 0 ? <span className="text-xs text-muted-foreground">-</span> : (
                        <div className="flex flex-wrap gap-1">
                          {(punches.get(r.id) ?? []).map((p, i) => (
                            <Badge key={i} variant="outline" className="gap-1 font-normal" title={`Mesin ${p.device_sn}`}>
                              <span className="font-mono">{jamWIB(p.punched_at)}</span>
                              <span className="text-muted-foreground">{verifyLabel(p.verify_type)}</span>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>{r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}</TableCell>
                    <TableCell>{r.source === "fingerprint" ? <span className="inline-flex items-center gap-1 text-xs"><Fingerprint className="h-3.5 w-3.5" />Fingerprint</span> : <span className="text-xs">Manual</span>}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Tambah */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Jadwal {SHIFT_LABEL[shift]}</DialogTitle>
            <DialogDescription>{shift === "sabtu_minggu" ? "Hanya hari Sabtu & Minggu dalam rentang yang akan dibuat." : "Satu jadwal dibuat untuk setiap tanggal dalam rentang."}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>Petugas (staf / guru)</Label>
              <Select value={personKey} onValueChange={setPersonKey}>
                <SelectTrigger><SelectValue placeholder="Pilih petugas…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__manual">— Nama manual (bukan staf/guru) —</SelectItem>
                  {people.map((p) => <SelectItem key={p.key} value={p.key}>{p.name} · {p.position}{p.pin ? "" : " (tanpa PIN)"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {personKey === "__manual" && (
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Nama</Label><Input value={manualName} onChange={(e) => setManualName(e.target.value)} /></div>
                <div><Label>Jabatan</Label><Input value={manualPos} onChange={(e) => setManualPos(e.target.value)} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Dari tanggal</Label><Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); if (e.target.value > toDate) setToDate(e.target.value); }} /></div>
              <div><Label>Sampai tanggal</Label><Input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button onClick={() => addMut.mutate()} disabled={addMut.isPending}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Massal Sabtu–Minggu */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Jadwalkan Sabtu–Minggu {bulanLabel(ym)}</DialogTitle>
            <DialogDescription>Petugas terpilih dijadwalkan pada semua Sabtu dan Minggu bulan ini ({weekendDates(ym).length} hari). Jadwal yang sudah ada dilewati.</DialogDescription></DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
            {people.map((p) => (
              <label key={p.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50">
                <input type="checkbox" checked={bulkKeys.includes(p.key)}
                  onChange={() => setBulkKeys((k) => (k.includes(p.key) ? k.filter((x) => x !== p.key) : [...k, p.key]))} />
                <span className="font-medium">{p.name}</span><span className="text-xs text-muted-foreground">{p.position}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Batal</Button>
            <Button onClick={() => bulkMut.mutate()} disabled={bulkMut.isPending}>Buat Jadwal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ubah kehadiran */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ubah Kehadiran</DialogTitle>
            <DialogDescription>{editing?.person_name} · {editing && `${hariLabel(editing.duty_date)}, ${editing.duty_date}`}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as PiketStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(["hadir", "tidak_hadir", "izin"] as PiketStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Datang (WIB)</Label><Input type="datetime-local" value={editIn} onChange={(e) => setEditIn(e.target.value)} /></div>
              <div><Label>Pulang (WIB)</Label><Input type="datetime-local" value={editOut} onChange={(e) => setEditOut(e.target.value)} /></div>
            </div>
            <div><Label>Catatan</Label><Textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">Data yang diubah manual tidak ditimpa oleh sinkronisasi fingerprint.</p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => editMut.mutate("fingerprint")} disabled={editMut.isPending}><Fingerprint className="mr-1 h-4 w-4" />Kembalikan ke Fingerprint</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
              <Button onClick={() => editMut.mutate("manual")} disabled={editMut.isPending}>Simpan</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pengaturan */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Jam Piket</DialogTitle>
            <DialogDescription>Ketukan jari di dalam jendela waktu ini dihitung sebagai kehadiran piket. Ketukan pertama = datang, terakhir = pulang.</DialogDescription></DialogHeader>
          {cfg && (
            <div className="space-y-3">
              <div><Label className="text-sm font-semibold">Piket Malam (tanggal D → D+1)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Mulai (hari D)</Label><Input type="time" value={String(cfg.night_window_start).slice(0, 5)} onChange={(e) => setCfg({ ...cfg, night_window_start: e.target.value })} /></div>
                  <div><Label className="text-xs">Selesai (hari D+1)</Label><Input type="time" value={String(cfg.night_window_end).slice(0, 5)} onChange={(e) => setCfg({ ...cfg, night_window_end: e.target.value })} /></div>
                </div></div>
              <div><Label className="text-sm font-semibold">Piket Sabtu & Minggu (hari yang sama)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Mulai</Label><Input type="time" value={String(cfg.weekend_window_start).slice(0, 5)} onChange={(e) => setCfg({ ...cfg, weekend_window_start: e.target.value })} /></div>
                  <div><Label className="text-xs">Selesai</Label><Input type="time" value={String(cfg.weekend_window_end).slice(0, 5)} onChange={(e) => setCfg({ ...cfg, weekend_window_end: e.target.value })} /></div>
                </div></div>
              <div><Label className="text-xs">Jarak minimal datang → pulang (menit)</Label><Input type="number" min={1} value={cfg.min_gap_minutes} onChange={(e) => setCfg({ ...cfg, min_gap_minutes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setSettingsOpen(false)}>Batal</Button><Button onClick={saveSettings}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus jadwal?</AlertDialogTitle>
            <AlertDialogDescription>{deleting?.person_name} — {deleting?.duty_date} akan dihapus dari daftar hadir.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && delMut.mutate(deleting.id)}>Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

export default function PiketManagement({ shift }: { shift: PiketShift }) {
  return <ProtectedRoute allowedRoles={[...ROLES]}><PiketPage shift={shift} /></ProtectedRoute>;
}
