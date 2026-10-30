// Galeri otomatis: foto yang diunggah pada berita (gambar cover + gambar di dalam isi berita)
// ikut tampil di Galeri tanpa admin mengunggah ulang. Tidak ada perubahan basis data.
import { supabase } from "@/integrations/supabase/client";

const asAny = (t: string) => supabase.from(t as any) as any;

export interface AutoAlbum {
  kind: "berita";
  id: string;       // "berita-<id>"
  title: string;
  slug: string;
  cover_image_url: string;
  date: string | null;
}

/** Ambil alamat gambar dari HTML isi berita (hanya http(s) atau jalur relatif; data: diabaikan). */
export function extractImageUrls(html?: string | null): string[] {
  if (!html) return [];
  const out: string[] = [];
  const re = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const u = (m[1] ?? m[2] ?? "").trim();
    if (u && !/^data:/i.test(u) && (/^https?:\/\//i.test(u) || u.startsWith("/"))) out.push(u);
  }
  return out;
}

const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean)));

/** Daftar "album" otomatis: satu per berita terbit yang punya gambar cover. Ringan (tanpa isi berita). */
export async function fetchAutoAlbums(limit = 100): Promise<AutoAlbum[]> {
  const { data, error } = await asAny("website_news")
    .select("id,title,slug,cover_image_url,published_at")
    .eq("status", "published").not("cover_image_url", "is", null)
    .order("published_at", { ascending: false }).limit(limit);
  if (error) return [];
  return ((data ?? []) as any[])
    .filter((n) => n.cover_image_url)
    .map((n) => ({ kind: "berita" as const, id: `berita-${n.id}`, title: n.title, slug: n.slug, cover_image_url: n.cover_image_url, date: n.published_at }));
}

/** Semua foto satu berita: cover + gambar di dalam isinya. Isi berita hanya diambil saat album dibuka. */
export async function fetchNewsPhotos(slug: string): Promise<string[]> {
  const { data } = await asAny("website_news").select("cover_image_url,content").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!data) return [];
  return uniq([data.cover_image_url, ...extractImageUrls(data.content)]);
}

/** Foto terbaru untuk mosaik di beranda: foto album galeri (album terbit) + cover berita, tanpa duplikat. */
export async function fetchRecentPhotos(n = 8): Promise<{ url: string; title: string; href: string }[]> {
  const [items, news] = await Promise.all([
    asAny("website_gallery_items")
      .select("media_url,caption,created_at,website_gallery_albums!inner(title,is_published)")
      .eq("website_gallery_albums.is_published", true).order("created_at", { ascending: false }).limit(n),
    asAny("website_news").select("title,slug,cover_image_url,published_at")
      .eq("status", "published").not("cover_image_url", "is", null).order("published_at", { ascending: false }).limit(n),
  ]);
  const a = ((items.error ? [] : items.data ?? []) as any[]).map((i) => ({
    url: i.media_url as string, title: (i.caption || i.website_gallery_albums?.title || "Galeri") as string, href: "/website/galeri", at: i.created_at as string,
  }));
  const b = ((news.error ? [] : news.data ?? []) as any[]).map((x) => ({
    url: x.cover_image_url as string, title: x.title as string, href: `/website/berita/${x.slug}`, at: x.published_at as string,
  }));
  const seen = new Set<string>();
  return [...a, ...b]
    .sort((x, y) => String(y.at).localeCompare(String(x.at)))
    .filter((p) => p.url && !seen.has(p.url) && !!seen.add(p.url))
    .slice(0, n)
    .map(({ url, title, href }) => ({ url, title, href }));
}
