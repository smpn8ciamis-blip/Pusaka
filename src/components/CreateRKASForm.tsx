import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, FileSpreadsheet, Download, Eye, Loader2, Pencil, FileText, Printer, AlertCircle, CheckCircle2, XCircle, Copy } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import { cn } from "@/lib/utils";

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

interface RKASItemInput {
  id: string;
  kode_kegiatan: string;
  kode_rekening: string;
  category: string;
  activity_name: string;
  description: string;
  volume: number;
  unit: string;
  unit_price: number;
  total_amount: number;
}

interface ValidationError {
  field: string;
  message: string;
}

interface ItemValidation {
  isValid: boolean;
  errors: ValidationError[];
}

const createEmptyItem = (): RKASItemInput => ({
  id: crypto.randomUUID(),
  kode_kegiatan: "",
  kode_rekening: "",
  category: "",
  activity_name: "",
  description: "",
  volume: 1,
  unit: "",
  unit_price: 0,
  total_amount: 0,
});

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value || 0);
};

export const CreateRKASForm = () => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [items, setItems] = useState<RKASItemInput[]>([createEmptyItem()]);
  const [isSaving, setIsSaving] = useState(false);
  const [editingRkasId, setEditingRkasId] = useState<string | null>(null);

  // Fetch kode kegiatan labels
  const { data: kodeKegiatanLabels } = useQuery({
    queryKey: ["kode-kegiatan-labels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kode_kegiatan_labels")
        .select("*")
        .order("kode");
      if (error) throw error;
      return data;
    },
  });

  // Fetch kode rekening labels
  const { data: kodeRekeningLabels } = useQuery({
    queryKey: ["kode-rekening-labels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kode_rekening_labels")
        .select("*")
        .order("kode");
      if (error) throw error;
      return data;
    },
  });

  // Fetch school settings for letterhead
  const { data: schoolSettings } = useQuery({
    queryKey: ["school-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Check if RKAS exists for selected month/year
  const { data: existingRkas, refetch: refetchExisting } = useQuery({
    queryKey: ["existing-rkas", selectedMonth, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rkas_documents")
        .select("*, rkas_items(*)")
        .eq("month", selectedMonth)
        .eq("year", selectedYear)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  // Source month/year for duplication
  const [sourceMonth, setSourceMonth] = useState<number>(() => {
    if (selectedMonth === 1) return 12;
    return selectedMonth - 1;
  });
  const [sourceYear, setSourceYear] = useState<number>(() => {
    if (selectedMonth === 1) return selectedYear - 1;
    return selectedYear;
  });
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Get available RKAS documents for duplication source selection
  const { data: availableRkas, isLoading: isLoadingAvailable } = useQuery({
    queryKey: ["available-rkas-for-duplication"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rkas_documents")
        .select("id, month, year, total_budget")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  const { data: sourceRkas, isLoading: isLoadingSource, refetch: refetchSource } = useQuery({
    queryKey: ["source-rkas", sourceMonth, sourceYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rkas_documents")
        .select("*, rkas_items(*)")
        .eq("month", sourceMonth)
        .eq("year", sourceYear)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isOpen && showDuplicateDialog,
  });

  // Reset selection when source changes
  useEffect(() => {
    if (sourceRkas?.rkas_items) {
      setSelectedItemIds(new Set(sourceRkas.rkas_items.map((item: any) => item.id)));
    }
  }, [sourceRkas]);

  // Toggle item selection
  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Select/deselect all items
  const toggleSelectAll = () => {
    if (!sourceRkas?.rkas_items) return;
    if (selectedItemIds.size === sourceRkas.rkas_items.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(sourceRkas.rkas_items.map((item: any) => item.id)));
    }
  };

  // Duplicate from selected source month
  const handleDuplicateFromSource = () => {
    if (!sourceRkas?.rkas_items || selectedItemIds.size === 0) {
      toast({
        title: "Tidak ada item dipilih",
        description: "Pilih minimal satu item untuk diduplikasi",
        variant: "destructive",
      });
      return;
    }

    const selectedItems = sourceRkas.rkas_items.filter((item: any) => selectedItemIds.has(item.id));
    const duplicatedItems: RKASItemInput[] = selectedItems.map((item: any) => ({
      id: crypto.randomUUID(),
      kode_kegiatan: item.kode_kegiatan || "",
      kode_rekening: item.kode_rekening || "",
      category: item.category || "",
      activity_name: item.activity_name || "",
      description: item.description || "",
      volume: item.volume || 1,
      unit: item.unit || "",
      unit_price: item.unit_price || 0,
      total_amount: item.total_amount || 0,
    }));

    setItems(duplicatedItems);
    setShowDuplicateDialog(false);
    toast({
      title: "Berhasil menduplikasi",
      description: `${duplicatedItems.length} item dari ${MONTHS[sourceMonth - 1].label} ${sourceYear} berhasil diduplikasi`,
    });
  };

  // Load existing data when editing
  useEffect(() => {
    if (existingRkas && existingRkas.rkas_items) {
      setEditingRkasId(existingRkas.id);
      if (existingRkas.rkas_items.length > 0) {
        setItems(
          existingRkas.rkas_items.map((item: any) => ({
            id: item.id || crypto.randomUUID(),
            kode_kegiatan: item.kode_kegiatan || "",
            kode_rekening: item.kode_rekening || "",
            category: item.category || "",
            activity_name: item.activity_name || "",
            description: item.description || "",
            volume: item.volume || 1,
            unit: item.unit || "",
            unit_price: item.unit_price || 0,
            total_amount: item.total_amount || 0,
          }))
        );
      } else {
        setItems([createEmptyItem()]);
      }
    } else {
      setEditingRkasId(null);
      setItems([createEmptyItem()]);
    }
  }, [existingRkas]);

  const addItem = () => {
    setItems([...items, createEmptyItem()]);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) {
      toast({
        title: "Tidak dapat menghapus",
        description: "Minimal harus ada 1 item",
        variant: "destructive",
      });
      return;
    }
    setItems(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: keyof RKASItemInput, value: any) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          // Auto-calculate total when volume or unit_price changes
          if (field === "volume" || field === "unit_price") {
            updated.total_amount = updated.volume * updated.unit_price;
          }
          // Auto-fill category when kode_kegiatan changes
          if (field === "kode_kegiatan" && value) {
            const kegiatanLabel = kodeKegiatanLabels?.find((k) => k.kode === value);
            if (kegiatanLabel) {
              updated.category = kegiatanLabel.program || kegiatanLabel.keterangan || "";
            }
          }
          return updated;
        }
        return item;
      })
    );
  };

  const calculateTotalBudget = () => {
    return items.reduce((sum, item) => sum + (item.total_amount || 0), 0);
  };

  // Real-time validation for each item
  const validateItem = (item: RKASItemInput): ItemValidation => {
    const errors: ValidationError[] = [];

    // Validate kode_kegiatan - must be selected from list
    if (!item.kode_kegiatan) {
      errors.push({ field: "kode_kegiatan", message: "Kode kegiatan harus dipilih" });
    }

    // Validate kode_rekening - must be selected from list
    if (!item.kode_rekening) {
      errors.push({ field: "kode_rekening", message: "Kode rekening harus dipilih" });
    }

    // Validate activity_name - required
    if (!item.activity_name.trim()) {
      errors.push({ field: "activity_name", message: "Nama kegiatan harus diisi" });
    } else if (item.activity_name.trim().length < 3) {
      errors.push({ field: "activity_name", message: "Nama kegiatan minimal 3 karakter" });
    }

    // Validate volume - must be > 0
    if (item.volume <= 0) {
      errors.push({ field: "volume", message: "Volume harus lebih dari 0" });
    }

    // Validate unit - required
    if (!item.unit.trim()) {
      errors.push({ field: "unit", message: "Satuan harus diisi" });
    }

    // Validate unit_price - must be > 0
    if (item.unit_price <= 0) {
      errors.push({ field: "unit_price", message: "Harga satuan harus lebih dari 0" });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  };

  // Memoized validation results for all items
  const validationResults = useMemo(() => {
    const results: Record<string, ItemValidation> = {};
    items.forEach((item) => {
      results[item.id] = validateItem(item);
    });
    return results;
  }, [items, kodeKegiatanLabels, kodeRekeningLabels]);

  // Check if all items are valid
  const allItemsValid = useMemo(() => {
    return items.every((item) => validationResults[item.id]?.isValid);
  }, [items, validationResults]);

  // Count valid and invalid items
  const validationSummary = useMemo(() => {
    const valid = items.filter((item) => validationResults[item.id]?.isValid).length;
    const invalid = items.length - valid;
    return { valid, invalid, total: items.length };
  }, [items, validationResults]);

  // Get field-specific error
  const getFieldError = (itemId: string, field: string): string | null => {
    const validation = validationResults[itemId];
    if (!validation) return null;
    const error = validation.errors.find((e) => e.field === field);
    return error?.message || null;
  };

  // Check if field has error
  const hasFieldError = (itemId: string, field: string): boolean => {
    return !!getFieldError(itemId, field);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User tidak terautentikasi");

      setIsSaving(true);
      const totalBudget = calculateTotalBudget();

      let rkasDocId: string;

      if (editingRkasId) {
        // Update existing
        const { error: updateError } = await supabase
          .from("rkas_documents")
          .update({
            total_budget: totalBudget,
            status: "parsed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingRkasId);

        if (updateError) throw updateError;
        rkasDocId = editingRkasId;

        // Delete existing items
        await supabase.from("rkas_items").delete().eq("rkas_id", editingRkasId);
      } else {
        // Create new
        const { data: newDoc, error: insertError } = await supabase
          .from("rkas_documents")
          .insert({
            month: selectedMonth,
            year: selectedYear,
            file_url: "",
            file_name: `Input Manual - ${MONTHS[selectedMonth - 1].label} ${selectedYear}`,
            total_budget: totalBudget,
            status: "parsed",
            parsed_data: { items: [], summary: [], total_budget: totalBudget },
            created_by: user.id,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        rkasDocId = newDoc.id;
      }

      // Insert items
      const itemsToInsert = items
        .filter((item) => item.activity_name.trim())
        .map((item) => ({
          rkas_id: rkasDocId,
          kode_kegiatan: item.kode_kegiatan || null,
          kode_rekening: item.kode_rekening || null,
          category: item.category || "Lainnya",
          activity_name: item.activity_name,
          description: item.description || null,
          volume: item.volume,
          unit: item.unit || "-",
          unit_price: item.unit_price,
          total_amount: item.total_amount,
        }));

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
          .from("rkas_items")
          .insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      return rkasDocId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rkas-documents"] });
      queryClient.invalidateQueries({ queryKey: ["rkas-items"] });
      queryClient.invalidateQueries({ queryKey: ["rkas-items-filtered"] });
      queryClient.invalidateQueries({ queryKey: ["existing-rkas"] });
      toast({
        title: "Berhasil",
        description: editingRkasId ? "RKAS berhasil diperbarui" : "RKAS berhasil disimpan",
      });
      setIsOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Gagal menyimpan",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSaving(false);
    },
  });

  const resetForm = () => {
    setItems([createEmptyItem()]);
    setEditingRkasId(null);
  };

  // Excel Import handler
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (jsonData.length === 0) {
        toast({
          title: "File kosong",
          description: "Tidak ada data dalam file Excel",
          variant: "destructive",
        });
        return;
      }

      const importedItems: RKASItemInput[] = jsonData.map((row) => ({
        id: crypto.randomUUID(),
        kode_kegiatan: String(row.kode_kegiatan || "").trim(),
        kode_rekening: String(row.kode_rekening || "").trim(),
        category: String(row.kategori || row.category || ""),
        activity_name: String(row.nama_kegiatan || row.activity_name || ""),
        description: String(row.deskripsi || row.description || ""),
        volume: parseFloat(String(row.volume || 1)),
        unit: String(row.satuan || row.unit || ""),
        unit_price: parseFloat(String(row.harga_satuan || row.unit_price || 0)),
        total_amount: parseFloat(String(row.jumlah || row.total_amount || 0)),
      }));

      setItems(importedItems);
      toast({
        title: "Import berhasil",
        description: `${importedItems.length} item berhasil diimport`,
      });
    } catch (error) {
      toast({
        title: "Gagal import",
        description: "Format file tidak valid",
        variant: "destructive",
      });
    }

    e.target.value = "";
  };

  // Download template
  const handleDownloadTemplate = () => {
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
    ws["!cols"] = [
      { wch: 15 },
      { wch: 20 },
      { wch: 35 },
      { wch: 40 },
      { wch: 40 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RKAS");
    XLSX.writeFile(wb, `Template_RKAS_Input.xlsx`);
  };

  // Generate PDF
  const generatePDF = async (preview: boolean = false) => {
    const doc = new jsPDF("l", "mm", "a4");
    
    // Add letterhead
    if (schoolSettings) {
      await addLetterheadToPDF(doc, schoolSettings);
    }

    let startY = schoolSettings?.logo_url ? 55 : 15;

    // Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(
      `RENCANA KEGIATAN DAN ANGGARAN SEKOLAH (RKAS)`,
      doc.internal.pageSize.getWidth() / 2,
      startY,
      { align: "center" }
    );
    
    doc.setFontSize(11);
    doc.text(
      `Bulan: ${MONTHS[selectedMonth - 1].label} ${selectedYear}`,
      doc.internal.pageSize.getWidth() / 2,
      startY + 7,
      { align: "center" }
    );

    startY += 15;

    // Table
    const tableData = items
      .filter((item) => item.activity_name.trim())
      .map((item, index) => [
        index + 1,
        item.kode_kegiatan,
        item.kode_rekening,
        item.category,
        item.activity_name,
        item.volume,
        item.unit,
        formatCurrency(item.unit_price),
        formatCurrency(item.total_amount),
      ]);

    // Add total row
    tableData.push([
      { content: "TOTAL", colSpan: 8, styles: { halign: "right", fontStyle: "bold" } },
      { content: formatCurrency(calculateTotalBudget()), styles: { fontStyle: "bold" } },
    ] as any);

    autoTable(doc, {
      startY,
      head: [
        [
          "No",
          "Kode Kegiatan",
          "Kode Rekening",
          "Kategori",
          "Nama Kegiatan",
          "Vol",
          "Satuan",
          "Harga Satuan",
          "Jumlah",
        ],
      ],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 25 },
        2: { cellWidth: 30 },
        3: { cellWidth: 35 },
        4: { cellWidth: 50 },
        5: { cellWidth: 15, halign: "center" },
        6: { cellWidth: 20 },
        7: { cellWidth: 30, halign: "right" },
        8: { cellWidth: 35, halign: "right" },
      },
    });

    // Signature
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    const signatureDate = new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Kepala Sekolah signature on the right
    doc.text(`Ciamis, ${signatureDate}`, pageWidth - 70, finalY);
    doc.text(`${(schoolSettings as any)?.headmaster_position || "Kepala Sekolah"},`, pageWidth - 70, finalY + 7);
    doc.text(schoolSettings?.headmaster_name || "........................", pageWidth - 70, finalY + 35);
    doc.text(`NIP. ${schoolSettings?.headmaster_nip || "..........................."}`, pageWidth - 70, finalY + 42);

    if (preview) {
      window.open(doc.output("bloburl"), "_blank");
    } else {
      doc.save(`RKAS_${MONTHS[selectedMonth - 1].label}_${selectedYear}.pdf`);
    }
  };

  const getKodeKegiatanLabel = (kode: string) => {
    const label = kodeKegiatanLabels?.find((l) => l.kode === kode);
    return label ? `${kode} - ${label.keterangan}` : kode;
  };

  const getKodeRekeningLabel = (kode: string) => {
    const label = kodeRekeningLabels?.find((l) => l.kode === kode);
    return label ? `${kode} - ${label.keterangan}` : kode;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) resetForm();
      }}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Buat RKAS
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRkasId ? "Edit RKAS" : "Buat RKAS Baru"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Month/Year Selection */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label>Bulan</Label>
                <Select
                  value={String(selectedMonth)}
                  onValueChange={(v) => setSelectedMonth(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={String(m.value)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tahun</Label>
                <Select
                  value={String(selectedYear)}
                  onValueChange={(v) => setSelectedYear(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex items-end gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Template
                </Button>
                <div>
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelImport}
                    className="hidden"
                    id="excel-import"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById("excel-import")?.click()}
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Import Excel
                  </Button>
                </div>
                <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Copy className="h-4 w-4 mr-2" />
                      Duplikasi RKAS
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Duplikasi RKAS dari Bulan Lain</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Bulan Sumber</Label>
                          <Select
                            value={sourceMonth.toString()}
                            onValueChange={(v) => setSourceMonth(parseInt(v))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MONTHS.map((m) => (
                                <SelectItem key={m.value} value={m.value.toString()}>
                                  {m.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Tahun Sumber</Label>
                          <Select
                            value={sourceYear.toString()}
                            onValueChange={(v) => setSourceYear(parseInt(v))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                                <SelectItem key={y} value={y.toString()}>
                                  {y}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      {availableRkas && availableRkas.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-muted-foreground text-sm">RKAS yang tersedia:</Label>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {availableRkas.map((rkas) => (
                              <button
                                key={rkas.id}
                                type="button"
                                className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors ${
                                  sourceMonth === rkas.month && sourceYear === rkas.year
                                    ? "bg-accent border border-primary"
                                    : "bg-muted/50"
                                }`}
                                onClick={() => {
                                  setSourceMonth(rkas.month);
                                  setSourceYear(rkas.year);
                                }}
                              >
                                <span className="font-medium">{MONTHS[rkas.month - 1].label} {rkas.year}</span>
                                <span className="text-muted-foreground ml-2">
                                  (Rp {(rkas.total_budget || 0).toLocaleString("id-ID")})
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {isLoadingSource && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Memuat data...</span>
                        </div>
                      )}

                      {!isLoadingSource && sourceRkas?.rkas_items && sourceRkas.rkas_items.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">
                              Pilih Item untuk Diduplikasi ({selectedItemIds.size}/{sourceRkas.rkas_items.length})
                            </Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={toggleSelectAll}
                            >
                              {selectedItemIds.size === sourceRkas.rkas_items.length ? "Batalkan Semua" : "Pilih Semua"}
                            </Button>
                          </div>
                          <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                            {sourceRkas.rkas_items.map((item: any) => (
                              <label
                                key={item.id}
                                className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors ${
                                  selectedItemIds.has(item.id) ? "bg-accent/30" : ""
                                }`}
                              >
                                <Checkbox
                                  checked={selectedItemIds.has(item.id)}
                                  onCheckedChange={() => toggleItemSelection(item.id)}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{item.activity_name}</p>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {item.kode_kegiatan && (
                                      <Badge variant="outline" className="text-xs">
                                        {item.kode_kegiatan}
                                      </Badge>
                                    )}
                                    {item.kode_rekening && (
                                      <Badge variant="secondary" className="text-xs">
                                        {item.kode_rekening}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Rp {(item.total_amount || 0).toLocaleString("id-ID")}
                                  </p>
                                </div>
                              </label>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Total dipilih: Rp {sourceRkas.rkas_items
                              .filter((item: any) => selectedItemIds.has(item.id))
                              .reduce((sum: number, item: any) => sum + (item.total_amount || 0), 0)
                              .toLocaleString("id-ID")}
                          </p>
                        </div>
                      )}

                      {!isLoadingSource && !sourceRkas && (
                        <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-md border border-yellow-200 dark:border-yellow-900">
                          <p className="text-sm text-yellow-700 dark:text-yellow-400">
                            <AlertCircle className="h-4 w-4 inline mr-1" />
                            Tidak ada data RKAS untuk {MONTHS[sourceMonth - 1].label} {sourceYear}
                          </p>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowDuplicateDialog(false)}>
                        Batal
                      </Button>
                      <Button
                        onClick={handleDuplicateFromSource}
                        disabled={isLoadingSource || selectedItemIds.size === 0}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Duplikasi {selectedItemIds.size} Item
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {existingRkas && (
              <Badge variant="secondary" className="w-fit">
                <Pencil className="h-3 w-3 mr-1" />
                Mode Edit - Data {MONTHS[selectedMonth - 1].label} {selectedYear} sudah ada
              </Badge>
            )}

            {/* Validation Summary */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm">{validationSummary.valid} item valid</span>
              </div>
              {validationSummary.invalid > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">{validationSummary.invalid} item perlu diperbaiki</span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <TooltipProvider>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">No</TableHead>
                      <TableHead className="w-[50px]">Status</TableHead>
                      <TableHead className="w-[150px]">Kode Kegiatan *</TableHead>
                      <TableHead className="w-[180px]">Kode Rekening *</TableHead>
                      <TableHead className="w-[120px]">Kategori</TableHead>
                      <TableHead className="w-[200px]">Nama Kegiatan *</TableHead>
                      <TableHead className="w-[70px]">Volume *</TableHead>
                      <TableHead className="w-[100px]">Satuan *</TableHead>
                      <TableHead className="w-[130px]">Harga Satuan *</TableHead>
                      <TableHead className="w-[130px]">Jumlah</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => {
                      const validation = validationResults[item.id];
                      const isItemValid = validation?.isValid;
                      
                      return (
                        <TableRow key={item.id} className={cn(!isItemValid && "bg-destructive/5")}>
                          <TableCell className="text-center">{index + 1}</TableCell>
                          <TableCell>
                            {isItemValid ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <Tooltip>
                                <TooltipTrigger>
                                  <AlertCircle className="h-4 w-4 text-destructive" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <ul className="text-xs list-disc pl-3">
                                    {validation?.errors.map((err, i) => (
                                      <li key={i}>{err.message}</li>
                                    ))}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Select
                                value={item.kode_kegiatan || ""}
                                onValueChange={(v) => updateItem(item.id, "kode_kegiatan", v)}
                              >
                                <SelectTrigger className={cn(
                                  "text-xs",
                                  hasFieldError(item.id, "kode_kegiatan") && "border-destructive ring-destructive",
                                  item.kode_kegiatan && "border-green-500"
                                )}>
                                  <SelectValue placeholder="Pilih kegiatan...">
                                    {item.kode_kegiatan && kodeKegiatanLabels?.find((k) => k.kode === item.kode_kegiatan)?.keterangan}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="max-w-md">
                                  {kodeKegiatanLabels?.map((k) => (
                                    <SelectItem key={k.id} value={k.kode} className="text-xs">
                                      <span className="line-clamp-2">{k.keterangan}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {hasFieldError(item.id, "kode_kegiatan") && (
                                <p className="text-[10px] text-destructive">{getFieldError(item.id, "kode_kegiatan")}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Select
                                value={item.kode_rekening || ""}
                                onValueChange={(v) => updateItem(item.id, "kode_rekening", v)}
                              >
                                <SelectTrigger className={cn(
                                  "text-xs",
                                  hasFieldError(item.id, "kode_rekening") && "border-destructive ring-destructive",
                                  item.kode_rekening && "border-green-500"
                                )}>
                                  <SelectValue placeholder="Pilih rekening...">
                                    {item.kode_rekening && kodeRekeningLabels?.find((k) => k.kode === item.kode_rekening)?.keterangan}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="max-w-lg">
                                  {kodeRekeningLabels?.map((k) => (
                                    <SelectItem key={k.id} value={k.kode} className="text-xs">
                                      <div className="flex flex-col gap-0.5">
                                        <span className="font-medium text-muted-foreground">{k.kode}</span>
                                        <span className="line-clamp-2">{k.keterangan}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {hasFieldError(item.id, "kode_rekening") && (
                                <p className="text-[10px] text-destructive">{getFieldError(item.id, "kode_rekening")}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.category}
                              onChange={(e) => updateItem(item.id, "category", e.target.value)}
                              placeholder="Kategori"
                              className="text-xs bg-muted/50"
                              readOnly
                            />
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Input
                                value={item.activity_name}
                                onChange={(e) => updateItem(item.id, "activity_name", e.target.value)}
                                placeholder="Nama kegiatan"
                                className={cn(
                                  "text-xs",
                                  hasFieldError(item.id, "activity_name") && "border-destructive",
                                  item.activity_name.trim().length >= 3 && "border-green-500"
                                )}
                              />
                              {hasFieldError(item.id, "activity_name") && (
                                <p className="text-[10px] text-destructive">{getFieldError(item.id, "activity_name")}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Input
                                type="number"
                                value={item.volume}
                                onChange={(e) => updateItem(item.id, "volume", parseFloat(e.target.value) || 0)}
                                className={cn(
                                  "text-xs",
                                  hasFieldError(item.id, "volume") && "border-destructive",
                                  item.volume > 0 && "border-green-500"
                                )}
                              />
                              {hasFieldError(item.id, "volume") && (
                                <p className="text-[10px] text-destructive">{getFieldError(item.id, "volume")}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Input
                                value={item.unit}
                                onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                                placeholder="Satuan"
                                className={cn(
                                  "text-xs",
                                  hasFieldError(item.id, "unit") && "border-destructive",
                                  item.unit.trim() && "border-green-500"
                                )}
                              />
                              {hasFieldError(item.id, "unit") && (
                                <p className="text-[10px] text-destructive">{getFieldError(item.id, "unit")}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => updateItem(item.id, "unit_price", parseFloat(e.target.value) || 0)}
                                className={cn(
                                  "text-xs",
                                  hasFieldError(item.id, "unit_price") && "border-destructive",
                                  item.unit_price > 0 && "border-green-500"
                                )}
                              />
                              {hasFieldError(item.id, "unit_price") && (
                                <p className="text-[10px] text-destructive">{getFieldError(item.id, "unit_price")}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-xs">
                            {formatCurrency(item.total_amount)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(item.id)}
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>

            {/* Add Item & Total */}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Item
              </Button>
              <div className="text-right">
                <span className="text-muted-foreground mr-2">Total Anggaran:</span>
                <span className="text-xl font-bold">{formatCurrency(calculateTotalBudget())}</span>
              </div>
            </div>

            {/* Actions */}
            <TooltipProvider>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => generatePDF(true)}
                  disabled={items.every((i) => !i.activity_name.trim())}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => generatePDF(false)}
                  disabled={items.every((i) => !i.activity_name.trim())}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Cetak PDF
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        onClick={() => saveMutation.mutate()}
                        disabled={isSaving || !allItemsValid}
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Simpan
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!allItemsValid && (
                    <TooltipContent>
                      <p>Perbaiki {validationSummary.invalid} item yang tidak valid terlebih dahulu</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </DialogFooter>
            </TooltipProvider>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
