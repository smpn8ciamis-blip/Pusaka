import { FileSignature, Plane, Receipt, Wallet, Hammer, GraduationCap, Music, Landmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCountAnimation, useCountAnimationCurrency } from "@/hooks/useCountAnimation";

interface BendaharaStatCardsProps {
  assignmentCount: number;
  travelCount: number;
  receiptCount: number;
  totalPayment: number;
  workerPaymentCount: number;
  totalWorkerPayment: number;
  gttPttCount: number;
  totalGttPtt: number;
  eskulCount: number;
  totalEskul: number;
  taxPemungutan: number;
  taxPenyetoran: number;
  isLoading?: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ReactNode;
  type: "blue" | "violet" | "emerald" | "amber" | "rose" | "cyan" | "pink";
  isLoading?: boolean;
  isCurrency?: boolean;
  delay?: number;
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  type,
  isLoading,
  isCurrency,
  delay = 0,
}: StatCardProps) {
  const animatedValue = useCountAnimation(value, isLoading, { delay, duration: 1500 });
  const animatedCurrency = useCountAnimationCurrency(value, isLoading, { delay, duration: 2000 });

  const getTypeStyles = () => {
    switch (type) {
      case "blue":
        return {
          gradientFrom: "from-blue-500/10",
          gradientTo: "to-blue-500/5",
          textClass: "text-blue-600 dark:text-blue-400",
          iconBg: "from-blue-500/20 to-blue-500/5",
          iconText: "text-blue-600 dark:text-blue-400",
          decorBg: "bg-blue-500",
        };
      case "violet":
        return {
          gradientFrom: "from-violet-500/10",
          gradientTo: "to-violet-500/5",
          textClass: "text-violet-600 dark:text-violet-400",
          iconBg: "from-violet-500/20 to-violet-500/5",
          iconText: "text-violet-600 dark:text-violet-400",
          decorBg: "bg-violet-500",
        };
      case "emerald":
        return {
          gradientFrom: "from-emerald-500/10",
          gradientTo: "to-emerald-500/5",
          textClass: "text-emerald-600 dark:text-emerald-400",
          iconBg: "from-emerald-500/20 to-emerald-500/5",
          iconText: "text-emerald-600 dark:text-emerald-400",
          decorBg: "bg-emerald-500",
        };
      case "amber":
        return {
          gradientFrom: "from-amber-500/10",
          gradientTo: "to-amber-500/5",
          textClass: "text-amber-600 dark:text-amber-400",
          iconBg: "from-amber-500/20 to-amber-500/5",
          iconText: "text-amber-600 dark:text-amber-400",
          decorBg: "bg-amber-500",
        };
      case "rose":
        return {
          gradientFrom: "from-rose-500/10",
          gradientTo: "to-rose-500/5",
          textClass: "text-rose-600 dark:text-rose-400",
          iconBg: "from-rose-500/20 to-rose-500/5",
          iconText: "text-rose-600 dark:text-rose-400",
          decorBg: "bg-rose-500",
        };
      case "cyan":
        return {
          gradientFrom: "from-cyan-500/10",
          gradientTo: "to-cyan-500/5",
          textClass: "text-cyan-600 dark:text-cyan-400",
          iconBg: "from-cyan-500/20 to-cyan-500/5",
          iconText: "text-cyan-600 dark:text-cyan-400",
          decorBg: "bg-cyan-500",
        };
      case "pink":
        return {
          gradientFrom: "from-pink-500/10",
          gradientTo: "to-pink-500/5",
          textClass: "text-pink-600 dark:text-pink-400",
          iconBg: "from-pink-500/20 to-pink-500/5",
          iconText: "text-pink-600 dark:text-pink-400",
          decorBg: "bg-pink-500",
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300 bg-gradient-to-br hover:shadow-lg hover:scale-[1.02]",
        styles.gradientFrom,
        styles.gradientTo
      )}
    >
      <CardContent className="p-4 md:p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          <div
            className={cn(
              "flex-shrink-0 p-2 rounded-xl bg-gradient-to-br",
              styles.iconBg,
              styles.iconText
            )}
          >
            {icon}
          </div>
        </div>

        {/* Value */}
        <p className={cn("text-xl md:text-2xl font-bold tracking-tight tabular-nums", styles.textClass)}>
          {isLoading ? (
            <span className="inline-block w-20 h-7 bg-muted rounded animate-pulse" />
          ) : isCurrency ? (
            animatedCurrency
          ) : (
            animatedValue
          )}
        </p>

        {/* Subtitle */}
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          {subtitle}
        </p>

        {/* Decorative element */}
        <div
          className={cn(
            "absolute -right-6 -bottom-6 w-24 h-24 rounded-full blur-2xl pointer-events-none opacity-30",
            styles.decorBg
          )}
        />
      </CardContent>
    </Card>
  );
}

