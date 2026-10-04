import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Receipt, Hammer, GraduationCap, Music, Calendar } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  badge?: string;
  amount?: number;
}

interface RecentActivityCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  items: ActivityItem[];
  emptyMessage: string;
  isLoading?: boolean;
  accentColor: string;
  iconBg: string;
  iconColor: string;
}

function RecentActivityCard({
  title,
  description,
  icon,
  items,
  emptyMessage,
  isLoading,
  accentColor,
  iconBg,
  iconColor,
}: RecentActivityCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl bg-card border border-border/50",
      "hover:border-border hover:shadow-md transition-all duration-300"
    )}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className={cn("p-2.5 rounded-lg", iconBg)}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                <div className="w-7 h-7 rounded-md bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-muted rounded w-3/4" />
                  <div className="h-2.5 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className={cn("p-2.5 rounded-lg mb-2", iconBg)}>
              {icon}
            </div>
            <p className="text-xs text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "group flex items-start gap-2.5 p-2.5 rounded-lg",
                  "hover:bg-muted/50 transition-colors duration-200"
                )}
              >
                {/* Number */}
                <div className={cn(
                  "flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold",
                  iconBg, iconColor
                )}>
                  {index + 1}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {item.badge && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                        {item.badge}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground truncate">
                      {item.subtitle}
                    </span>
                  </div>
                  {item.amount !== undefined && (
                    <p className="text-xs font-semibold mt-1 text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(item.amount)}
                    </p>
                  )}
                </div>
                
                {/* Date */}
                <div className="flex-shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{item.date}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom accent */}
      <div className={cn("absolute bottom-0 left-0 right-0 h-0.5", accentColor)} />
    </div>
  );
}

interface BendaharaRecentCardsProps {
  recentReceipts: any[];
  recentWorkerPayments: any[];
  recentGttPtt: any[];
  recentEskul: any[];
  isLoading?: boolean;
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export function BendaharaRecentCards({
  recentReceipts,
  recentWorkerPayments,
  recentGttPtt,
  recentEskul,
  isLoading,
}: BendaharaRecentCardsProps) {
  const getPaymentTypeLabel = (type: string) => {
    switch (type) {
      case "transport": return "Transportasi";
      case "accommodation": return "Penginapan";
      case "meals": return "Uang Makan";
      default: return type;
    }
  };

  const receiptItems: ActivityItem[] = recentReceipts.map((r) => ({
    id: r.id,
    title: r.receipt_number,
    subtitle: r.recipient_name,
    date: format(new Date(r.receipt_date), "dd MMM", { locale: idLocale }),
    badge: getPaymentTypeLabel(r.payment_type),
    amount: Number(r.amount),
  }));

  const workerPaymentItems: ActivityItem[] = recentWorkerPayments.map((w) => ({
    id: w.id,
    title: w.worker_name,
    subtitle: w.position_type,
    date: format(new Date(w.start_date), "dd MMM", { locale: idLocale }),
    amount: Number(w.net_amount),
  }));

  const gttPttItems: ActivityItem[] = recentGttPtt.map((g) => {
    const teacherName = g.teachers?.profiles?.full_name || "Unknown";
    return {
      id: g.id,
      title: teacherName,
      subtitle: `${MONTH_NAMES[g.payment_month - 1]} ${g.payment_year}`,
      date: format(new Date(g.receipt_date), "dd MMM", { locale: idLocale }),
      amount: Number(g.net_amount),
    };
  });

  const eskulItems: ActivityItem[] = recentEskul.map((e) => {
    const instructorName = e.extracurricular_instructors?.name || "Unknown";
    const eskulType = e.extracurricular_instructors?.extracurricular_types?.name || "";
    return {
      id: e.id,
      title: instructorName,
      subtitle: eskulType,
      date: format(new Date(e.receipt_date), "dd MMM", { locale: idLocale }),
      badge: `${MONTH_NAMES[e.payment_month - 1]} ${e.payment_year}`,
      amount: Number(e.net_amount),
    };
  });

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <RecentActivityCard
        title="Kwitansi SPPD Terbaru"
        description="5 kwitansi terakhir"
        icon={<Receipt className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
        items={receiptItems}
        emptyMessage="Belum ada kwitansi"
        isLoading={isLoading}
        accentColor="bg-emerald-500"
        iconBg="bg-emerald-50 dark:bg-emerald-950/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
      />

      <RecentActivityCard
        title="Upah Tukang Terbaru"
        description="5 pembayaran terakhir"
        icon={<Hammer className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
        items={workerPaymentItems}
        emptyMessage="Belum ada pembayaran"
        isLoading={isLoading}
        accentColor="bg-rose-500"
        iconBg="bg-rose-50 dark:bg-rose-950/50"
        iconColor="text-rose-600 dark:text-rose-400"
      />
      
      <RecentActivityCard
        title="Honor GTT/PTT Terbaru"
        description="5 honor terakhir"
        icon={<GraduationCap className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />}
        items={gttPttItems}
        emptyMessage="Belum ada honor GTT/PTT"
        isLoading={isLoading}
        accentColor="bg-cyan-500"
        iconBg="bg-cyan-50 dark:bg-cyan-950/50"
        iconColor="text-cyan-600 dark:text-cyan-400"
      />
      
      <RecentActivityCard
        title="Honor Eskul Terbaru"
        description="5 honor terakhir"
        icon={<Music className="h-4 w-4 text-pink-600 dark:text-pink-400" />}
        items={eskulItems}
        emptyMessage="Belum ada honor eskul"
        isLoading={isLoading}
        accentColor="bg-pink-500"
        iconBg="bg-pink-50 dark:bg-pink-950/50"
        iconColor="text-pink-600 dark:text-pink-400"
      />
    </div>
  );
}
