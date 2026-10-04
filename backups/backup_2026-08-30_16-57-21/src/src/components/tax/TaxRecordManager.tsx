import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Edit, Trash2, Loader2, Calendar as CalendarIcon, Filter } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TaxRecord {
  id: string;
  tax_type_id: string;
  transaction_type: "pemungutan" | "penyetoran";
  gross_amount: number;
  tax_amount: number;
  description: string | null;
  record_date: string;
  receipt_number: string | null;
  npwp: string | null;
  taxpayer_name: string | null;
  tax_types: {
    name: string;
    code: string;
    rate: number;
  };
}

interface TaxType {
  id: string;
  name: string;
  code: string;
  rate: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function TaxRecordManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TaxRecord | null>(null);
  
  // Filter states
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterTaxType, setFilterTaxType] = useState<string>("all");
  const [filterTransactionType, setFilterTransactionType] = useState<string>("all");

  const [formData, setFormData] = useState({
    tax_type_id: "",
    transaction_type: "pemungutan" as "pemungutan" | "penyetoran",
    gross_amount: "",
    tax_amount: "",
    description: "",
    record_date: new Date(),
    receipt_number: "",
    npwp: "",
    taxpayer_name: "",
  });

  const { data: taxTypes } = useQuery({
    queryKey: ["tax-types-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_types")
        .select("id, name, code, rate")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data as TaxType[];
    },
  });

  const { data: taxRecords, isLoading } = useQuery({
    queryKey: ["tax-records", filterMonth, filterYear, filterTaxType, filterTransactionType],
    queryFn: async () => {
      let query = supabase
        .from("tax_records")
        .select(`
          *,
          tax_types (name, code, rate)
        `)
        .order("record_date", { ascending: false });

      // Apply date filter
      const startDate = `${filterYear}-${String(filterMonth).padStart(2, "0")}-01`;
      const endDate = new Date(filterYear, filterMonth, 0).toISOString().split("T")[0];
      query = query.gte("record_date", startDate).lte("record_date", endDate);

      if (filterTaxType !== "all") {
        query = query.eq("tax_type_id", filterTaxType);
      }
      if (filterTransactionType !== "all") {
        query = query.eq("transaction_type", filterTransactionType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as TaxRecord[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("tax_records").insert({
        tax_type_id: data.tax_type_id,
        transaction_type: data.transaction_type,
        gross_amount: parseFloat(data.gross_amount) || 0,
        tax_amount: parseFloat(data.tax_amount) || 0,
        description: data.description || null,
        record_date: format(data.record_date, "yyyy-MM-dd"),
        receipt_number: data.receipt_number || null,
        npwp: data.npwp || null,
        taxpayer_name: data.taxpayer_name || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax-records"] });
      queryClient.invalidateQueries({ queryKey: ["tax-statistics"] });
      toast.success("Catatan pajak berhasil ditambahkan");
      handleClose();
    },
    onError: (error: Error) => {
      toast.error("Gagal menambahkan catatan: " + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("tax_records")
        .update({
          tax_type_id: data.tax_type_id,
          transaction_type: data.transaction_type,
          gross_amount: parseFloat(data.gross_amount) || 0,
          tax_amount: parseFloat(data.tax_amount) || 0,
          description: data.description || null,
          record_date: format(data.record_date, "yyyy-MM-dd"),
          receipt_number: data.receipt_number || null,
          npwp: data.npwp || null,
          taxpayer_name: data.taxpayer_name || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax-records"] });
      queryClient.invalidateQueries({ queryKey: ["tax-statistics"] });
      toast.success("Catatan pajak berhasil diperbarui");
      handleClose();
    },
    onError: (error: Error) => {
      toast.error("Gagal memperbarui catatan: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tax_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax-records"] });
      queryClient.invalidateQueries({ queryKey: ["tax-statistics"] });
      toast.success("Catatan pajak berhasil dihapus");
    },
    onError: (error: Error) => {
      toast.error("Gagal menghapus catatan: " + error.message);
    },
  });

  const handleClose = () => {
    setIsOpen(false);
    setEditingRecord(null);
    setFormData({
      tax_type_id: "",
      transaction_type: "pemungutan",
      gross_amount: "",
      tax_amount: "",
      description: "",
      record_date: new Date(),
      receipt_number: "",
      npwp: "",
      taxpayer_name: "",
    });
  };

  const handleEdit = (record: TaxRecord) => {
    setEditingRecord(record);
    setFormData({
      tax_type_id: record.tax_type_id,
      transaction_type: record.transaction_type,
      gross_amount: record.gross_amount.toString(),
      tax_amount: record.tax_amount.toString(),
      description: record.description || "",
      record_date: new Date(record.record_date),
      receipt_number: record.receipt_number || "",
      npwp: record.npwp || "",
      taxpayer_name: record.taxpayer_name || "",
    });
    setIsOpen(true);
  };

  const handleTaxTypeChange = (taxTypeId: string) => {
    const taxType = taxTypes?.find((t) => t.id === taxTypeId);
    setFormData((prev) => {
      const grossAmount = parseFloat(prev.gross_amount) || 0;
      const taxAmount = taxType ? (grossAmount * taxType.rate) / 100 : 0;
      return {
        ...prev,
        tax_type_id: taxTypeId,
        tax_amount: taxAmount.toFixed(0),
      };
    });
  };

  const handleGrossAmountChange = (value: string) => {
    const taxType = taxTypes?.find((t) => t.id === formData.tax_type_id);
    const grossAmount = parseFloat(value) || 0;
    const taxAmount = taxType ? (grossAmount * taxType.rate) / 100 : 0;
    setFormData({
      ...formData,
      gross_amount: value,
      tax_amount: taxAmount.toFixed(0),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tax_type_id) {
      toast.error("Pilih jenis pajak");
      return;
    }

    if (editingRecord) {
      updateMutation.mutate({ id: editingRecord.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

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
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <CardTitle>Catatan Pajak</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filters */}
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
          <Select value={filterTaxType} onValueChange={setFilterTaxType}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Semua Pajak" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Pajak</SelectItem>
              {taxTypes?.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterTransactionType} onValueChange={setFilterTransactionType}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Semua Tipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tipe</SelectItem>
              <SelectItem value="pemungutan">Pemungutan</SelectItem>
              <SelectItem value="penyetoran">Penyetoran</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Tambah
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingRecord ? "Edit Catatan Pajak" : "Tambah Catatan Pajak"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Jenis Pajak *</Label>
                    <Select
                      value={formData.tax_type_id}
                      onValueChange={handleTaxTypeChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih jenis pajak" />
                      </SelectTrigger>
                      <SelectContent>
                        {taxTypes?.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.code} - {t.name} ({t.rate}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipe Transaksi</Label>
                    <Select
                      value={formData.transaction_type}
                      onValueChange={(v) => setFormData({ ...formData, transaction_type: v as "pemungutan" | "penyetoran" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pemungutan">Pemungutan</SelectItem>
                        <SelectItem value="penyetoran">Penyetoran</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nilai Bruto (DPP)</Label>
                    <Input
                      type="number"
                      value={formData.gross_amount}
                      onChange={(e) => handleGrossAmountChange(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nilai Pajak</Label>
                    <Input
                      type="number"
                      value={formData.tax_amount}
                      onChange={(e) => setFormData({ ...formData, tax_amount: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tanggal</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-start text-left font-normal")}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(formData.record_date, "dd MMM yyyy", { locale: idLocale })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={formData.record_date}
                          onSelect={(date) => date && setFormData({ ...formData, record_date: date })}
                          locale={idLocale}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>No. Bukti</Label>
                    <Input
                      value={formData.receipt_number}
                      onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
                      placeholder="Nomor bukti/kwitansi"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>NPWP</Label>
                    <Input
                      value={formData.npwp}
                      onChange={(e) => setFormData({ ...formData, npwp: e.target.value })}
                      placeholder="NPWP wajib pajak"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nama Wajib Pajak</Label>
                    <Input
                      value={formData.taxpayer_name}
                      onChange={(e) => setFormData({ ...formData, taxpayer_name: e.target.value })}
                      placeholder="Nama wajib pajak"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Keterangan</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Keterangan transaksi..."
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleClose}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingRecord ? "Simpan" : "Tambah"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Wajib Pajak</TableHead>
                  <TableHead className="text-right">DPP</TableHead>
                  <TableHead className="text-right">Pajak</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxRecords?.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      {format(new Date(record.record_date), "dd MMM yyyy", { locale: idLocale })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{record.tax_types.code}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={record.transaction_type === "pemungutan" ? "default" : "secondary"}>
                        {record.transaction_type === "pemungutan" ? "Pungut" : "Setor"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {record.taxpayer_name || "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(record.gross_amount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(record.tax_amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(record)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Yakin ingin menghapus catatan ini?")) {
                              deleteMutation.mutate(record.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!taxRecords?.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Belum ada catatan pajak untuk periode ini
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
