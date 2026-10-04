import { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Mail, Lock, User, BookOpen, FileText, GraduationCap, Search,
  Shield, AlertCircle, Info, AlertTriangle, CheckCircle, ShieldAlert, School, Sparkles,
} from 'lucide-react';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppFooter } from '@/components/AppFooter';
import ReCAPTCHA from 'react-google-recaptcha';
import { RECAPTCHA_SITE_KEY } from '@/config/recaptcha';
import { useCaptchaConfig } from '@/hooks/useCaptchaConfig';
import { cn } from '@/lib/utils';

const FloatingShapes3D = lazy(() =>
  import('@/components/3d/FloatingShapes').then((m) => ({ default: m.FloatingShapes3D })),
);
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
const logDev = (...args: unknown[]) => { if (import.meta.env.DEV) console.log(...args); };

// ═════════════════════════════════════════════════════════════
// LUXURY ATOMS
// ═════════════════════════════════════════════════════════════

/**
 * LuxuryInput — input dengan border gradient gold saat focus.
 */
function LuxuryInput({
  id, name, type = 'text', label, placeholder, icon: Icon, autoComplete, required = true,
}: {
  id: string; name: string; type?: string; label: string;
  placeholder: string; icon: React.ElementType;
  autoComplete?: string; required?: boolean;
}) {
  return (
    <div className="space-y-2 group/field">
      <Label
        htmlFor={id}
        className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 transition-colors group-focus-within/field:text-primary"
      >
        <span className="h-px w-3 bg-muted-foreground/30 transition-all duration-500 group-focus-within/field:w-5 group-focus-within/field:bg-primary/60" />
        {label}
      </Label>

      <div className="relative">
        {/* Animated focus ring */}
        <div className="pointer-events-none absolute -inset-px rounded-xl opacity-0 group-focus-within/field:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/40 via-primary/20 to-primary/40 blur-[2px]" />
        </div>

        <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center pointer-events-none z-10">
          <Icon className="h-[17px] w-[17px] text-muted-foreground/50 transition-all duration-500 group-focus-within/field:text-primary group-focus-within/field:scale-110 group-focus-within/field:drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]" />
        </div>

        <Input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          className={cn(
            'relative pl-12 h-13 rounded-xl text-[15px]',
            'bg-gradient-to-b from-muted/20 to-muted/10 border border-border/50',
            'hover:border-border/70 hover:bg-muted/25',
            'focus:bg-background/80 focus:border-primary/50 focus:ring-0 focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]',
            'placeholder:text-muted-foreground/35 placeholder:font-light',
            'transition-all duration-500',
          )}
        />
      </div>
    </div>
  );
}

/**
 * LuxuryButton — tombol utama dengan sheen & depth.
 */
function LuxuryButton({
  children, loading, disabled, type = 'submit',
}: {
  children: React.ReactNode; loading?: boolean; disabled?: boolean;
  type?: 'submit' | 'button';
}) {
  return (
    <Button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'relative w-full h-12 mt-2 rounded-xl overflow-hidden group/btn',
        'font-semibold tracking-tight text-[15px]',
        'bg-gradient-to-b from-primary to-primary/85 text-primary-foreground',
        'border border-primary/40',
        'shadow-[0_1px_0_0_hsl(var(--primary-foreground)/0.15)_inset,0_8px_24px_-8px_hsl(var(--primary)/0.45)]',
        'hover:shadow-[0_1px_0_0_hsl(var(--primary-foreground)/0.2)_inset,0_12px_32px_-8px_hsl(var(--primary)/0.6)]',
        'hover:-translate-y-px active:translate-y-0 active:shadow-md',
        'transition-all duration-300',
        'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0',
      )}
    >
      {/* Top sheen */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
      {/* Sliding shine */}
      <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      <span className="relative z-10 flex items-center justify-center gap-2">
        {loading ? (
          <>
            <span className="h-4 w-4 border-2 border-primary-foreground/70 border-t-transparent rounded-full animate-spin" />
            Memproses…
          </>
        ) : children}
      </span>
    </Button>
  );
}

/**
 * CaptchaField
 */
function CaptchaField({
  enabled, setCaptchaRef, onChange,
}: {
  enabled: boolean; captchaRef: ReCAPTCHA | null;
  setCaptchaRef: (r: ReCAPTCHA | null) => void;
  onChange: (t: string | null) => void;
}) {
  if (!enabled) return null;
  return (
    <div className="flex justify-center py-1">
      <ReCAPTCHA
        ref={(ref) => setCaptchaRef(ref)}
        sitekey={RECAPTCHA_SITE_KEY}
        onChange={onChange}
      />
    </div>
  );
}

