import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHero } from "./Profil";
import { BookOpen } from "lucide-react";

export default function Akademik() {
  const [programs, setPrograms] = useState<any[]>([]);
  useEffect(() => {
    (supabase.from("website_programs" as any) as any)
      .select("*").eq("is_published", true).order("sort_order")
      .then(({ data }: any) => setPrograms(data ?? []));
  }, []);
  return (
    <div>
      <PageHero title="Akademik" subtitle="Program pembelajaran dan kurikulum unggulan." />
      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl p-6 border border-slate-100 hover:shadow-lg hover:border-[#1E40AF] transition">
              <div className="h-12 w-12 rounded-xl bg-blue-50 text-[#1E40AF] flex items-center justify-center mb-4">
                <BookOpen className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">{p.name}</h3>
              <p className="text-slate-600 text-sm">{p.description}</p>
            </div>
          ))}
        </div>
        {programs.length === 0 && <div className="text-center text-slate-500 py-16">Belum ada program dipublikasikan.</div>}
      </div>
    </div>
  );
}
