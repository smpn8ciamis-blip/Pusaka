import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  HardHat, Moon, CalendarDays, Users, FileText, Trophy, 
  ChevronRight, Wallet, TrendingUp, Receipt
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface PenggajianMenu {
  path: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const PENGGajian_MENUS: PenggajianMenu[] = [
  {
    path: "/worker-payments",
    label: "Upah Tukang",
    description: "Pembayaran harian pekerja",
    icon: HardHat,
    color: "text-orange-600",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
  },
  {
    path: "/night-shift-payments",
    label: "Piket Malam",
    description: "Honor petugas shift malam",
    icon: Moon,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50 dark:bg-indigo-950/30",
  },
  {
    path: "/weekend-shift-payments",
    label: "Piket Sabtu Minggu",
    description: "Honor petugas weekend",
    icon: CalendarDays,
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
  },
  {
    path: "/gtt-ptt-honorarium",
    label: "Honorarium GTT/PTT",
    description: "Honor guru tidak tetap",
    icon: Users,
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    path: "/narasumber-honorarium",
    label: "Kwitansi Narasumber",
    description: "Honor narasumber kegiatan",
    icon: FileText,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    path: "/extracurricular-honorarium",
    label: "Honorarium Eskul",
    description: "Honor pembina ekstrakurikuler",
    icon: Trophy,
    color: "text-amber-600",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
  },
];

interface TataUsahaPenggajianCardsProps {
  startDate?: Date;
  endDate?: Date;
}

export function TataUsahaPenggajianCards({ startDate, endDate }: TataUsahaPenggajianCardsProps) {
  const navigate = useNavigate();

  // Fetch ringkasan penggajian dalam periode terpilih
  const { data: summary, isLoading } = useQuery({
    queryKey: [
      "tata-usaha-penggajian-summary",
      startDate?.toISOString(),
      endDate?.toISOString(),
    ],
    queryFn: async () => {
      const startStr = startDate ? format(startDate, "yyyy-MM-dd") : null;
      const endStr = endDate ? format(endDate, "yyyy-MM-dd") : null;

      // Helper untuk count + sum dari tabel honorarium tunggal
      const buildHonorQuery = (table: string) => {
        let q = supabase.from(table).select("net_amount, receipt_date");
        if (startStr) q = q.gte("receipt_date", startStr);
        if (endStr) q = q.lte("receipt_date", endStr);
        return q;
      };

      // Tabel batch (worker, night, weekend)
      const buildBatchQuery = (table: string) => {
        let q = supabase.from(table).select("total_net, receipt_date");
        if (startStr) q = q.gte("receipt_date", startStr);
        if (endStr) q = q.lte("receipt_date", endStr);
        return q;
      };

      const [
        workerResult,
        nightResult,
        weekendResult,
        gttResult,
        narasumberResult,
        eskulResult,
      ] = await Promise.all([
        buildBatchQuery("worker_payment_batches"),
        buildBatchQuery("night_shift_batches"),
        buildBatchQuery("weekend_shift_batches"),
        buildHonorQuery("gtt_ptt_honorariums"),
        buildHonorQuery("narasumber_honorariums"),
        buildHonorQuery("extracurricular_honorariums"),
      ]);

      // Cek error
      const results = [workerResult, nightResult, weekendResult, gttResult, narasumberResult, eskulResult];
      for (const r of results) {
        if (r.error) throw r.error;
      }

      const sumNet = (data: any[] | null) =>
        data?.reduce((sum, r) => sum + Number(r.total_net || r.net_amount || 0), 0) || 0;

      return {
        worker: {
          count: workerResult.data?.length || 0,
          total: sumNet(workerResult.data),
        },
        night: {
          count: nightResult.data?.length || 0,
          total: sumNet(nightResult.data),
        },
        weekend: {
          count: weekendResult.data?.length || 0,
          total: sumNet(weekendResult.data),
        },
        gtt: {
          count: gttResult.data?.length || 0,
          total: sumNet(gttResult.data),
        },
        narasumber: {
          count: narasumberResult.data?.length || 0,
          total: sumNet(narasumberResult.data),
        },
        eskul: {
          count: eskulResult.data?.length || 0,
          total: sumNet(eskulResult.data),
        },
      };
    },
  });

  const totalKeseluruhan = summary
    ? Object.values(summary).reduce((sum, item) => sum + item.total, 0)
    : 0;

  const formatRupiah = (value: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const getSummaryForPath = (path: string) => {
    if (!summary) return { count: 0, total: 0 };
    if (path === "/worker-payments") return summary.worker;
    if (path === "/night-shift-payments") return summary.night;
    if (path === "/weekend-shift-payments") return summary.weekend;
    if (path === "/gtt-ptt-honorarium") return summary.gtt;
    if (path === "/narasumber-honorarium") return summary.narasumber;
    if (path === "/extracurricular-honorarium") return summary.eskul;
    return { count: 0, total: 0 };
  };

  return (
    <div className="space-y-4">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Penggajian & Honorarium
          </h2>
          <p className="text-sm text-muted-foreground">
            Kelola pembayaran upah, honor, dan kwitansi
          </p>
        </div>
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Periode Ini</p>
              <p className="text-lg font-bold text-foreground">
                {isLoading ? "..." : formatRupiah(totalKeseluruhan)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Menu Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PENGGajian_MENUS.map((menu) => {
          const Icon = menu.icon;
          const stat = getSummaryForPath(menu.path);

          return (
            <Card
              key={menu.path}
              className={cn(
                "cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] group",
                "border-border/50"
              )}
              onClick={() => navigate(menu.path)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className={cn("p-3 rounded-xl", menu.bgColor)}>
                    <Icon className={cn("h-6 w-6", menu.color)} />
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <CardTitle className="text-base">{menu.label}</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {menu.description}
                  </CardDescription>
                </div>

                {isLoading ? (
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <Badge variant="secondary" className="text-xs">
                      {stat.count} transaksi
                    </Badge>
                    <span className="text-sm font-semibold text-foreground">
                      {formatRupiah(stat.total)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
