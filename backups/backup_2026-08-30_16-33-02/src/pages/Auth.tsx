import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Mail, Lock, User, BookOpen, FileText, FileCheck, ClipboardList, Search, LogIn, Shield, GraduationCap, AlertCircle, Info, AlertTriangle, CheckCircle, X, ShieldAlert, School } from 'lucide-react';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppFooter } from '@/components/AppFooter';
import ReCAPTCHA from 'react-google-recaptcha';
import { RECAPTCHA_SITE_KEY } from '@/config/recaptcha';
import { useCaptchaConfig } from '@/hooks/useCaptchaConfig';
import { TwoFactorVerify } from '@/components/TwoFactorVerify';

// Lazy load 3D component
const FloatingShapes3D = lazy(() => import('@/components/3d/FloatingShapes').then(m => ({ default: m.FloatingShapes3D })));

const loginSchema = z.object({
  email: z.string().email({ message: 'Email tidak valid' }),
  password: z.string().min(6, { message: 'Password minimal 6 karakter' }),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().min(3, { message: 'Nama lengkap minimal 3 karakter' }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Password tidak cocok',
  path: ['confirmPassword'],
});

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRef, setCaptchaRef] = useState<ReCAPTCHA | null>(null);
  const [showMfaVerify, setShowMfaVerify] = useState(false);
  const [pendingMfaCheck, setPendingMfaCheck] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
  const { signIn, signUp, user } = useAuth();
  const { captchaEnabled } = useCaptchaConfig();
  const navigate = useNavigate();

  const {
    data: settings,
    isLoading: isLoadingSettings,
    isError: isSettingsError,
    error: settingsError,
  } = useQuery({
    queryKey: ['school-settings-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_settings_public')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    // Override global offlineFirst settings for this public config fetch
    networkMode: 'online',
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const appName = settings?.app_name || 'Sistem Manajemen Sekolah';

  // Fetch login popup notifications
  const { data: loginNotifications } = useQuery({
    queryKey: ['active-login-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('active_login_notifications')
        .select('*');

      if (error) throw error;
      return data || [];
    },
    networkMode: 'online',
    refetchOnMount: 'always',
    retry: 2,
    staleTime: 60 * 1000,
  });

  // Fetch account lock status
  const { data: lockStatus } = useQuery({
    queryKey: ['account-lock-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_lock_status')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    networkMode: 'online',
    refetchOnMount: 'always',
    retry: 2,
    staleTime: 30 * 1000,
  });

  const isSystemLocked = lockStatus?.is_locked || false;

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  // Helper: routing setelah login berdasarkan role
  const routeForRole = async (userId: string): Promise<string> => {
    try {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
      const r = data?.role;
      if (r === 'admin_web') return '/web-admin';
      if (r === 'super_admin') return '/super-admin';
      if (r === 'siswa') return '/student-dashboard';
      return '/dashboard';
    } catch { return '/dashboard'; }
  };

  // Redirect if already logged in and not in MFA flow or pending MFA check
  useEffect(() => {
    if (user && !showMfaVerify && !pendingMfaCheck) {
      routeForRole(user.id).then((p) => navigate(p));
    }
  }, [user, showMfaVerify, pendingMfaCheck, navigate]);

  const checkMfaRequired = async (userId: string): Promise<boolean> => {
    try {
      // Check user role first
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (roleError) {
        console.error('Error fetching role:', roleError);
        return false;
      }

      const role = roleData?.role;
      console.log('User role:', role);
      
      // Only admin and bendahara need 2FA
      if (role !== 'admin' && role !== 'bendahara') {
        console.log('Role does not require MFA');
        return false;
      }

      // Check current AAL first
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      
      if (aalError) {
        console.error('Error getting AAL:', aalError);
        return false;
      }
      
      console.log('Current AAL:', aalData?.currentLevel, 'Next AAL:', aalData?.nextLevel);

      // Check if user has MFA enabled by looking at enrolled factors
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      
      if (factorsError) {
        console.error('Error listing factors:', factorsError);
        return false;
      }

      console.log('TOTP factors:', factorsData?.totp);
      
      const hasVerifiedTotp = factorsData?.totp?.some((f) => f.status === 'verified') ?? false;
      console.log('Has verified TOTP:', hasVerifiedTotp);

      if (!hasVerifiedTotp) {
        // User hasn't set up 2FA yet - allow login but will be prompted in settings
        console.log('No verified TOTP factor, skipping MFA');
        return false;
      }

      // If user has MFA enabled and nextLevel is aal2, they need to verify
      // After password login, currentLevel will be aal1 if MFA is required
      if (aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2') {
        console.log('MFA verification required');
        return true;
      }
      
      // Also check if current level is lower than next level
      if (aalData?.currentLevel === 'aal1' && hasVerifiedTotp) {
        console.log('MFA verification required (has verified TOTP but at aal1)');
        return true;
      }

      console.log('MFA not required');
      return false;
    } catch (err) {
      console.error('Error checking MFA:', err);
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Check if system is locked
    if (isSystemLocked) {
      toast.error('Sistem sedang dikunci. Silakan coba lagi nanti.');
      return;
    }
    
    if (captchaEnabled && !captchaToken) {
      toast.error("Silakan verifikasi captcha terlebih dahulu");
      return;
    }
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      loginSchema.parse({ email, password });
      setIsLoading(true);
      
      // Set pending MFA check BEFORE signIn to prevent redirect
      setPendingMfaCheck(true);
      
      const { error } = await signIn(email, password);
      
      if (error) {
        setPendingMfaCheck(false);
        if (error.message.includes('Invalid')) {
          toast.error('Email atau password salah');
        } else {
          toast.error('Gagal login: ' + error.message);
        }
        captchaRef?.reset();
        setCaptchaToken(null);
        return;
      }
      
      // Get current user to check MFA
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (currentUser) {
        const needsMfa = await checkMfaRequired(currentUser.id);
        
        if (needsMfa) {
          setShowMfaVerify(true);
          setPendingMfaCheck(false);
          return;
        }
      }
      
      setPendingMfaCheck(false);
      toast.success('Login berhasil!');
      navigate(await routeForRole(currentUser!.id));
    } catch (error) {
      setPendingMfaCheck(false);
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      captchaRef?.reset();
      setCaptchaToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaVerified = () => {
    setShowMfaVerify(false);
    toast.success('Login berhasil!');
    navigate('/dashboard');
  };

  const handleMfaCancel = async () => {
    await supabase.auth.signOut();
    setShowMfaVerify(false);
    toast.info('Login dibatalkan');
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (captchaEnabled && !captchaToken) {
      toast.error("Silakan verifikasi captcha terlebih dahulu");
      return;
    }
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const fullName = formData.get('fullName') as string;

    try {
      signupSchema.parse({ email, password, confirmPassword, fullName });
      setIsLoading(true);
      const { error } = await signUp(email, password, fullName);
      
      if (error) {
        if (error.message.includes('already registered')) {
          toast.error('Email sudah terdaftar');
        } else {
          toast.error('Gagal registrasi: ' + error.message);
        }
        captchaRef?.reset();
        setCaptchaToken(null);
        return;
      }
      
      toast.success('Registrasi berhasil! Silakan login.');
      captchaRef?.reset();
      setCaptchaToken(null);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      captchaRef?.reset();
      setCaptchaToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Show MFA verification screen
  if (showMfaVerify) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-background via-muted/5 to-background">
        {/* 3D Background */}
        <Suspense fallback={null}>
          <FloatingShapes3D />
        </Suspense>

        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 -left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-10 -right-20 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* MFA Verification Content */}
        <div className="relative z-10 flex flex-col min-h-screen">
          <div className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
            <div className="w-full max-w-md animate-fade-in">
              <TwoFactorVerify 
                onVerified={handleMfaVerified} 
                onCancel={handleMfaCancel}
              />
            </div>
          </div>
          <AppFooter />
        </div>
      </div>
    );
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'error': return AlertCircle;
      case 'warning': return AlertTriangle;
      case 'success': return CheckCircle;
      default: return Info;
    }
  };

  const getNotificationVariant = (type: string): 'default' | 'destructive' => {
    return type === 'error' ? 'destructive' : 'default';
  };

  const visibleNotifications = (loginNotifications || []).filter(
    (n: any) => !dismissedNotifications.includes(n.id)
  );

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-background via-muted/5 to-background">
      {/* 3D Background */}
      <Suspense fallback={null}>
        <FloatingShapes3D />
      </Suspense>

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 -left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-10 -right-20 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* System Lock Alert */}
      {isSystemLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="max-w-md mx-4">
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-6 w-6" />
                <CardTitle>Sistem Dikunci</CardTitle>
              </div>
              <CardDescription className="text-base">
                {lockStatus?.lock_message || 'Sistem sedang dalam pemeliharaan. Silakan coba lagi nanti.'}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Popup Notifications Dialog */}
      {visibleNotifications.length > 0 && !isSystemLocked && (
        <Dialog open={visibleNotifications.length > 0} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {(() => {
                  const IconComponent = getNotificationIcon(visibleNotifications[0]?.notification_type);
                  return <IconComponent className="h-5 w-5" />;
                })()}
                {visibleNotifications[0]?.title}
              </DialogTitle>
              <DialogDescription className="text-base pt-2">
                {visibleNotifications[0]?.message}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end pt-4">
              <Button 
                onClick={() => setDismissedNotifications(prev => [...prev, visibleNotifications[0]?.id])}
              >
                Saya Mengerti
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen overflow-auto">
        <div className="flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <div className="w-full max-w-md space-y-6 animate-fade-in py-4">
            {/* Logo Section */}
            <div className="flex flex-col items-center gap-6 mb-4">
              {/* Logo Container with enhanced styling */}
              <div className="relative flex items-center justify-center gap-8 sm:gap-12 mb-2">
                {/* Left Logo */}
                {settings?.logo_url && (
                  <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300" />
                    <img 
                      src={settings.logo_url} 
                      alt="Logo Sekolah" 
                      className="relative h-24 w-24 sm:h-28 sm:w-28 object-contain transition-all duration-300 group-hover:scale-110 drop-shadow-2xl"
                    />
                  </div>
                )}
                
                {/* Right Logo */}
                {settings?.right_logo_url && (
                  <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-secondary/20 to-primary/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300" />
                    <img 
                      src={settings.right_logo_url} 
                      alt="Logo Partner" 
                      className="relative h-24 w-24 sm:h-28 sm:w-28 object-contain transition-all duration-300 group-hover:scale-110 drop-shadow-2xl"
                    />
                  </div>
                )}
              </div>
              
              {/* Heading and Subheading */}
              <div className="text-center space-y-3">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight overflow-hidden">
                  <span className="inline-block bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent typing-animation">
                    PUSAKA NEDELCIS
                  </span>
                </h1>
                <div className="flex flex-col gap-2 subheading-fade-in">
                  <div className="h-1 w-24 mx-auto bg-gradient-to-r from-transparent via-primary to-transparent rounded-full" />
                  <p className="text-sm sm:text-base text-muted-foreground font-medium px-4">
                    (Pusat Sistem Administrasi Akademik)
                  </p>
                </div>
              </div>
              
              <style>{`
                @keyframes typing {
                  0%, 100% {
                    width: 0;
                  }
                  20%, 80% {
                    width: 100%;
                  }
                }
                
                @keyframes blink-caret {
                  from, to {
                    border-color: transparent;
                  }
                  50% {
                    border-color: hsl(var(--primary));
                  }
                }
                
                @keyframes subheading-fade-loop {
                  0%, 15% {
                    opacity: 0;
                    transform: translateY(10px);
                  }
                  25%, 75% {
                    opacity: 1;
                    transform: translateY(0);
                  }
                  85%, 100% {
                    opacity: 0;
                    transform: translateY(-10px);
                  }
                }
                
                @keyframes card-slide-down {
                  from {
                    opacity: 0;
                    transform: translateY(-30px) scale(0.95);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                  }
                }
                
                @keyframes bounce-button {
                  0%, 100% {
                    transform: translateY(0);
                  }
                  50% {
                    transform: translateY(-8px);
                  }
                }
                
                .typing-animation {
                  overflow: hidden;
                  border-right: 0.15em solid hsl(var(--primary));
                  white-space: nowrap;
                  animation: 
                    typing 8s steps(16, end) infinite,
                    blink-caret 0.75s step-end infinite;
                }
                
                .subheading-fade-in {
                  opacity: 0;
                  animation: subheading-fade-loop 8s ease-in-out infinite;
                }
                
                .card-slide-in {
                  opacity: 0;
                  animation: card-slide-down 0.8s ease-out 2s forwards;
                }
                
                .button-bounce {
                  animation: bounce-button 2s ease-in-out infinite;
                }
                
                .button-bounce:hover {
                  animation: none;
                }
                
                @keyframes gradient-x {
                  0%, 100% {
                    background-size: 200% 200%;
                    background-position: left center;
                  }
                  50% {
                    background-size: 200% 200%;
                    background-position: right center;
                  }
                }
                
                .animate-gradient-x {
                  animation: gradient-x 3s ease infinite;
                }
              `}</style>
            </div>

            {/* Auth Card with enhanced design */}
            <Card className="relative overflow-hidden backdrop-blur-md bg-card/90 border-border/50 shadow-2xl hover:shadow-primary/5 transition-all duration-300 card-slide-in">
              {/* Card glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
              
              <Tabs defaultValue="login" className="w-full relative z-10">
                <CardHeader className="space-y-5 pb-6">
                  <TabsList className="grid w-full grid-cols-2 bg-muted/30 backdrop-blur-sm p-1 h-12">
                    <TabsTrigger 
                      value="login" 
                      className="data-[state=active]:bg-background data-[state=active]:shadow-lg transition-all duration-200 font-medium"
                    >
                      Masuk
                    </TabsTrigger>
                    <TabsTrigger 
                      value="signup" 
                      className="data-[state=active]:bg-background data-[state=active]:shadow-lg transition-all duration-200 font-medium"
                    >
                      Daftar
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>

                <CardContent className="space-y-6 pt-0 px-6 pb-6">
                  {/* Login Tab */}
                  <TabsContent value="login" className="space-y-5 mt-0">
                    <div className="text-center space-y-1">
                      <CardDescription className="text-base">
                        Selamat datang kembali!
                      </CardDescription>
                      <p className="text-xs text-muted-foreground">
                        Masukkan kredensial untuk mengakses sistem
                      </p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="login-email" className="text-sm font-semibold text-foreground">
                          Email
                        </Label>
                        <div className="relative group">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            id="login-email"
                            name="email"
                            type="email"
                            placeholder="nama@sekolah.com"
                            required
                            className="pl-11 h-12 bg-background/80 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="login-password" className="text-sm font-semibold text-foreground">
                          Password
                        </Label>
                        <div className="relative group">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            id="login-password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            required
                            className="pl-11 h-12 bg-background/80 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                        </div>
                      </div>

                      {captchaEnabled && (
                        <div className="flex justify-center">
                          <ReCAPTCHA
                            ref={(ref) => setCaptchaRef(ref)}
                            sitekey={RECAPTCHA_SITE_KEY}
                            onChange={(token) => setCaptchaToken(token)}
                          />
                        </div>
                      )}

                      <Button 
                        type="submit" 
                        className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary transition-all hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.02] font-semibold button-bounce"
                        disabled={isLoading || (captchaEnabled && !captchaToken)}
                      >
                        {isLoading ? (
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                            Memproses...
                          </div>
                        ) : 'Masuk ke Sistem'}
                      </Button>
                    </form>
                  </TabsContent>

                  {/* Signup Tab */}
                  <TabsContent value="signup" className="space-y-5 mt-0">
                    <div className="text-center space-y-1">
                      <CardDescription className="text-base">
                        Bergabung dengan kami!
                      </CardDescription>
                      <p className="text-xs text-muted-foreground">
                        Buat akun baru untuk menggunakan sistem
                      </p>
                    </div>
                    <form onSubmit={handleSignup} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="signup-name" className="text-sm font-semibold text-foreground">
                          Nama Lengkap
                        </Label>
                        <div className="relative group">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            id="signup-name"
                            name="fullName"
                            type="text"
                            placeholder="Nama lengkap"
                            required
                            className="pl-11 h-12 bg-background/80 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-email" className="text-sm font-semibold text-foreground">
                          Email
                        </Label>
                        <div className="relative group">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            id="signup-email"
                            name="email"
                            type="email"
                            placeholder="nama@sekolah.com"
                            required
                            className="pl-11 h-12 bg-background/80 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-password" className="text-sm font-semibold text-foreground">
                          Password
                        </Label>
                        <div className="relative group">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            id="signup-password"
                            name="password"
                            type="password"
                            placeholder="Minimal 6 karakter"
                            required
                            className="pl-11 h-12 bg-background/80 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-confirm-password" className="text-sm font-semibold text-foreground">
                          Konfirmasi Password
                        </Label>
                        <div className="relative group">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            id="signup-confirm-password"
                            name="confirmPassword"
                            type="password"
                            placeholder="Ketik ulang password"
                            required
                            className="pl-11 h-12 bg-background/80 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          />
                        </div>
                      </div>

                      {captchaEnabled && (
                        <div className="flex justify-center">
                          <ReCAPTCHA
                            ref={(ref) => setCaptchaRef(ref)}
                            sitekey={RECAPTCHA_SITE_KEY}
                            onChange={(token) => setCaptchaToken(token)}
                          />
                        </div>
                      )}

                      <Button 
                        type="submit" 
                        className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary transition-all hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.02] font-semibold"
                        disabled={isLoading || (captchaEnabled && !captchaToken)}
                      >
                        {isLoading ? (
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                            Memproses...
                          </div>
                        ) : 'Daftar Sekarang'}
                      </Button>
                    </form>
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>

            {/* Admin-configured buttons section */}
            {(isLoadingSettings || isSettingsError ||
              settings?.enable_student_status_check ||
              settings?.enable_activity_permission ||
              settings?.enable_graduation_check ||
              settings?.enable_complaint_channel ||
              settings?.enable_complaint_status_check) && (
              <div className="space-y-3 mt-4">
                <p className="text-center text-xs text-muted-foreground font-medium">
                  Layanan Publik
                </p>

                {isLoadingSettings && !settings && (
                  <div className="text-center text-xs text-muted-foreground">
                    Memuat layanan publik...
                  </div>
                )}

                {isSettingsError && (
                  <div className="text-center text-xs text-destructive">
                    Gagal memuat layanan publik. {(settingsError as any)?.message ?? ''}
                  </div>
                )}

                {/* Student Status Check Button */}
                {settings?.enable_student_status_check && (
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-secondary/10 to-primary/10 blur-xl" />
                    <Button
                      variant={(settings.student_status_check_color as any) || 'outline'}
                      className="relative w-full h-12 border-border/50 bg-background/50 backdrop-blur-md hover:bg-accent/50 hover:border-secondary/30 transition-all hover:scale-[1.02] group overflow-hidden"
                      onClick={() => navigate('/cek-status-peserta-didik')}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                      <BookOpen className="mr-2 h-5 w-5 transition-transform group-hover:scale-110 relative z-10" />
                      <span className="relative z-10 text-sm font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-gradient-x">
                        {settings.student_status_check_text || 'Cek Status Peserta Didik'}
                      </span>
                    </Button>
                  </div>
                )}

                {/* Parent Permission Portal Button */}
                {settings?.enable_activity_permission && (
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10 blur-xl" />
                    <Button
                      variant={(settings.activity_permission_color as any) || 'outline'}
                      className="relative w-full h-12 border-border/50 bg-background/50 backdrop-blur-md hover:bg-accent/50 hover:border-primary/30 transition-all hover:scale-[1.02] group overflow-hidden"
                      onClick={() => navigate('/surat-izin-orang-tua')}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                      <FileText className="mr-2 h-5 w-5 transition-transform group-hover:scale-110 relative z-10" />
                      <span className="relative z-10 text-sm font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-gradient-x">
                        {settings.activity_permission_text || 'Portal Izin Kegiatan Siswa'}
                      </span>
                    </Button>
                  </div>
                )}

                {/* Graduation Check Button */}
                {settings?.enable_graduation_check && (
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-emerald-500/20 blur-xl animate-pulse" />
                    <Button
                      variant={(settings.graduation_check_color as any) || 'outline'}
                      className="relative w-full h-12 border-border/50 bg-background/50 backdrop-blur-md hover:bg-accent/50 transition-all duration-300 hover:scale-[1.03] group overflow-hidden"
                      onClick={() => navigate('/cek-kelulusan')}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                      <GraduationCap className="mr-2 h-5 w-5 transition-transform group-hover:scale-110 group-hover:rotate-12 relative z-10" />
                      <span className="relative z-10 text-sm font-bold bg-gradient-to-r from-green-600 via-emerald-500 to-green-600 bg-clip-text text-transparent animate-gradient-x">
                        {settings.graduation_check_text || '🎓 Cek Status Kelulusan'}
                      </span>
                    </Button>
                  </div>
                )}

                {/* Complaints Channel Button */}
                {settings?.enable_complaint_channel && (
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-destructive/30 to-orange-500/30 blur-2xl animate-pulse" />
                    <Button
                      variant={(settings.complaint_channel_color as any) || 'destructive'}
                      className={
                        settings.complaint_channel_color === 'destructive'
                          ? 'relative w-full h-12 bg-gradient-to-r from-destructive via-destructive/90 to-orange-500 hover:from-destructive/90 hover:via-orange-500/90 hover:to-destructive shadow-lg shadow-destructive/30 hover:shadow-xl hover:shadow-destructive/40 transition-all duration-300 hover:scale-[1.03] group overflow-hidden'
                          : 'relative w-full h-12 transition-all duration-300 hover:scale-[1.03] group overflow-hidden'
                      }
                      onClick={() => navigate('/pengaduan')}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                      <Shield className="mr-2 h-5 w-5 transition-transform group-hover:scale-110 group-hover:rotate-12 relative z-10" />
                      <span className="relative z-10 text-sm font-extrabold tracking-wide drop-shadow-lg">
                        {settings.complaint_channel_text || '🔔 Kanal Pengaduan'}
                      </span>
                    </Button>
                  </div>
                )}

                {/* Check Complaint Status Button */}
                {settings?.enable_complaint_status_check && (
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-destructive/10 to-orange-500/10 blur-xl" />
                    <Button
                      variant={(settings.complaint_status_check_color as any) || 'outline'}
                      className="relative w-full h-12 bg-background/50 backdrop-blur-md transition-all hover:scale-[1.02] group overflow-hidden"
                      onClick={() => navigate('/cek-status-pengaduan')}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                      <Search className="mr-2 h-5 w-5 transition-transform group-hover:scale-110 relative z-10" />
                      <span className="relative z-10 text-sm font-bold bg-gradient-to-r from-destructive via-orange-500 to-destructive bg-clip-text text-transparent animate-gradient-x">
                        {settings.complaint_status_check_text || 'Cek Status Pengaduan'}
                      </span>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* School Registration Link */}
            <div className="text-center">
              <Button
                variant="link"
                className="text-sm text-muted-foreground hover:text-primary"
                onClick={() => navigate('/daftar-sekolah')}
              >
                <School className="mr-1.5 h-4 w-4" />
                Daftarkan Sekolah Baru
              </Button>
            </div>

            {/* Footer text */}
            <p className="text-center text-xs text-muted-foreground">
              Platform digital untuk kemudahan manajemen sekolah
            </p>
          </div>
        </div>

        <AppFooter />
      </div>
    </div>
  );
}
