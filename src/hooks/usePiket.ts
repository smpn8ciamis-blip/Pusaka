import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Apakah akun guru/staf ini pernah ditugaskan piket (malam / Sabtu-Minggu)? Menentukan menu "Log Piket Saya". */
export function useHasPiketDuty() {
  const { user, userRole } = useAuth();
  const eligible = userRole === "teacher" || userRole === "staf";
  const { data } = useQuery({
    queryKey: ["has-piket-duty", user?.id, userRole],
    enabled: !!user && eligible && userRole !== "staf",
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [duties, pending] = await Promise.all([
        supabase.from("piket_duties" as any).select("id", { count: "exact", head: true }),
        supabase.from("piket_unscheduled" as any).select("id", { count: "exact", head: true }),
      ]);
      return (duties.count ?? 0) > 0 || (pending.count ?? 0) > 0;
    },
  });
  // Akun staf selalu melihat Log Piket Saya (jadwal bisa dibuat kapan saja)
  return userRole === "staf" || !!data;
}
