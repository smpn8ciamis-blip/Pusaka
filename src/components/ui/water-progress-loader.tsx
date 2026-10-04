// src/components/ui/water-progress-loader.tsx
//
// Bridge: Water*Loader → LiquidLoader (Orbit Style).
// Auto-fetch logo SEKOLAH (right_logo_url) dari school_settings_public.
//
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  LiquidLoader,
  LiquidLoaderCard,
  LiquidLoaderOverlay,
  LiquidLoaderInline,
  type LiquidLoaderProps,
  type LiquidLoaderCardProps,
  type LiquidLoaderOverlayProps,
} from '@/components/liquid-loader';

// ─────────────────────────────────────────────────────────────
// Hook: ambil logo SEKOLAH (right_logo_url), fallback ke logo_url
// ─────────────────────────────────────────────────────────────
function useSchoolLogo() {
  const { data } = useQuery({
    queryKey: ['school-settings-public-logo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_settings_public')
        .select('logo_url, right_logo_url')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    networkMode: 'online',
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });

  // Prioritas: right_logo_url (logo sekolah) → logo_url (fallback)
  return (data?.right_logo_url || data?.logo_url) as string | undefined;
}

// ─────────────────────────────────────────────────────────────
// Water*Loader dengan auto logo
// ─────────────────────────────────────────────────────────────
export const WaterLoader = (props: LiquidLoaderProps) => {
  const logo = useSchoolLogo();
  return <LiquidLoader {...props} logoSrc={props.logoSrc ?? logo} />;
};

export const WaterLoaderCard = (props: LiquidLoaderCardProps) => {
  const logo = useSchoolLogo();
  return <LiquidLoaderCard {...props} logoSrc={props.logoSrc ?? logo} />;
};

export const WaterLoaderOverlay = (props: LiquidLoaderOverlayProps) => {
  const logo = useSchoolLogo();
  return <LiquidLoaderOverlay {...props} logoSrc={props.logoSrc ?? logo} />;
};

export const WaterLoaderInline = LiquidLoaderInline;

// Alias untuk kompatibilitas
export const WaterProgressLoader = WaterLoader;
export const WaterProgressLoaderCard = WaterLoaderCard;
export const WaterProgressLoaderOverlay = WaterLoaderOverlay;

export default WaterLoader;
