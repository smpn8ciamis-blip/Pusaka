import { lazy, ReactNode, Suspense, useDeferredValue, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Loader2, ImageIcon } from "lucide-react";
import ImageField from "@/components/web-admin/ImageField";
import { PageHeader, EmptyState, ListSkeleton, cardCls, useIsNarrow } from "@/components/web-admin/ui";

// Editor teks kaya (Tiptap) cukup berat: baru dimuat saat formulir yang membutuhkannya dibuka.
const RichTextEditor = lazy(() => import("@/components/cbt/RichTextEditor").then((m) => ({ default: m.RichTextEditor })));

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
  /** Kolom yang diambil untuk DAFTAR (hindari kolom besar seperti isi berita). Baris lengkap diambil saat Edit. */
  listSelect?: string;
  /** @deprecated pakai listSelect */
  extraSelect?: string;
  /** Kolom gambar yang ditampilkan sebagai thumbnail di daftar. */
  thumbKey?: string;
  renderExtra?: (rows: any[]) => ReactNode;
}

const PAGE = 20;     // jumlah baris yang ditampilkan per "muat lebih banyak"
const MAX_ROWS = 500; // batas baris yang diambil sekali jalan

// <input type="datetime-local"> memakai waktu lokal, bukan UTC.
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function Thumb({ src, className = "h-12 w-12" }: { src?: string | null; className?: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" decoding="async" className={`${className} shrink-0 rounded-xl bg-slate-100 object-cover`} />
  ) : (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-300`}><ImageIcon className="h-5 w-5" /></div>
  );
}

export default function AdminCrudPage({ title, description, table, columns, fields, orderBy, defaults, listSelect, extraSelect, thumbKey, renderExtra }: Props) {
  const qc = useQueryClient();
  const isMobile = useIsNarrow();
  const select = listSelect ?? extraSelect ?? "*";
  const partial = select !== "*";
  const queryKey = ["web-admin", table, select, orderBy?.column, orderBy?.ascending ?? true] as const;

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      let q: any = (supabase.from(table as any) as any).select(select).limit(MAX_ROWS);
      if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  useEffect(() => { if (error) toast.error((error as Error).message); }, [error]);
  const reload = () => qc.invalidateQueries({ queryKey: ["web-admin", table] });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const deferredSearch = useDeferredValue(search);
  useEffect(() => { setVisible(PAGE); }, [deferredSearch, table]);

  const openNew = () => { setEditing(null); setForm({ ...(defaults ?? {}) }); setOpen(true); };
  const openEdit = async (row: any) => {
    setEditing(row); setForm({ ...row }); setOpen(true);
    if (!partial) return;
    // Daftar hanya memuat kolom ringan; ambil baris lengkap (mis. isi berita) hanya untuk yang diedit.
    setLoadingFull(true);
    const { data, error } = await (supabase.from(table as any) as any).select("*").eq("id", row.id).maybeSingle();
    setLoadingFull(false);
    if (error || !data) { toast.error(error?.message ?? "Data tidak ditemukan"); setOpen(false); return; }
    setEditing(data); setForm({ ...data });
  };

  const save = async () => {
    const missing = fields.filter((f) => f.required && (form[f.key] === undefined || form[f.key] === null || String(form[f.key]).trim() === ""));
    if (missing.length) return toast.error(`Wajib diisi: ${missing.map((f) => f.label).join(", ")}`);
    setSaving(true);
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
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Berhasil diperbarui" : "Berhasil ditambahkan");
    setOpen(false); reload();
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await (supabase.from(table as any) as any).delete().eq("id", deleteId);
    if (error) return toast.error(error.message);
    toast.success("Berhasil dihapus");
    setDeleteId(null); reload();
  };

  const q = deferredSearch.trim().toLowerCase();
  const matched = q
    ? rows.filter((r) => [...columns.map((c) => c.key), ...fields.map((f) => f.key)].some((k) => typeof r[k] !== "object" && String(r[k] ?? "").toLowerCase().includes(q)))
    : rows;
  const shown = matched.slice(0, visible);

  const isImg = (k: string) => /image/.test(k);
  const titleCol = columns.find((c) => !isImg(c.key)) ?? columns[0];
  const imgCol = columns.find((c) => isImg(c.key));
  const thumbOf = (r: any) => (thumbKey ? r[thumbKey] : null);
  const restCols = columns.filter((c) => c !== titleCol && c !== imgCol);
  const cell = (c: { key: string; render?: (row: any) => ReactNode }, r: any) => (c.render ? c.render(r) : String(r[c.key] ?? "—"));
  const showThumb = !!thumbKey;

  const iconBtn = "h-9 w-9 rounded-lg";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={openNew} className="h-11 w-full rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A] sm:h-10 sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Tambah
          </Button>
        }
      />

      {renderExtra?.(rows)}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari…" className="h-11 rounded-xl bg-white pl-9 sm:h-10 sm:max-w-sm" />
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState>{rows.length === 0 ? "Belum ada data." : "Tidak ada data yang cocok."}</EmptyState>
      ) : isMobile ? (
        /* Kartu: HP */
        <div className="space-y-3">
          {shown.map((r) => (
            <div key={r.id} className={`${cardCls} p-4`}>
              <div className="flex items-start gap-3">
                {showThumb && <Thumb src={thumbOf(r)} />}
                {!showThumb && imgCol && <div className="shrink-0">{cell(imgCol, r)}</div>}
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
              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => openEdit(r)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
                <Button variant="outline" className="h-10 flex-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDeleteId(r.id)}><Trash2 className="mr-2 h-4 w-4" /> Hapus</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Tabel: tablet/desktop */
        <div className={`${cardCls} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr>
                  {showThumb && <th className="w-16 px-4 py-3" aria-label="Gambar" />}
                  {columns.map((c) => (
                    <th key={c.key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    {showThumb && <td className="px-4 py-2.5"><Thumb src={thumbOf(r)} className="h-10 w-10" /></td>}
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-2.5 align-middle ${c === titleCol ? "max-w-[22rem] font-medium text-slate-900 [overflow-wrap:anywhere]" : "text-slate-600"}`}>{cell(c, r)}</td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <Button size="icon" variant="ghost" className={iconBtn} onClick={() => openEdit(r)} aria-label="Edit" title="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className={`${iconBtn} text-red-600 hover:bg-red-50 hover:text-red-700`} onClick={() => setDeleteId(r.id)} aria-label="Hapus" title="Hapus"><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {matched.length > shown.length && (
        <div className="mt-4 flex flex-col items-center gap-1">
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => setVisible((v) => v + PAGE)}>
            Tampilkan lebih banyak
          </Button>
          <span className="text-xs text-slate-400">{shown.length} dari {matched.length}</span>
        </div>
      )}
      {rows.length >= MAX_ROWS && <p className="mt-3 text-center text-xs text-slate-400">Menampilkan {MAX_ROWS} data teratas. Gunakan pencarian untuk menemukan data lain.</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b border-slate-100 px-4 py-4 text-left sm:px-6">
            <DialogTitle>{editing ? "Edit" : "Tambah"} {title}</DialogTitle>
            <DialogDescription className="sr-only">Formulir {title}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            {loadingFull ? (
              <div className="space-y-4" aria-busy="true">
                <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.key} className={f.colSpan === 2 || f.type === "textarea" || f.type === "richtext" || f.type === "image" ? "sm:col-span-2" : ""}>
                    <Label className="mb-1 block">{f.label}{f.required && <span className="text-red-500"> *</span>}</Label>
                    {f.type === "richtext" ? (
                      <Suspense fallback={<Skeleton className="h-60 w-full rounded-lg" />}>
                        <RichTextEditor value={form[f.key] ?? ""} onChange={(v) => setForm((p: any) => ({ ...p, [f.key]: v }))} minHeight="240px" />
                      </Suspense>
                    ) : f.type === "image" ? (
                      <ImageField value={form[f.key] ?? ""} onChange={(v) => setForm((prev: any) => ({ ...prev, [f.key]: v }))} folder={table.replace(/^website_/, "")} placeholder={f.placeholder} />
                    ) : f.type === "textarea" ? (
                      <Textarea rows={4} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />
                    ) : f.type === "boolean" ? (
                      <div className="flex h-10 items-center gap-2"><Switch checked={!!form[f.key]} onCheckedChange={(v) => setForm({ ...form, [f.key]: v })} /><span className="text-sm text-slate-500">{form[f.key] ? "Aktif" : "Nonaktif"}</span></div>
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
            )}
          </div>
          <DialogFooter className="gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:gap-0 sm:px-6">
            <Button variant="outline" className="h-11 rounded-xl sm:h-10" onClick={() => setOpen(false)}>Batal</Button>
            <Button disabled={saving || loadingFull} onClick={save} className="h-11 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A] sm:h-10">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Menyimpan…" : "Simpan"}
            </Button>
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
