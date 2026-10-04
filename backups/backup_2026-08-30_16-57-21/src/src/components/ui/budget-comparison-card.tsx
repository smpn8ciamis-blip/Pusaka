import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  Eye, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  Layers,
  Hash,
  ChevronRight
} from "lucide-react";

interface ComparisonItemData {
  code: string;
  name: string;
  subProgram?: string;
  rkas: number;
  spj: number;
  selisih: number;
  persentase: number;
}

interface BudgetComparisonCardProps {
  item: ComparisonItemData;
  index: number;
  type: "kegiatan" | "rekening";
  formatCurrency: (value: number) => string;
  onViewDetail?: (item: ComparisonItemData) => void;
}

const getStatusConfig = (persentase: number) => {
  if (persentase > 100) {
    return {
      label: "Melebihi",
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/30",
      icon: AlertTriangle,
      progressColor: "bg-gradient-to-r from-rose-500 to-red-400",
    };
  }
  if (persentase > 80) {
    return {
      label: "Hampir Tercapai",
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      icon: Clock,
      progressColor: "bg-gradient-to-r from-amber-500 to-orange-400",
    };
  }
  if (persentase > 50) {
    return {
      label: "Sedang",
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      icon: TrendingUp,
      progressColor: "bg-gradient-to-r from-blue-500 to-cyan-400",
    };
  }
  return {
    label: "Rendah",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: CheckCircle2,
    progressColor: "bg-gradient-to-r from-emerald-500 to-teal-400",
  };
};

