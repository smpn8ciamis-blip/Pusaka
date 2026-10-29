import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHero } from "./Profil";
import { ArrowLeft, ChevronLeft, ChevronRight, Images, Newspaper, X, ExternalLink, Camera } from "lucide-react";
import { newsToAlbums, type GalleryAlbum, type GalleryPhoto, type NewsRow } from "@/lib/newsImages";

const asAny = (t: string) => supabase.from(t as any) as any;

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "";

type Tab = "album" | "foto";
type Source = "semua" | "berita" | "album";
type FlatPhoto = GalleryPhoto & { albumTitle: string; href?: string };

/** Foto yang gagal dimuat (URL rusak) disembunyikan agar galeri tetap rapi. */
function PhotoTile({ photo, onOpen, label }: { photo: GalleryPhoto; onOpen: () => void; label?: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2"
    >
      <img
        src={photo.url}
        alt={photo.caption ?? label ?? ""}
        loading="lazy"
        decoding="async"
        onError={() => setBad(true)}
        className="h-auto w-full object-cover transition duration-500 group-hover:scale-[1.03]"
      />
      {label && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-left text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 line-clamp-2">
          {label}
        </span>
      )}
    </button>
  );
}

function Lightbox({ photos, index, onIndex, onClose }: { photos: FlatPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const cur = photos[index];
  const prev = useCallback(() => onIndex((index - 1 + photos.length) % photos.length), [index, photos.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % photos.length), [index, photos.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [prev, next, onClose]);

  if (!cur) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95" role="dialog" aria-modal="true" aria-label="Pratinjau foto">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{cur.albumTitle}</div>
          <div className="text-xs text-white/60">{index + 1} dari {photos.length} foto</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {cur.href && (
            <Link to={cur.href} onClick={onClose} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20">
              <Newspaper className="h-3.5 w-3.5" /> Baca berita
            </Link>
          )}
          <a href={cur.url} target="_blank" rel="noreferrer" aria-label="Buka gambar asli" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
            <ExternalLink className="h-4 w-4" />
          </a>
          <button onClick={onClose} aria-label="Tutup" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4" onClick={onClose}>
        <img
          key={cur.url}
          src={cur.url}
          alt={cur.caption ?? cur.albumTitle}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
        {photos.length > 1 && (
          <>
            <button onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Foto sebelumnya" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/25 md:left-6">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Foto berikutnya" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/25 md:right-6">
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
      {cur.caption && cur.caption !== cur.albumTitle && (
        <div className="px-4 pb-5 text-center text-sm text-white/80">{cur.caption}</div>
      )}
    </div>
  );
}

function AlbumCard({ album, onOpen }: { album: GalleryAlbum; onOpen: () => void }) {
  const [bad, setBad] = useState(false);
  return (
    <button
      onClick={onOpen}
      className="group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2"
    >
      {!bad ? (
        <img
          src={album.cover} alt="" loading="lazy" decoding="async" onError={() => setBad(true)}
          className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400"><Images className="h-12 w-12" /></div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
      <div className="absolute left-3 top-3 flex gap-2">
        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-800 backdrop-blur">
          {album.photos.length} foto
        </span>
        {album.source === "berita" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#1E40AF]/90 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            <Newspaper className="h-3 w-3" /> Dari berita
          </span>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-white">{album.title}</h3>
        {album.date && <div className="mt-1 text-xs text-white/70">{fmtDate(album.date)}</div>}
      </div>
    </button>
  );
}

export default function Galeri() {
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("album");
  const [source, setSource] = useState<Source>("semua");
  const [active, setActive] = useState<GalleryAlbum | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: FlatPhoto[]; index: number } | null>(null);
  const [visible, setVisible] = useState(24);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Album otomatis: foto sampul + gambar di dalam isi setiap berita terbit
      const newsReq = asAny("website_news")
        .select("id,title,slug,cover_image_url,content,published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(120);
      // 2) Album manual dari panel admin (tetap ditampilkan)
      const albumReq = asAny("website_gallery_albums").select("*").eq("is_published", true).order("created_at", { ascending: false });

      const [newsRes, albumRes] = await Promise.all([newsReq, albumReq]);
      const auto = newsToAlbums((newsRes.data ?? []) as NewsRow[]);

      const manualRows: any[] = albumRes.data ?? [];
      let manual: GalleryAlbum[] = [];
      if (manualRows.length) {
        const { data: items } = await asAny("website_gallery_items")
          .select("album_id,media_url,caption,media_type,sort_order")
          .in("album_id", manualRows.map((a) => a.id))
          .order("sort_order");
        const byAlbum = new Map<string, GalleryPhoto[]>();
        (items ?? []).forEach((it: any) => {
          if (it.media_type && it.media_type !== "image") return;
          const list = byAlbum.get(it.album_id) ?? [];
          list.push({ url: it.media_url, caption: it.caption });
          byAlbum.set(it.album_id, list);
        });
        manual = manualRows
          .map((a): GalleryAlbum | null => {
            const photos = byAlbum.get(a.id) ?? [];
            const cover = a.cover_image_url || photos[0]?.url;
            if (!cover) return null;
            return {
              key: `album-${a.id}`, source: "album", title: a.title, description: a.description,
              date: a.event_date ?? a.created_at, cover, photos: photos.length ? photos : [{ url: cover, caption: a.title }],
            };
          })
          .filter(Boolean) as GalleryAlbum[];
      }

      if (cancelled) return;
      const all = [...manual, ...auto].sort((a, b) => (new Date(b.date ?? 0).getTime()) - (new Date(a.date ?? 0).getTime()));
      setAlbums(all);
      setLoading(false);
    })().catch(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => albums.filter((a) => source === "semua" || a.source === source), [albums, source]);
  const flat = useMemo<FlatPhoto[]>(() => {
    const seen = new Set<string>();
    const out: FlatPhoto[] = [];
    for (const a of filtered) for (const p of a.photos) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      out.push({ ...p, albumTitle: a.title, href: a.href });
    }
    return out;
  }, [filtered]);

  const totalPhotos = flat.length;
  const counts = useMemo(() => ({
    semua: albums.length,
    berita: albums.filter((a) => a.source === "berita").length,
    album: albums.filter((a) => a.source === "album").length,
  }), [albums]);

  const openAlbumPhotos = (album: GalleryAlbum, i: number) =>
    setLightbox({ photos: album.photos.map((p) => ({ ...p, albumTitle: album.title, href: album.href })), index: i });

  const SOURCES: { id: Source; label: string }[] = [
    { id: "semua", label: "Semua" },
    { id: "berita", label: "Dari berita" },
    { id: "album", label: "Album kegiatan" },
  ];

  return (
    <div>
      <PageHero title="Galeri" subtitle="Dokumentasi kegiatan, momen, dan prestasi sekolah. Foto dari berita yang terbit masuk ke sini secara otomatis." />
      <div className="container mx-auto px-4 py-12">
        {active ? (
          <div>
            <button onClick={() => setActive(null)} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#1E40AF] hover:underline">
              <ArrowLeft className="h-4 w-4" /> Semua album
            </button>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{active.title}</h2>
                <div className="mt-1 text-sm text-slate-500">
                  {active.photos.length} foto{active.date ? `, ${fmtDate(active.date)}` : ""}
                </div>
                {active.description && <p className="mt-2 max-w-2xl text-slate-600">{active.description}</p>}
              </div>
              {active.href && (
                <Link to={active.href} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:border-[#1E40AF] hover:text-[#1E40AF]">
                  <Newspaper className="h-4 w-4" /> Baca beritanya
                </Link>
              )}
            </div>
            <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
              {active.photos.map((p, i) => (
                <PhotoTile key={p.url} photo={p} onOpen={() => openAlbumPhotos(active, i)} />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div role="tablist" className="inline-flex w-fit rounded-full bg-slate-100 p-1">
                {([["album", `Album (${filtered.length})`], ["foto", `Semua foto (${totalPhotos})`]] as [Tab, string][]).map(([id, label]) => (
                  <button
                    key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {SOURCES.map((s) => (
                  <button
                    key={s.id} onClick={() => { setSource(s.id); setVisible(24); }}
                    className={`rounded-full border px-3.5 py-1.5 text-sm transition ${source === s.id ? "border-[#1E40AF] bg-[#1E40AF] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {s.label} <span className="opacity-60">{counts[s.id]}</span>
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-slate-100" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-300 py-16 text-center">
                <Camera className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="font-medium text-slate-700">Belum ada foto di kategori ini.</p>
                <p className="mt-1 text-sm text-slate-500">Foto akan muncul otomatis setelah berita dengan gambar diterbitkan.</p>
              </div>
            ) : tab === "album" ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((a) => <AlbumCard key={a.key} album={a} onOpen={() => setActive(a)} />)}
              </div>
            ) : (
              <>
                <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
                  {flat.slice(0, visible).map((p, i) => (
                    <PhotoTile key={p.url} photo={p} label={p.albumTitle} onOpen={() => setLightbox({ photos: flat, index: i })} />
                  ))}
                </div>
                {visible < flat.length && (
                  <div className="mt-8 text-center">
                    <button onClick={() => setVisible((v) => v + 24)} className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-800 hover:border-[#1E40AF] hover:text-[#1E40AF]">
                      Tampilkan lebih banyak ({flat.length - visible} lagi)
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {lightbox && (
        <Lightbox
          photos={lightbox.photos}
          index={lightbox.index}
          onIndex={(i) => setLightbox((l) => (l ? { ...l, index: i } : l))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
