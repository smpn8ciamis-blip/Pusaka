import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus, Shield, FileText, Users, Vote } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';

type StaffRole = 'bendahara' | 'tata_usaha' | 'kesiswaan' | 'polling' | 'billing' | 'guru_piket' | 'pembina_ekskul';

const roleLabels: Record<StaffRole, { label: string; description: string; icon: React.ReactNode }> = {
  bendahara: {
    label: 'Bendahara',
    description: 'Akses ke RKAS, SPJ, Surat Tugas, SPPD, dan Kwitansi',
    icon: <Shield className="h-4 w-4" />,
  },
  tata_usaha: {
    label: 'Tata Usaha',
    description: 'Akses ke Surat Tugas, SPPD, Kwitansi, dan Surat Masuk/Keluar',
    icon: <FileText className="h-4 w-4" />,
  },
  kesiswaan: {
    label: 'Kesiswaan',
    description: 'Full akses ke Absensi, Poin Pelanggaran, dan Prestasi Siswa',
    icon: <Users className="h-4 w-4" />,
  },
  guru_piket: {
    label: 'Guru Piket',
    description: 'Full akses Absensi semua kelas, Dispensasi Siswa, dan Cetak Surat',
    icon: <Users className="h-4 w-4" />,
  },
  pembina_ekskul: {
    label: 'Pembina Ekstrakurikuler',
    description: 'Mengisi jurnal ekskul (CRUD + foto kegiatan) dan mengelola anggota ekskul yang dibina',
    icon: <Users className="h-4 w-4" />,
  },
  polling: {
    label: 'Polling',
    description: 'Akses ke manajemen polling dan data guru untuk kandidat',
    icon: <Vote className="h-4 w-4" />,
  },
  billing: {
    label: 'Billing',
    description: 'Akses ke manajemen notifikasi popup login dan penguncian akun',
    icon: <Shield className="h-4 w-4" />,
  },
};

export default function StaffRegistration() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: '' as StaffRole | '',
  });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.role) {
      toast({
        title: 'Error',
        description: 'Pilih role terlebih dahulu',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      // Get current session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Session tidak ditemukan. Silakan login ulang.');
      }

      // Use edge function to create staff with service role
      const response = await supabase.functions.invoke('create-staff', {
        body: {
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          role: formData.role,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Gagal membuat akun staff');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: 'Berhasil',
        description: `Akun ${roleLabels[formData.role].label} berhasil dibuat`,
      });

      setFormData({ email: '', password: '', fullName: '', role: '' });
    } catch (error: any) {
      console.error('Error creating staff user:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal membuat akun',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Registrasi Akun Staff
            </CardTitle>
            <CardDescription>
              Buat akun baru untuk staff sekolah (Bendahara, Tata Usaha, atau Kesiswaan)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: StaffRole) =>
                    setFormData({ ...formData, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih role" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(roleLabels) as StaffRole[]).map((role) => (
                      <SelectItem key={role} value={role}>
                        <div className="flex items-center gap-2">
                          {roleLabels[role].icon}
                          <span>{roleLabels[role].label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.role && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {roleLabels[formData.role].description}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Nama Lengkap</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Masukkan nama lengkap"
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimal 6 karakter"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  required
                  minLength={6}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading || !formData.role}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Membuat Akun...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Buat Akun Staff
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
