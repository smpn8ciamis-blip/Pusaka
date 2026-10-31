import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { HOME_SEO, PAGE_SEO, SCHOOL_SHORT, canonicalUrl, clip, jsonLdString, normalizePath, schoolJsonLd } from "@/lib/seo";

/**
 * Judul, deskripsi, kanonik, Open Graph, dan data terstruktur untuk halaman website publik (di dalam PublicLayout).
 * Halaman berita memasang tag-nya sendiri (BeritaDetail), jadi di sini dilewati.
 */
export function SiteSeo({ settings }: { settings: any }) {
  const { pathname } = useLocation();
  const path = normalizePath(pathname);
  const jsonLd = <script type="application/ld+json">{jsonLdString(schoolJsonLd(settings))}</script>;

  if (path.startsWith("/website/berita/")) return <Helmet>{jsonLd}</Helmet>;

  const isHome = path === "/";
  const page = isHome ? null : PAGE_SEO[path];
  if (!isHome && !page) {
    // alamat yang tidak dikenal: jangan diindeks
    return <Helmet><meta name="robots" content="noindex, follow" /></Helmet>;
  }

  const title = isHome ? (settings?.meta_title?.trim() || HOME_SEO.title) : page!.title;
  const description = clip(isHome ? (settings?.meta_description?.trim() || HOME_SEO.description) : page!.description, 300);
  const url = canonicalUrl(path);
  return (
    <Helmet>
      <html lang="id" />
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content="index, follow, max-image-preview:large" />
      <link rel="canonical" href={url} />
      <meta property="og:type" content="website" />
      <meta property="og:locale" content="id_ID" />
      <meta property="og:site_name" content={SCHOOL_SHORT} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {jsonLd}
    </Helmet>
  );
}
