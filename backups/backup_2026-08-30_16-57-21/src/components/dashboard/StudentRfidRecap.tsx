import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { ScanLine, LogIn, LogOut } from "lucide-react";

const statusColor: Record<string, string> = {
  hadir: "bg-emerald-500 text-white",
  terlambat: "bg-amber-500 text-white",
  izin: "bg-sky-500 text-white",
  sakit: "bg-violet-500 text-white",
  alpa: "bg-destructive text-destructive-foreground",
};

const jam = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }) : "-";

export const StudentRfidRecap = ({
  studentId,
  period,
}: {
  studentId?: string;
  period?: { year: string; semester: number; start: string; end: string };
}) => {
  const { data, isLoading } = useQuery({
    queryKey: ["student-rfid-recap", studentId, period?.year, period?.semester],
    queryFn: async () => {
      if (!studentId) return [];
      let q = supabase
        .from("rfid_attendance")
        .select("*")
        .eq("student_id", studentId);
      if (period) q = q.gte("date", period.start).lte("date", period.end);
      const { data, error } = await q.order("date", { ascending: false }).limit(200);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!studentId,
  });

  const rows = data ?? [];
  const count = (s: string) => rows.filter((d) => String(d.status).toLowerCase() === s).length;

  const terlambat = count("terlambat");
  // siswa terlambat tetap dihitung hadir
  const hadir = count("hadir") + terlambat;
  const izin = count("izin");
  const sakit = count("sakit");
  const alpa = count("alpa");
  const totalHari = rows.length;
  const persen = totalHari > 0 ? Math.round((hadir / totalHari) * 100) : 0;

  const stats = [
    { label: "Hadir", value: hadir },
    { label: "Tepat Waktu", value: hadir - terlambat },
    { label: "Terlambat", value: terlambat },
    { label: "Izin", value: izin },
    { label: "Sakit", value: sakit },
    { label: "Alpa", value: alpa },
  ];

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <ScanLine className="h-4 w-4 text-primary" />
          </div>
          Rekap Absensi Kartu RFID
        </CardTitle>
        <CardDescription>
          {totalHari} hari tercatat
          {period ? ` • ${period.year} semester ${period.semester}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border/50 p-3 text-center">
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border/50 p-3 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Persentase Kehadiran (dari {totalHari} hari tercatat)</span>
            <span className="font-bold">{persen}%</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${persen}%` }} />
          </div>
        </div>


        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Memuat…</div>
        ) : data && data.length > 0 ? (
          <div className="space-y-2">
            {data.map((r) => (
              <div key={r.id} className="p-3 rounded-xl border border-border/50 bg-card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">
                    {format(new Date(r.date), "EEEE, dd MMMM yyyy", { locale: localeId })}
                  </p>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><LogIn className="h-3 w-3" /> {jam(r.check_in_at)}</span>
                    <span className="flex items-center gap-1"><LogOut className="h-3 w-3" /> {jam(r.check_out_at)}</span>
                  </div>
                  {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                </div>
                <Badge className={`capitalize shrink-0 ${statusColor[r.status] ?? ""}`}>{r.status}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <ScanLine className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="font-medium">Belum ada catatan absensi RFID</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
