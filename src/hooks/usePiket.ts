import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Apakah akun guru/staf ini pernah ditugaskan piket (malam / Sabtu-Minggu)? Menentukan menu "Log Piket Saya". */
export function useHasPiketDuty() {
  const { user, userRole } = useAuth();
  const eligible = userRole === "teacher" || userRole === "staf";
  const { data } = useQuery({
    queryKey: ["has-piket-duty", user?.id, userRole],
    enabled: !!user && eligible,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("piket_duties" as any).select("id", { count: "exact", head: true });
      if (error) return false;
      return (count ?? 0) > 0;
    },
  });
  return !!data;
}
