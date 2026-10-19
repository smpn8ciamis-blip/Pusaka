import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  PiketCfg, PiketDuty, PiketPunch, PiketShift, PiketUnscheduled, DEFAULT_CFG, SHIFT_LABEL,
  hariLabel, jamWIB, keteranganText, recordedRows, toISODate,
} from "@/lib/piket";

interface LogRow { key: string; date: string; datang: string; pulang: string; ket: string }
type SortKey = "date" | "datang" | "pulang" | "ket";
type KetFilter = "semua" | "normal" | "terlambat" | "pulang_awal" | "lainnya";

const tglLabel = (iso: string) => `${hariLabel(iso)}, ${iso.split("-").reverse().join("/")}`;
const ketCategory = (k: string): KetFilter =>
  !k ? "normal" : k.includes("Terlambat") ? "terlambat" : k.includes("Pulang Sebelum") ? "pulang_awal" : "lainnya";

function ShiftLog({ shift, from, to, cfg }: { shift: PiketShift; from: string; to: string; cfg: PiketCfg }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [ket, setKet] = useState<KetFilter>("semua");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const { data: duties = [], isLoading } = useQuery({
    queryKey: ["my-piket-duties", shift, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piket_duties" as any).select("*").eq("shift_type", shift).gte("duty_date", from).lte("duty_date", to);
      if (error) throw error;
      return (data as any[]) as PiketDuty[];
    },
  });
  const { data: unsched = [] } = useQuery({
    queryKey: ["my-piket-unscheduled", shift, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piket_unscheduled" as any).select("*").eq("shift_type", shift).gte("duty_date", from).lte("duty_date", to);
      if (error) return [] as PiketUnscheduled[];
      return (data as any[]) as PiketUnscheduled[];
    },
  });
  const { data: punches = new Map<string, PiketPunch[]>() } = useQuery({
    queryKey: ["my-piket-punches", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_piket_punches" as any, { p_from: from, p_to: to });
      if (error) throw error;
      const m = new Map<string, PiketPunch[]>();
      ((data as any[]) as PiketPunch[]).forEach((p) => m.set(p.duty_id, [...(m.get(p.duty_id) ?? []), p]));
      return m;
    },
  });

  // Hanya log absen: jadwal yang belum ada ketukan tidak ditampilkan
  const rows = useMemo<LogRow[]>(() => {
    const a: LogRow[] = recordedRows(duties).map((d) => ({
      key: d.id, date: d.duty_date, datang: jamWIB(d.check_in_at), pulang: jamWIB(d.check_out_at), ket: keteranganText(d, punches.get(d.id), cfg),
    }));
    const b: LogRow[] = unsched.filter((u) => u.status !== "dihitung").map((u) => ({
      key: `u-${u.id}`, date: u.duty_date, datang: jamWIB(u.check_in_at), pulang: jamWIB(u.check_out_at),
      ket: u.status === "menunggu" ? "Absen tanpa jadwal - menunggu konfirmasi" : "Absen tanpa jadwal - tidak dihitung",
    }));
    return [...a, ...b];
  }, [duties, unsched, punches, cfg]);

  const filtered = useMemo(() => rows.filter((r) => ket === "semua" || ketCategory(r.ket) === ket), [rows, ket]);
  const ordered = useMemo(() => {
    const m = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((x, y) => {
      const c = sort.key === "date" ? x.date.localeCompare(y.date)
        : sort.key === "ket" ? x.ket.localeCompare(y.ket)
        : (x[sort.key] === "-" ? "99:99" : x[sort.key]).localeCompare(y[sort.key] === "-" ? "99:99" : y[sort.key]);
      return (c || x.date.localeCompare(y.date)) * m;
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(ordered.length / pageSize));
  useEffect(() => { setPage(1); }, [ket, pageSize, from, to, shift]);
  const cur = Math.min(page, totalPages);
  const view = ordered.slice((cur - 1) * pageSize, cur * pageSize);

  const head = (key: SortKey, label: string) => (
    <TableHead>
      <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }))}>
        {label}
        {sort.key !== key ? <ArrowUpDown className="h-3 w-3 opacity-50" /> : sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      </button>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Log {SHIFT_LABEL[shift]}</CardTitle>
        <CardDescription>{filtered.length} log absen{ket !== "semua" ? " (terfilter)" : ""}</CardDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          <span>Keterangan</span>
          <select className="h-8 rounded-md border bg-background px-2" value={ket} onChange={(e) => setKet(e.target.value as KetFilter)}>
            <option value="semua">Semua</option>
            <option value="normal">Tanpa keterangan</option>
            <option value="terlambat">Terlambat</option>
            <option value="pulang_awal">Pulang Sebelum Waktunya</option>
            <option value="lainnya">Lainnya</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No</TableHead>
              {head("date", "Hari / Tanggal")}
              {head("datang", "Jam Datang")}
              {head("pulang", "Jam Pulang")}
              {head("ket", "Keterangan")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Memuat…</TableCell></TableRow>
            ) : view.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Belum ada log absen pada periode ini.</TableCell></TableRow>
            ) : view.map((r, i) => (
              <TableRow key={r.key}>
                <TableCell>{(cur - 1) * pageSize + i + 1}</TableCell>
                <TableCell className="whitespace-nowrap">{tglLabel(r.date)}</TableCell>
                <TableCell className="font-mono">{r.datang}</TableCell>
                <TableCell className="font-mono">{r.pulang}</TableCell>
                <TableCell>{r.ket || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm">
          <span className="text-muted-foreground">
            {ordered.length === 0 ? "0 data" : `${(cur - 1) * pageSize + 1}–${Math.min(cur * pageSize, ordered.length)} dari ${ordered.length}`}
          </span>
          <div className="flex items-center gap-2">
            <select className="h-8 rounded-md border bg-background px-2" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[10, 20, 50].map((n) => <option key={n} value={n}>{n} / halaman</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>‹</Button>
            <span>{cur} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={cur >= totalPages} onClick={() => setPage(cur + 1)}>›</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MyPiketPage() {
  const today = new Date();
  const [from, setFrom] = useState(() => toISODate(new Date(today.getFullYear(), today.getMonth() - 2, 1)));
  const [to, setTo] = useState(() => toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0)));

  const { data: cfg = DEFAULT_CFG } = useQuery({
    queryKey: ["piket-cfg"],
    queryFn: async () => {
      const { data } = await supabase.from("piket_settings" as any).select("*").eq("id", 1).maybeSingle();
      return ({ ...DEFAULT_CFG, ...((data as any) ?? {}) }) as PiketCfg;
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Log Piket Saya</h1>
            <p className="text-sm text-muted-foreground">Riwayat absen piket Anda dari data fingerprint.</p>
          </div>
          <div className="flex items-end gap-2">
            <div><Label className="text-xs">Dari</Label><Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-40" /></div>
            <div><Label className="text-xs">Sampai</Label><Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-40" /></div>
          </div>
        </div>

        <Tabs defaultValue="malam">
          <TabsList>
            <TabsTrigger value="malam">Piket Malam</TabsTrigger>
            <TabsTrigger value="sabtu_minggu">Piket Sabtu–Minggu</TabsTrigger>
          </TabsList>
          <TabsContent value="malam"><ShiftLog shift="malam" from={from} to={to} cfg={cfg} /></TabsContent>
          <TabsContent value="sabtu_minggu"><ShiftLog shift="sabtu_minggu" from={from} to={to} cfg={cfg} /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

export default function MyPiket() {
  return <ProtectedRoute allowedRoles={["teacher", "staf"]}><MyPiketPage /></ProtectedRoute>;
}
