import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Loader2, Plus, Pencil, Trash2, FileText, Users, 
  CheckCircle, XCircle, Clock, Eye, Download, ExternalLink, KeyRound, Settings, Save, Copy
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FileRequirement {
  id: string;
  name: string;
  description: string | null;
  file_type: string | null;
  is_required: boolean;
  is_active: boolean;
  max_file_size_mb: number;
  created_at: string;
}

interface Submission {
  id: string;
  teacher_id: string;
  requirement_id: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  status: string;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  teachers: {
    nip: string | null;
    user_id: string;
    profiles: {
      full_name: string;
    } | null;
  } | null;
  file_upload_requirements: {
    name: string;
  } | null;
}

const FileUploadManagement = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [requirements, setRequirements] = useState<FileRequirement[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<FileRequirement | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    file_type: '',
    is_required: true,
    is_active: true,
    max_file_size_mb: 5
  });

  // Review form state
  const [reviewData, setReviewData] = useState({
    status: 'pending',
    notes: ''
  });

  // Access code state
  const [accessCode, setAccessCode] = useState('');
  const [isSavingAccessCode, setIsSavingAccessCode] = useState(false);

  useEffect(() => {
    fetchData();
    fetchAccessCode();
  }, []);

  const fetchAccessCode = async () => {
    try {
      const { data, error } = await supabase
        .from('school_settings')
        .select('teacher_upload_access_code')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setAccessCode(data?.teacher_upload_access_code || '');
    } catch (error) {
      console.error('Error fetching access code:', error);
    }
  };

  const handleSaveAccessCode = async () => {
    setIsSavingAccessCode(true);
    try {
      const { data: existing } = await supabase
        .from('school_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('school_settings')
          .update({ teacher_upload_access_code: accessCode || null })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        toast({
          title: "Error",
          description: "Pengaturan sekolah belum dikonfigurasi",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Berhasil",
        description: accessCode ? "Kode akses berhasil disimpan" : "Kode akses berhasil dihapus"
      });
    } catch (error: any) {
      console.error('Error saving access code:', error);
      toast({
        title: "Error",
        description: error.message || "Gagal menyimpan kode akses",
        variant: "destructive"
      });
    } finally {
      setIsSavingAccessCode(false);
    }
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setAccessCode(code);
  };

  const copyAccessCode = () => {
    if (accessCode) {
      navigator.clipboard.writeText(accessCode);
      toast({
        title: "Berhasil",
        description: "Kode akses berhasil disalin"
      });
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch requirements
      const { data: reqData, error: reqError } = await supabase
        .from('file_upload_requirements')
        .select('*')
        .order('created_at', { ascending: false });

      if (reqError) throw reqError;
      setRequirements(reqData || []);

      // Fetch submissions with teacher info
      const { data: subData, error: subError } = await supabase
        .from('teacher_file_submissions')
        .select(`
          *,
          teachers (
            nip,
            user_id
          ),
          file_upload_requirements (
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (subError) throw subError;

      // Get profile names for teachers
      if (subData && subData.length > 0) {
        const userIds = [...new Set(subData.map(s => s.teachers?.user_id).filter(Boolean))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

        const enrichedSubmissions = subData.map(s => ({
          ...s,
          teachers: s.teachers ? {
            ...s.teachers,
            profiles: {
              full_name: profileMap.get(s.teachers.user_id) || 'Unknown'
            }
          } : null
        }));

        setSubmissions(enrichedSubmissions);
      } else {
        setSubmissions([]);
      }

    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: error.message || "Gagal memuat data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (requirement?: FileRequirement) => {
    if (requirement) {
      setSelectedRequirement(requirement);
      setFormData({
        name: requirement.name,
        description: requirement.description || '',
        file_type: requirement.file_type || '',
        is_required: requirement.is_required,
        is_active: requirement.is_active,
        max_file_size_mb: requirement.max_file_size_mb
      });
    } else {
      setSelectedRequirement(null);
      setFormData({
        name: '',
        description: '',
        file_type: '',
        is_required: true,
        is_active: true,
        max_file_size_mb: 5
      });
    }
    setIsDialogOpen(true);
  };

  const handleSaveRequirement = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Nama berkas harus diisi",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      if (selectedRequirement) {
        // Update
        const { error } = await supabase
          .from('file_upload_requirements')
          .update({
            name: formData.name,
            description: formData.description || null,
            file_type: formData.file_type || null,
            is_required: formData.is_required,
            is_active: formData.is_active,
            max_file_size_mb: formData.max_file_size_mb
          })
          .eq('id', selectedRequirement.id);

        if (error) throw error;
        toast({ title: "Berhasil", description: "Berkas berhasil diperbarui" });
      } else {
        // Create
        const { error } = await supabase
          .from('file_upload_requirements')
          .insert({
            name: formData.name,
            description: formData.description || null,
            file_type: formData.file_type || null,
            is_required: formData.is_required,
            is_active: formData.is_active,
            max_file_size_mb: formData.max_file_size_mb,
            created_by: user?.id || ''
          });

        if (error) throw error;
        toast({ title: "Berhasil", description: "Berkas berhasil ditambahkan" });
      }

      setIsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving requirement:', error);
      toast({
        title: "Error",
        description: error.message || "Gagal menyimpan data",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRequirement = async () => {
    if (!selectedRequirement) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('file_upload_requirements')
        .delete()
        .eq('id', selectedRequirement.id);

      if (error) throw error;

      toast({ title: "Berhasil", description: "Berkas berhasil dihapus" });
      setIsDeleteDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error deleting requirement:', error);
      toast({
        title: "Error",
        description: error.message || "Gagal menghapus data",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenReviewDialog = (submission: Submission) => {
    setSelectedSubmission(submission);
    setReviewData({
      status: submission.status,
      notes: submission.notes || ''
    });
    setIsReviewDialogOpen(true);
  };

  const handleSaveReview = async () => {
    if (!selectedSubmission) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('teacher_file_submissions')
        .update({
          status: reviewData.status,
          notes: reviewData.notes || null,
          reviewed_by: user?.email || null,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', selectedSubmission.id);

      if (error) throw error;

      toast({ title: "Berhasil", description: "Review berhasil disimpan" });
      setIsReviewDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving review:', error);
      toast({
        title: "Error",
        description: error.message || "Gagal menyimpan review",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Disetujui</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Ditolak</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const pendingCount = submissions.filter(s => s.status === 'pending').length;
  const approvedCount = submissions.filter(s => s.status === 'approved').length;
  const rejectedCount = submissions.filter(s => s.status === 'rejected').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Manajemen Upload Berkas</h1>
          <p className="text-muted-foreground">
            Kelola persyaratan berkas dan review berkas yang diupload guru
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{requirements.length}</p>
                  <p className="text-sm text-muted-foreground">Jenis Berkas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/10 rounded-lg">
                  <Clock className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground">Menunggu Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{approvedCount}</p>
                  <p className="text-sm text-muted-foreground">Disetujui</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{rejectedCount}</p>
                  <p className="text-sm text-muted-foreground">Ditolak</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="requirements" className="space-y-4">
          <TabsList>
            <TabsTrigger value="requirements">Jenis Berkas</TabsTrigger>
            <TabsTrigger value="submissions">
              Berkas Masuk
              {pendingCount > 0 && (
                <Badge className="ml-2 bg-yellow-500">{pendingCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-2" />
              Pengaturan
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5" />
                  Kode Akses
                </CardTitle>
                <CardDescription>
                  Atur kode akses untuk halaman upload berkas guru. Kosongkan jika tidak memerlukan kode akses.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="access-code">Kode Akses</Label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Input
                        id="access-code"
                        placeholder="Masukkan kode akses..."
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                      />
                      {accessCode && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                          onClick={copyAccessCode}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Button variant="outline" onClick={generateRandomCode}>
                      Generate
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Kode akses akan diminta sebelum guru dapat mengakses halaman upload berkas
                  </p>
                </div>
                <Button onClick={handleSaveAccessCode} disabled={isSavingAccessCode}>
                  {isSavingAccessCode ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Simpan Kode Akses
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requirements">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Jenis Berkas</CardTitle>
                  <CardDescription>
                    Daftar berkas yang harus diupload oleh guru
                  </CardDescription>
                </div>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Berkas
                </Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : requirements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Belum ada jenis berkas yang ditambahkan</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Berkas</TableHead>
                        <TableHead>Deskripsi</TableHead>
                        <TableHead>Tipe File</TableHead>
                        <TableHead>Maks. Ukuran</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requirements.map((req) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-medium">
                            {req.name}
                            {req.is_required && (
                              <Badge variant="destructive" className="ml-2 text-xs">Wajib</Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {req.description || '-'}
                          </TableCell>
                          <TableCell>
                            {req.file_type ? req.file_type.toUpperCase() : 'Semua'}
                          </TableCell>
                          <TableCell>{req.max_file_size_mb}MB</TableCell>
                          <TableCell>
                            {req.is_active ? (
                              <Badge variant="outline" className="border-green-500 text-green-500">Aktif</Badge>
                            ) : (
                              <Badge variant="outline">Nonaktif</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(req)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedRequirement(req);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="submissions">
            <Card>
              <CardHeader>
                <CardTitle>Berkas Masuk</CardTitle>
                <CardDescription>
                  Review berkas yang diupload oleh guru
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Belum ada berkas yang diupload</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Guru</TableHead>
                        <TableHead>NIP</TableHead>
                        <TableHead>Jenis Berkas</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tanggal Upload</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions.map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium">
                            {sub.teachers?.profiles?.full_name || 'Unknown'}
                          </TableCell>
                          <TableCell>{sub.teachers?.nip || '-'}</TableCell>
                          <TableCell>
                            {sub.file_upload_requirements?.name || '-'}
                          </TableCell>
                          <TableCell>
                            <a
                              href={sub.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {sub.file_name}
                            </a>
                          </TableCell>
                          <TableCell>{getStatusBadge(sub.status)}</TableCell>
                          <TableCell>
                            {new Date(sub.created_at).toLocaleDateString('id-ID')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenReviewDialog(sub)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add/Edit Requirement Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedRequirement ? 'Edit Jenis Berkas' : 'Tambah Jenis Berkas'}
            </DialogTitle>
            <DialogDescription>
              Tentukan berkas yang harus diupload oleh guru
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Berkas *</Label>
              <Input
                placeholder="Contoh: SK Pengangkatan"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Deskripsi</Label>
              <Textarea
                placeholder="Deskripsi berkas..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipe File</Label>
                <Select
                  value={formData.file_type || "all"}
                  onValueChange={(value) => setFormData({ ...formData, file_type: value === "all" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Semua tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua tipe</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="jpg">JPG/JPEG</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="doc">DOC/DOCX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Maks. Ukuran (MB)</Label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={formData.max_file_size_mb}
                  onChange={(e) => setFormData({ ...formData, max_file_size_mb: parseInt(e.target.value) || 5 })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_required}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
                />
                <Label>Wajib diupload</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label>Aktif</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleSaveRequirement} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Jenis Berkas?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus "{selectedRequirement?.name}"? 
              Semua file yang sudah diupload untuk berkas ini juga akan terhapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRequirement}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review Dialog */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Berkas</DialogTitle>
            <DialogDescription>
              Review berkas yang diupload oleh guru
            </DialogDescription>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Guru:</span>
                  <span className="font-medium">{selectedSubmission.teachers?.profiles?.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Jenis Berkas:</span>
                  <span className="font-medium">{selectedSubmission.file_upload_requirements?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">File:</span>
                  <a
                    href={selectedSubmission.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {selectedSubmission.file_name}
                  </a>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={reviewData.status}
                  onValueChange={(value) => setReviewData({ ...reviewData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Disetujui</SelectItem>
                    <SelectItem value="rejected">Ditolak</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Catatan</Label>
                <Textarea
                  placeholder="Catatan untuk guru..."
                  value={reviewData.notes}
                  onChange={(e) => setReviewData({ ...reviewData, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)}>
                  Batal
                </Button>
                <Button onClick={handleSaveReview} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Simpan Review
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default FileUploadManagement;
