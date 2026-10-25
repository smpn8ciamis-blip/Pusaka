import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mail, Check, Trash2 } from "lucide-react";

export default function AdminMessages() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => (supabase.from("website_contact_messages" as any) as any).select("*").order("created_at", { ascending: false }).then(({ data }: any) => setRows(data ?? []));
  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await (supabase.from("website_contact_messages" as any) as any).update({ is_read: true }).eq("id", id);
    load();
  };
  const del = async (id: string) => {
    if (!confirm("Hapus pesan ini?")) return;
    await (supabase.from("website_contact_messages" as any) as any).delete().eq("id", id);
    toast.success("Dihapus"); load();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Pesan Masuk</h1>
        <p className="text-sm text-slate-500">Pesan yang dikirim melalui form kontak website.</p>
      </div>
      <div className="space-y-3">
        {rows.length === 0 && <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border">Belum ada pesan.</div>}
        {rows.map((m) => (
          <div key={m.id} className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${m.is_read ? "border-slate-100" : "border-l-4 border-l-[#1E40AF]"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="h-4 w-4 text-[#1E40AF]" />
                  <span className="font-semibold">{m.name}</span>
                  {!m.is_read && <span className="text-xs bg-[#1E40AF] text-white px-2 py-0.5 rounded">BARU</span>}
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  {m.email && <span className="mr-3">{m.email}</span>}
                  {m.phone && <span className="mr-3">{m.phone}</span>}
                  <span>{new Date(m.created_at).toLocaleString("id-ID")}</span>
                </div>
                {m.subject && <div className="font-medium text-slate-700 text-sm mb-1">{m.subject}</div>}
                <p className="whitespace-pre-line text-sm text-slate-600 [overflow-wrap:anywhere]">{m.message}</p>
              </div>
              <div className="flex gap-2 border-t pt-3 sm:flex-col sm:gap-1 sm:border-0 sm:pt-0">
                {!m.is_read && <Button size="sm" variant="outline" className="h-10 flex-1 rounded-xl sm:h-9 sm:flex-none" onClick={() => markRead(m.id)}><Check className="mr-1 h-4 w-4" /><span className="sm:hidden">Tandai dibaca</span></Button>}
                <Button size="sm" variant="outline" className="h-10 flex-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50 sm:h-9 sm:flex-none" onClick={() => del(m.id)}><Trash2 className="mr-1 h-4 w-4" /><span className="sm:hidden">Hapus</span></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
