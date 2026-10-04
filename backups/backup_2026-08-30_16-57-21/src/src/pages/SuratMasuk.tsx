import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Plus, Pencil, Trash2, Mail, Search, Upload, FileText, ExternalLink, X, ArrowRight, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SuratRecapPdfPreview } from '@/components/SuratRecapPdfPreview';

interface SuratMasuk {
  id: string;
  nomor_surat: string;
  tanggal_surat: string;
  tanggal_diterima: string;
  pengirim: string;
  perihal: string;
  kategori: string;
  file_url: string | null;
  catatan: string | null;
  created_at: string;
}

interface Disposisi {
  id: string;
  surat_masuk_id: string;
  tujuan_disposisi: string;
  instruksi: string;
  catatan: string | null;
  status: string;
  tanggal_disposisi: string;
  tanggal_selesai: string | null;
  created_at: string;
}

const KATEGORI_OPTIONS = [
  { value: 'umum', label: 'Umum' },
  { value: 'keuangan', label: 'Keuangan' },
  { value: 'kepegawaian', label: 'Kepegawaian' },
  { value: 'kesiswaan', label: 'Kesiswaan' },
  { value: 'kurikulum', label: 'Kurikulum' },
  { value: 'sarana', label: 'Sarana Prasarana' },
];

const INSTRUKSI_OPTIONS = [
  'Untuk diketahui',
  'Untuk ditindaklanjuti',
  'Untuk diproses',
  'Untuk dilaporkan',
  'Untuk diarsipkan',
  'Untuk dikoordinasikan',
  'Untuk ditelaah',
  'Untuk dijawab',
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Menunggu', color: 'bg-yellow-500' },
  { value: 'proses', label: 'Diproses', color: 'bg-blue-500' },
  { value: 'selesai', label: 'Selesai', color: 'bg-green-500' },
];

