import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Upload, Trash2, FileText, TrendingUp, TrendingDown, Activity, Filter, BarChart3, PieChart, ArrowDownCircle, ArrowUpCircle, Receipt, ChevronDown, ChevronRight, Download, AlertTriangle, Eye, Wallet, Calculator, PiggyBank, Coins, Layers, Hash, GraduationCap } from 'lucide-react';
import { BudgetStatCard } from '@/components/ui/modern-stat-card';
import { BudgetComparisonSection, UnbudgetedExpenseSection } from '@/components/ui/budget-comparison-card';
import { MakanMinumCard } from '@/components/MakanMinumCard';
import { toast } from 'sonner';
import { format, parse } from 'date-fns';
import { id } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Legend } from 'recharts';

const months = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

const SPJManagement = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [filterMonthStart, setFilterMonthStart] = useState<string>('all');
  const [filterMonthEnd, setFilterMonthEnd] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [filterKodeKegiatan, setFilterKodeKegiatan] = useState<string>('all');
  const [filterKodeRekening, setFilterKodeRekening] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [uploading, setUploading] = useState(false);
  // Standar Pendidikan labels mapping based on 2-digit prefix
  const standarPendidikanLabels: Record<string, string> = {
    '03': 'Pengembangan Standar Proses',
    '04': 'Pengembangan Pendidik dan Tenaga Kependidikan',
    '05': 'Pengembangan Sarana dan Prasarana Sekolah',
    '06': 'Pengembangan Standar Pengelolaan',
    '07': 'Pengembangan Standar Pembiayaan',
  };

  const [drillDownData, setDrillDownData] = useState<{
    type: 'kode_kegiatan' | 'kode_rekening';
    code: string;
    rkas: number;
    spj: number;
  } | null>(null);

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
    if (!code || code === 'Tanpa Kode') return 'Tanpa Kode';
    
    // Normalize code - remove extra spaces and dots
    const normalizedCode = code.trim().replace(/\s+/g, '');
    
    // Try exact match first
    if (kodeRekeningMap[normalizedCode]) return kodeRekeningMap[normalizedCode];
    
    // Try exact match with original code
    if (kodeRekeningMap[code]) return kodeRekeningMap[code];
    
    // Try to find partial match for longer codes - match by prefix
    const matchingKey = Object.keys(kodeRekeningMap).find(key => {
      const normalizedKey = key.trim().replace(/\s+/g, '');
      return normalizedKey === normalizedCode || normalizedCode.startsWith(normalizedKey) || normalizedKey.startsWith(normalizedCode);
    });
    
    if (matchingKey) {
      return kodeRekeningMap[matchingKey];
    }
    
    return 'Belanja Lainnya';
  };

  // Fetch SPJ documents
  const { data: spjDocuments, isLoading: loadingDocuments } = useQuery({
    queryKey: ['spj-documents', filterYear, filterMonthStart, filterMonthEnd],
    queryFn: async () => {
      let query = supabase
        .from('spj_documents')
        .select('*')
        .eq('year', filterYear)
        .order('month', { ascending: false });
      
      // Apply month range filter
      if (filterMonthStart !== 'all' && filterMonthEnd !== 'all') {
        query = query.gte('month', parseInt(filterMonthStart)).lte('month', parseInt(filterMonthEnd));
      } else if (filterMonthStart !== 'all') {
        query = query.gte('month', parseInt(filterMonthStart));
      } else if (filterMonthEnd !== 'all') {
        query = query.lte('month', parseInt(filterMonthEnd));
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch SPJ items
  const { data: spjItems, isLoading: loadingItems } = useQuery({
    queryKey: ['spj-items', filterYear, filterMonthStart, filterMonthEnd],
    queryFn: async () => {
      const documentIds = spjDocuments?.map(d => d.id) || [];
      if (documentIds.length === 0) return [];

      const { data, error } = await supabase
        .from('spj_items')
        .select('*')
        .in('spj_id', documentIds);

      if (error) throw error;
      return data;
    },
    enabled: !!spjDocuments && spjDocuments.length > 0,
  });

  // Fetch RKAS for comparison
  const { data: rkasDocuments } = useQuery({
    queryKey: ['rkas-comparison', filterYear, filterMonthStart, filterMonthEnd],
    queryFn: async () => {
      let query = supabase
        .from('rkas_documents')
        .select('*, rkas_items(*)')
        .eq('year', filterYear);
      
      // Apply month range filter
      if (filterMonthStart !== 'all' && filterMonthEnd !== 'all') {
        query = query.gte('month', parseInt(filterMonthStart)).lte('month', parseInt(filterMonthEnd));
      } else if (filterMonthStart !== 'all') {
        query = query.gte('month', parseInt(filterMonthStart));
      } else if (filterMonthEnd !== 'all') {
        query = query.lte('month', parseInt(filterMonthEnd));
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Get unique kode_kegiatan, kode_rekening, and categories for filters
  const uniqueKodeKegiatan = useMemo(() => {
    if (!spjItems) return [];
    const codes = [...new Set(spjItems.map(item => item.kode_kegiatan).filter(Boolean))];
    return codes.sort();
  }, [spjItems]);

  const uniqueKodeRekening = useMemo(() => {
    if (!spjItems) return [];
    const codes = [...new Set(spjItems.map(item => item.kode_rekening).filter(Boolean))];
    return codes.sort();
  }, [spjItems]);

  const uniqueCategories = useMemo(() => {
    if (!spjItems) return [];
    const categories = [...new Set(spjItems.map(item => item.category).filter(Boolean))];
    return categories.sort();
  }, [spjItems]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!spjItems) return [];
    return spjItems.filter(item => {
      if (filterKodeKegiatan !== 'all' && item.kode_kegiatan !== filterKodeKegiatan) return false;
      if (filterKodeRekening !== 'all' && item.kode_rekening !== filterKodeRekening) return false;
      if (filterCategory !== 'all' && item.category !== filterCategory) return false;
      return true;
    });
  }, [spjItems, filterKodeKegiatan, filterKodeRekening, filterCategory]);

  // Get unique transaction types for filtering
  const uniqueJenisTransaksi = useMemo(() => {
    if (!spjItems) return [];
    const types = [...new Set(spjItems.map(item => item.main_category).filter(Boolean))];
    return types.sort();
  }, [spjItems]);

  // Calculate statistics
  const statistics = useMemo(() => {
    // Calculate totals from parsed_data summary if available
    let totalPenerimaan = 0;
    let totalPengeluaran = 0; // Total pengeluaran termasuk pajak
    let totalPajak = 0;
    let totalBelanja = 0; // Belanja tanpa pajak
    let saldoAkhir = 0;
    
    // Get summary from documents - use the latest document's saldo_akhir
    if (spjDocuments && spjDocuments.length > 0) {
      spjDocuments.forEach(doc => {
        const parsedData = doc.parsed_data as any;
        if (parsedData?.summary) {
          totalPenerimaan += parsedData.summary.total_penerimaan || 0;
          totalPengeluaran += parsedData.summary.total_pengeluaran || 0;
          totalPajak += parsedData.summary.total_pajak || 0;
          totalBelanja += parsedData.summary.total_belanja || 0;
          // Saldo akhir ambil dari dokumen terakhir (bulan terbesar)
          if (parsedData.summary.saldo_akhir) {
            saldoAkhir = parsedData.summary.saldo_akhir;
          }
        }
      });
    }

    // Calculate from items if summary not available
    if (totalPengeluaran === 0 && filteredItems.length > 0) {
      filteredItems.forEach(item => {
        const mainCategory = item.main_category;
        const amount = Number(item.amount) || 0;
        
        if (mainCategory === 'penerimaan') {
          totalPenerimaan += amount;
        } else if (mainCategory === 'pajak') {
          totalPajak += amount;
        } else {
          // Belanja tanpa pajak
          totalBelanja += amount;
        }
      });
      totalPengeluaran = totalBelanja + totalPajak;
    }

    const totalRealization = totalPengeluaran; // Total pengeluaran termasuk pajak
    
    // Calculate RKAS budget for comparison
    let totalBudget = 0;
    if (rkasDocuments) {
      rkasDocuments.forEach(doc => {
        if (doc.rkas_items) {
          doc.rkas_items.forEach((item: any) => {
            totalBudget += Number(item.total_amount) || 0;
          });
        }
      });
    }

    const selisih = totalBudget - totalRealization;
    const persentaseRealisasi = totalBudget > 0 ? (totalRealization / totalBudget) * 100 : 0;

    // Group by category
    const byCategory: Record<string, number> = {};
    filteredItems.forEach(item => {
      const cat = item.category || 'Lainnya';
      byCategory[cat] = (byCategory[cat] || 0) + (Number(item.amount) || 0);
    });

    // Group by kode_kegiatan - normalize codes
    const byKodeKegiatan: Record<string, number> = {};
    filteredItems.forEach(item => {
      const code = (item.kode_kegiatan || '').trim().replace(/\s+/g, '') || 'Tanpa Kode';
      if (code !== 'Tanpa Kode') {
        byKodeKegiatan[code] = (byKodeKegiatan[code] || 0) + (Number(item.amount) || 0);
      }
    });

    // Group by kode_rekening - normalize codes
    const byKodeRekening: Record<string, number> = {};
    filteredItems.forEach(item => {
      const code = (item.kode_rekening || '').trim().replace(/\s+/g, '') || 'Tanpa Kode';
      if (code !== 'Tanpa Kode') {
        byKodeRekening[code] = (byKodeRekening[code] || 0) + (Number(item.amount) || 0);
      }
    });

    // Group by jenis transaksi
    const byJenisTransaksi: Record<string, number> = {};
    filteredItems.forEach(item => {
      const jenis = item.main_category || 'Lainnya';
      byJenisTransaksi[jenis] = (byJenisTransaksi[jenis] || 0) + (Number(item.amount) || 0);
    });

    // Build RKAS by kode_kegiatan and kode_rekening for comparison
    const rkasByKodeKegiatan: Record<string, number> = {};
    const rkasByKodeRekening: Record<string, number> = {};
    if (rkasDocuments) {
      rkasDocuments.forEach(doc => {
        if (doc.rkas_items) {
          doc.rkas_items.forEach((item: any) => {
            // Normalize kode by removing spaces
            const kodeKegiatan = (item.kode_kegiatan || '').trim().replace(/\s+/g, '') || 'Tanpa Kode';
            const kodeRekening = (item.kode_rekening || '').trim().replace(/\s+/g, '') || 'Tanpa Kode';
            const amount = Number(item.total_amount) || 0;
            
            if (kodeKegiatan !== 'Tanpa Kode') {
              rkasByKodeKegiatan[kodeKegiatan] = (rkasByKodeKegiatan[kodeKegiatan] || 0) + amount;
            }
            if (kodeRekening !== 'Tanpa Kode') {
              rkasByKodeRekening[kodeRekening] = (rkasByKodeRekening[kodeRekening] || 0) + amount;
            }
          });
        }
      });
    }

    // Group by 2-digit prefix of kode_kegiatan (standar pendidikan)
    const byStandarPendidikan: Record<string, number> = {};
    filteredItems.forEach(item => {
      const code = (item.kode_kegiatan || '').trim().replace(/\s+/g, '');
      if (code && code !== 'Tanpa Kode') {
        const prefix = code.substring(0, 2);
        if (/^\d{2}$/.test(prefix)) {
          byStandarPendidikan[prefix] = (byStandarPendidikan[prefix] || 0) + (Number(item.amount) || 0);
        }
      }
    });

    // Group RKAS by 2-digit prefix of kode_kegiatan (standar pendidikan)
    const rkasByStandarPendidikan: Record<string, number> = {};
    if (rkasDocuments) {
      rkasDocuments.forEach(doc => {
        if (doc.rkas_items) {
          doc.rkas_items.forEach((item: any) => {
            const code = (item.kode_kegiatan || '').trim().replace(/\s+/g, '');
            if (code && code !== 'Tanpa Kode') {
              const prefix = code.substring(0, 2);
              if (/^\d{2}$/.test(prefix)) {
                rkasByStandarPendidikan[prefix] = (rkasByStandarPendidikan[prefix] || 0) + (Number(item.total_amount) || 0);
              }
            }
          });
        }
      });
    }

    return {
      totalPenerimaan,
      totalPengeluaran,
      totalPajak,
      totalBelanja,
      saldoAkhir,
      totalRealization,
      totalBudget,
      selisih,
      persentaseRealisasi,
      byCategory,
      byKodeKegiatan,
      byKodeRekening,
      byJenisTransaksi,
      rkasByKodeKegiatan,
      rkasByKodeRekening,
      byStandarPendidikan,
      rkasByStandarPendidikan,
    };
  }, [filteredItems, rkasDocuments, spjDocuments]);

  // Normalize code for comparison - remove trailing dots and spaces
  const normalizeCode = (code: string): string => {
    if (!code) return '';
    return code.trim().replace(/\s+/g, '').replace(/\.+$/, '');
  };

  // Find matching RKAS code for SPJ code (flexible matching)
  const findMatchingRkasCode = (spjCode: string, rkasMap: Record<string, number>): string | null => {
    const normalizedSpjCode = normalizeCode(spjCode);
    if (!normalizedSpjCode) return null;
    
    // Exact match
    if (rkasMap[spjCode]) return spjCode;
    if (rkasMap[normalizedSpjCode]) return normalizedSpjCode;
    
    // Check with/without trailing dot
    const withDot = normalizedSpjCode + '.';
    const withoutDot = normalizedSpjCode.replace(/\.$/, '');
    if (rkasMap[withDot]) return withDot;
    if (rkasMap[withoutDot]) return withoutDot;
    
    // Find any key that matches when normalized
    for (const key of Object.keys(rkasMap)) {
      if (normalizeCode(key) === normalizedSpjCode) {
        return key;
      }
    }
    
    return null;
  };

  // Calculate comparison data for kode kegiatan - only show codes that exist in RKAS
  const comparisonByKodeKegiatan = useMemo(() => {
    const rkasMap = statistics.rkasByKodeKegiatan || {};
    const spjMap = statistics.byKodeKegiatan || {};
    
    // Use RKAS codes as the base
    const rkasCodes = Object.keys(rkasMap).filter(code => code !== 'Tanpa Kode');
    
    // Create a map of normalized RKAS codes for lookup
    const normalizedRkasMap: Record<string, { originalCode: string; amount: number }> = {};
    rkasCodes.forEach(code => {
      normalizedRkasMap[normalizeCode(code)] = { originalCode: code, amount: rkasMap[code] };
    });
    
    // Map normalized SPJ codes to their RKAS equivalents
    const spjToRkasMap: Record<string, number> = {};
    Object.entries(spjMap).forEach(([spjCode, amount]) => {
      const normalizedSpj = normalizeCode(spjCode);
      if (normalizedRkasMap[normalizedSpj]) {
        const rkasCode = normalizedRkasMap[normalizedSpj].originalCode;
        spjToRkasMap[rkasCode] = (spjToRkasMap[rkasCode] || 0) + amount;
      }
    });
    
    return rkasCodes
      .map(code => {
        const rkas = rkasMap[code] || 0;
        const spj = spjToRkasMap[code] || 0;
        const selisih = rkas - spj;
        const persentase = rkas > 0 ? (spj / rkas) * 100 : 0;
        return { code, rkas, spj, selisih, persentase };
      })
      .sort((a, b) => b.rkas - a.rkas);
  }, [statistics]);

  // SPJ codes that don't exist in RKAS (unbudgeted expenses)
  const unbudgetedByKodeKegiatan = useMemo(() => {
    const rkasMap = statistics.rkasByKodeKegiatan || {};
    const spjMap = statistics.byKodeKegiatan || {};
    
    // Create normalized RKAS code set
    const normalizedRkasCodes = new Set(
      Object.keys(rkasMap).map(code => normalizeCode(code))
    );
    
    const spjCodes = Object.keys(spjMap).filter(code => code !== 'Tanpa Kode');
    
    return spjCodes
      .filter(code => !normalizedRkasCodes.has(normalizeCode(code)))
      .map(code => ({
        code,
        rkas: 0,
        spj: spjMap[code] || 0,
        selisih: -(spjMap[code] || 0),
        persentase: 100
      }))
      .sort((a, b) => b.spj - a.spj);
  }, [statistics]);

  // Calculate comparison data for kode rekening - only show codes that exist in RKAS
  const comparisonByKodeRekening = useMemo(() => {
    const rkasMap = statistics.rkasByKodeRekening || {};
    const spjMap = statistics.byKodeRekening || {};
    
    // Use RKAS codes as the base
    const rkasCodes = Object.keys(rkasMap).filter(code => code !== 'Tanpa Kode');
    
    // Create a map of normalized RKAS codes for lookup
    const normalizedRkasMap: Record<string, { originalCode: string; amount: number }> = {};
    rkasCodes.forEach(code => {
      normalizedRkasMap[normalizeCode(code)] = { originalCode: code, amount: rkasMap[code] };
    });
    
    // Map normalized SPJ codes to their RKAS equivalents
    const spjToRkasMap: Record<string, number> = {};
    Object.entries(spjMap).forEach(([spjCode, amount]) => {
      const normalizedSpj = normalizeCode(spjCode);
      if (normalizedRkasMap[normalizedSpj]) {
        const rkasCode = normalizedRkasMap[normalizedSpj].originalCode;
        spjToRkasMap[rkasCode] = (spjToRkasMap[rkasCode] || 0) + amount;
      }
    });
    
    return rkasCodes
      .map(code => {
        const rkas = rkasMap[code] || 0;
        const spj = spjToRkasMap[code] || 0;
        const selisih = rkas - spj;
        const persentase = rkas > 0 ? (spj / rkas) * 100 : 0;
        return { code, rkas, spj, selisih, persentase };
      })
      .sort((a, b) => b.rkas - a.rkas);
  }, [statistics]);

  // SPJ codes that don't exist in RKAS (unbudgeted expenses)
  const unbudgetedByKodeRekening = useMemo(() => {
    const rkasMap = statistics.rkasByKodeRekening || {};
    const spjMap = statistics.byKodeRekening || {};
    
    // Create normalized RKAS code set
    const normalizedRkasCodes = new Set(
      Object.keys(rkasMap).map(code => normalizeCode(code))
    );
    
    const spjCodes = Object.keys(spjMap).filter(code => code !== 'Tanpa Kode');
    
    return spjCodes
      .filter(code => !normalizedRkasCodes.has(normalizeCode(code)))
      .map(code => ({
        code,
        rkas: 0,
        spj: spjMap[code] || 0,
        selisih: -(spjMap[code] || 0),
        persentase: 100
      }))
      .sort((a, b) => b.spj - a.spj);
  }, [statistics]);

  // Helper function to parse Indonesian currency format
  const parseIndonesianCurrency = (value: any): number => {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const str = String(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(str) || 0;
  };

  // Helper function to parse date from Excel
  const parseExcelDate = (value: any): string | null => {
    if (!value) return null;
    
    // If it's already a Date object (Excel dates)
    if (value instanceof Date) {
      return format(value, 'yyyy-MM-dd');
    }
    
    // If it's a number (Excel serial date)
    if (typeof value === 'number') {
      const date = XLSX.SSF.parse_date_code(value);
      if (date) {
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
    }
    
    // If it's a string like "23-01-2025" or "23/01/2025"
    if (typeof value === 'string') {
      const str = value.trim();
      // Try DD-MM-YYYY or DD/MM/YYYY format
      const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (match) {
        const [, day, month, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      // Try YYYY-MM-DD format
      const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
    
    return null;
  };

  // Helper function to clean kode values (remove line breaks)
  const cleanKode = (value: any): string => {
    if (!value) return '';
    return String(value).replace(/[\r\n]+/g, '').trim();
  };

  // Helper function to determine transaction category
  const determineCategory = (uraian: string, penerimaan: number, pengeluaran: number): { main_category: string; category: string } => {
    const lowerUraian = uraian.toLowerCase();
    
    if (penerimaan > 0 && pengeluaran === 0) {
      return { main_category: 'penerimaan', category: 'Penerimaan' };
    }
    
    if (lowerUraian.includes('pph') || lowerUraian.includes('ppn') || lowerUraian.includes('pajak')) {
      return { main_category: 'pajak', category: 'Pajak' };
    }
    
    if (lowerUraian.includes('transfer') || lowerUraian.includes('pemindahbukuan')) {
      return { main_category: 'transfer', category: 'Transfer' };
    }
    
    return { main_category: 'pengeluaran', category: 'Belanja' };
  };

  // Download template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'No': 1,
        'TANGGAL': '23-01-2025',
        'KODE KEGIATAN': '07.12.01.',
        'KODE REKENING': '5.1.02.02.01.0013',
        'NO. BUKTI': 'BNU01',
        'URAIAN': 'Contoh Uraian Transaksi',
        'PENERIMAAN': 0,
        'PENGELUARAN': 1000000,
      },
      {
        'No': 2,
        'TANGGAL': '23-01-2025',
        'KODE KEGIATAN': '07.12.03.',
        'KODE REKENING': '5.1.02.02.01.0026',
        'NO. BUKTI': 'BNU02',
        'URAIAN': 'Contoh Transaksi Lainnya',
        'PENERIMAAN': 0,
        'PENGELUARAN': 500000,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BKU');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 5 },   // No
      { wch: 12 },  // TANGGAL
      { wch: 15 },  // KODE KEGIATAN
      { wch: 20 },  // KODE REKENING
      { wch: 12 },  // NO. BUKTI
      { wch: 50 },  // URAIAN
      { wch: 15 },  // PENERIMAAN
      { wch: 15 },  // PENGELUARAN
    ];
    
    XLSX.writeFile(wb, 'Template_BKU.xlsx');
    toast.success('Template BKU berhasil diunduh');
  };

  // Upload mutation - now for Excel files
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true);
      
      // Read Excel file
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        throw new Error('File Excel kosong atau format tidak sesuai');
      }

      // Upload file to storage
      const fileName = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('spj-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('spj-documents')
        .getPublicUrl(fileName);

      // Parse items from Excel
      const items: any[] = [];
      let totalPenerimaan = 0;
      let totalPengeluaran = 0;
      let totalPajak = 0;
      let totalBelanja = 0;

      for (const row of jsonData as any[]) {
        // Get column values - support various column name formats
        const tanggal = row['TANGGAL'] || row['Tanggal'] || row['tanggal'];
        const kodeKegiatan = row['KODE KEGIATAN'] || row['Kode Kegiatan'] || row['kode_kegiatan'];
        const kodeRekening = row['KODE REKENING'] || row['Kode Rekening'] || row['kode_rekening'];
        const noBukti = row['NO. BUKTI'] || row['No. Bukti'] || row['no_bukti'] || row['NO BUKTI'];
        const uraian = row['URAIAN'] || row['Uraian'] || row['uraian'];
        const penerimaan = parseIndonesianCurrency(row['PENERIMAAN'] || row['Penerimaan'] || row['penerimaan'] || 0);
        const pengeluaran = parseIndonesianCurrency(row['PENGELUARAN'] || row['Pengeluaran'] || row['pengeluaran'] || 0);

        // Skip empty rows or header rows
        if (!uraian || String(uraian).toLowerCase() === 'uraian') continue;

        const parsedDate = parseExcelDate(tanggal);
        const { main_category, category } = determineCategory(String(uraian), penerimaan, pengeluaran);
        
        // Calculate totals
        if (main_category === 'penerimaan') {
          totalPenerimaan += penerimaan;
        } else if (main_category === 'pajak') {
          totalPajak += pengeluaran;
          totalPengeluaran += pengeluaran;
        } else if (main_category === 'pengeluaran') {
          totalBelanja += pengeluaran;
          totalPengeluaran += pengeluaran;
        }

        items.push({
          activity_name: String(uraian).trim(),
          kode_kegiatan: cleanKode(kodeKegiatan),
          kode_rekening: cleanKode(kodeRekening),
          sub_category: noBukti ? String(noBukti).trim() : null,
          amount: pengeluaran > 0 ? pengeluaran : penerimaan,
          transaction_date: parsedDate,
          main_category,
          category,
        });
      }

      if (items.length === 0) {
        throw new Error('Tidak ada data transaksi valid dalam file Excel');
      }

      // Calculate saldo akhir (penerimaan - pengeluaran)
      const saldoAkhir = totalPenerimaan - totalPengeluaran;

      // Create document record with summary
      const { data: docData, error: docError } = await supabase
        .from('spj_documents')
        .insert({
          month: selectedMonth,
          year: selectedYear,
          file_url: publicUrl,
          file_name: file.name,
          created_by: user?.id,
          status: 'completed',
          total_realization: totalPengeluaran,
          parsed_data: {
            summary: {
              total_penerimaan: totalPenerimaan,
              total_pengeluaran: totalPengeluaran,
              total_pajak: totalPajak,
              total_belanja: totalBelanja,
              saldo_akhir: saldoAkhir,
              total_items: items.length,
            },
          },
        })
        .select()
        .single();

      if (docError) throw docError;

      // Insert items
      const itemsToInsert = items.map(item => ({
        ...item,
        spj_id: docData.id,
      }));

      const { error: itemsError } = await supabase
        .from('spj_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      return docData;
    },
    onSuccess: () => {
      toast.success('BKU Excel berhasil diimport');
      queryClient.invalidateQueries({ queryKey: ['spj-documents'] });
      queryClient.invalidateQueries({ queryKey: ['spj-items'] });
    },
    onError: (error: any) => {
      toast.error(`Gagal import: ${error.message}`);
    },
    onSettled: () => {
      setUploading(false);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const doc = spjDocuments?.find(d => d.id === docId);
      if (doc?.file_url) {
        const fileName = doc.file_url.split('/').pop();
        if (fileName) {
          await supabase.storage.from('spj-documents').remove([fileName]);
        }
      }

      const { error } = await supabase
        .from('spj_documents')
        .delete()
        .eq('id', docId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Dokumen SPJ berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['spj-documents'] });
      queryClient.invalidateQueries({ queryKey: ['spj-items'] });
    },
    onError: (error: any) => {
      toast.error(`Gagal menghapus: ${error.message}`);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || 
                      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                      file.type === 'application/vnd.ms-excel';
      if (isExcel) {
        uploadMutation.mutate(file);
      } else {
        toast.error('Hanya file Excel (.xlsx, .xls) yang diperbolehkan');
      }
    }
    e.target.value = '';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <DashboardLayout>
      <div className="space-y-6 w-full max-w-full overflow-x-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">SPJ / BKU Management</h1>
            <p className="text-muted-foreground text-sm md:text-base">Kelola dan analisis realisasi anggaran</p>
          </div>
        </div>

        {/* Import BKU Excel - Moved to top */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Upload className="h-4 w-4 md:h-5 md:w-5" />
              Import BKU Excel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 md:gap-4 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs md:text-sm">Bulan</Label>
                  <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                    <SelectTrigger className="w-[120px] md:w-[150px]">
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
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs md:text-sm">Tahun</Label>
                  <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="w-[100px] md:w-[120px]">
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
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="h-9 md:h-10">
                  <Download className="mr-1.5 h-3.5 w-3.5 md:mr-2 md:h-4 md:w-4" />
                  <span className="hidden sm:inline">Download </span>Template
                </Button>
                <div>
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="hidden"
                    id="spj-upload-top"
                  />
                  <Button asChild disabled={uploading} size="sm" className="h-9 md:h-10">
                    <label htmlFor="spj-upload-top" className="cursor-pointer">
                      {uploading ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 md:mr-2 md:h-4 md:w-4 animate-spin" />
                          <span className="hidden sm:inline">Memproses...</span>
                          <span className="sm:hidden">...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="mr-1.5 h-3.5 w-3.5 md:mr-2 md:h-4 md:w-4" />
                          Import<span className="hidden sm:inline"> Excel</span>
                        </>
                      )}
                    </label>
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Format: No, TANGGAL, KODE KEGIATAN, KODE REKENING, NO. BUKTI, URAIAN, PENERIMAAN, PENGELUARAN
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Filter Data - Moved to top */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Filter className="h-4 w-4 md:h-5 md:w-5" />
              Filter Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs md:text-sm">Tahun</Label>
                <Select value={filterYear.toString()} onValueChange={(v) => setFilterYear(parseInt(v))}>
                  <SelectTrigger className="w-full">
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
              <div className="space-y-1.5">
                <Label className="text-xs md:text-sm">Bulan Awal</Label>
                <Select value={filterMonthStart} onValueChange={setFilterMonthStart}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Bulan Awal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    {months.map((m) => (
                      <SelectItem key={m.value} value={m.value.toString()}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs md:text-sm">Bulan Akhir</Label>
                <Select value={filterMonthEnd} onValueChange={setFilterMonthEnd}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Bulan Akhir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    {months.map((m) => (
                      <SelectItem key={m.value} value={m.value.toString()}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-xs md:text-sm">Kode Kegiatan</Label>
                <Select value={filterKodeKegiatan} onValueChange={setFilterKodeKegiatan}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Semua Kode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kode</SelectItem>
                    {uniqueKodeKegiatan.map((code) => (
                      <SelectItem key={code} value={code || ''}>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs">{code}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{getKodeKegiatanLabel(code)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-xs md:text-sm">Kode Rekening</Label>
                <Select value={filterKodeRekening} onValueChange={setFilterKodeRekening}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Semua Kode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kode</SelectItem>
                    {uniqueKodeRekening.map((code) => (
                      <SelectItem key={code} value={code || ''}>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs">{code}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{getKodeRekeningLabel(code)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs md:text-sm">Kategori</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Semua" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    {uniqueCategories.map((cat) => (
                      <SelectItem key={cat} value={cat || ''}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="w-full h-9 md:h-10"
                  onClick={() => {
                    setFilterMonthStart('all');
                    setFilterMonthEnd('all');
                    setFilterKodeKegiatan('all');
                    setFilterKodeRekening('all');
                    setFilterCategory('all');
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards - Modern Design */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          <BudgetStatCard
            title="Total Belanja"
            amount={statistics.totalBelanja}
            subtitle="Dana keluar (tanpa pajak)"
            icon={<Wallet className="h-4 w-4 md:h-5 md:w-5" />}
            type="expense"
          />

          <BudgetStatCard
            title="Total Pajak"
            amount={statistics.totalPajak}
            subtitle="PPh/PPN disetor"
            icon={<Receipt className="h-4 w-4 md:h-5 md:w-5" />}
            type="tax"
          />

          <BudgetStatCard
            title="Anggaran RKAS"
            amount={statistics.totalBudget}
            subtitle="Total anggaran periode ini"
            icon={<Calculator className="h-4 w-4 md:h-5 md:w-5" />}
            type="budget"
          />

          <BudgetStatCard
            title="Sisa Anggaran"
            amount={statistics.selisih}
            subtitle={`${statistics.persentaseRealisasi.toFixed(1)}% terpakai`}
            icon={statistics.selisih >= 0 ? <PiggyBank className="h-4 w-4 md:h-5 md:w-5" /> : <TrendingDown className="h-4 w-4 md:h-5 md:w-5" />}
            type="balance"
            progress={statistics.persentaseRealisasi}
          />

          {/* Makan Minum Kegiatan Card */}
          <MakanMinumCard 
            items={filteredItems || []}
            formatCurrency={formatCurrency}
            getKodeRekeningLabel={getKodeRekeningLabel}
            type="spj"
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
                const rkasAmount = statistics.rkasByStandarPendidikan?.[code] || 0;
                const spjAmount = statistics.byStandarPendidikan?.[code] || 0;
                const selisih = rkasAmount - spjAmount;
                const persentase = rkasAmount > 0 ? (spjAmount / rkasAmount) * 100 : 0;
                
                return (
                  <Card key={code} className="border border-border/50 bg-card/50">
                    <CardContent className="p-3 md:p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {code}
                        </Badge>
                        <span className={`text-xs font-medium ${
                          persentase >= 100 ? 'text-destructive' : 
                          persentase >= 80 ? 'text-yellow-600 dark:text-yellow-500' : 
                          'text-green-600 dark:text-green-500'
                        }`}>
                          {persentase.toFixed(1)}%
                        </span>
                      </div>
                      <h4 className="text-xs md:text-sm font-medium text-muted-foreground mb-2 line-clamp-2 min-h-[2rem] md:min-h-[2.5rem]">
                        {label}
                      </h4>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">RKAS:</span>
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            {new Intl.NumberFormat('id-ID', { notation: 'compact', compactDisplay: 'short' }).format(rkasAmount)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">SPJ:</span>
                          <span className="font-medium text-orange-600 dark:text-orange-400">
                            {new Intl.NumberFormat('id-ID', { notation: 'compact', compactDisplay: 'short' }).format(spjAmount)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">Sisa:</span>
                          <span className={`font-medium ${selisih >= 0 ? 'text-green-600 dark:text-green-500' : 'text-destructive'}`}>
                            {new Intl.NumberFormat('id-ID', { notation: 'compact', compactDisplay: 'short' }).format(selisih)}
                          </span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            persentase >= 100 ? 'bg-destructive' : 
                            persentase >= 80 ? 'bg-yellow-500' : 
                            'bg-primary'
                          }`}
                          style={{ width: `${Math.min(persentase, 100)}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Comparison Tables - Modern Cards Design */}
        <div className="space-y-6">
          {/* Comparison by Kode Kegiatan */}
          <BudgetComparisonSection
            title="Perbandingan RKAS vs SPJ per Kode Kegiatan"
            icon={<Layers className="h-5 w-5 text-primary" />}
            items={comparisonByKodeKegiatan.map(item => ({
              code: item.code,
              name: getKodeKegiatanLabel(item.code),
              subProgram: getKodeKegiatanSubProgram(item.code),
              rkas: item.rkas,
              spj: item.spj,
              selisih: item.selisih,
              persentase: item.persentase,
            }))}
            type="kegiatan"
            formatCurrency={formatCurrency}
            onViewDetail={(item, type) => setDrillDownData({
              type,
              code: item.code,
              rkas: item.rkas,
              spj: item.spj
            })}
          />

          {/* Comparison by Kode Rekening */}
          <BudgetComparisonSection
            title="Perbandingan RKAS vs SPJ per Kode Rekening"
            icon={<Hash className="h-5 w-5 text-primary" />}
            items={comparisonByKodeRekening.map(item => ({
              code: item.code,
              name: getKodeRekeningLabel(item.code),
              rkas: item.rkas,
              spj: item.spj,
              selisih: item.selisih,
              persentase: item.persentase,
            }))}
            type="rekening"
            formatCurrency={formatCurrency}
            onViewDetail={(item, type) => setDrillDownData({
              type,
              code: item.code,
              rkas: item.rkas,
              spj: item.spj
            })}
          />

          {/* Unbudgeted Expenses */}
          {(unbudgetedByKodeKegiatan.length > 0 || unbudgetedByKodeRekening.length > 0) && (
            <div className="space-y-4">
              <UnbudgetedExpenseSection
                items={unbudgetedByKodeKegiatan.map(item => ({
                  code: item.code,
                  name: getKodeKegiatanLabel(item.code),
                  subProgram: getKodeKegiatanSubProgram(item.code),
                  spj: item.spj,
                }))}
                type="kegiatan"
                formatCurrency={formatCurrency}
              />
              <UnbudgetedExpenseSection
                items={unbudgetedByKodeRekening.map(item => ({
                  code: item.code,
                  name: getKodeRekeningLabel(item.code),
                  spj: item.spj,
                }))}
                type="rekening"
                formatCurrency={formatCurrency}
              />
            </div>
          )}
        </div>

        {/* Comparison Charts */}
        {(comparisonByKodeKegiatan.length > 0 || comparisonByKodeRekening.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar Chart - Perbandingan per Kode Kegiatan */}
            {comparisonByKodeKegiatan.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Perbandingan RKAS vs SPJ per Kode Kegiatan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={comparisonByKodeKegiatan.slice(0, 8).map(item => ({
                          name: item.code,
                          label: getKodeKegiatanLabel(item.code),
                          RKAS: item.rkas,
                          SPJ: item.spj,
                        }))}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          type="number" 
                          tickFormatter={(value) => `${(value / 1000000).toFixed(0)}jt`}
                          className="text-xs"
                        />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          width={80}
                          className="text-xs"
                          tick={{ fontSize: 10 }}
                        />
                        <Tooltip 
                          formatter={(value: number, name: string) => [formatCurrency(value), name]}
                          labelFormatter={(label, payload) => {
                            if (payload && payload[0]) {
                              return `${label} - ${payload[0].payload.label}`;
                            }
                            return label;
                          }}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--background))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Bar dataKey="RKAS" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="SPJ" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bar Chart - Perbandingan per Kode Rekening */}
            {comparisonByKodeRekening.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Perbandingan RKAS vs SPJ per Kode Rekening
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={comparisonByKodeRekening.slice(0, 8).map(item => ({
                          name: item.code.length > 15 ? '...' + item.code.substring(item.code.length - 12) : item.code,
                          fullCode: item.code,
                          label: getKodeRekeningLabel(item.code),
                          RKAS: item.rkas,
                          SPJ: item.spj,
                        }))}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          type="number" 
                          tickFormatter={(value) => `${(value / 1000000).toFixed(0)}jt`}
                          className="text-xs"
                        />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          width={100}
                          className="text-xs"
                          tick={{ fontSize: 9 }}
                        />
                        <Tooltip 
                          formatter={(value: number, name: string) => [formatCurrency(value), name]}
                          labelFormatter={(label, payload) => {
                            if (payload && payload[0]) {
                              return `${payload[0].payload.fullCode}\n${payload[0].payload.label}`;
                            }
                            return label;
                          }}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--background))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Bar dataKey="RKAS" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="SPJ" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Charts Section */}
        {(Object.keys(statistics.byCategory).length > 0 || Object.keys(statistics.byKodeKegiatan).length > 0 || Object.keys(statistics.byKodeRekening).length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar Chart - Realisasi per Kode Kegiatan */}
            {Object.keys(statistics.byKodeKegiatan).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Realisasi per Kode Kegiatan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.entries(statistics.byKodeKegiatan).map(([code, amount]) => ({
                          name: code,
                          label: getKodeKegiatanLabel(code),
                          amount: amount,
                        })).sort((a, b) => b.amount - a.amount)}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          type="number" 
                          tickFormatter={(value) => `${(value / 1000000).toFixed(0)}jt`}
                          className="text-xs"
                        />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          width={80}
                          className="text-xs"
                        />
                        <Tooltip 
                          formatter={(value: number) => [formatCurrency(value), 'Jumlah']}
                          labelFormatter={(label, payload) => {
                            if (payload && payload[0]) {
                              return `${label} - ${payload[0].payload.label}`;
                            }
                            return label;
                          }}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--background))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar 
                          dataKey="amount" 
                          fill="hsl(var(--primary))" 
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bar Chart - Realisasi per Kode Rekening */}
            {Object.keys(statistics.byKodeRekening).filter(k => k !== 'Tanpa Kode').length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Realisasi per Kode Rekening
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.entries(statistics.byKodeRekening)
                          .filter(([code]) => code !== 'Tanpa Kode')
                          .map(([code, amount]) => ({
                            name: code.length > 15 ? code.substring(code.length - 12) : code,
                            fullCode: code,
                            label: getKodeRekeningLabel(code),
                            amount: amount,
                          }))
                          .sort((a, b) => b.amount - a.amount)
                          .slice(0, 10)}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          type="number" 
                          tickFormatter={(value) => `${(value / 1000000).toFixed(0)}jt`}
                          className="text-xs"
                        />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          width={100}
                          className="text-xs"
                          tick={{ fontSize: 10 }}
                        />
                        <Tooltip 
                          formatter={(value: number) => [formatCurrency(value), 'Jumlah']}
                          labelFormatter={(label, payload) => {
                            if (payload && payload[0]) {
                              return `${payload[0].payload.fullCode}\n${payload[0].payload.label}`;
                            }
                            return label;
                          }}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--background))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar 
                          dataKey="amount" 
                          fill="hsl(var(--chart-2))" 
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pie Chart - Distribusi per Kategori */}
            {Object.keys(statistics.byCategory).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Distribusi per Kategori
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={Object.entries(statistics.byCategory).map(([category, amount], index) => ({
                            name: category,
                            value: amount,
                          }))}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name.substring(0, 15)}${name.length > 15 ? '...' : ''} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {Object.entries(statistics.byCategory).map((_, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={[
                                'hsl(var(--primary))',
                                'hsl(var(--chart-2))',
                                'hsl(var(--chart-3))',
                                'hsl(var(--chart-4))',
                                'hsl(var(--chart-5))',
                                'hsl(221.2 83.2% 53.3%)',
                                'hsl(212 95% 68%)',
                                'hsl(142.1 76.2% 36.3%)',
                              ][index % 8]} 
                            />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => [formatCurrency(value), 'Jumlah']}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--background))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pie Chart - Distribusi per Kode Rekening */}
            {Object.keys(statistics.byKodeRekening).filter(k => k !== 'Tanpa Kode').length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Distribusi per Kode Rekening
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={Object.entries(statistics.byKodeRekening)
                            .filter(([code]) => code !== 'Tanpa Kode')
                            .map(([code, amount]) => ({
                              name: code.length > 15 ? '...' + code.substring(code.length - 12) : code,
                              fullCode: code,
                              value: amount,
                            }))
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 8)}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {Object.entries(statistics.byKodeRekening)
                            .filter(([code]) => code !== 'Tanpa Kode')
                            .slice(0, 8)
                            .map((_, index) => (
                              <Cell 
                                key={`cell-rek-${index}`} 
                                fill={[
                                  'hsl(var(--chart-2))',
                                  'hsl(var(--chart-3))',
                                  'hsl(var(--chart-4))',
                                  'hsl(var(--chart-5))',
                                  'hsl(var(--primary))',
                                  'hsl(221.2 83.2% 53.3%)',
                                  'hsl(212 95% 68%)',
                                  'hsl(142.1 76.2% 36.3%)',
                                ][index % 8]} 
                              />
                            ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number, name: string, props: any) => [
                            formatCurrency(value), 
                            props.payload.fullCode || name
                          ]}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--background))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend 
                          formatter={(value, entry: any) => entry.payload?.fullCode || value}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Category Statistics Cards */}
        {Object.keys(statistics.byCategory).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Detail Realisasi per Kategori</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(statistics.byCategory).map(([category, amount]) => (
                  <div key={category} className="p-4 bg-secondary/50 rounded-lg">
                    <div className="text-sm text-muted-foreground">{category}</div>
                    <div className="text-lg font-semibold">{formatCurrency(amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {((amount / statistics.totalRealization) * 100).toFixed(1)}% dari total
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Kode Kegiatan Statistics Cards */}
        {Object.keys(statistics.byKodeKegiatan).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Detail Realisasi per Kode Kegiatan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(statistics.byKodeKegiatan).map(([code, amount]) => (
                  <div key={code} className="p-4 bg-secondary/50 rounded-lg">
                    <div className="text-sm font-medium font-mono">{code}</div>
                    <div className="text-xs text-muted-foreground">{getKodeKegiatanLabel(code)}</div>
                    {getKodeKegiatanSubProgram(code) && (
                      <div className="text-xs text-muted-foreground/70 mb-1">{getKodeKegiatanSubProgram(code)}</div>
                    )}
                    <div className="text-lg font-semibold">{formatCurrency(amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {((amount / statistics.totalRealization) * 100).toFixed(1)}% dari total
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Drill-Down Dialog */}
        <Dialog open={!!drillDownData} onOpenChange={() => setDrillDownData(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Detail Belanja - {drillDownData?.code}
              </DialogTitle>
            </DialogHeader>
            {drillDownData && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-primary/10 rounded-lg text-center">
                    <div className="text-xs text-muted-foreground mb-1">Anggaran RKAS</div>
                    <div className="text-lg font-bold text-primary">{formatCurrency(drillDownData.rkas)}</div>
                  </div>
                  <div className="p-4 bg-chart-2/10 rounded-lg text-center">
                    <div className="text-xs text-muted-foreground mb-1">Realisasi SPJ</div>
                    <div className="text-lg font-bold text-chart-2">{formatCurrency(drillDownData.spj)}</div>
                  </div>
                  <div className={`p-4 rounded-lg text-center ${drillDownData.rkas - drillDownData.spj >= 0 ? 'bg-green-500/10' : 'bg-destructive/10'}`}>
                    <div className="text-xs text-muted-foreground mb-1">Selisih</div>
                    <div className={`text-lg font-bold ${drillDownData.rkas - drillDownData.spj >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {formatCurrency(drillDownData.rkas - drillDownData.spj)}
                    </div>
                  </div>
                </div>

                {/* Label Info */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="font-mono text-sm text-primary mb-1">{drillDownData.code}</div>
                  <div className="font-medium">
                    {drillDownData.type === 'kode_kegiatan' 
                      ? getKodeKegiatanLabel(drillDownData.code)
                      : getKodeRekeningLabel(drillDownData.code)
                    }
                  </div>
                  {drillDownData.type === 'kode_kegiatan' && getKodeKegiatanSubProgram(drillDownData.code) && (
                    <div className="text-sm text-muted-foreground">{getKodeKegiatanSubProgram(drillDownData.code)}</div>
                  )}
                </div>

                {/* RKAS Detail Items */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Detail Anggaran RKAS
                  </h4>
                  {(() => {
                    const rkasItemsForCode = rkasDocuments?.flatMap(doc => 
                      (doc.rkas_items || []).filter((item: any) => {
                        const itemCode = drillDownData.type === 'kode_kegiatan' 
                          ? (item.kode_kegiatan || '').trim().replace(/\s+/g, '')
                          : (item.kode_rekening || '').trim().replace(/\s+/g, '');
                        const compareCode = drillDownData.code.trim().replace(/\s+/g, '');
                        return normalizeCode(itemCode) === normalizeCode(compareCode);
                      })
                    ) || [];
                    
                    if (rkasItemsForCode.length === 0) {
                      return <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg">Tidak ada data anggaran RKAS</div>;
                    }
                    
                    return (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]">No</TableHead>
                            <TableHead>Kegiatan</TableHead>
                            <TableHead>Sub Kegiatan</TableHead>
                            <TableHead className="text-right">Volume</TableHead>
                            <TableHead>Satuan</TableHead>
                            <TableHead className="text-right">Harga Satuan</TableHead>
                            <TableHead className="text-right">Jumlah</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rkasItemsForCode.map((item: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell>{idx + 1}</TableCell>
                              <TableCell className="text-sm">{item.activity_name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {item.description || item.sub_category || '-'}
                              </TableCell>
                              <TableCell className="text-right">{item.volume || 1}</TableCell>
                              <TableCell>{item.unit || '-'}</TableCell>
                              <TableCell className="text-right">{formatCurrency(Number(item.unit_price) || 0)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(Number(item.total_amount) || 0)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/50 font-bold">
                            <TableCell colSpan={6} className="text-right">TOTAL RKAS</TableCell>
                            <TableCell className="text-right">{formatCurrency(rkasItemsForCode.reduce((sum: number, item: any) => sum + (Number(item.total_amount) || 0), 0))}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    );
                  })()}
                </div>

                {/* SPJ Detail Items */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-chart-2" />
                    Detail Realisasi SPJ
                  </h4>
                  {(() => {
                    const spjItemsForCode = filteredItems.filter(item => {
                      const itemCode = drillDownData.type === 'kode_kegiatan' 
                        ? (item.kode_kegiatan || '').trim().replace(/\s+/g, '')
                        : (item.kode_rekening || '').trim().replace(/\s+/g, '');
                      const compareCode = drillDownData.code.trim().replace(/\s+/g, '');
                      return normalizeCode(itemCode) === normalizeCode(compareCode);
                    });
                    
                    if (spjItemsForCode.length === 0) {
                      return <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg">Tidak ada data realisasi SPJ</div>;
                    }
                    
                    return (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]">No</TableHead>
                            <TableHead className="w-[80px]">Tanggal</TableHead>
                            <TableHead>Uraian</TableHead>
                            <TableHead className="w-[80px]">Jenis</TableHead>
                            <TableHead className="text-right">Jumlah</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {spjItemsForCode.map((item, idx) => (
                            <TableRow key={item.id}>
                              <TableCell>{idx + 1}</TableCell>
                              <TableCell className="text-xs">
                                {item.transaction_date ? format(new Date(item.transaction_date), 'dd/MM/yy') : '-'}
                              </TableCell>
                              <TableCell className="text-sm max-w-[300px] truncate" title={item.activity_name}>
                                {item.activity_name}
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant="outline"
                                  className={`text-xs ${
                                    item.main_category === 'penerimaan' ? 'bg-green-500/10 text-green-600 border-green-500/30' :
                                    item.main_category === 'pajak' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' : 
                                    'bg-red-500/10 text-red-600 border-red-500/30'
                                  }`}
                                >
                                  {item.main_category === 'penerimaan' ? 'Terima' :
                                   item.main_category === 'pajak' ? 'Pajak' : 'Keluar'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(Number(item.amount) || 0)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/50 font-bold">
                            <TableCell colSpan={4} className="text-right">TOTAL SPJ</TableCell>
                            <TableCell className="text-right">{formatCurrency(spjItemsForCode.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    );
                  })()}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Documents Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Dokumen SPJ/BKU
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDocuments ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : spjDocuments && spjDocuments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Nama File</TableHead>
                    <TableHead>Total Realisasi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal Upload</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spjDocuments.map((doc, index) => (
                    <TableRow key={doc.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        {months.find(m => m.value === doc.month)?.label} {doc.year}
                      </TableCell>
                      <TableCell>
                        <a 
                          href={doc.file_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {doc.file_name}
                        </a>
                      </TableCell>
                      <TableCell>{formatCurrency(Number(doc.total_realization) || 0)}</TableCell>
                      <TableCell>
                        <Badge variant={
                          doc.status === 'completed' ? 'default' : 
                          doc.status === 'processing' ? 'secondary' : 'outline'
                        }>
                          {doc.status === 'completed' ? 'Selesai' : 
                           doc.status === 'processing' ? 'Diproses' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(doc.created_at), 'dd MMM yyyy HH:mm', { locale: id })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(doc.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Belum ada dokumen SPJ/BKU untuk periode ini
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
};

export default SPJManagement;
