import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, Upload, CheckCircle, FileText, User, Building, AlertCircle, Lock, KeyRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Teacher {
  id: string;
  nip: string | null;
  nuptk: string | null;
  subject: string;
  jabatan: string | null;
  pangkat_golongan: string | null;
  profiles: {
    full_name: string;
    email: string;
  } | null;
}

interface FileRequirement {
  id: string;
  name: string;
  description: string | null;
  file_type: string | null;
  is_required: boolean;
  max_file_size_mb: number;
}

interface Submission {
  id: string;
  requirement_id: string;
  file_url: string;
  file_name: string;
  status: string;
  notes: string | null;
}

const PublicTeacherUpload = () => {
  const { toast } = useToast();
  const [accessCode, setAccessCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isAccessGranted, setIsAccessGranted] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [nip, setNip] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [requirements, setRequirements] = useState<FileRequirement[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasAccessCode, setHasAccessCode] = useState<boolean | null>(null);

  // Check if access code is configured
  useEffect(() => {
    const checkAccessCodeConfig = async () => {
      try {
        const { data, error } = await supabase.rpc('teacher_upload_access_required');
        if (error) throw error;

        // If access code is NOT required, grant access directly
        if (!data) {
          setIsAccessGranted(true);
          setHasAccessCode(false);
        } else {
          setHasAccessCode(true);
        }
      } catch (error) {
        console.error('Error checking access code config:', error);
        // Default to requiring access code on error
        setHasAccessCode(true);
      }
    };

    checkAccessCodeConfig();
  }, []);

  const handleVerifyAccessCode = async () => {
    if (!accessCode.trim()) {
      toast({
        title: "Error",
        description: "Masukkan kode akses terlebih dahulu",
        variant: "destructive"
      });
      return;
    }

    setIsVerifying(true);
    setAccessError(null);

    try {
      const { data, error } = await supabase.rpc('verify_teacher_upload_access_code', {
        _code: accessCode.trim(),
      });

      if (error) throw error;

      if (data === true) {
        setIsAccessGranted(true);
        toast({
          title: "Berhasil",
          description: "Kode akses valid. Silakan lanjutkan."
        });
      } else {
        setAccessError('Kode akses tidak valid');
      }
    } catch (error: any) {
      console.error('Error verifying access code:', error);
      toast({
        title: "Error",
        description: error.message || "Gagal memverifikasi kode akses",
        variant: "destructive"
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSearch = async () => {
    if (!nip.trim()) {
      toast({
        title: "Error",
        description: "Masukkan NIP terlebih dahulu",
        variant: "destructive"
      });
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setTeacher(null);

    try {
      // Normalize NIP - remove all spaces
      const normalizedNip = nip.trim().replace(/\s+/g, '');
      
      // Search teacher by NIP - try exact match first, then normalized match
      const { data: allTeachers, error: teacherError } = await supabase
        .from('teachers')
        .select(`
          id,
          nip,
          nuptk,
          subject,
          jabatan,
          pangkat_golongan,
          user_id
        `);

      if (teacherError) throw teacherError;

      // Find teacher by matching NIP (with or without spaces)
      const teacherData = allTeachers?.find(t => {
        if (!t.nip) return false;
        const dbNipNormalized = t.nip.replace(/\s+/g, '');
        return dbNipNormalized === normalizedNip || t.nip === nip.trim();
      });

      if (!teacherData) {
        setSearchError('Data guru dengan NIP tersebut tidak ditemukan');
        return;
      }

      // Get profile data
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', teacherData.user_id)
        .maybeSingle();

      const teacherWithProfile: Teacher = {
        ...teacherData,
        profiles: profileData
      };

      setTeacher(teacherWithProfile);

      // Fetch requirements
      const { data: reqData, error: reqError } = await supabase
        .from('file_upload_requirements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (reqError) throw reqError;
      setRequirements(reqData || []);

      // Fetch existing submissions for this teacher
      const { data: subData, error: subError } = await supabase
        .from('teacher_file_submissions')
        .select('*')
        .eq('teacher_id', teacherData.id);

      if (subError) throw subError;
      setSubmissions(subData || []);

    } catch (error: any) {
      console.error('Error searching teacher:', error);
      toast({
        title: "Error",
        description: error.message || "Gagal mencari data guru",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleFileUpload = async (requirement: FileRequirement, file: File) => {
    if (!teacher) return;

    // Check file size
    const maxSizeBytes = requirement.max_file_size_mb * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast({
        title: "Error",
        description: `Ukuran file maksimal ${requirement.max_file_size_mb}MB`,
        variant: "destructive"
      });
      return;
    }

    setUploadingId(requirement.id);

    try {
      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${teacher.id}/${requirement.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('teacher-uploads')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('teacher-uploads')
        .getPublicUrl(fileName);

      // Check if submission already exists
      const existingSubmission = submissions.find(s => s.requirement_id === requirement.id);

      if (existingSubmission) {
        // Update existing submission
        const { error: updateError } = await supabase
          .from('teacher_file_submissions')
          .update({
            file_url: urlData.publicUrl,
            file_name: file.name,
            file_size: file.size,
            status: 'pending',
            notes: null,
            reviewed_by: null,
            reviewed_at: null
          })
          .eq('id', existingSubmission.id);

        if (updateError) throw updateError;
      } else {
        // Create new submission
        const { error: insertError } = await supabase
          .from('teacher_file_submissions')
          .insert({
            teacher_id: teacher.id,
            requirement_id: requirement.id,
            file_url: urlData.publicUrl,
            file_name: file.name,
            file_size: file.size
          });

        if (insertError) throw insertError;
      }

      // Refresh submissions
      const { data: subData } = await supabase
        .from('teacher_file_submissions')
        .select('*')
        .eq('teacher_id', teacher.id);

      setSubmissions(subData || []);

      toast({
        title: "Berhasil",
        description: `File ${file.name} berhasil diupload`
      });

    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: "Error",
        description: error.message || "Gagal mengupload file",
        variant: "destructive"
      });
    } finally {
      setUploadingId(null);
    }
  };

  const getSubmissionForRequirement = (requirementId: string) => {
    return submissions.find(s => s.requirement_id === requirementId);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500">Disetujui</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Ditolak</Badge>;
      default:
        return <Badge variant="secondary">Menunggu Review</Badge>;
    }
  };

  // Show loading state while checking access code config
  if (hasAccessCode === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show access code input if not granted yet
  if (!isAccessGranted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-4 md:p-8 flex items-center justify-center">
        <Card className="w-full max-w-md border-primary/20">
          <CardHeader className="text-center">
            <div className="mx-auto p-4 bg-primary/10 rounded-full w-fit mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">Upload Berkas Guru</CardTitle>
            <CardDescription>
              Masukkan kode akses untuk melanjutkan
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="access-code">Kode Akses</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="access-code"
                  type="password"
                  placeholder="Masukkan kode akses..."
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyAccessCode()}
                  className="pl-10"
                />
              </div>
            </div>

            {accessError && (
              <div className="p-3 bg-destructive/10 rounded-lg flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{accessError}</span>
              </div>
            )}

            <Button 
              onClick={handleVerifyAccessCode} 
              disabled={isVerifying}
              className="w-full"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Memverifikasi...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  Verifikasi Kode
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Hubungi admin sekolah jika Anda tidak memiliki kode akses
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-primary/20">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Upload Berkas Guru</CardTitle>
            <CardDescription>
              Masukkan NIP untuk melakukan upload berkas yang diperlukan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Masukkan NIP..."
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} disabled={isSearching}>
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2">Cari</span>
              </Button>
            </div>

            {searchError && (
              <div className="mt-4 p-4 bg-destructive/10 rounded-lg flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span>{searchError}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {teacher && (
          <>
            {/* Teacher Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Data Guru
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Nama Lengkap</Label>
                    <p className="font-medium">{teacher.profiles?.full_name || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">NIP</Label>
                    <p className="font-medium">{teacher.nip || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">NUPTK</Label>
                    <p className="font-medium">{teacher.nuptk || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Mata Pelajaran</Label>
                    <p className="font-medium">{teacher.subject || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Jabatan</Label>
                    <p className="font-medium">{teacher.jabatan || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Pangkat/Golongan</Label>
                    <p className="font-medium">{teacher.pangkat_golongan || '-'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Upload Requirements */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Berkas yang Harus Diupload
                </CardTitle>
                <CardDescription>
                  Upload berkas sesuai dengan persyaratan yang ditentukan
                </CardDescription>
              </CardHeader>
              <CardContent>
                {requirements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Tidak ada berkas yang perlu diupload saat ini</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {requirements.map((req) => {
                      const submission = getSubmissionForRequirement(req.id);
                      const isUploading = uploadingId === req.id;

                      return (
                        <div
                          key={req.id}
                          className="border rounded-lg p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{req.name}</h4>
                                {req.is_required && (
                                  <Badge variant="destructive" className="text-xs">Wajib</Badge>
                                )}
                              </div>
                              {req.description && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {req.description}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                Maks. {req.max_file_size_mb}MB
                                {req.file_type && ` • ${req.file_type.toUpperCase()}`}
                              </p>
                            </div>
                            {submission && getStatusBadge(submission.status)}
                          </div>

                          {submission ? (
                            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="text-sm">{submission.file_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={submission.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-primary hover:underline"
                                >
                                  Lihat File
                                </a>
                                <Label
                                  htmlFor={`file-${req.id}`}
                                  className="cursor-pointer text-sm text-primary hover:underline"
                                >
                                  Ganti File
                                </Label>
                              </div>
                            </div>
                          ) : null}

                          {submission?.status === 'rejected' && submission.notes && (
                            <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                              <strong>Catatan:</strong> {submission.notes}
                            </div>
                          )}

                          <input
                            type="file"
                            id={`file-${req.id}`}
                            className="hidden"
                            accept={req.file_type ? `.${req.file_type}` : undefined}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleFileUpload(req, file);
                              }
                              e.target.value = '';
                            }}
                          />

                          {!submission && (
                            <Button
                              variant="outline"
                              className="w-full"
                              disabled={isUploading}
                              onClick={() => document.getElementById(`file-${req.id}`)?.click()}
                            >
                              {isUploading ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Mengupload...
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4 mr-2" />
                                  Pilih File
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default PublicTeacherUpload;
