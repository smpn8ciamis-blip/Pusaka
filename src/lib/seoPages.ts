// Data halaman website untuk SEO dan pratinjau tautan (WhatsApp, Google). Murni data (tanpa import.meta)
// agar dipakai bersama oleh aplikasi (src/lib/seo.ts), skrip build (vite.seo-pages.ts), dan sebagai acuan server.js (OG_PAGES).
// Judul diawali nama bagian supaya jelas apa yang dibagikan: "Agenda Kegiatan - SMP Negeri 8 Ciamis".

export const DEFAULT_SITE_URL = "https://smpn8ciamis.sch.id";
export const SCHOOL_NAME = "SMP Negeri 8 Ciamis";

export const HOME_SEO = {
  title: "SMP Negeri 8 Ciamis (SMPN 8 Ciamis) - Website Resmi",
  description:
    "Website resmi SMP Negeri 8 Ciamis (SMPN 8 Ciamis), sekolah menengah pertama negeri di Ciamis, Jawa Barat, di bawah Dinas Pendidikan Kabupaten Ciamis. Berita, profil, akademik, ekstrakurikuler, agenda, dan informasi sekolah.",
};

export const PAGE_SEO: Record<string, { title: string; description: string }> = {
  "/website/profil": {
    title: `Profil Sekolah - ${SCHOOL_NAME}`,
    description: "Profil sekolah: visi, misi, sejarah, dan struktur organisasi SMP Negeri 8 Ciamis (SMPN 8 Ciamis), Ciamis, Jawa Barat.",
  },
  "/website/akademik": {
    title: `Akademik - ${SCHOOL_NAME}`,
    description: "Akademik: program pembelajaran, kurikulum, dan kegiatan belajar di SMP Negeri 8 Ciamis (SMPN 8 Ciamis).",
  },
  "/website/ekstrakurikuler": {
    title: `Ekstrakurikuler - ${SCHOOL_NAME}`,
    description: "Ekstrakurikuler: kegiatan pengembangan bakat, minat, dan karakter peserta didik SMP Negeri 8 Ciamis.",
  },
  "/website/berita": {
    title: `Berita & Informasi - ${SCHOOL_NAME}`,
    description: "Berita dan informasi: kegiatan, prestasi, dan pengumuman terbaru dari SMP Negeri 8 Ciamis (SMPN 8 Ciamis).",
  },
  "/website/agenda": {
    title: `Agenda Kegiatan - ${SCHOOL_NAME}`,
    description: "Agenda kegiatan: jadwal acara dan kegiatan SMP Negeri 8 Ciamis (SMPN 8 Ciamis) yang akan datang.",
  },
  "/website/galeri": {
    title: `Galeri Foto - ${SCHOOL_NAME}`,
    description: "Galeri foto: dokumentasi kegiatan, momen, dan prestasi SMP Negeri 8 Ciamis (SMPN 8 Ciamis).",
  },
  "/website/guru": {
    title: `Guru & Tenaga Kependidikan - ${SCHOOL_NAME}`,
    description: "Guru dan tenaga kependidikan SMP Negeri 8 Ciamis (SMPN 8 Ciamis).",
  },
  "/website/kontak": {
    title: `Kontak & Alamat - ${SCHOOL_NAME}`,
    description: "Kontak dan alamat: telepon, email, dan lokasi SMP Negeri 8 Ciamis (SMPN 8 Ciamis), Ciamis, Jawa Barat.",
  },
};