export function BendaharaStatCards({
  assignmentCount,
  travelCount,
  receiptCount,
  totalPayment,
  workerPaymentCount,
  totalWorkerPayment,
  gttPttCount,
  totalGttPtt,
  eskulCount,
  totalEskul,
  taxPemungutan,
  taxPenyetoran,
  isLoading,
}: BendaharaStatCardsProps) {
  const cards = [
    {
      title: "Total Surat Tugas",
      value: assignmentCount,
      subtitle: "Surat tugas yang telah dibuat",
      icon: <FileSignature className="h-5 w-5" />,
      type: "blue" as const,
      isCurrency: false,
      delay: 0,
    },
    {
      title: "Total SPPD",
      value: travelCount,
      subtitle: "Surat perjalanan dinas",
      icon: <Plane className="h-5 w-5" />,
      type: "violet" as const,
      isCurrency: false,
      delay: 100,
    },
    {
      title: "Total Kwitansi",
      value: receiptCount,
      subtitle: "Kwitansi pembayaran",
      icon: <Receipt className="h-5 w-5" />,
      type: "emerald" as const,
      isCurrency: false,
      delay: 200,
    },
    {
      title: "Total Realisasi SPPD",
      value: totalPayment,
      subtitle: "Total pembayaran SPPD",
      icon: <Wallet className="h-5 w-5" />,
      type: "amber" as const,
      isCurrency: true,
      delay: 300,
    },
    {
      title: "Upah Tukang",
      value: totalWorkerPayment,
      subtitle: `${workerPaymentCount} kwitansi pembayaran`,
      icon: <Hammer className="h-5 w-5" />,
      type: "rose" as const,
      isCurrency: true,
      delay: 400,
    },
    {
      title: "Honor GTT/PTT",
      value: totalGttPtt,
      subtitle: `${gttPttCount} kwitansi pembayaran`,
      icon: <GraduationCap className="h-5 w-5" />,
      type: "cyan" as const,
      isCurrency: true,
      delay: 500,
    },
    {
      title: "Honor Eskul",
      value: totalEskul,
      subtitle: `${eskulCount} kwitansi pembayaran`,
      icon: <Music className="h-5 w-5" />,
      type: "pink" as const,
      isCurrency: true,
      delay: 600,
    },
    {
      title: "Pajak Dipungut",
      value: taxPemungutan,
      subtitle: "Total pemungutan pajak",
      icon: <Landmark className="h-5 w-5" />,
      type: "emerald" as const,
      isCurrency: true,
      delay: 700,
    },
    {
      title: "Pajak Disetor",
      value: taxPenyetoran,
      subtitle: "Total penyetoran pajak",
      icon: <Landmark className="h-5 w-5" />,
      type: "blue" as const,
      isCurrency: true,
      delay: 800,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <StatCard
          key={index}
          title={card.title}
          value={card.value}
          subtitle={card.subtitle}
          icon={card.icon}
          type={card.type}
          isLoading={isLoading}
          isCurrency={card.isCurrency}
          delay={card.delay}
        />
      ))}
    </div>
  );
}