/**
 * LuxuryServiceCard — kartu layanan mewah dengan icon medal.
 */
function LuxuryServiceCard({
  icon: Icon, label, description, onClick, accent = 'primary',
}: {
  icon: React.ElementType; label: string; description?: string;
  onClick: () => void;
  accent?: 'primary' | 'secondary' | 'emerald' | 'rose' | 'amber';
}) {
  const A = {
    primary:   { grad: 'from-primary/15 to-primary/[0.02]',     ring: 'group-hover:ring-primary/40',   icon: 'text-primary',   glow: 'shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_8px_24px_-8px_hsl(var(--primary)/0.35)]' },
    secondary: { grad: 'from-secondary/15 to-secondary/[0.02]', ring: 'group-hover:ring-secondary/40', icon: 'text-secondary', glow: 'shadow-[0_0_0_1px_hsl(var(--secondary)/0.15),0_8px_24px_-8px_hsl(var(--secondary)/0.35)]' },
    emerald:   { grad: 'from-emerald-500/15 to-emerald-500/[0.02]', ring: 'group-hover:ring-emerald-500/40', icon: 'text-emerald-500', glow: 'shadow-[0_0_0_1px_rgb(16_185_129_/_0.15),0_8px_24px_-8px_rgb(16_185_129_/_0.35)]' },
    rose:      { grad: 'from-rose-500/15 to-rose-500/[0.02]',   ring: 'group-hover:ring-rose-500/40',   icon: 'text-rose-500',   glow: 'shadow-[0_0_0_1px_rgb(244_63_94_/_0.15),0_8px_24px_-8px_rgb(244_63_94_/_0.35)]' },
    amber:     { grad: 'from-amber-500/15 to-amber-500/[0.02]', ring: 'group-hover:ring-amber-500/40',  icon: 'text-amber-500',  glow: 'shadow-[0_0_0_1px_rgb(245_158_11_/_0.15),0_8px_24px_-8px_rgb(245_158_11_/_0.35)]' },
  }[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full rounded-xl overflow-hidden',
        'bg-gradient-to-br from-card/70 to-card/40 backdrop-blur-md',
        'border border-border/40 ring-1 ring-transparent',
        'ring-inset',
        A.ring,
        'hover:border-border/60',
        'transition-all duration-500 hover:-translate-y-0.5',
      )}
    >
      {/* Accent gradient wash */}
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500', A.grad)} />
      {/* Diagonal shine */}
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1100ms] bg-gradient-to-r from-transparent via-white/8 to-transparent" />

      <div className="relative flex items-center gap-3.5 px-4 py-3.5">
        {/* Icon in medallion */}
        <div
          className={cn(
            'relative h-10 w-10 shrink-0 rounded-xl flex items-center justify-center',
            'bg-gradient-to-br from-background/90 to-muted/40',
            'border border-border/40',
            'transition-all duration-500 group-hover:scale-105',
            A.glow,
          )}
        >
          <Icon className={cn('h-[18px] w-[18px] transition-all duration-500 group-hover:scale-110', A.icon)} />
        </div>

        <div className="flex-1 min-w-0 text-left">
          <p className="text-[14px] font-semibold tracking-tight text-foreground/90 truncate">
            {label}
          </p>
          {description && (
            <p className="text-[11.5px] text-muted-foreground/60 truncate font-light">
              {description}
            </p>
          )}
        </div>

        {/* Chevron */}
        <div className="shrink-0 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-500">
          <svg viewBox="0 0 16 16" fill="none" className={cn('h-4 w-4', A.icon)}>
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </button>
  );
}

