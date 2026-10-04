import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AppFooter } from '@/components/AppFooter';
import { School, User, ArrowLeft, Check, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import { FEATURE_LABELS, formatRupiah } from '@/config/subscriptionPlans';

export default function SchoolRegistration() {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('starter');
  const navigate = useNavigate();
  const { activePlans, isLoading: plansLoading } = useSubscriptionPlans();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const school = {
      name: formData.get('schoolName') as string,
      address: formData.get('schoolAddress') as string,
      phone: formData.get('schoolPhone') as string,
      email: formData.get('schoolEmail') as string,
      npsn: formData.get('npsn') as string,
      selected_plan_key: selectedPlan,
    };
    const admin = {
      fullName: formData.get('adminName') as string,
      email: formData.get('adminEmail') as string,
      password: formData.get('adminPassword') as string,
    };

    if (!school.name || !admin.fullName || !admin.email || !admin.password) {
      toast.error('Semua field wajib harus diisi');
      return;
    }
    if (admin.password.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('register-school', {
        body: { school, admin },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Sekolah berhasil didaftarkan! Menunggu persetujuan Super Admin sebelum dapat digunakan.');
      navigate('/auth');
    } catch (err: any) {
      toast.error('Gagal mendaftarkan sekolah: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-6 animate-fade-in">
          <div className="text-center space-y-2">
            <School className="h-12 w-12 mx-auto text-primary" />
            <h1 className="text-3xl font-bold">Daftarkan Sekolah</h1>
            <p className="text-muted-foreground">Isi data sekolah, pilih paket, dan buat akun admin</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><School className="h-5 w-5" /> Data Sekolah</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Nama Sekolah *</Label><Input name="schoolName" required placeholder="SDN 1 Contoh" /></div>
                <div><Label>NPSN</Label><Input name="npsn" placeholder="12345678" /></div>
                <div><Label>Alamat</Label><Input name="schoolAddress" placeholder="Jl. Pendidikan No. 1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Telepon</Label><Input name="schoolPhone" placeholder="021-1234567" /></div>
                  <div><Label>Email Sekolah</Label><Input name="schoolEmail" type="email" placeholder="info@sekolah.sch.id" /></div>
                </div>
              </CardContent>
            </Card>

            {/* Plan Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Package className="h-5 w-5" /> Pilih Paket Langganan</CardTitle>
                <CardDescription>Pilih paket yang sesuai kebutuhan sekolah Anda</CardDescription>
              </CardHeader>
              <CardContent>
                {plansLoading ? (
                  <div className="text-center py-4 text-muted-foreground">Memuat paket...</div>
                ) : (
                  <RadioGroup value={selectedPlan} onValueChange={setSelectedPlan} className="grid gap-3">
                    {activePlans.map(plan => (
                      <label
                        key={plan.plan_key}
                        className={`flex items-start gap-4 rounded-lg border p-4 cursor-pointer transition-colors ${
                          selectedPlan === plan.plan_key ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                      >
                        <RadioGroupItem value={plan.plan_key} className="mt-1" />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{plan.label}</span>
                            <span className="font-bold text-primary">{formatRupiah(plan.monthly_price)}<span className="text-xs text-muted-foreground font-normal">/bln</span></span>
                          </div>
                          <p className="text-sm text-muted-foreground">{plan.description}</p>
                          <div className="flex flex-wrap gap-1 pt-1">
                            <span className="text-xs text-muted-foreground">Maks {plan.max_students} siswa, {plan.max_teachers} guru</span>
                          </div>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {plan.features.slice(0, 5).map(f => (
                              <Badge key={f} variant="secondary" className="text-xs">{FEATURE_LABELS[f] || f}</Badge>
                            ))}
                            {plan.features.length > 5 && (
                              <Badge variant="outline" className="text-xs">+{plan.features.length - 5} lainnya</Badge>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5" /> Akun Admin</CardTitle>
                <CardDescription>Akun ini akan menjadi administrator utama sekolah</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Nama Lengkap *</Label><Input name="adminName" required placeholder="Nama lengkap admin" /></div>
                <div><Label>Email *</Label><Input name="adminEmail" type="email" required placeholder="admin@sekolah.sch.id" /></div>
                <div><Label>Password *</Label><Input name="adminPassword" type="password" required placeholder="Minimal 6 karakter" /></div>
              </CardContent>
            </Card>

            <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 p-4 text-sm text-muted-foreground">
              <strong className="text-foreground">⚠️ Perhatian:</strong> Setelah pendaftaran, sekolah Anda akan menunggu persetujuan dari Super Admin sebelum dapat digunakan. Anda akan dihubungi setelah akun diaktifkan.
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Mendaftarkan...' : 'Daftarkan Sekolah'}
            </Button>
          </form>

          <div className="text-center">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke halaman login
            </Link>
          </div>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
