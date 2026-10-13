import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMySnpStandardIds } from '@/hooks/usePenjabSnp';

/** Akses halaman Penjab SNP: admin, super admin, atau guru yang ditugaskan sebagai penjab. */
export const PenjabSnpRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, userRole, loading } = useAuth();
  const { isPenjab, isLoading } = useMySnpStandardIds();

  if (loading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  const allowed = userRole === 'admin' || userRole === 'super_admin' || (userRole === 'teacher' && isPenjab);
  return allowed ? <>{children}</> : <Navigate to="/" replace />;
};
