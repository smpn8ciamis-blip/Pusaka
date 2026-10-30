import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Images, Newspaper, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHero } from "./Profil";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fetchAutoAlbums, fetchNewsPhotos } from "@/lib/websiteGallery";

type Card = {
  key: string;
  kind: "album" | "berita";
  id: string;
  slug?: string;
  title: string;
  description?: string | null;
  cover: string | null;
  date: string | null;
};
type Filter = "semua" | "album" | "berita";
const PAGE = 12;

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }) : "";

export default function Galeri() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [filter, setFilter] = useState<Filter>("semua");
  const [visible, setVisible] = useState(PAGE);
  const [active, setActive] = useState<Card | null>(null);
  const [photos, setPhotos] = useState<{ url: string; caption?: string | null }[] | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  // Album manual + "album" otomatis dari gambar berita, digabung dan diurutkan menurut tanggal.
  useEffect(() => {
    (async () => {
      const [alb, auto] = await Promise.all([
        (supabase.from("website_gallery_albums" as any) as any)
          .select("id,title,description,cover_image_url,event_date,created_at").eq("is_published", true).order("created_at", { ascending: false }),
        fetchAutoAlbums(100),
      ]);
      const manual: Card[] = ((alb.data ?? []) as any[]).map((a) => ({
        key: `album-${a.id}`, kind: "album", id: a.id, title: a.title, description: a.description, cover: a.cover_image_url, date: a.event_date ?? a.created_at,
      }));
      const fromNews: Card[] = auto.map((a) => ({ key: a.id, kind: "berita", id: a.id, slug: a.slug, title: a.title, cover: a.cover_image_url, date: a.date }));
      setCards([...manual, ...fromNews].sort((x, y) => String(y.date ?? "").localeCompare(String(x.date ?? ""))));
    })();
  }, []);

  useEffect(() => { setVisible(PAGE); }, [filter]);

  // Foto isi album yang dibuka
  useEffect(() => {
    if (!active) { setPhotos(null); return; }
    setPhotos(null);
    let on = true;
    (async () => {
      if (active.kind === "berita") {
        const urls = await fetchNewsPhotos(active.slug!);
        if (on) setPhotos(urls.map((url) => ({ url })));
      } else {
        const { data } = await (supabase.from("website_gallery_items" as any) as any)
          .select("id,media_url,caption").eq("album_id", active.id).order("sort_order");
        if (on) setPhotos(((data ?? []) as any[]).map((i) => ({ url: i.media_url, caption: i.caption })));
      }
    })();
    return () => { on = false; };
  }, [active]);

  const shown = useMemo(() => (cards ?? []).filter((c) => filter === "semua" || c.kind === filter), [cards, filter]);
  const page = shown.slice(0, visible);

  // Navigasi lightbox dengan papan ketik
  useEffect(() => {
    if (lightbox === null || !photos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setLightbox((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setLightbox((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, photos]);

  const chip = (f: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(f)}
      aria-pressed={filter === f}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === f ? "bg-[#1E40AF] text-white shadow" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <PageHero title="Galeri" subtitle="Dokumentasi kegiatan, momen, dan prestasi sekolah." />
      <div className="container mx-auto px-4 py-12 md:py-16">
        {!active ? (
          <>
            <div className="mb-8 flex flex-wrap gap-2">
              {chip("semua", "Semua")}
              {chip("album", "Album Kegiatan")}
              {chip("berita", "Dari Berita")}
            </div>

            {cards === null ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
                {[0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-slate-100" />)}
              </div>
            ) : page.length === 0 ? (
              <div className="py-16 text-center text-slate-500">Belum ada foto.</div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {page.map((c) => (
                  <button key={c.key} onClick={() => setActive(c)} className="group relative block aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100 text-left shadow-sm ring-1 ring-slate-200/70 transition hover:shadow-xl">
                    {c.cover
                      ? <img src={c.cover} alt={c.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      : <div className="flex h-full w-full items-center justify-center text-slate-300"><Images className="h-12 w-12" /></div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent" />
                    {c.kind === "berita" && (
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#1E40AF] backdrop-blur">
                        <Newspaper className="h-3 w-3" /> Berita
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                      <h3 className="line-clamp-2 font-bold leading-snug">{c.title}</h3>
                      {c.date && <div className="mt-1 text-xs text-white/75">{fmtDate(c.date)}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {shown.length > page.length && (
              <div className="mt-8 text-center">
                <button onClick={() => setVisible((v) => v + PAGE)} className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                  Muat lebih banyak
                </button>
              </div>
            )}
          </>
        ) : (
          <div>
            <button onClick={() => setActive(null)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1E40AF] hover:underline">
              <ArrowLeft className="h-4 w-4" /> Semua galeri
            </button>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{active.title}</h2>
                {active.date && <div className="mt-1 text-sm text-slate-500">{fmtDate(active.date)}</div>}
                {active.description && <p className="mt-2 max-w-2xl text-slate-600">{active.description}</p>}
              </div>
              {active.kind === "berita" && (
                <Link to={`/website/berita/${active.slug}`} className="inline-flex items-center gap-2 rounded-full bg-[#1E40AF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E3A8A]">
                  <Newspaper className="h-4 w-4" /> Baca berita
                </Link>
              )}
            </div>

            {photos === null ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-square animate-pulse rounded-xl bg-slate-100" />)}
              </div>
            ) : photos.length === 0 ? (
              <div className="py-16 text-center text-slate-500">Belum ada foto pada album ini.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {photos.map((p, i) => (
                  <button key={p.url + i} onClick={() => setLightbox(i)} className="group aspect-square overflow-hidden rounded-xl bg-slate-100">
                    <img src={p.url} alt={p.caption ?? active.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox dengan panah kiri/kanan */}
      <Dialog open={lightbox !== null} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none [&>button]:hidden">
          <DialogTitle className="sr-only">Pratinjau foto</DialogTitle>
          {photos && lightbox !== null && photos[lightbox] && (
            <div className="relative">
              <img src={photos[lightbox].url} alt={photos[lightbox].caption ?? active?.title ?? ""} className="mx-auto max-h-[82vh] w-auto max-w-full rounded-xl object-contain" />
              {photos[lightbox].caption && <p className="mt-2 text-center text-sm text-white">{photos[lightbox].caption}</p>}
              <button onClick={() => setLightbox(null)} aria-label="Tutup" className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"><X className="h-5 w-5" /></button>
              {photos.length > 1 && (
                <>
                  <button onClick={() => setLightbox((lightbox - 1 + photos.length) % photos.length)} aria-label="Foto sebelumnya" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"><ChevronLeft className="h-6 w-6" /></button>
                  <button onClick={() => setLightbox((lightbox + 1) % photos.length)} aria-label="Foto berikutnya" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"><ChevronRight className="h-6 w-6" /></button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{lightbox + 1} / {photos.length}</div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
