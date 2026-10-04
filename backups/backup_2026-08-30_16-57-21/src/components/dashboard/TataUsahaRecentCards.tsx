import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Inbox, Send, GitBranch, Calendar, Badge } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  badge?: string;
  status?: string;
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
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400';
      case 'in_review':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400';
      case 'resolved':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'in_review': return 'Proses';
      case 'resolved': return 'Selesai';
      default: return status;
    }
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
                    {item.status && (
                      <span className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                        getStatusBadgeStyle(item.status)
                      )}>
                        {getStatusLabel(item.status)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground truncate">
                      {item.subtitle}
                    </span>
                  </div>
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

interface TataUsahaRecentCardsProps {
  recentMasuk: any[];
  recentKeluar: any[];
  recentDisposisi: any[];
  isLoading?: boolean;
}

export function TataUsahaRecentCards({
  recentMasuk,
  recentKeluar,
  recentDisposisi,
  isLoading,
}: TataUsahaRecentCardsProps) {
  const masukItems: ActivityItem[] = recentMasuk.map((s) => ({
    id: s.id,
    title: s.nomor_surat,
    subtitle: s.perihal || "-",
    date: format(new Date(s.tanggal_diterima), "dd MMM", { locale: idLocale }),
    badge: s.kategori,
  }));

  const keluarItems: ActivityItem[] = recentKeluar.map((s) => ({
    id: s.id,
    title: s.nomor_surat,
    subtitle: s.perihal || "-",
    date: format(new Date(s.tanggal_surat), "dd MMM", { locale: idLocale }),
    badge: s.kategori,
  }));

  const disposisiItems: ActivityItem[] = recentDisposisi.map((d) => ({
    id: d.id,
    title: d.tujuan_disposisi,
    subtitle: d.instruksi || "-",
    date: format(new Date(d.tanggal_disposisi), "dd MMM", { locale: idLocale }),
    status: d.status,
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <RecentActivityCard
        title="Surat Masuk Terbaru"
        description="5 surat masuk terakhir"
        icon={<Inbox className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
        items={masukItems}
        emptyMessage="Belum ada surat masuk"
        isLoading={isLoading}
        accentColor="bg-blue-500"
        iconBg="bg-blue-50 dark:bg-blue-950/50"
        iconColor="text-blue-600 dark:text-blue-400"
      />
      
      <RecentActivityCard
        title="Surat Keluar Terbaru"
        description="5 surat keluar terakhir"
        icon={<Send className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
        items={keluarItems}
        emptyMessage="Belum ada surat keluar"
        isLoading={isLoading}
        accentColor="bg-emerald-500"
        iconBg="bg-emerald-50 dark:bg-emerald-950/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
      />
      
      <RecentActivityCard
        title="Disposisi Terbaru"
        description="5 disposisi terakhir"
        icon={<GitBranch className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
        items={disposisiItems}
        emptyMessage="Belum ada disposisi"
        isLoading={isLoading}
        accentColor="bg-violet-500"
        iconBg="bg-violet-50 dark:bg-violet-950/50"
        iconColor="text-violet-600 dark:text-violet-400"
      />
    </div>
  );
}