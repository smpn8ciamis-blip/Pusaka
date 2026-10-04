import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus, ArrowLeft, GraduationCap } from "lucide-react";
import ReCAPTCHA from "react-google-recaptcha";
import { RECAPTCHA_SITE_KEY } from "@/config/recaptcha";
import { useCaptchaConfig } from "@/hooks/useCaptchaConfig";

const StudentSelfRegister = () => {
  const navigate = useNavigate();
  const { captchaEnabled } = useCaptchaConfig();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'verify' | 'register'>('verify');
  const [nis, setNis] = useState("");
  const [verifiedStudent, setVerifiedStudent] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaVerified, setCaptchaVerified] = useState(false);

  const handleCaptchaChange = (value: string | null) => {
    setCaptchaVerified(!!value);
  };

  const handleVerifyNis = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nis.trim()) {
      toast({
        title: "Error",
        description: "Masukkan NIS Anda",
        variant: "destructive"
      });
      return;
    }

    if (captchaEnabled && !captchaVerified) {
      toast({
        title: "Error",
        description: "Silakan verifikasi CAPTCHA terlebih dahulu",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // Check if student exists
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id, full_name, nis, class_id, is_alumni')
        .eq('nis', nis.trim())
        .maybeSingle();

      if (studentError) throw studentError;

      if (!student) {
        toast({
          title: "Tidak Ditemukan",
          description: "NIS tidak ditemukan dalam database",
          variant: "destructive"
        });
        return;
      }

      if (student.is_alumni) {
        toast({
          title: "Tidak Dapat Mendaftar",
          description: "Siswa alumni tidak dapat membuat akun",
          variant: "destructive"
        });
        return;
      }

      // Check if student already has an account
      const { data: existingAccount } = await supabase
        .from('student_accounts')
        .select('id')
        .eq('student_id', student.id)
        .maybeSingle();

      if (existingAccount) {
        toast({
          title: "Akun Sudah Ada",
          description: "Siswa ini sudah memiliki akun. Silakan login atau hubungi admin.",
          variant: "destructive"
        });
        return;
      }

      setVerifiedStudent(student);
      setStep('register');

    } catch (error: any) {
      console.error('Error verifying NIS:', error);
      toast({
        title: "Error",
        description: error.message || "Gagal memverifikasi NIS",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password || !confirmPassword) {
      toast({
        title: "Error",
        description: "Semua field harus diisi",
        variant: "destructive"
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Password tidak sama",
        variant: "destructive"
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Error",
        description: "Password minimal 6 karakter",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/student-dashboard`,
          data: {
            full_name: verifiedStudent.full_name
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Gagal membuat akun");

      // Assign siswa role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: authData.user.id,
          role: 'siswa'
        });

      if (roleError) throw roleError;

      // Link student to user account
      const { error: linkError } = await supabase
        .from('student_accounts')
        .insert({
          user_id: authData.user.id,
          student_id: verifiedStudent.id
        });

      if (linkError) throw linkError;

      toast({
        title: "Berhasil",
        description: "Akun berhasil dibuat! Silakan login."
      });

      navigate('/auth');

    } catch (error: any) {
      console.error('Error creating account:', error);
      toast({
        title: "Error",
        description: error.message || "Gagal membuat akun",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <GraduationCap className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Registrasi Akun Siswa</CardTitle>
            <CardDescription>
              {step === 'verify' 
                ? 'Verifikasi NIS Anda untuk membuat akun' 
                : `Halo ${verifiedStudent?.full_name}, lengkapi data akun Anda`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'verify' ? (
              <form onSubmit={handleVerifyNis} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nis">Nomor Induk Siswa (NIS)</Label>
                  <Input
                    id="nis"
                    type="text"
                    placeholder="Masukkan NIS Anda"
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                    required
                  />
                </div>

                {captchaEnabled && (
                  <div className="flex justify-center">
                    <ReCAPTCHA
                      sitekey={RECAPTCHA_SITE_KEY}
                      onChange={handleCaptchaChange}
                    />
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading || (captchaEnabled && !captchaVerified)}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Memverifikasi...
                    </>
                  ) : (
                    "Verifikasi NIS"
                  )}
                </Button>

                <div className="text-center">
                  <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                    <ArrowLeft className="h-3 w-3" />
                    Kembali ke Login
                  </Link>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">{verifiedStudent?.full_name}</p>
                  <p className="text-xs text-muted-foreground">NIS: {verifiedStudent?.nis}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@siswa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Minimal 6 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Ulangi password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setStep('verify')}
                    disabled={isLoading}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Membuat Akun...
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Buat Akun
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentSelfRegister;
