import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, FileDown, FileSpreadsheet, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAllPages } from "@/lib/attendanceUtils";
import { PdfPreviewDialog } from "@/components/piket/PdfPreviewDialog";
import { toISODate } from "@/lib/piket";
import {
  DAYS, PrayerLog, PrayerType, RecapRow, SOURCE_LABEL, STATUS_LABEL, SummaryRow, buildPrayerLogPdf, buildPrayerRecapPdf,
  buildRecap, daysText, exportPrayerLogExcel, exportPrayerRecapExcel, hhmm, logTime, tanggalPendek,
} from "@/lib/prayer";

const db = supabase as any;
const MANAGE_ROLES = ["admin", "kesiswaan", "super_admin"];
const SELECT_CLS = "h-9 rounded-md border bg-background px-2 text-sm";

type Dir = "asc" | "desc";
function SortHead({ label, k, sort, dir, onSort, className }: { label: string; k: string; sort: string; dir: Dir; onSort: (k: string) => void; className?: string }) {
  const Icon = sort === k ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button type="button" className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={() => onSort(k)}>
        {label}<Icon className="h-3.5 w-3.5 opacity-60" />
      </button>
    </TableHead>
  );
}

function Pager({ total, page, setPage, size, setSize }: { total: number; page: number; setPage: (n: number) => void; size: number; setSize: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(page, pages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm">
      <span className="text-muted-foreground">{total === 0 ? "0 data" : `${(cur - 1) * size + 1}–${Math.min(cur * size, total)} dari ${total}`}</span>
      <div className="flex items-center gap-2">
        <select className="h-8 rounded-md border bg-background px-2" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>
          {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / halaman</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>‹</Button>
        <span>{cur} / {pages}</span>
        <Button size="sm" variant="outline" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>›</Button>
      </div>
    </div>
  );
}

const cmp = (a: any, b: any) => (typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""), "id"));

/* ───────────────────────── Shared queries ───────────────────────── */
function useRefs() {
  const types = useQuery({
    queryKey: ["prayer-types"],
    queryFn: async () => ((await db.from("prayer_types").select("*").order("sort_order").order("start_time")).data ?? []) as PrayerType[],
  });
  const classes = useQuery({
    queryKey: ["prayer-classes"],
    queryFn: async () => ((await supabase.from("classes").select("id, name").order("name")).data ?? []) as { id: string; name: string }[],
  });
  const school = useQuery({
    queryKey: ["school-settings-prayer"],
    queryFn: async () => (await supabase.from("school_settings").select("*").maybeSingle()).data as any,
  });
  return { types: types.data ?? [], classes: classes.data ?? [], school: school.data, typesLoading: types.isLoading };
}