// ═════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════
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

  useEffect(() => { document.title = appName; }, [appName]);

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

  // ── MFA Screen ──
  if (showMfaVerify) {
    return (
      <LuxuryShell>
        <div className="w-full max-w-md animate-fade-in">
          <Suspense fallback={null}>
            <TwoFactorVerify onVerified={handleMfaVerified} onCancel={handleMfaCancel} />
          </Suspense>
        </div>
      </LuxuryShell>
    );
  }

  const NotificationIcon = activeNotification
    ? getNotificationIcon(activeNotification.notification_type)
    : Info;

  // ── Main Screen ──
  return (
    <LuxuryShell>
      {/* Lock */}
      {isSystemLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
          <Card className="max-w-md mx-4 border-border/50 shadow-2xl rounded-2xl">
            <CardHeader>
              <div className="flex items-center gap-3 text-destructive">
                <div className="p-2.5 rounded-xl bg-destructive/10 ring-1 ring-destructive/20">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg tracking-tight">Sistem Dikunci</CardTitle>
              </div>
              <CardDescription className="text-base pt-2 leading-relaxed">
                {lockStatus?.lock_message || 'Sistem sedang dalam pemeliharaan. Silakan coba lagi nanti.'}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Notifications */}
      {activeNotification && !isSystemLocked && (
        <Dialog open onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md border-border/50 rounded-2xl" onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/20">
                  <NotificationIcon className="h-4 w-4 text-primary" />
                </div>
                {activeNotification.title}
              </DialogTitle>
              <DialogDescription className="text-base pt-2 leading-relaxed">
                {activeNotification.message}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end pt-4">
              <Button className="rounded-xl" onClick={() => setDismissedNotifications((p) => [...p, activeNotification.id])}>
                Saya Mengerti
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen overflow-auto">
        <div className="flex-1 flex items-start sm:items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          <div className="w-full max-w-[460px] space-y-8 animate-fade-in py-4">

            {/* ─── Brand ─── */}
            <div className="flex flex-col items-center text-center space-y-6">
              {(settings?.logo_url || settings?.right_logo_url) && (
                <div className="relative flex items-center justify-center gap-8 sm:gap-12">
                  {/* halo */}
                  <div className="absolute inset-0 -m-6 rounded-full bg-gradient-to-r from-primary/10 via-transparent to-secondary/10 blur-3xl" />
                  {settings?.logo_url && <LuxuryLogo src={settings.logo_url} alt="Logo Sekolah" />}
                  {settings?.right_logo_url && <LuxuryLogo src={settings.right_logo_url} alt="Logo Partner" />}
                </div>
              )}

              <div className="space-y-4">
                <h1 className="text-[28px] sm:text-[34px] font-bold tracking-[-0.02em] leading-none">
                  <span className="bg-gradient-to-b from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
                    PUSAKA NEDELCIS
                  </span>
                </h1>

                <div className="flex items-center justify-center gap-3">
                  <span className="h-px w-10 bg-gradient-to-r from-transparent via-primary/40 to-primary/60" />
                  <span className="h-1 w-1 rounded-full bg-primary/60" />
                  <p className="text-[10.5px] uppercase tracking-[0.28em] text-muted-foreground/70 font-medium">
                    Sistem Administrasi Akademik
                  </p>
                  <span className="h-1 w-1 rounded-full bg-primary/60" />
                  <span className="h-px w-10 bg-gradient-to-l from-transparent via-primary/40 to-primary/60" />
                </div>
              </div>
            </div>

            {/* ─── Card ─── */}
            <div className="relative">
              {/* Ambient glow behind card */}
              <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-b from-primary/[0.08] via-transparent to-secondary/[0.05] blur-2xl pointer-events-none" />

              <Card
                className={cn(
                  'relative overflow-hidden rounded-[22px]',
                  'bg-card/70 backdrop-blur-2xl',
                  'border border-white/5 dark:border-white/10',
                  'shadow-[0_1px_0_0_hsl(var(--border)/0.6)_inset,0_20px_60px_-20px_rgba(0,0,0,0.25),0_8px_30px_-10px_rgba(0,0,0,0.15)]',
                  'transition-all duration-500',
                )}
              >
                {/* Gold hairline top */}
                <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
                {/* Corner accents */}
                <div className="absolute top-0 left-0 h-8 w-8 border-l border-t border-primary/20 rounded-tl-[22px] pointer-events-none" />
                <div className="absolute top-0 right-0 h-8 w-8 border-r border-t border-primary/20 rounded-tr-[22px] pointer-events-none" />
                {/* Inner sheen */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent pointer-events-none" />

                <Tabs defaultValue="login" className="w-full relative z-10">
                  <CardHeader className="space-y-5 pb-2 pt-7 px-7">
                    <TabsList
                      className={cn(
                        'grid w-full grid-cols-2 h-11 p-1 rounded-xl',
                        'bg-muted/30 backdrop-blur-sm border border-border/30',
                        'shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]',
                      )}
                    >
                      {(['login', 'signup'] as const).map((v) => (
                        <TabsTrigger
                          key={v}
                          value={v}
                          className={cn(
                            'rounded-lg text-[13px] font-medium tracking-tight transition-all duration-300',
                            'text-muted-foreground/70 hover:text-foreground',
                            'data-[state=active]:text-foreground',
                            'data-[state=active]:bg-background',
                            'data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_hsl(var(--border)/0.6)]',
                          )}
                        >
                          {v === 'login' ? 'Masuk' : 'Daftar'}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </CardHeader>

                  <CardContent className="pt-4 px-7 pb-7">
                    {/* LOGIN */}
                    <TabsContent value="login" className="space-y-5 mt-0 animate-fade-in">
                      <div className="text-center space-y-1 pb-1">
                        <p className="text-[15px] text-foreground/90 font-medium tracking-tight">
                          Selamat datang kembali
                        </p>
                        <p className="text-xs text-muted-foreground/60 font-light">
                          Masuk untuk melanjutkan ke dasbor Anda
                        </p>
                      </div>

                      <form onSubmit={handleLogin} className="space-y-4">
                        <LuxuryInput id="login-email" name="email" type="email" label="Email" placeholder="nama@sekolah.com" icon={Mail} autoComplete="email" />
                        <LuxuryInput id="login-password" name="password" type="password" label="Password" placeholder="••••••••" icon={Lock} autoComplete="current-password" />
                        <CaptchaField enabled={captchaEnabled} captchaRef={captchaRef} setCaptchaRef={setCaptchaRef} onChange={setCaptchaToken} />
                        <LuxuryButton loading={isLoading} disabled={captchaEnabled && !captchaToken}>
                          Masuk ke Sistem
                        </LuxuryButton>
                      </form>
                    </TabsContent>

                    {/* SIGNUP */}
                    <TabsContent value="signup" className="space-y-5 mt-0 animate-fade-in">
                      <div className="text-center space-y-1 pb-1">
                        <p className="text-[15px] text-foreground/90 font-medium tracking-tight">
                          Buat akun baru
                        </p>
                        <p className="text-xs text-muted-foreground/60 font-light">
                          Lengkapi data di bawah untuk mendaftar
                        </p>
                      </div>

                      <form onSubmit={handleSignup} className="space-y-3.5">
                        <LuxuryInput id="signup-name" name="fullName" label="Nama Lengkap" placeholder="Nama lengkap Anda" icon={User} autoComplete="name" />
                        <LuxuryInput id="signup-email" name="email" type="email" label="Email" placeholder="nama@sekolah.com" icon={Mail} autoComplete="email" />
                        <LuxuryInput id="signup-password" name="password" type="password" label="Password" placeholder="Minimal 6 karakter" icon={Lock} autoComplete="new-password" />
                        <LuxuryInput id="signup-confirm-password" name="confirmPassword" type="password" label="Konfirmasi Password" placeholder="Ketik ulang password" icon={Lock} autoComplete="new-password" />
                        <CaptchaField enabled={captchaEnabled} captchaRef={captchaRef} setCaptchaRef={setCaptchaRef} onChange={setCaptchaToken} />
                        <LuxuryButton loading={isLoading} disabled={captchaEnabled && !captchaToken}>
                          Daftar Sekarang
                        </LuxuryButton>
                      </form>
                    </TabsContent>
                  </CardContent>
                </Tabs>
              </Card>
            </div>

            {/* ─── Public Services ─── */}
            {(isLoadingSettings || isSettingsError ||
              settings?.enable_student_status_check || settings?.enable_activity_permission ||
              settings?.enable_graduation_check || settings?.enable_complaint_channel ||
              settings?.enable_complaint_status_check) && (
              <div className="space-y-4 pt-1">
                <div className="flex items-center gap-4">
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border/60" />
                  <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-muted-foreground/60 font-semibold">
                    <Sparkles className="h-3 w-3 text-primary/60" />
                    Layanan Publik
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border/60" />
                </div>

                {isLoadingSettings && !settings && (
                  <p className="text-center text-xs text-muted-foreground/60 font-light">Memuat layanan…</p>
                )}
                {isSettingsError && (
                  <p className="text-center text-xs text-destructive/70">
                    Gagal memuat layanan. {(settingsError as Error)?.message ?? ''}
                  </p>
                )}

                <div className="grid gap-2.5">
                  {settings?.enable_student_status_check && (
                    <LuxuryServiceCard icon={BookOpen} label={settings.student_status_check_text || 'Cek Status Peserta Didik'} description="Status & data peserta didik" accent="primary" onClick={() => navigate('/cek-status-peserta-didik')} />
                  )}
                  {settings?.enable_activity_permission && (
                    <LuxuryServiceCard icon={FileText} label={settings.activity_permission_text || 'Portal Izin Kegiatan Siswa'} description="Pengajuan & persetujuan izin" accent="secondary" onClick={() => navigate('/surat-izin-orang-tua')} />
                  )}
                  {settings?.enable_graduation_check && (
                    <LuxuryServiceCard icon={GraduationCap} label={settings.graduation_check_text || 'Cek Status Kelulusan'} description="Informasi kelulusan siswa" accent="emerald" onClick={() => navigate('/cek-kelulusan')} />
                  )}
                  {settings?.enable_complaint_channel && (
                    <LuxuryServiceCard icon={Shield} label={settings.complaint_channel_text || 'Kanal Pengaduan'} description="Sampaikan laporan & masukan" accent="rose" onClick={() => navigate('/pengaduan')} />
                  )}
                  {settings?.enable_complaint_status_check && (
                    <LuxuryServiceCard icon={Search} label={settings.complaint_status_check_text || 'Cek Status Pengaduan'} description="Lacak progres laporan Anda" accent="amber" onClick={() => navigate('/cek-status-pengaduan')} />
                  )}
                </div>
              </div>
            )}

            {/* ─── School Registration ─── */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/daftar-sekolah')}
                className={cn(
                  'group inline-flex items-center gap-2 px-4 py-2 rounded-full',
                  'text-[11.5px] font-medium tracking-wide text-muted-foreground/70 hover:text-foreground',
                  'bg-muted/20 hover:bg-muted/40',
                  'border border-border/30 hover:border-border/60',
                  'transition-all duration-500',
                )}
              >
                <School className="h-3.5 w-3.5 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />
                Daftarkan Sekolah Baru
              </button>
            </div>

            <p className="text-center text-[11px] text-muted-foreground/50 tracking-[0.1em] font-light">
              © {new Date().getFullYear()} PUSAKA NEDELCIS
            </p>
          </div>
        </div>

        <AppFooter />
      </div>

      <LuxuryStyles />
    </LuxuryShell>
  );
}

// ═════════════════════════════════════════════════════════════
// LUXURY SHELL
// ═════════════════════════════════════════════════════════════
function LuxuryShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-background">
      {/* Base radial wash */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.06),transparent_55%),radial-gradient(ellipse_at_bottom_right,hsl(var(--secondary)/0.05),transparent_55%)] pointer-events-none" />

      {/* Fine grid */}
      <div
        className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 70% 50% at 50% 40%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 50% at 50% 40%, black, transparent)',
        }}
      />

      {/* Floating orbs */}
      <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-primary/[0.06] blur-[120px] pointer-events-none animate-float-slow" />
      <div className="absolute -bottom-40 -right-32 w-[560px] h-[560px] rounded-full bg-secondary/[0.06] blur-[140px] pointer-events-none animate-float-slower" />
      <div className="absolute top-1/2 left-1/3 w-[320px] h-[320px] rounded-full bg-primary/[0.03] blur-[100px] pointer-events-none" />

      {/* Faint vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,hsl(var(--background)/0.4)_100%)] pointer-events-none" />

      <Suspense fallback={null}>
        <FloatingShapes3D />
      </Suspense>

      <div className="relative z-10 flex flex-col min-h-screen">
        <div className="flex-1 flex items-start sm:items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          {children}
        </div>
        <AppFooter />
      </div>
    </div>
  );
}

function LuxuryLogo({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative group">
      {/* Ring halo */}
      <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-primary/15 via-transparent to-secondary/15 blur-xl opacity-70 group-hover:opacity-100 transition-opacity duration-700" />
      {/* Gold ring */}
      <div className="absolute inset-0 rounded-2xl ring-1 ring-border/40 group-hover:ring-primary/30 transition-all duration-700" />
      <img
        src={src}
        alt={alt}
        className="relative h-20 w-20 sm:h-24 sm:w-24 object-contain p-1 drop-shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-transform duration-700 group-hover:scale-[1.06]"
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════
function LuxuryStyles() {
  return (
    <style>{`
      @keyframes float-slow {
        0%, 100% { transform: translate(0, 0); }
        50%      { transform: translate(20px, -20px); }
      }
      @keyframes float-slower {
        0%, 100% { transform: translate(0, 0); }
        50%      { transform: translate(-25px, 15px); }
      }
      .animate-float-slow   { animation: float-slow 18s ease-in-out infinite; }
      .animate-float-slower { animation: float-slower 24s ease-in-out infinite; }

      /* Custom input height helper (h-13 = 52px) */
      .h-13 { height: 3.25rem; }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
        .animate-float-slow, .animate-float-slower { animation: none !important; }
      }
    `}</style>
  );
}