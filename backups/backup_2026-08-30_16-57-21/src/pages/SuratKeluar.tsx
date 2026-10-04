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
import { Plus, Pencil, Trash2, Send, Search, Upload, FileText, ExternalLink, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SuratRecapPdfPreview } from '@/components/SuratRecapPdfPreview';

interface SuratKeluar {
  id: string;
  nomor_surat: string;
  tanggal_surat: string;
  tujuan: string;
  perihal: string;
  kategori: string;
  file_url: string | null;
  catatan: string | null;
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

export default function SuratKeluar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSurat, setSelectedSurat] = useState<SuratKeluar | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    nomor_surat: '',
    tanggal_surat: format(new Date(), 'yyyy-MM-dd'),
    tujuan: '',
    perihal: '',
    kategori: 'umum',
    catatan: '',
    file_url: '',
  });

  const { data: suratList, isLoading } = useQuery({
    queryKey: ['surat-keluar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_keluar')
        .select('*')
        .order('tanggal_surat', { ascending: false });
      if (error) throw error;
      return data as SuratKeluar[];
    },
  });

  const uploadFile = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `surat-keluar/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    
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
      
      const { error } = await supabase.from('surat_keluar').insert({
        ...data,
        file_url: fileUrl || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surat-keluar'] });
      toast.success('Surat keluar berhasil ditambahkan');
      resetForm();
      setDialogOpen(false);
    },
    onError: (error) => {
      toast.error('Gagal menambahkan surat keluar: ' + error.message);
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
        // Delete old file if exists
        if (selectedSurat?.file_url) {
          await deleteFile(selectedSurat.file_url);
        }
        const uploadedUrl = await uploadFile(selectedFile);
        if (uploadedUrl) {
          fileUrl = uploadedUrl;
        }
      }
      
      const { error } = await supabase.from('surat_keluar').update({
        ...updateData,
        file_url: fileUrl || null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surat-keluar'] });
      toast.success('Surat keluar berhasil diperbarui');
      resetForm();
      setDialogOpen(false);
    },
    onError: (error) => {
      toast.error('Gagal memperbarui surat keluar: ' + error.message);
    },
    onSettled: () => {
      setUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (surat: SuratKeluar) => {
      // Delete file if exists
      if (surat.file_url) {
        await deleteFile(surat.file_url);
      }
      const { error } = await supabase.from('surat_keluar').delete().eq('id', surat.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surat-keluar'] });
      toast.success('Surat keluar berhasil dihapus');
      setDeleteDialogOpen(false);
      setSelectedSurat(null);
    },
    onError: (error) => {
      toast.error('Gagal menghapus surat keluar: ' + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      nomor_surat: '',
      tanggal_surat: format(new Date(), 'yyyy-MM-dd'),
      tujuan: '',
      perihal: '',
      kategori: 'umum',
      catatan: '',
      file_url: '',
    });
    setSelectedSurat(null);
    setSelectedFile(null);
  };

  const handleEdit = (surat: SuratKeluar) => {
    setSelectedSurat(surat);
    setFormData({
      nomor_surat: surat.nomor_surat,
      tanggal_surat: surat.tanggal_surat,
      tujuan: surat.tujuan,
      perihal: surat.perihal,
      kategori: surat.kategori,
      catatan: surat.catatan || '',
      file_url: surat.file_url || '',
    });
    setSelectedFile(null);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSurat) {
      updateMutation.mutate({ ...formData, id: selectedSurat.id });
    } else {
      createMutation.mutate(formData);
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
      surat.tujuan.toLowerCase().includes(searchQuery.toLowerCase()) ||
      surat.perihal.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getKategoriLabel = (value: string) => {
    return KATEGORI_OPTIONS.find((k) => k.value === value)?.label || value;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Send className="h-6 w-6" />
              Surat Keluar
            </h1>
            <p className="text-muted-foreground">Kelola administrasi surat keluar</p>
          </div>
          <div className="flex gap-2">
            <SuratRecapPdfPreview type="keluar" buttonVariant="outline" />
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Surat Keluar
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{selectedSurat ? 'Edit Surat Keluar' : 'Tambah Surat Keluar'}</DialogTitle>
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
                  <label className="text-sm font-medium">Tujuan</label>
                  <Input
                    value={formData.tujuan}
                    onChange={(e) => setFormData({ ...formData, tujuan: e.target.value })}
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(formData.file_url, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed rounded-lg p-4 text-center">
                      <Input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        className="hidden"
                        id="file-upload-keluar"
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
                      <label htmlFor="file-upload-keluar" className="cursor-pointer">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Klik untuk upload file
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          PDF, DOC, DOCX, JPG, PNG (max 10MB)
                        </p>
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
                    {uploading ? 'Mengupload...' : selectedSurat ? 'Simpan' : 'Tambah'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nomor surat, tujuan, atau perihal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
            ) : filteredSurat?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Belum ada surat keluar</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Nomor Surat</TableHead>
                      <TableHead>Tanggal Surat</TableHead>
                      <TableHead>Tujuan</TableHead>
                      <TableHead>Perihal</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Lampiran</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSurat?.map((surat, index) => (
                      <TableRow key={surat.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{surat.nomor_surat}</TableCell>
                        <TableCell>{format(new Date(surat.tanggal_surat), 'd MMM yyyy', { locale: id })}</TableCell>
                        <TableCell>{surat.tujuan}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{surat.perihal}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{getKategoriLabel(surat.kategori)}</Badge>
                        </TableCell>
                        <TableCell>
                          {surat.file_url ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(surat.file_url!, '_blank')}
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              Lihat
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
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
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Surat Keluar</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus surat keluar "{selectedSurat?.nomor_surat}"? Tindakan ini tidak dapat dibatalkan.
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
