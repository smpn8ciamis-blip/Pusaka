import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle } from 'lucide-react';

export function SubscriptionBanner() {
  const { schoolId, userRole } = useAuth();

  const { data: subscription } = useQuery({
    queryKey: ['my-subscription', schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const { data, error } = await supabase
        .from('school_subscriptions')
        .select('*')
        .eq('school_id', schoolId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!schoolId && userRole !== 'super_admin',
  });

  if (!subscription) return null;
  
  const isExpired = subscription.status === 'expired' || 
    subscription.status === 'suspended' ||
    (subscription.end_date && new Date(subscription.end_date) < new Date());

  if (!isExpired) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 px-4 py-3 rounded-lg flex items-center gap-3 mb-4">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold text-sm">Langganan Expired</p>
        <p className="text-xs">Langganan sekolah Anda telah berakhir. Anda masih bisa melihat data, namun tidak bisa menambah atau mengedit data. Hubungi administrator untuk memperpanjang.</p>
      </div>
    </div>
  );
}

export function useSubscriptionReadOnly() {
  const { schoolId, userRole } = useAuth();

  const { data: isReadOnly } = useQuery({
    queryKey: ['subscription-readonly', schoolId],
    queryFn: async () => {
      if (!schoolId) return false;
      const { data, error } = await supabase
        .from('school_subscriptions')
        .select('status, end_date')
        .eq('school_id', schoolId)
        .maybeSingle();
      if (error) return false;
      if (!data) return false; // No subscription = free tier, not read-only
      
      return data.status === 'expired' || 
        data.status === 'suspended' ||
        (data.end_date && new Date(data.end_date) < new Date());
    },
    enabled: !!schoolId && userRole !== 'super_admin',
  });

  return isReadOnly ?? false;
}
