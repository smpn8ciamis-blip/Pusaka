import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fingerprint, Moon, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  PiketCfg, PiketDuty, PiketPunch, DEFAULT_CFG, SHIFT_LABEL, STATUS_LABEL, autoRemark, bulanLabel, hariLabel,
  jamWIB, monthRange, recordedPunches, toISODate, verifyLabel,
} from "@/lib/piket";

function MyPiketPage() {
  const [ym, setYm] = useState(() => toISODate(new Date()).slice(0, 7));
  const { from, to } = useMemo(() => monthRange(ym), [ym]);

  const { data: duties = [], isLoading } = useQuery({
    queryKey: ["my-piket-duties", ym],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("piket_duties" as any).select("*").gte("duty_date", from).lte("duty_date", to).order("duty_date", { ascending: false });
      if (error) throw error;
      return (data as any[]) as PiketDuty[];
    },
  });

  const { data: punches = new Map<string, PiketPunch[]>() } = useQuery({
    queryKey: ["my-piket-punches", ym],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_piket_punches" as any, { p_from: from, p_to: to });
      if (error) throw error;
      const m = new Map<string, PiketPunch[]>();
      ((data as any[]) as PiketPunch[]).forEach((p) => m.set(p.duty_id, [...(m.get(p.duty_id) ?? []), p]));
      return m;
    },
  });

  const { data: cfg = DEFAULT_CFG } = useQuery({
    queryKey: ["piket-cfg"],
    queryFn: async () => {
      const { data } = await supabase.from("piket_settings" as any).select("*").eq("id", 1).maybeSingle();
      return ({ ...DEFAULT_CFG, ...((data as any) ?? {}) }) as PiketCfg;
    },
  });

  const hadir = duties.filter((d) => d.status === "hadir").length;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Log Piket Saya</h1>
            <p className="text-sm text-muted-foreground">Riwayat absensi piket malam dan piket Sabtu–Minggu Anda, dari data fingerprint.</p>
          </div>
          <div><Label className="text-xs">Bulan</Label><Input type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} className="w-40" /></div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{bulanLabel(ym)}</CardTitle>
            <CardDescription>{duties.length} jadwal piket · {hadir} hadir</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Memuat…</p>
            ) : duties.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada jadwal piket pada bulan ini.</p>
            ) : duties.map((d) => {
              const rec = recordedPunches(d, punches.get(d.id));
              const remark = [autoRemark(d, cfg), d.notes].filter(Boolean).join(" - ");
              const Icon = d.shift_type === "malam" ? Moon : CalendarDays;
              return (
                <div key={d.id} className="space-y-2 rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {hariLabel(d.duty_date)}, {d.duty_date.split("-").reverse().join("/")}
                      <span className="text-xs font-normal text-muted-foreground">{SHIFT_LABEL[d.shift_type]}</span>
                    </div>
                    <Badge variant={d.status === "hadir" ? "default" : d.status === "tidak_hadir" ? "destructive" : "outline"}>{STATUS_LABEL[d.status]}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {rec.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {d.source === "manual" && d.status === "hadir"
                          ? `Dicatat manual · Datang ${jamWIB(d.check_in_at)} · Pulang ${jamWIB(d.check_out_at)}`
                          : "Belum ada ketukan tercatat"}
                      </span>
                    ) : rec.map((x) => (
                      <Badge key={x.label} variant="outline" className="gap-1 font-normal" title={`Mesin ${x.punch.device_sn}`}>
                        <Fingerprint className="h-3 w-3" />
                        <span className="text-muted-foreground">{x.label}</span>
                        <span className="font-mono">{jamWIB(x.punch.punched_at)}</span>
                        <span>{verifyLabel(x.punch.verify_type)}</span>
                      </Badge>
                    ))}
                  </div>
                  {remark && <div className="text-xs text-muted-foreground">Keterangan: {remark}</div>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function MyPiket() {
  return <ProtectedRoute allowedRoles={["teacher", "staf"]}><MyPiketPage /></ProtectedRoute>;
}
