import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCaptchaConfig() {
  const { data: captchaEnabled = true } = useQuery({
    queryKey: ['captcha-config'],
    queryFn: async () => {
      const { data } = await supabase
        .from('school_settings_public')
        .select('enable_captcha')
        .limit(1)
        .maybeSingle();
      return data?.enable_captcha ?? true;
    },
    staleTime: 5 * 60 * 1000, // cache 5 minutes
  });

  return { captchaEnabled };
}
