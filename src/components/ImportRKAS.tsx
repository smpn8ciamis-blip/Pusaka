import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, Download, Upload, Loader2, Eye, CheckCircle, XCircle, AlertTriangle, Pencil, Check, X, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";

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

interface ImportResult {
  month: number;
  inserted: number;
  skipped: number;
  errors: string[];
  validationErrors: string[];
}

interface PreviewRow {
  rowNumber: number;
  kode_kegiatan: string;
  kode_rekening: string;
  kategori: string;
  nama_kegiatan: string;
  deskripsi: string;
  volume: number;
  satuan: string;
  harga_satuan: number;
  jumlah: number;
  isValid: boolean;
  errors: string[];
}

interface PreviewData {
  month: number;
  monthLabel: string;
  rows: PreviewRow[];
  validCount: number;
  invalidCount: number;
  totalBudget: number;
}

interface EditingCell {
  monthLabel: string;
  rowNumber: number;
  field: 'kode_kegiatan' | 'kode_rekening';
}

// Helper to normalize kode format - remove extra spaces and trailing dots
const normalizeKode = (kode: string): string => {
  if (!kode) return "";
  // Remove spaces around dots: "03. 03. 07" -> "03.03.07"
  // Remove trailing dots: "03.03.07." -> "03.03.07"
  return kode
    .replace(/\s*\.\s*/g, ".")  // Remove spaces around dots
    .replace(/\.+$/, "")         // Remove trailing dots
    .trim();
};

// Validation functions for kode format - flexible to accept various formats
const validateKodeRekening = (kode: string, validKodes?: Set<string>): { valid: boolean; error?: string; normalized?: string } => {
  if (!kode || kode.trim() === "") {
    return { valid: true, normalized: "" }; // Empty is allowed
  }
  
  // Normalize the kode first
  const normalized = normalizeKode(kode);
  
  // If we have valid kodes from database, check against them
  if (validKodes && validKodes.size > 0) {
    if (validKodes.has(normalized)) {
      return { valid: true, normalized };
    }
    // Also try without leading zeros normalization for flexibility
    const withoutLeadingZeros = normalized.replace(/\.0+/g, '.').replace(/^0+/, '');
    if (validKodes.has(withoutLeadingZeros)) {
      return { valid: true, normalized };
    }
  }
  
  // Flexible pattern: accepts various formats like:
  // 5.1.02.04.01.0001, 5.2.02.10.02.0005, 04.06.41, etc.
  // Pattern: starts with digit, contains dots, has at least 2 segments
  const flexiblePattern = /^\d+(\.\d+){1,}$/;
  if (!flexiblePattern.test(normalized)) {
    return { 
      valid: false, 
      error: `Kode rekening "${kode}" tidak valid (format: XX.XX.XX...)`,
      normalized 
    };
  }
  
  return { valid: true, normalized };
};

const validateKodeKegiatan = (kode: string, validKodes?: Set<string>): { valid: boolean; error?: string; normalized?: string } => {
  if (!kode || kode.trim() === "") {
    return { valid: true, normalized: "" }; // Empty is allowed
  }
  
  // Normalize the kode first
  const normalized = normalizeKode(kode);
  
  // If we have valid kodes from database, check against them
  if (validKodes && validKodes.size > 0) {
    if (validKodes.has(normalized)) {
      return { valid: true, normalized };
    }
  }
  
  // Flexible pattern: accepts various formats like XX.XX.XX, XX.XX, etc.
  // Pattern: starts with digit, contains dots, has at least 2 segments
  const flexiblePattern = /^\d+(\.\d+){1,}$/;
  if (!flexiblePattern.test(normalized)) {
    return { 
      valid: false, 
      error: `Kode kegiatan "${kode}" tidak valid (format: XX.XX.XX)`,
      normalized 
    };
  }
  
  return { valid: true, normalized };
};

