import { useEffect, useState } from "react";
import AdminCrudPage from "./AdminCrudPage";
import { YesNo, cardCls } from "@/components/web-admin/ui";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Images, Loader2, Upload } from "lucide-react";
import { useRef } from "react";
import ImageField from "@/components/web-admin/ImageField";
import { uploadWebsiteImage } from "@/lib/websiteMedia";

function ItemsManager() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ media_url: "", caption: "" });
  const [busy, setBusy] = useState(false);
  const multiRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (supabase.from("website_gallery_albums" as any) as any).select("id, title").order("created_at", { ascending: false }).then(({ data }: any) => setAlbums(data ?? []));
  }, []);

  useEffect(() => {
    if (!selected) { setItems([]); return; }
    (supabase.from("website_gallery_items" as any) as any).select("id,media_url").eq("album_id", selected).order("sort_order").then(({ data }: any) => setItems(data ?? []));
  }, [selected]);

  const add = async () => {
    if (!selected || !form.media_url) return toast.error("Pilih album & isi URL");
    const { error } = await (supabase.from("website_gallery_items" as any) as any).insert({ album_id: selected, ...form });
    if (error) return toast.error(error.message);
    setForm({ media_url: "", caption: "" });
    setOpen(false);
    const { data } = await (supabase.from("website_gallery_items" as any) as any).select("id,media_url").eq("album_id", selected).order("sort_order");
    setItems(data ?? []);
  };

  const del = async (id: string) => {
    if (!confirm("Hapus foto ini?")) return;
    const { error } = await (supabase.from("website_gallery_items" as any) as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems(items.filter((i) => i.id !== id));
  };

  // Unggah banyak foto sekaligus (dari galeri/kamera HP) ke album terpilih
  const uploadMany = async (files: FileList | null) => {
    if (!files || !files.length || !selected) return;
    setBusy(true);
    let ok = 0;
    const base = items.length;
    for (const file of Array.from(files)) {
      try {
        const url = await uploadWebsiteImage(file, "gallery");
        const { error } = await (supabase.from("website_gallery_items" as any) as any).insert({ album_id: selected, media_url: url, sort_order: base + ok });
        if (error) throw error;
        ok++;
      } catch (e: any) {
        toast.error(`${file.name}: ${e?.message ?? "gagal"}`);
      }
    }
    setBusy(false);
    if (multiRef.current) multiRef.current.value = "";
    if (ok) toast.success(`${ok} foto ditambahkan`);
    const { data } = await (supabase.from("website_gallery_items" as any) as any).select("id,media_url").eq("album_id", selected).order("sort_order");
    setItems(data ?? []);
  };

  return (
    <div className={`mb-6 p-4 ${cardCls}`}>
      <div className="flex items-center gap-3 mb-3">
        <Images className="h-5 w-5 text-[#1E40AF]" />
        <h3 className="font-semibold">Kelola Foto per Album</h3>
      </div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="h-11 flex-1 rounded-xl border bg-white px-3 text-sm sm:h-10">
          <option value="">— Pilih Album —</option>
          {albums.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        <input ref={multiRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadMany(e.target.files)} />
        <div className="flex gap-2">
          <Button onClick={() => multiRef.current?.click()} disabled={!selected || busy} className="h-11 flex-1 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A] sm:h-10 sm:flex-none">
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Unggah Foto
          </Button>
          <Button variant="outline" onClick={() => setOpen(true)} disabled={!selected} className="h-11 rounded-xl sm:h-10"><Plus className="mr-1 h-4 w-4" /> URL</Button>
        </div>
      </div>
      {selected && items.length === 0 && <div className="py-6 text-center text-sm text-slate-400">Album ini belum punya foto.</div>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {items.map((i) => (
          <div key={i.id} className="relative aspect-square rounded overflow-hidden bg-slate-100 group">
            <img src={i.media_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            <button onClick={() => del(i.id)} aria-label="Hapus foto" className="absolute top-1 right-1 rounded bg-red-500 p-1.5 text-white sm:opacity-0 sm:group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg rounded-2xl">
          <DialogHeader><DialogTitle>Tambah Foto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Gambar</Label><ImageField value={form.media_url} onChange={(v) => setForm((p) => ({ ...p, media_url: v }))} folder="gallery" /></div>
            <div><Label>Caption</Label><Input value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={add} className="bg-[#1E40AF] hover:bg-[#1E3A8A]">Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminGallery() {
  return (
    <div>
      <AdminCrudPage
        title="Album Galeri"
        description="Kelola album galeri foto/video kegiatan sekolah."
        table="website_gallery_albums"
        orderBy={{ column: "created_at", ascending: false }}
        thumbKey="cover_image_url"
        defaults={{ is_published: true }}
        columns={[
          { key: "title", label: "Judul" },
          { key: "slug", label: "Slug" },
          { key: "event_date", label: "Tanggal" },
          { key: "is_published", label: "Publik", render: (r) => <YesNo value={r.is_published} /> },
        ]}
        fields={[
          { key: "title", label: "Judul", required: true },
          { key: "slug", label: "Slug", required: true },
          { key: "description", label: "Deskripsi", type: "textarea", colSpan: 2 },
          { key: "cover_image_url", label: "Foto Cover", type: "image", colSpan: 2 },
          { key: "event_date", label: "Tanggal Kegiatan", type: "date" },
          { key: "is_published", label: "Publikasikan", type: "boolean" },
        ]}
        renderExtra={() => <ItemsManager />}
      />
    </div>
  );
}
