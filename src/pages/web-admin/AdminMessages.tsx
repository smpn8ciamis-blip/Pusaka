import { useDeferredValue, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Check, Trash2, Phone, AtSign, Reply } from "lucide-react";
import { PageHeader, EmptyState, ListSkeleton, cardCls, Pill, fmtDateTime, UNREAD_KEY } from "@/components/web-admin/ui";

const PAGE = 20;
type Filter = "all" | "unread";

export default function AdminMessages() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [visible, setVisible] = useState(PAGE);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deferredFilter = useDeferredValue(filter);
  useEffect(() => { setVisible(PAGE); }, [deferredFilter]);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["web-admin", "messages"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("website_contact_messages" as any) as any)
        .select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  useEffect(() => { if (error) toast.error((error as Error).message); }, [error]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["web-admin", "messages"] });
    qc.invalidateQueries({ queryKey: UNREAD_KEY });
    qc.invalidateQueries({ queryKey: ["web-admin", "dashboard"] });
  };

  const markRead = async (id: string) => {
    const { error } = await (supabase.from("website_contact_messages" as any) as any).update({ is_read: true }).eq("id", id);
    if (error) return toast.error(error.message);
    // perbarui tampilan langsung tanpa menunggu muat ulang
    qc.setQueryData<any[]>(["web-admin", "messages"], (old) => (old ?? []).map((m) => (m.id === id ? { ...m, is_read: true } : m)));
    refresh();
  };
  const del = async () => {
    if (!deleteId) return;
    const { error } = await (supabase.from("website_contact_messages" as any) as any).delete().eq("id", deleteId);
    if (error) return toast.error(error.message);
    toast.success("Pesan dihapus");
    setDeleteId(null); refresh();
  };

  const unreadCount = rows.filter((m) => !m.is_read).length;
  const list = deferredFilter === "unread" ? rows.filter((m) => !m.is_read) : rows;
  const shown = list.slice(0, visible);

  const tab = (f: Filter, label: string, n?: number) => (
    <button
      type="button"
      onClick={() => setFilter(f)}
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${filter === f ? "bg-[#1E40AF] text-white" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"}`}
    >
      {label}{n ? <span className={`rounded-full px-1.5 text-[11px] leading-4 ${filter === f ? "bg-white/25" : "bg-red-500 text-white"}`}>{n}</span> : null}
    </button>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Pesan Masuk" description="Pesan yang dikirim melalui form kontak website." />

      <div className="mb-4 flex gap-2">
        {tab("all", "Semua")}
        {tab("unread", "Belum dibaca", unreadCount)}
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : shown.length === 0 ? (
        <EmptyState>{filter === "unread" ? "Semua pesan sudah dibaca." : "Belum ada pesan."}</EmptyState>
      ) : (
        <div className="space-y-3">
          {shown.map((m) => (
            <article key={m.id} className={`${cardCls} p-4 sm:p-5 ${m.is_read ? "" : "border-l-4 border-l-[#1E40AF]"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-[#1E40AF]">{(m.name?.[0] ?? "?").toUpperCase()}</span>
                    <span className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{m.name}</span>
                    {!m.is_read && <Pill tone="blue">Baru</Pill>}
                    <span className="text-xs text-slate-400 sm:ml-auto">{fmtDateTime(m.created_at)}</span>
                  </div>
                  {(m.email || m.phone) && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {m.email && <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1 hover:text-[#1E40AF]"><AtSign className="h-3.5 w-3.5" />{m.email}</a>}
                      {m.phone && <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 hover:text-[#1E40AF]"><Phone className="h-3.5 w-3.5" />{m.phone}</a>}
                    </div>
                  )}
                  {m.subject && <div className="mt-2 text-sm font-medium text-slate-800">{m.subject}</div>}
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600 [overflow-wrap:anywhere]">{m.message}</p>
                </div>
                <div className="flex gap-2 border-t border-slate-100 pt-3 sm:flex-col sm:border-0 sm:pt-0">
                  {m.email && (
                    <Button asChild size="sm" variant="outline" className="h-10 flex-1 rounded-xl sm:h-9 sm:flex-none">
                      <a href={`mailto:${m.email}?subject=${encodeURIComponent("Re: " + (m.subject ?? "Pesan dari website SMPN 8 Ciamis"))}`}><Reply className="mr-1.5 h-4 w-4" />Balas</a>
                    </Button>
                  )}
                  {!m.is_read && (
                    <Button size="sm" variant="outline" className="h-10 flex-1 rounded-xl sm:h-9 sm:flex-none" onClick={() => markRead(m.id)}>
                      <Check className="mr-1.5 h-4 w-4" />Dibaca
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-10 flex-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 sm:h-9 sm:flex-none" onClick={() => setDeleteId(m.id)}>
                    <Trash2 className="mr-1.5 h-4 w-4" />Hapus
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {list.length > shown.length && (
        <div className="mt-4 flex flex-col items-center gap-1">
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => setVisible((v) => v + PAGE)}>Tampilkan lebih banyak</Button>
          <span className="text-xs text-slate-400">{shown.length} dari {list.length}</span>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pesan ini?</AlertDialogTitle>
            <AlertDialogDescription>Pesan yang dihapus tidak dapat dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={del} className="bg-red-600 hover:bg-red-700">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