export const ImportRKAS = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [previewData, setPreviewData] = useState<PreviewData[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedPreviewMonth, setSelectedPreviewMonth] = useState<string>("");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const currentYear = new Date().getFullYear();

    // Create a sheet for each month
    MONTHS.forEach((month) => {
      const templateData = [
        {
          kode_kegiatan: "12.07.01",
          kode_rekening: "5.1.02.01.01.0001",
          kategori: "Pengembangan Standar Proses",
          nama_kegiatan: "Contoh Kegiatan",
          deskripsi: "Deskripsi kegiatan",
          volume: 1,
          satuan: "Paket",
          harga_satuan: 1000000,
          jumlah: 1000000,
        },
      ];

      const ws = XLSX.utils.json_to_sheet(templateData);

      // Set column widths
      ws["!cols"] = [
        { wch: 15 }, // kode_kegiatan
        { wch: 20 }, // kode_rekening
        { wch: 35 }, // kategori
        { wch: 40 }, // nama_kegiatan
        { wch: 40 }, // deskripsi
        { wch: 10 }, // volume
        { wch: 15 }, // satuan
        { wch: 15 }, // harga_satuan
        { wch: 15 }, // jumlah
      ];

      XLSX.utils.book_append_sheet(wb, ws, month.label);
    });

    // Generate and download file
    const fileName = `Template_RKAS_${currentYear}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Template berhasil diunduh",
      description: `File ${fileName} berisi 12 sheet untuk setiap bulan`,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
        toast({
          title: "Format file tidak valid",
          description: "Harap gunakan file Excel (.xlsx atau .xls)",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      setImportResults([]);
      setPreviewData([]);
      setShowPreview(false);
    }
  };

  const handlePreview = async () => {
    if (!selectedFile) {
      toast({
        title: "Pilih file",
        description: "Harap pilih file Excel terlebih dahulu",
        variant: "destructive",
      });
      return;
    }

    setIsPreviewing(true);
    try {
      // Fetch valid kode from database for validation
      const [kodeRekeningResult, kodeKegiatanResult] = await Promise.all([
        supabase.from('kode_rekening_labels').select('kode'),
        supabase.from('kode_kegiatan_labels').select('kode')
      ]);

      const validKodeRekening = new Set<string>(
        (kodeRekeningResult.data || []).map(item => normalizeKode(item.kode))
      );
      const validKodeKegiatan = new Set<string>(
        (kodeKegiatanResult.data || []).map(item => normalizeKode(item.kode))
      );

      const arrayBuffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      const previews: PreviewData[] = [];

      for (const sheetName of workbook.SheetNames) {
        const monthInfo = MONTHS.find(m => m.label.toLowerCase() === sheetName.toLowerCase());
        if (!monthInfo) continue;

        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

        if (jsonData.length === 0) continue;

        const rows: PreviewRow[] = [];
        let validCount = 0;
        let invalidCount = 0;
        let totalBudget = 0;

        jsonData.forEach((row, index) => {
          const kodeKegiatanRaw = String(row.kode_kegiatan || "").trim();
          const kodeRekeningRaw = String(row.kode_rekening || "").trim();
          const kategori = String(row.kategori || row.category || "Lainnya");
          const namaKegiatan = String(row.nama_kegiatan || row.activity_name || "-");
          const deskripsi = String(row.deskripsi || row.description || "");
          const volume = parseFloat(String(row.volume || 1));
          const satuan = String(row.satuan || row.unit || "-");
          const hargaSatuan = parseFloat(String(row.harga_satuan || row.unit_price || 0));
          const jumlah = parseFloat(String(row.jumlah || row.total_amount || 0));

          const kegiatanValidation = validateKodeKegiatan(kodeKegiatanRaw, validKodeKegiatan);
          const rekeningValidation = validateKodeRekening(kodeRekeningRaw, validKodeRekening);
          
          const errors: string[] = [];
          if (!kegiatanValidation.valid && kegiatanValidation.error) {
            errors.push(kegiatanValidation.error);
          }
          if (!rekeningValidation.valid && rekeningValidation.error) {
            errors.push(rekeningValidation.error);
          }

          const isValid = errors.length === 0;
          if (isValid) {
            validCount++;
            totalBudget += isNaN(jumlah) ? 0 : jumlah;
          } else {
            invalidCount++;
          }

          // Use normalized kode values (without extra spaces and trailing dots)
          rows.push({
            rowNumber: index + 2,
            kode_kegiatan: kegiatanValidation.normalized || kodeKegiatanRaw,
            kode_rekening: rekeningValidation.normalized || kodeRekeningRaw,
            kategori,
            nama_kegiatan: namaKegiatan,
            deskripsi,
            volume: isNaN(volume) ? 1 : volume,
            satuan,
            harga_satuan: isNaN(hargaSatuan) ? 0 : hargaSatuan,
            jumlah: isNaN(jumlah) ? 0 : jumlah,
            isValid,
            errors,
          });
        });

        previews.push({
          month: monthInfo.value,
          monthLabel: monthInfo.label,
          rows,
          validCount,
          invalidCount,
          totalBudget,
        });
      }

      if (previews.length === 0) {
        toast({
          title: "Tidak ada data",
          description: "File tidak berisi data RKAS yang valid",
          variant: "destructive",
        });
        return;
      }

      setPreviewData(previews);
      setSelectedPreviewMonth(previews[0].monthLabel);
      setShowPreview(true);
    } catch (error) {
      toast({
        title: "Error membaca file",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const importMutation = useMutation({
    mutationFn: async (): Promise<ImportResult[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User tidak terautentikasi");

      setIsImporting(true);
      const results: ImportResult[] = [];

      // Get year from filename or use current year
      const yearMatch = selectedFile?.name.match(/(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

      // If we have preview data, use the edited data from preview
      if (previewData.length > 0) {
        for (const preview of previewData) {
          const monthResult: ImportResult = {
            month: preview.month,
            inserted: 0,
            skipped: 0,
            errors: [],
            validationErrors: [],
          };

          try {
            // Get valid rows from preview (which may have been edited)
            const validRows = preview.rows.filter(row => row.isValid);
            const invalidRows = preview.rows.filter(row => !row.isValid);

            monthResult.skipped = invalidRows.length;
            invalidRows.forEach(row => {
              monthResult.validationErrors.push(`Baris ${row.rowNumber}: ${row.errors.join("; ")}`);
            });

            // If no valid rows, skip this month
            if (validRows.length === 0) {
              results.push(monthResult);
              continue;
            }

            // Check if RKAS already exists for this month/year
            const { data: existing } = await supabase
              .from("rkas_documents")
              .select("id")
              .eq("month", preview.month)
              .eq("year", year)
              .maybeSingle();

            let rkasDocId: string;
            const totalBudget = preview.totalBudget;

            if (existing) {
              // Delete existing items and update document
              await supabase.from("rkas_items").delete().eq("rkas_id", existing.id);
              rkasDocId = existing.id;

              await supabase
                .from("rkas_documents")
                .update({
                  total_budget: totalBudget,
                  status: "parsed",
                  file_name: `Import Excel - ${preview.monthLabel} ${year}`,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id);
            } else {
              // Create new RKAS document
              const { data: newDoc, error: docError } = await supabase
                .from("rkas_documents")
                .insert({
                  month: preview.month,
                  year: year,
                  file_url: "",
                  file_name: `Import Excel - ${preview.monthLabel} ${year}`,
                  total_budget: totalBudget,
                  status: "parsed",
                  parsed_data: { items: [], summary: [], total_budget: totalBudget },
                  created_by: user.id,
                })
                .select()
                .single();

              if (docError) throw docError;
              rkasDocId = newDoc.id;
            }

            // Insert only valid items from preview
            const itemsToInsert = validRows.map((row) => ({
              rkas_id: rkasDocId,
              kode_kegiatan: row.kode_kegiatan || null,
              kode_rekening: row.kode_rekening || null,
              category: row.kategori,
              activity_name: row.nama_kegiatan,
              description: row.deskripsi || null,
              volume: row.volume,
              unit: row.satuan,
              unit_price: row.harga_satuan,
              total_amount: row.jumlah,
            }));

            if (itemsToInsert.length > 0) {
              const { error: itemsError } = await supabase
                .from("rkas_items")
                .insert(itemsToInsert);

              if (itemsError) {
                monthResult.errors.push(`Error insert items: ${itemsError.message}`);
              } else {
                monthResult.inserted = itemsToInsert.length;
              }
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            monthResult.errors.push(errorMessage);
          }

          results.push(monthResult);
        }

        return results;
      }

      // Fallback: Read from Excel file directly (if no preview)
      if (!selectedFile) throw new Error("Tidak ada file yang dipilih");

      const arrayBuffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      // Process each sheet (month)
      for (const sheetName of workbook.SheetNames) {
        const monthInfo = MONTHS.find(m => m.label.toLowerCase() === sheetName.toLowerCase());
        if (!monthInfo) {
          results.push({
            month: 0,
            inserted: 0,
            skipped: 0,
            errors: [`Sheet "${sheetName}" tidak dikenali sebagai bulan`],
            validationErrors: [],
          });
          continue;
        }

        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

        if (jsonData.length === 0) {
          results.push({
            month: monthInfo.value,
            inserted: 0,
            skipped: 0,
            errors: [],
            validationErrors: [],
          });
          continue;
        }

        const monthResult: ImportResult = {
          month: monthInfo.value,
          inserted: 0,
          skipped: 0,
          errors: [],
          validationErrors: [],
        };

        try {
          // Validate all rows first
          const validRows: { row: Record<string, unknown>; normalizedKegiatan: string; normalizedRekening: string }[] = [];
          
          jsonData.forEach((row, index) => {
            const kodeKegiatanRaw = String(row.kode_kegiatan || "").trim();
            const kodeRekeningRaw = String(row.kode_rekening || "").trim();
            
            const kegiatanValidation = validateKodeKegiatan(kodeKegiatanRaw);
            const rekeningValidation = validateKodeRekening(kodeRekeningRaw);
            
            if (!kegiatanValidation.valid || !rekeningValidation.valid) {
              if (!kegiatanValidation.valid) {
                monthResult.validationErrors.push(`Baris ${index + 2}: ${kegiatanValidation.error}`);
              }
              if (!rekeningValidation.valid) {
                monthResult.validationErrors.push(`Baris ${index + 2}: ${rekeningValidation.error}`);
              }
              monthResult.skipped++;
            } else {
              validRows.push({
                row,
                normalizedKegiatan: kegiatanValidation.normalized || "",
                normalizedRekening: rekeningValidation.normalized || "",
              });
            }
          });

          // If no valid rows, skip this month
          if (validRows.length === 0 && monthResult.validationErrors.length > 0) {
            results.push(monthResult);
            continue;
          }

          // Check if RKAS already exists for this month/year
          const { data: existing } = await supabase
            .from("rkas_documents")
            .select("id")
            .eq("month", monthInfo.value)
            .eq("year", year)
            .maybeSingle();

          let rkasDocId: string;

          // Calculate total budget from valid items only
          const totalBudget = validRows.reduce((sum: number, item) => {
            const jumlah = parseFloat(String(item.row.jumlah || item.row.total_amount || 0));
            return sum + (isNaN(jumlah) ? 0 : jumlah);
          }, 0);

          if (existing) {
            // Delete existing items and update document
            await supabase.from("rkas_items").delete().eq("rkas_id", existing.id);
            rkasDocId = existing.id;

            await supabase
              .from("rkas_documents")
              .update({
                total_budget: totalBudget,
                status: "parsed",
                file_name: `Import Excel - ${monthInfo.label} ${year}`,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            // Create new RKAS document
            const { data: newDoc, error: docError } = await supabase
              .from("rkas_documents")
              .insert({
                month: monthInfo.value,
                year: year,
                file_url: "",
                file_name: `Import Excel - ${monthInfo.label} ${year}`,
                total_budget: totalBudget,
                status: "parsed",
                parsed_data: { items: [], summary: [], total_budget: totalBudget },
                created_by: user.id,
              })
              .select()
              .single();

            if (docError) throw docError;
            rkasDocId = newDoc.id;
          }

          // Insert only valid items with normalized kode values
          const itemsToInsert = validRows.map((item) => {
            const { row, normalizedKegiatan, normalizedRekening } = item;
            const kategori = String(row.kategori || row.category || "Lainnya");
            const namaKegiatan = String(row.nama_kegiatan || row.activity_name || "-");
            const deskripsi = String(row.deskripsi || row.description || "");
            const volume = parseFloat(String(row.volume || 1));
            const satuan = String(row.satuan || row.unit || "-");
            const hargaSatuan = parseFloat(String(row.harga_satuan || row.unit_price || 0));
            const jumlah = parseFloat(String(row.jumlah || row.total_amount || hargaSatuan * volume));

            return {
              rkas_id: rkasDocId,
              kode_kegiatan: normalizedKegiatan || null,
              kode_rekening: normalizedRekening || null,
              category: kategori,
              activity_name: namaKegiatan,
              description: deskripsi || null,
              volume: isNaN(volume) ? 1 : volume,
              unit: satuan,
              unit_price: isNaN(hargaSatuan) ? 0 : hargaSatuan,
              total_amount: isNaN(jumlah) ? 0 : jumlah,
            };
          });

          if (itemsToInsert.length > 0) {
            const { error: itemsError } = await supabase
              .from("rkas_items")
              .insert(itemsToInsert);

            if (itemsError) {
              monthResult.errors.push(`Error insert items: ${itemsError.message}`);
            } else {
              monthResult.inserted = itemsToInsert.length;
            }
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          monthResult.errors.push(errorMessage);
        }

        results.push(monthResult);
      }

      return results;
    },
    onSuccess: (results: ImportResult[]) => {
      setImportResults(results);
      setShowPreview(false);
      setPreviewData([]);
      queryClient.invalidateQueries({ queryKey: ["rkas-documents"] });
      queryClient.invalidateQueries({ queryKey: ["rkas-items-filtered"] });

      const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
      const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      const totalValidationErrors = results.reduce((sum, r) => sum + r.validationErrors.length, 0);

      if (totalErrors === 0 && totalValidationErrors === 0) {
        toast({
          title: "Import berhasil",
          description: `Berhasil mengimport ${totalInserted} item RKAS`,
        });
      } else if (totalValidationErrors > 0) {
        toast({
          title: "Import selesai dengan validasi error",
          description: `${totalInserted} item berhasil, ${totalSkipped} dilewati (format kode tidak valid)`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Import selesai dengan beberapa error",
          description: `${totalInserted} item berhasil, ${totalErrors} error`,
          variant: "destructive",
        });
      }
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Gagal import",
        description: errorMessage,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsImporting(false);
    },
  });

  const handleImport = () => {
    if (!selectedFile) {
      toast({
        title: "Pilih file",
        description: "Harap pilih file Excel terlebih dahulu",
        variant: "destructive",
      });
      return;
    }
    importMutation.mutate();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Start editing a cell
  const handleStartEdit = (monthLabel: string, rowNumber: number, field: 'kode_kegiatan' | 'kode_rekening', currentValue: string) => {
    setEditingCell({ monthLabel, rowNumber, field });
    setEditValue(currentValue);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  // Save edited value and revalidate
  const handleSaveEdit = useCallback(() => {
    if (!editingCell) return;

    setPreviewData(prevData => {
      return prevData.map(preview => {
        if (preview.monthLabel !== editingCell.monthLabel) return preview;

        let newValidCount = 0;
        let newInvalidCount = 0;
        let newTotalBudget = 0;

        const updatedRows = preview.rows.map(row => {
          if (row.rowNumber !== editingCell.rowNumber) {
            if (row.isValid) {
              newValidCount++;
              newTotalBudget += row.jumlah;
            } else {
              newInvalidCount++;
            }
            return row;
          }

          // Update the field value
          const updatedRow = { ...row };
          if (editingCell.field === 'kode_kegiatan') {
            updatedRow.kode_kegiatan = editValue.trim();
          } else {
            updatedRow.kode_rekening = editValue.trim();
          }

          // Revalidate the row
          const kegiatanValidation = validateKodeKegiatan(updatedRow.kode_kegiatan);
          const rekeningValidation = validateKodeRekening(updatedRow.kode_rekening);
          
          const errors: string[] = [];
          if (!kegiatanValidation.valid && kegiatanValidation.error) {
            errors.push(kegiatanValidation.error);
          }
          if (!rekeningValidation.valid && rekeningValidation.error) {
            errors.push(rekeningValidation.error);
          }

          updatedRow.errors = errors;
          updatedRow.isValid = errors.length === 0;

          if (updatedRow.isValid) {
            newValidCount++;
            newTotalBudget += updatedRow.jumlah;
          } else {
            newInvalidCount++;
          }

          return updatedRow;
        });

        return {
          ...preview,
          rows: updatedRows,
          validCount: newValidCount,
          invalidCount: newInvalidCount,
          totalBudget: newTotalBudget,
        };
      });
    });

    setEditingCell(null);
    setEditValue("");

    toast({
      title: "Data diperbarui",
      description: "Data berhasil diperbaiki, silakan periksa validasi",
    });
  }, [editingCell, editValue]);

  // Handle key press in edit input
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  // Delete a single invalid row
  const handleDeleteRow = (monthLabel: string, rowNumber: number) => {
    setPreviewData(prevData => {
      return prevData.map(preview => {
        if (preview.monthLabel !== monthLabel) return preview;

        const rowToDelete = preview.rows.find(r => r.rowNumber === rowNumber);
        const filteredRows = preview.rows.filter(r => r.rowNumber !== rowNumber);
        
        return {
          ...preview,
          rows: filteredRows,
          validCount: rowToDelete?.isValid ? preview.validCount - 1 : preview.validCount,
          invalidCount: rowToDelete?.isValid ? preview.invalidCount : preview.invalidCount - 1,
          totalBudget: rowToDelete?.isValid ? preview.totalBudget - rowToDelete.jumlah : preview.totalBudget,
        };
      }).filter(preview => preview.rows.length > 0); // Remove empty months
    });

    toast({
      title: "Baris dihapus",
      description: `Baris ${rowNumber} berhasil dihapus dari preview`,
    });
  };

  // Delete all invalid rows from current month
  const handleDeleteAllInvalidInMonth = (monthLabel: string) => {
    setPreviewData(prevData => {
      return prevData.map(preview => {
        if (preview.monthLabel !== monthLabel) return preview;

        const validRows = preview.rows.filter(r => r.isValid);
        const totalBudget = validRows.reduce((sum, r) => sum + r.jumlah, 0);
        
        return {
          ...preview,
          rows: validRows,
          validCount: validRows.length,
          invalidCount: 0,
          totalBudget,
        };
      }).filter(preview => preview.rows.length > 0);
    });

    toast({
      title: "Data tidak valid dihapus",
      description: `Semua baris tidak valid pada bulan ${monthLabel} berhasil dihapus`,
    });
  };

  // Delete all invalid rows from all months
  const handleDeleteAllInvalid = () => {
    setPreviewData(prevData => {
      return prevData.map(preview => {
        const validRows = preview.rows.filter(r => r.isValid);
        const totalBudget = validRows.reduce((sum, r) => sum + r.jumlah, 0);
        
        return {
          ...preview,
          rows: validRows,
          validCount: validRows.length,
          invalidCount: 0,
          totalBudget,
        };
      }).filter(preview => preview.rows.length > 0);
    });

    toast({
      title: "Semua data tidak valid dihapus",
      description: "Semua baris tidak valid dari semua bulan berhasil dihapus",
    });
  };

  const currentPreview = previewData.find(p => p.monthLabel === selectedPreviewMonth);
  const totalValidRows = previewData.reduce((sum, p) => sum + p.validCount, 0);
  const totalInvalidRows = previewData.reduce((sum, p) => sum + p.invalidCount, 0);
  const totalPreviewBudget = previewData.reduce((sum, p) => sum + p.totalBudget, 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import RKAS dari Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {!showPreview ? (
            <>
              {/* Instructions */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h4 className="font-medium">Petunjuk Import:</h4>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                  <li>Download template Excel terlebih dahulu</li>
                  <li>Template berisi 12 sheet (satu untuk setiap bulan)</li>
                  <li>Isi data RKAS pada sheet bulan yang sesuai</li>
                  <li>Nama file dapat menyertakan tahun (contoh: RKAS_2025.xlsx)</li>
                  <li>Kolom yang tersedia: kode_kegiatan, kode_rekening, kategori, nama_kegiatan, deskripsi, volume, satuan, harga_satuan, jumlah</li>
                </ol>
                
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                  <h5 className="font-medium text-amber-800 dark:text-amber-200 text-sm mb-1">Format Kode yang Valid:</h5>
                  <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                    <li><strong>Kode Rekening:</strong> Format 5.1.XX.XX.XX.XXXX (contoh: 5.1.02.01.01.0001)</li>
                    <li><strong>Kode Kegiatan:</strong> Format XX.XX atau XX.XX.XX (contoh: 12.07 atau 12.07.01)</li>
                  </ul>
                </div>
              </div>

              {/* Download Template */}
              <div className="space-y-2">
                <Label>Template Excel</Label>
                <Button 
                  variant="secondary" 
                  onClick={handleDownloadTemplate}
                  className="w-full gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download Template (12 Bulan)
                </Button>
              </div>

              {/* File Input */}
              <div className="space-y-2">
                <Label htmlFor="excel-file">Pilih File Excel</Label>
                <Input
                  id="excel-file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                />
                {selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    File terpilih: {selectedFile.name}
                  </p>
                )}
              </div>

              {/* Import Results */}
              {importResults.length > 0 && (
                <div className="space-y-2">
                  <Label>Hasil Import</Label>
                  <div className="max-h-60 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Bulan</th>
                          <th className="p-2 text-center">Berhasil</th>
                          <th className="p-2 text-center">Dilewati</th>
                          <th className="p-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResults.map((result, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">
                              {result.month > 0 ? MONTHS[result.month - 1]?.label : "Unknown"}
                            </td>
                            <td className="p-2 text-center text-green-600">{result.inserted}</td>
                            <td className="p-2 text-center text-amber-600">{result.skipped}</td>
                            <td className="p-2">
                              {result.errors.length === 0 && result.validationErrors.length === 0 ? (
                                <span className="text-green-600">Sukses</span>
                              ) : result.validationErrors.length > 0 ? (
                                <span 
                                  className="text-amber-600 cursor-help" 
                                  title={result.validationErrors.slice(0, 5).join("\n") + (result.validationErrors.length > 5 ? `\n...dan ${result.validationErrors.length - 5} lainnya` : "")}
                                >
                                  Validasi: {result.validationErrors.length}
                                </span>
                              ) : (
                                <span className="text-destructive" title={result.errors.join(", ")}>
                                  Error: {result.errors.length}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Validation Errors Detail */}
                  {importResults.some(r => r.validationErrors.length > 0) && (
                    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md max-h-40 overflow-y-auto">
                      <h5 className="font-medium text-amber-800 dark:text-amber-200 text-sm mb-2">Detail Validasi Error:</h5>
                      <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                        {importResults.flatMap(r => 
                          r.validationErrors.slice(0, 10).map((err, i) => (
                            <li key={`${r.month}-${i}`}>• {MONTHS[r.month - 1]?.label}: {err}</li>
                          ))
                        )}
                        {importResults.reduce((sum, r) => sum + r.validationErrors.length, 0) > 10 && (
                          <li className="text-amber-600 font-medium">
                            ...dan {importResults.reduce((sum, r) => sum + r.validationErrors.length, 0) - 10} error lainnya
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Preview & Import Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handlePreview}
                  disabled={!selectedFile || isPreviewing}
                  className="flex-1 gap-2"
                >
                  {isPreviewing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Memuat Preview...
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      Preview Data
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!selectedFile || isImporting}
                  className="flex-1 gap-2"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Mengimport...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Import Langsung
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Preview Section */}
              <div className="space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Total Bulan</p>
                    <p className="text-xl font-bold">{previewData.length}</p>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg text-center">
                    <p className="text-xs text-green-600 dark:text-green-400">Data Valid</p>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400">{totalValidRows}</p>
                  </div>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-center">
                    <p className="text-xs text-amber-600 dark:text-amber-400">Data Tidak Valid</p>
                    <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{totalInvalidRows}</p>
                    {totalInvalidRows > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs mt-1 text-destructive hover:text-destructive"
                        onClick={handleDeleteAllInvalid}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Hapus Semua
                      </Button>
                    )}
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Total Anggaran</p>
                    <p className="text-sm font-bold">{formatCurrency(totalPreviewBudget)}</p>
                  </div>
                </div>

                {/* Month Tabs */}
                <Tabs value={selectedPreviewMonth} onValueChange={setSelectedPreviewMonth}>
                  <TabsList className="flex flex-wrap h-auto gap-1">
                    {previewData.map((preview) => (
                      <TabsTrigger key={preview.monthLabel} value={preview.monthLabel} className="text-xs px-2 py-1">
                        {preview.monthLabel}
                        {preview.invalidCount > 0 && (
                          <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                            {preview.invalidCount}
                          </Badge>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {previewData.map((preview) => (
                    <TabsContent key={preview.monthLabel} value={preview.monthLabel} className="mt-4">
                      <div className="space-y-3">
                        {/* Month Summary */}
                        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-4 text-sm">
                            <span className="flex items-center gap-1">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              Valid: {preview.validCount}
                            </span>
                            <span className="flex items-center gap-1">
                              <XCircle className="h-4 w-4 text-destructive" />
                              Invalid: {preview.invalidCount}
                            </span>
                            {preview.invalidCount > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-destructive hover:text-destructive"
                                onClick={() => handleDeleteAllInvalidInMonth(preview.monthLabel)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Hapus Invalid
                              </Button>
                            )}
                          </div>
                          <span className="text-sm font-medium">
                            Total: {formatCurrency(preview.totalBudget)}
                          </span>
                        </div>

                        {/* Data Table */}
                        <div className="max-h-64 overflow-y-auto border rounded-lg">
                          <table className="w-full text-xs">
                            <thead className="bg-muted sticky top-0">
                              <tr>
                                <th className="p-2 text-left w-10">Baris</th>
                                <th className="p-2 text-left w-12">Status</th>
                                <th className="p-2 text-left">Kode Kegiatan</th>
                                <th className="p-2 text-left">Kode Rekening</th>
                                <th className="p-2 text-left">Nama Kegiatan</th>
                                <th className="p-2 text-right">Jumlah</th>
                                <th className="p-2 text-center w-16">Aksi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {preview.rows.map((row) => {
                                const isEditingKegiatan = editingCell?.monthLabel === preview.monthLabel && 
                                  editingCell?.rowNumber === row.rowNumber && 
                                  editingCell?.field === 'kode_kegiatan';
                                const isEditingRekening = editingCell?.monthLabel === preview.monthLabel && 
                                  editingCell?.rowNumber === row.rowNumber && 
                                  editingCell?.field === 'kode_rekening';
                                const hasKegiatanError = !row.isValid && row.errors.some(e => e.includes('kegiatan'));
                                const hasRekeningError = !row.isValid && row.errors.some(e => e.includes('rekening'));

                                return (
                                  <tr 
                                    key={row.rowNumber} 
                                    className={`border-t ${!row.isValid ? 'bg-destructive/10' : ''}`}
                                  >
                                    <td className="p-2">{row.rowNumber}</td>
                                    <td className="p-2">
                                      {row.isValid ? (
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                      ) : (
                                        <div className="flex items-center gap-1" title={row.errors.join("\n")}>
                                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-2">
                                      {isEditingKegiatan ? (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onKeyDown={handleEditKeyDown}
                                            className="h-6 text-xs px-1 w-24"
                                            autoFocus
                                            placeholder="XX.XX.XX"
                                          />
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-5 w-5"
                                            onClick={handleSaveEdit}
                                          >
                                            <Check className="h-3 w-3 text-green-600" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-5 w-5"
                                            onClick={handleCancelEdit}
                                          >
                                            <X className="h-3 w-3 text-destructive" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1 group">
                                          <span className={hasKegiatanError ? 'text-destructive font-medium' : ''}>
                                            {row.kode_kegiatan || '-'}
                                          </span>
                                          {hasKegiatanError && (
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-5 w-5 opacity-0 group-hover:opacity-100"
                                              onClick={() => handleStartEdit(preview.monthLabel, row.rowNumber, 'kode_kegiatan', row.kode_kegiatan)}
                                            >
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-2">
                                      {isEditingRekening ? (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            onKeyDown={handleEditKeyDown}
                                            className="h-6 text-xs px-1 w-36"
                                            autoFocus
                                            placeholder="5.1.XX.XX.XX.XXXX"
                                          />
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-5 w-5"
                                            onClick={handleSaveEdit}
                                          >
                                            <Check className="h-3 w-3 text-green-600" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-5 w-5"
                                            onClick={handleCancelEdit}
                                          >
                                            <X className="h-3 w-3 text-destructive" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1 group">
                                          <span className={hasRekeningError ? 'text-destructive font-medium' : ''}>
                                            {row.kode_rekening || '-'}
                                          </span>
                                          {hasRekeningError && (
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-5 w-5 opacity-0 group-hover:opacity-100"
                                              onClick={() => handleStartEdit(preview.monthLabel, row.rowNumber, 'kode_rekening', row.kode_rekening)}
                                            >
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-2 max-w-[150px] truncate" title={row.nama_kegiatan}>
                                      {row.nama_kegiatan}
                                    </td>
                                    <td className="p-2 text-right">{formatCurrency(row.jumlah)}</td>
                                    <td className="p-2 text-center">
                                      {!row.isValid ? (
                                        <div className="flex items-center justify-center gap-1">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 text-xs px-2"
                                            onClick={() => {
                                              const firstErrorField = hasKegiatanError ? 'kode_kegiatan' : 'kode_rekening';
                                              const currentValue = hasKegiatanError ? row.kode_kegiatan : row.kode_rekening;
                                              handleStartEdit(preview.monthLabel, row.rowNumber, firstErrorField, currentValue);
                                            }}
                                          >
                                            <Pencil className="h-3 w-3 mr-1" />
                                            Perbaiki
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 text-destructive hover:text-destructive"
                                            onClick={() => handleDeleteRow(preview.monthLabel, row.rowNumber)}
                                            title="Hapus baris ini"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                                          onClick={() => handleDeleteRow(preview.monthLabel, row.rowNumber)}
                                          title="Hapus baris ini"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Error Details */}
                        {preview.invalidCount > 0 && (
                          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                            <h5 className="font-medium text-destructive text-sm mb-2 flex items-center gap-1">
                              <AlertTriangle className="h-4 w-4" />
                              Data Tidak Valid ({preview.invalidCount})
                            </h5>
                            <ul className="text-xs text-destructive/80 space-y-1 max-h-24 overflow-y-auto">
                              {preview.rows.filter(r => !r.isValid).slice(0, 10).map((row) => (
                                <li key={row.rowNumber}>
                                  • Baris {row.rowNumber}: {row.errors.join("; ")}
                                </li>
                              ))}
                              {preview.rows.filter(r => !r.isValid).length > 10 && (
                                <li className="font-medium">
                                  ...dan {preview.rows.filter(r => !r.isValid).length - 10} error lainnya
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPreview(false);
                      setPreviewData([]);
                    }}
                    className="flex-1"
                  >
                    Kembali
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={isImporting || totalValidRows === 0}
                    className="flex-1 gap-2"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Mengimport...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Import {totalValidRows} Data Valid
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};