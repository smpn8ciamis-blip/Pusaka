import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Pencil, Trash2, Activity, BarChart3, Search, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const KodeLabelSettings = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('kegiatan');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  
  // File input refs
  const kegiatanFileRef = useRef<HTMLInputElement>(null);
  const rekeningFileRef = useRef<HTMLInputElement>(null);
  
  // Dialog states
  const [isKegiatanDialogOpen, setIsKegiatanDialogOpen] = useState(false);
  const [isRekeningDialogOpen, setIsRekeningDialogOpen] = useState(false);
  const [editingKegiatan, setEditingKegiatan] = useState<any>(null);
  const [editingRekening, setEditingRekening] = useState<any>(null);
  
  // Form states
  const [kegiatanKode, setKegiatanKode] = useState('');
  const [kegiatanProgram, setKegiatanProgram] = useState('');
  const [kegiatanSubProgram, setKegiatanSubProgram] = useState('');
  const [rekeningKode, setRekeningKode] = useState('');
  const [rekeningKeterangan, setRekeningKeterangan] = useState('');

  // Fetch kode kegiatan labels
  const { data: kodeKegiatanLabels, isLoading: loadingKegiatan } = useQuery({
    queryKey: ['kode-kegiatan-labels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kode_kegiatan_labels')
        .select('*')
        .order('kode');
      if (error) throw error;
      return data;
    },
  });

  // Fetch kode rekening labels
  const { data: kodeRekeningLabels, isLoading: loadingRekening } = useQuery({
    queryKey: ['kode-rekening-labels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kode_rekening_labels')
        .select('*')
        .order('kode');
      if (error) throw error;
      return data;
    },
  });

  // Filter data based on search
  const filteredKegiatan = kodeKegiatanLabels?.filter(item =>
    item.kode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.program?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (item.sub_program?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const filteredRekening = kodeRekeningLabels?.filter(item =>
    item.kode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.keterangan.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Mutations for kode kegiatan
  const saveKegiatanMutation = useMutation({
    mutationFn: async (data: { id?: string; kode: string; program: string; sub_program: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from('kode_kegiatan_labels')
          .update({ kode: data.kode, program: data.program, sub_program: data.sub_program, keterangan: data.program })
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('kode_kegiatan_labels')
          .insert({ kode: data.kode, program: data.program, sub_program: data.sub_program, keterangan: data.program });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kode-kegiatan-labels'] });
      toast.success(editingKegiatan ? 'Kode kegiatan berhasil diperbarui' : 'Kode kegiatan berhasil ditambahkan');
      resetKegiatanForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menyimpan kode kegiatan');
    },
  });

  const deleteKegiatanMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('kode_kegiatan_labels')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kode-kegiatan-labels'] });
      toast.success('Kode kegiatan berhasil dihapus');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menghapus kode kegiatan');
    },
  });

  // Mutations for kode rekening
  const saveRekeningMutation = useMutation({
    mutationFn: async (data: { id?: string; kode: string; keterangan: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from('kode_rekening_labels')
          .update({ kode: data.kode, keterangan: data.keterangan })
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('kode_rekening_labels')
          .insert({ kode: data.kode, keterangan: data.keterangan });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kode-rekening-labels'] });
      toast.success(editingRekening ? 'Kode rekening berhasil diperbarui' : 'Kode rekening berhasil ditambahkan');
      resetRekeningForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menyimpan kode rekening');
    },
  });

  const deleteRekeningMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('kode_rekening_labels')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kode-rekening-labels'] });
      toast.success('Kode rekening berhasil dihapus');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menghapus kode rekening');
    },
  });

  // Delete all mutations
  const deleteAllKegiatanMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('kode_kegiatan_labels')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kode-kegiatan-labels'] });
      toast.success('Semua kode kegiatan berhasil dihapus');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menghapus semua kode kegiatan');
    },
  });

  const deleteAllRekeningMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('kode_rekening_labels')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kode-rekening-labels'] });
      toast.success('Semua kode rekening berhasil dihapus');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menghapus semua kode rekening');
    },
  });

  const resetKegiatanForm = () => {
    setKegiatanKode('');
    setKegiatanProgram('');
    setKegiatanSubProgram('');
    setEditingKegiatan(null);
    setIsKegiatanDialogOpen(false);
  };

  const resetRekeningForm = () => {
    setRekeningKode('');
    setRekeningKeterangan('');
    setEditingRekening(null);
    setIsRekeningDialogOpen(false);
  };

  const handleEditKegiatan = (item: any) => {
    setEditingKegiatan(item);
    setKegiatanKode(item.kode);
    setKegiatanProgram(item.program || '');
    setKegiatanSubProgram(item.sub_program || '');
    setIsKegiatanDialogOpen(true);
  };

  const handleEditRekening = (item: any) => {
    setEditingRekening(item);
    setRekeningKode(item.kode);
    setRekeningKeterangan(item.keterangan);
    setIsRekeningDialogOpen(true);
  };

  const handleSaveKegiatan = () => {
    if (!kegiatanKode.trim() || !kegiatanProgram.trim()) {
      toast.error('Kode Kegiatan dan Program harus diisi');
      return;
    }
    saveKegiatanMutation.mutate({
      id: editingKegiatan?.id,
      kode: kegiatanKode.trim(),
      program: kegiatanProgram.trim(),
      sub_program: kegiatanSubProgram.trim(),
    });
  };

  const handleSaveRekening = () => {
    if (!rekeningKode.trim() || !rekeningKeterangan.trim()) {
      toast.error('Kode dan keterangan harus diisi');
      return;
    }
    saveRekeningMutation.mutate({
      id: editingRekening?.id,
      kode: rekeningKode.trim(),
      keterangan: rekeningKeterangan.trim(),
    });
  };

  // Helper to normalize column names (case-insensitive, trim, handle variations)
  const normalizeColumnName = (name: string): string => {
    return String(name || '').toLowerCase().trim().replace(/[\s_-]+/g, '_');
  };

  // Helper to find column value by possible names
  const findColumnValue = (row: Record<string, any>, possibleNames: string[]): string => {
    for (const key of Object.keys(row)) {
      const normalizedKey = normalizeColumnName(key);
      for (const name of possibleNames) {
        if (normalizedKey === normalizeColumnName(name) || normalizedKey.includes(normalizeColumnName(name))) {
          const value = row[key];
          if (value !== null && value !== undefined) {
            return String(value).trim();
          }
        }
      }
    }
    return '';
  };

  // Import Excel handlers
  const handleImportKegiatan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { raw: true, cellText: true, cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { raw: false, defval: '' });
      
      if (jsonData.length === 0) {
        toast.error('File Excel kosong atau format tidak sesuai');
        return;
      }

      // Map and validate data with flexible column matching
      const kodeColumns = ['kode_kegiatan', 'kode', 'kode kegiatan', 'code'];
      const programColumns = ['program', 'nama_program', 'nama program'];
      const subProgramColumns = ['sub_program', 'subprogram', 'sub program', 'sub_program'];

      const validData: { kode: string; program: string; sub_program: string }[] = [];
      
      for (const row of jsonData) {
        const kode = findColumnValue(row, kodeColumns);
        const program = findColumnValue(row, programColumns);
        const sub_program = findColumnValue(row, subProgramColumns);
        
        if (kode && program) {
          validData.push({ kode, program, sub_program });
        }
      }

      if (validData.length === 0) {
        toast.error('Tidak ada data valid. Pastikan kolom "kode_kegiatan" dan "program" tersedia.');
        return;
      }

      // Upsert data
      let inserted = 0, updated = 0;
      for (const row of validData) {
        // Check if exists
        const { data: existing } = await supabase
          .from('kode_kegiatan_labels')
          .select('id')
          .eq('kode', row.kode)
          .maybeSingle();
        
        if (existing) {
          await supabase
            .from('kode_kegiatan_labels')
            .update({ program: row.program, sub_program: row.sub_program, keterangan: row.program })
            .eq('id', existing.id);
          updated++;
        } else {
          await supabase
            .from('kode_kegiatan_labels')
            .insert({ kode: row.kode, program: row.program, sub_program: row.sub_program, keterangan: row.program });
          inserted++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['kode-kegiatan-labels'] });
      toast.success(`Import berhasil: ${inserted} ditambahkan, ${updated} diperbarui (${jsonData.length - validData.length} tidak valid)`);
    } catch (error: any) {
      toast.error(error.message || 'Gagal mengimport file');
    } finally {
      setIsImporting(false);
      if (kegiatanFileRef.current) kegiatanFileRef.current.value = '';
    }
  };

  const handleImportRekening = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { raw: true, cellText: true, cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { raw: false, defval: '' });
      
      if (jsonData.length === 0) {
        toast.error('File Excel kosong atau format tidak sesuai');
        return;
      }

      // Map and validate data with flexible column matching
      const kodeColumns = ['kode', 'kode_rekening', 'kode rekening', 'code'];
      const keteranganColumns = ['keterangan', 'nama', 'deskripsi', 'description', 'uraian'];

      const validData: { kode: string; keterangan: string }[] = [];
      
      for (const row of jsonData) {
        const kode = findColumnValue(row, kodeColumns);
        const keterangan = findColumnValue(row, keteranganColumns);
        
        if (kode && keterangan) {
          validData.push({ kode, keterangan });
        }
      }

      if (validData.length === 0) {
        toast.error('Tidak ada data valid. Pastikan kolom "kode" dan "keterangan" tersedia.');
        return;
      }

      // Upsert data
      let inserted = 0, updated = 0;
      for (const row of validData) {
        // Check if exists
        const { data: existing } = await supabase
          .from('kode_rekening_labels')
          .select('id')
          .eq('kode', row.kode)
          .maybeSingle();
        
        if (existing) {
          await supabase
            .from('kode_rekening_labels')
            .update({ keterangan: row.keterangan })
            .eq('id', existing.id);
          updated++;
        } else {
          await supabase
            .from('kode_rekening_labels')
            .insert({ kode: row.kode, keterangan: row.keterangan });
          inserted++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['kode-rekening-labels'] });
      toast.success(`Import berhasil: ${inserted} ditambahkan, ${updated} diperbarui (${jsonData.length - validData.length} tidak valid)`);
    } catch (error: any) {
      toast.error(error.message || 'Gagal mengimport file');
    } finally {
      setIsImporting(false);
      if (rekeningFileRef.current) rekeningFileRef.current.value = '';
    }
  };

  // Download template handlers
  const downloadKegiatanTemplate = () => {
    const templateData = [
      { kode_kegiatan: '07.12.01.', program: 'Contoh: Biaya Operasional Satuan Pendidikan', sub_program: 'Contoh: Sub Program' },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kode Kegiatan');
    XLSX.writeFile(wb, 'template_kode_kegiatan.xlsx');
  };

  const downloadRekeningTemplate = () => {
    const templateData = [
      { kode: '5.1.02.01.01.0001', keterangan: 'Contoh: Belanja Alat Tulis Kantor' },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kode Rekening');
    XLSX.writeFile(wb, 'template_kode_rekening.xlsx');
  };

  return (
    <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Pengaturan Kode Anggaran</h1>
            <p className="text-muted-foreground">Kelola mapping kode kegiatan dan kode rekening ke keterangan</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari kode atau keterangan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="kegiatan" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Kode Kegiatan
              </TabsTrigger>
              <TabsTrigger value="rekening" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Kode Rekening
              </TabsTrigger>
            </TabsList>

            <TabsContent value="kegiatan" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Daftar Kode Kegiatan</CardTitle>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      ref={kegiatanFileRef}
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={handleImportKegiatan}
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="destructive" 
                          disabled={!kodeKegiatanLabels?.length || deleteAllKegiatanMutation.isPending}
                        >
                          {deleteAllKegiatanMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Hapus Semua
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Hapus Semua Kode Kegiatan?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {kodeKegiatanLabels?.length || 0} kode kegiatan akan dihapus. Tindakan ini tidak dapat dibatalkan.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Batal</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteAllKegiatanMutation.mutate()}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Hapus Semua
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button variant="outline" onClick={downloadKegiatanTemplate}>
                      <Download className="mr-2 h-4 w-4" />
                      Template
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => kegiatanFileRef.current?.click()}
                      disabled={isImporting}
                    >
                      {isImporting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Import Excel
                    </Button>
                    <Dialog open={isKegiatanDialogOpen} onOpenChange={(open) => {
                      if (!open) resetKegiatanForm();
                      setIsKegiatanDialogOpen(open);
                    }}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="mr-2 h-4 w-4" />
                          Tambah Kode
                        </Button>
                      </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {editingKegiatan ? 'Edit Kode Kegiatan' : 'Tambah Kode Kegiatan'}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="kode-kegiatan">Kode Kegiatan</Label>
                          <Input
                            id="kode-kegiatan"
                            value={kegiatanKode}
                            onChange={(e) => setKegiatanKode(e.target.value)}
                            placeholder="Contoh: 07.12.01."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="program-kegiatan">Program</Label>
                          <Input
                            id="program-kegiatan"
                            value={kegiatanProgram}
                            onChange={(e) => setKegiatanProgram(e.target.value)}
                            placeholder="Contoh: Biaya Operasional Satuan Pendidikan"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="sub-program-kegiatan">Sub Program</Label>
                          <Input
                            id="sub-program-kegiatan"
                            value={kegiatanSubProgram}
                            onChange={(e) => setKegiatanSubProgram(e.target.value)}
                            placeholder="Contoh: Sub Program (opsional)"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={resetKegiatanForm}>
                            Batal
                          </Button>
                          <Button 
                            onClick={handleSaveKegiatan}
                            disabled={saveKegiatanMutation.isPending}
                          >
                            {saveKegiatanMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Simpan
                          </Button>
                        </div>
                      </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingKegiatan ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[150px]">Kode Kegiatan</TableHead>
                          <TableHead>Program</TableHead>
                          <TableHead>Sub Program</TableHead>
                          <TableHead className="w-[100px] text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredKegiatan?.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              Tidak ada data
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredKegiatan?.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-mono text-sm">{item.kode}</TableCell>
                              <TableCell>{item.program || item.keterangan}</TableCell>
                              <TableCell>{item.sub_program || '-'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditKegiatan(item)}
                                  >
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
                                        <AlertDialogTitle>Hapus Kode Kegiatan?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Kode "{item.kode}" akan dihapus. Tindakan ini tidak dapat dibatalkan.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Batal</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteKegiatanMutation.mutate(item.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Hapus
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
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
            </TabsContent>

            <TabsContent value="rekening" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Daftar Kode Rekening</CardTitle>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      ref={rekeningFileRef}
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={handleImportRekening}
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="destructive" 
                          disabled={!kodeRekeningLabels?.length || deleteAllRekeningMutation.isPending}
                        >
                          {deleteAllRekeningMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Hapus Semua
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Hapus Semua Kode Rekening?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {kodeRekeningLabels?.length || 0} kode rekening akan dihapus. Tindakan ini tidak dapat dibatalkan.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Batal</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteAllRekeningMutation.mutate()}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Hapus Semua
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button variant="outline" onClick={downloadRekeningTemplate}>
                      <Download className="mr-2 h-4 w-4" />
                      Template
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => rekeningFileRef.current?.click()}
                      disabled={isImporting}
                    >
                      {isImporting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Import Excel
                    </Button>
                    <Dialog open={isRekeningDialogOpen} onOpenChange={(open) => {
                      if (!open) resetRekeningForm();
                      setIsRekeningDialogOpen(open);
                    }}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="mr-2 h-4 w-4" />
                          Tambah Kode
                        </Button>
                      </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {editingRekening ? 'Edit Kode Rekening' : 'Tambah Kode Rekening'}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="kode-rekening">Kode Rekening</Label>
                          <Input
                            id="kode-rekening"
                            value={rekeningKode}
                            onChange={(e) => setRekeningKode(e.target.value)}
                            placeholder="Contoh: 5.1.02.01.01.0001"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="keterangan-rekening">Keterangan</Label>
                          <Input
                            id="keterangan-rekening"
                            value={rekeningKeterangan}
                            onChange={(e) => setRekeningKeterangan(e.target.value)}
                            placeholder="Contoh: Belanja Alat Tulis Kantor"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={resetRekeningForm}>
                            Batal
                          </Button>
                          <Button 
                            onClick={handleSaveRekening}
                            disabled={saveRekeningMutation.isPending}
                          >
                            {saveRekeningMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Simpan
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingRekening ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">Kode</TableHead>
                          <TableHead>Keterangan</TableHead>
                          <TableHead className="w-[100px] text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRekening?.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              Tidak ada data
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredRekening?.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-mono text-xs">{item.kode}</TableCell>
                              <TableCell>{item.keterangan}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditRekening(item)}
                                  >
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
                                        <AlertDialogTitle>Hapus Kode Rekening?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Kode "{item.kode}" akan dihapus. Tindakan ini tidak dapat dibatalkan.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Batal</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => deleteRekeningMutation.mutate(item.id)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          Hapus
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
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
            </TabsContent>
          </Tabs>
        </div>
      </DashboardLayout>
  );
};

export default KodeLabelSettings;
