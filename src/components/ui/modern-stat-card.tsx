import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ModernStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    label?: string;
    isPositive?: boolean;
  };
  progress?: {
    value: number;
    color?: "default" | "success" | "warning" | "danger";
  };
  variant?: "default" | "gradient" | "outline" | "glow";
  gradientFrom?: string;
  gradientTo?: string;
  className?: string;
  onClick?: () => void;
}

const getProgressColor = (color: string = "default") => {
  switch (color) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "danger":
      return "bg-rose-500";
    default:
      return "bg-primary";
  }
};

const getProgressBgColor = (color: string = "default") => {
  switch (color) {
    case "success":
      return "bg-emerald-100 dark:bg-emerald-950";
    case "warning":
      return "bg-amber-100 dark:bg-amber-950";
    case "danger":
      return "bg-rose-100 dark:bg-rose-950";
    default:
      return "bg-primary/10";
  }
};

export function ModernStatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  progress,
  variant = "default",
  gradientFrom = "from-primary/10",
  gradientTo = "to-primary/5",
  className,
  onClick,
}: ModernStatCardProps) {
  const isClickable = !!onClick;

  const cardClasses = cn(
    "relative overflow-hidden transition-all duration-300",
    isClickable && "cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
    variant === "gradient" && `bg-gradient-to-br ${gradientFrom} ${gradientTo}`,
    variant === "glow" && "shadow-lg shadow-primary/10",
    variant === "outline" && "border-2",
    className
  );

  return (
    <Card className={cardClasses} onClick={onClick}>
      <CardContent className="p-4 md:p-6">
        {/* Header with Icon */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <p className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {title}
            </p>
          </div>
          {icon && (
            <div className="flex-shrink-0 p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
              {icon}
            </div>
          )}
        </div>

        {/* Value */}
        <div className="space-y-1">
          <p className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">
            {value}
          </p>
          
          {/* Subtitle */}
          {subtitle && (
            <p className="text-xs md:text-sm text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>

        {/* Trend Indicator */}
        {trend && (
          <div className="mt-3 flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                trend.isPositive
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
              )}
            >
              <span>{trend.isPositive ? "↑" : "↓"}</span>
              <span>{Math.abs(trend.value).toFixed(1)}%</span>
            </div>
            {trend.label && (
              <span className="text-xs text-muted-foreground">{trend.label}</span>
            )}
          </div>
        )}

        {/* Progress Bar */}
        {progress && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">{progress.value.toFixed(1)}%</span>
            </div>
            <div className={cn("h-2 rounded-full overflow-hidden", getProgressBgColor(progress.color))}>
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  getProgressColor(progress.color)
                )}
                style={{ width: `${Math.min(progress.value, 100)}%` }}
              />
            </div>
            {progress.value > 100 && (
              <div className="bg-rose-100 dark:bg-rose-950 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-rose-500 transition-all duration-500"
                  style={{ width: `${Math.min(progress.value - 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Decorative gradient orb */}
        {variant === "glow" && (
          <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-gradient-to-br from-primary/30 to-transparent rounded-full blur-2xl pointer-events-none" />
        )}
      </CardContent>
    </Card>
  );
}

// Preset variants for common use cases
interface BudgetStatCardProps {
  title: string;
  amount: number;
  subtitle?: string;
  icon?: ReactNode;
  type?: "income" | "expense" | "balance" | "budget" | "tax";
  progress?: number;
  className?: string;
  onClick?: () => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function BudgetStatCard({
  title,
  amount,
  subtitle,
  icon,
  type = "budget",
  progress,
  className,
  onClick,
}: BudgetStatCardProps) {
  const getTypeStyles = () => {
    switch (type) {
      case "income":
        return {
          gradientFrom: "from-emerald-500/10",
          gradientTo: "to-emerald-500/5",
          textClass: "text-emerald-600 dark:text-emerald-400",
          iconBg: "from-emerald-500/20 to-emerald-500/5",
          iconText: "text-emerald-600",
        };
      case "expense":
        return {
          gradientFrom: "from-rose-500/10",
          gradientTo: "to-rose-500/5",
          textClass: "text-rose-600 dark:text-rose-400",
          iconBg: "from-rose-500/20 to-rose-500/5",
          iconText: "text-rose-600",
        };
      case "balance":
        return {
          gradientFrom: amount >= 0 ? "from-emerald-500/10" : "from-rose-500/10",
          gradientTo: amount >= 0 ? "to-emerald-500/5" : "to-rose-500/5",
          textClass: amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
          iconBg: amount >= 0 ? "from-emerald-500/20 to-emerald-500/5" : "from-rose-500/20 to-rose-500/5",
          iconText: amount >= 0 ? "text-emerald-600" : "text-rose-600",
        };
      case "tax":
        return {
          gradientFrom: "from-amber-500/10",
          gradientTo: "to-amber-500/5",
          textClass: "text-amber-600 dark:text-amber-400",
          iconBg: "from-amber-500/20 to-amber-500/5",
          iconText: "text-amber-600",
        };
      default:
        return {
          gradientFrom: "from-primary/10",
          gradientTo: "to-primary/5",
          textClass: "text-primary",
          iconBg: "from-primary/20 to-primary/5",
          iconText: "text-primary",
        };
    }
  };

  const styles = getTypeStyles();
  const progressColor = type === "expense" || (type === "balance" && amount < 0) 
    ? progress && progress > 100 ? "danger" : progress && progress > 80 ? "warning" : "success"
    : "default";

  return (
    <Card 
      className={cn(
        "relative overflow-hidden transition-all duration-300 bg-gradient-to-br",
        styles.gradientFrom,
        styles.gradientTo,
        onClick && "cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 md:p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          {icon && (
            <div className={cn(
              "flex-shrink-0 p-2 rounded-xl bg-gradient-to-br",
              styles.iconBg,
              styles.iconText
            )}>
              {icon}
            </div>
          )}
        </div>

        {/* Amount */}
        <p className={cn("text-xl md:text-2xl font-bold tracking-tight", styles.textClass)}>
          {formatCurrency(amount)}
        </p>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            {subtitle}
          </p>
        )}

        {/* Progress */}
        {progress !== undefined && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Realisasi</span>
              <span className={cn(
                "font-semibold",
                progress > 100 ? "text-rose-600" : progress > 80 ? "text-amber-600" : "text-emerald-600"
              )}>
                {progress.toFixed(1)}%
              </span>
            </div>
            <div className={cn("h-1.5 rounded-full overflow-hidden", getProgressBgColor(progressColor))}>
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  getProgressColor(progressColor)
                )}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Decorative element */}
        <div className={cn(
          "absolute -right-6 -bottom-6 w-24 h-24 rounded-full blur-2xl pointer-events-none opacity-30",
          type === "income" && "bg-emerald-500",
          type === "expense" && "bg-rose-500",
          type === "balance" && (amount >= 0 ? "bg-emerald-500" : "bg-rose-500"),
          type === "tax" && "bg-amber-500",
          type === "budget" && "bg-primary"
        )} />
      </CardContent>
    </Card>
  );
}
