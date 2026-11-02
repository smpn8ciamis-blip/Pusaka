import { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Mail, Lock, User, BookOpen, FileText, GraduationCap, Search, Eye, EyeOff, ChevronRight, ArrowLeft, ClipboardCheck,
  Shield, AlertCircle, Info, AlertTriangle, CheckCircle, ShieldAlert, School,
} from 'lucide-react';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppFooter } from '@/components/AppFooter';
import ReCAPTCHA from 'react-google-recaptcha';
import { RECAPTCHA_SITE_KEY } from '@/config/recaptcha';
import { useCaptchaConfig } from '@/hooks/useCaptchaConfig';
import { cn } from '@/lib/utils';

const TwoFactorVerify = lazy(() =>
  import('@/components/TwoFactorVerify').then((m) => ({ default: m.TwoFactorVerify })),
);

const ROLES = {
  ADMIN_WEB: 'admin_web', SUPER_ADMIN: 'super_admin', SISWA: 'siswa',
  ADMIN: 'admin', BENDAHARA: 'bendahara',
} as const;
const MFA_REQUIRED_ROLES = [ROLES.ADMIN, ROLES.BENDAHARA];
const ROLE_ROUTES: Record<string, string> = {
  [ROLES.ADMIN_WEB]: '/web-admin',
  [ROLES.SUPER_ADMIN]: '/super-admin',
  [ROLES.SISWA]: '/student-dashboard',
};
const DEFAULT_APP_NAME = 'Sistem Manajemen Sekolah';
const DEFAULT_ROUTE = '/dashboard';

const loginSchema = z.object({
  email: z.string().email({ message: 'Email tidak valid' }),
  password: z.string().min(6, { message: 'Password minimal 6 karakter' }),
});
const signupSchema = loginSchema
  .extend({
    fullName: z.string().min(3, { message: 'Nama lengkap minimal 3 karakter' }),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Password tidak cocok',
    path: ['confirmPassword'],
  });

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'error': return AlertCircle;
    case 'warning': return AlertTriangle;
    case 'success': return CheckCircle;
    default: return Info;
  }
};
/**
 * Nama aplikasi di pengaturan bisa panjang: "PUSAKA NEDELCIS (Pusat Sistem … Non-akademik) SMP NEGERI 8 CIAMIS".
 * Dipecah: judul (besar), keterangan dalam kurung (kecil), dan nama sekolah (satu kali saja).
 */
function splitBrand(appName: string, schoolName?: string | null) {
  const m = appName.match(/^(.*?)\s*\(([^)]*)\)\s*(.*)$/);
  const title = ((m ? m[1] : appName) || appName).trim();
  const note = m ? m[2].trim() : '';
  const tail = m ? m[3].trim() : '';
  const school = (schoolName || tail || '').trim();
  return { title, note, school };
}
const logDev = (...args: unknown[]) => { if (import.meta.env.DEV) console.log(...args); };

// ═════════════════════════════════════════════════════════════
// KOMPONEN KECIL (ringan: tanpa 3D, tanpa blur besar, tanpa animasi berulang)
// ═════════════════════════════════════════════════════════════

