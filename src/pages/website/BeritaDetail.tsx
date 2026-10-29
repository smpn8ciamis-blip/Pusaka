import { useEffect, useState, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHero } from "./Profil";
import { ArrowLeft, Newspaper, Loader2, Eye, Share2, MessageCircle, Facebook, Twitter, Send, Linkedin, Link as LinkIcon, Check, ChevronRight, ZoomIn, X, Clock } from "lucide-react";
import { toast } from "sonner";

interface NewsCategory {
  id: string;
  name: string;
  color: string;
}

interface News {
  id: string;
  author_name?: string | null;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image_url: string | null;
  published_at: string;
  status: string;
  category_id: string;
  view_count: number;
  share_count: number;
  website_news_categories: NewsCategory | null;
}

type SharePlatform = "whatsapp" | "facebook" | "twitter" | "telegram" | "linkedin" | "copy_link" | "native";

function useNewsViewTracker(newsId: string | undefined) {
  const trackedRef = useRef(false);
  useEffect(() => {
    if (!newsId || trackedRef.current) return;
    const storageKey = `news_viewed_${newsId}`;
    const hasViewed = sessionStorage.getItem(storageKey);
    if (hasViewed) return;
    const trackView = async () => {
      try {
        const { error } = await supabase.rpc("increment_news_view", { p_news_id: newsId });
        if (error) { console.error("View tracking error:", error); return; }
        sessionStorage.setItem(storageKey, "true");
        trackedRef.current = true;
      } catch (err) { console.error("Failed to track view:", err); }
    };
    const timer = setTimeout(trackView, 1500);
    return () => clearTimeout(timer);
  }, [newsId]);
}

function useNewsShareTracker() {
  const trackShare = useCallback(async (newsId: string, platform: SharePlatform) => {
    try {
      const { data } = await supabase.rpc("increment_news_share", { p_news_id: newsId, p_platform: platform });
      return data;
    } catch (err) { console.error("Failed to track share:", err); return null; }
  }, []);
  return { trackShare };
}

interface NewsItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  view_count: number;
  category_id: string | null;
  website_news_categories: { name: string; color: string } | null;
}

const SITE_NAME = "SMPN 8 Ciamis";

// Tautan yang dibagikan SELALU berakhiran .html (nginx mengarahkan crawler WhatsApp dkk. ke pratinjau berita).
const beritaShareUrl = (slug: string) => `${window.location.origin}/website/berita/${encodeURIComponent(slug)}.html`;