export default function SuratMasuk() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [disposisiDialogOpen, setDisposisiDialogOpen] = useState(false);
  const [selectedSurat, setSelectedSurat] = useState<SuratMasuk | null>(null);
  const [selectedDisposisi, setSelectedDisposisi] = useState<Disposisi | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState('surat');
  
  const [formData, setFormData] = useState({
    nomor_surat: '',
    tanggal_surat: format(new Date(), 'yyyy-MM-dd'),
    tanggal_diterima: format(new Date(), 'yyyy-MM-dd'),
    pengirim: '',
    perihal: '',
    kategori: 'umum',
    catatan: '',
    file_url: '',
  });

  const [disposisiForm, setDisposisiForm] = useState({
    tujuan_disposisi: '',
    instruksi: '',
    catatan: '',
    tanggal_disposisi: format(new Date(), 'yyyy-MM-dd'),
  });

  const { data: suratList, isLoading } = useQuery({
    queryKey: ['surat-masuk'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_masuk')
        .select('*')
        .order('tanggal_diterima', { ascending: false });
      if (error) throw error;
      return data as SuratMasuk[];
    },
  });

  const { data: disposisiList } = useQuery({
    queryKey: ['disposisi-surat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('disposisi_surat')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Disposisi[];
    },
  });

  const getDisposisiForSurat = (suratId: string) => {
    return disposisiList?.filter(d => d.surat_masuk_id === suratId) || [];
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `surat-masuk/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    const { error } = await supabase.storage
      .from('surat-documents')
      .upload(fileName, file);
    
    if (error) {
      toast.error('Gagal mengupload file: ' + error.message);
      return null;
    }
    
    const { data: urlData } = supabase.storage
      .from('surat-documents')
      .getPublicUrl(fileName);
    
    return urlData.publicUrl;
  };

  const deleteFile = async (fileUrl: string) => {
    const path = fileUrl.split('/surat-documents/')[1];
    if (path) {
      await supabase.storage.from('surat-documents').remove([path]);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      setUploading(true);
      let fileUrl = data.file_url;
      
      if (selectedFile) {
        const uploadedUrl = await uploadFile(selectedFile);
        if (uploadedUrl) {
          fileUrl = uploadedUrl;
        }
      }
      
      const { error } = await supabase.from('surat_masuk').insert({
        ...data,
        file_url: fileUrl || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surat-masuk'] });
      toast.success('Surat masuk berhasil ditambahkan');
      resetForm();
      setDialogOpen(false);
    },
    onError: (error) => {
      toast.error('Gagal menambahkan surat masuk: ' + error.message);
    },
    onSettled: () => {
      setUploading(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string }) => {
      setUploading(true);
      const { id, ...updateData } = data;
      let fileUrl = updateData.file_url;
      
      if (selectedFile) {
        if (selectedSurat?.file_url) {
          await deleteFile(selectedSurat.file_url);
        }
        const uploadedUrl = await uploadFile(selectedFile);
        if (uploadedUrl) {
          fileUrl = uploadedUrl;
        }
      }
      
      const { error } = await supabase.from('surat_masuk').update({
        ...updateData,
        file_url: fileUrl || null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surat-masuk'] });
      toast.success('Surat masuk berhasil diperbarui');
      resetForm();
      setDialogOpen(false);
    },
    onError: (error) => {
      toast.error('Gagal memperbarui surat masuk: ' + error.message);
    },
    onSettled: () => {
      setUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (surat: SuratMasuk) => {
      if (surat.file_url) {
        await deleteFile(surat.file_url);
      }
      const { error } = await supabase.from('surat_masuk').delete().eq('id', surat.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surat-masuk'] });
      queryClient.invalidateQueries({ queryKey: ['disposisi-surat'] });
      toast.success('Surat masuk berhasil dihapus');
      setDeleteDialogOpen(false);
      setSelectedSurat(null);
    },
    onError: (error) => {
      toast.error('Gagal menghapus surat masuk: ' + error.message);
    },
  });

  const createDisposisiMutation = useMutation({
    mutationFn: async (data: typeof disposisiForm & { surat_masuk_id: string }) => {
      const { error } = await supabase.from('disposisi_surat').insert({
        ...data,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disposisi-surat'] });
      toast.success('Disposisi berhasil ditambahkan');
      resetDisposisiForm();
      setDisposisiDialogOpen(false);
    },
    onError: (error) => {
      toast.error('Gagal menambahkan disposisi: ' + error.message);
    },
  });

  const updateDisposisiMutation = useMutation({
    mutationFn: async (data: { id: string; status: string; tanggal_selesai?: string }) => {
      const { error } = await supabase.from('disposisi_surat').update({
        status: data.status,
        tanggal_selesai: data.status === 'selesai' ? format(new Date(), 'yyyy-MM-dd') : null,
      }).eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disposisi-surat'] });
      toast.success('Status disposisi berhasil diperbarui');
    },
    onError: (error) => {
      toast.error('Gagal memperbarui status: ' + error.message);
    },
  });

  const deleteDisposisiMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('disposisi_surat').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disposisi-surat'] });
      toast.success('Disposisi berhasil dihapus');
    },
    onError: (error) => {
      toast.error('Gagal menghapus disposisi: ' + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      nomor_surat: '',
      tanggal_surat: format(new Date(), 'yyyy-MM-dd'),
      tanggal_diterima: format(new Date(), 'yyyy-MM-dd'),
      pengirim: '',
      perihal: '',
      kategori: 'umum',
      catatan: '',
      file_url: '',
    });
    setSelectedSurat(null);
    setSelectedFile(null);
  };

  const resetDisposisiForm = (clearSurat = true) => {
    setDisposisiForm({
      tujuan_disposisi: '',
      instruksi: '',
      catatan: '',
      tanggal_disposisi: format(new Date(), 'yyyy-MM-dd'),
    });
    if (clearSurat) {
      setSelectedSurat(null);
    }
  };

  const handleEdit = (surat: SuratMasuk) => {
    setSelectedSurat(surat);
    setFormData({
      nomor_surat: surat.nomor_surat,
      tanggal_surat: surat.tanggal_surat,
      tanggal_diterima: surat.tanggal_diterima,
      pengirim: surat.pengirim,
      perihal: surat.perihal,
      kategori: surat.kategori,
      catatan: surat.catatan || '',
      file_url: surat.file_url || '',
    });
    setSelectedFile(null);
    setDialogOpen(true);
  };

  const handleAddDisposisi = (surat: SuratMasuk) => {
    setSelectedSurat(surat);
    resetDisposisiForm(false);
    setDisposisiDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSurat && dialogOpen) {
      updateMutation.mutate({ ...formData, id: selectedSurat.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleSubmitDisposisi = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validasi field wajib
    if (!disposisiForm.tujuan_disposisi.trim()) {
      toast.error('Tujuan disposisi harus diisi');
      return;
    }
    if (!disposisiForm.instruksi) {
      toast.error('Instruksi harus dipilih');
      return;
    }
    
    if (selectedSurat) {
      createDisposisiMutation.mutate({ ...disposisiForm, surat_masuk_id: selectedSurat.id });
    }
  };

  const handleRemoveFile = async () => {
    if (selectedSurat?.file_url) {
      await deleteFile(selectedSurat.file_url);
    }
    setFormData({ ...formData, file_url: '' });
    setSelectedFile(null);
  };

  const filteredSurat = suratList?.filter(
    (surat) =>
      surat.nomor_surat.toLowerCase().includes(searchQuery.toLowerCase()) ||
      surat.pengirim.toLowerCase().includes(searchQuery.toLowerCase()) ||
      surat.perihal.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getKategoriLabel = (value: string) => {
    return KATEGORI_OPTIONS.find((k) => k.value === value)?.label || value;
  };

  const getStatusBadge = (status: string) => {
    const statusOption = STATUS_OPTIONS.find(s => s.value === status);
    return (
      <Badge className={`${statusOption?.color} text-white`}>
        {status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
        {status === 'proses' && <AlertCircle className="h-3 w-3 mr-1" />}
        {status === 'selesai' && <CheckCircle className="h-3 w-3 mr-1" />}
        {statusOption?.label || status}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Mail className="h-6 w-6" />
              Surat Masuk
            </h1>
            <p className="text-muted-foreground">Kelola administrasi surat masuk dan disposisi</p>
          </div>
          <div className="flex gap-2">
            <SuratRecapPdfPreview type="masuk" buttonVariant="outline" />
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Surat Masuk
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{selectedSurat && dialogOpen ? 'Edit Surat Masuk' : 'Tambah Surat Masuk'}</DialogTitle>
                </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nomor Surat</label>
                    <Input
                      value={formData.nomor_surat}
                      onChange={(e) => setFormData({ ...formData, nomor_surat: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Kategori</label>
                    <Select value={formData.kategori} onValueChange={(v) => setFormData({ ...formData, kategori: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KATEGORI_OPTIONS.map((k) => (
                          <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tanggal Surat</label>
                    <Input
                      type="date"
                      value={formData.tanggal_surat}
                      onChange={(e) => setFormData({ ...formData, tanggal_surat: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tanggal Diterima</label>
                    <Input
                      type="date"
                      value={formData.tanggal_diterima}
                      onChange={(e) => setFormData({ ...formData, tanggal_diterima: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Pengirim</label>
                  <Input
                    value={formData.pengirim}
                    onChange={(e) => setFormData({ ...formData, pengirim: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Perihal</label>
                  <Input
                    value={formData.perihal}
                    onChange={(e) => setFormData({ ...formData, perihal: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Lampiran</label>
                  {(formData.file_url || selectedFile) ? (
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="flex-1 text-sm truncate">
                        {selectedFile ? selectedFile.name : 'Lampiran tersimpan'}
                      </span>
                      {formData.file_url && !selectedFile && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => window.open(formData.file_url, '_blank')}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="sm" onClick={handleRemoveFile}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed rounded-lg p-4 text-center">
                      <Input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        className="hidden"
                        id="file-upload"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 10 * 1024 * 1024) {
                              toast.error('Ukuran file maksimal 10MB');
                              return;
                            }
                            setSelectedFile(file);
                          }
                        }}
                      />
                      <label htmlFor="file-upload" className="cursor-pointer">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Klik untuk upload file</p>
                        <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, JPG, PNG (max 10MB)</p>
                      </label>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Catatan</label>
                  <Textarea
                    value={formData.catatan}
                    onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || uploading}>
                    {uploading ? 'Mengupload...' : selectedSurat && dialogOpen ? 'Simpan' : 'Tambah'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nomor surat, pengirim, atau perihal..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
            ) : filteredSurat?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Belum ada surat masuk</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Nomor Surat</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Pengirim</TableHead>
                      <TableHead>Perihal</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Disposisi</TableHead>
                      <TableHead>Lampiran</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSurat?.map((surat, index) => {
                      const disposisiCount = getDisposisiForSurat(surat.id).length;
                      const pendingCount = getDisposisiForSurat(surat.id).filter(d => d.status === 'pending').length;
                      
                      return (
                        <TableRow key={surat.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="font-medium">{surat.nomor_surat}</TableCell>
                          <TableCell>{format(new Date(surat.tanggal_surat), 'd MMM yyyy', { locale: id })}</TableCell>
                          <TableCell>{surat.pengirim}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{surat.perihal}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{getKategoriLabel(surat.kategori)}</Badge>
                          </TableCell>
                          <TableCell>
                            {disposisiCount > 0 ? (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline">{disposisiCount} disposisi</Badge>
                                {pendingCount > 0 && (
                                  <Badge className="bg-yellow-500 text-white">{pendingCount} pending</Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {surat.file_url ? (
                              <Button variant="ghost" size="sm" onClick={() => window.open(surat.file_url!, '_blank')}>
                                <FileText className="h-4 w-4 mr-1" />
                                Lihat
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleAddDisposisi(surat)} title="Tambah Disposisi">
                                <ArrowRight className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(surat)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setSelectedSurat(surat); setDeleteDialogOpen(true); }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Disposisi List */}
        {disposisiList && disposisiList.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Daftar Disposisi</h2>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Surat</TableHead>
                      <TableHead>Tujuan Disposisi</TableHead>
                      <TableHead>Instruksi</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disposisiList.map((disposisi, index) => {
                      const surat = suratList?.find(s => s.id === disposisi.surat_masuk_id);
                      return (
                        <TableRow key={disposisi.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="font-medium">{surat?.nomor_surat || '-'}</TableCell>
                          <TableCell>{disposisi.tujuan_disposisi}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{disposisi.instruksi}</TableCell>
                          <TableCell>{format(new Date(disposisi.tanggal_disposisi), 'd MMM yyyy', { locale: id })}</TableCell>
                          <TableCell>{getStatusBadge(disposisi.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {disposisi.status !== 'selesai' && (
                                <Select
                                  value={disposisi.status}
                                  onValueChange={(value) => updateDisposisiMutation.mutate({ id: disposisi.id, status: value })}
                                >
                                  <SelectTrigger className="w-[120px] h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STATUS_OPTIONS.map((s) => (
                                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteDisposisiMutation.mutate(disposisi.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Disposisi Dialog */}
      <Dialog open={disposisiDialogOpen} onOpenChange={(open) => { setDisposisiDialogOpen(open); if (!open) resetDisposisiForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Disposisi</DialogTitle>
          </DialogHeader>
          {selectedSurat && (
            <div className="bg-muted/50 p-3 rounded-lg mb-4">
              <p className="text-sm font-medium">{selectedSurat.nomor_surat}</p>
              <p className="text-xs text-muted-foreground">{selectedSurat.perihal}</p>
            </div>
          )}
          <form onSubmit={handleSubmitDisposisi} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tujuan Disposisi</label>
              <Input
                value={disposisiForm.tujuan_disposisi}
                onChange={(e) => setDisposisiForm({ ...disposisiForm, tujuan_disposisi: e.target.value })}
                placeholder="Kepada siapa surat ini didisposisikan"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Instruksi</label>
              <Select 
                value={disposisiForm.instruksi} 
                onValueChange={(v) => setDisposisiForm({ ...disposisiForm, instruksi: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih instruksi" />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUKSI_OPTIONS.map((instruksi) => (
                    <SelectItem key={instruksi} value={instruksi}>{instruksi}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tanggal Disposisi</label>
              <Input
                type="date"
                value={disposisiForm.tanggal_disposisi}
                onChange={(e) => setDisposisiForm({ ...disposisiForm, tanggal_disposisi: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Catatan</label>
              <Textarea
                value={disposisiForm.catatan}
                onChange={(e) => setDisposisiForm({ ...disposisiForm, catatan: e.target.value })}
                rows={3}
                placeholder="Catatan tambahan (opsional)"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setDisposisiDialogOpen(false); resetDisposisiForm(); }}>
                Batal
              </Button>
              <Button type="submit" disabled={createDisposisiMutation.isPending}>
                Tambah Disposisi
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Surat Masuk</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus surat masuk "{selectedSurat?.nomor_surat}"? Semua disposisi terkait juga akan dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedSurat && deleteMutation.mutate(selectedSurat)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
