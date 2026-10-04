import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

type UserRole = 'admin' | 'teacher' | 'bendahara' | 'tata_usaha' | null;

interface MfaCheckResult {
  needsMfa: boolean;
  hasMfaEnabled: boolean;
  isChecking: boolean;
  aal: string | null;
}

// Roles that require 2FA
const ROLES_REQUIRING_2FA: UserRole[] = ['admin', 'bendahara'];

export function useMfaCheck(user: User | null, userRole: UserRole): MfaCheckResult {
  const [needsMfa, setNeedsMfa] = useState(false);
  const [hasMfaEnabled, setHasMfaEnabled] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [aal, setAal] = useState<string | null>(null);

  const checkMfaStatus = useCallback(async () => {
    if (!user || !userRole) {
      setIsChecking(false);
      return;
    }

    // Only check MFA for specific roles
    if (!ROLES_REQUIRING_2FA.includes(userRole)) {
      setNeedsMfa(false);
      setHasMfaEnabled(false);
      setIsChecking(false);
      return;
    }

    try {
      // Get current assurance level
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      
      if (aalError) {
        console.error('Error getting AAL:', aalError);
        setIsChecking(false);
        return;
      }

      setAal(aalData.currentLevel);

      // Get enrolled factors
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      
      if (factorsError) {
        console.error('Error listing factors:', factorsError);
        setIsChecking(false);
        return;
      }

      const hasVerifiedTotp = factorsData.totp.some((f) => f.status === 'verified');
      setHasMfaEnabled(hasVerifiedTotp);

      // If user has MFA enabled but current level is aal1, they need to verify
      if (hasVerifiedTotp && aalData.currentLevel === 'aal1') {
        setNeedsMfa(true);
      } else {
        setNeedsMfa(false);
      }
    } catch (err) {
      console.error('Error checking MFA status:', err);
    } finally {
      setIsChecking(false);
    }
  }, [user, userRole]);

  useEffect(() => {
    checkMfaStatus();
  }, [checkMfaStatus]);

  return { needsMfa, hasMfaEnabled, isChecking, aal };
}

export function requiresMfaSetup(userRole: UserRole, hasMfaEnabled: boolean): boolean {
  return ROLES_REQUIRING_2FA.includes(userRole) && !hasMfaEnabled;
}