const WIB = "Asia/Jakarta";
function fmtDateTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: WIB });
  const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: WIB }).replace(".", ":");
  return `${date}, ${time} WIB`;
}
function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Baru saja";
  if (m < 60) return `${m} menit yang lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam yang lalu`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} hari yang lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: WIB });
}
const fmtCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(".0", "")}K` : String(n));

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {(name.trim()[0] || "R").toUpperCase()}
    </div>
  );
}

// Salin ke papan klip; cadangan untuk peramban/WebView yang tidak punya navigator.clipboard (mis. bukan HTTPS).
async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* lanjut ke cadangan */ }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("copy failed");
}

function ShareRow({ news, onShareCountUpdate, label }: { news: News; onShareCountUpdate?: (n: number) => void; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { trackShare } = useNewsShareTracker();
  const shareUrl = beritaShareUrl(news.slug);
  // Teks bagikan singkat (judul saja). Tautan ditaruh di baris sendiri agar WhatsApp mengenalinya dan menampilkan kartu pratinjau bergambar.
  const shareText = news.title;

  const bump = async (platform: SharePlatform) => {
    const n = await trackShare(news.id, platform);
    if (n !== null && onShareCountUpdate) onShareCountUpdate(n);
  };
  const open = async (platform: SharePlatform, url: string) => {
    await bump(platform);
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
  };
  const copy = async () => {
    try {
      await copyText(shareUrl);
      await bump("copy_link");
      setCopied(true);
      toast.success("Link berhasil disalin!");
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Gagal menyalin link"); }
  };
  const native = async () => {
    try {
      await navigator.share({ title: news.title, url: shareUrl });
      await bump("native");
    } catch (err) { if ((err as Error).name !== "AbortError") console.error("Share failed:", err); }
  };

  const items = [
    { platform: "whatsapp" as const, icon: MessageCircle, label: "WhatsApp", cls: "bg-[#25D366]", url: `https://wa.me/?text=${encodeURIComponent(shareText + "\n\n" + shareUrl)}` },
    { platform: "facebook" as const, icon: Facebook, label: "Facebook", cls: "bg-[#1877F2]", url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}` },
    { platform: "twitter" as const, icon: Twitter, label: "X", cls: "bg-black", url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}` },
    { platform: "telegram" as const, icon: Send, label: "Telegram", cls: "bg-[#229ED9]", url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}` },
    { platform: "linkedin" as const, icon: Linkedin, label: "LinkedIn", cls: "bg-[#0A66C2]", url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}` },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {label && <span className="mr-1 text-sm font-semibold text-slate-700">{label}</span>}
      {items.map(({ platform, icon: Icon, label: l, cls, url }) => (
        <button key={platform} type="button" onClick={() => open(platform, url)} aria-label={`Bagikan ke ${l}`} title={l}
          className={`${cls} flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:scale-110`}>
          <Icon className="h-4 w-4" />
        </button>
      ))}
      {typeof navigator !== "undefined" && "share" in navigator && (
        <button type="button" onClick={native} aria-label="Bagikan lainnya" title="Bagikan lainnya"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-white transition hover:scale-110">
          <Share2 className="h-4 w-4" />
        </button>
      )}
      <button type="button" onClick={copy}
        className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition ${copied ? "border-green-500 bg-green-50 text-green-700" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
        {copied ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />} {copied ? "Tersalin" : "Copy Link"}
      </button>
    </div>
  );
}

function NewsThumb({ n, size = "sm" }: { n: NewsItem; size?: "sm" | "lg" }) {
  return n.cover_image_url ? (
    <img src={n.cover_image_url} alt="" loading="lazy" className={`${size === "lg" ? "aspect-video w-full" : "h-16 w-16"} shrink-0 rounded-lg bg-slate-100 object-cover`} />
  ) : (
    <div className={`${size === "lg" ? "aspect-video w-full" : "h-16 w-16"} flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300`}><Newspaper className="h-6 w-6" /></div>
  );
}

function SideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 border-l-4 border-[#1E40AF] pl-3 text-base font-bold uppercase tracking-wide text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

export default function BeritaDetail() {
  const { slug: rawSlug } = useParams<{ slug: string }>();
  // Tautan bagikan berakhiran .html; buang akhiran itu untuk mencari berita.
  const slug = (rawSlug ?? "").replace(/\.html$/i, "");
  const [news, setNews] = useState<News | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<NewsItem[]>([]);
  const [popular, setPopular] = useState<NewsItem[]>([]);
  const [zoom, setZoom] = useState(false);

  useNewsViewTracker(news?.id);

  useEffect(() => {
    if (!slug) return;
    const fetchNews = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error } = await supabase
          .from("website_news")
          .select("*, website_news_categories(name,color)")
          .eq("slug", slug)
          .eq("status", "published")
          .single();
        if (error) throw error;
        setNews(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat berita");
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
    window.scrollTo({ top: 0 });
  }, [slug]);

  // Berita lain (terkini + terpopuler) untuk bagian terkait/samping
  useEffect(() => {
    if (!news) return;
    const cols = "id,title,slug,excerpt,cover_image_url,published_at,view_count,category_id,website_news_categories(name,color)";
    (async () => {
      const [l, p] = await Promise.all([
        supabase.from("website_news").select(cols).eq("status", "published").neq("id", news.id).order("published_at", { ascending: false }).limit(12),
        supabase.from("website_news").select(cols).eq("status", "published").neq("id", news.id).order("view_count", { ascending: false }).limit(5),
      ]);
      setLatest((l.data as unknown as NewsItem[]) ?? []);
      setPopular((p.data as unknown as NewsItem[]) ?? []);
    })();
  }, [news?.id]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  useEffect(() => {
    if (!news) return;
    const shareUrl = beritaShareUrl(news.slug);
    const shareTitle = news.title;
    const shareDescription = news.excerpt || news.title;
    const shareImage = news.cover_image_url || `${window.location.origin}/icon-512.png`;
    document.title = `${shareTitle} - ${SITE_NAME}`;
    const setMetaTag = (property: string, content: string) => {
      let element = document.querySelector(`meta[property="${property}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute('property', property); document.head.appendChild(element); }
      element.setAttribute('content', content);
    };
    const setNameMeta = (name: string, content: string) => {
      let element = document.querySelector(`meta[name="${name}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute('name', name); document.head.appendChild(element); }
      element.setAttribute('content', content);
    };
    setMetaTag('og:title', shareTitle);
    setMetaTag('og:description', shareDescription);
    setMetaTag('og:image', shareImage);
    setMetaTag('og:url', shareUrl);
    setMetaTag('og:type', 'article');
    setMetaTag('og:site_name', SITE_NAME);
    setMetaTag('twitter:card', 'summary_large_image');
    setMetaTag('twitter:title', shareTitle);
    setMetaTag('twitter:description', shareDescription);
    setMetaTag('twitter:image', shareImage);
    setNameMeta('description', shareDescription);
    return () => {
      document.title = SITE_NAME;
      ['og:title','og:description','og:image','og:url','og:type','og:site_name','twitter:card','twitter:title','twitter:description','twitter:image'].forEach(p => {
        const el = document.querySelector(`meta[property="${p}"]`);
        if (el) el.remove();
      });
      const el = document.querySelector('meta[name="description"]');
      if (el) el.remove();
    };
  }, [news]);

  const handleShareCountUpdate = (newCount: number) => {
    if (news) setNews({ ...news, share_count: newCount });
  };

  // Terkait: kategori sama dulu, lalu yang terbaru
  const related = useMemo(() => {
    if (!news) return [] as NewsItem[];
    const same = latest.filter((x) => x.category_id && x.category_id === news.category_id);
    const rest = latest.filter((x) => !same.includes(x));
    return [...same, ...rest].slice(0, 4);
  }, [latest, news]);

  if (loading) {
    return (<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#1E40AF]" /></div>);
  }

  if (error || !news) {
    return (
      <div>
        <PageHero title="Berita Tidak Ditemukan" subtitle="Berita yang Anda cari tidak tersedia." />
        <div className="container mx-auto px-4 py-12 text-center">
          <Newspaper className="h-16 w-16 mx-auto mb-4 text-slate-300" />
          <p className="text-slate-600 mb-4">{error || "Berita tidak ditemukan"}</p>
          <Link to="/website/berita" className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E40AF] text-white rounded-lg hover:bg-blue-700">
            <ArrowLeft className="h-4 w-4" /> Kembali ke Berita
          </Link>
        </div>
      </div>
    );
  }

  const cat = news.website_news_categories;
  const author = news.author_name?.trim() || `Tim Redaksi ${SITE_NAME}`;

  return (
    <div className="bg-white">
      <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
          <article className="min-w-0">
            {/* Jejak halaman */}
            <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-slate-500">
              <Link to="/" className="hover:text-[#1E40AF]">Home</Link>
              <ChevronRight className="h-3.5 w-3.5" />
              <Link to="/website/berita" className="hover:text-[#1E40AF]">Berita</Link>
              {cat && (<><ChevronRight className="h-3.5 w-3.5" /><span className="font-medium" style={{ color: cat.color }}>{cat.name}</span></>)}
            </nav>

            {/* Judul + ringkasan */}
            <h1 className="mb-3 text-[1.65rem] font-extrabold leading-tight text-slate-900 sm:text-3xl lg:text-4xl [overflow-wrap:anywhere]">{news.title}</h1>
            {news.excerpt && <p className="mb-5 text-base leading-relaxed text-slate-600 sm:text-lg">{news.excerpt}</p>}

            {/* Penulis + waktu terbit */}
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={author} />
              <div className="min-w-0 text-sm">
                <div className="text-slate-700">Oleh <span className="font-semibold text-slate-900">{author}</span></div>
                <div className="flex flex-wrap items-center gap-x-3 text-slate-500">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Diterbitkan {fmtDateTime(news.published_at)}</span>
                  <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {news.view_count.toLocaleString("id-ID")}x dibaca</span>
                </div>
              </div>
            </div>

            <div className="mb-5 border-y border-slate-100 py-3">
              <ShareRow news={news} onShareCountUpdate={handleShareCountUpdate} />
            </div>

            {/* Gambar utama */}
            {news.cover_image_url && (
              <figure className="mb-6">
                <div className="aspect-video overflow-hidden rounded-xl bg-slate-100">
                  <img src={news.cover_image_url} alt={news.title} className="h-full w-full object-cover" />
                </div>
                <figcaption className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <button type="button" onClick={() => setZoom(true)} className="inline-flex items-center gap-1 font-medium text-[#1E40AF] hover:underline">
                    <ZoomIn className="h-3.5 w-3.5" /> Perbesar
                  </button>
                  <span className="italic">Foto: {SITE_NAME}</span>
                </figcaption>
              </figure>
            )}

            {/* Isi berita: paragraf pembuka ditebalkan */}
            <div
              className="prose prose-slate prose-lg max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-a:text-[#1E40AF] prose-img:rounded-xl [&>p:first-of-type]:font-semibold [&_*]:[overflow-wrap:anywhere]"
              dangerouslySetInnerHTML={{ __html: news.content }}
            />

            {/* Penulis (akhir artikel) + bagikan */}
            <div className="mt-8 flex items-center gap-3 border-t border-slate-100 pt-5">
              <Avatar name={author} size={44} />
              <div className="text-sm">
                <div className="font-semibold text-slate-900">{author}</div>
                <div className="text-slate-500">Tim Redaksi</div>
              </div>
            </div>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <ShareRow news={news} onShareCountUpdate={handleShareCountUpdate} label="Bagikan berita ini:" />
            </div>

            {/* Rekomendasi */}
            {related.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-4 border-l-4 border-[#1E40AF] pl-3 text-lg font-bold uppercase tracking-wide text-slate-900">Rekomendasi</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {related.map((n) => (
                    <Link key={n.id} to={`/website/berita/${n.slug}`} className="group block">
                      <NewsThumb n={n} size="lg" />
                      <div className="mt-2 text-xs text-slate-500">{n.website_news_categories?.name ?? "Berita"} · {timeAgo(n.published_at)}</div>
                      <div className="font-semibold leading-snug text-slate-900 group-hover:text-[#1E40AF] line-clamp-3">{n.title}</div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </article>

          {/* Kolom samping: terpopuler + terkini */}
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            {popular.length > 0 && (
              <SideSection title="Populer">
                <ol className="space-y-4">
                  {popular.map((n, i) => (
                    <li key={n.id}>
                      <Link to={`/website/berita/${n.slug}`} className="group flex gap-3">
                        <span className="w-6 shrink-0 text-2xl font-extrabold leading-none text-[#1E40AF]/30 group-hover:text-[#1E40AF]">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium uppercase text-slate-400">{n.website_news_categories?.name ?? "Berita"}</div>
                          <div className="text-sm font-semibold leading-snug text-slate-900 group-hover:text-[#1E40AF] line-clamp-3">{n.title}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ol>
              </SideSection>
            )}
            {latest.length > 0 && (
              <SideSection title="Berita Terkini">
                <ul className="space-y-4">
                  {latest.slice(0, 5).map((n) => (
                    <li key={n.id}>
                      <Link to={`/website/berita/${n.slug}`} className="group flex gap-3">
                        <NewsThumb n={n} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold leading-snug text-slate-900 group-hover:text-[#1E40AF] line-clamp-3">{n.title}</div>
                          <div className="mt-1 text-[11px] text-slate-500">{timeAgo(n.published_at)} · Telah dibaca {fmtCount(n.view_count)} kali</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </SideSection>
            )}
          </aside>
        </div>
      </div>

      {/* Perbesar gambar */}
      {zoom && news.cover_image_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setZoom(false)} role="dialog" aria-label="Gambar diperbesar">
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label="Tutup"><X className="h-6 w-6" /></button>
          <img src={news.cover_image_url} alt={news.title} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
