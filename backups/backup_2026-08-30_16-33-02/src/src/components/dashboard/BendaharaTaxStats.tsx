import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, Receipt, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function BendaharaTaxStats() {
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());

  const { data: statistics, isLoading } = useQuery({
    queryKey: ["bendahara-tax-statistics", filterMonth, filterYear],
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

      return stats;
    },
  });

  const months = [
    { value: 1, label: "Jan" },
    { value: 2, label: "Feb" },
    { value: 3, label: "Mar" },
    { value: 4, label: "Apr" },
    { value: 5, label: "Mei" },
    { value: 6, label: "Jun" },
    { value: 7, label: "Jul" },
    { value: 8, label: "Agt" },
    { value: 9, label: "Sep" },
    { value: 10, label: "Okt" },
    { value: 11, label: "Nov" },
    { value: 12, label: "Des" },
  ];

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          Statistik Pajak per Jenis
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={filterMonth.toString()} onValueChange={(v) => setFilterMonth(parseInt(v))}>
            <SelectTrigger className="w-20 h-8">
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
            <SelectTrigger className="w-20 h-8">
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
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {statistics?.map((stat) => {
              const isBalanced = stat.selisih === 0;
              const hasDeficit = stat.selisih > 0;
              
              return (
                <div 
                  key={stat.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      isBalanced ? "bg-emerald-500/10 text-emerald-600" : 
                      hasDeficit ? "bg-amber-500/10 text-amber-600" : "bg-blue-500/10 text-blue-600"
                    )}>
                      {isBalanced ? (
                        <Receipt className="h-4 w-4" />
                      ) : hasDeficit ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{stat.code}</Badge>
                        <span className="text-sm font-medium">{stat.name}</span>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        <span>Pungut: <span className="text-emerald-600 font-medium">{formatCurrency(stat.pemungutan)}</span></span>
                        <span>Setor: <span className="text-blue-600 font-medium">{formatCurrency(stat.penyetoran)}</span></span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      "text-sm font-bold",
                      isBalanced ? "text-emerald-600" : hasDeficit ? "text-amber-600" : "text-rose-600"
                    )}>
                      {formatCurrency(Math.abs(stat.selisih))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isBalanced ? "Seimbang" : hasDeficit ? "Belum disetor" : "Lebih setor"}
                    </div>
                  </div>
                </div>
              );
            })}
            {!statistics?.length && (
              <div className="text-center text-muted-foreground py-4">
                Belum ada data pajak
              </div>
            )}
            <div className="pt-2">
              <Link to="/tax-management">
                <Button variant="outline" size="sm" className="w-full">
                  Lihat Selengkapnya
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
