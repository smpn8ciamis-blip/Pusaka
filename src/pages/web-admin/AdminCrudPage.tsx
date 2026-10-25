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
import { Plus, Pencil, Trash2, Search, Loader2, Inbox } from "lucide-react";
import { RichTextEditor } from "@/components/cbt/RichTextEditor";
import ImageField from "@/components/web-admin/ImageField";

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

// <input type="datetime-local"> memakai waktu lokal, bukan UTC.
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function AdminCrudPage({ title, description, table, columns, fields, orderBy, defaults, extraSelect, renderExtra }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    let q: any = (supabase.from(table as any) as any).select(extraSelect ?? "*");
    if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    const { data, error } = await q;
    setFetching(false);
    if (error) return toast.error(error.message);
    setRows(data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [table]);

  const openNew = () => { setEditing(null); setForm({ ...(defaults ?? {}) }); setOpen(true); };
  const openEdit = (row: any) => { setEditing(row); setForm({ ...row }); setOpen(true); };

  const save = async () => {
    const missing = fields.filter((f) => f.required && (form[f.key] === undefined || form[f.key] === null || String(form[f.key]).trim() === ""));
    if (missing.length) return toast.error(`Wajib diisi: ${missing.map((f) => f.label).join(", ")}`);
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

  const q = search.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) => [...columns.map((c) => c.key), ...fields.map((f) => f.key)].some((k) => typeof r[k] !== "object" && String(r[k] ?? "").toLowerCase().includes(q)))
    : rows;
  const isImg = (k: string) => /image/.test(k);
  const titleCol = columns.find((c) => !isImg(c.key)) ?? columns[0];
  const thumbCol = columns.find((c) => isImg(c.key));
  const restCols = columns.filter((c) => c !== titleCol && c !== thumbCol);
  const cell = (c: { key: string; render?: (row: any) => ReactNode }, r: any) => (c.render ? c.render(r) : String(r[c.key] ?? "—"));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        <Button onClick={openNew} className="h-11 w-full rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A] sm:h-10 sm:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Tambah
        </Button>
      </div>

      {renderExtra?.(rows)}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari…" className="h-11 rounded-xl bg-white pl-9 sm:h-10 sm:max-w-sm" />
      </div>

      {fetching ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-100 bg-white py-16 text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat…</div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-slate-100 bg-white py-14 text-slate-400">
          <Inbox className="mb-2 h-8 w-8" />
          {rows.length === 0 ? "Belum ada data." : "Tidak ada data yang cocok."}
        </div>
      ) : (
        <>
          {/* Kartu: HP */}
          <div className="space-y-3 md:hidden">
            {shown.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  {thumbCol && <div className="shrink-0">{cell(thumbCol, r)}</div>}
                  <div className="min-w-0 flex-1 font-semibold text-slate-900 [overflow-wrap:anywhere]">{cell(titleCol, r)}</div>
                </div>
                {restCols.length > 0 && (
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    {restCols.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-[11px] uppercase tracking-wide text-slate-400">{c.label}</dt>
                        <dd className="text-slate-700 [overflow-wrap:anywhere]">{cell(c, r)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="mt-3 flex gap-2 border-t pt-3">
                  <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => openEdit(r)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
                  <Button variant="outline" className="h-10 flex-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDeleteId(r.id)}><Trash2 className="mr-2 h-4 w-4" /> Hapus</Button>
                </div>
              </div>
            ))}
          </div>

          {/* Tabel: tablet/desktop */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key} className="px-4 py-3 text-left font-medium text-slate-600">{c.label}</th>
                    ))}
                    <th className="px-4 py-3 text-right font-medium text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/70">
                      {columns.map((c) => (
                        <td key={c.key} className="px-4 py-3 align-middle">{cell(c, r)}</td>
                      ))}
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-red-600" onClick={() => setDeleteId(r.id)} aria-label="Hapus"><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Tambah"} {title}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.colSpan === 2 || f.type === "textarea" || f.type === "richtext" || f.type === "image" ? "sm:col-span-2" : ""}>
                <Label className="mb-1 block">{f.label}{f.required && <span className="text-red-500"> *</span>}</Label>
                {f.type === "richtext" ? (
                  <RichTextEditor value={form[f.key] ?? ""} onChange={(v) => setForm({ ...form, [f.key]: v })} minHeight="240px" />
                ) : f.type === "image" ? (
                  <ImageField value={form[f.key] ?? ""} onChange={(v) => setForm((prev: any) => ({ ...prev, [f.key]: v }))} folder={table.replace(/^website_/, "")} placeholder={f.placeholder} />
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
                    inputMode={f.type === "number" ? "numeric" : f.type === "url" ? "url" : undefined}
                    value={f.type === "datetime" && form[f.key] ? toLocalInput(form[f.key]) : (form[f.key] ?? "")}
                    onChange={(e) => {
                      let v: any = e.target.value;
                      if (f.type === "datetime") v = v ? new Date(v).toISOString() : null;
                      setForm({ ...form, [f.key]: v });
                    }}
                    placeholder={f.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="h-11 rounded-xl sm:h-10" onClick={() => setOpen(false)}>Batal</Button>
            <Button disabled={loading} onClick={save} className="h-11 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A] sm:h-10">{loading ? "Menyimpan…" : "Simpan"}</Button>
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
