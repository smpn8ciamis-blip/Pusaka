import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, ChevronRight, Layers, Hash, Minus } from "lucide-react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeColor?: string;
  fillColor?: string;
  className?: string;
}

function Sparkline({ 
  data, 
  width = 80, 
  height = 24, 
  strokeColor = "currentColor",
  fillColor,
  className 
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className={cn("overflow-visible", className)}>
      {fillColor && (
        <polygon
          points={areaPoints}
          fill={fillColor}
          opacity={0.2}
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={(data.length - 1) / (data.length - 1) * width}
        cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
        r={2}
        fill={strokeColor}
      />
    </svg>
  );
}

interface BudgetStatisticsCardProps {
  kode: string;
  name?: string;
  subProgram?: string;
  total: number;
  count: number;
  months?: number[];
  monthlyData?: { month: number; amount: number }[];
  maxTotal: number;
  index: number;
  onClick?: () => void;
  formatCurrency: (value: number) => string;
  monthLabels?: { value: number; label: string }[];
  type?: "program" | "rekening";
  activities?: string[];
}

const GRADIENT_COLORS = [
  { from: "from-blue-500", to: "to-cyan-400", bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-600 dark:text-blue-400", stroke: "#3b82f6", fill: "#3b82f6" },
  { from: "from-violet-500", to: "to-purple-400", bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-600 dark:text-violet-400", stroke: "#8b5cf6", fill: "#8b5cf6" },
  { from: "from-emerald-500", to: "to-teal-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", stroke: "#10b981", fill: "#10b981" },
  { from: "from-orange-500", to: "to-amber-400", bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-600 dark:text-orange-400", stroke: "#f97316", fill: "#f97316" },
  { from: "from-pink-500", to: "to-rose-400", bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-600 dark:text-pink-400", stroke: "#ec4899", fill: "#ec4899" },
  { from: "from-indigo-500", to: "to-blue-400", bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-600 dark:text-indigo-400", stroke: "#6366f1", fill: "#6366f1" },
  { from: "from-cyan-500", to: "to-sky-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-600 dark:text-cyan-400", stroke: "#06b6d4", fill: "#06b6d4" },
  { from: "from-fuchsia-500", to: "to-pink-400", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/30", text: "text-fuchsia-600 dark:text-fuchsia-400", stroke: "#d946ef", fill: "#d946ef" },
];

export function BudgetStatisticsCard({
  kode,
  name,
  subProgram,
  total,
  count,
  months,
  monthlyData,
  maxTotal,
  index,
  onClick,
  formatCurrency,
  monthLabels,
  type = "program",
  activities,
}: BudgetStatisticsCardProps) {
  const colorScheme = GRADIENT_COLORS[index % GRADIENT_COLORS.length];
  const progressPercent = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

  // Calculate trend from monthly data
  const getTrend = () => {
    if (!monthlyData || monthlyData.length < 2) return { direction: "neutral", percent: 0 };
    const sortedData = [...monthlyData].sort((a, b) => a.month - b.month);
    const lastTwo = sortedData.slice(-2);
    if (lastTwo.length < 2) return { direction: "neutral", percent: 0 };
    const prev = lastTwo[0].amount;
    const curr = lastTwo[1].amount;
    if (prev === 0) return { direction: curr > 0 ? "up" : "neutral", percent: 100 };
    const change = ((curr - prev) / prev) * 100;
    return {
      direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
      percent: Math.abs(change).toFixed(0)
    };
  };

  const trend = getTrend();
  const sparklineData = monthlyData?.sort((a, b) => a.month - b.month).map(d => d.amount) || [];

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border p-4 cursor-pointer",
        "transition-all duration-300 ease-out",
        "hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1",
        "bg-gradient-to-br from-background to-muted/30",
        colorScheme.border
      )}
    >
      {/* Gradient accent bar */}
      <div
        className={cn(
          "absolute top-0 left-0 w-full h-1 bg-gradient-to-r",
          colorScheme.from,
          colorScheme.to
        )}
      />

      {/* Icon badge */}
      <div className="flex items-start justify-between mb-3">
        <div className={cn("p-2 rounded-lg", colorScheme.bg)}>
          {type === "program" ? (
            <Layers className={cn("h-4 w-4", colorScheme.text)} />
          ) : (
            <Hash className={cn("h-4 w-4", colorScheme.text)} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            {count} item
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Kode badge */}
      <Badge
        variant="outline"
        className={cn(
          "font-mono text-xs mb-2 bg-background/50",
          colorScheme.border
        )}
      >
        {kode}
      </Badge>

      {/* Title */}
      {name && (
        <h3 className="font-semibold text-foreground leading-tight mb-1 line-clamp-2">
          {name}
        </h3>
      )}

      {/* Sub program */}
      {subProgram && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {subProgram}
        </p>
      )}

      {/* Activities (for rekening type) */}
      {type === "rekening" && activities && activities.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-muted-foreground mb-1">Kegiatan:</p>
          <div className="space-y-0.5">
            {activities.slice(0, 2).map((activity, idx) => (
              <p key={idx} className="text-xs text-foreground/80 truncate">
                • {activity}
              </p>
            ))}
            {activities.length > 2 && (
              <p className="text-xs text-muted-foreground">
                +{activities.length - 2} lainnya
              </p>
            )}
          </div>
        </div>
      )}

      {/* Months */}
      {months && months.length > 0 && monthLabels && (
        <div className="flex flex-wrap gap-1 mb-3">
          {months.slice(0, 3).map((m) => (
            <Badge
              key={m}
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-5"
            >
              {monthLabels[m - 1]?.label?.substring(0, 3)}
            </Badge>
          ))}
          {months.length > 3 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
              +{months.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Sparkline and Trend */}
      {sparklineData.length >= 2 && (
        <div className="flex items-center justify-between mb-3 p-2 rounded-lg bg-muted/30">
          <Sparkline 
            data={sparklineData} 
            width={70} 
            height={24} 
            strokeColor={colorScheme.stroke}
            fillColor={colorScheme.fill}
          />
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium",
            trend.direction === "up" && "text-emerald-600 dark:text-emerald-400",
            trend.direction === "down" && "text-rose-600 dark:text-rose-400",
            trend.direction === "neutral" && "text-muted-foreground"
          )}>
            {trend.direction === "up" && <TrendingUp className="h-3 w-3" />}
            {trend.direction === "down" && <TrendingDown className="h-3 w-3" />}
            {trend.direction === "neutral" && <Minus className="h-3 w-3" />}
            <span>{trend.percent}%</span>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-2">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full bg-gradient-to-r transition-all duration-500",
              colorScheme.from,
              colorScheme.to
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Amount */}
      <div className="flex items-center justify-between">
        <p className={cn("text-lg font-bold", colorScheme.text)}>
          {formatCurrency(total)}
        </p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{progressPercent.toFixed(0)}% dari max</span>
        </div>
      </div>
    </div>
  );
}

interface BudgetStatisticsSectionProps {
  title: string;
  icon: React.ReactNode;
  statistics: Array<{
    kode: string;
    name?: string;
    subProgram?: string;
    total: number;
    count: number;
    months?: number[];
    activities?: string[];
    monthlyData?: { month: number; amount: number }[];
  }>;
  formatCurrency: (value: number) => string;
  monthLabels: { value: number; label: string }[];
  filterMonthStart?: number | null;
  filterMonthEnd?: number | null;
  filterYear: number;
  onCardClick: (stat: any) => void;
  type?: "program" | "rekening";
  getLabel?: (kode: string) => string;
}

export function BudgetStatisticsSection({
  title,
  icon,
  statistics,
  formatCurrency,
  monthLabels,
  filterMonthStart,
  filterMonthEnd,
  filterYear,
  onCardClick,
  type = "program",
  getLabel,
}: BudgetStatisticsSectionProps) {
  const maxTotal = Math.max(...statistics.map((s) => s.total), 1);
  const totalAmount = statistics.reduce((sum, stat) => sum + stat.total, 0);
  const totalItems = statistics.reduce((sum, stat) => sum + stat.count, 0);

  // Build filter label
  const getFilterLabel = () => {
    if (filterMonthStart !== null && filterMonthEnd !== null) {
      return `${monthLabels[filterMonthStart - 1]?.label} - ${monthLabels[filterMonthEnd - 1]?.label} ${filterYear}`;
    } else if (filterMonthStart !== null) {
      return `Dari ${monthLabels[filterMonthStart - 1]?.label} ${filterYear}`;
    } else if (filterMonthEnd !== null) {
      return `Sampai ${monthLabels[filterMonthEnd - 1]?.label} ${filterYear}`;
    }
    return null;
  };

  const filterLabel = getFilterLabel();

  if (statistics.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              {title}
              {filterLabel && (
                <Badge variant="secondary" className="font-normal">
                  {filterLabel}
                </Badge>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              Klik kartu untuk melihat detail breakdown
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Item</p>
            <p className="font-semibold">{totalItems}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Anggaran</p>
            <p className="font-bold text-primary">{formatCurrency(totalAmount)}</p>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {statistics.map((stat, index) => (
          <BudgetStatisticsCard
            key={stat.kode}
            kode={stat.kode}
            name={type === "rekening" && getLabel ? getLabel(stat.kode) : stat.name}
            subProgram={stat.subProgram}
            total={stat.total}
            count={stat.count}
            months={stat.months}
            monthlyData={stat.monthlyData}
            maxTotal={maxTotal}
            index={index}
            onClick={() => onCardClick(stat)}
            formatCurrency={formatCurrency}
            monthLabels={monthLabels}
            type={type}
            activities={stat.activities}
          />
        ))}
      </div>

      {/* Summary footer */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <span className="font-semibold">Total Semua {type === "program" ? "Program" : "Kode Rekening"}</span>
        </div>
        <span className="text-xl font-bold text-primary">
          {formatCurrency(totalAmount)}
        </span>
      </div>
    </div>
  );
}
