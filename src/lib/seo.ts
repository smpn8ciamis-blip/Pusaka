// SEO website publik: judul, deskripsi, tautan kanonik, dan data terstruktur (JSON-LD).
// Satu sumber agar semua halaman konsisten. Google menjalankan JavaScript, jadi tag diisi lewat react-helmet-async.

/** Alamat utama situs (kanonik). Alamat lain (pusaka.…) tetap bisa dibuka, tetapi Google diarahkan ke sini. Ganti lewat VITE_SITE_URL saat build. */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || "https://smpn8ciamis.sch.id").replace(/\/+$/, "");
export const SCHOOL_NAME = "SMP Negeri 8 Ciamis";
export const SCHOOL_SHORT = "SMPN 8 Ciamis";
export const SCHOOL_ALT_NAMES = ["SMPN 8 Ciamis", "SMP Negeri 8 Ciamis", "SMP 8 Ciamis", "SMPN 8 Ciamis Jawa Barat"];

export const HOME_SEO = {
  title: "SMP Negeri 8 Ciamis (SMPN 8 Ciamis) - Website Resmi",
  description:
    "Website resmi SMP Negeri 8 Ciamis (SMPN 8 Ciamis), sekolah menengah pertama negeri di Ciamis, Jawa Barat, di bawah Dinas Pendidikan Kabupaten Ciamis. Berita, profil, akademik, ekstrakurikuler, agenda, dan informasi sekolah.",
};

export const PAGE_SEO: Record<string, { title: string; description: string }> = {
  "/website/profil": {
    title: "Profil SMP Negeri 8 Ciamis - Visi, Misi, dan Sejarah",
    description: "Profil SMP Negeri 8 Ciamis: visi, misi, sejarah, dan struktur organisasi sekolah menengah pertama negeri di Ciamis, Jawa Barat.",
  },
  "/website/akademik": {
    title: "Akademik SMP Negeri 8 Ciamis - Kurikulum dan Program Belajar",
    description: "Program pembelajaran, kurikulum, dan kegiatan akademik di SMP Negeri 8 Ciamis (SMPN 8 Ciamis).",
  },
  "/website/ekstrakurikuler": {
    title: "Ekstrakurikuler SMP Negeri 8 Ciamis - Bakat dan Karakter Siswa",
    description: "Daftar kegiatan ekstrakurikuler SMP Negeri 8 Ciamis sebagai wadah pengembangan bakat, minat, dan karakter peserta didik.",
  },
  "/website/berita": {
    title: "Berita SMP Negeri 8 Ciamis - Kegiatan dan Informasi Terbaru",
    description: "Berita, kegiatan, prestasi, dan pengumuman terbaru dari SMP Negeri 8 Ciamis (SMPN 8 Ciamis).",
  },
  "/website/agenda": {
    title: "Agenda Kegiatan SMP Negeri 8 Ciamis",
    description: "Jadwal kegiatan, acara, dan agenda sekolah SMP Negeri 8 Ciamis yang akan datang.",
  },
  "/website/galeri": {
    title: "Galeri Foto SMP Negeri 8 Ciamis - Dokumentasi Kegiatan",
    description: "Galeri foto dokumentasi kegiatan, momen, dan prestasi SMP Negeri 8 Ciamis (SMPN 8 Ciamis).",
  },
  "/website/guru": {
    title: "Guru dan Tenaga Kependidikan SMP Negeri 8 Ciamis",
    description: "Daftar guru dan tenaga kependidikan SMP Negeri 8 Ciamis (SMPN 8 Ciamis).",
  },
  "/website/kontak": {
    title: "Kontak dan Alamat SMP Negeri 8 Ciamis",
    description: "Alamat, nomor telepon, email, dan lokasi SMP Negeri 8 Ciamis (SMPN 8 Ciamis), Ciamis, Jawa Barat.",
  },
};

/** Jalur dibersihkan: tanpa akhiran garis miring/.html, huruf kecil. */
export const normalizePath = (p: string) => {
  const t = (p || "/").split(/[?#]/)[0].replace(/\.html$/i, "").replace(/\/+$/, "");
  return (t || "/").toLowerCase();
};

export const canonicalUrl = (path: string) => (normalizePath(path) === "/" ? SITE_URL + "/" : SITE_URL + normalizePath(path));

/** Potong teks untuk deskripsi meta (±155 karakter) tanpa memotong kata. */
export const clip = (s: string, max = 155) => {
  const t = String(s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 60)).replace(/[,;:\-–\s]+$/, "") + "…";
};

type SchoolSettings = {
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
} | null | undefined;

/** Data terstruktur sekolah (muncul sebagai info sekolah di Google bila datanya cukup). */
export function schoolJsonLd(s: SchoolSettings) {
  const sameAs = [s?.facebook_url, s?.instagram_url, s?.youtube_url].filter((u): u is string => !!u && /^https?:\/\//i.test(u));
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "School",
    "@id": SITE_URL + "/#school",
    name: SCHOOL_NAME,
    alternateName: SCHOOL_ALT_NAMES,
    url: SITE_URL + "/",
    inLanguage: "id-ID",
    parentOrganization: { "@type": "GovernmentOrganization", name: "Dinas Pendidikan Kabupaten Ciamis" },
    address: {
      "@type": "PostalAddress",
      ...(s?.address ? { streetAddress: s.address } : {}),
      addressLocality: "Ciamis",
      addressRegion: "Jawa Barat",
      addressCountry: "ID",
    },
  };
  if (s?.logo_url) { obj.logo = s.logo_url; obj.image = s.logo_url; }
  if (s?.phone) obj.telephone = s.phone;
  if (s?.email) obj.email = s.email;
  if (sameAs.length) obj.sameAs = sameAs;
  return obj;
}

export function articleJsonLd(a: { title: string; slug: string; description: string; image?: string | null; publishedAt?: string | null; author?: string | null; logo?: string | null }) {
  const url = canonicalUrl("/website/berita/" + encodeURIComponent(a.slug));
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: a.title.slice(0, 110),
    description: a.description,
    inLanguage: "id-ID",
    ...(a.image ? { image: [a.image] } : {}),
    ...(a.publishedAt ? { datePublished: new Date(a.publishedAt).toISOString(), dateModified: new Date(a.publishedAt).toISOString() } : {}),
    author: { "@type": "Organization", name: a.author || SCHOOL_NAME },
    publisher: { "@type": "Organization", name: SCHOOL_NAME, ...(a.logo ? { logo: { "@type": "ImageObject", url: a.logo } } : {}) },
  };
}

/** JSON-LD sebagai teks aman untuk disisipkan di <script> ("<" di-escape agar tidak bisa menutup tag). */
export const jsonLdString = (obj: unknown) => JSON.stringify(obj).replace(/</g, "\\u003c");
