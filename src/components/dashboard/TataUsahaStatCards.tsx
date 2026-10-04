import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Inbox, Send, GitBranch, Clock, FileSignature, Plane } from "lucide-react";
import { useCountAnimation } from "@/hooks/useCountAnimation";

interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: ReactNode;
  bgColor: string;
  accentColor: string;
  iconBg: string;
  isLoading?: boolean;
  delay?: number;
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  bgColor,
  accentColor,
  iconBg,
  isLoading,
  delay = 0
}: StatCardProps) {
  const animatedValue = useCountAnimation(value, isLoading, { delay, duration: 1500 });

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl p-5 transition-all duration-300",
      "hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5",
      "border",
      bgColor
    )}>
      {/* Subtle gradient overlay */}
      <div className={cn(
        "absolute -right-8 -top-8 w-24 h-24 rounded-full blur-2xl opacity-20 pointer-events-none",
        accentColor
      )} />
      
      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className={cn(
            "p-2.5 rounded-lg",
            iconBg
          )}>
            {icon}
          </div>
        </div>
        
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            {title}
          </p>
          <p className="text-2xl md:text-3xl font-bold text-foreground tracking-tight tabular-nums">
            {isLoading ? (
              <span className="inline-block w-16 h-8 bg-muted rounded animate-pulse" />
            ) : (
              animatedValue
            )}
          </p>
          <p className="text-xs text-muted-foreground/80">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Bottom accent */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 h-0.5",
        accentColor
      )} />
    </div>
  );
}

interface TataUsahaStatCardsProps {
  suratMasukCount: number;
  suratKeluarCount: number;
  disposisiCount: number;
  disposisiPending: number;
  assignmentCount: number;
  travelCount: number;
  isLoading?: boolean;
}

export function TataUsahaStatCards({
  suratMasukCount,
  suratKeluarCount,
  disposisiCount,
  disposisiPending,
  assignmentCount,
  travelCount,
  isLoading
}: TataUsahaStatCardsProps) {
  const cards = [
    {
      title: "Surat Masuk",
      value: suratMasukCount,
      subtitle: "Total surat masuk diterima",
      icon: <Inbox className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
      bgColor: "bg-card border-border/50 hover:border-blue-200 dark:hover:border-blue-800/50",
      accentColor: "bg-blue-500",
      iconBg: "bg-blue-50 dark:bg-blue-950/50",
      delay: 0,
    },
    {
      title: "Surat Keluar",
      value: suratKeluarCount,
      subtitle: "Total surat keluar terkirim",
      icon: <Send className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
      bgColor: "bg-card border-border/50 hover:border-emerald-200 dark:hover:border-emerald-800/50",
      accentColor: "bg-emerald-500",
      iconBg: "bg-emerald-50 dark:bg-emerald-950/50",
      delay: 100,
    },
    {
      title: "Total Disposisi",
      value: disposisiCount,
      subtitle: "Total disposisi surat",
      icon: <GitBranch className="h-5 w-5 text-violet-600 dark:text-violet-400" />,
      bgColor: "bg-card border-border/50 hover:border-violet-200 dark:hover:border-violet-800/50",
      accentColor: "bg-violet-500",
      iconBg: "bg-violet-50 dark:bg-violet-950/50",
      delay: 200,
    },
    {
      title: "Disposisi Pending",
      value: disposisiPending,
      subtitle: "Menunggu tindak lanjut",
      icon: <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
      bgColor: "bg-card border-border/50 hover:border-amber-200 dark:hover:border-amber-800/50",
      accentColor: "bg-amber-500",
      iconBg: "bg-amber-50 dark:bg-amber-950/50",
      delay: 300,
    },
    {
      title: "Surat Tugas",
      value: assignmentCount,
      subtitle: "Total surat tugas dibuat",
      icon: <FileSignature className="h-5 w-5 text-rose-600 dark:text-rose-400" />,
      bgColor: "bg-card border-border/50 hover:border-rose-200 dark:hover:border-rose-800/50",
      accentColor: "bg-rose-500",
      iconBg: "bg-rose-50 dark:bg-rose-950/50",
      delay: 400,
    },
    {
      title: "Total SPPD",
      value: travelCount,
      subtitle: "Surat perjalanan dinas",
      icon: <Plane className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />,
      bgColor: "bg-card border-border/50 hover:border-cyan-200 dark:hover:border-cyan-800/50",
      accentColor: "bg-cyan-500",
      iconBg: "bg-cyan-50 dark:bg-cyan-950/50",
      delay: 500,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card, index) => (
        <StatCard
          key={index}
          title={card.title}
          value={card.value}
          subtitle={card.subtitle}
          icon={card.icon}
          bgColor={card.bgColor}
          accentColor={card.accentColor}
          iconBg={card.iconBg}
          isLoading={isLoading}
          delay={card.delay}
        />
      ))}
    </div>
  );
}