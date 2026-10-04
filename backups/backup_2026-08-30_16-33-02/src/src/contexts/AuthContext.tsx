import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: 'admin' | 'teacher' | 'bendahara' | 'tata_usaha' | 'siswa' | 'kesiswaan' | 'polling' | 'billing' | 'super_admin' | 'guru_piket' | null;
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
  const [userRole, setUserRole] = useState<'admin' | 'teacher' | 'bendahara' | 'tata_usaha' | 'siswa' | 'kesiswaan' | 'polling' | 'billing' | 'super_admin' | 'guru_piket' | null>(null);
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
      setUserRole(data?.role as 'admin' | 'teacher' | 'bendahara' | 'tata_usaha' | 'siswa' | 'kesiswaan' | 'polling' | 'billing' | 'super_admin' | 'guru_piket' | null);
      setSchoolId((data as any)?.school_id ?? null);
    } catch (error) {
      console.error('Error fetching user role:', error);
      setUserRole(null);
      setSchoolId(null);
    }
  }, []);

  // Auto logout after 5 minutes of inactivity
  useEffect(() => {
    if (!user) return;

    const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
    const WARNING_TIME = 1 * 60 * 1000; // Show warning 1 minute before logout
    let idleTimer: NodeJS.Timeout;
    let warningShown = false;

    const handleAutoLogout = async () => {
      toast({
        title: "Sesi Berakhir",
        description: "Anda telah logout otomatis karena tidak aktif selama 1 jam.",
      });
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setUserRole(null);
      navigate('/auth');
    };

    const resetIdleTimer = () => {
      warningShown = false;
      if (idleTimer) clearTimeout(idleTimer);
      
      idleTimer = setTimeout(() => {
        // Show warning 5 minutes before logout
        if (!warningShown) {
          toast({
            title: "Peringatan Sesi",
            description: "Sesi Anda akan berakhir dalam 5 menit karena tidak aktif.",
            variant: "destructive",
          });
          warningShown = true;
          
          // Set final logout timer
          setTimeout(() => {
            handleAutoLogout();
          }, WARNING_TIME);
        }
      }, IDLE_TIMEOUT - WARNING_TIME);
    };

    // Events to track user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, resetIdleTimer);
    });

    // Start the timer
    resetIdleTimer();

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      events.forEach(event => {
        document.removeEventListener(event, resetIdleTimer);
      });
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
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
