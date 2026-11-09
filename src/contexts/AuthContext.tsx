import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { ACTIVITY_KEY, effectiveLastActivity, idleMinutesLeft, idleState, isIdleRole } from '@/lib/idleSession';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: 'admin' | 'teacher' | 'bendahara' | 'tata_usaha' | 'siswa' | 'kesiswaan' | 'polling' | 'billing' | 'super_admin' | 'guru_piket' | 'admin_web' | 'pembina_ekskul' | 'staf' | null;
  schoolId: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'teacher' | 'bendahara' | 'tata_usaha' | 'siswa' | 'kesiswaan' | 'polling' | 'billing' | 'super_admin' | 'guru_piket' | 'admin_web' | 'pembina_ekskul' | 'staf' | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchUserRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, school_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      setUserRole(data?.role as 'admin' | 'teacher' | 'bendahara' | 'tata_usaha' | 'siswa' | 'kesiswaan' | 'polling' | 'billing' | 'super_admin' | 'guru_piket' | 'admin_web' | 'pembina_ekskul' | 'staf' | null);
      setSchoolId((data as any)?.school_id ?? null);
    } catch (error) {
      console.error('Error fetching user role:', error);
      setUserRole(null);
      setSchoolId(null);
    }
  }, []);

  // Batas sesi: super_admin, admin, dan tata_usaha keluar otomatis setelah 1 jam tanpa aktivitas (sliding).
  // Peran lain tidak pernah dikeluarkan oleh aplikasi; token diperbarui otomatis oleh Supabase (autoRefreshToken).
  // Aktivitas = interaksi pengguna (klik, ketik, geser, sentuh), dibagikan antar tab lewat localStorage;
  // permintaan latar belakang tidak dihitung. Dicek juga saat halaman dibuka lagi setelah lama ditutup.
  useEffect(() => {
    if (!user || !userRole) return;
    try { localStorage.removeItem('pusaka_login_at'); } catch { /* sisa versi lama */ }
    if (!isIdleRole(userRole)) return;

    const signedAt = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : NaN;
    const readStored = () => {
      try { return Number(localStorage.getItem(ACTIVITY_KEY)); } catch { return NaN; }
    };
    // Belum ada catatan aktivitas (mis. pertama kali setelah pembaruan) -> anggap aktif sekarang.
    const stored0 = readStored();
    let memLast = Number.isFinite(stored0) && stored0 > 0
      ? effectiveLastActivity(Date.now(), stored0, signedAt)
      : Date.now();
    let lastWrite = 0;
    const writeStored = (t: number) => {
      try { localStorage.setItem(ACTIVITY_KEY, String(t)); } catch { /* abaikan */ }
    };
    writeStored(memLast);

    let warned = false;
    let ended = false;
    const endSession = async () => {
      if (ended) return;
      ended = true;
      toast({
        title: "Sesi Berakhir",
        description: "Anda keluar otomatis karena tidak ada aktivitas selama 1 jam. Silakan login kembali.",
      });
      try { localStorage.removeItem(ACTIVITY_KEY); } catch { /* abaikan */ }
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setUserRole(null);
      setSchoolId(null);
      navigate('/auth');
    };
    const check = () => {
      const now = Date.now();
      // aktivitas di tab lain ikut dihitung
      const last = effectiveLastActivity(now, memLast, readStored(), signedAt);
      const st = idleState(now, last);
      if (st === 'expired') { endSession(); return; }
      if (st === 'warn' && !warned) {
        warned = true;
        toast({
          title: "Sesi hampir berakhir",
          description: `Tidak ada aktivitas. Anda akan keluar otomatis dalam ${idleMinutesLeft(now, last)} menit; gerakkan mouse atau ketuk layar untuk tetap masuk.`,
          variant: "destructive",
        });
      } else if (st === 'active') {
        warned = false;
      }
    };
    const onActivity = () => {
      if (ended) return;
      const now = Date.now();
      memLast = now;
      if (now - lastWrite > 10000) { lastWrite = now; writeStored(now); } // batasi tulis ke localStorage
    };

    check();
    const timer = setInterval(check, 15 * 1000);
    const evts: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'mousemove'];
    evts.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      evts.forEach((e) => window.removeEventListener(e, onActivity, { capture: true } as EventListenerOptions));
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [user, userRole, toast, navigate]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') { try { localStorage.removeItem(ACTIVITY_KEY); } catch { /* abaikan */ } }
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer role fetching
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setUserRole(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      // Tunggu peran terbaca SEBELUM loading selesai; kalau tidak, saat reload userRole masih null
      // sehingga ProtectedRoute (requireRole) mengira peran tidak cocok lalu melempar ke dashboard.
      if (session?.user) {
        await fetchUserRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchUserRole]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setSchoolId(null);
    navigate('/auth');
  }, [navigate]);

  const value = useMemo(() => ({
    user,
    session,
    userRole,
    schoolId,
    loading,
    signIn,
    signUp,
    signOut
  }), [user, session, userRole, schoolId, loading, signIn, signUp, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
