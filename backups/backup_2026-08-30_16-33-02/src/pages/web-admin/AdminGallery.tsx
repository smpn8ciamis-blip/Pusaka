import { useEffect, useState } from "react";
import AdminCrudPage from "./AdminCrudPage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Images } from "lucide-react";

function ItemsManager() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ media_url: "", caption: "" });

  useEffect(() => {
    (supabase.from("website_gallery_albums" as any) as any).select("id, title").order("created_at", { ascending: false }).then(({ data }: any) => setAlbums(data ?? []));
  }, []);

  useEffect(() => {
    if (!selected) { setItems([]); return; }
    (supabase.from("website_gallery_items" as any) as any).select("*").eq("album_id", selected).order("sort_order").then(({ data }: any) => setItems(data ?? []));
  }, [selected]);

  const add = async () => {
    if (!selected || !form.media_url) return toast.error("Pilih album & isi URL");
    const { error } = await (supabase.from("website_gallery_items" as any) as any).insert({ album_id: selected, ...form });
    if (error) return toast.error(error.message);
    setForm({ media_url: "", caption: "" });
    setOpen(false);
    const { data } = await (supabase.from("website_gallery_items" as any) as any).select("*").eq("album_id", selected).order("sort_order");
    setItems(data ?? []);
  };

  const del = async (id: string) => {
    await (supabase.from("website_gallery_items" as any) as any).delete().eq("id", id);
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div className="mb-6 p-4 bg-white rounded-2xl border border-slate-100">
      <div className="flex items-center gap-3 mb-3">
        <Images className="h-5 w-5 text-[#1E40AF]" />
        <h3 className="font-semibold">Kelola Foto per Album</h3>
      </div>
      <div className="flex gap-2 mb-3">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="flex-1 border rounded-md px-3 py-2 text-sm">
          <option value="">— Pilih Album —</option>
          {albums.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!selected} className="bg-[#1E40AF] hover:bg-[#1E3A8A]"><Plus className="h-4 w-4 mr-1" /> Foto</Button>
      </div>
      <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
        {items.map((i) => (
          <div key={i.id} className="relative aspect-square rounded overflow-hidden bg-slate-100 group">
            <img src={i.media_url} alt="" className="w-full h-full object-cover" />
            <button onClick={() => del(i.id)} className="absolute top-1 right-1 bg-red-500 text-white rounded p-1 opacity-0 group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Foto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>URL Gambar</Label><Input value={form.media_url} onChange={(e) => setForm({ ...form, media_url: e.target.value })} /></div>
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
        defaults={{ is_published: true }}
        columns={[
          { key: "title", label: "Judul" },
          { key: "slug", label: "Slug" },
          { key: "event_date", label: "Tanggal" },
          { key: "is_published", label: "Publik", render: (r) => r.is_published ? "Ya" : "Tidak" },
        ]}
        fields={[
          { key: "title", label: "Judul", required: true },
          { key: "slug", label: "Slug", required: true },
          { key: "description", label: "Deskripsi", type: "textarea", colSpan: 2 },
          { key: "cover_image_url", label: "URL Cover", type: "url", colSpan: 2 },
          { key: "event_date", label: "Tanggal Kegiatan", type: "date" },
          { key: "is_published", label: "Publikasikan", type: "boolean" },
        ]}
        renderExtra={() => <ItemsManager />}
      />
    </div>
  );
}
