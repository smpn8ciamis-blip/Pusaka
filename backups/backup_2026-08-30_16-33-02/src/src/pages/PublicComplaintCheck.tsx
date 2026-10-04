import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, ArrowLeft, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { RECAPTCHA_SITE_KEY } from '@/config/recaptcha';
import { useCaptchaConfig } from '@/hooks/useCaptchaConfig';

export default function PublicComplaintCheck() {
  const navigate = useNavigate();
  const { captchaEnabled } = useCaptchaConfig();
  const [trackingNumber, setTrackingNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [complaint, setComplaint] = useState<any>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRef, setCaptchaRef] = useState<ReCAPTCHA | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (captchaEnabled && !captchaToken) {
      toast.error("Silakan verifikasi captcha terlebih dahulu");
      return;
    }
    
    if (!trackingNumber.trim()) {
      toast.error('Masukkan nomor pelacakan');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('complaints')
        .select('*')
        .eq('tracking_number', trackingNumber.trim().toUpperCase())
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast.error('Pengaduan tidak ditemukan');
        setComplaint(null);
      } else {
        setComplaint(data);
      }
    } catch (error: any) {
      console.error('Error fetching complaint:', error);
      toast.error('Gagal mencari pengaduan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: 'Menunggu', variant: 'secondary' as const, icon: Clock },
      in_review: { label: 'Sedang Ditinjau', variant: 'default' as const, icon: AlertCircle },
      resolved: { label: 'Selesai', variant: 'default' as const, icon: CheckCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const typeLabels = {
    kekerasan: 'Pengaduan Kekerasan',
    kritik: 'Kritik',
    saran: 'Saran',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/auth')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Kembali
        </Button>

        <Card className="p-6 md:p-8 border-border/50 shadow-lg">
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              Cek Status Pengaduan
            </h1>
            <p className="text-muted-foreground">
              Masukkan nomor pelacakan pengaduan Anda untuk melihat statusnya
            </p>
          </div>

          <form onSubmit={handleSearch} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="tracking">Nomor Pelacakan</Label>
              <div className="flex gap-2">
                <Input
                  id="tracking"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value.toUpperCase())}
                  placeholder="CP-YYYYMMDD-XXXXX"
                  maxLength={50}
                  className="font-mono"
                />
                <Button type="submit" disabled={loading || (captchaEnabled && !captchaToken)}>
                  <Search className="h-4 w-4 mr-2" />
                  {loading ? 'Mencari...' : 'Cari'}
                </Button>
              </div>
            </div>
            
            {captchaEnabled && (
              <div className="flex justify-center mt-4">
                <ReCAPTCHA
                  ref={(ref) => setCaptchaRef(ref)}
                  sitekey={RECAPTCHA_SITE_KEY}
                  onChange={(token) => setCaptchaToken(token)}
                />
              </div>
            )}
          </form>

          {complaint && (
            <div className="mt-8 space-y-6 pt-6 border-t border-border">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-1">
                    {complaint.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {typeLabels[complaint.type as keyof typeof typeLabels]}
                  </p>
                </div>
                {getStatusBadge(complaint.status)}
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-semibold">Deskripsi</Label>
                  <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                    {complaint.description}
                  </p>
                </div>

                {!complaint.is_anonymous && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {complaint.reporter_name && (
                      <div>
                        <Label className="text-sm font-semibold">Nama Pelapor</Label>
                        <p className="mt-1 text-muted-foreground">{complaint.reporter_name}</p>
                      </div>
                    )}
                    {complaint.reporter_contact && (
                      <div>
                        <Label className="text-sm font-semibold">Kontak</Label>
                        <p className="mt-1 text-muted-foreground">{complaint.reporter_contact}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Tanggal Pengaduan</Label>
                    <p className="mt-1 text-muted-foreground">
                      {new Date(complaint.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  {complaint.response_date && (
                    <div>
                      <Label className="text-sm font-semibold">Tanggal Ditanggapi</Label>
                      <p className="mt-1 text-muted-foreground">
                        {new Date(complaint.response_date).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  )}
                </div>

                {complaint.response_notes && (
                  <div className="p-4 bg-muted/50 rounded-lg border border-border">
                    <Label className="text-sm font-semibold">Tanggapan</Label>
                    <p className="mt-2 text-muted-foreground whitespace-pre-wrap">
                      {complaint.response_notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
