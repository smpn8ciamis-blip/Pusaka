import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHero } from "./Profil";
import { Input } from "@/components/ui/input";
import { Search, Newspaper, Loader2, AlertCircle } from "lucide-react";

// Type definitions
interface NewsCategory {
  id: string;
  name: string;
  color: string;
}

interface News {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  cover_image_url: string | null;
  published_at: string;
  status: string;
  category_id: string;
  view_count: number;
  share_count: number;
  website_news_categories: NewsCategory | null;
}

export default function Berita() {
  const [news, setNews] = useState<News[]>([]);
  const [cats, setCats] = useState<NewsCategory[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const logs: string[] = [];
        
        logs.push("Starting fetch...");
        
        // Test Supabase connection
        const { data: testConnection, error: testError } = await supabase
          .from("website_news")
          .select("id")
          .limit(1);
        
        if (testError) {
          logs.push(`Connection test failed: ${testError.message}`);
          throw new Error(`Koneksi database gagal: ${testError.message}`);
        }
        
        logs.push("Connection OK, fetching news...");
        
        // Fetch news dengan error handling
        const newsQuery = supabase
          .from("website_news")
          .select(`
            *,
            website_news_categories (
              id,
              name,
              color
            )
          `)
          .eq("status", "published")
          .order("published_at", { ascending: false });

        const { data: newsData, error: newsError } = await newsQuery;

        if (newsError) {
          logs.push(`News query error: ${newsError.message}`);
          console.error("News error details:", newsError);
          throw new Error(`Gagal memuat berita: ${newsError.message}`);
        }

        logs.push(`News fetched: ${newsData?.length || 0} items`);

        // Fetch categories
        const { data: catsData, error: catsError } = await supabase
          .from("website_news_categories")
          .select("*")
          .order("name");

        if (catsError) {
          logs.push(`Categories query error: ${catsError.message}`);
          console.error("Categories error details:", catsError);
          throw new Error(`Gagal memuat kategori: ${catsError.message}`);
        }

        logs.push(`Categories fetched: ${catsData?.length || 0} items`);

        setNews(newsData || []);
        setCats(catsData || []);
        setDebugInfo(logs);
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui";
        setError(errorMessage);
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filtered = useMemo(() => {
    return news.filter((n) => {
      const matchCat = !cat || n.category_id === cat;
      const matchSearch = !q || n.title.toLowerCase().includes(q.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [news, cat, q]);

  // Loading state
  if (loading) {
    return (
      <div>
        <PageHero 
          title="Berita & Informasi" 
          subtitle="Memuat berita..." 
        />
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="h-12 w-12 animate-spin text-[#1E40AF] mb-4" />
            <p className="text-slate-600">Sedang memuat berita...</p>
            <p className="text-sm text-slate-400 mt-2">Jika terlalu lama, periksa koneksi internet Anda</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div>
        <PageHero 
          title="Berita & Informasi" 
          subtitle="Terjadi kesalahan" 
        />
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-2xl p-8">
            <AlertCircle className="h-12 w-12 text-red-600 mb-4" />
            <h2 className="text-xl font-bold text-red-800 mb-2">Gagal Memuat Berita</h2>
            <p className="text-red-700 mb-4">{error}</p>
            
            <div className="space-y-3">
              <details className="bg-white rounded-lg p-4">
                <summary className="font-semibold text-sm text-slate-700 cursor-pointer">
                  Detail Error (untuk developer)
                </summary>
                <pre className="mt-2 text-xs text-slate-600 overflow-auto bg-slate-50 p-3 rounded">
                  {error}
                </pre>
              </details>
              
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-[#1E40AF] text-white rounded-lg hover:bg-blue-700 transition"
              >
                🔄 Coba Lagi
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (news.length === 0) {
    return (
      <div>
        <PageHero 
          title="Berita & Informasi" 
          subtitle="Belum ada berita" 
        />
        <div className="container mx-auto px-4 py-12">
          <div className="text-center py-16">
            <Newspaper className="h-16 w-16 mx-auto mb-4 text-slate-300" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              Belum Ada Berita
            </h3>
            <p className="text-slate-500">
              Belum ada berita yang dipublikasikan saat ini.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHero 
        title="Berita & Informasi" 
        subtitle="Kabar terkini seputar kegiatan, prestasi, dan pengumuman sekolah." 
      />
      <div className="container mx-auto px-4 py-12">
        {/* Search dan Filter */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Cari berita…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <button
            onClick={() => setCat(null)}
            className={`px-3 py-1.5 rounded-full text-sm transition ${
              !cat ? "bg-[#1E40AF] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Semua ({news.length})
          </button>
          {cats.map((c) => {
            const count = news.filter(n => n.category_id === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  cat === c.id ? "text-white" : "text-slate-700 bg-slate-100 hover:bg-slate-200"
                }`}
                style={cat === c.id ? { background: c.color } : {}}
              >
                {c.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">Tidak ada berita yang sesuai</p>
            <p className="text-sm mt-1">Coba ubah kata kunci pencarian atau filter kategori</p>
            <button
              onClick={() => { setQ(""); setCat(null); }}
              className="mt-4 px-4 py-2 bg-[#1E40AF] text-white rounded-lg hover:bg-blue-700"
            >
              Reset Pencarian
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((n) => (
              <Link
                key={n.id}
                to={`/website/berita/${n.slug}`}
                className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl border border-slate-100 transition"
              >
                <div className="aspect-video bg-slate-100 relative">
                  {n.cover_image_url ? (
                    <img
                      src={n.cover_image_url}
                      alt={n.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23e2e8f0'%3E%3Cpath d='M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z'/%3E%3Cpath d='M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z'/%3E%3C/svg%3E";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center text-blue-300">
                      <Newspaper className="h-12 w-12" />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  {n.website_news_categories && (
                    <span
                      className="inline-block text-xs font-semibold px-2 py-1 rounded"
                      style={{
                        background: `${n.website_news_categories.color}20`,
                        color: n.website_news_categories.color,
                      }}
                    >
                      {n.website_news_categories.name}
                    </span>
                  )}
                  <h3 className="mt-3 font-bold text-slate-900 line-clamp-2 group-hover:text-[#1E40AF]">
                    {n.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 line-clamp-2">{n.excerpt}</p>
                  <div className="mt-3 text-xs text-slate-400">
                    {n.published_at
                      ? new Date(n.published_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : ""}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}