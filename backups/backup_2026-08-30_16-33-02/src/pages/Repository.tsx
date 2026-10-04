import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { FileText, Plus, ExternalLink, Trash2, Edit, FolderOpen, Search, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface RepositoryItem {
  id: string;
  title: string;
  description: string | null;
  google_drive_link: string;
  file_type: string | null;
  category: string;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  uploader_name?: string;
}

export default function Repository() {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [googleDriveLink, setGoogleDriveLink] = useState('');
  const [fileType, setFileType] = useState('');
  const [category, setCategory] = useState('lainnya');

  const categories = [
    { value: 'dokumen', label: 'Dokumen' },
    { value: 'materi', label: 'Materi Pembelajaran' },
    { value: 'soal', label: 'Soal & Kunci Jawaban' },
    { value: 'administrasi', label: 'Administrasi' },
    { value: 'panduan', label: 'Panduan' },
    { value: 'lainnya', label: 'Lainnya' },
  ];

  // Fetch repository items
  const { data: repositoryItems, isLoading } = useQuery<RepositoryItem[]>({
    queryKey: ['repository'],
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from('repository')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch uploader names separately
      if (items && items.length > 0) {
        const uploaderIds = [...new Set(items.map(item => item.uploaded_by))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', uploaderIds);
        
        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]));
        
        return items.map(item => ({
          ...item,
          uploader_name: profileMap.get(item.uploaded_by) || '-'
        }));
      }
      
      return items || [];
    },
  });

  // Add repository item mutation
  const addItemMutation = useMutation({
    mutationFn: async (newItem: any) => {
      const { error } = await supabase
        .from('repository')
        .insert([{
          title: newItem.title,
          description: newItem.description,
          google_drive_link: newItem.googleDriveLink,
          file_type: newItem.fileType,
          category: newItem.category,
          uploaded_by: user?.id,
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repository'] });
      toast.success('File berhasil ditambahkan ke repositori');
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error) => {
      toast.error('Gagal menambahkan file: ' + error.message);
    },
  });

  // Update repository item mutation
  const updateItemMutation = useMutation({
    mutationFn: async (updatedItem: any) => {
      const { error } = await supabase
        .from('repository')
        .update({
          title: updatedItem.title,
          description: updatedItem.description,
          google_drive_link: updatedItem.googleDriveLink,
          file_type: updatedItem.fileType,
          category: updatedItem.category,
        })
        .eq('id', updatedItem.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repository'] });
      toast.success('File berhasil diperbarui');
      resetForm();
      setIsEditDialogOpen(false);
      setEditingItem(null);
    },
    onError: (error) => {
      toast.error('Gagal memperbarui file: ' + error.message);
    },
  });

  // Delete repository item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('repository')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repository'] });
      toast.success('File berhasil dihapus');
    },
    onError: (error) => {
      toast.error('Gagal menghapus file: ' + error.message);
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setGoogleDriveLink('');
    setFileType('');
    setCategory('lainnya');
  };

  const handlePreview = (item: any) => {
    setPreviewItem(item);
    setIsPreviewDialogOpen(true);
  };

  // Convert Google Drive link to embed URL
  const getEmbedUrl = (driveLink: string) => {
    // Extract file ID from various Google Drive URL formats
    const patterns = [
      /\/file\/d\/([^\/]+)/,
      /id=([^&]+)/,
      /\/d\/([^\/]+)/
    ];
    
    for (const pattern of patterns) {
      const match = driveLink.match(pattern);
      if (match) {
        return `https://drive.google.com/file/d/${match[1]}/preview`;
      }
    }
    
    // If no pattern matches, return the original link
    return driveLink;
  };

  const handleAdd = () => {
    if (!title.trim() || !googleDriveLink.trim()) {
      toast.error('Judul dan link Google Drive harus diisi');
      return;
    }
    
    addItemMutation.mutate({
      title,
      description,
      googleDriveLink,
      fileType,
      category,
    });
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setTitle(item.title);
    setDescription(item.description || '');
    setGoogleDriveLink(item.google_drive_link);
    setFileType(item.file_type || '');
    setCategory(item.category);
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!title.trim() || !googleDriveLink.trim()) {
      toast.error('Judul dan link Google Drive harus diisi');
      return;
    }
    
    updateItemMutation.mutate({
      id: editingItem.id,
      title,
      description,
      googleDriveLink,
      fileType,
      category,
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('Yakin ingin menghapus file ini dari repositori?')) {
      deleteItemMutation.mutate(id);
    }
  };

  // Filter items based on search and category
  const filteredItems = repositoryItems?.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Repositori File</h1>
            <p className="text-muted-foreground">
              Kelola dan akses file repositori sekolah
            </p>
          </div>
          {userRole === 'admin' && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Tambah File
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Tambah File Repositori</DialogTitle>
                  <DialogDescription>
                    Tambahkan file baru ke repositori dengan link Google Drive
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Judul File *</Label>
                    <Input
                      id="title"
                      placeholder="Contoh: Silabus Matematika Kelas 7"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Deskripsi</Label>
                    <Textarea
                      id="description"
                      placeholder="Deskripsi singkat tentang file..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="google_drive_link">Link Google Drive *</Label>
                    <Input
                      id="google_drive_link"
                      placeholder="https://drive.google.com/..."
                      value={googleDriveLink}
                      onChange={(e) => setGoogleDriveLink(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Kategori *</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    resetForm();
                    setIsAddDialogOpen(false);
                  }}>
                    Batal
                  </Button>
                  <Button onClick={handleAdd} disabled={addItemMutation.isPending}>
                    {addItemMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari file..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Filter kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Repository Items */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Daftar File
            </CardTitle>
            <CardDescription>
              {filteredItems?.length || 0} file tersedia
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                Memuat data...
              </div>
            ) : filteredItems && filteredItems.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Diupload Oleh</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.title}</div>
                            {item.description && (
                              <div className="text-sm text-muted-foreground line-clamp-1">
                                {item.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {categories.find(c => c.value === item.category)?.label || item.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.uploader_name}
                        </TableCell>
                        <TableCell>
                          {format(new Date(item.created_at), 'dd MMM yyyy', { locale: localeId })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePreview(item)}
                              title="Preview"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              title="Buka di Google Drive"
                            >
                              <a
                                href={item.google_drive_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="gap-1"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                            {userRole === 'admin' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(item)}
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(item.id)}
                                  title="Hapus"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Belum ada file dalam repositori</p>
                {userRole === 'admin' && (
                  <Button
                    variant="outline"
                    className="mt-4 gap-2"
                    onClick={() => setIsAddDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Tambah File Pertama
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit File Repositori</DialogTitle>
              <DialogDescription>
                Perbarui informasi file repositori
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit_title">Judul File *</Label>
                <Input
                  id="edit_title"
                  placeholder="Contoh: Silabus Matematika Kelas 7"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_description">Deskripsi</Label>
                <Textarea
                  id="edit_description"
                  placeholder="Deskripsi singkat tentang file..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_google_drive_link">Link Google Drive *</Label>
                <Input
                  id="edit_google_drive_link"
                  placeholder="https://drive.google.com/..."
                  value={googleDriveLink}
                  onChange={(e) => setGoogleDriveLink(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_category">Kategori *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                resetForm();
                setIsEditDialogOpen(false);
                setEditingItem(null);
              }}>
                Batal
              </Button>
              <Button onClick={handleUpdate} disabled={updateItemMutation.isPending}>
                {updateItemMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Preview: {previewItem?.title}
              </DialogTitle>
              <DialogDescription>
                {previewItem?.description || 'Tidak ada deskripsi'}
              </DialogDescription>
            </DialogHeader>
            <div className="w-full h-[70vh] p-6 pt-4">
              {previewItem && (
                <iframe
                  src={getEmbedUrl(previewItem.google_drive_link)}
                  className="w-full h-full border rounded-lg"
                  allow="autoplay"
                  title={previewItem.title}
                />
              )}
            </div>
            <DialogFooter className="p-6 pt-0">
              <Button variant="outline" onClick={() => setIsPreviewDialogOpen(false)}>
                Tutup
              </Button>
              <Button asChild>
                <a
                  href={previewItem?.google_drive_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Buka di Google Drive
                </a>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
