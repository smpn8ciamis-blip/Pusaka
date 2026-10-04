import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, FileText, GraduationCap, MessageSquare, Search, Upload } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PublicServices = () => {
  const navigate = useNavigate();

  const { data: settings, isLoading, isError } = useQuery({
    queryKey: ['school-settings-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_settings_public')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
  });

  const hasAnyService = settings?.enable_student_status_check ||
    settings?.enable_activity_permission ||
    settings?.enable_graduation_check ||
    settings?.enable_complaint_channel ||
    settings?.enable_complaint_status_check;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            {settings?.logo_url && (
              <img 
                src={settings.logo_url} 
                alt="Logo" 
                className="h-20 w-20 object-contain"
              />
            )}
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {settings?.school_name || 'Layanan Publik'}
          </h1>
          {settings?.district_name && (
            <p className="text-muted-foreground">{settings.district_name}</p>
          )}
          <p className="text-lg text-muted-foreground mt-4">
            Akses layanan publik sekolah dengan mudah
          </p>
        </div>

        {/* Services Grid */}
        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="text-center text-xl">Pilih Layanan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            )}

            {isError && (
              <div className="text-center py-8 text-destructive">
                Gagal memuat layanan. Silakan refresh halaman.
              </div>
            )}

            {!isLoading && !isError && !hasAnyService && (
              <div className="text-center py-8 text-muted-foreground">
                Belum ada layanan publik yang diaktifkan.
              </div>
            )}

            {/* Student Status Check */}
            {settings?.enable_student_status_check && (
              <Button
                variant={(settings.student_status_check_color as any) || 'outline'}
                className="w-full h-14 text-base justify-start gap-4 hover:scale-[1.01] transition-transform"
                onClick={() => navigate('/cek-status-peserta-didik')}
              >
                <BookOpen className="h-6 w-6" />
                <span className="font-semibold">
                  {settings.student_status_check_text || 'Cek Status Peserta Didik'}
                </span>
              </Button>
            )}

            {/* Parent Permission Portal */}
            {settings?.enable_activity_permission && (
              <Button
                variant={(settings.activity_permission_color as any) || 'outline'}
                className="w-full h-14 text-base justify-start gap-4 hover:scale-[1.01] transition-transform"
                onClick={() => navigate('/surat-izin-orang-tua')}
              >
                <FileText className="h-6 w-6" />
                <span className="font-semibold">
                  {settings.activity_permission_text || 'Surat Izin Orang Tua'}
                </span>
              </Button>
            )}

            {/* Graduation Check */}
            {settings?.enable_graduation_check && (
              <Button
                variant={(settings.graduation_check_color as any) || 'outline'}
                className="w-full h-14 text-base justify-start gap-4 hover:scale-[1.01] transition-transform"
                onClick={() => navigate('/cek-kelulusan')}
              >
                <GraduationCap className="h-6 w-6" />
                <span className="font-semibold">
                  {settings.graduation_check_text || 'Cek Kelulusan'}
                </span>
              </Button>
            )}

            {/* Complaint Channel */}
            {settings?.enable_complaint_channel && (
              <Button
                variant={(settings.complaint_channel_color as any) || 'outline'}
                className="w-full h-14 text-base justify-start gap-4 hover:scale-[1.01] transition-transform"
                onClick={() => navigate('/pengaduan')}
              >
                <MessageSquare className="h-6 w-6" />
                <span className="font-semibold">
                  {settings.complaint_channel_text || 'Pengaduan'}
                </span>
              </Button>
            )}

            {/* Complaint Status Check */}
            {settings?.enable_complaint_status_check && (
              <Button
                variant={(settings.complaint_status_check_color as any) || 'outline'}
                className="w-full h-14 text-base justify-start gap-4 hover:scale-[1.01] transition-transform"
                onClick={() => navigate('/cek-status-pengaduan')}
              >
                <Search className="h-6 w-6" />
                <span className="font-semibold">
                  {settings.complaint_status_check_text || 'Cek Status Pengaduan'}
                </span>
              </Button>
            )}

            {/* Teacher File Upload - Always visible */}
            <Button
              variant="outline"
              className="w-full h-14 text-base justify-start gap-4 hover:scale-[1.01] transition-transform"
              onClick={() => navigate('/upload-berkas-guru')}
            >
              <Upload className="h-6 w-6" />
              <span className="font-semibold">Upload Berkas Guru</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicServices;
