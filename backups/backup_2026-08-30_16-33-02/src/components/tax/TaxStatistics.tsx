import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Receipt, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountAnimationCurrency } from "@/hooks/useCountAnimation";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

interface TaxStatCardProps {
  title: string;
  code: string;
  pemungutan: number;
  penyetoran: number;
  selisih: number;
  isLoading?: boolean;
  delay?: number;
}

function TaxStatCard({ title, code, pemungutan, penyetoran, selisih, isLoading, delay = 0 }: TaxStatCardProps) {
  const animatedPemungutan = useCountAnimationCurrency(pemungutan, isLoading, { delay, duration: 1500 });
  const animatedPenyetoran = useCountAnimationCurrency(penyetoran, isLoading, { delay: delay + 100, duration: 1500 });
  
  const isBalanced = selisih === 0;
  const hasDeficit = selisih > 0; // More collected than deposited

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <Badge variant="outline" className="mb-2">{code}</Badge>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
          </div>
          <div className={cn(
            "p-2 rounded-xl",
            isBalanced ? "bg-emerald-500/10 text-emerald-600" : 
            hasDeficit ? "bg-amber-500/10 text-amber-600" : "bg-blue-500/10 text-blue-600"
          )}>
            {isBalanced ? (
              <Receipt className="h-5 w-5" />
            ) : hasDeficit ? (
              <TrendingUp className="h-5 w-5" />
            ) : (
              <TrendingDown className="h-5 w-5" />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Pemungutan:</span>
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {isLoading ? (
                <span className="inline-block w-20 h-4 bg-muted rounded animate-pulse" />
              ) : animatedPemungutan}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Penyetoran:</span>
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {isLoading ? (
                <span className="inline-block w-20 h-4 bg-muted rounded animate-pulse" />
              ) : animatedPenyetoran}
            </span>
          </div>
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium">Selisih:</span>
              <span className={cn(
                "text-sm font-bold",
                isBalanced ? "text-emerald-600" : hasDeficit ? "text-amber-600" : "text-rose-600"
              )}>
                {isLoading ? (
                  <span className="inline-block w-20 h-4 bg-muted rounded animate-pulse" />
                ) : formatCurrency(Math.abs(selisih))}
              </span>
            </div>
            {!isLoading && (
              <p className="text-xs text-muted-foreground mt-1">
                {isBalanced ? "Seimbang" : hasDeficit ? "Belum disetor" : "Lebih setor"}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TaxStatistics() {
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());

  const { data: statistics, isLoading } = useQuery({
    queryKey: ["tax-statistics", filterMonth, filterYear],
    queryFn: async () => {
      // Get all tax types
      const { data: taxTypes, error: taxTypesError } = await supabase
        .from("tax_types")
        .select("id, name, code")
        .eq("is_active", true)
        .order("code");
      
      if (taxTypesError) throw taxTypesError;

      // Get all tax records for the period
      const startDate = `${filterYear}-${String(filterMonth).padStart(2, "0")}-01`;
      const endDate = new Date(filterYear, filterMonth, 0).toISOString().split("T")[0];
      
      const { data: records, error: recordsError } = await supabase
        .from("tax_records")
        .select("tax_type_id, transaction_type, tax_amount")
        .gte("record_date", startDate)
        .lte("record_date", endDate);
      
      if (recordsError) throw recordsError;

      // Calculate statistics per tax type
      const stats = taxTypes.map((taxType) => {
        const typeRecords = records.filter((r) => r.tax_type_id === taxType.id);
        const pemungutan = typeRecords
          .filter((r) => r.transaction_type === "pemungutan")
          .reduce((sum, r) => sum + Number(r.tax_amount), 0);
        const penyetoran = typeRecords
          .filter((r) => r.transaction_type === "penyetoran")
          .reduce((sum, r) => sum + Number(r.tax_amount), 0);
        
        return {
          id: taxType.id,
          name: taxType.name,
          code: taxType.code,
          pemungutan,
          penyetoran,
          selisih: pemungutan - penyetoran,
        };
      });

      // Calculate totals
      const totalPemungutan = stats.reduce((sum, s) => sum + s.pemungutan, 0);
      const totalPenyetoran = stats.reduce((sum, s) => sum + s.penyetoran, 0);

      return {
        byType: stats,
        totals: {
          pemungutan: totalPemungutan,
          penyetoran: totalPenyetoran,
          selisih: totalPemungutan - totalPenyetoran,
        },
      };
    },
  });

  const months = [
    { value: 1, label: "Januari" },
    { value: 2, label: "Februari" },
    { value: 3, label: "Maret" },
    { value: 4, label: "April" },
    { value: 5, label: "Mei" },
    { value: 6, label: "Juni" },
    { value: 7, label: "Juli" },
    { value: 8, label: "Agustus" },
    { value: 9, label: "September" },
    { value: 10, label: "Oktober" },
    { value: 11, label: "November" },
    { value: 12, label: "Desember" },
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-2">
        <Select value={filterMonth.toString()} onValueChange={(v) => setFilterMonth(parseInt(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value.toString()}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterYear.toString()} onValueChange={(v) => setFilterYear(parseInt(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Total Summary */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Ringkasan Total
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-emerald-500/10 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Total Pemungutan</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(statistics?.totals.pemungutan || 0)}
                </p>
              </div>
              <div className="text-center p-4 bg-blue-500/10 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Total Penyetoran</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(statistics?.totals.penyetoran || 0)}
                </p>
              </div>
              <div className={cn(
                "text-center p-4 rounded-lg",
                (statistics?.totals.selisih || 0) === 0 
                  ? "bg-emerald-500/10" 
                  : (statistics?.totals.selisih || 0) > 0 
                    ? "bg-amber-500/10" 
                    : "bg-rose-500/10"
              )}>
                <p className="text-sm text-muted-foreground mb-1">Selisih</p>
                <p className={cn(
                  "text-xl font-bold",
                  (statistics?.totals.selisih || 0) === 0 
                    ? "text-emerald-600" 
                    : (statistics?.totals.selisih || 0) > 0 
                      ? "text-amber-600" 
                      : "text-rose-600"
                )}>
                  {formatCurrency(Math.abs(statistics?.totals.selisih || 0))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(statistics?.totals.selisih || 0) === 0 
                    ? "Seimbang" 
                    : (statistics?.totals.selisih || 0) > 0 
                      ? "Belum disetor" 
                      : "Lebih setor"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per Tax Type Cards */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Statistik per Jenis Pajak</h3>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statistics?.byType.map((stat, index) => (
              <TaxStatCard
                key={stat.id}
                title={stat.name}
                code={stat.code}
                pemungutan={stat.pemungutan}
                penyetoran={stat.penyetoran}
                selisih={stat.selisih}
                delay={index * 100}
              />
            ))}
            {!statistics?.byType.length && (
              <Card className="col-span-full">
                <CardContent className="p-8 text-center text-muted-foreground">
                  Belum ada data pajak untuk periode ini
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
