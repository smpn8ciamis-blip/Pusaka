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
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pesan Masuk</h1>
        <p className="text-sm text-slate-500">Pesan yang dikirim melalui form kontak website.</p>
      </div>
      <div className="space-y-3">
        {rows.length === 0 && <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border">Belum ada pesan.</div>}
        {rows.map((m) => (
          <div key={m.id} className={`bg-white rounded-2xl p-5 border ${m.is_read ? "border-slate-100" : "border-l-4 border-l-[#1E40AF]"}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
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
                <p className="text-sm text-slate-600 whitespace-pre-line">{m.message}</p>
              </div>
              <div className="flex flex-col gap-1">
                {!m.is_read && <Button size="sm" variant="ghost" onClick={() => markRead(m.id)}><Check className="h-4 w-4" /></Button>}
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => del(m.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