/* ───────────────────────── Tab: Log ───────────────────────── */
function LogTab({ types, classes, school, canManage }: { types: PrayerType[]; classes: { id: string; name: string }[]; school: any; canManage: boolean }) {
  const qc = useQueryClient();
  const today = toISODate(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [typeId, setTypeId] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [classId, setClassId] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("time");
  const [dir, setDir] = useState<Dir>("desc");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [preview, setPreview] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [del, setDel] = useState<PrayerLog | null>(null);

  const { data: logs = [], isLoading, isError } = useQuery({
    queryKey: ["prayer-logs", from, to],
    queryFn: () =>
      fetchAllPages<PrayerLog>((a, b) =>
        db.from("prayer_attendance")
          .select("*, students(full_name, nis, class_id, classes(name)), prayer_types(name)")
          .gte("date", from).lte("date", to)
          .order("punched_at", { ascending: false }).order("id")
          .range(a, b)),
    enabled: !!from && !!to && from <= to,
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = logs.filter((l) =>
      (typeId === "all" || l.prayer_type_id === typeId) && (status === "all" || l.status === status) &&
      (source === "all" || l.source === source) && (classId === "all" || l.students?.class_id === classId) &&
      (!term || (l.students?.full_name ?? "").toLowerCase().includes(term) || (l.students?.nis ?? "").includes(term)));
    const val = (l: PrayerLog) =>
      sort === "name" ? l.students?.full_name : sort === "class" ? l.students?.classes?.name : sort === "prayer" ? l.prayer_types?.name
        : sort === "status" ? l.status : sort === "source" ? l.source : l.punched_at;
    return [...list].sort((a, b) => (dir === "asc" ? 1 : -1) * cmp(val(a), val(b)));
  }, [logs, typeId, status, source, classId, q, sort, dir]);

  useEffect(() => { setPage(1); }, [typeId, status, source, classId, q, from, to]);
  const onSort = (k: string) => { if (sort === k) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(k); setDir("asc"); } };
  const cur = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const view = rows.slice((cur - 1) * size, cur * size);

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("prayer_attendance").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Catatan dihapus"); setDel(null); qc.invalidateQueries({ queryKey: ["prayer-logs"] }); },
    onError: (e: any) => toast.error(e?.message || "Gagal menghapus"),
  });

  const nHadir = rows.filter((r) => r.status === "hadir").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Log Absensi Salat</CardTitle>
        <CardDescription>Dicatat otomatis dari mesin fingerprint atau kartu RFID sesuai pengaturan salat.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">Dari</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" /></div>
          <div><Label className="text-xs">Sampai</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" /></div>
          <div><Label className="text-xs">Salat</Label>
            <select className={`${SELECT_CLS} block`} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="all">Semua</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <div><Label className="text-xs">Kelas</Label>
            <select className={`${SELECT_CLS} block`} value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="all">Semua</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><Label className="text-xs">Status</Label>
            <select className={`${SELECT_CLS} block`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Semua</option><option value="hadir">Tepat waktu</option><option value="terlambat">Terlambat</option>
            </select></div>
          <div><Label className="text-xs">Sumber</Label>
            <select className={`${SELECT_CLS} block`} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="all">Semua</option><option value="fingerprint">Fingerprint</option><option value="rfid">RFID</option><option value="manual">Manual</option>
            </select></div>
          <div className="min-w-[180px] flex-1"><Label className="text-xs">Cari nama / NIS</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik nama atau NIS…" className="h-9" /></div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{rows.length} catatan</Badge>
          <Badge variant="outline">Tepat waktu {nHadir}</Badge>
          <Badge variant="outline">Terlambat {rows.length - nHadir}</Badge>
          <div className="ml-auto flex flex-wrap gap-2">
            {canManage && <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><UserPlus className="mr-1 h-4 w-4" />Catat manual</Button>}
            <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => setPreview(true)}><FileDown className="mr-1 h-4 w-4" />Cetak</Button>
            <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => exportPrayerLogExcel(rows, from, to)}><FileSpreadsheet className="mr-1 h-4 w-4" />Excel</Button>
          </div>
        </div>

        {from > to && <p className="text-sm text-destructive">Tanggal awal harus sebelum tanggal akhir.</p>}
        {isError && <p className="text-sm text-destructive">Gagal memuat data. Pastikan migrasi absensi salat sudah dijalankan.</p>}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">No</TableHead>
                <SortHead label="Waktu" k="time" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Nama" k="name" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Kelas" k="class" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Salat" k="prayer" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Status" k="status" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Sumber" k="source" sort={sort} dir={dir} onSort={onSort} />
                {canManage && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Memuat…</TableCell></TableRow>
              ) : view.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Belum ada catatan pada filter ini.</TableCell></TableRow>
              ) : view.map((l, i) => (
                <TableRow key={l.id}>
                  <TableCell>{(cur - 1) * size + i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap">{tanggalPendek(l.date)}<div className="text-xs text-muted-foreground">{logTime(l)} WIB</div></TableCell>
                  <TableCell className="font-medium">{l.students?.full_name ?? "-"}<div className="text-xs font-normal text-muted-foreground">NIS {l.students?.nis ?? "-"}</div></TableCell>
                  <TableCell>{l.students?.classes?.name ?? "-"}</TableCell>
                  <TableCell>{l.prayer_types?.name ?? "-"}</TableCell>
                  <TableCell><Badge variant={l.status === "hadir" ? "default" : "secondary"}>{STATUS_LABEL[l.status]}</Badge></TableCell>
                  <TableCell>{SOURCE_LABEL[l.source]}{l.note && <div className="text-xs text-muted-foreground">{l.note}</div>}</TableCell>
                  {canManage && <TableCell><Button size="icon" variant="ghost" onClick={() => setDel(l)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pager total={rows.length} page={cur} setPage={setPage} size={size} setSize={setSize} />
      </CardContent>

      <PdfPreviewDialog open={preview} onClose={() => setPreview(false)} title="Pratinjau Daftar Hadir Salat" filename={`log-salat-${from}_${to}.pdf`}
        build={() => buildPrayerLogPdf({ rows: [...rows].sort((a, b) => a.punched_at.localeCompare(b.punched_at)), from, to, school })} />
      <ManualDialog open={addOpen} onClose={() => setAddOpen(false)} types={types} onSaved={() => qc.invalidateQueries({ queryKey: ["prayer-logs"] })} />
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus catatan salat?</AlertDialogTitle>
            <AlertDialogDescription>{del?.students?.full_name} · {del?.prayer_types?.name} · {del ? tanggalPendek(del.date) : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => del && remove.mutate(del.id)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ManualDialog({ open, onClose, types, onSaved }: { open: boolean; onClose: () => void; types: PrayerType[]; onSaved: () => void }) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [studentId, setStudentId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [time, setTime] = useState("12:00");
  const [status, setStatus] = useState("hadir");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: students = [] } = useQuery({
    queryKey: ["prayer-students-pick"],
    enabled: open,
    queryFn: () => fetchAllPages<any>((a, b) =>
      supabase.from("students").select("id, full_name, nis, school_id, classes(name)").eq("status", "aktif").eq("is_alumni", false).order("full_name").order("id").range(a, b)),
  });
  const found = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? students.filter((s: any) => s.full_name.toLowerCase().includes(t) || (s.nis ?? "").includes(t)).slice(0, 8) : [];
  }, [students, q]);
  const picked = students.find((s: any) => s.id === studentId);

  const save = async () => {
    if (!picked || !typeId) { toast.error("Pilih siswa dan salat"); return; }
    setBusy(true);
    try {
      const punched = new Date(`${date}T${time}:00+07:00`).toISOString();
      const { error } = await db.from("prayer_attendance").insert({
        student_id: picked.id, school_id: picked.school_id ?? null, prayer_type_id: typeId, date, punched_at: punched,
        status, source: "manual", note: note.trim() || null, created_by: user?.id ?? null,
      });
      if (error) throw error.code === "23505" ? new Error("Siswa ini sudah tercatat untuk salat dan tanggal tersebut.") : error;
      toast.success("Absensi salat dicatat");
      onSaved(); onClose(); setStudentId(""); setQ(""); setNote("");
    } catch (e: any) { toast.error(e?.message || "Gagal menyimpan"); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Catat Absensi Salat Manual</DialogTitle><DialogDescription>Untuk siswa yang lupa tap atau saat alat bermasalah.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Siswa</Label>
            {picked ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{picked.full_name} <span className="text-muted-foreground">· {picked.classes?.name ?? "-"}</span></span>
                <Button size="sm" variant="ghost" onClick={() => setStudentId("")}>Ganti</Button>
              </div>
            ) : (
              <>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / NIS…" />
                {found.length > 0 && (
                  <div className="mt-1 max-h-44 overflow-auto rounded-md border">
                    {found.map((s: any) => (
                      <button key={s.id} type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setStudentId(s.id)}>
                        {s.full_name} <span className="text-muted-foreground">· {s.classes?.name ?? "-"} · {s.nis ?? "-"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Salat</Label>
              <select className={`${SELECT_CLS} w-full`} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value="">Pilih…</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            <div><Label>Status</Label>
              <select className={`${SELECT_CLS} w-full`} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="hadir">Tepat waktu</option><option value="terlambat">Terlambat</option>
              </select></div>
            <div><Label>Tanggal</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Jam (WIB)</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          <div><Label>Catatan (opsional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Batal</Button><Button disabled={busy} onClick={save}>Simpan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Tab: Rekap ───────────────────────── */
function RecapTab({ types, classes, school }: { types: PrayerType[]; classes: { id: string; name: string }[]; school: any }) {
  const now = new Date();
  const [from, setFrom] = useState(toISODate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toISODate(now));
  const [classId, setClassId] = useState("all");
  const [typeId, setTypeId] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [dir, setDir] = useState<Dir>("asc");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [preview, setPreview] = useState(false);

  const active = useMemo(() => types.filter((t) => t.is_active && (typeId === "all" || t.id === typeId)), [types, typeId]);
  const ok = !!from && !!to && from <= to;

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ["prayer-summary", from, to, classId],
    enabled: ok,
    queryFn: () => fetchAllPages<SummaryRow>((a, b) =>
      db.rpc("prayer_summary", { p_from: from, p_to: to, p_class_id: classId === "all" ? null : classId }).range(a, b)),
  });
  const { data: base = [] } = useQuery({
    queryKey: ["prayer-base-students", classId],
    queryFn: async () => {
      const list = await fetchAllPages<any>((a, b) => {
        let qy = supabase.from("students").select("id, full_name, nis, classes(name)").eq("status", "aktif").eq("is_alumni", false).order("id").range(a, b);
        if (classId !== "all") qy = qy.eq("class_id", classId);
        return qy;
      });
      return list.map((s) => ({ id: s.id, full_name: s.full_name, nis: s.nis, class_name: s.classes?.name ?? null }));
    },
  });

  const recap = useMemo(() => buildRecap(summary, active, from, to, base), [summary, active, from, to, base]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = recap.filter((r) => !t || r.full_name.toLowerCase().includes(t) || r.nis.includes(t));
    const val = (r: RecapRow): any => sort === "class" ? r.class_name : sort === "total" ? r.total : sort === "late" ? r.terlambat : sort === "pct" ? r.pct : r.full_name;
    return [...list].sort((a, b) => (dir === "asc" ? 1 : -1) * cmp(val(a), val(b)));
  }, [recap, q, sort, dir]);
  useEffect(() => { setPage(1); }, [q, classId, typeId, from, to]);
  const onSort = (k: string) => { if (sort === k) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(k); setDir(k === "name" || k === "class" ? "asc" : "desc"); } };
  const cur = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  const view = rows.slice((cur - 1) * size, cur * size);
  const className = classId === "all" ? undefined : classes.find((c) => c.id === classId)?.name;
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rekap Absensi Salat</CardTitle>
        <CardDescription>Jumlah salat tercatat per siswa. Persentase memakai kesempatan salat terjadwal pada rentang tanggal (hari libur belum dikecualikan).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">Dari</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" /></div>
          <div><Label className="text-xs">Sampai</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" /></div>
          <div><Label className="text-xs">Kelas</Label>
            <select className={`${SELECT_CLS} block`} value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="all">Semua kelas</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><Label className="text-xs">Salat</Label>
            <select className={`${SELECT_CLS} block`} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="all">Semua salat aktif</option>{types.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <div className="min-w-[180px] flex-1"><Label className="text-xs">Cari nama / NIS</Label><Input value={q} onChange={(e) => setQ(e.target.value)} className="h-9" /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{rows.length} siswa</Badge>
          <Badge variant="outline">Rata-rata {avg}%</Badge>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => setPreview(true)}><FileDown className="mr-1 h-4 w-4" />Cetak rekap</Button>
            <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => exportPrayerRecapExcel(rows, active, from, to)}><FileSpreadsheet className="mr-1 h-4 w-4" />Excel</Button>
          </div>
        </div>
        {!ok && <p className="text-sm text-destructive">Tanggal awal harus sebelum tanggal akhir.</p>}
        {active.length === 0 && <p className="text-sm text-muted-foreground">Belum ada salat aktif. Tambahkan di tab Kelola Salat.</p>}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">No</TableHead>
                <SortHead label="Nama" k="name" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Kelas" k="class" sort={sort} dir={dir} onSort={onSort} />
                {active.map((t) => <TableHead key={t.id} className="text-center">{t.name}</TableHead>)}
                <SortHead label="Total" k="total" sort={sort} dir={dir} onSort={onSort} className="text-center" />
                <SortHead label="Terlambat" k="late" sort={sort} dir={dir} onSort={onSort} className="text-center" />
                <SortHead label="%" k="pct" sort={sort} dir={dir} onSort={onSort} className="text-center" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6 + active.length} className="py-8 text-center text-muted-foreground">Memuat…</TableCell></TableRow>
              ) : view.length === 0 ? (
                <TableRow><TableCell colSpan={6 + active.length} className="py-8 text-center text-muted-foreground">Tidak ada data.</TableCell></TableRow>
              ) : view.map((r, i) => (
                <TableRow key={r.student_id}>
                  <TableCell>{(cur - 1) * size + i + 1}</TableCell>
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell>{r.class_name}</TableCell>
                  {active.map((t) => { const p = r.per[t.id]; return <TableCell key={t.id} className="text-center">{p ? p.hadir + p.terlambat : 0}</TableCell>; })}
                  <TableCell className="text-center font-semibold">{r.total}</TableCell>
                  <TableCell className="text-center">{r.terlambat}</TableCell>
                  <TableCell className="text-center"><Badge variant={r.pct >= 80 ? "default" : r.pct >= 50 ? "secondary" : "destructive"}>{r.pct}%</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pager total={rows.length} page={cur} setPage={setPage} size={size} setSize={setSize} />
      </CardContent>
      <PdfPreviewDialog open={preview} onClose={() => setPreview(false)} title="Pratinjau Rekap Absensi Salat" filename={`rekap-salat-${from}_${to}.pdf`}
        build={() => buildPrayerRecapPdf({ rows, types: active, from, to, className, school })} />
    </Card>
  );
}

/* ───────────────────────── Tab: Kelola salat ───────────────────────── */
interface Form { id?: string; name: string; start_time: string; end_time: string; late_after: string; source: "fingerprint" | "rfid"; device_sn: string; days: number[]; sort_order: number; is_active: boolean }
const EMPTY: Form = { name: "", start_time: "12:00", end_time: "12:30", late_after: "", source: "rfid", device_sn: "", days: [1, 2, 3, 4, 5, 6, 7], sort_order: 0, is_active: true };

function ManageTab({ types }: { types: PrayerType[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<PrayerType | null>(null);
  const { data: devices = [] } = useQuery({
    queryKey: ["prayer-devices"],
    queryFn: async () => ((await db.from("fingerprint_devices").select("serial_number, name, is_active").order("created_at")).data ?? []) as { serial_number: string; name: string | null; is_active: boolean }[],
  });
  const devName = (sn: string | null) => { const d = devices.find((x) => x.serial_number === sn); return d ? `${d.name || "Mesin"} (${d.serial_number})` : sn ?? "-"; };

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const name = f.name.trim();
      if (!name) throw new Error("Nama salat wajib diisi");
      if (f.end_time <= f.start_time) throw new Error("Jam selesai harus setelah jam mulai");
      if (f.late_after && (f.late_after < f.start_time || f.late_after > f.end_time)) throw new Error("Batas tepat waktu harus di antara jam mulai dan selesai");
      if (f.source === "fingerprint" && !f.device_sn) throw new Error("Pilih mesin fingerprint");
      if (f.days.length === 0) throw new Error("Pilih minimal satu hari");
      const row = {
        name, start_time: f.start_time, end_time: f.end_time, late_after: f.late_after || null, source: f.source,
        device_sn: f.source === "fingerprint" ? f.device_sn : null, days_of_week: [...f.days].sort(), sort_order: f.sort_order, is_active: f.is_active,
      };
      const { error } = f.id ? await db.from("prayer_types").update(row).eq("id", f.id) : await db.from("prayer_types").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pengaturan salat disimpan"); setForm(null); qc.invalidateQueries({ queryKey: ["prayer-types"] }); },
    onError: (e: any) => toast.error(e?.message || "Gagal menyimpan"),
  });
  const toggle = useMutation({
    mutationFn: async (t: PrayerType) => { const { error } = await db.from("prayer_types").update({ is_active: !t.is_active }).eq("id", t.id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayer-types"] }),
    onError: (e: any) => toast.error(e?.message || "Gagal mengubah"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from("prayer_types").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Salat dihapus"); setDel(null); qc.invalidateQueries({ queryKey: ["prayer-types"] }); },
    onError: (e: any) => { setDel(null); toast.error(e?.code === "23503" ? "Salat ini sudah punya data absensi, jadi tidak bisa dihapus. Nonaktifkan saja." : e?.message || "Gagal menghapus"); },
  });

  const tapUrl = typeof window !== "undefined" ? `${window.location.origin}/absensi-salat` : "/absensi-salat";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div><CardTitle>Jenis Salat</CardTitle><CardDescription>Atur nama, waktu, hari, dan sumber absen setiap salat.</CardDescription></div>
          <Button size="sm" onClick={() => setForm({ ...EMPTY, sort_order: types.length + 1 })}><Plus className="mr-1 h-4 w-4" />Tambah salat</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Salat</TableHead><TableHead>Waktu</TableHead><TableHead>Batas tepat waktu</TableHead><TableHead>Hari</TableHead><TableHead>Sumber absen</TableHead><TableHead>Aktif</TableHead><TableHead className="w-24" />
            </TableRow></TableHeader>
            <TableBody>
              {types.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Belum ada salat. Klik "Tambah salat" (mis. Dzuhur 12:00–12:30).</TableCell></TableRow>
              ) : types.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{hhmm(t.start_time)} – {hhmm(t.end_time)}</TableCell>
                  <TableCell>{t.late_after ? hhmm(t.late_after) : "-"}</TableCell>
                  <TableCell>{daysText(t.days_of_week)}</TableCell>
                  <TableCell>{t.source === "rfid" ? "Kartu RFID" : `Fingerprint · ${devName(t.device_sn)}`}</TableCell>
                  <TableCell><Switch checked={t.is_active} onCheckedChange={() => toggle.mutate(t)} /></TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setForm({ id: t.id, name: t.name, start_time: hhmm(t.start_time), end_time: hhmm(t.end_time), late_after: t.late_after ? hhmm(t.late_after) : "", source: t.source, device_sn: t.device_sn ?? "", days: t.days_of_week, sort_order: t.sort_order, is_active: t.is_active })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDel(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Cara siswa absen</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><b className="text-foreground">Kartu RFID:</b> buka halaman tap salat di komputer/tablet dekat tempat salat, lalu siswa menempelkan kartu pada jam salat.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">{tapUrl}</code>
            <Button size="sm" variant="outline" onClick={() => window.open("/absensi-salat", "_blank")}><ExternalLink className="mr-1 h-4 w-4" />Buka</Button>
          </div>
          <p><b className="text-foreground">Mesin fingerprint:</b> pilih mesin yang dipasang di tempat salat. Ketukan siswa pada mesin itu <i>dalam jam salat</i> dicatat sebagai absen salat, bukan absen sekolah. Sebaiknya pakai mesin khusus atau pastikan jam salat tidak berimpit dengan jam absen masuk/pulang sekolah.</p>
          <p>Siswa hanya tercatat sekali per salat per hari. Siswa harus sudah terdaftar kartu/PIN-nya di data siswa.</p>
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form?.id ? "Ubah Salat" : "Tambah Salat"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label>Nama salat</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dzuhur / Dhuha / Jumat" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Mulai</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
                <div><Label>Selesai</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
                <div><Label>Terlambat setelah</Label><Input type="time" value={form.late_after} onChange={(e) => setForm({ ...form, late_after: e.target.value })} /></div>
              </div>
              <div>
                <Label>Hari berlaku</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {DAYS.map((d) => {
                    const on = form.days.includes(d.n);
                    return <Button key={d.n} type="button" size="sm" variant={on ? "default" : "outline"} onClick={() => setForm({ ...form, days: on ? form.days.filter((x) => x !== d.n) : [...form.days, d.n] })}>{d.label}</Button>;
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Sumber absen</Label>
                  <select className={`${SELECT_CLS} w-full`} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as any })}>
                    <option value="rfid">Kartu RFID</option><option value="fingerprint">Mesin fingerprint</option>
                  </select></div>
                {form.source === "fingerprint" && (
                  <div><Label>Mesin</Label>
                    <select className={`${SELECT_CLS} w-full`} value={form.device_sn} onChange={(e) => setForm({ ...form, device_sn: e.target.value })}>
                      <option value="">Pilih mesin…</option>
                      {devices.map((d) => <option key={d.serial_number} value={d.serial_number}>{d.name || "Mesin"} · {d.serial_number}{d.is_active ? "" : " (nonaktif)"}</option>)}
                    </select></div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Urutan tampil</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} /></div>
                <div className="flex items-end gap-2 pb-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Aktif</Label></div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Batal</Button><Button disabled={save.isPending} onClick={() => form && save.mutate(form)}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus salat {del?.name}?</AlertDialogTitle><AlertDialogDescription>Hanya bisa jika belum ada data absensinya. Jika sudah ada, nonaktifkan saja.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => del && remove.mutate(del.id)}>Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */
function PrayerPage() {
  const { userRole } = useAuth();
  const canManage = !!userRole && MANAGE_ROLES.includes(userRole);
  const { types, classes, school } = useRefs();
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Absensi Salat</h1>
          <p className="text-sm text-muted-foreground">Kelola jadwal salat, pantau log kehadiran, dan cetak rekap.</p>
        </div>
        <Tabs defaultValue="log">
          <TabsList>
            <TabsTrigger value="log">Log</TabsTrigger>
            <TabsTrigger value="recap">Rekap</TabsTrigger>
            {canManage && <TabsTrigger value="manage">Kelola Salat</TabsTrigger>}
          </TabsList>
          <TabsContent value="log"><LogTab types={types} classes={classes} school={school} canManage={canManage || userRole === "guru_piket"} /></TabsContent>
          <TabsContent value="recap"><RecapTab types={types} classes={classes} school={school} /></TabsContent>
          {canManage && <TabsContent value="manage"><ManageTab types={types} /></TabsContent>}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

export default function PrayerAttendance() {
  return (
    <ProtectedRoute allowedRoles={["admin", "kesiswaan", "guru_piket", "teacher", "super_admin"]}>
      <PrayerPage />
    </ProtectedRoute>
  );
}
