import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Shield, MessageSquare, Lightbulb, ArrowLeft } from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { RECAPTCHA_SITE_KEY } from '@/config/recaptcha';
import { useCaptchaConfig } from '@/hooks/useCaptchaConfig';

export default function Complaints() {
  const navigate = useNavigate();
  const { captchaEnabled } = useCaptchaConfig();
  const [loading, setLoading] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRef, setCaptchaRef] = useState<ReCAPTCHA | null>(null);
  const [formData, setFormData] = useState({
    type: 'kritik',
    title: '',
    description: '',
    reporter_name: '',
    reporter_contact: '',
    is_anonymous: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (captchaEnabled && !captchaToken) {
      toast.error("Silakan verifikasi captcha terlebih dahulu");
      return;
    }
    
    if (!formData.title.trim() || !formData.description.trim()) {
      toast.error('Judul dan deskripsi harus diisi');
      return;
    }

    if (!formData.is_anonymous && (!formData.reporter_name.trim() || !formData.reporter_contact.trim())) {
      toast.error('Nama dan kontak harus diisi jika tidak anonim');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.from('complaints').insert({
        type: formData.type,
        title: formData.title.trim(),
        description: formData.description.trim(),
        reporter_name: formData.is_anonymous ? null : formData.reporter_name.trim(),
        reporter_contact: formData.is_anonymous ? null : formData.reporter_contact.trim(),
        is_anonymous: formData.is_anonymous,
      }).select('tracking_number').single();

      if (error) throw error;

      toast.success('Pengaduan berhasil dikirim');
      setTrackingNumber(data.tracking_number);
      
      // Reset form
      setFormData({
        type: 'kritik',
        title: '',
        description: '',
        reporter_name: '',
        reporter_contact: '',
        is_anonymous: false,
      });
      
      // Reset captcha
      captchaRef?.reset();
      setCaptchaToken(null);
    } catch (error: any) {
      console.error('Error submitting complaint:', error);
      toast.error('Gagal mengirim pengaduan: ' + error.message);
      captchaRef?.reset();
      setCaptchaToken(null);
    } finally {
      setLoading(false);
    }
  };

  const typeIcons = {
    kekerasan: Shield,
    kritik: MessageSquare,
    saran: Lightbulb,
  };

  const typeLabels = {
    kekerasan: 'Pengaduan Kekerasan',
    kritik: 'Kritik',
    saran: 'Saran',
  };

  const typeDescriptions = {
    kekerasan: 'Laporkan kejadian kekerasan fisik, verbal, atau bullying',
    kritik: 'Sampaikan kritik konstruktif untuk perbaikan',
    saran: 'Berikan saran untuk kemajuan sekolah',
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

        {trackingNumber ? (
          <Card className="p-6 md:p-8 border-border/50 shadow-lg">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-primary/10 p-4 rounded-full">
                  <Shield className="h-12 w-12 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-foreground">Pengaduan Berhasil Dikirim</h2>
              <p className="text-muted-foreground">
                Terima kasih atas pengaduan Anda. Nomor pelacakan Anda adalah:
              </p>
              <div className="bg-muted p-4 rounded-lg border border-border">
                <p className="text-xs text-muted-foreground mb-1">Nomor Pelacakan</p>
                <p className="text-2xl font-mono font-bold text-primary">{trackingNumber}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Simpan nomor ini untuk memeriksa status pengaduan Anda
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <Button
                  onClick={() => navigate('/cek-status-pengaduan')}
                  className="flex-1"
                >
                  Cek Status Pengaduan
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setTrackingNumber(null);
                    navigate('/auth');
                  }}
                  className="flex-1"
                >
                  Kembali ke Beranda
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6 md:p-8 border-border/50 shadow-lg">
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              Kanal Pengaduan
            </h1>
            <p className="text-muted-foreground">
              Sampaikan pengaduan kekerasan, kritik, atau saran Anda dengan aman dan terjamin kerahasiaannya
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Type Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Jenis Pengaduan</Label>
              <RadioGroup
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
                className="grid grid-cols-1 md:grid-cols-3 gap-3"
              >
                {(['kekerasan', 'kritik', 'saran'] as const).map((type) => {
                  const Icon = typeIcons[type];
                  return (
                    <Label
                      key={type}
                      htmlFor={type}
                      className={`flex flex-col items-start gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all hover:border-primary/50 ${
                        formData.type === type
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card'
                      }`}
                    >
                      <RadioGroupItem value={type} id={type} className="sr-only" />
                      <Icon className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-semibold text-sm">{typeLabels[type]}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {typeDescriptions[type]}
                        </div>
                      </div>
                    </Label>
                  );
                })}
              </RadioGroup>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Judul Pengaduan *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Masukkan judul pengaduan"
                maxLength={200}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Deskripsi Lengkap *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Jelaskan pengaduan Anda secara lengkap dan detail"
                rows={6}
                maxLength={2000}
                required
              />
              <p className="text-xs text-muted-foreground">
                {formData.description.length}/2000 karakter
              </p>
            </div>

            {/* Anonymous Option */}
            <div className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg border border-border/50">
              <Checkbox
                id="anonymous"
                checked={formData.is_anonymous}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_anonymous: checked as boolean })
                }
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor="anonymous"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Kirim secara anonim
                </Label>
                <p className="text-xs text-muted-foreground">
                  Identitas Anda akan dirahasiakan jika opsi ini dicentang
                </p>
              </div>
            </div>

            {/* Reporter Information */}
            {!formData.is_anonymous && (
              <div className="space-y-4 p-4 bg-card border border-border/50 rounded-lg">
                <h3 className="font-semibold text-sm">Informasi Pelapor</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="reporter_name">Nama Lengkap *</Label>
                  <Input
                    id="reporter_name"
                    value={formData.reporter_name}
                    onChange={(e) =>
                      setFormData({ ...formData, reporter_name: e.target.value })
                    }
                    placeholder="Masukkan nama lengkap"
                    maxLength={100}
                    required={!formData.is_anonymous}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reporter_contact">Kontak (Email/No. HP) *</Label>
                  <Input
                    id="reporter_contact"
                    value={formData.reporter_contact}
                    onChange={(e) =>
                      setFormData({ ...formData, reporter_contact: e.target.value })
                    }
                    placeholder="Masukkan email atau nomor HP"
                    maxLength={100}
                    required={!formData.is_anonymous}
                  />
                </div>
              </div>
            )}

            {/* Captcha */}
            {captchaEnabled && (
              <div className="flex justify-center">
                <ReCAPTCHA
                  ref={(ref) => setCaptchaRef(ref)}
                  sitekey={RECAPTCHA_SITE_KEY}
                  onChange={(token) => setCaptchaToken(token)}
                />
              </div>
            )}

            {/* Submit Button */}
            <div className="flex flex-col gap-3">
              <Button type="submit" size="lg" disabled={loading || (captchaEnabled && !captchaToken)} className="w-full">
                {loading ? 'Mengirim...' : 'Kirim Pengaduan'}
              </Button>
              
              <p className="text-xs text-center text-muted-foreground">
                Pengaduan Anda akan ditinjau oleh pihak sekolah dan dijamin kerahasiaannya
              </p>
            </div>
          </form>
        </Card>
        )}
      </div>
    </div>
  );
}
