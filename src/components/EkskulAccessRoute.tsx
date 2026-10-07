import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsEkskulCoach } from '@/hooks/useEkskul';

/**
 * Akses halaman Jurnal/Anggota Ekskul:
 * admin, kesiswaan, pembina_ekskul, atau guru yang ditugaskan sebagai pembina.
 */
export const EkskulAccessRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, userRole, loading } = useAuth();
  const { isCoach, isLoading } = useIsEkskulCoach();

  if (loading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const allowed =
    userRole === 'admin' ||
    userRole === 'kesiswaan' ||
    userRole === 'super_admin' ||
    userRole === 'pembina_ekskul' ||
    (userRole === 'teacher' && isCoach);

  return allowed ? <>{children}</> : <Navigate to="/" replace />;
};