export function BudgetComparisonCard({
  item,
  index,
  type,
  formatCurrency,
  onViewDetail,
}: BudgetComparisonCardProps) {
  const status = getStatusConfig(item.persentase);
  const StatusIcon = status.icon;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border p-4",
        "bg-gradient-to-br from-background to-muted/20",
        "transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
        status.border
      )}
    >
      {/* Top accent */}
      <div className={cn("absolute top-0 left-0 w-full h-1", status.progressColor)} />

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-lg", status.bg)}>
            {type === "kegiatan" ? (
              <Layers className={cn("h-4 w-4", status.color)} />
            ) : (
              <Hash className={cn("h-4 w-4", status.color)} />
            )}
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {item.code}
          </Badge>
        </div>
        <div className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium", status.bg, status.color)}>
          <StatusIcon className="h-3 w-3" />
          <span>{status.label}</span>
        </div>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-foreground text-sm leading-tight mb-1 line-clamp-2">
        {item.name}
      </h3>
      {item.subProgram && (
        <p className="text-xs text-muted-foreground line-clamp-1 mb-3">
          {item.subProgram}
        </p>
      )}

      {/* Progress Section */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Realisasi</span>
          <span className={cn("font-bold", status.color)}>
            {item.persentase.toFixed(1)}%
          </span>
        </div>
        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", status.progressColor)}
            style={{ width: `${Math.min(item.persentase, 100)}%` }}
          />
          {item.persentase > 100 && (
            <div 
              className="absolute top-0 right-0 h-full bg-rose-500/50 animate-pulse"
              style={{ width: `${Math.min(item.persentase - 100, 50)}%` }}
            />
          )}
        </div>
      </div>

      {/* Values Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center p-2 rounded-lg bg-primary/5 border border-primary/10">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">RKAS</p>
          <p className="text-xs font-bold text-primary">{formatCurrency(item.rkas)}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-chart-2/5 border border-chart-2/10">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">SPJ</p>
          <p className="text-xs font-bold text-chart-2">{formatCurrency(item.spj)}</p>
        </div>
        <div className={cn(
          "text-center p-2 rounded-lg border",
          item.selisih >= 0 ? "bg-emerald-500/5 border-emerald-500/10" : "bg-rose-500/5 border-rose-500/10"
        )}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Selisih</p>
          <p className={cn(
            "text-xs font-bold",
            item.selisih >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
          )}>
            {item.selisih >= 0 ? "+" : ""}{formatCurrency(item.selisih)}
          </p>
        </div>
      </div>

      {/* Action Button */}
      {onViewDetail && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onViewDetail(item)}
        >
          <Eye className="h-4 w-4" />
          Lihat Detail
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

interface BudgetComparisonSectionProps {
  title: string;
  icon: React.ReactNode;
  items: ComparisonItemData[];
  type: "kegiatan" | "rekening";
  formatCurrency: (value: number) => string;
  onViewDetail?: (item: ComparisonItemData, type: "kode_kegiatan" | "kode_rekening") => void;
}

export function BudgetComparisonSection({
  title,
  icon,
  items,
  type,
  formatCurrency,
  onViewDetail,
}: BudgetComparisonSectionProps) {
  if (items.length === 0) return null;

  const totals = items.reduce(
    (acc, item) => ({
      rkas: acc.rkas + item.rkas,
      spj: acc.spj + item.spj,
      selisih: acc.selisih + item.selisih,
    }),
    { rkas: 0, spj: 0, selisih: 0 }
  );

  const avgPersentase = totals.rkas > 0 ? (totals.spj / totals.rkas) * 100 : 0;
  const overBudgetCount = items.filter(i => i.persentase > 100).length;
  const nearTargetCount = items.filter(i => i.persentase > 80 && i.persentase <= 100).length;
  const onTrackCount = items.filter(i => i.persentase <= 80).length;

  return (
    <div className="space-y-4">
      {/* Header with Summary */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-gradient-to-r from-muted/50 to-muted/30 border">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{items.length} item ditemukan</p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <span className="text-sm font-medium text-rose-600 dark:text-rose-400">{overBudgetCount} Melebihi</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">{nearTargetCount} Hampir</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{onTrackCount} Aman</span>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map((item, index) => (
          <BudgetComparisonCard
            key={item.code}
            item={item}
            index={index}
            type={type}
            formatCurrency={formatCurrency}
            onViewDetail={onViewDetail ? (i) => onViewDetail(i, type === "kegiatan" ? "kode_kegiatan" : "kode_rekening") : undefined}
          />
        ))}
      </div>

      {/* Totals Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
        <div className="text-center md:text-left">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total RKAS</p>
          <p className="text-xl font-bold text-primary">{formatCurrency(totals.rkas)}</p>
        </div>
        <div className="text-center md:text-left">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total SPJ</p>
          <p className="text-xl font-bold text-chart-2">{formatCurrency(totals.spj)}</p>
        </div>
        <div className="text-center md:text-left">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Selisih</p>
          <p className={cn(
            "text-xl font-bold",
            totals.selisih >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
          )}>
            {totals.selisih >= 0 ? "+" : ""}{formatCurrency(totals.selisih)}
          </p>
        </div>
        <div className="text-center md:text-left">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Realisasi Rata-rata</p>
          <div className="flex items-center gap-2">
            <p className={cn(
              "text-xl font-bold",
              avgPersentase > 100 ? "text-rose-600 dark:text-rose-400" : 
              avgPersentase > 80 ? "text-amber-600 dark:text-amber-400" : 
              "text-emerald-600 dark:text-emerald-400"
            )}>
              {avgPersentase.toFixed(1)}%
            </p>
            {avgPersentase > 100 ? (
              <TrendingUp className="h-5 w-5 text-rose-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-emerald-500" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Unbudgeted expenses component
interface UnbudgetedExpenseProps {
  items: Array<{
    code: string;
    name: string;
    subProgram?: string;
    spj: number;
  }>;
  type: "kegiatan" | "rekening";
  formatCurrency: (value: number) => string;
}

export function UnbudgetedExpenseSection({
  items,
  type,
  formatCurrency,
}: UnbudgetedExpenseProps) {
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.spj, 0);

  return (
    <div className="space-y-4 p-4 rounded-xl border-2 border-dashed border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h3 className="font-semibold text-amber-700 dark:text-amber-300">
            Realisasi Tanpa Anggaran ({type === "kegiatan" ? "Kode Kegiatan" : "Kode Rekening"})
          </h3>
          <p className="text-sm text-muted-foreground">
            {items.length} item tidak ditemukan di data RKAS
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item, index) => (
          <div
            key={item.code}
            className="p-3 rounded-lg bg-background border border-amber-500/20 hover:border-amber-500/40 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono text-xs border-amber-500/30 text-amber-600 dark:text-amber-400">
                {item.code}
              </Badge>
            </div>
            <p className="text-sm font-medium line-clamp-2 mb-1">{item.name}</p>
            {item.subProgram && (
              <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{item.subProgram}</p>
            )}
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(item.spj)}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <span className="font-medium text-amber-700 dark:text-amber-300">Total Tanpa Anggaran</span>
        <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
