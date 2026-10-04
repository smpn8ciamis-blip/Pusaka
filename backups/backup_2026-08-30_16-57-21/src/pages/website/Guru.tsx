import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHero } from "./Profil";
import { GraduationCap } from "lucide-react";

export default function Guru() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from("teachers" as any) as any)
        .select("id, subject, jabatan, nip, photo_url, user_id, profiles:profiles(full_name)")
        .order("id");
      setRows(data ?? []);
    })();
  }, []);
  return (
    <div>
      <PageHero title="Guru & Staff" subtitle="Tenaga pendidik dan kependidikan profesional." />
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {rows.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl overflow-hidden border border-slate-100 hover:shadow-lg transition text-center">
              <div className="aspect-square bg-gradient-to-br from-blue-100 to-blue-50">
                {t.photo_url ? <img src={t.photo_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[#1E40AF]"><GraduationCap className="h-16 w-16" /></div>}
              </div>
              <div className="p-4">
                <div className="font-semibold text-slate-900 line-clamp-1">{t.profiles?.full_name ?? "Guru"}</div>
                <div className="text-xs text-slate-500 mt-1">{t.subject}</div>
                {t.jabatan && <div className="text-xs text-[#1E40AF] mt-1">{t.jabatan}</div>}
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="col-span-full text-center text-slate-500 py-16">Data guru belum tersedia.</div>}
        </div>
      </div>
    </div>
  );
}
