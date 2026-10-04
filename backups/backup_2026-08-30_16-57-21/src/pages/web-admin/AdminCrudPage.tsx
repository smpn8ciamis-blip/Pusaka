import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { RichTextEditor } from "@/components/cbt/RichTextEditor";

export type Field = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "richtext" | "number" | "url" | "image" | "datetime" | "date" | "select" | "boolean" | "color";
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  colSpan?: 1 | 2;
};

interface Props {
  title: string;
  description?: string;
  table: string;
  columns: { key: string; label: string; render?: (row: any) => ReactNode }[];
  fields: Field[];
  orderBy?: { column: string; ascending?: boolean };
  defaults?: Record<string, any>;
  extraSelect?: string;
  renderExtra?: (rows: any[]) => ReactNode;
}

export default function AdminCrudPage({ title, description, table, columns, fields, orderBy, defaults, extraSelect, renderExtra }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    let q: any = (supabase.from(table as any) as any).select(extraSelect ?? "*");
    if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    const { data, error } = await q;
    if (error) return toast.error(error.message);
    setRows(data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [table]);

  const openNew = () => { setEditing(null); setForm({ ...(defaults ?? {}) }); setOpen(true); };
  const openEdit = (row: any) => { setEditing(row); setForm({ ...row }); setOpen(true); };

  const save = async () => {
    setLoading(true);
    const payload: any = {};
    for (const f of fields) {
      let v = form[f.key];
      if (f.type === "number") v = v === "" || v == null ? null : Number(v);
      payload[f.key] = v ?? null;
    }
    const q: any = supabase.from(table as any);
    const { error } = editing
      ? await q.update(payload).eq("id", editing.id)
      : await q.insert(payload);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Berhasil diperbarui" : "Berhasil ditambahkan");
    setOpen(false); load();
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await (supabase.from(table as any) as any).delete().eq("id", deleteId);
    if (error) return toast.error(error.message);
    toast.success("Berhasil dihapus");
    setDeleteId(null); load();
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        <Button onClick={openNew} className="bg-[#1E40AF] hover:bg-[#1E3A8A]">
          <Plus className="h-4 w-4 mr-2" /> Tambah
        </Button>
      </div>

      {renderExtra?.(rows)}

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="text-left px-4 py-3 font-medium text-slate-600">{c.label}</th>
                ))}
                <th className="text-right px-4 py-3 font-medium text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={columns.length + 1} className="text-center py-10 text-slate-400">Belum ada data.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b hover:bg-slate-50">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">{c.render ? c.render(r) : String(r[c.key] ?? "—")}</td>
                  ))}
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-red-600" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Tambah"} {title}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.key} className={f.colSpan === 2 || f.type === "textarea" || f.type === "richtext" ? "col-span-2" : "col-span-2 md:col-span-1"}>
                <Label className="mb-1 block">{f.label}{f.required && <span className="text-red-500"> *</span>}</Label>
                {f.type === "richtext" ? (
                  <RichTextEditor value={form[f.key] ?? ""} onChange={(v) => setForm({ ...form, [f.key]: v })} minHeight="240px" />
                ) : f.type === "textarea" ? (
                  <Textarea rows={4} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />
                ) : f.type === "boolean" ? (
                  <div className="flex items-center gap-2 h-10"><Switch checked={!!form[f.key]} onCheckedChange={(v) => setForm({ ...form, [f.key]: v })} /><span className="text-sm text-slate-500">{form[f.key] ? "Aktif" : "Nonaktif"}</span></div>
                ) : f.type === "select" ? (
                  <Select value={form[f.key] ?? ""} onValueChange={(v) => setForm({ ...form, [f.key]: v })}>
                    <SelectTrigger><SelectValue placeholder={f.placeholder ?? "Pilih…"} /></SelectTrigger>
                    <SelectContent>{f.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : f.type === "datetime" ? "datetime-local" : f.type === "date" ? "date" : f.type === "color" ? "color" : "text"}
                    value={f.type === "datetime" && form[f.key] ? new Date(form[f.key]).toISOString().slice(0,16) : (form[f.key] ?? "")}
                    onChange={(e) => {
                      let v: any = e.target.value;
                      if (f.type === "datetime" && v) v = new Date(v).toISOString();
                      setForm({ ...form, [f.key]: v });
                    }}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button disabled={loading} onClick={save} className="bg-[#1E40AF] hover:bg-[#1E3A8A]">{loading ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus data?</AlertDialogTitle>
            <AlertDialogDescription>Data yang dihapus tidak dapat dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
