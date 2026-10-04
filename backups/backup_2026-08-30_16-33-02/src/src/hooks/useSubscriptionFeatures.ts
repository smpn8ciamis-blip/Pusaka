import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { type FeatureKey } from '@/config/subscriptionPlans';

export function useSubscriptionFeatures(schoolId: string | null | undefined) {
  const { data: subscription, isLoading } = useQuery({
    queryKey: ['school-subscription', schoolId],
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
    enabled: !!schoolId,
  });

  const planName = subscription?.plan_name || 'starter';

  // Use stored allowed_features from DB (set when subscription is created/updated)
  const allowedFeatures: FeatureKey[] =
    (subscription?.allowed_features as FeatureKey[] | null)?.length
      ? (subscription.allowed_features as FeatureKey[])
      : [];

  const hasFeature = (feature: FeatureKey): boolean => {
    return allowedFeatures.includes(feature);
  };

  const isExpired = subscription?.end_date
    ? new Date(subscription.end_date) < new Date()
    : false;

  const isActive = subscription?.status === 'active' && !isExpired;

  return {
    subscription,
    isLoading,
    planName,
    allowedFeatures,
    hasFeature,
    isActive,
    isExpired,
  };
}
