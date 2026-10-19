import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

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

  // Sesi login berlaku 1 jam sejak login (semua akun). Dihitung dari waktu login di server (last_sign_in_at),
  // sehingga tetap akurat setelah halaman dimuat ulang atau tab tertidur.
  useEffect(() => {
    if (!user) return;

    const SESSION_MS = 60 * 60 * 1000;   // 1 jam
    const WARN_MS = 5 * 60 * 1000;       // peringatan 5 menit sebelum berakhir
    const STORE_KEY = 'pusaka_login_at';
    const signedAt = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : NaN;
    let loginAt = Number.isFinite(signedAt) ? signedAt : NaN;
    if (!Number.isFinite(loginAt)) {
      try { loginAt = Number(localStorage.getItem(STORE_KEY)) || Date.now(); } catch { loginAt = Date.now(); }
    }
    try { localStorage.setItem(STORE_KEY, String(loginAt)); } catch { /* abaikan */ }

    let warned = false;
    let ended = false;
    const endSession = async () => {
      if (ended) return;
      ended = true;
      toast({
        title: "Sesi Berakhir",
        description: "Masa login 1 jam telah habis. Silakan login kembali.",
      });
      try { localStorage.removeItem(STORE_KEY); } catch { /* abaikan */ }
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setUserRole(null);
      navigate('/auth');
    };
    const check = () => {
      const left = loginAt + SESSION_MS - Date.now();
      if (left <= 0) { endSession(); return; }
      if (left <= WARN_MS && !warned) {
        warned = true;
        toast({
          title: "Sesi hampir berakhir",
          description: `Sesi login berakhir dalam ${Math.max(1, Math.ceil(left / 60000))} menit. Simpan pekerjaan Anda.`,
          variant: "destructive",
        });
      }
    };

    check();
    const timer = setInterval(check, 15 * 1000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [user, toast, navigate]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
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
