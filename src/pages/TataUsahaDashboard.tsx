import { useState, lazy, Suspense } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, eachMonthOfInterval } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TataUsahaStatCards } from "@/components/dashboard/TataUsahaStatCards";
import { TataUsahaRecentCards } from "@/components/dashboard/TataUsahaRecentCards";
import { TataUsahaCharts } from "@/components/dashboard/TataUsahaCharts";
import { TataUsahaPenggajianCards } from "@/components/dashboard/TataUsahaPenggajianCards";

// Lazy load 3D component
const FloatingShapes3D = lazy(() => import('@/components/3d/FloatingShapes').then(m => ({ default: m.FloatingShapes3D })));

export default function TataUsahaDashboard() {
  const [startDate, setStartDate] = useState<Date | undefined>(startOfYear(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(new Date()));

  // Fetch statistics with date filter
  const { data: stats, isLoading } = useQuery({
    queryKey: ["tata-usaha-stats", startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let suratMasukQuery = supabase
        .from("surat_masuk")
        .select("id, tanggal_diterima, kategori");
      
      let suratKeluarQuery = supabase
        .from("surat_keluar")
        .select("id, tanggal_surat, kategori");
      
      let disposisiQuery = supabase
        .from("disposisi_surat")
        .select("id, tanggal_disposisi, status");

      let assignmentQuery = supabase
        .from("assignment_letters")
        .select("*", { count: "exact", head: true });
      
      let travelQuery = supabase
        .from("official_travel_letters")
        .select("*", { count: "exact", head: true });
      
      let receiptsQuery = supabase
        .from("payment_receipts")
        .select("amount");

      // Apply date filters
      if (startDate) {
        const startStr = format(startDate, "yyyy-MM-dd");
        suratMasukQuery = suratMasukQuery.gte("tanggal_diterima", startStr);
        suratKeluarQuery = suratKeluarQuery.gte("tanggal_surat", startStr);
        disposisiQuery = disposisiQuery.gte("tanggal_disposisi", startStr);
        assignmentQuery = assignmentQuery.gte("letter_date", startStr);
        travelQuery = travelQuery.gte("letter_date", startStr);
        receiptsQuery = receiptsQuery.gte("receipt_date", startStr);
      }
      if (endDate) {
        const endStr = format(endDate, "yyyy-MM-dd");
        suratMasukQuery = suratMasukQuery.lte("tanggal_diterima", endStr);
        suratKeluarQuery = suratKeluarQuery.lte("tanggal_surat", endStr);
        disposisiQuery = disposisiQuery.lte("tanggal_disposisi", endStr);
        assignmentQuery = assignmentQuery.lte("letter_date", endStr);
        travelQuery = travelQuery.lte("letter_date", endStr);
        receiptsQuery = receiptsQuery.lte("receipt_date", endStr);
      }

      const [suratMasukResult, suratKeluarResult, disposisiResult, assignmentResult, travelResult, receiptsResult] = await Promise.all([
        suratMasukQuery,
        suratKeluarQuery,
        disposisiQuery,
        assignmentQuery,
        travelQuery,
        receiptsQuery
      ]);

      if (suratMasukResult.error) throw suratMasukResult.error;
      if (suratKeluarResult.error) throw suratKeluarResult.error;
      if (disposisiResult.error) throw disposisiResult.error;
      if (assignmentResult.error) throw assignmentResult.error;
      if (travelResult.error) throw travelResult.error;
      if (receiptsResult.error) throw receiptsResult.error;

      const receiptCount = receiptsResult.data?.length || 0;
      const totalPayment = receiptsResult.data?.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0;

      // Aggregate monthly data for charts
      const months = startDate && endDate 
        ? eachMonthOfInterval({ start: startDate, end: endDate })
        : eachMonthOfInterval({ start: startOfYear(new Date()), end: new Date() });

      const monthlyData = months.map(month => {
        const monthStr = format(month, "yyyy-MM");
        const masuk = suratMasukResult.data?.filter(s => s.tanggal_diterima?.startsWith(monthStr)).length || 0;
        const keluar = suratKeluarResult.data?.filter(s => s.tanggal_surat?.startsWith(monthStr)).length || 0;
        const disposisi = disposisiResult.data?.filter(s => s.tanggal_disposisi?.startsWith(monthStr)).length || 0;
        
        return {
          month: format(month, "MMM", { locale: idLocale }),
          masuk,
          keluar,
          disposisi
        };
      });

      // Aggregate by category
      const categoryCount: Record<string, { masuk: number; keluar: number }> = {};
      
      suratMasukResult.data?.forEach(s => {
        const cat = s.kategori || 'umum';
        if (!categoryCount[cat]) categoryCount[cat] = { masuk: 0, keluar: 0 };
        categoryCount[cat].masuk++;
      });
      
      suratKeluarResult.data?.forEach(s => {
        const cat = s.kategori || 'umum';
        if (!categoryCount[cat]) categoryCount[cat] = { masuk: 0, keluar: 0 };
        categoryCount[cat].keluar++;
      });

      const categoryData = Object.entries(categoryCount).map(([kategori, counts]) => ({
        kategori: kategori.charAt(0).toUpperCase() + kategori.slice(1),
        masuk: counts.masuk,
        keluar: counts.keluar,
        total: counts.masuk + counts.keluar
      }));

      // Disposisi status breakdown
      const disposisiPending = disposisiResult.data?.filter(d => d.status === 'pending').length || 0;
      const disposisiInReview = disposisiResult.data?.filter(d => d.status === 'in_review').length || 0;
      const disposisiResolved = disposisiResult.data?.filter(d => d.status === 'resolved').length || 0;

      // Fetch recent data
      let recentMasukQuery = supabase
        .from("surat_masuk")
        .select("id, nomor_surat, tanggal_diterima, perihal, pengirim, kategori")
        .order("tanggal_diterima", { ascending: false })
        .limit(5);

      let recentKeluarQuery = supabase
        .from("surat_keluar")
        .select("id, nomor_surat, tanggal_surat, perihal, tujuan, kategori")
        .order("tanggal_surat", { ascending: false })
        .limit(5);

      let recentDisposisiQuery = supabase
        .from("disposisi_surat")
        .select("id, tanggal_disposisi, tujuan_disposisi, instruksi, status, surat_masuk_id")
        .order("tanggal_disposisi", { ascending: false })
        .limit(5);

      if (startDate) {
        const startStr = format(startDate, "yyyy-MM-dd");
        recentMasukQuery = recentMasukQuery.gte("tanggal_diterima", startStr);
        recentKeluarQuery = recentKeluarQuery.gte("tanggal_surat", startStr);
        recentDisposisiQuery = recentDisposisiQuery.gte("tanggal_disposisi", startStr);
      }
      if (endDate) {
        const endStr = format(endDate, "yyyy-MM-dd");
        recentMasukQuery = recentMasukQuery.lte("tanggal_diterima", endStr);
        recentKeluarQuery = recentKeluarQuery.lte("tanggal_surat", endStr);
        recentDisposisiQuery = recentDisposisiQuery.lte("tanggal_disposisi", endStr);
      }

      const [recentMasuk, recentKeluar, recentDisposisi] = await Promise.all([
        recentMasukQuery,
        recentKeluarQuery,
        recentDisposisiQuery
      ]);

      if (recentMasuk.error) throw recentMasuk.error;
      if (recentKeluar.error) throw recentKeluar.error;
      if (recentDisposisi.error) throw recentDisposisi.error;

      return {
        suratMasukCount: suratMasukResult.data?.length || 0,
        suratKeluarCount: suratKeluarResult.data?.length || 0,
        disposisiCount: disposisiResult.data?.length || 0,
        disposisiPending,
        disposisiInReview,
        disposisiResolved,
        assignmentCount: assignmentResult.count || 0,
        travelCount: travelResult.count || 0,
        receiptCount,
        totalPayment,
        monthlyData,
        categoryData,
        recentMasuk: recentMasuk.data || [],
        recentKeluar: recentKeluar.data || [],
        recentDisposisi: recentDisposisi.data || [],
      };
    },
  });

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
              <h1 className="text-2xl font-bold text-foreground">Dashboard Tata Usaha</h1>
              <p className="text-muted-foreground">Ringkasan dokumen dan surat menyurat</p>
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
          <TataUsahaStatCards
            suratMasukCount={stats?.suratMasukCount || 0}
            suratKeluarCount={stats?.suratKeluarCount || 0}
            disposisiCount={stats?.disposisiCount || 0}
            disposisiPending={stats?.disposisiPending || 0}
            assignmentCount={stats?.assignmentCount || 0}
            travelCount={stats?.travelCount || 0}
            isLoading={isLoading}
          />

          {/* Charts */}
          <TataUsahaCharts
            monthlyData={stats?.monthlyData || []}
            categoryData={stats?.categoryData || []}
            disposisiPending={stats?.disposisiPending || 0}
            disposisiInReview={stats?.disposisiInReview || 0}
            disposisiResolved={stats?.disposisiResolved || 0}
            isLoading={isLoading}
          />

          {/* Recent Activity */}
          <TataUsahaRecentCards
            recentMasuk={stats?.recentMasuk || []}
            recentKeluar={stats?.recentKeluar || []}
            recentDisposisi={stats?.recentDisposisi || []}
            isLoading={isLoading}
          />
           {/* ===== BARU: Penggajian & Honorarium ===== */}
          <TataUsahaPenggajianCards
            startDate={startDate}
            endDate={endDate}
          />
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
