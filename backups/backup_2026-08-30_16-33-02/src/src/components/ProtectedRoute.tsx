import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

type AppRole = 'admin' | 'teacher' | 'bendahara' | 'tata_usaha' | 'siswa' | 'kesiswaan' | 'polling' | 'billing' | 'super_admin' | 'guru_piket';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireRole?: AppRole;
  allowedRoles?: AppRole[];
}

export const ProtectedRoute = ({ children, requireRole, allowedRoles }: ProtectedRouteProps) => {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check allowedRoles array first
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  // Then check requireRole for backward compatibility
  if (requireRole && userRole !== requireRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
