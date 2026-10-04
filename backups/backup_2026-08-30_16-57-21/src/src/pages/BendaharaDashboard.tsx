import { useState, lazy, Suspense } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { BendaharaStatCards } from "@/components/dashboard/BendaharaStatCards";
import { BendaharaRecentCards } from "@/components/dashboard/BendaharaRecentCards";
import { BendaharaTaxStats } from "@/components/dashboard/BendaharaTaxStats";

// Lazy load 3D component
const FloatingShapes3D = lazy(() => import('@/components/3d/FloatingShapes').then(m => ({ default: m.FloatingShapes3D })));

export default function BendaharaDashboard() {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Fetch statistics with date filter
  const { data: stats, isLoading } = useQuery({
    queryKey: ["bendahara-stats", startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let assignmentQuery = supabase
        .from("assignment_letters")
        .select("*", { count: "exact", head: true });
      
      let travelQuery = supabase
        .from("official_travel_letters")
        .select("*", { count: "exact", head: true });
      
      let receiptsQuery = supabase
        .from("payment_receipts")
        .select("amount");

      // Worker payments query - use start_date for date filter
      let workerPaymentsQuery = supabase
        .from("worker_payments")
        .select("net_amount, start_date");

      // GTT/PTT honorarium query
      let gttPttQuery = supabase
        .from("gtt_ptt_honorariums")
        .select("net_amount");

      // Extracurricular honorarium query
      let eskulQuery = supabase
        .from("extracurricular_honorariums")
        .select("net_amount");

      // Tax records query
      let taxRecordsQuery = supabase
        .from("tax_records")
        .select("transaction_type, tax_amount");

      // Apply date filters
      if (startDate) {
        const startStr = format(startDate, "yyyy-MM-dd");
        assignmentQuery = assignmentQuery.gte("letter_date", startStr);
        travelQuery = travelQuery.gte("letter_date", startStr);
        receiptsQuery = receiptsQuery.gte("receipt_date", startStr);
        workerPaymentsQuery = workerPaymentsQuery.gte("start_date", startStr);
        gttPttQuery = gttPttQuery.gte("receipt_date", startStr);
        eskulQuery = eskulQuery.gte("receipt_date", startStr);
        taxRecordsQuery = taxRecordsQuery.gte("record_date", startStr);
      }
      if (endDate) {
        const endStr = format(endDate, "yyyy-MM-dd");
        assignmentQuery = assignmentQuery.lte("letter_date", endStr);
        travelQuery = travelQuery.lte("letter_date", endStr);
        receiptsQuery = receiptsQuery.lte("receipt_date", endStr);
        workerPaymentsQuery = workerPaymentsQuery.lte("start_date", endStr);
        gttPttQuery = gttPttQuery.lte("receipt_date", endStr);
        eskulQuery = eskulQuery.lte("receipt_date", endStr);
        taxRecordsQuery = taxRecordsQuery.lte("record_date", endStr);
      }

      const [
        assignmentResult, 
        travelResult, 
        receiptsResult, 
        workerPaymentsResult,
        gttPttResult,
        eskulResult,
        taxRecordsResult
      ] = await Promise.all([
        assignmentQuery,
        travelQuery,
        receiptsQuery,
        workerPaymentsQuery,
        gttPttQuery,
        eskulQuery,
        taxRecordsQuery
      ]);

      if (assignmentResult.error) throw assignmentResult.error;
      if (travelResult.error) throw travelResult.error;
      if (receiptsResult.error) throw receiptsResult.error;
      if (workerPaymentsResult.error) throw workerPaymentsResult.error;
      if (gttPttResult.error) throw gttPttResult.error;
      if (eskulResult.error) throw eskulResult.error;
      if (taxRecordsResult.error) throw taxRecordsResult.error;

      const receiptCount = receiptsResult.data?.length || 0;
      const totalPayment = receiptsResult.data?.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0;

      // Calculate worker payments total
      const workerPaymentCount = workerPaymentsResult.data?.length || 0;
      const totalWorkerPayment = workerPaymentsResult.data?.reduce((sum, r) => sum + Number(r.net_amount || 0), 0) || 0;

      // Calculate GTT/PTT total
      const gttPttCount = gttPttResult.data?.length || 0;
      const totalGttPtt = gttPttResult.data?.reduce((sum, r) => sum + Number(r.net_amount || 0), 0) || 0;

      // Calculate eskul total
      const eskulCount = eskulResult.data?.length || 0;
      const totalEskul = eskulResult.data?.reduce((sum, r) => sum + Number(r.net_amount || 0), 0) || 0;

      // Calculate tax totals
      const taxPemungutan = taxRecordsResult.data
        ?.filter((r) => r.transaction_type === "pemungutan")
        .reduce((sum, r) => sum + Number(r.tax_amount || 0), 0) || 0;
      const taxPenyetoran = taxRecordsResult.data
        ?.filter((r) => r.transaction_type === "penyetoran")
        .reduce((sum, r) => sum + Number(r.tax_amount || 0), 0) || 0;

      // Fetch recent data with date filter
      let recentReceiptsQuery = supabase
        .from("payment_receipts")
        .select("id, receipt_number, receipt_date, recipient_name, amount, payment_type")
        .order("receipt_date", { ascending: false })
        .limit(5);

      let recentWorkerPaymentsQuery = supabase
        .from("worker_payments")
        .select("id, worker_name, position_type, start_date, end_date, net_amount")
        .order("start_date", { ascending: false })
        .limit(5);

      let recentGttPttQuery = supabase
        .from("gtt_ptt_honorariums")
        .select(`
          id, receipt_number, receipt_date, net_amount, payment_month, payment_year, teacher_id,
          teachers(id, user_id, profiles:user_id(full_name))
        `)
        .order("receipt_date", { ascending: false })
        .limit(5);

      let recentEskulQuery = supabase
        .from("extracurricular_honorariums")
        .select(`
          id, receipt_number, receipt_date, net_amount, payment_month, payment_year, instructor_id,
          extracurricular_instructors(id, name, extracurricular_types:extracurricular_type_id(name))
        `)
        .order("receipt_date", { ascending: false })
        .limit(5);

      if (startDate) {
        const startStr = format(startDate, "yyyy-MM-dd");
        recentReceiptsQuery = recentReceiptsQuery.gte("receipt_date", startStr);
        recentWorkerPaymentsQuery = recentWorkerPaymentsQuery.gte("start_date", startStr);
        recentGttPttQuery = recentGttPttQuery.gte("receipt_date", startStr);
        recentEskulQuery = recentEskulQuery.gte("receipt_date", startStr);
      }
      if (endDate) {
        const endStr = format(endDate, "yyyy-MM-dd");
        recentReceiptsQuery = recentReceiptsQuery.lte("receipt_date", endStr);
        recentWorkerPaymentsQuery = recentWorkerPaymentsQuery.lte("start_date", endStr);
        recentGttPttQuery = recentGttPttQuery.lte("receipt_date", endStr);
        recentEskulQuery = recentEskulQuery.lte("receipt_date", endStr);
      }

      const [recentReceipts, recentWorkerPayments, recentGttPtt, recentEskul] = await Promise.all([
        recentReceiptsQuery,
        recentWorkerPaymentsQuery,
        recentGttPttQuery,
        recentEskulQuery
      ]);

      if (recentReceipts.error) throw recentReceipts.error;
      if (recentWorkerPayments.error) throw recentWorkerPayments.error;
      if (recentGttPtt.error) throw recentGttPtt.error;
      if (recentEskul.error) throw recentEskul.error;

      return {
        assignmentCount: assignmentResult.count || 0,
        travelCount: travelResult.count || 0,
        receiptCount,
        totalPayment,
        workerPaymentCount,
        totalWorkerPayment,
        gttPttCount,
        totalGttPtt,
        eskulCount,
        totalEskul,
        recentReceipts: recentReceipts.data || [],
        recentWorkerPayments: recentWorkerPayments.data || [],
        recentGttPtt: recentGttPtt.data || [],
        recentEskul: recentEskul.data || [],
        taxPemungutan,
        taxPenyetoran,
      };
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getPaymentTypeLabel = (type: string) => {
    switch (type) {
      case "transport": return "Transportasi";
      case "accommodation": return "Penginapan";
      case "meals": return "Uang Makan";
      default: return type;
    }
  };

  const clearDateFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  return (
    <ProtectedRoute>
      <DashboardLayout>
        {/* 3D Background */}
        <Suspense fallback={null}>
          <div className="fixed inset-0 -z-10 opacity-50">
            <FloatingShapes3D />
          </div>
        </Suspense>
        
        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dashboard Bendahara</h1>
              <p className="text-muted-foreground">Ringkasan dokumen dan pembayaran perjalanan dinas</p>
            </div>
            
            {/* Date Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd MMM yyyy", { locale: idLocale }) : "Dari Tanggal"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    locale={idLocale}
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd MMM yyyy", { locale: idLocale }) : "Sampai Tanggal"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    locale={idLocale}
                  />
                </PopoverContent>
              </Popover>

              {(startDate || endDate) && (
                <Button variant="ghost" size="icon" onClick={clearDateFilter}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Stats Cards */}
          <BendaharaStatCards
            assignmentCount={stats?.assignmentCount || 0}
            travelCount={stats?.travelCount || 0}
            receiptCount={stats?.receiptCount || 0}
            totalPayment={stats?.totalPayment || 0}
            workerPaymentCount={stats?.workerPaymentCount || 0}
            totalWorkerPayment={stats?.totalWorkerPayment || 0}
            gttPttCount={stats?.gttPttCount || 0}
            totalGttPtt={stats?.totalGttPtt || 0}
            eskulCount={stats?.eskulCount || 0}
            totalEskul={stats?.totalEskul || 0}
            taxPemungutan={stats?.taxPemungutan || 0}
            taxPenyetoran={stats?.taxPenyetoran || 0}
            isLoading={isLoading}
          />

          {/* Tax Stats and Recent Activity in Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <BendaharaRecentCards
                recentReceipts={stats?.recentReceipts || []}
                recentWorkerPayments={stats?.recentWorkerPayments || []}
                recentGttPtt={stats?.recentGttPtt || []}
                recentEskul={stats?.recentEskul || []}
                isLoading={isLoading}
              />
            </div>
            <div>
              <BendaharaTaxStats />
            </div>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}