// Mengambil gambar otomatis dari berita (foto sampul + gambar di dalam isi berita)
// supaya halaman Galeri terisi tanpa perlu mengunggah ulang.

export type NewsRow = {
  id: string;
  title: string;
  slug: string;
  cover_image_url?: string | null;
  content?: string | null;
  published_at?: string | null;
};

export type GalleryPhoto = {
  url: string;
  caption?: string | null;
};

export type GalleryAlbum = {
  key: string;
  source: "berita" | "album";
  title: string;
  description?: string | null;
  date?: string | null;
  cover: string;
  photos: GalleryPhoto[];
  /** Tautan ke berita asal (hanya untuk album otomatis dari berita). */
  href?: string;
};

const isUsableUrl = (u: string) => /^https?:\/\//i.test(u) || u.startsWith("/");

/** Ambil semua URL <img> dari HTML isi berita (tanpa memuat gambar). */
export function extractImageUrls(html?: string | null): { url: string; alt: string }[] {
  if (!html) return [];
  const out: { url: string; alt: string }[] = [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("img").forEach((img) => {
      const src = (img.getAttribute("src") || img.getAttribute("data-src") || "").trim();
      if (!src || !isUsableUrl(src)) return; // lewati data: URI / kosong
      const w = parseInt(img.getAttribute("width") || "", 10);
      const h = parseInt(img.getAttribute("height") || "", 10);
      if ((w && w <= 48) || (h && h <= 48)) return; // lewati ikon/emoji kecil
      out.push({ url: src, alt: (img.getAttribute("alt") || "").trim() });
    });
  } catch {
    const re = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) if (isUsableUrl(m[1])) out.push({ url: m[1], alt: "" });
  }
  return out;
}

/** Ubah daftar berita menjadi album otomatis (satu album per berita yang punya gambar). */
export function newsToAlbums(rows: NewsRow[]): GalleryAlbum[] {
  const albums: GalleryAlbum[] = [];
  for (const n of rows) {
    const seen = new Set<string>();
    const photos: GalleryPhoto[] = [];
    const push = (url?: string | null, caption?: string | null) => {
      if (!url || !isUsableUrl(url) || seen.has(url)) return;
      seen.add(url);
      photos.push({ url, caption: caption || null });
    };
    push(n.cover_image_url, n.title);
    extractImageUrls(n.content).forEach((i) => push(i.url, i.alt || null));
    if (photos.length === 0) continue;
    albums.push({
      key: `news-${n.id}`,
      source: "berita",
      title: n.title,
      date: n.published_at ?? null,
      cover: photos[0].url,
      photos,
      href: `/website/berita/${n.slug}`,
    });
  }
  return albums;
}
