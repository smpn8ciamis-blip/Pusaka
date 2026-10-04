import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHero } from "./Profil";
import { Activity } from "lucide-react";

export default function Ekstrakurikuler() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    (supabase.from("extracurricular_types" as any) as any)
      .select("*").eq("is_active", true).order("name")
      .then(({ data }: any) => setItems(data ?? []));
  }, []);
  return (
    <div>
      <PageHero title="Ekstrakurikuler" subtitle="Wadah pengembangan bakat, minat, dan karakter peserta didik." />
      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((e) => (
            <div key={e.id} className="group bg-white rounded-2xl overflow-hidden border border-slate-100 hover:shadow-2xl hover:-translate-y-1 hover:border-[#1E40AF] transition-all duration-300">
              <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-emerald-50 to-blue-50">
                {e.image_url ? (
                  <img src={e.image_url} alt={e.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition duration-700" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-emerald-400"><Activity className="h-16 w-16" /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition" />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Activity className="h-4 w-4" /></div>
                  <h3 className="text-lg font-bold text-slate-900">{e.name}</h3>
                </div>
                {e.description && <p className="text-slate-600 text-sm leading-relaxed line-clamp-3">{e.description}</p>}
              </div>
            </div>
          ))}
        </div>
        {items.length === 0 && <div className="text-center text-slate-500 py-16">Data ekstrakurikuler belum tersedia.</div>}
      </div>
    </div>
  );
}
