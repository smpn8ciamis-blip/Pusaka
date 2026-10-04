import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Setup() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSetup = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/setup-demo-users`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        toast({
          title: 'Setup Berhasil!',
          description: 'User admin dan guru telah dibuat.',
        });
      } else {
        throw new Error(data.error || 'Setup gagal');
      }
    } catch (error: any) {
      toast({
        title: 'Setup Gagal',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Setup Demo Users</CardTitle>
          <CardDescription>
            Buat user demo untuk testing aplikasi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!success ? (
            <>
              <div className="space-y-4">
                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold text-primary">👤 Admin Account</h3>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p>Email: <span className="font-mono text-foreground">admin@sekolah.com</span></p>
                    <p>Password: <span className="font-mono text-foreground">Admin123!</span></p>
                    <p>Role: Administrator dengan akses penuh</p>
                  </div>
                </div>

                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="font-semibold text-primary">👨‍🏫 Guru Account</h3>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p>Email: <span className="font-mono text-foreground">guru@sekolah.com</span></p>
                    <p>Password: <span className="font-mono text-foreground">Guru123!</span></p>
                    <p>Subject: Matematika</p>
                    <p>Role: Teacher dengan akses terbatas</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSetup}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Membuat Users...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Buat Demo Users
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="text-center space-y-4 py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">Setup Berhasil!</h3>
                <p className="text-muted-foreground">
                  User admin dan guru telah dibuat. Silakan login menggunakan credentials di atas.
                </p>
              </div>
              <Button
                onClick={() => navigate('/auth')}
                size="lg"
                className="mt-4"
              >
                Login Sekarang
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}