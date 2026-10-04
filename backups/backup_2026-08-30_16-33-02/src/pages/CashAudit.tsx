import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Plus, FileText, Pencil, Trash2, Eye, Settings, Save, FileCheck, Wallet, Scale, ArrowUpDown, Search, Calendar, Filter, TrendingUp, TrendingDown, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import CashAuditPreview from "@/components/cash-audit/CashAuditPreview";
import CashAuditK7BPreview from "@/components/cash-audit/CashAuditK7BPreview";
import { BudgetStatCard } from "@/components/ui/modern-stat-card";

interface CashAudit {
  id: string;
  audit_date: string;
  sk_number: string | null;
  sk_date: string | null;
  total_penerimaan: number;
  total_pengeluaran: number;
  saldo_buku: number;
  lembar_100000: number;
  lembar_50000: number;
  lembar_20000: number;
  lembar_10000: number;
  lembar_5000: number;
  lembar_2000: number;
  lembar_1000: number;
  keping_1000: number;
  keping_500: number;
  keping_200: number;
  keping_100: number;
  saldo_bank: number;
  surat_berharga: number;
  penjelasan_perbedaan: string | null;
  created_by: string;
  created_at: string;
  sk_period_start_month?: number | null;
  sk_period_start_year?: number | null;
  sk_period_end_month?: number | null;
  sk_period_end_year?: number | null;
}

interface SchoolSettings {
  school_name: string;
  headmaster_name: string;
  headmaster_nip: string | null;
  headmaster_position?: string | null;
  bendahara_name: string | null;
  bendahara_nip: string | null;
}

interface SKSetting {
  id: string;
  year: number;
  sk_number: string | null;
  sk_date: string | null;
  sk_period_start_month?: number | null;
  sk_period_start_year?: number | null;
  sk_period_end_month?: number | null;
  sk_period_end_year?: number | null;
  bendahara_name?: string | null;
  bendahara_nip?: string | null;
  headmaster_name?: string | null;
  headmaster_nip?: string | null;
  headmaster_position?: string | null;
}