/** Kolom isian dengan ikon; kolom password punya tombol tampilkan/sembunyikan. */
function Field({
  id, name, type = 'text', label, placeholder, icon: Icon, autoComplete,
}: {
  id: string; name: string; type?: string; label: string;
  placeholder: string; icon: React.ElementType; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id={id} name={name} type={isPassword && show ? 'text' : type}
          autoComplete={autoComplete} placeholder={placeholder} required
          className={cn('h-11 rounded-lg pl-10 text-base sm:text-sm', isPassword && 'pr-11')}
        />
        {isPassword && (
          <button
            type="button" onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={show}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function SubmitButton({ children, loading, disabled }: { children: React.ReactNode; loading?: boolean; disabled?: boolean }) {
  return (
    <Button type="submit" disabled={disabled || loading} className="mt-1 h-11 w-full rounded-lg text-[15px] font-semibold">
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/70 border-t-transparent" />
          Memproses…
        </span>
      ) : children}
    </Button>
  );
}

function CaptchaField({
  enabled, setCaptchaRef, onChange,
}: {
  enabled: boolean; captchaRef: ReCAPTCHA | null;
  setCaptchaRef: (r: ReCAPTCHA | null) => void;
  onChange: (t: string | null) => void;
}) {
  if (!enabled) return null;
  return (
    <div className="flex justify-center overflow-x-auto py-1">
      <ReCAPTCHA ref={(ref) => setCaptchaRef(ref)} sitekey={RECAPTCHA_SITE_KEY} onChange={onChange} />
    </div>
  );
}

const ACCENT = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  emerald: 'bg-emerald-500/10 text-emerald-600',
  rose: 'bg-rose-500/10 text-rose-600',
  amber: 'bg-amber-500/10 text-amber-600',
} as const;

function ServiceCard({
  icon: Icon, label, description, onClick, accent = 'primary',
}: {
  icon: React.ElementType; label: string; description?: string; onClick: () => void;
  accent?: keyof typeof ACCENT;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', ACCENT[accent])}>
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        {description && <span className="block truncate text-xs text-muted-foreground">{description}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}

function BrandLogos({ left, right, size = 'md' }: { left?: string | null; right?: string | null; size?: 'md' | 'lg' }) {
  if (!left && !right) return null;
  const dim = size === 'lg' ? 'h-20 w-20' : 'h-14 w-14';
  return (
    <div className="flex items-center gap-4">
      {[left, right].filter(Boolean).map((src) => (
        <img key={src as string} src={src as string} alt="" width={80} height={80} decoding="async"
          className={cn(dim, 'rounded-xl bg-white/95 object-contain p-1.5 shadow-sm')} />
      ))}
    </div>
  );
}

/** Judul merek: judul besar, keterangan kecil dalam kurung, lalu nama sekolah satu kali. */
function BrandTitle({ title, note, school, tone = 'default' }: { title: string; note: string; school: string; tone?: 'default' | 'light' }) {
  const light = tone === 'light';
  return (
    <div className={cn(light ? 'space-y-2' : 'space-y-1.5')}>
      <h1 className={cn('font-bold tracking-tight', light ? 'text-4xl leading-tight xl:text-5xl' : 'text-2xl')}>{title}</h1>
      {note && (
        <p className={cn('max-w-[34ch] text-[13px] font-light italic leading-snug tracking-wide', light ? 'text-primary-foreground/80' : 'mx-auto text-muted-foreground')}>
          ({note})
        </p>
      )}
      {school && (
        <p className={cn(
          'text-[11px] font-medium uppercase tracking-[0.2em]',
          light ? 'mt-3 inline-flex rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 text-primary-foreground' : 'pt-1 text-muted-foreground',
        )}>
          {school}
        </p>
      )}
    </div>
  );
}

/** Kerangka halaman: satu footer saja (AppFooter) di dasar layar. */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1">{children}</main>
      <AppFooter />
    </div>
  );
}

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRef, setCaptchaRef] = useState<ReCAPTCHA | null>(null);
  const [showMfaVerify, setShowMfaVerify] = useState(false);
  const [pendingAuthCheck, setPendingAuthCheck] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
  const { signIn, signUp, user } = useAuth();
  const { captchaEnabled } = useCaptchaConfig();
  const navigate = useNavigate();

  const { data: settings, isLoading: isLoadingSettings, isError: isSettingsError, error: settingsError } = useQuery({
    queryKey: ['school-settings-public'],
    queryFn: async () => {
      const { data, error } = await supabase.from('school_settings_public').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
    networkMode: 'online', refetchOnMount: 'always', refetchOnWindowFocus: true,
    retry: 2, staleTime: 60_000, gcTime: 10 * 60_000,
  });

  const { data: loginNotifications } = useQuery({
    queryKey: ['active-login-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase.from('active_login_notifications').select('*');
      if (error) throw error;
      return data || [];
    },
    networkMode: 'online', refetchOnMount: 'always', retry: 2, staleTime: 60_000,
  });

  const { data: lockStatus } = useQuery({
    queryKey: ['account-lock-status'],
    queryFn: async () => {
      const { data, error } = await supabase.from('account_lock_status').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
    networkMode: 'online', refetchOnMount: 'always', retry: 2, staleTime: 30_000,
  });

  const appName = settings?.app_name || DEFAULT_APP_NAME;
  const isSystemLocked = lockStatus?.is_locked || false;

  const routeForRole = useCallback(async (userId: string): Promise<string> => {
    try {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
      return ROLE_ROUTES[data?.role as string] ?? DEFAULT_ROUTE;
    } catch { return DEFAULT_ROUTE; }
  }, []);

  const checkMfaRequired = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles').select('role').eq('user_id', userId).maybeSingle();
      if (roleError || !roleData) return false;
      if (!MFA_REQUIRED_ROLES.includes(roleData.role)) return false;

      const [aalRes, factorsRes] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (aalRes.error || factorsRes.error) return false;
      const hasVerifiedTotp = factorsRes.data?.totp?.some((f) => f.status === 'verified') ?? false;
      if (!hasVerifiedTotp) return false;
      return aalRes.data?.currentLevel === 'aal1' && aalRes.data?.nextLevel === 'aal2';
    } catch (err) { logDev('MFA check err', err); return false; }
  }, []);

  useEffect(() => {
    if (user && !showMfaVerify && !pendingAuthCheck) routeForRole(user.id).then(navigate);
  }, [user, showMfaVerify, pendingAuthCheck, navigate, routeForRole]);

  const resetCaptcha = useCallback(() => {
    captchaRef?.reset();
    setCaptchaToken(null);
  }, [captchaRef]);

  const handleLogin = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSystemLocked) return toast.error('Sistem sedang dikunci. Silakan coba lagi nanti.');
    if (captchaEnabled && !captchaToken) return toast.error('Silakan verifikasi captcha terlebih dahulu');

    const fd = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({ email: fd.get('email'), password: fd.get('password') });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);

    setIsLoading(true); setPendingAuthCheck(true);
    try {
      const { error } = await signIn(parsed.data.email, parsed.data.password);
      if (error) {
        setPendingAuthCheck(false);
        toast.error(error.message.includes('Invalid') ? 'Email atau password salah' : `Gagal login: ${error.message}`);
        resetCaptcha(); return;
      }
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) { toast.error('Sesi tidak valid'); resetCaptcha(); return; }
      const needsMfa = await checkMfaRequired(currentUser.id);
      if (needsMfa) { setShowMfaVerify(true); setPendingAuthCheck(false); return; }
      setPendingAuthCheck(false); resetCaptcha();
      toast.success('Login berhasil!');
      navigate(await routeForRole(currentUser.id));
    } catch (err) {
      setPendingAuthCheck(false);
      toast.error(err instanceof z.ZodError ? err.errors[0].message : 'Terjadi kesalahan tak terduga');
      resetCaptcha();
    } finally { setIsLoading(false); }
  }, [isSystemLocked, captchaEnabled, captchaToken, signIn, checkMfaRequired, resetCaptcha, routeForRole, navigate]);

  const handleMfaVerified = useCallback(async () => {
    setShowMfaVerify(false); toast.success('Login berhasil!');
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) navigate(await routeForRole(u.id));
  }, [navigate, routeForRole]);

  const handleMfaCancel = useCallback(async () => {
    await supabase.auth.signOut();
    setShowMfaVerify(false);
    toast.info('Login dibatalkan');
  }, []);

  const handleSignup = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (captchaEnabled && !captchaToken) return toast.error('Silakan verifikasi captcha terlebih dahulu');

    const fd = new FormData(e.currentTarget);
    const parsed = signupSchema.safeParse({
      email: fd.get('email'), password: fd.get('password'),
      confirmPassword: fd.get('confirmPassword'), fullName: fd.get('fullName'),
    });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);

    setIsLoading(true);
    try {
      const { error } = await signUp(parsed.data.email, parsed.data.password, parsed.data.fullName);
      if (error) {
        toast.error(error.message.includes('already registered') ? 'Email sudah terdaftar' : `Gagal registrasi: ${error.message}`);
        resetCaptcha(); return;
      }
      toast.success('Registrasi berhasil! Silakan login.');
      resetCaptcha();
    } catch (err) {
      toast.error(err instanceof z.ZodError ? err.errors[0].message : 'Terjadi kesalahan tak terduga');
      resetCaptcha();
    } finally { setIsLoading(false); }
  }, [captchaEnabled, captchaToken, signUp, resetCaptcha]);

  const visibleNotifications = useMemo(
    () => (loginNotifications || []).filter((n: { id: string }) => !dismissedNotifications.includes(n.id)),
    [loginNotifications, dismissedNotifications],
  );
  const activeNotification = visibleNotifications[0];

  // ── Layar MFA ──
  if (showMfaVerify) {
    return (
      <AuthShell>
        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-md animate-fade-in">
            <Suspense fallback={null}>
              <TwoFactorVerify onVerified={handleMfaVerified} onCancel={handleMfaCancel} />
            </Suspense>
          </div>
        </div>
      </AuthShell>
    );
  }

  const NotificationIcon = activeNotification
    ? getNotificationIcon(activeNotification.notification_type)
    : Info;

  const brand = splitBrand(appName, settings?.school_name);
  const hasServices = isLoadingSettings || isSettingsError ||
    settings?.enable_student_status_check || settings?.enable_activity_permission ||
    settings?.enable_graduation_check || settings?.enable_complaint_channel ||
    settings?.enable_complaint_status_check;

  // ── Layar utama ──
  return (
    <AuthShell>
      <Helmet>
        <title>Masuk - {brand.title}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Sistem dikunci */}
      {isSystemLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90">
          <Card className="mx-4 max-w-md rounded-2xl border-border/50 shadow-xl">
            <CardHeader>
              <div className="flex items-center gap-3 text-destructive">
                <div className="rounded-xl bg-destructive/10 p-2.5"><ShieldAlert className="h-5 w-5" /></div>
                <CardTitle className="text-lg tracking-tight">Sistem Dikunci</CardTitle>
              </div>
              <CardDescription className="pt-2 text-base leading-relaxed">
                {lockStatus?.lock_message || 'Sistem sedang dalam pemeliharaan. Silakan coba lagi nanti.'}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Pemberitahuan */}
      {activeNotification && !isSystemLocked && (
        <Dialog open onOpenChange={() => {}}>
          <DialogContent className="rounded-2xl sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2"><NotificationIcon className="h-4 w-4 text-primary" /></div>
                {activeNotification.title}
              </DialogTitle>
              <DialogDescription className="pt-2 text-base leading-relaxed">
                {activeNotification.message}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end pt-4">
              <Button className="rounded-lg" onClick={() => setDismissedNotifications((p) => [...p, activeNotification.id])}>
                Saya Mengerti
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <div className="grid w-full lg:grid-cols-2 xl:grid-cols-[1.1fr_1fr]">
        {/* Panel merek (layar lebar): logo, judul, dan keunggulan dikelompokkan rapat di tengah */}
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/70 p-10 text-primary-foreground lg:flex lg:flex-col xl:p-14">
          <div className="pointer-events-none absolute inset-0 opacity-[0.09] [background-image:radial-gradient(circle,#fff_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full bg-white/[0.07]" />
          <div className="pointer-events-none absolute -bottom-36 -left-24 h-[28rem] w-[28rem] rounded-full bg-black/[0.06]" />

          <div className="relative my-auto max-w-lg space-y-6">
            <BrandLogos left={settings?.logo_url} right={settings?.right_logo_url} size="lg" />
            <BrandTitle title={brand.title} note={brand.note} school={brand.school} tone="light" />
            <ul className="grid gap-2.5 pt-3">
              {[
                { icon: GraduationCap, text: 'Akademik, nilai, dan rapor' },
                { icon: ClipboardCheck, text: 'Kehadiran dan jadwal' },
                { icon: FileText, text: 'Layanan dan surat online' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <Link to="/" className="relative inline-flex w-fit items-center gap-2 text-sm text-primary-foreground/85 transition-colors hover:text-primary-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />Kembali ke website sekolah
          </Link>
        </aside>

        {/* Formulir */}
        <section className="flex items-start justify-center bg-muted/40 px-4 py-8 sm:px-8 lg:items-center lg:py-10">
          <div className="w-full max-w-[420px] animate-fade-in space-y-6">
            {/* Kepala merek (ponsel/tablet) */}
            <div className="flex flex-col items-center gap-3 text-center lg:hidden">
              {(settings?.logo_url || settings?.right_logo_url) && (
                <div className="flex items-center gap-4">
                  {[settings?.logo_url, settings?.right_logo_url].filter(Boolean).map((src) => (
                    <img key={src as string} src={src as string} alt="" width={64} height={64} decoding="async" className="h-16 w-16 object-contain" />
                  ))}
                </div>
              )}
              <BrandTitle title={brand.title} note={brand.note} school={brand.school} />
            </div>

            <Card className="rounded-2xl border bg-card shadow-xl shadow-black/5">
              <Tabs defaultValue="login" className="w-full">
                <CardHeader className="space-y-1 px-6 pb-2 pt-6 sm:px-8">
                  <TabsList className="grid h-11 w-full grid-cols-2 rounded-lg p-1">
                    <TabsTrigger value="login" className="rounded-md text-sm">Masuk</TabsTrigger>
                    <TabsTrigger value="signup" className="rounded-md text-sm">Daftar</TabsTrigger>
                  </TabsList>
                </CardHeader>

                <CardContent className="px-6 pb-6 pt-4 sm:px-8 sm:pb-8">
                  <TabsContent value="login" className="mt-0 space-y-4">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">Selamat datang kembali</h2>
                      <p className="text-sm text-muted-foreground">Masuk untuk melanjutkan ke dasbor Anda.</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                      <Field id="login-email" name="email" type="email" label="Email" placeholder="nama@sekolah.com" icon={Mail} autoComplete="email" />
                      <Field id="login-password" name="password" type="password" label="Password" placeholder="Password Anda" icon={Lock} autoComplete="current-password" />
                      <CaptchaField enabled={captchaEnabled} captchaRef={captchaRef} setCaptchaRef={setCaptchaRef} onChange={setCaptchaToken} />
                      <SubmitButton loading={isLoading} disabled={captchaEnabled && !captchaToken}>Masuk ke Sistem</SubmitButton>
                    </form>
                  </TabsContent>

                  <TabsContent value="signup" className="mt-0 space-y-4">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">Buat akun baru</h2>
                      <p className="text-sm text-muted-foreground">Lengkapi data di bawah untuk mendaftar.</p>
                    </div>
                    <form onSubmit={handleSignup} className="space-y-3.5">
                      <Field id="signup-name" name="fullName" label="Nama Lengkap" placeholder="Nama lengkap Anda" icon={User} autoComplete="name" />
                      <Field id="signup-email" name="email" type="email" label="Email" placeholder="nama@sekolah.com" icon={Mail} autoComplete="email" />
                      <Field id="signup-password" name="password" type="password" label="Password" placeholder="Minimal 6 karakter" icon={Lock} autoComplete="new-password" />
                      <Field id="signup-confirm-password" name="confirmPassword" type="password" label="Konfirmasi Password" placeholder="Ketik ulang password" icon={Lock} autoComplete="new-password" />
                      <CaptchaField enabled={captchaEnabled} captchaRef={captchaRef} setCaptchaRef={setCaptchaRef} onChange={setCaptchaToken} />
                      <SubmitButton loading={isLoading} disabled={captchaEnabled && !captchaToken}>Daftar Sekarang</SubmitButton>
                    </form>
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>

            {/* Layanan publik */}
            {hasServices && (
              <section aria-labelledby="layanan-publik" className="space-y-3">
                <h2 id="layanan-publik" className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Layanan Publik
                </h2>
                {isLoadingSettings && !settings && <p className="text-center text-xs text-muted-foreground">Memuat layanan…</p>}
                {isSettingsError && (
                  <p className="text-center text-xs text-destructive">Gagal memuat layanan. {(settingsError as Error)?.message ?? ''}</p>
                )}
                <div className="grid gap-2">
                  {settings?.enable_student_status_check && (
                    <ServiceCard icon={BookOpen} label={settings.student_status_check_text || 'Cek Status Peserta Didik'} description="Status & data peserta didik" accent="primary" onClick={() => navigate('/cek-status-peserta-didik')} />
                  )}
                  {settings?.enable_activity_permission && (
                    <ServiceCard icon={FileText} label={settings.activity_permission_text || 'Portal Izin Kegiatan Siswa'} description="Pengajuan & persetujuan izin" accent="secondary" onClick={() => navigate('/surat-izin-orang-tua')} />
                  )}
                  {settings?.enable_graduation_check && (
                    <ServiceCard icon={GraduationCap} label={settings.graduation_check_text || 'Cek Status Kelulusan'} description="Informasi kelulusan siswa" accent="emerald" onClick={() => navigate('/cek-kelulusan')} />
                  )}
                  {settings?.enable_complaint_channel && (
                    <ServiceCard icon={Shield} label={settings.complaint_channel_text || 'Kanal Pengaduan'} description="Sampaikan laporan & masukan" accent="rose" onClick={() => navigate('/pengaduan')} />
                  )}
                  {settings?.enable_complaint_status_check && (
                    <ServiceCard icon={Search} label={settings.complaint_status_check_text || 'Cek Status Pengaduan'} description="Lacak progres laporan Anda" accent="amber" onClick={() => navigate('/cek-status-pengaduan')} />
                  )}
                </div>
              </section>
            )}

            <div className="flex flex-col items-center gap-2 text-center">
              <button
                type="button" onClick={() => navigate('/daftar-sekolah')}
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <School className="h-3.5 w-3.5" aria-hidden="true" />Daftarkan Sekolah Baru
              </button>
              <Link to="/" className="text-xs text-muted-foreground hover:text-foreground lg:hidden">Kembali ke website sekolah</Link>
            </div>
          </div>
        </section>
      </div>
    </AuthShell>
  );
}
