import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Eye, Loader2, Calendar, DollarSign, RefreshCw, Wallet, BarChart3, FolderOpen, Layers, Hash, GraduationCap } from "lucide-react";
import { BudgetStatCard, ModernStatCard } from "@/components/ui/modern-stat-card";
import { BudgetStatisticsSection } from "@/components/ui/budget-statistics-card";
import { MakanMinumCard } from "@/components/MakanMinumCard";
import * as pdfjsLib from "pdfjs-dist";
import { ImportRKAS } from "@/components/ImportRKAS";
import { CreateRKASForm } from "@/components/CreateRKASForm";
// Set worker - use unpkg CDN for better compatibility with pdfjs-dist v4
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const MONTHS = [
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

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

interface RKASItem {
  category: string;
  main_category?: string;
  sub_category?: string;
  kode_rekening?: string;
  kode_kegiatan?: string;
  activity_name: string;
  description?: string;
  volume: number;
  unit: string;
  unit_price: number;
  total_amount: number;
}

// Main budget categories for B. BELANJA
const BUDGET_CATEGORIES = [
  { kode: "03", name: "Pengembangan Standar Proses" },
  { kode: "04", name: "Pengembangan Pendidik dan Tenaga Kependidikan" },
  { kode: "05", name: "Pengembangan Sarana dan Prasarana Sekolah" },
  { kode: "06", name: "Pengembangan Standar Pengelolaan" },
  { kode: "07", name: "Pengembangan Standar Pembiayaan" },
];

interface RKASSummary {
  category: string;
  total: number;
}

interface ParsedRKASData {
  items: RKASItem[];
  summary: RKASSummary[];
  total_budget: number;
  parse_error?: string;
}

// Activity type groupings - group similar budget codes together
const ACTIVITY_GROUP_MAPPING: Record<string, string[]> = {
  "Perjalanan Dinas": ["biaya perjalanan dinas", "bantuan transportasi", "transport", "perjalanan", "transpor"],
  "Honorarium": ["honor", "honorarium", "insentif", "tunjangan"],
  "ATK & Perlengkapan": ["atk", "alat tulis", "perlengkapan", "material", "bahan"],
  "Konsumsi & Makan": ["konsumsi", "makan", "snack", "minum"],
  "Pengadaan": ["pengadaan", "pembelian", "belanja"],
  "Jasa & Layanan": ["jasa", "layanan", "service", "pemeliharaan", "perawatan"],
  "Pelatihan & Workshop": ["pelatihan", "workshop", "diklat", "bimtek", "sosialisasi"],
};

const getActivityGroup = (activityName: string): string => {
  const lowerName = activityName.toLowerCase();
  for (const [group, keywords] of Object.entries(ACTIVITY_GROUP_MAPPING)) {
    if (keywords.some(keyword => lowerName.includes(keyword))) {
      return group;
    }
  }
  return "Lainnya";
};

const RKASManagement = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCategoryDetailOpen, setIsCategoryDetailOpen] = useState(false);
  const [isRekeningDetailOpen, setIsRekeningDetailOpen] = useState(false);
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<{ kode: string; name: string; subProgram?: string; total: number; count: number } | null>(null);
  const [selectedRekeningDetail, setSelectedRekeningDetail] = useState<{ kode: string; total: number; count: number; activities: string[] } | null>(null);
  const [selectedRKAS, setSelectedRKAS] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [filterMonthStart, setFilterMonthStart] = useState<number | null>(null);
  const [filterMonthEnd, setFilterMonthEnd] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterKodeKegiatan, setFilterKodeKegiatan] = useState<string>("all");
  const [filterKodeRekening, setFilterKodeRekening] = useState<string>("all");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isBulkReparsing, setIsBulkReparsing] = useState(false);
  const [bulkReparseProgress, setBulkReparseProgress] = useState({ current: 0, total: 0 });

  // Fetch kode kegiatan labels from database
  const { data: kodeKegiatanLabels } = useQuery({
    queryKey: ['kode-kegiatan-labels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kode_kegiatan_labels')
        .select('*');
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch kode rekening labels from database
  const { data: kodeRekeningLabels } = useQuery({
    queryKey: ['kode-rekening-labels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kode_rekening_labels')
        .select('*');
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Create lookup maps from database data
  const kodeKegiatanMap = useMemo(() => {
    const map: Record<string, { program: string; sub_program: string }> = {};
    kodeKegiatanLabels?.forEach(item => {
      map[item.kode] = { 
        program: item.program || item.keterangan || '',
        sub_program: item.sub_program || ''
      };
    });
    return map;
  }, [kodeKegiatanLabels]);

  const kodeRekeningMap = useMemo(() => {
    const map: Record<string, string> = {};
    kodeRekeningLabels?.forEach(item => {
      map[item.kode] = item.keterangan;
    });
    return map;
  }, [kodeRekeningLabels]);

  // Helper function untuk mendapatkan keterangan kode kegiatan (Program)
  const getKodeKegiatanLabel = (code: string): string => {
    if (!code) return 'Tanpa Kode';
    // Try exact match first
    if (kodeKegiatanMap[code]) return kodeKegiatanMap[code].program;
    // Try with trailing dot
    const codeWithDot = code.endsWith('.') ? code : `${code}.`;
    if (kodeKegiatanMap[codeWithDot]) return kodeKegiatanMap[codeWithDot].program;
    // Try without trailing dot
    const codeWithoutDot = code.replace(/\.$/, '');
    if (kodeKegiatanMap[codeWithoutDot]) return kodeKegiatanMap[codeWithoutDot].program;
    return 'Kegiatan Lainnya';
  };

  // Helper function untuk mendapatkan Sub Program kode kegiatan
  const getKodeKegiatanSubProgram = (code: string): string => {
    if (!code) return '';
    // Try exact match first
    if (kodeKegiatanMap[code]) return kodeKegiatanMap[code].sub_program;
    // Try with trailing dot
    const codeWithDot = code.endsWith('.') ? code : `${code}.`;
    if (kodeKegiatanMap[codeWithDot]) return kodeKegiatanMap[codeWithDot].sub_program;
    // Try without trailing dot
    const codeWithoutDot = code.replace(/\.$/, '');
    if (kodeKegiatanMap[codeWithoutDot]) return kodeKegiatanMap[codeWithoutDot].sub_program;
    return '';
  };

  // Helper function untuk mendapatkan keterangan kode rekening
  const getKodeRekeningLabel = (code: string): string => {
    if (!code) return 'Tanpa Kode';
    if (kodeRekeningMap[code]) return kodeRekeningMap[code];
    // Try to find partial match for prefix
    const prefix = code.substring(0, 14); // e.g., "5.1.02.02.01."
    const matchingKey = Object.keys(kodeRekeningMap).find(key => key.startsWith(prefix));
    if (matchingKey) {
      return kodeRekeningMap[matchingKey];
    }
    return 'Belanja Lainnya';
  };

  // Fetch RKAS documents
  const { data: rkasDocuments, isLoading } = useQuery({
    queryKey: ["rkas-documents", filterYear, filterMonthStart, filterMonthEnd],
    queryFn: async () => {
      let query = supabase
        .from("rkas_documents")
        .select("*")
        .eq("year", filterYear)
        .order("month", { ascending: true });

      // Apply month range filter
      if (filterMonthStart !== null && filterMonthEnd !== null) {
        query = query.gte("month", filterMonthStart).lte("month", filterMonthEnd);
      } else if (filterMonthStart !== null) {
        query = query.gte("month", filterMonthStart);
      } else if (filterMonthEnd !== null) {
        query = query.lte("month", filterMonthEnd);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch all RKAS items for filtered documents (for statistics) - include month info
  const { data: allFilteredItems } = useQuery({
    queryKey: ["rkas-items-filtered", filterYear, filterMonthStart, filterMonthEnd],
    queryFn: async () => {
      // First get document IDs based on filter
      let docQuery = supabase
        .from("rkas_documents")
        .select("id, month, year")
        .eq("year", filterYear);

      // Apply month range filter
      if (filterMonthStart !== null && filterMonthEnd !== null) {
        docQuery = docQuery.gte("month", filterMonthStart).lte("month", filterMonthEnd);
      } else if (filterMonthStart !== null) {
        docQuery = docQuery.gte("month", filterMonthStart);
      } else if (filterMonthEnd !== null) {
        docQuery = docQuery.lte("month", filterMonthEnd);
      }

      const { data: docs, error: docError } = await docQuery;
      if (docError) throw docError;
      if (!docs || docs.length === 0) return [];

      const docIds = docs.map(d => d.id);
      const docMap = new Map(docs.map(d => [d.id, { month: d.month, year: d.year }]));
      
      const { data, error } = await supabase
        .from("rkas_items")
        .select("*")
        .in("rkas_id", docIds)
        .order("category", { ascending: true });

      if (error) throw error;
      
      // Add month info to each item
      return (data || []).map(item => ({
        ...item,
        doc_month: docMap.get(item.rkas_id)?.month,
        doc_year: docMap.get(item.rkas_id)?.year,
      }));
    },
  });

  // Apply kode_rekening filter to all items for statistics
  const filteredItemsForStats = useMemo(() => {
    if (!allFilteredItems) return [];
    if (filterKodeRekening === 'all') return allFilteredItems;
    return allFilteredItems.filter((item: any) => item.kode_rekening === filterKodeRekening);
  }, [allFilteredItems, filterKodeRekening]);

  // Fetch RKAS items for selected document
  const { data: rkasItems } = useQuery({
    queryKey: ["rkas-items", selectedRKAS?.id],
    queryFn: async () => {
      if (!selectedRKAS?.id) return [];
      const { data, error } = await supabase
        .from("rkas_items")
        .select("*")
        .eq("rkas_id", selectedRKAS.id)
        .order("category", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!selectedRKAS?.id,
  });

  // Extract text from PDF
  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }
    
    return fullText;
  };

  // Upload and parse RKAS
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("No file selected");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      setIsUploading(true);

      // Check if RKAS already exists for this month/year
      const { data: existing } = await supabase
        .from("rkas_documents")
        .select("id")
        .eq("month", selectedMonth)
        .eq("year", selectedYear)
        .maybeSingle();

      if (existing) {
        throw new Error(`RKAS untuk ${MONTHS[selectedMonth - 1].label} ${selectedYear} sudah ada`);
      }

      // Upload file to storage
      const fileName = `${selectedYear}/${selectedMonth}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("rkas-documents")
        .upload(fileName, uploadFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("rkas-documents")
        .getPublicUrl(fileName);

      // Extract text from PDF
      setIsParsing(true);
      const pdfText = await extractTextFromPDF(uploadFile);

      // Parse PDF using AI
      const { data: parseResult, error: parseError } = await supabase.functions.invoke("parse-rkas", {
        body: { pdfText, month: selectedMonth, year: selectedYear },
      });

      if (parseError) {
        console.error("Parse error:", parseError);
      }

      const parsedData: ParsedRKASData = parseResult || { items: [], summary: [], total_budget: 0 };

      // Insert RKAS document
      const { data: rkasDoc, error: insertError } = await supabase
        .from("rkas_documents")
        .insert({
          month: selectedMonth,
          year: selectedYear,
          file_url: publicUrl,
          file_name: uploadFile.name,
          total_budget: parsedData.total_budget || 0,
          status: parsedData.parse_error ? "error" : "parsed",
          parsed_data: JSON.parse(JSON.stringify(parsedData)),
          created_by: user.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Insert RKAS items
      if (parsedData.items && parsedData.items.length > 0) {
        const itemsToInsert = parsedData.items.map((item) => ({
          rkas_id: rkasDoc.id,
          category: item.category || "Lainnya",
          main_category: item.main_category || null,
          sub_category: item.sub_category || null,
          kode_rekening: item.kode_rekening || null,
          kode_kegiatan: item.kode_kegiatan || null,
          activity_name: item.activity_name || "-",
          description: item.description || null,
          volume: item.volume || 1,
          unit: item.unit || "-",
          unit_price: item.unit_price || 0,
          total_amount: item.total_amount || 0,
        }));

        const { error: itemsError } = await supabase
          .from("rkas_items")
          .insert(itemsToInsert);

        if (itemsError) {
          console.error("Items insert error:", itemsError);
        }
      }

      return { rkasDoc, parsedData };
    },
    onSuccess: ({ parsedData }) => {
      queryClient.invalidateQueries({ queryKey: ["rkas-documents"] });
      setIsUploadOpen(false);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      
      if (parsedData.parse_error) {
        toast({
          title: "Upload berhasil dengan peringatan",
          description: parsedData.parse_error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Upload berhasil",
          description: `Berhasil mengekstrak ${parsedData.items?.length || 0} item anggaran`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Gagal upload",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUploading(false);
      setIsParsing(false);
    },
  });

  // Delete RKAS
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rkas_documents")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rkas-documents"] });
      toast({ title: "Berhasil", description: "RKAS berhasil dihapus" });
    },
    onError: (error: any) => {
      toast({
        title: "Gagal hapus",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Re-parse RKAS
  const reparseMutation = useMutation({
    mutationFn: async (rkas: any) => {
      setIsParsing(true);
      
      // Fetch PDF and extract text
      const response = await fetch(rkas.file_url);
      const blob = await response.blob();
      const file = new File([blob], rkas.file_name, { type: "application/pdf" });
      const pdfText = await extractTextFromPDF(file);

      // Parse PDF using AI
      const { data: parseResult, error: parseError } = await supabase.functions.invoke("parse-rkas", {
        body: { pdfText, month: rkas.month, year: rkas.year },
      });

      if (parseError) throw parseError;

      const parsedData: ParsedRKASData = parseResult || { items: [], summary: [], total_budget: 0 };

      // Delete existing items
      await supabase.from("rkas_items").delete().eq("rkas_id", rkas.id);

      // Update RKAS document
      const { error: updateError } = await supabase
        .from("rkas_documents")
        .update({
          total_budget: parsedData.total_budget || 0,
          status: parsedData.parse_error ? "error" : "parsed",
          parsed_data: JSON.parse(JSON.stringify(parsedData)),
          updated_at: new Date().toISOString(),
        })
        .eq("id", rkas.id);

      if (updateError) throw updateError;

      // Insert new items
      if (parsedData.items && parsedData.items.length > 0) {
        const itemsToInsert = parsedData.items.map((item) => ({
          rkas_id: rkas.id,
          category: item.category || "Lainnya",
          main_category: item.main_category || null,
          sub_category: item.sub_category || null,
          kode_rekening: item.kode_rekening || null,
          kode_kegiatan: item.kode_kegiatan || null,
          activity_name: item.activity_name || "-",
          description: item.description || null,
          volume: item.volume || 1,
          unit: item.unit || "-",
          unit_price: item.unit_price || 0,
          total_amount: item.total_amount || 0,
        }));

        await supabase.from("rkas_items").insert(itemsToInsert);
      }

      return parsedData;
    },
    onSuccess: (parsedData) => {
      queryClient.invalidateQueries({ queryKey: ["rkas-documents"] });
      queryClient.invalidateQueries({ queryKey: ["rkas-items"] });
      toast({
        title: "Berhasil",
        description: `Berhasil mengekstrak ulang ${parsedData.items?.length || 0} item anggaran`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Gagal parse ulang",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsParsing(false);
    },
  });

  // Bulk re-parse all RKAS documents
  const bulkReparseMutation = useMutation({
    mutationFn: async () => {
      if (!rkasDocuments || rkasDocuments.length === 0) {
        throw new Error("Tidak ada dokumen RKAS untuk di-parse ulang");
      }

      setIsBulkReparsing(true);
      setBulkReparseProgress({ current: 0, total: rkasDocuments.length });

      const results = { success: 0, failed: 0, errors: [] as string[] };

      for (let i = 0; i < rkasDocuments.length; i++) {
        const rkas = rkasDocuments[i];
        setBulkReparseProgress({ current: i + 1, total: rkasDocuments.length });

        try {
          // Fetch PDF and extract text
          const response = await fetch(rkas.file_url);
          const blob = await response.blob();
          const file = new File([blob], rkas.file_name, { type: "application/pdf" });
          const pdfText = await extractTextFromPDF(file);

          // Parse PDF using AI
          const { data: parseResult, error: parseError } = await supabase.functions.invoke("parse-rkas", {
            body: { pdfText, month: rkas.month, year: rkas.year },
          });

          if (parseError) throw parseError;

          const parsedData: ParsedRKASData = parseResult || { items: [], summary: [], total_budget: 0 };

          // Delete existing items
          await supabase.from("rkas_items").delete().eq("rkas_id", rkas.id);

          // Update RKAS document
          const { error: updateError } = await supabase
            .from("rkas_documents")
            .update({
              total_budget: parsedData.total_budget || 0,
              status: parsedData.parse_error ? "error" : "parsed",
              parsed_data: JSON.parse(JSON.stringify(parsedData)),
              updated_at: new Date().toISOString(),
            })
            .eq("id", rkas.id);

          if (updateError) throw updateError;

          // Insert new items
          if (parsedData.items && parsedData.items.length > 0) {
            const itemsToInsert = parsedData.items.map((item) => ({
              rkas_id: rkas.id,
              category: item.category || "Lainnya",
              main_category: item.main_category || null,
              sub_category: item.sub_category || null,
              kode_rekening: item.kode_rekening || null,
              kode_kegiatan: item.kode_kegiatan || null,
              activity_name: item.activity_name || "-",
              description: item.description || null,
              volume: item.volume || 1,
              unit: item.unit || "-",
              unit_price: item.unit_price || 0,
              total_amount: item.total_amount || 0,
            }));

            await supabase.from("rkas_items").insert(itemsToInsert);
          }

          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push(`${MONTHS[rkas.month - 1]?.label} ${rkas.year}: ${error.message}`);
          console.error(`Failed to re-parse RKAS ${rkas.id}:`, error);
        }

        // Add small delay between requests to avoid rate limiting
        if (i < rkasDocuments.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["rkas-documents"] });
      queryClient.invalidateQueries({ queryKey: ["rkas-items"] });
      queryClient.invalidateQueries({ queryKey: ["rkas-items-filtered"] });
      
      if (results.failed > 0) {
        toast({
          title: "Selesai dengan error",
          description: `Berhasil: ${results.success}, Gagal: ${results.failed}. ${results.errors.slice(0, 2).join("; ")}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Berhasil",
          description: `Semua ${results.success} dokumen RKAS berhasil di-parse ulang`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Gagal",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsBulkReparsing(false);
      setBulkReparseProgress({ current: 0, total: 0 });
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value || 0);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "parsed":
        return <Badge variant="default">Terparse</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  // Get unique kode rekening values from all filtered items
  const uniqueKodeRekening = Array.from(
    new Set(
      allFilteredItems?.map((item: any) => item.kode_rekening).filter(Boolean) || []
    )
  ).sort();

  // Get unique kode kegiatan values - extract from multiple sources
  const uniqueKodeKegiatan = Array.from(
    new Set(
      rkasItems?.flatMap((item: any) => {
        const codes: string[] = [];
        // Add kode_kegiatan if exists
        if (item.kode_kegiatan) codes.push(item.kode_kegiatan);
        // Extract code pattern from sub_category (e.g., "06. 04. 02.")
        if (item.sub_category) {
          const subCatMatch = item.sub_category.match(/^[\d]+\.[\s\d.]+/);
          if (subCatMatch) codes.push(subCatMatch[0].trim());
        }
        // Extract code pattern from category (e.g., "06. 04. 02. xxx")
        if (item.category) {
          const catMatch = item.category.match(/^[\d]+\.[\s\d.]+/);
          if (catMatch) codes.push(catMatch[0].trim());
        }
        return codes;
      }).filter(Boolean) || []
    )
  ).sort((a, b) => {
    // Sort by numeric parts of the code
    const aParts = a.replace(/\s/g, '').split('.').map(Number);
    const bParts = b.replace(/\s/g, '').split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal !== bVal) return aVal - bVal;
    }
    return 0;
  });

  // Filter items by category and kode kegiatan
  const filteredItems = rkasItems?.filter((item: any) => {
    // Filter by category
    if (filterCategory !== "all") {
      const mainCat = item.main_category || item.category?.substring(0, 2) || "";
      const categoryMatch = mainCat === filterCategory || item.category?.toLowerCase().includes(BUDGET_CATEGORIES.find(c => c.kode === filterCategory)?.name.toLowerCase() || "");
      if (!categoryMatch) return false;
    }
    // Filter by kode kegiatan - check multiple sources
    if (filterKodeKegiatan !== "all") {
      const filterCode = filterKodeKegiatan.replace(/\s/g, '');
      const itemKode = item.kode_kegiatan?.replace(/\s/g, '') || '';
      const subCatCode = item.sub_category?.match(/^[\d]+\.[\s\d.]+/)?.[0]?.replace(/\s/g, '') || '';
      const catCode = item.category?.match(/^[\d]+\.[\s\d.]+/)?.[0]?.replace(/\s/g, '') || '';
      
      // Match if any of the codes starts with or equals the filter
      const matches = itemKode.startsWith(filterCode) || 
                      subCatCode.startsWith(filterCode) || 
                      catCode.startsWith(filterCode) ||
                      itemKode === filterCode ||
                      subCatCode === filterCode ||
                      catCode === filterCode;
      if (!matches) return false;
    }
    return true;
  }) || [];

  // Calculate summary from items - group by main category
  const getSummary = () => {
    if (!rkasItems || rkasItems.length === 0) return [];
    
    const summaryMap = new Map<string, { kode: string; name: string; total: number }>();
    
    // Initialize with known categories
    BUDGET_CATEGORIES.forEach(cat => {
      summaryMap.set(cat.kode, { kode: cat.kode, name: cat.name, total: 0 });
    });

    rkasItems.forEach((item: any) => {
      const mainCat = item.main_category || "00";
      const existing = summaryMap.get(mainCat);
      if (existing) {
        existing.total += (item.total_amount || 0);
      } else {
        summaryMap.set(mainCat, {
          kode: mainCat,
          name: item.category || "Lainnya",
          total: item.total_amount || 0,
        });
      }
    });

    return Array.from(summaryMap.values()).filter(s => s.total > 0).sort((a, b) => a.kode.localeCompare(b.kode));
  };

  // Calculate statistics from filtered items - group by kode_kegiatan for stats cards
  const getFilteredStatistics = () => {
    if (!filteredItemsForStats || filteredItemsForStats.length === 0) return [];
    
    const statsMap = new Map<string, { 
      kode: string; 
      name: string; 
      subProgram: string; 
      total: number; 
      count: number; 
      months: Set<number>;
      monthlyAmounts: Map<number, number>;
    }>();

    filteredItemsForStats.forEach((item: any) => {
      // Get kode_kegiatan from item
      const kodeKegiatan = item.kode_kegiatan || "";
      if (!kodeKegiatan) return;
      
      // Get program name from database labels
      const programName = getKodeKegiatanLabel(kodeKegiatan);
      const subProgramName = getKodeKegiatanSubProgram(kodeKegiatan);
      const docMonth = item.doc_month || 0;
      
      const existing = statsMap.get(kodeKegiatan);
      if (existing) {
        existing.total += (item.total_amount || 0);
        existing.count += 1;
        if (docMonth) {
          existing.months.add(docMonth);
          existing.monthlyAmounts.set(docMonth, (existing.monthlyAmounts.get(docMonth) || 0) + (item.total_amount || 0));
        }
      } else {
        const months = new Set<number>();
        const monthlyAmounts = new Map<number, number>();
        if (docMonth) {
          months.add(docMonth);
          monthlyAmounts.set(docMonth, item.total_amount || 0);
        }
        statsMap.set(kodeKegiatan, {
          kode: kodeKegiatan,
          name: programName,
          subProgram: subProgramName,
          total: item.total_amount || 0,
          count: 1,
          months,
          monthlyAmounts,
        });
      }
    });

    return Array.from(statsMap.values())
      .filter(s => s.total > 0)
      .map(s => ({ 
        ...s, 
        months: Array.from(s.months).sort((a, b) => a - b),
        monthlyData: Array.from(s.monthlyAmounts.entries())
          .map(([month, amount]) => ({ month, amount }))
          .sort((a, b) => a.month - b.month)
      }))
      .sort((a, b) => {
        // Sort by numeric parts of the kode
        const aParts = a.kode.replace(/\s/g, '').split('.').map(Number);
        const bParts = b.kode.replace(/\s/g, '').split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aVal = aParts[i] || 0;
          const bVal = bParts[i] || 0;
          if (aVal !== bVal) return aVal - bVal;
        }
        return 0;
      });
  };


  const filteredStatistics = getFilteredStatistics();

  // Calculate statistics from filtered items - group by kode rekening with activity names
  const getFilteredStatisticsByKodeRekening = () => {
    if (!filteredItemsForStats || filteredItemsForStats.length === 0) return [];
    
    const statsMap = new Map<string, { 
      kode: string; 
      total: number; 
      count: number; 
      activities: string[]; 
      months: Set<number>;
      monthlyAmounts: Map<number, number>;
    }>();

    filteredItemsForStats.forEach((item: any) => {
      const kodeRekening = item.kode_rekening || "Tanpa Kode";
      const activityName = item.activity_name || "-";
      const docMonth = item.doc_month || 0;
      
      const existing = statsMap.get(kodeRekening);
      if (existing) {
        existing.total += (item.total_amount || 0);
        existing.count += 1;
        if (activityName !== "-" && !existing.activities.includes(activityName)) {
          existing.activities.push(activityName);
        }
        if (docMonth) {
          existing.months.add(docMonth);
          existing.monthlyAmounts.set(docMonth, (existing.monthlyAmounts.get(docMonth) || 0) + (item.total_amount || 0));
        }
      } else {
        const months = new Set<number>();
        const monthlyAmounts = new Map<number, number>();
        if (docMonth) {
          months.add(docMonth);
          monthlyAmounts.set(docMonth, item.total_amount || 0);
        }
        statsMap.set(kodeRekening, {
          kode: kodeRekening,
          total: item.total_amount || 0,
          count: 1,
          activities: activityName !== "-" ? [activityName] : [],
          months,
          monthlyAmounts,
        });
      }
    });

    return Array.from(statsMap.values())
      .filter(s => s.total > 0)
      .map(s => ({ 
        ...s, 
        months: Array.from(s.months).sort((a, b) => a - b),
        monthlyData: Array.from(s.monthlyAmounts.entries())
          .map(([month, amount]) => ({ month, amount }))
          .sort((a, b) => a.month - b.month)
      }))
      .sort((a, b) => a.kode.localeCompare(b.kode));
  };

  const filteredStatisticsByRekening = getFilteredStatisticsByKodeRekening();

  // Standar Pendidikan labels mapping based on 2-digit prefix
  const standarPendidikanLabels: Record<string, string> = {
    '03': 'Pengembangan Standar Proses',
    '04': 'Pengembangan Pendidik dan Tenaga Kependidikan',
    '05': 'Pengembangan Sarana dan Prasarana Sekolah',
    '06': 'Pengembangan Standar Pengelolaan',
    '07': 'Pengembangan Standar Pembiayaan',
  };

  // Calculate statistics per standar pendidikan (2-digit prefix of kode_kegiatan)
  const getStatisticsByStandarPendidikan = () => {
    if (!filteredItemsForStats || filteredItemsForStats.length === 0) return {};
    
    const statsMap: Record<string, number> = {};
    
    filteredItemsForStats.forEach((item: any) => {
      const kodeKegiatan = (item.kode_kegiatan || '').trim().replace(/\s+/g, '');
      if (kodeKegiatan) {
        const prefix = kodeKegiatan.substring(0, 2);
        if (/^\d{2}$/.test(prefix)) {
          statsMap[prefix] = (statsMap[prefix] || 0) + (item.total_amount || 0);
        }
      }
    });
    
    return statsMap;
  };

  const statisticsByStandarPendidikan = getStatisticsByStandarPendidikan();

  // Get items for selected category with grouping by activity type
  // Get items for selected kode kegiatan (program)
  const getCategoryDetailItems = () => {
    if (!selectedCategoryDetail || !filteredItemsForStats) return { items: [], grouped: [] };
    
    // Filter by kode_kegiatan
    const categoryItems = filteredItemsForStats.filter((item: any) => {
      const itemKode = item.kode_kegiatan || "";
      return itemKode === selectedCategoryDetail.kode;
    });

    // Group items by kode_rekening
    const groupedMap = new Map<string, { group: string; kode: string; items: any[]; total: number }>();
    
    categoryItems.forEach((item: any) => {
      const kodeRekening = item.kode_rekening || "Tanpa Kode Rekening";
      const kodeLabel = getKodeRekeningLabel(kodeRekening);
      
      const existing = groupedMap.get(kodeRekening);
      if (existing) {
        existing.items.push(item);
        existing.total += (item.total_amount || 0);
      } else {
        groupedMap.set(kodeRekening, {
          group: kodeLabel,
          kode: kodeRekening,
          items: [item],
          total: item.total_amount || 0,
        });
      }
    });

    return {
      items: categoryItems,
      grouped: Array.from(groupedMap.values()).sort((a, b) => b.total - a.total),
    };
  };

  const categoryDetailData = getCategoryDetailItems();

  // Get items for selected kode rekening
  const getRekeningDetailItems = () => {
    if (!selectedRekeningDetail || !filteredItemsForStats) return [];
    
    return filteredItemsForStats.filter((item: any) => {
      const kodeRekening = item.kode_rekening || "Tanpa Kode";
      return kodeRekening === selectedRekeningDetail.kode;
    });
  };

  const rekeningDetailItems = getRekeningDetailItems();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Manajemen RKAS</h1>
            <p className="text-muted-foreground">Upload dan kelola RKAS bulanan</p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Select value={filterMonthStart?.toString() || "all"} onValueChange={(v) => setFilterMonthStart(v === "all" ? null : parseInt(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Bulan Awal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Bulan Awal</SelectItem>
                  {MONTHS.map((month) => (
                    <SelectItem key={month.value} value={month.value.toString()}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">-</span>
              <Select value={filterMonthEnd?.toString() || "all"} onValueChange={(v) => setFilterMonthEnd(v === "all" ? null : parseInt(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Bulan Akhir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Bulan Akhir</SelectItem>
                  {MONTHS.map((month) => (
                    <SelectItem key={month.value} value={month.value.toString()}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Select value={filterYear.toString()} onValueChange={(v) => setFilterYear(parseInt(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(filterMonthStart !== null || filterMonthEnd !== null) && (
              <Button variant="ghost" size="sm" onClick={() => {
                setFilterMonthStart(null);
                setFilterMonthEnd(null);
                setFilterKodeRekening('all');
              }}>
                Reset
              </Button>
            )}

            {/* Filter Kode Rekening */}
            <Select value={filterKodeRekening} onValueChange={setFilterKodeRekening}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Kode Rekening" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kode Rekening</SelectItem>
                {uniqueKodeRekening.map((code) => (
                  <SelectItem key={code} value={code}>
                    <span className="font-mono text-xs">{code}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {getKodeRekeningLabel(code).substring(0, 30)}
                      {getKodeRekeningLabel(code).length > 30 ? '...' : ''}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Create RKAS Button */}
            <CreateRKASForm />

            {/* Import Excel Button */}
            <ImportRKAS />

            {/* Bulk Re-parse Button */}
            <Button 
              variant="outline" 
              onClick={() => bulkReparseMutation.mutate()}
              disabled={isBulkReparsing || !rkasDocuments?.length}
            >
              {isBulkReparsing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Re-parse {bulkReparseProgress.current}/{bulkReparseProgress.total}
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-parse Semua
                </>
              )}
            </Button>

            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload RKAS
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload RKAS PDF</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Bulan</Label>
                      <Select 
                        value={selectedMonth.toString()} 
                        onValueChange={(v) => setSelectedMonth(parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((month) => (
                            <SelectItem key={month.value} value={month.value.toString()}>
                              {month.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Tahun</Label>
                      <Select 
                        value={selectedYear.toString()} 
                        onValueChange={(v) => setSelectedYear(parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YEARS.map((year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div>
                    <Label>File PDF</Label>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    />
                  </div>

                  <Button 
                    onClick={() => uploadMutation.mutate()} 
                    disabled={!uploadFile || isUploading}
                    className="w-full"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {isParsing ? "Mengekstrak data..." : "Mengupload..."}
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload & Parse
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards - Modern Design */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ModernStatCard
            title="Total Dokumen"
            value={rkasDocuments?.length || 0}
            subtitle={`Dokumen RKAS ${filterYear}`}
            icon={<FileText className="h-4 w-4 md:h-5 md:w-5" />}
            variant="gradient"
            gradientFrom="from-blue-500/10"
            gradientTo="to-blue-500/5"
          />
          
          <BudgetStatCard
            title={`Total Anggaran ${filterMonthStart !== null && filterMonthEnd !== null ? MONTHS[filterMonthStart - 1]?.label + ' - ' + MONTHS[filterMonthEnd - 1]?.label + ' ' : filterMonthStart !== null ? 'Dari ' + MONTHS[filterMonthStart - 1]?.label + ' ' : filterMonthEnd !== null ? 'Sampai ' + MONTHS[filterMonthEnd - 1]?.label + ' ' : ''}${filterYear}`}
            amount={rkasDocuments?.reduce((sum, doc) => sum + (doc.total_budget || 0), 0) || 0}
            subtitle="Jumlah seluruh anggaran"
            icon={<Wallet className="h-4 w-4 md:h-5 md:w-5" />}
            type="budget"
          />
          
          <ModernStatCard
            title={filterMonthStart !== null || filterMonthEnd !== null ? "Filter Aktif" : "Bulan Terisi"}
            value={filterMonthStart !== null && filterMonthEnd !== null ? `${MONTHS[filterMonthStart - 1]?.label} - ${MONTHS[filterMonthEnd - 1]?.label}` : filterMonthStart !== null ? `Dari ${MONTHS[filterMonthStart - 1]?.label}` : filterMonthEnd !== null ? `Sampai ${MONTHS[filterMonthEnd - 1]?.label}` : `${rkasDocuments?.length || 0} / 12`}
            subtitle={filterMonthStart !== null || filterMonthEnd !== null ? `Menampilkan data rentang bulan` : "Progress pengisian RKAS"}
            icon={<Calendar className="h-4 w-4 md:h-5 md:w-5" />}
            variant="gradient"
            gradientFrom="from-indigo-500/10"
            gradientTo="to-indigo-500/5"
            progress={filterMonthStart === null && filterMonthEnd === null ? { value: ((rkasDocuments?.length || 0) / 12) * 100, color: "default" } : undefined}
          />

          {/* Makan Minum Kegiatan Card */}
          <MakanMinumCard 
            items={filteredItemsForStats || []}
            formatCurrency={formatCurrency}
            getKodeRekeningLabel={getKodeRekeningLabel}
            type="rkas"
          />
        </div>

        {/* Statistik per Standar Pendidikan */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <GraduationCap className="h-4 w-4 md:h-5 md:w-5" />
              Anggaran per Standar Pendidikan
            </CardTitle>
            <p className="text-xs md:text-sm text-muted-foreground">
              Berdasarkan 2 digit awal kode kegiatan
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
              {Object.entries(standarPendidikanLabels).map(([code, label]) => {
                const amount = statisticsByStandarPendidikan[code] || 0;
                const totalBudget = rkasDocuments?.reduce((sum, doc) => sum + (doc.total_budget || 0), 0) || 0;
                const percentage = totalBudget > 0 ? (amount / totalBudget) * 100 : 0;
                
                return (
                  <Card key={code} className="border border-border/50 bg-card/50">
                    <CardContent className="p-3 md:p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {code}
                        </Badge>
                        <span className="text-xs font-medium text-primary">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                      <h4 className="text-xs md:text-sm font-medium text-muted-foreground mb-2 line-clamp-2 min-h-[2rem] md:min-h-[2.5rem]">
                        {label}
                      </h4>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Anggaran:</span>
                          <span className="font-medium text-primary">
                            {formatCurrency(amount)}
                          </span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all"
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Budget Statistics Per Category */}
        <BudgetStatisticsSection
          title="Statistik Anggaran per Kode Program"
          icon={<Layers className="h-5 w-5 text-primary" />}
          statistics={filteredStatistics}
          formatCurrency={formatCurrency}
          monthLabels={MONTHS}
          filterMonthStart={filterMonthStart}
          filterMonthEnd={filterMonthEnd}
          filterYear={filterYear}
          onCardClick={(stat) => {
            setSelectedCategoryDetail(stat);
            setIsCategoryDetailOpen(true);
          }}
          type="program"
        />

        {/* Budget Statistics Per Kode Rekening */}
        <BudgetStatisticsSection
          title="Statistik Anggaran per Kode Rekening"
          icon={<Hash className="h-5 w-5 text-primary" />}
          statistics={filteredStatisticsByRekening}
          formatCurrency={formatCurrency}
          monthLabels={MONTHS}
          filterMonthStart={filterMonthStart}
          filterMonthEnd={filterMonthEnd}
          filterYear={filterYear}
          onCardClick={(stat) => {
            setSelectedRekeningDetail(stat);
            setIsRekeningDetailOpen(true);
          }}
          type="rekening"
          getLabel={getKodeRekeningLabel}
        />

        {/* RKAS Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Daftar RKAS {filterMonthStart !== null && filterMonthEnd !== null ? `${MONTHS[filterMonthStart - 1]?.label} - ${MONTHS[filterMonthEnd - 1]?.label} ` : filterMonthStart !== null ? `Dari ${MONTHS[filterMonthStart - 1]?.label} ` : filterMonthEnd !== null ? `Sampai ${MONTHS[filterMonthEnd - 1]?.label} ` : ""}{filterYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Bulan</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Total Anggaran</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal Upload</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rkasDocuments?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Belum ada RKAS untuk tahun {filterYear}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rkasDocuments?.map((doc, index) => (
                      <TableRow key={doc.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {MONTHS[doc.month - 1]?.label}
                        </TableCell>
                        <TableCell>
                          <a 
                            href={doc.file_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            <FileText className="h-4 w-4" />
                            {doc.file_name}
                          </a>
                        </TableCell>
                        <TableCell>{formatCurrency(doc.total_budget)}</TableCell>
                        <TableCell>{getStatusBadge(doc.status)}</TableCell>
                        <TableCell>
                          {new Date(doc.created_at).toLocaleDateString("id-ID")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                setSelectedRKAS(doc);
                                setFilterCategory("all");
                                setFilterKodeKegiatan("all");
                                setIsDetailOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => reparseMutation.mutate(doc)}
                              disabled={isParsing}
                            >
                              <RefreshCw className={`h-4 w-4 ${isParsing ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => {
                                if (confirm("Yakin ingin menghapus RKAS ini?")) {
                                  deleteMutation.mutate(doc.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Detail RKAS - {selectedRKAS && MONTHS[selectedRKAS.month - 1]?.label} {selectedRKAS?.year}
              </DialogTitle>
            </DialogHeader>
            
            {selectedRKAS && (
              <Tabs defaultValue="items">
                <TabsList>
                  <TabsTrigger value="items">Detail Item</TabsTrigger>
                  <TabsTrigger value="summary">Ringkasan Kategori</TabsTrigger>
                </TabsList>

                <TabsContent value="items" className="mt-4 space-y-4">
                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label className="whitespace-nowrap text-sm">Kategori:</Label>
                      <Select value={filterCategory} onValueChange={setFilterCategory}>
                        <SelectTrigger className="w-[250px]">
                          <SelectValue placeholder="Semua Kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Kategori</SelectItem>
                          {BUDGET_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.kode} value={cat.kode}>
                              {cat.kode}. {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Label className="whitespace-nowrap text-sm">Kode Kegiatan:</Label>
                      <Select value={filterKodeKegiatan} onValueChange={setFilterKodeKegiatan}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Semua Kode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Kode</SelectItem>
                          {uniqueKodeKegiatan.map((kode: string) => (
                            <SelectItem key={kode} value={kode}>
                              {kode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {(filterCategory !== "all" || filterKodeKegiatan !== "all") && (
                      <Badge variant="secondary">
                        {filteredItems.length} item
                      </Badge>
                    )}
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">No</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Kode Kegiatan</TableHead>
                        <TableHead>Nama Kegiatan</TableHead>
                        <TableHead className="text-right">Volume</TableHead>
                        <TableHead>Satuan</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                            Tidak ada item anggaran
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredItems.map((item: any, index: number) => (
                          <TableRow key={item.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {item.main_category || item.category?.substring(0, 2) || "-"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="font-mono text-muted-foreground">{item.kode_kegiatan || "-"}</div>
                              {item.kode_kegiatan && getKodeKegiatanLabel(item.kode_kegiatan) !== 'Kegiatan Lainnya' && (
                                <>
                                  <div className="text-xs font-medium">{getKodeKegiatanLabel(item.kode_kegiatan)}</div>
                                  {getKodeKegiatanSubProgram(item.kode_kegiatan) && (
                                    <div className="text-xs text-muted-foreground/70">{getKodeKegiatanSubProgram(item.kode_kegiatan)}</div>
                                  )}
                                </>
                              )}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{item.activity_name}</p>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground">{item.description}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{item.volume}</TableCell>
                            <TableCell className="text-xs">{item.unit}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.total_amount)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {filteredItems.length > 0 && (
                        <TableRow className="bg-muted/50">
                          <TableCell colSpan={6} className="font-bold">
                            Subtotal 
                            {filterCategory !== "all" && ` (${BUDGET_CATEGORIES.find(c => c.kode === filterCategory)?.name || ""})`}
                            {filterKodeKegiatan !== "all" && ` - Kode: ${filterKodeKegiatan}`}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(filteredItems.reduce((sum: number, item: any) => sum + (item.total_amount || 0), 0))}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="summary" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">No</TableHead>
                        <TableHead className="w-16">Kode</TableHead>
                        <TableHead>Kategori Belanja</TableHead>
                        <TableHead className="text-right">Total Anggaran</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getSummary().map((item, index) => (
                        <TableRow key={item.kode} className="cursor-pointer hover:bg-muted/50" onClick={() => setFilterCategory(item.kode)}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.kode}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={3} className="font-bold">
                          Total Keseluruhan Belanja
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {formatCurrency(selectedRKAS.total_budget)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground mt-2">
                    * Klik pada baris kategori untuk melihat detail item
                  </p>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        {/* Category Detail Dialog */}
        <Dialog open={isCategoryDetailOpen} onOpenChange={setIsCategoryDetailOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-base px-3 py-1 font-mono">{selectedCategoryDetail?.kode}</Badge>
                  <span className="text-lg">{selectedCategoryDetail?.name}</span>
                </div>
                {selectedCategoryDetail?.subProgram && (
                  <p className="text-sm font-normal text-muted-foreground">
                    {selectedCategoryDetail.subProgram}
                  </p>
                )}
              </DialogTitle>
            </DialogHeader>
            
            {selectedCategoryDetail && (
              <Tabs defaultValue="grouped">
                <TabsList>
                  <TabsTrigger value="grouped">Berdasarkan Kode Rekening</TabsTrigger>
                  <TabsTrigger value="all">Semua Item ({categoryDetailData.items.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="grouped" className="mt-4 space-y-4">
                  {categoryDetailData.grouped.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Tidak ada data</p>
                  ) : (
                    <>
                      {categoryDetailData.grouped.map((group, groupIndex) => (
                        <Card key={group.kode}>
                          <CardHeader className="pb-2">
                            <CardTitle className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge 
                                    variant="secondary" 
                                    className="font-mono text-xs"
                                    style={{ backgroundColor: `hsl(${groupIndex * 60 + 180}, 60%, 90%)`, color: `hsl(${groupIndex * 60 + 180}, 60%, 30%)` }}
                                  >
                                    {group.kode}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">({group.items.length} item)</span>
                                </div>
                                <span className="font-bold text-primary">{formatCurrency(group.total)}</span>
                              </div>
                              <p className="text-sm font-normal text-muted-foreground">{group.group}</p>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12">No</TableHead>
                                  <TableHead>Nama Kegiatan</TableHead>
                                  <TableHead>Deskripsi</TableHead>
                                  <TableHead className="text-center w-20">Volume</TableHead>
                                  <TableHead className="w-20">Satuan</TableHead>
                                  <TableHead className="text-right">Harga Satuan</TableHead>
                                  <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.items.map((item: any, idx: number) => (
                                  <TableRow key={item.id}>
                                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                                    <TableCell>
                                      <p className="font-medium text-sm">{item.activity_name}</p>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground max-w-48">
                                      {item.description || "-"}
                                    </TableCell>
                                    <TableCell className="text-center">{item.volume}</TableCell>
                                    <TableCell className="text-xs">{item.unit}</TableCell>
                                    <TableCell className="text-right text-sm">{formatCurrency(item.unit_price)}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(item.total_amount)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      ))}
                      <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                        <span className="font-semibold">Total Anggaran Program {selectedCategoryDetail.kode}</span>
                        <span className="text-xl font-bold text-primary">{formatCurrency(selectedCategoryDetail.total)}</span>
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="all" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">No</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>Kode Kegiatan</TableHead>
                        <TableHead>Nama Kegiatan</TableHead>
                        <TableHead className="text-center w-20">Volume</TableHead>
                        <TableHead className="w-20">Satuan</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryDetailData.items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            Tidak ada data
                          </TableCell>
                        </TableRow>
                      ) : (
                        categoryDetailData.items.map((item: any, index: number) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {getActivityGroup(item.activity_name || item.sub_category || item.category || "")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="font-mono text-muted-foreground">{item.kode_kegiatan || "-"}</div>
                              {item.kode_kegiatan && getKodeKegiatanLabel(item.kode_kegiatan) !== 'Kegiatan Lainnya' && (
                                <>
                                  <div className="text-xs font-medium">{getKodeKegiatanLabel(item.kode_kegiatan)}</div>
                                  {getKodeKegiatanSubProgram(item.kode_kegiatan) && (
                                    <div className="text-xs text-muted-foreground/70">{getKodeKegiatanSubProgram(item.kode_kegiatan)}</div>
                                  )}
                                </>
                              )}
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-sm">{item.activity_name}</p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground">{item.description}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-center">{item.volume}</TableCell>
                            <TableCell className="text-xs">{item.unit}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(item.total_amount)}</TableCell>
                          </TableRow>
                        ))
                      )}
                      {categoryDetailData.items.length > 0 && (
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={6}>Total</TableCell>
                          <TableCell className="text-right text-primary">
                            {formatCurrency(selectedCategoryDetail.total)}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        {/* Kode Rekening Detail Dialog */}
        <Dialog open={isRekeningDetailOpen} onOpenChange={setIsRekeningDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Detail Kode Rekening: {selectedRekeningDetail?.kode}
              </DialogTitle>
            </DialogHeader>
            {selectedRekeningDetail && (
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Item</p>
                    <p className="text-lg font-semibold">{selectedRekeningDetail.count} item</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total Anggaran</p>
                    <p className="text-xl font-bold text-primary">{formatCurrency(selectedRekeningDetail.total)}</p>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Kode Kegiatan</TableHead>
                      <TableHead>Nama Kegiatan</TableHead>
                      <TableHead className="text-center w-20">Volume</TableHead>
                      <TableHead className="w-20">Satuan</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rekeningDetailItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Tidak ada data
                        </TableCell>
                      </TableRow>
                    ) : (
                      rekeningDetailItems.map((item: any, index: number) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="text-xs">
                            <div className="font-mono text-muted-foreground">{item.kode_kegiatan || "-"}</div>
                            {item.kode_kegiatan && getKodeKegiatanLabel(item.kode_kegiatan) !== 'Kegiatan Lainnya' && (
                              <>
                                <div className="text-xs font-medium">{getKodeKegiatanLabel(item.kode_kegiatan)}</div>
                                {getKodeKegiatanSubProgram(item.kode_kegiatan) && (
                                  <div className="text-xs text-muted-foreground/70">{getKodeKegiatanSubProgram(item.kode_kegiatan)}</div>
                                )}
                              </>
                            )}
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-sm">{item.activity_name}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{item.volume}</TableCell>
                          <TableCell className="text-xs">{item.unit}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.total_amount)}</TableCell>
                        </TableRow>
                      ))
                    )}
                    {rekeningDetailItems.length > 0 && (
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={5}>Total</TableCell>
                        <TableCell className="text-right text-primary">
                          {formatCurrency(selectedRekeningDetail.total)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default RKASManagement;