const CashAudit = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewAudit, setPreviewAudit] = useState<CashAudit | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showK7BPreview, setShowK7BPreview] = useState(false);
  const [activeTab, setActiveTab] = useState("data");

  // Form state
  const [auditDate, setAuditDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [totalPenerimaan, setTotalPenerimaan] = useState("");
  const [totalPengeluaran, setTotalPengeluaran] = useState("");
  
  // Paper money
  const [lembar100000, setLembar100000] = useState("0");
  const [lembar50000, setLembar50000] = useState("0");
  const [lembar20000, setLembar20000] = useState("0");
  const [lembar10000, setLembar10000] = useState("0");
  const [lembar5000, setLembar5000] = useState("0");
  const [lembar2000, setLembar2000] = useState("0");
  const [lembar1000, setLembar1000] = useState("0");
  
  // Coins
  const [keping1000, setKeping1000] = useState("0");
  const [keping500, setKeping500] = useState("0");
  const [keping200, setKeping200] = useState("0");
  const [keping100, setKeping100] = useState("0");
  
  // Bank and securities
  const [saldoBank, setSaldoBank] = useState("0");
  const [suratBerharga, setSuratBerharga] = useState("0");
  const [penjelasanPerbedaan, setPenjelasanPerbedaan] = useState("");

  // SK Settings state
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [skNumber, setSkNumber] = useState("");
  const [skDate, setSkDate] = useState("");
  const [skStartMonth, setSkStartMonth] = useState<string>("");
  const [skStartYear, setSkStartYear] = useState<string>("");
  const [skEndMonth, setSkEndMonth] = useState<string>("");
  const [skEndYear, setSkEndYear] = useState<string>("");
  const [skBendaharaName, setSkBendaharaName] = useState("");
  const [skBendaharaNip, setSkBendaharaNip] = useState("");
  const [skHeadmasterName, setSkHeadmasterName] = useState("");
  const [skHeadmasterNip, setSkHeadmasterNip] = useState("");
  const [skHeadmasterPosition, setSkHeadmasterPosition] = useState("Kepala Sekolah");

  // Filter and Sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [sortField, setSortField] = useState<"date" | "saldo_buku" | "perbedaan">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Get current year from audit date for auto-populate
  const auditYear = new Date(auditDate).getFullYear();

  // Queries
  const { data: cashAudits, isLoading } = useQuery({
    queryKey: ['cash-audits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_audits')
        .select('*')
        .order('audit_date', { ascending: false });
      if (error) throw error;
      return data as CashAudit[];
    }
  });

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_settings')
        .select('school_name, headmaster_name, headmaster_nip, headmaster_position, bendahara_name, bendahara_nip')
        .single();
      if (error) throw error;
      return data as SchoolSettings;
    }
  });

  const { data: skSettings } = useQuery({
    queryKey: ['sk-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_audit_sk_settings')
        .select('*')
        .order('year', { ascending: false });
      if (error) throw error;
      return data as SKSetting[];
    }
  });

  // Get SK for selected year (for settings tab)
  const { data: selectedYearSK } = useQuery({
    queryKey: ['sk-settings', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_audit_sk_settings')
        .select('*')
        .eq('year', parseInt(selectedYear))
        .maybeSingle();
      if (error) throw error;
      return data as SKSetting | null;
    },
    enabled: !!selectedYear
  });

  // Get SK for audit year (for form auto-populate)
  const { data: auditYearSK } = useQuery({
    queryKey: ['sk-settings', auditYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_audit_sk_settings')
        .select('*')
        .eq('year', auditYear)
        .maybeSingle();
      if (error) throw error;
      return data as SKSetting | null;
    },
    enabled: !!auditYear
  });

  // Update SK settings form when selected year changes
  useEffect(() => {
    if (selectedYearSK) {
      setSkNumber(selectedYearSK.sk_number || "");
      setSkDate(selectedYearSK.sk_date || "");
      setSkStartMonth(selectedYearSK.sk_period_start_month?.toString() || "");
      setSkStartYear(selectedYearSK.sk_period_start_year?.toString() || "");
      setSkEndMonth(selectedYearSK.sk_period_end_month?.toString() || "");
      setSkEndYear(selectedYearSK.sk_period_end_year?.toString() || "");
      setSkBendaharaName(selectedYearSK.bendahara_name || "");
      setSkBendaharaNip(selectedYearSK.bendahara_nip || "");
      setSkHeadmasterName(selectedYearSK.headmaster_name || "");
      setSkHeadmasterNip(selectedYearSK.headmaster_nip || "");
      setSkHeadmasterPosition(selectedYearSK.headmaster_position || "Kepala Sekolah");
    } else {
      setSkNumber("");
      setSkDate("");
      setSkStartMonth("");
      setSkStartYear("");
      setSkEndMonth("");
      setSkEndYear("");
      setSkBendaharaName("");
      setSkBendaharaNip("");
      setSkHeadmasterName("");
      setSkHeadmasterNip("");
      setSkHeadmasterPosition("Kepala Sekolah");
    }
  }, [selectedYearSK]);

  // Helper function to calculate totals for each audit
  const calculateAuditTotals = (audit: CashAudit) => {
    const subJumlah1 = audit.lembar_100000 * 100000 + audit.lembar_50000 * 50000 + 
                       audit.lembar_20000 * 20000 + audit.lembar_10000 * 10000 + 
                       audit.lembar_5000 * 5000 + audit.lembar_2000 * 2000 + audit.lembar_1000 * 1000;
    const subJumlah2 = audit.keping_1000 * 1000 + audit.keping_500 * 500 + 
                       audit.keping_200 * 200 + audit.keping_100 * 100;
    const subJumlah3 = Number(audit.saldo_bank) + Number(audit.surat_berharga);
    const totalKas = subJumlah1 + subJumlah2 + subJumlah3;
    const perbedaan = Number(audit.saldo_buku) - totalKas;
    return { subJumlah1, subJumlah2, subJumlah3, totalKas, perbedaan };
  };

  // Calculate statistics
  const statistics = useMemo(() => {
    if (!cashAudits || cashAudits.length === 0) {
      return {
        totalAudits: 0,
        totalSaldoBuku: 0,
        totalSaldoKas: 0,
        totalPerbedaan: 0,
        averageSaldoBuku: 0,
        latestAudit: null as CashAudit | null,
        positiveVariance: 0,
        negativeVariance: 0
      };
    }

    let totalSaldoBuku = 0;
    let totalSaldoKas = 0;
    let totalPerbedaan = 0;
    let positiveVariance = 0;
    let negativeVariance = 0;

    cashAudits.forEach(audit => {
      const { totalKas, perbedaan } = calculateAuditTotals(audit);
      totalSaldoBuku += Number(audit.saldo_buku);
      totalSaldoKas += totalKas;
      totalPerbedaan += perbedaan;
      if (perbedaan > 0) positiveVariance++;
      if (perbedaan < 0) negativeVariance++;
    });

    return {
      totalAudits: cashAudits.length,
      totalSaldoBuku,
      totalSaldoKas,
      totalPerbedaan,
      averageSaldoBuku: totalSaldoBuku / cashAudits.length,
      latestAudit: cashAudits[0],
      positiveVariance,
      negativeVariance
    };
  }, [cashAudits]);

  // Get unique years from audits
  const availableYears = useMemo(() => {
    if (!cashAudits) return [];
    const years = [...new Set(cashAudits.map(audit => new Date(audit.audit_date).getFullYear()))];
    return years.sort((a, b) => b - a);
  }, [cashAudits]);

  // Filtered and sorted data
  const filteredAndSortedAudits = useMemo(() => {
    if (!cashAudits) return [];

    let result = [...cashAudits];

    // Filter by year
    if (filterYear !== "all") {
      result = result.filter(audit => 
        new Date(audit.audit_date).getFullYear() === parseInt(filterYear)
      );
    }

    // Filter by search query (SK number or date)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(audit => 
        audit.sk_number?.toLowerCase().includes(query) ||
        format(new Date(audit.audit_date), 'dd MMMM yyyy', { locale: localeId }).toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === "date") {
        comparison = new Date(a.audit_date).getTime() - new Date(b.audit_date).getTime();
      } else if (sortField === "saldo_buku") {
        comparison = Number(a.saldo_buku) - Number(b.saldo_buku);
      } else if (sortField === "perbedaan") {
        const perbedaanA = calculateAuditTotals(a).perbedaan;
        const perbedaanB = calculateAuditTotals(b).perbedaan;
        comparison = perbedaanA - perbedaanB;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [cashAudits, filterYear, searchQuery, sortField, sortOrder]);

  const handleSort = (field: "date" | "saldo_buku" | "perbedaan") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilterYear("all");
    setSortField("date");
    setSortOrder("desc");
  };

  // Calculations for form
  const calculateSubJumlah1 = () => {
    return (parseInt(lembar100000) || 0) * 100000 +
           (parseInt(lembar50000) || 0) * 50000 +
           (parseInt(lembar20000) || 0) * 20000 +
           (parseInt(lembar10000) || 0) * 10000 +
           (parseInt(lembar5000) || 0) * 5000 +
           (parseInt(lembar2000) || 0) * 2000 +
           (parseInt(lembar1000) || 0) * 1000;
  };

  const calculateSubJumlah2 = () => {
    return (parseInt(keping1000) || 0) * 1000 +
           (parseInt(keping500) || 0) * 500 +
           (parseInt(keping200) || 0) * 200 +
           (parseInt(keping100) || 0) * 100;
  };

  const calculateSubJumlah3 = () => {
    return (parseFloat(saldoBank) || 0) + (parseFloat(suratBerharga) || 0);
  };

  const calculateTotalKas = () => {
    return calculateSubJumlah1() + calculateSubJumlah2() + calculateSubJumlah3();
  };

  const calculateSaldoBuku = () => {
    return (parseFloat(totalPenerimaan) || 0) - (parseFloat(totalPengeluaran) || 0);
  };

  const calculatePerbedaan = () => {
    return calculateSaldoBuku() - calculateTotalKas();
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from('cash_audits').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-audits'] });
      toast.success('Berita acara berhasil disimpan');
      resetForm();
    },
    onError: (error) => {
      toast.error('Gagal menyimpan: ' + error.message);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from('cash_audits').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-audits'] });
      toast.success('Berita acara berhasil diperbarui');
      resetForm();
    },
    onError: (error) => {
      toast.error('Gagal memperbarui: ' + error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cash_audits').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-audits'] });
      toast.success('Berita acara berhasil dihapus');
    },
    onError: (error) => {
      toast.error('Gagal menghapus: ' + error.message);
    }
  });

  const saveSKMutation = useMutation({
    mutationFn: async () => {
      const year = parseInt(selectedYear);
      const extraFields = {
        sk_period_start_month: skStartMonth ? parseInt(skStartMonth) : null,
        sk_period_start_year: skStartYear ? parseInt(skStartYear) : null,
        sk_period_end_month: skEndMonth ? parseInt(skEndMonth) : null,
        sk_period_end_year: skEndYear ? parseInt(skEndYear) : null,
        bendahara_name: skBendaharaName?.trim() || null,
        bendahara_nip: skBendaharaNip?.trim() || null,
        headmaster_name: skHeadmasterName?.trim() || null,
        headmaster_nip: skHeadmasterNip?.trim() || null,
        headmaster_position: skHeadmasterPosition?.trim() || null,
      };
      const data = {
        year,
        sk_number: skNumber || null,
        sk_date: skDate || null,
        ...extraFields,
        created_by: user?.id,
      };

      if (selectedYearSK) {
        const { error } = await supabase
          .from('cash_audit_sk_settings')
          .update({ sk_number: data.sk_number, sk_date: data.sk_date, ...extraFields })
          .eq('id', selectedYearSK.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cash_audit_sk_settings')
          .insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sk-settings'] });
      toast.success('Pengaturan SK berhasil disimpan');
    },
    onError: (error) => {
      toast.error('Gagal menyimpan: ' + error.message);
    }
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setAuditDate(format(new Date(), 'yyyy-MM-dd'));
    setTotalPenerimaan("");
    setTotalPengeluaran("");
    setLembar100000("0");
    setLembar50000("0");
    setLembar20000("0");
    setLembar10000("0");
    setLembar5000("0");
    setLembar2000("0");
    setLembar1000("0");
    setKeping1000("0");
    setKeping500("0");
    setKeping200("0");
    setKeping100("0");
    setSaldoBank("0");
    setSuratBerharga("0");
    setPenjelasanPerbedaan("");
  };

  const handleEdit = (audit: CashAudit) => {
    setEditingId(audit.id);
    setAuditDate(audit.audit_date);
    setTotalPenerimaan(audit.total_penerimaan.toString());
    setTotalPengeluaran(audit.total_pengeluaran.toString());
    setLembar100000(audit.lembar_100000.toString());
    setLembar50000(audit.lembar_50000.toString());
    setLembar20000(audit.lembar_20000.toString());
    setLembar10000(audit.lembar_10000.toString());
    setLembar5000(audit.lembar_5000.toString());
    setLembar2000(audit.lembar_2000.toString());
    setLembar1000(audit.lembar_1000.toString());
    setKeping1000(audit.keping_1000.toString());
    setKeping500(audit.keping_500.toString());
    setKeping200(audit.keping_200.toString());
    setKeping100(audit.keping_100.toString());
    setSaldoBank(audit.saldo_bank.toString());
    setSuratBerharga(audit.surat_berharga.toString());
    setPenjelasanPerbedaan(audit.penjelasan_perbedaan || "");
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!totalPenerimaan || !totalPengeluaran) {
      toast.error('Total penerimaan dan pengeluaran harus diisi');
      return;
    }

    // Get SK from settings based on audit year
    const skForYear = auditYearSK;

    const data = {
      audit_date: auditDate,
      sk_number: skForYear?.sk_number || null,
      sk_date: skForYear?.sk_date || null,
      total_penerimaan: parseFloat(totalPenerimaan) || 0,
      total_pengeluaran: parseFloat(totalPengeluaran) || 0,
      lembar_100000: parseInt(lembar100000) || 0,
      lembar_50000: parseInt(lembar50000) || 0,
      lembar_20000: parseInt(lembar20000) || 0,
      lembar_10000: parseInt(lembar10000) || 0,
      lembar_5000: parseInt(lembar5000) || 0,
      lembar_2000: parseInt(lembar2000) || 0,
      lembar_1000: parseInt(lembar1000) || 0,
      keping_1000: parseInt(keping1000) || 0,
      keping_500: parseInt(keping500) || 0,
      keping_200: parseInt(keping200) || 0,
      keping_100: parseInt(keping100) || 0,
      saldo_bank: parseFloat(saldoBank) || 0,
      surat_berharga: parseFloat(suratBerharga) || 0,
      penjelasan_perbedaan: penjelasanPerbedaan || null,
      created_by: user?.id,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);
  };

  // Find best SK for an audit: match by SK period (month/year range), fall back to year
  const findSkForAudit = (audit: CashAudit) => {
    if (!skSettings?.length) return null;
    const d = new Date(audit.audit_date);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const inPeriod = skSettings.find((s) => {
      const sm = s.sk_period_start_month, sy = s.sk_period_start_year;
      const em = s.sk_period_end_month, ey = s.sk_period_end_year;
      if (!sm || !sy || !em || !ey) return false;
      const startKey = sy * 12 + (sm - 1);
      const endKey = ey * 12 + (em - 1);
      const auditKey = y * 12 + (m - 1);
      return auditKey >= startKey && auditKey <= endKey;
    });
    return inPeriod || skSettings.find((s) => s.year === y) || null;
  };

  const enrichAuditWithSk = (audit: CashAudit): CashAudit => {
    const sk = findSkForAudit(audit);
    if (!sk) return audit;
    return {
      ...audit,
      sk_number: audit.sk_number || sk.sk_number || null,
      sk_date: audit.sk_date || sk.sk_date || null,
      sk_period_start_month: sk.sk_period_start_month ?? null,
      sk_period_start_year: sk.sk_period_start_year ?? null,
      sk_period_end_month: sk.sk_period_end_month ?? null,
      sk_period_end_year: sk.sk_period_end_year ?? null,
      sk_bendahara_name: sk.bendahara_name ?? null,
      sk_bendahara_nip: sk.bendahara_nip ?? null,
      sk_headmaster_name: sk.headmaster_name ?? null,
      sk_headmaster_nip: sk.headmaster_nip ?? null,
      sk_headmaster_position: sk.headmaster_position ?? null,
    } as any;
  };

  const handlePreviewK7C = (audit: CashAudit) => {
    setPreviewAudit(enrichAuditWithSk(audit));
    setShowPreview(true);
  };

  const handlePreviewK7B = (audit: CashAudit) => {
    setPreviewAudit(enrichAuditWithSk(audit));
    setShowK7BPreview(true);
  };

  // Generate year options
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Berita Acara Pemeriksaan Kas</h1>
            <p className="text-muted-foreground">Formulir BOS-K7B & BOS-K7C</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="data">Data Pemeriksaan Kas</TabsTrigger>
            <TabsTrigger value="settings">Pengaturan SK</TabsTrigger>
          </TabsList>

          <TabsContent value="data" className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <BudgetStatCard
                title="Total Pemeriksaan"
                amount={statistics.totalAudits}
                subtitle={`${statistics.positiveVariance} surplus, ${statistics.negativeVariance} defisit`}
                icon={<FileCheck className="h-5 w-5" />}
                type="budget"
              />
              <BudgetStatCard
                title="Rata-rata Saldo Buku"
                amount={statistics.averageSaldoBuku}
                subtitle="Per pemeriksaan"
                icon={<Wallet className="h-5 w-5" />}
                type="income"
              />
              <BudgetStatCard
                title="Total Selisih"
                amount={statistics.totalPerbedaan}
                subtitle={statistics.totalPerbedaan >= 0 ? "Surplus" : "Defisit"}
                icon={statistics.totalPerbedaan >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                type="balance"
              />
              <BudgetStatCard
                title="Pemeriksaan Terakhir"
                amount={statistics.latestAudit ? Number(statistics.latestAudit.saldo_buku) : 0}
                subtitle={statistics.latestAudit ? format(new Date(statistics.latestAudit.audit_date), 'dd MMM yyyy', { locale: localeId }) : 'Belum ada data'}
                icon={<Scale className="h-5 w-5" />}
                type="budget"
              />
            </div>

            {/* Filter and Sorting */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 space-y-2">
                    <Label className="flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Cari
                    </Label>
                    <Input
                      placeholder="Cari berdasarkan No. SK atau tanggal..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="w-full md:w-48 space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Tahun
                    </Label>
                    <Select value={filterYear} onValueChange={setFilterYear}>
                      <SelectTrigger>
                        <SelectValue placeholder="Semua tahun" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Tahun</SelectItem>
                        {availableYears.map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full md:w-48 space-y-2">
                    <Label className="flex items-center gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      Urutkan
                    </Label>
                    <Select value={sortField} onValueChange={(v) => setSortField(v as "date" | "saldo_buku" | "perbedaan")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih urutan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Tanggal</SelectItem>
                        <SelectItem value="saldo_buku">Saldo Buku</SelectItem>
                        <SelectItem value="perbedaan">Perbedaan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    title={sortOrder === "asc" ? "Ascending" : "Descending"}
                  >
                    <ArrowUpDown className={`h-4 w-4 ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                  </Button>
                  {(searchQuery || filterYear !== "all") && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-4 w-4 mr-1" />
                      Reset
                    </Button>
                  )}
                </div>
                {(searchQuery || filterYear !== "all") && (
                  <p className="text-sm text-muted-foreground mt-3">
                    Menampilkan {filteredAndSortedAudits.length} dari {cashAudits?.length || 0} data
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={() => setShowForm(!showForm)}>
                <Plus className="h-4 w-4 mr-2" />
                {showForm ? 'Tutup Form' : 'Buat Baru'}
              </Button>
            </div>

            {showForm && (
              <Card>
                <CardHeader>
                  <CardTitle>{editingId ? 'Edit' : 'Buat'} Berita Acara Pemeriksaan Kas</CardTitle>
                  {auditYearSK && (
                    <CardDescription>
                      SK Tahun {auditYear}: {auditYearSK.sk_number || '-'} | Tanggal: {auditYearSK.sk_date ? format(new Date(auditYearSK.sk_date), 'dd MMMM yyyy', { locale: localeId }) : '-'}
                    </CardDescription>
                  )}
                  {!auditYearSK && (
                    <CardDescription className="text-yellow-600">
                      Belum ada pengaturan SK untuk tahun {auditYear}. Silakan atur di tab Pengaturan SK.
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tanggal Pemeriksaan</Label>
                      <Input type="date" value={auditDate} onChange={(e) => setAuditDate(e.target.value)} />
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Jumlah Total Penerimaan (D)</Label>
                      <Input type="number" placeholder="0" value={totalPenerimaan} onChange={(e) => setTotalPenerimaan(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Jumlah Total Pengeluaran (K)</Label>
                      <Input type="number" placeholder="0" value={totalPengeluaran} onChange={(e) => setTotalPengeluaran(e.target.value)} />
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-lg font-semibold">Saldo Buku (A = D - K): {formatCurrency(calculateSaldoBuku())}</p>
                  </div>

                  {/* Paper Money */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">1. Lembaran Uang Kertas</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                      <div className="space-y-2">
                        <Label>Rp 100.000</Label>
                        <Input type="number" min="0" value={lembar100000} onChange={(e) => setLembar100000(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Rp 50.000</Label>
                        <Input type="number" min="0" value={lembar50000} onChange={(e) => setLembar50000(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Rp 20.000</Label>
                        <Input type="number" min="0" value={lembar20000} onChange={(e) => setLembar20000(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Rp 10.000</Label>
                        <Input type="number" min="0" value={lembar10000} onChange={(e) => setLembar10000(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Rp 5.000</Label>
                        <Input type="number" min="0" value={lembar5000} onChange={(e) => setLembar5000(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Rp 2.000</Label>
                        <Input type="number" min="0" value={lembar2000} onChange={(e) => setLembar2000(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Rp 1.000</Label>
                        <Input type="number" min="0" value={lembar1000} onChange={(e) => setLembar1000(e.target.value)} />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">Sub Jumlah (1): {formatCurrency(calculateSubJumlah1())}</p>
                  </div>

                  {/* Coins */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">2. Keping Uang Logam</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Rp 1.000</Label>
                        <Input type="number" min="0" value={keping1000} onChange={(e) => setKeping1000(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Rp 500</Label>
                        <Input type="number" min="0" value={keping500} onChange={(e) => setKeping500(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Rp 200</Label>
                        <Input type="number" min="0" value={keping200} onChange={(e) => setKeping200(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Rp 100</Label>
                        <Input type="number" min="0" value={keping100} onChange={(e) => setKeping100(e.target.value)} />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">Sub Jumlah (2): {formatCurrency(calculateSubJumlah2())}</p>
                  </div>

                  {/* Bank and Securities */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">3. Saldo Bank, Surat Berharga dll</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Saldo Bank</Label>
                        <Input type="number" min="0" value={saldoBank} onChange={(e) => setSaldoBank(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Surat Berharga dll</Label>
                        <Input type="number" min="0" value={suratBerharga} onChange={(e) => setSuratBerharga(e.target.value)} />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">Sub Jumlah (3): {formatCurrency(calculateSubJumlah3())}</p>
                  </div>

                  {/* Summary */}
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <p className="font-semibold">Jumlah Saldo Kas (B = 1 + 2 + 3): {formatCurrency(calculateTotalKas())}</p>
                    <p className="font-semibold">Perbedaan (A - B): {formatCurrency(calculatePerbedaan())}</p>
                  </div>

                  {/* Explanation */}
                  <div className="space-y-2">
                    <Label>Penjelasan Perbedaan</Label>
                    <Textarea 
                      placeholder="Karena Bunga Bank, dll." 
                      value={penjelasanPerbedaan} 
                      onChange={(e) => setPenjelasanPerbedaan(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                      {editingId ? 'Simpan Perubahan' : 'Simpan'}
                    </Button>
                    <Button variant="outline" onClick={resetForm}>Batal</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Daftar Berita Acara</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {filteredAndSortedAudits.length} data
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-center py-4">Memuat data...</p>
                ) : filteredAndSortedAudits.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleSort("date")}
                          >
                            <div className="flex items-center gap-1">
                              Tanggal
                              {sortField === "date" && (
                                <ArrowUpDown className={`h-3 w-3 ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                              )}
                            </div>
                          </TableHead>
                          <TableHead>No. SK</TableHead>
                          <TableHead 
                            className="text-right cursor-pointer hover:bg-muted/50"
                            onClick={() => handleSort("saldo_buku")}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Saldo Buku
                              {sortField === "saldo_buku" && (
                                <ArrowUpDown className={`h-3 w-3 ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="text-right">Saldo Kas</TableHead>
                          <TableHead 
                            className="text-right cursor-pointer hover:bg-muted/50"
                            onClick={() => handleSort("perbedaan")}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Perbedaan
                              {sortField === "perbedaan" && (
                                <ArrowUpDown className={`h-3 w-3 ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAndSortedAudits.map((audit) => {
                          const { totalKas, perbedaan } = calculateAuditTotals(audit);

                          return (
                            <TableRow key={audit.id}>
                              <TableCell>{format(new Date(audit.audit_date), 'dd MMMM yyyy', { locale: localeId })}</TableCell>
                              <TableCell>{audit.sk_number || '-'}</TableCell>
                              <TableCell className="text-right">{formatCurrency(Number(audit.saldo_buku))}</TableCell>
                              <TableCell className="text-right">{formatCurrency(totalKas)}</TableCell>
                              <TableCell className={`text-right font-medium ${perbedaan > 0 ? 'text-emerald-600' : perbedaan < 0 ? 'text-rose-600' : ''}`}>
                                {formatCurrency(perbedaan)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => handlePreviewK7B(audit)} title="Preview K7B">
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handlePreviewK7C(audit)} title="Preview K7C">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleEdit(audit)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Hapus Berita Acara?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Tindakan ini tidak dapat dibatalkan.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Batal</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteMutation.mutate(audit.id)}>
                                          Hapus
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : cashAudits && cashAudits.length > 0 ? (
                  <p className="text-center py-4 text-muted-foreground">Tidak ada data yang sesuai dengan filter.</p>
                ) : (
                  <p className="text-center py-4 text-muted-foreground">Belum ada data berita acara.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Pengaturan SK per Tahun
                </CardTitle>
                <CardDescription>
                  Atur nomor dan tanggal SK untuk setiap tahun. Data SK akan otomatis digunakan saat membuat berita acara.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Tahun</Label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih tahun" />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nomor SK</Label>
                    <Input 
                      placeholder="No. 28/421.2/SDN 36 C/I/2024" 
                      value={skNumber} 
                      onChange={(e) => setSkNumber(e.target.value)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tanggal SK</Label>
                    <Input 
                      type="date" 
                      value={skDate} 
                      onChange={(e) => setSkDate(e.target.value)} 
                    />
                  </div>
                </div>

                <div className="space-y-2 border-t pt-4">
                  <Label className="text-sm font-semibold">Periode Berlaku SK Bendahara</Label>
                  <p className="text-xs text-muted-foreground">Bulan & tahun masa berlaku SK ini akan tercetak pada dokumen pemeriksaan kas.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Bulan Mulai</Label>
                      <Select value={skStartMonth} onValueChange={setSkStartMonth}>
                        <SelectTrigger><SelectValue placeholder="Pilih bulan" /></SelectTrigger>
                        <SelectContent>
                          {['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'].map((m, i) => (
                            <SelectItem key={i+1} value={(i+1).toString()}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tahun Mulai</Label>
                      <Input type="number" placeholder="2026" value={skStartYear} onChange={(e) => setSkStartYear(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Bulan Akhir</Label>
                      <Select value={skEndMonth} onValueChange={setSkEndMonth}>
                        <SelectTrigger><SelectValue placeholder="Pilih bulan" /></SelectTrigger>
                        <SelectContent>
                          {['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'].map((m, i) => (
                            <SelectItem key={i+1} value={(i+1).toString()}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tahun Akhir</Label>
                      <Input type="number" placeholder="2026" value={skEndYear} onChange={(e) => setSkEndYear(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <Label className="text-sm font-semibold">Pejabat sesuai SK (Periode ini)</Label>
                  <p className="text-xs text-muted-foreground">Nama & NIP Bendahara dan Kepala Sekolah / Plt. yang berlaku pada periode SK ini. Otomatis muncul pada Register Penutupan Kas (K7B) dan Berita Acara Pemeriksaan Kas (K7C). Kosongkan untuk memakai data global.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Nama Bendahara</Label>
                      <Input placeholder="Nama bendahara" value={skBendaharaName} onChange={(e) => setSkBendaharaName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">NIP Bendahara</Label>
                      <Input placeholder="NIP bendahara" value={skBendaharaNip} onChange={(e) => setSkBendaharaNip(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nama Kepala Sekolah / Plt.</Label>
                      <Input placeholder="Nama kepsek" value={skHeadmasterName} onChange={(e) => setSkHeadmasterName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">NIP Kepala Sekolah / Plt.</Label>
                      <Input placeholder="NIP kepsek" value={skHeadmasterNip} onChange={(e) => setSkHeadmasterNip(e.target.value)} />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Jabatan</Label>
                      <Select value={skHeadmasterPosition} onValueChange={setSkHeadmasterPosition}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Kepala Sekolah">Kepala Sekolah</SelectItem>
                          <SelectItem value="Plt. Kepala Sekolah">Plt. Kepala Sekolah</SelectItem>
                          <SelectItem value="Pj. Kepala Sekolah">Pj. Kepala Sekolah</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Button onClick={() => saveSKMutation.mutate()} disabled={saveSKMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  Simpan Pengaturan SK
                </Button>

                {/* List of SK Settings */}
                {skSettings && skSettings.length > 0 && (
                  <div className="mt-6">
                    <h4 className="font-semibold mb-3">Daftar SK yang Tersimpan</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tahun</TableHead>
                          <TableHead>Nomor SK</TableHead>
                          <TableHead>Tanggal SK</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {skSettings.map((sk) => (
                          <TableRow key={sk.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedYear(sk.year.toString())}>
                            <TableCell className="font-medium">{sk.year}</TableCell>
                            <TableCell>{sk.sk_number || '-'}</TableCell>
                            <TableCell>{sk.sk_date ? format(new Date(sk.sk_date), 'dd MMMM yyyy', { locale: localeId }) : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {previewAudit && schoolSettings && (
        <>
          <CashAuditPreview
            open={showPreview}
            onOpenChange={setShowPreview}
            audit={previewAudit}
            schoolSettings={schoolSettings}
          />
          <CashAuditK7BPreview
            open={showK7BPreview}
            onOpenChange={setShowK7BPreview}
            audit={previewAudit}
            schoolSettings={schoolSettings}
          />
        </>
      )}
    </DashboardLayout>
  );
};

export default CashAudit;
