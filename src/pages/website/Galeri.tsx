import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHero } from "./Profil";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Images } from "lucide-react";

export default function Galeri() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    (supabase.from("website_gallery_albums" as any) as any)
      .select("*").eq("is_published", true).order("created_at", { ascending: false })
      .then(({ data }: any) => setAlbums(data ?? []));
  }, []);

  useEffect(() => {
    if (!active) return;
    (supabase.from("website_gallery_items" as any) as any)
      .select("*").eq("album_id", active.id).order("sort_order")
      .then(({ data }: any) => setItems(data ?? []));
  }, [active]);

  return (
    <div>
      <PageHero title="Galeri" subtitle="Dokumentasi kegiatan, momen, dan prestasi sekolah." />
      <div className="container mx-auto px-4 py-16">
        {!active ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {albums.map((a) => (
              <button key={a.id} onClick={() => setActive(a)} className="group text-left bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl border border-slate-100 transition">
                <div className="aspect-video bg-slate-100">
                  {a.cover_image_url ? <img src={a.cover_image_url} alt={a.title} className="w-full h-full object-cover group-hover:scale-105 transition" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Images className="h-12 w-12" /></div>}
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-slate-900 group-hover:text-[#1E40AF]">{a.title}</h3>
                  {a.event_date && <div className="text-xs text-slate-500 mt-1">{new Date(a.event_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>}
                  {a.description && <p className="text-sm text-slate-600 mt-2 line-clamp-2">{a.description}</p>}
                </div>
              </button>
            ))}
            {albums.length === 0 && <div className="col-span-full text-center py-16 text-slate-500">Belum ada album.</div>}
          </div>
        ) : (
          <div>
            <button onClick={() => setActive(null)} className="text-sm text-[#1E40AF] mb-4">← Kembali</button>
            <h2 className="text-2xl font-bold mb-6">{active.title}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((it) => (
                <button key={it.id} onClick={() => setPreview(it.media_url)} className="aspect-square rounded-lg overflow-hidden bg-slate-100">
                  <img src={it.media_url} alt={it.caption ?? ""} className="w-full h-full object-cover hover:scale-105 transition" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl p-0 bg-transparent border-0">
          {preview && <img src={preview} alt="" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
