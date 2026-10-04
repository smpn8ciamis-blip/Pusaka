import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, Save, Building2, Image as ImageIcon, Upload, CalendarIcon, Copy, Check, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LetterheadPreview } from '@/components/LetterheadPreview';
import { ZapierWebhookManager } from '@/components/ZapierWebhookManager';
import { PasswordChangeForm } from '@/components/PasswordChangeForm';
import { TwoFactorSetup } from '@/components/TwoFactorSetup';
import { AppFooter } from '@/components/AppFooter';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AttendanceDaySettings } from '@/components/AttendanceDaySettings';

const Settings = () => {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    app_name: '',
    school_name: '',
    district_name: '',
    district_font_size: 12,
    district_font_style: 'bold',
    district_line_spacing: 1.2,
    school_address: '',
    school_phone: '',
    headmaster_name: '',
    headmaster_nip: '',
    logo_url: '',
    logo_width: 20,
    logo_height: 20,
    logo_position_x: 14,
    logo_position_y: 15,
    right_logo_url: '',
    right_logo_width: 20,
    right_logo_height: 20,
    right_logo_position_x: 176,
    right_logo_position_y: 15,
    header_font_size: 16,
    header_font_style: 'bold',
    school_line_spacing: 1.2,
    subheader_font_size: 10,
    show_address: true,
    show_phone: true,
    watermark_url: '',
    watermark_opacity: 10,
    watermark_size: 100,
    watermark_position: 'center',
    watermark_enabled: false,
    school_stamp_url: '',
    headmaster_signature_url: '',
    academic_year: '2024/2025',
    active_semester: 1,
    exam_name: 'PENILAIAN SUMATIF AKHIR SEMESTER (PSAS)',
    exam_schedule: [] as Array<{no: number, day: string, date: string, subject: string, time: string, duration: string, startTime?: string, endTime?: string, selectedDate?: Date}>,
    enable_student_status_check: true,
    enable_activity_permission: true,
    enable_graduation_check: true,
    enable_complaint_channel: true,
    enable_complaint_status_check: true,
    student_status_check_text: 'Cek Status Peserta Didik',
    student_status_check_color: 'outline',
    activity_permission_text: 'Portal Izin Kegiatan Siswa',
    activity_permission_color: 'outline',
    graduation_check_text: 'Cek Status Kelulusan',
    graduation_check_color: 'outline',
    complaint_channel_text: 'Kanal Pengaduan',
    complaint_channel_color: 'destructive',
    complaint_status_check_text: 'Cek Status Pengaduan',
    complaint_status_check_color: 'outline',
    enable_captcha: true,
    wakasek_sarpras_teacher_id: '' as string | null,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [rightLogoFile, setRightLogoFile] = useState<File | null>(null);
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingRightLogo, setIsUploadingRightLogo] = useState(false);
  const [isUploadingWatermark, setIsUploadingWatermark] = useState(false);
  const [isUploadingStamp, setIsUploadingStamp] = useState(false);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (garbage collection time)
  });

  // Fetch teachers for Wakasek Sarpras selection
  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers-for-settings'],
    queryFn: async () => {
      // First get teachers
      const { data: teachersData, error: teachersError } = await supabase
        .from('teachers')
        .select('id, nip, subject, jabatan, pangkat_golongan, user_id')
        .order('nip');
      
      if (teachersError) throw teachersError;
      
      // Then get profiles for each teacher
      const userIds = teachersData.map(t => t.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      
      if (profilesError) throw profilesError;
      
      // Map profiles to teachers
      return teachersData.map(teacher => ({
        ...teacher,
        profiles: profilesData?.find(p => p.id === teacher.user_id) || null
      }));
    },
  });

            {/* CAPTCHA Setting */}
            <div className="space-y-3 p-4 border border-border rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">Verifikasi CAPTCHA</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Nonaktifkan jika CAPTCHA tidak bisa dimuat (misalnya di VPS tanpa akses Google)
                  </p>
                </div>
                <Switch
                  checked={formData.enable_captcha}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enable_captcha: checked })
                  }
                />
              </div>
            </div>


  // Daftar mata pelajaran SMP Kurikulum Merdeka
  const subjects = [
    'Pendidikan Agama dan Budi Pekerti',
    'Pendidikan Pancasila',
    'Bahasa Indonesia',
    'Matematika',
    'Ilmu Pengetahuan Alam (IPA)',
    'Ilmu Pengetahuan Sosial (IPS)',
    'Bahasa Inggris',
    'Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)',
    'Seni Musik',
    'Seni Rupa',
    'Seni Budaya',
    'Prakarya',
    'Informatika',
    'Bahasa Daerah',
  ];

  // Function to calculate duration
  const calculateDuration = (startTime: string, endTime: string): string => {
    if (!startTime || !endTime) return '';
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    const durationMinutes = endMinutes - startMinutes;
    
    if (durationMinutes <= 0) return '';
    
    return `${durationMinutes}`;
  };

  useEffect(() => {
      if (settings) {
        setFormData({
          app_name: settings.app_name || '',
          school_name: settings.school_name || '',
          district_name: settings.district_name || '',
          district_font_size: settings.district_font_size || 12,
          district_font_style: settings.district_font_style || 'bold',
          district_line_spacing: settings.district_line_spacing || 1.2,
          school_address: settings.school_address || '',
          school_phone: settings.school_phone || '',
        headmaster_name: settings.headmaster_name || '',
        headmaster_nip: settings.headmaster_nip || '',
        logo_url: settings.logo_url || '',
        logo_width: settings.logo_width || 20,
        logo_height: settings.logo_height || 20,
        logo_position_x: settings.logo_position_x || 14,
        logo_position_y: settings.logo_position_y || 15,
        right_logo_url: settings.right_logo_url || '',
        right_logo_width: settings.right_logo_width || 20,
        right_logo_height: settings.right_logo_height || 20,
        right_logo_position_x: settings.right_logo_position_x || 176,
        right_logo_position_y: settings.right_logo_position_y || 15,
        header_font_size: settings.header_font_size || 16,
        header_font_style: settings.header_font_style || 'bold',
        school_line_spacing: settings.school_line_spacing || 1.2,
        subheader_font_size: settings.subheader_font_size || 10,
        show_address: settings.show_address !== false,
        show_phone: settings.show_phone !== false,
        watermark_url: settings.watermark_url || '',
        watermark_opacity: settings.watermark_opacity || 10,
        watermark_size: settings.watermark_size || 100,
        watermark_position: settings.watermark_position || 'center',
        watermark_enabled: settings.watermark_enabled || false,
        school_stamp_url: settings.school_stamp_url || '',
        headmaster_signature_url: settings.headmaster_signature_url || '',
        academic_year: settings.academic_year || '2024/2025',
        active_semester: (settings as any).active_semester || 1,
        exam_name: settings.exam_name || 'PENILAIAN SUMATIF AKHIR SEMESTER (PSAS)',
        exam_schedule: ((settings as any).exam_schedule as Array<{no: number, day: string, date: string, subject: string, time: string, duration: string}>) || [],
        enable_student_status_check: (settings as any).enable_student_status_check !== false,
        enable_activity_permission: (settings as any).enable_activity_permission !== false,
        enable_graduation_check: (settings as any).enable_graduation_check !== false,
        enable_complaint_channel: (settings as any).enable_complaint_channel !== false,
        enable_complaint_status_check: (settings as any).enable_complaint_status_check !== false,
        student_status_check_text: (settings as any).student_status_check_text || 'Cek Status Peserta Didik',
        student_status_check_color: (settings as any).student_status_check_color || 'outline',
        activity_permission_text: (settings as any).activity_permission_text || 'Portal Izin Kegiatan Siswa',
        activity_permission_color: (settings as any).activity_permission_color || 'outline',
        graduation_check_text: (settings as any).graduation_check_text || 'Cek Status Kelulusan',
        graduation_check_color: (settings as any).graduation_check_color || 'outline',
        complaint_channel_text: (settings as any).complaint_channel_text || 'Kanal Pengaduan',
        complaint_channel_color: (settings as any).complaint_channel_color || 'destructive',
        complaint_status_check_text: (settings as any).complaint_status_check_text || 'Cek Status Pengaduan',
        complaint_status_check_color: (settings as any).complaint_status_check_color || 'outline',
        enable_captcha: (settings as any).enable_captcha !== false,
        wakasek_sarpras_teacher_id: (settings as any).wakasek_sarpras_teacher_id || null,
      });
    }
  }, [settings]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({ 
          title: 'Ukuran file terlalu besar', 
          description: 'Maksimal ukuran logo adalah 2MB',
          variant: 'destructive' 
        });
        return;
      }
      setLogoFile(file);
    }
  };

  const handleRightLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({ 
          title: 'Ukuran file terlalu besar', 
          description: 'Maksimal ukuran logo adalah 2MB',
          variant: 'destructive' 
        });
        return;
      }
      setRightLogoFile(file);
    }
  };

  const handleWatermarkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({ 
          title: 'Ukuran file terlalu besar', 
          description: 'Maksimal ukuran watermark adalah 2MB',
          variant: 'destructive' 
        });
        return;
      }
      setWatermarkFile(file);
    }
  };

  const handleStampChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({ 
          title: 'Ukuran file terlalu besar', 
          description: 'Maksimal ukuran cap adalah 2MB',
          variant: 'destructive' 
        });
        return;
      }
      setStampFile(file);
    }
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({ 
          title: 'Ukuran file terlalu besar', 
          description: 'Maksimal ukuran tanda tangan adalah 2MB',
          variant: 'destructive' 
        });
        return;
      }
      setSignatureFile(file);
    }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return formData.logo_url || null;

    setIsUploadingLogo(true);
    try {
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `logo-left-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('school-logos')
        .upload(filePath, logoFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('school-logos')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({ 
        title: 'Gagal mengunggah logo kiri', 
        variant: 'destructive' 
      });
      return null;
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const uploadRightLogo = async (): Promise<string | null> => {
    if (!rightLogoFile) return formData.right_logo_url || null;

    setIsUploadingRightLogo(true);
    try {
      const fileExt = rightLogoFile.name.split('.').pop();
      const fileName = `logo-right-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('school-logos')
        .upload(filePath, rightLogoFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('school-logos')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading right logo:', error);
      toast({ 
        title: 'Gagal mengunggah logo kanan', 
        variant: 'destructive' 
      });
      return null;
    } finally {
      setIsUploadingRightLogo(false);
    }
  };

  const uploadWatermark = async (): Promise<string | null> => {
    if (!watermarkFile) return formData.watermark_url || null;

    setIsUploadingWatermark(true);
    try {
      const fileExt = watermarkFile.name.split('.').pop();
      const fileName = `watermark-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('school-logos')
        .upload(filePath, watermarkFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('school-logos')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading watermark:', error);
      toast({ 
        title: 'Gagal mengunggah watermark', 
        variant: 'destructive' 
      });
      return null;
    } finally {
      setIsUploadingWatermark(false);
    }
  };

  const uploadStamp = async (): Promise<string | null> => {
    if (!stampFile) return formData.school_stamp_url || null;

    setIsUploadingStamp(true);
    try {
      const fileExt = stampFile.name.split('.').pop();
      const fileName = `stamp-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('school-logos')
        .upload(filePath, stampFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('school-logos')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading stamp:', error);
      toast({ 
        title: 'Gagal mengunggah cap sekolah', 
        variant: 'destructive' 
      });
      return null;
    } finally {
      setIsUploadingStamp(false);
    }
  };

  const uploadSignature = async (): Promise<string | null> => {
    if (!signatureFile) return formData.headmaster_signature_url || null;

    setIsUploadingSignature(true);
    try {
      const fileExt = signatureFile.name.split('.').pop();
      const fileName = `signature-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('school-logos')
        .upload(filePath, signatureFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('school-logos')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading signature:', error);
      toast({ 
        title: 'Gagal mengunggah tanda tangan', 
        variant: 'destructive' 
      });
      return null;
    } finally {
      setIsUploadingSignature(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      if (settings?.id) {
        const { error } = await supabase
          .from('school_settings')
          .update(data)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('school_settings')
          .insert([data]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-settings'] });
      setLogoFile(null);
      setRightLogoFile(null);
      setWatermarkFile(null);
      setStampFile(null);
      setSignatureFile(null);
      toast({ title: 'Pengaturan berhasil disimpan' });
    },
    onError: () => {
      toast({ title: 'Gagal menyimpan pengaturan', variant: 'destructive' });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Upload files if there are new ones
    const logoUrl = await uploadLogo();
    const rightLogoUrl = await uploadRightLogo();
    const watermarkUrl = await uploadWatermark();
    const stampUrl = await uploadStamp();
    const signatureUrl = await uploadSignature();
    
    const dataToSave = {
      ...formData,
      logo_url: logoUrl || formData.logo_url,
      right_logo_url: rightLogoUrl || formData.right_logo_url,
      watermark_url: watermarkUrl || formData.watermark_url,
      school_stamp_url: stampUrl || formData.school_stamp_url,
      headmaster_signature_url: signatureUrl || formData.headmaster_signature_url,
    };
    
    updateMutation.mutate(dataToSave);
  };

  // For non-admin users, show account settings
  if (userRole !== 'admin') {
    const requiresMfa = userRole === 'bendahara';
    const canManageAttendanceDays = userRole === 'kesiswaan';

    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Pengaturan Akun</h1>
              <p className="text-muted-foreground">
                Kelola pengaturan akun Anda
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Ganti Password</CardTitle>
              <CardDescription>
                Ubah password akun Anda untuk keamanan yang lebih baik
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PasswordChangeForm />
            </CardContent>
          </Card>

          {/* Attendance Day Settings for kesiswaan */}
          {canManageAttendanceDays && <AttendanceDaySettings />}

          {/* 2FA Setup for bendahara (bendahara require 2FA) */}
          {requiresMfa && (
            <>
              <Alert className="border-amber-500/30 bg-amber-500/5">
                <Shield className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-amber-600 dark:text-amber-400">
                  Sebagai Bendahara, Anda disarankan untuk mengaktifkan 2FA demi keamanan akun.
                </AlertDescription>
              </Alert>
              <TwoFactorSetup />
            </>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // Admin view - full settings
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <SettingsIcon className="h-8 w-8" />
            Pengaturan
          </h1>
          <p className="text-muted-foreground">Kelola informasi sekolah dan kepala sekolah</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Preview Section */}
          <LetterheadPreview settings={formData} logoFile={logoFile} rightLogoFile={rightLogoFile} watermarkFile={watermarkFile} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Kop Surat
              </CardTitle>
              <CardDescription>
                Logo dan informasi sekolah yang akan ditampilkan pada setiap laporan PDF
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="logo">Logo Kiri</Label>
                <div className="flex items-start gap-4">
                  {(formData.logo_url || logoFile) && (
                    <div className="flex-shrink-0">
                      <img
                        src={logoFile ? URL.createObjectURL(logoFile) : formData.logo_url}
                        alt="Logo kiri"
                        className="w-20 h-20 object-contain border rounded"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      id="logo"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Format: PNG, JPG. Maksimal 2MB. Ukuran direkomendasikan: 200x200px
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="right-logo">Logo Kanan</Label>
                <div className="flex items-start gap-4">
                  {(formData.right_logo_url || rightLogoFile) && (
                    <div className="flex-shrink-0">
                      <img
                        src={rightLogoFile ? URL.createObjectURL(rightLogoFile) : formData.right_logo_url}
                        alt="Logo kanan"
                        className="w-20 h-20 object-contain border rounded"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      id="right-logo"
                      type="file"
                      accept="image/*"
                      onChange={handleRightLogoChange}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Format: PNG, JPG. Maksimal 2MB. Ukuran direkomendasikan: 200x200px
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold text-sm">Ukuran Logo Kiri (mm)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Lebar: {formData.logo_width}mm</Label>
                    <Slider
                      value={[formData.logo_width]}
                      onValueChange={(value) => setFormData({ ...formData, logo_width: value[0] })}
                      min={10}
                      max={50}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tinggi: {formData.logo_height}mm</Label>
                    <Slider
                      value={[formData.logo_height]}
                      onValueChange={(value) => setFormData({ ...formData, logo_height: value[0] })}
                      min={10}
                      max={50}
                      step={1}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold text-sm">Posisi Logo Kiri (mm dari kiri/atas)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Posisi X: {formData.logo_position_x}mm</Label>
                    <Slider
                      value={[formData.logo_position_x]}
                      onValueChange={(value) => setFormData({ ...formData, logo_position_x: value[0] })}
                      min={5}
                      max={50}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Posisi Y: {formData.logo_position_y}mm</Label>
                    <Slider
                      value={[formData.logo_position_y]}
                      onValueChange={(value) => setFormData({ ...formData, logo_position_y: value[0] })}
                      min={5}
                      max={40}
                      step={1}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold text-sm">Ukuran Logo Kanan (mm)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Lebar: {formData.right_logo_width}mm</Label>
                    <Slider
                      value={[formData.right_logo_width]}
                      onValueChange={(value) => setFormData({ ...formData, right_logo_width: value[0] })}
                      min={10}
                      max={50}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tinggi: {formData.right_logo_height}mm</Label>
                    <Slider
                      value={[formData.right_logo_height]}
                      onValueChange={(value) => setFormData({ ...formData, right_logo_height: value[0] })}
                      min={10}
                      max={50}
                      step={1}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold text-sm">Posisi Logo Kanan (mm dari kiri/atas)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Posisi X: {formData.right_logo_position_x}mm</Label>
                    <Slider
                      value={[formData.right_logo_position_x]}
                      onValueChange={(value) => setFormData({ ...formData, right_logo_position_x: value[0] })}
                      min={150}
                      max={190}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Posisi Y: {formData.right_logo_position_y}mm</Label>
                    <Slider
                      value={[formData.right_logo_position_y]}
                      onValueChange={(value) => setFormData({ ...formData, right_logo_position_y: value[0] })}
                      min={5}
                      max={40}
                      step={1}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold text-sm">Pengaturan Teks</h4>
                
                {/* District Name Font Settings */}
                <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium">Format Nama Kabupaten</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Ukuran: {formData.district_font_size}pt</Label>
                      <Slider
                        value={[formData.district_font_size]}
                        onValueChange={(value) => setFormData({ ...formData, district_font_size: value[0] })}
                        min={8}
                        max={18}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="district_font_style">Gaya Font</Label>
                      <Select
                        value={formData.district_font_style}
                        onValueChange={(value) => setFormData({ ...formData, district_font_style: value })}
                      >
                        <SelectTrigger id="district_font_style">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="bold">Bold</SelectItem>
                          <SelectItem value="italic">Italic</SelectItem>
                          <SelectItem value="bolditalic">Bold Italic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Line Spacing: {formData.district_line_spacing.toFixed(1)}</Label>
                    <Slider
                      value={[formData.district_line_spacing]}
                      onValueChange={(value) => setFormData({ ...formData, district_line_spacing: value[0] })}
                      min={0.8}
                      max={2.0}
                      step={0.1}
                    />
                  </div>
                </div>

                {/* School Name Font Settings */}
                <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium">Format Nama Sekolah</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Ukuran: {formData.header_font_size}pt</Label>
                      <Slider
                        value={[formData.header_font_size]}
                        onValueChange={(value) => setFormData({ ...formData, header_font_size: value[0] })}
                        min={12}
                        max={24}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="header_font_style">Gaya Font</Label>
                      <Select
                        value={formData.header_font_style}
                        onValueChange={(value) => setFormData({ ...formData, header_font_style: value })}
                      >
                        <SelectTrigger id="header_font_style">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="bold">Bold</SelectItem>
                          <SelectItem value="italic">Italic</SelectItem>
                          <SelectItem value="bolditalic">Bold Italic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Line Spacing: {formData.school_line_spacing.toFixed(1)}</Label>
                    <Slider
                      value={[formData.school_line_spacing]}
                      onValueChange={(value) => setFormData({ ...formData, school_line_spacing: value[0] })}
                      min={0.8}
                      max={2.0}
                      step={0.1}
                    />
                  </div>
                </div>

                {/* Sub-text Font Settings */}
                <div className="space-y-2">
                  <Label>Ukuran Sub-teks (Alamat/Telp): {formData.subheader_font_size}pt</Label>
                  <Slider
                    value={[formData.subheader_font_size]}
                    onValueChange={(value) => setFormData({ ...formData, subheader_font_size: value[0] })}
                    min={8}
                    max={14}
                    step={1}
                  />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <h4 className="font-semibold text-sm">Tampilan Informasi</h4>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show_address" className="cursor-pointer">Tampilkan Alamat</Label>
                  <Switch
                    id="show_address"
                    checked={formData.show_address}
                    onCheckedChange={(checked) => setFormData({ ...formData, show_address: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show_phone" className="cursor-pointer">Tampilkan Telepon</Label>
                  <Switch
                    id="show_phone"
                    checked={formData.show_phone}
                    onCheckedChange={(checked) => setFormData({ ...formData, show_phone: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Informasi Sekolah
              </CardTitle>
              <CardDescription>
                Data sekolah akan digunakan dalam laporan dan dokumen resmi
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="app_name">Nama Aplikasi</Label>
                <Input
                  id="app_name"
                  value={formData.app_name}
                  onChange={(e) => setFormData({ ...formData, app_name: e.target.value })}
                  placeholder="Sistem Manajemen Sekolah"
                />
                <p className="text-xs text-muted-foreground">
                  Nama aplikasi akan ditampilkan di footer setiap halaman
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="district_name">Nama Kabupaten</Label>
                <Input
                  id="district_name"
                  value={formData.district_name}
                  onChange={(e) => setFormData({ ...formData, district_name: e.target.value })}
                  placeholder="Contoh: KABUPATEN BANDUNG"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="school_name">Nama Sekolah</Label>
                <Input
                  id="school_name"
                  value={formData.school_name}
                  onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                  placeholder="Contoh: SMA Negeri 1 Jakarta"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="school_address">Alamat Sekolah</Label>
                <Textarea
                  id="school_address"
                  value={formData.school_address}
                  onChange={(e) => setFormData({ ...formData, school_address: e.target.value })}
                  placeholder="Alamat lengkap sekolah"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="school_phone">Telepon Sekolah</Label>
                <Input
                  id="school_phone"
                  value={formData.school_phone}
                  onChange={(e) => setFormData({ ...formData, school_phone: e.target.value })}
                  placeholder="Contoh: (021) 1234567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="academic_year">Tahun Pelajaran</Label>
                <Input
                  id="academic_year"
                  value={formData.academic_year}
                  onChange={(e) => setFormData({ ...formData, academic_year: e.target.value })}
                  placeholder="Contoh: 2024/2025"
                />
                <p className="text-xs text-muted-foreground">
                  Tahun pelajaran akan ditampilkan di dokumen ujian
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="active_semester">Semester Aktif Default</Label>
                <Select
                  value={formData.active_semester.toString()}
                  onValueChange={(value) => setFormData({ ...formData, active_semester: parseInt(value) })}
                >
                  <SelectTrigger id="active_semester">
                    <SelectValue placeholder="Pilih semester" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Semester Ganjil</SelectItem>
                    <SelectItem value="2">Semester Genap</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Semester default yang akan dipilih saat aplikasi dibuka
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam_name">Nama Kegiatan Penilaian</Label>
                <Input
                  id="exam_name"
                  value={formData.exam_name}
                  onChange={(e) => setFormData({ ...formData, exam_name: e.target.value })}
                  placeholder="Contoh: PENILAIAN SUMATIF AKHIR SEMESTER (PSAS)"
                />
                <p className="text-xs text-muted-foreground">
                  Nama kegiatan penilaian akan ditampilkan di dokumen ujian
                </p>
              </div>
              
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-semibold">Jadwal Ujian</Label>
                    <p className="text-xs text-muted-foreground">
                      Atur sesi ujian per mata pelajaran. Dalam 1 hari bisa ada beberapa sesi ujian.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData({
                      ...formData,
                      exam_schedule: [
                        ...formData.exam_schedule,
                        {
                          no: formData.exam_schedule.length + 1,
                          day: '',
                          date: '',
                          subject: '',
                          time: '',
                          duration: '',
                          startTime: '',
                          endTime: '',
                          selectedDate: undefined
                        }
                      ]
                    })}
                  >
                    Tambah Sesi Ujian
                  </Button>
                </div>
                
                {formData.exam_schedule.length > 0 && (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {formData.exam_schedule.map((schedule, index) => (
                      <Card key={index} className="p-3">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">Sesi {schedule.no}</span>
                              {schedule.date && (
                                <span className="text-xs text-muted-foreground">
                                  ({schedule.day}, {schedule.date})
                                </span>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newSchedule = formData.exam_schedule.filter((_, i) => i !== index);
                                // Renumber the remaining items
                                const renumbered = newSchedule.map((item, idx) => ({ ...item, no: idx + 1 }));
                                setFormData({ ...formData, exam_schedule: renumbered });
                              }}
                            >
                              Hapus
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1 col-span-2">
                              <Label className="text-xs">Tanggal</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-full justify-start text-left font-normal",
                                      !schedule.selectedDate && "text-muted-foreground"
                                    )}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {schedule.selectedDate ? (
                                      format(schedule.selectedDate, "EEEE, dd MMMM yyyy", { locale: localeId })
                                    ) : (
                                      <span>Pilih tanggal</span>
                                    )}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-background" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={schedule.selectedDate}
                                    onSelect={(date) => {
                                      if (date) {
                                        const newSchedule = [...formData.exam_schedule];
                                        newSchedule[index].selectedDate = date;
                                        newSchedule[index].day = format(date, "EEEE", { locale: localeId });
                                        newSchedule[index].date = format(date, "dd MMMM yyyy", { locale: localeId });
                                        setFormData({ ...formData, exam_schedule: newSchedule });
                                      }
                                    }}
                                    initialFocus
                                    className="pointer-events-auto"
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Mata Pelajaran</Label>
                            <Select
                              value={schedule.subject}
                              onValueChange={(value) => {
                                const newSchedule = [...formData.exam_schedule];
                                newSchedule[index].subject = value;
                                setFormData({ ...formData, exam_schedule: newSchedule });
                              }}
                            >
                              <SelectTrigger className="bg-background">
                                <SelectValue placeholder="Pilih mata pelajaran" />
                              </SelectTrigger>
                              <SelectContent className="bg-background">
                                {subjects.map((subject) => (
                                  <SelectItem key={subject} value={subject}>
                                    {subject}
                                  </SelectItem>
                                ))}
                                <SelectItem value="custom">Lainnya (ketik manual)</SelectItem>
                              </SelectContent>
                            </Select>
                            {schedule.subject === 'custom' && (
                              <Input
                                placeholder="Ketik nama mata pelajaran"
                                className="mt-2"
                                onChange={(e) => {
                                  const newSchedule = [...formData.exam_schedule];
                                  newSchedule[index].subject = e.target.value;
                                  setFormData({ ...formData, exam_schedule: newSchedule });
                                }}
                              />
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Waktu Mulai</Label>
                              <Input
                                type="time"
                                value={schedule.startTime || ''}
                                onChange={(e) => {
                                  const newSchedule = [...formData.exam_schedule];
                                  newSchedule[index].startTime = e.target.value;
                                  
                                  // Update time string
                                  if (newSchedule[index].endTime) {
                                    newSchedule[index].time = `${e.target.value} - ${newSchedule[index].endTime}`;
                                    newSchedule[index].duration = calculateDuration(e.target.value, newSchedule[index].endTime || '');
                                  }
                                  
                                  setFormData({ ...formData, exam_schedule: newSchedule });
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Waktu Selesai</Label>
                              <Input
                                type="time"
                                value={schedule.endTime || ''}
                                onChange={(e) => {
                                  const newSchedule = [...formData.exam_schedule];
                                  newSchedule[index].endTime = e.target.value;
                                  
                                  // Update time string and calculate duration
                                  if (newSchedule[index].startTime) {
                                    newSchedule[index].time = `${newSchedule[index].startTime} - ${e.target.value}`;
                                    newSchedule[index].duration = calculateDuration(newSchedule[index].startTime || '', e.target.value);
                                  }
                                  
                                  setFormData({ ...formData, exam_schedule: newSchedule });
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Durasi</Label>
                              <Input
                                value={schedule.duration ? `${schedule.duration} menit` : ''}
                                placeholder="Auto"
                                disabled
                                className="bg-muted"
                              />
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Kepala Sekolah & Pejabat</CardTitle>
              <CardDescription>
                Informasi kepala sekolah dan pejabat untuk ditampilkan dalam laporan PDF
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="headmaster_name">Nama Kepala Sekolah</Label>
                <Input
                  id="headmaster_name"
                  value={formData.headmaster_name}
                  onChange={(e) => setFormData({ ...formData, headmaster_name: e.target.value })}
                  placeholder="Nama lengkap kepala sekolah"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="headmaster_nip">NIP Kepala Sekolah</Label>
                <Input
                  id="headmaster_nip"
                  value={formData.headmaster_nip}
                  onChange={(e) => setFormData({ ...formData, headmaster_nip: e.target.value })}
                  placeholder="Nomor Induk Pegawai"
                />
              </div>

              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="wakasek_sarpras">Wakasek Sarana Prasarana</Label>
                <Select
                  value={formData.wakasek_sarpras_teacher_id || "none"}
                  onValueChange={(value) => setFormData({ ...formData, wakasek_sarpras_teacher_id: value === "none" ? null : value })}
                >
                  <SelectTrigger id="wakasek_sarpras">
                    <SelectValue placeholder="Pilih guru sebagai Wakasek Sarpras" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Tidak Dipilih --</SelectItem>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.profiles?.full_name || "Guru"} {teacher.nip ? `- NIP. ${teacher.nip}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Wakasek Sarpras akan tampil di daftar hadir tukang
                </p>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="stamp">Cap Sekolah</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="stamp"
                    type="file"
                    accept="image/*"
                    onChange={handleStampChange}
                    disabled={isUploadingStamp}
                  />
                  {formData.school_stamp_url && (
                    <img
                      src={formData.school_stamp_url}
                      alt="Cap Sekolah"
                      className="h-16 w-16 object-contain border rounded"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Format: PNG dengan background transparan (Maksimal 2MB)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signature">Tanda Tangan Kepala Sekolah</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="signature"
                    type="file"
                    accept="image/*"
                    onChange={handleSignatureChange}
                    disabled={isUploadingSignature}
                  />
                  {formData.headmaster_signature_url && (
                    <img
                      src={formData.headmaster_signature_url}
                      alt="Tanda Tangan"
                      className="h-16 w-auto object-contain border rounded"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Format: PNG dengan background transparan (Maksimal 2MB)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Watermark / Logo Background
              </CardTitle>
              <CardDescription>
                Tambahkan logo atau watermark di background seluruh halaman PDF
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b">
                <div>
                  <Label htmlFor="watermark_enabled" className="cursor-pointer font-semibold">
                    Aktifkan Watermark
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tampilkan watermark di background PDF
                  </p>
                </div>
                <Switch
                  id="watermark_enabled"
                  checked={formData.watermark_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, watermark_enabled: checked })}
                />
              </div>

              {formData.watermark_enabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="watermark">Gambar Watermark</Label>
                    <div className="flex items-start gap-4">
                      {(formData.watermark_url || watermarkFile) && (
                        <div className="flex-shrink-0">
                          <img
                            src={watermarkFile ? URL.createObjectURL(watermarkFile) : formData.watermark_url}
                            alt="Watermark"
                            className="w-20 h-20 object-contain border rounded"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <Input
                          id="watermark"
                          type="file"
                          accept="image/*"
                          onChange={handleWatermarkChange}
                          className="cursor-pointer"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Format: PNG (dengan transparansi), JPG. Maksimal 2MB
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Transparansi: {formData.watermark_opacity}%</Label>
                    <Slider
                      value={[formData.watermark_opacity]}
                      onValueChange={(value) => setFormData({ ...formData, watermark_opacity: value[0] })}
                      min={5}
                      max={50}
                      step={5}
                    />
                    <p className="text-xs text-muted-foreground">
                      Semakin rendah, semakin transparan
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Ukuran: {formData.watermark_size}mm</Label>
                    <Slider
                      value={[formData.watermark_size]}
                      onValueChange={(value) => setFormData({ ...formData, watermark_size: value[0] })}
                      min={50}
                      max={150}
                      step={10}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="watermark_position">Posisi</Label>
                    <Select
                      value={formData.watermark_position}
                      onValueChange={(value) => setFormData({ ...formData, watermark_position: value })}
                    >
                      <SelectTrigger id="watermark_position">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="center">Tengah</SelectItem>
                        <SelectItem value="top-left">Kiri Atas</SelectItem>
                        <SelectItem value="top-right">Kanan Atas</SelectItem>
                        <SelectItem value="bottom-left">Kiri Bawah</SelectItem>
                        <SelectItem value="bottom-right">Kanan Bawah</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={updateMutation.isPending || isUploadingLogo || isUploadingWatermark} 
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {isUploadingLogo || isUploadingWatermark ? 'Mengunggah...' : updateMutation.isPending ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </Button>
          </div>
        </form>

        {/* Password Change Section */}
        <PasswordChangeForm />

        {/* Zapier Integration Section */}
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Integrasi Google Sheets (Zapier)</h2>
            <p className="text-muted-foreground">
              Sinkronisasi data database dengan Google Sheets secara real-time menggunakan Zapier
            </p>
          </div>
          
          <ZapierWebhookManager />
        </div>

        {/* Public Portal Settings Section */}
        <Card>
          <CardHeader>
            <CardTitle>Pengaturan Portal Publik</CardTitle>
            <CardDescription>
              Aktifkan atau nonaktifkan tombol akses portal publik di halaman login
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Student Status Check */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Cek Status Peserta Didik</Label>
                <Switch
                  checked={formData.enable_student_status_check}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enable_student_status_check: checked })
                  }
                />
              </div>
              <div className="grid gap-3 pt-2">
                <div>
                  <Label className="text-sm">Teks Tombol</Label>
                  <Input
                    value={formData.student_status_check_text}
                    onChange={(e) =>
                      setFormData({ ...formData, student_status_check_text: e.target.value })
                    }
                    placeholder="Cek Status Peserta Didik"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-sm">Warna Tombol</Label>
                  <Select
                    value={formData.student_status_check_color}
                    onValueChange={(value) =>
                      setFormData({ ...formData, student_status_check_color: value })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="destructive">Destructive</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                      <SelectItem value="secondary">Secondary</SelectItem>
                      <SelectItem value="ghost">Ghost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Activity Permission */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Portal Izin Kegiatan</Label>
                <Switch
                  checked={formData.enable_activity_permission}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enable_activity_permission: checked })
                  }
                />
              </div>
              <div className="grid gap-3 pt-2">
                <div>
                  <Label className="text-sm">Teks Tombol</Label>
                  <Input
                    value={formData.activity_permission_text}
                    onChange={(e) =>
                      setFormData({ ...formData, activity_permission_text: e.target.value })
                    }
                    placeholder="Portal Izin Kegiatan Siswa"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-sm">Warna Tombol</Label>
                  <Select
                    value={formData.activity_permission_color}
                    onValueChange={(value) =>
                      setFormData({ ...formData, activity_permission_color: value })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="destructive">Destructive</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                      <SelectItem value="secondary">Secondary</SelectItem>
                      <SelectItem value="ghost">Ghost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Graduation Check */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Cek Status Kelulusan</Label>
                <Switch
                  checked={formData.enable_graduation_check}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enable_graduation_check: checked })
                  }
                />
              </div>
              <div className="grid gap-3 pt-2">
                <div>
                  <Label className="text-sm">Teks Tombol</Label>
                  <Input
                    value={formData.graduation_check_text}
                    onChange={(e) =>
                      setFormData({ ...formData, graduation_check_text: e.target.value })
                    }
                    placeholder="Cek Status Kelulusan"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-sm">Warna Tombol</Label>
                  <Select
                    value={formData.graduation_check_color}
                    onValueChange={(value) =>
                      setFormData({ ...formData, graduation_check_color: value })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="destructive">Destructive</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                      <SelectItem value="secondary">Secondary</SelectItem>
                      <SelectItem value="ghost">Ghost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Complaint Channel */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Kanal Pengaduan</Label>
                <Switch
                  checked={formData.enable_complaint_channel}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enable_complaint_channel: checked })
                  }
                />
              </div>
              <div className="grid gap-3 pt-2">
                <div>
                  <Label className="text-sm">Teks Tombol</Label>
                  <Input
                    value={formData.complaint_channel_text}
                    onChange={(e) =>
                      setFormData({ ...formData, complaint_channel_text: e.target.value })
                    }
                    placeholder="Kanal Pengaduan"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-sm">Warna Tombol</Label>
                  <Select
                    value={formData.complaint_channel_color}
                    onValueChange={(value) =>
                      setFormData({ ...formData, complaint_channel_color: value })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="destructive">Destructive</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                      <SelectItem value="secondary">Secondary</SelectItem>
                      <SelectItem value="ghost">Ghost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Complaint Status Check */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Cek Status Pengaduan</Label>
                <Switch
                  checked={formData.enable_complaint_status_check}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enable_complaint_status_check: checked })
                  }
                />
              </div>
              <div className="grid gap-3 pt-2">
                <div>
                  <Label className="text-sm">Teks Tombol</Label>
                  <Input
                    value={formData.complaint_status_check_text}
                    onChange={(e) =>
                      setFormData({ ...formData, complaint_status_check_text: e.target.value })
                    }
                    placeholder="Cek Status Pengaduan"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-sm">Warna Tombol</Label>
                  <Select
                    value={formData.complaint_status_check_color}
                    onValueChange={(value) =>
                      setFormData({ ...formData, complaint_status_check_color: value })
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="destructive">Destructive</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                      <SelectItem value="secondary">Secondary</SelectItem>
                      <SelectItem value="ghost">Ghost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button 
                onClick={() => updateMutation.mutate({
                  enable_student_status_check: formData.enable_student_status_check,
                  enable_activity_permission: formData.enable_activity_permission,
                  enable_graduation_check: formData.enable_graduation_check,
                  enable_complaint_channel: formData.enable_complaint_channel,
                  enable_complaint_status_check: formData.enable_complaint_status_check,
                  student_status_check_text: formData.student_status_check_text,
                  student_status_check_color: formData.student_status_check_color,
                  activity_permission_text: formData.activity_permission_text,
                  activity_permission_color: formData.activity_permission_color,
                  graduation_check_text: formData.graduation_check_text,
                  graduation_check_color: formData.graduation_check_color,
                  complaint_channel_text: formData.complaint_channel_text,
                  complaint_channel_color: formData.complaint_channel_color,
                  complaint_status_check_text: formData.complaint_status_check_text,
                  complaint_status_check_color: formData.complaint_status_check_color,
                  enable_captcha: formData.enable_captcha,
                })} 
                disabled={updateMutation.isPending}
                className="w-full sm:w-auto"
              >
                <Save className="mr-2 h-4 w-4" />
                {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Pengaturan Portal'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* API Endpoint Section */}
        <Card>
          <CardHeader>
            <CardTitle>API Endpoint Statistik</CardTitle>
            <CardDescription>
              URL endpoint untuk mengakses data statistik sekolah
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* All Stats Endpoint */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Semua Statistik</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stats`}
                  readOnly
                  className="font-mono text-xs flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stats`);
                    toast({ 
                      title: 'Endpoint disalin',
                      description: 'URL endpoint telah disalin ke clipboard'
                    });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Rombel Endpoint */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Jumlah Rombel</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stats/rombel`}
                  readOnly
                  className="font-mono text-xs flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stats/rombel`);
                    toast({ 
                      title: 'Endpoint disalin',
                      description: 'URL endpoint telah disalin ke clipboard'
                    });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Siswa Endpoint */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Jumlah Siswa</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stats/siswa`}
                  readOnly
                  className="font-mono text-xs flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stats/siswa`);
                    toast({ 
                      title: 'Endpoint disalin',
                      description: 'URL endpoint telah disalin ke clipboard'
                    });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Guru Endpoint */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Jumlah Guru</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stats/guru`}
                  readOnly
                  className="font-mono text-xs flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stats/guru`);
                    toast({ 
                      title: 'Endpoint disalin',
                      description: 'URL endpoint telah disalin ke clipboard'
                    });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground pt-2">
              Endpoint ini dapat diakses secara publik tanpa autentikasi
            </p>
          </CardContent>
        </Card>

        {/* Attendance Day Settings for Admin */}
        <AttendanceDaySettings />

        {/* 2FA Setup for Admin */}
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <Shield className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-amber-600 dark:text-amber-400">
            Sebagai Admin, Anda disarankan untuk mengaktifkan 2FA demi keamanan akun.
          </AlertDescription>
        </Alert>
        <TwoFactorSetup />

        <AppFooter />
      </div>
    </DashboardLayout>
  );
};

export default Settings;
