import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FEATURE_LABELS, type FeatureKey } from '@/config/subscriptionPlans';

export interface SubscriptionPlan {
  id: string;
  plan_key: string;
  label: string;
  description: string;
  max_students: number;
  max_teachers: number;
  duration_months: number;
  monthly_price: number;
  features: FeatureKey[];
  is_active: boolean;
  sort_order: number;
}

export function useSubscriptionPlans() {
  const queryClient = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as SubscriptionPlan[];
    },
  });

  const activePlans = plans.filter(p => p.is_active);

  const getPlanByKey = (key: string) => plans.find(p => p.plan_key === key);

  const upsertPlan = useMutation({
    mutationFn: async (plan: Partial<SubscriptionPlan> & { plan_key: string; label?: string }) => {
      const existing = plans.find(p => p.plan_key === plan.plan_key);
      if (existing) {
        const { error } = await supabase
          .from('subscription_plans')
          .update(plan as any)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('subscription_plans')
          .insert([plan as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subscription-plans'] }),
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('subscription_plans')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subscription-plans'] }),
  });

  // Build a PLAN_PRESETS-compatible map from DB plans
  const planPresetsMap: Record<string, {
    max_students: number;
    max_teachers: number;
    duration_months: number;
    monthly_price: number;
    label: string;
    description: string;
    features: FeatureKey[];
  }> = {};
  for (const p of plans) {
    planPresetsMap[p.plan_key] = {
      max_students: p.max_students,
      max_teachers: p.max_teachers,
      duration_months: p.duration_months,
      monthly_price: p.monthly_price,
      label: p.label,
      description: p.description,
      features: p.features,
    };
  }

  return {
    plans,
    activePlans,
    isLoading,
    getPlanByKey,
    upsertPlan,
    deletePlan,
    planPresetsMap,
  };
}
