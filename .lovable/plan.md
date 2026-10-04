
# Website Sekolah Nedelcis — Company Profile

Membangun website sekolah publik profesional dengan panel admin web terpisah, tema **Modern Minimalis (biru #1E40AF + putih)**.

## Cakupan Tahap 1

**Paket Inti + Akademik & Ekstrakurikuler**

### Halaman Publik (dapat diakses siapa saja)
- **Beranda (`/`)** — Hero banner slider, sambutan singkat, statistik sekolah (siswa/guru/prestasi), berita terbaru, agenda, CTA PPDB
- **Profil (`/website/profil`)** — Sejarah, Visi & Misi, Sambutan Kepala Sekolah, Struktur Organisasi, Fasilitas
- **Akademik (`/website/akademik`)** — Program/Jurusan, Kurikulum, Kalender Akademik
- **Ekstrakurikuler (`/website/ekstrakurikuler`)** — Daftar ekskul (menarik dari tabel `extracurricular_types` yang sudah ada)
- **Berita (`/website/berita`)** — List berita berkategori, search, detail (`/website/berita/:slug`)
- **Galeri (`/website/galeri`)** — Album foto & video kegiatan
- **Guru & Staff (`/website/guru`)** — Menarik dari tabel `teachers` yang sudah ada
- **Kontak (`/website/kontak`)** — Info kontak, peta, form pesan
- **Header/Footer publik** terpadu dengan menu navigasi dinamis

Route existing `/` (Dashboard admin) → dipindah ke `/dashboard` dengan auto-redirect setelah login.

### Admin Web (`/web-admin`)
Role baru: **`admin_web`** dengan akses CRUD ke seluruh konten website:
- Dashboard admin (jumlah berita, view, pesan masuk)
- Manajemen Berita (rich text, kategori, featured image, publish/draft)
- Manajemen Halaman Statis (profil, sejarah, visi misi, sambutan)
- Manajemen Galeri (album + foto)
- Manajemen Agenda/Kalender
- Manajemen Hero Banner (slider beranda)
- Manajemen Program & Kurikulum
- Pesan Kontak masuk
- Pengaturan Website (nama, tagline, kontak, sosmed, meta SEO)

### Akun Admin Web
- Email: `adminweb@nedelcis` (dibuat sebagai `adminweb@nedelcis.local` karena Supabase wajib format email valid)
- Password: `123456`
- Role: `admin_web`

---

## Rencana Teknis

### Database (migration)
Tabel baru (semua dengan `school_id`, RLS multi-tenant, GRANT sesuai kebijakan proyek):
- `website_settings` — nama, tagline, hero title, kontak, sosmed, meta SEO
- `website_hero_slides` — slider beranda (image, title, subtitle, cta)
- `website_pages` — halaman statis (slug, title, content JSON/HTML, section: sejarah/visi/misi/sambutan/fasilitas)
- `website_news` — berita (slug, title, excerpt, content, cover_image, category, author, published_at, status)
- `website_news_categories`
- `website_gallery_albums` + `website_gallery_items`
- `website_agenda` — event kalender (title, description, start_at, end_at, location)
- `website_programs` — program/jurusan
- `website_contact_messages` — pesan dari form kontak (public insert allowed)

RLS pola:
- **Publik**: `SELECT` diizinkan untuk anon (konten published)
- **Admin Web / Admin**: `ALL` untuk role `admin_web` dan `admin` pada `school_id` yang sama
- Update enum `app_role` → tambah `admin_web`

### Akun & Role
Edge function `create-web-admin` (memakai service role) untuk membuat user auth + assign role `admin_web`. Dijalankan sekali dari halaman setup.

### Frontend
- Layout baru `PublicWebsiteLayout` (header dengan mega menu, footer profesional)
- Design tokens biru navy `#1E40AF` di `index.css` sebagai varian tema "website"
- Font pair: Inter / system (sudah ada)
- Komponen reusable: `HeroSlider`, `NewsCard`, `SectionHeading`, `StatsBand`
- Layout `WebAdminLayout` (sidebar terpisah dari dashboard existing)
- Route `ProtectedRoute allowedRoles={['admin_web','admin']}` untuk `/web-admin/*`
- Update `AuthContext` type + auto-routing role → arahkan `admin_web` ke `/web-admin`

### File yang akan dibuat/diubah
```
supabase/migrations/*_website.sql            (baru — tabel + RLS + enum admin_web)
supabase/functions/create-web-admin/index.ts (baru)
src/layouts/PublicWebsiteLayout.tsx          (baru)
src/layouts/WebAdminLayout.tsx               (baru)
src/pages/website/{Home,Profil,Akademik,Ekstrakurikuler,Berita,BeritaDetail,Galeri,Guru,Kontak}.tsx
src/pages/web-admin/{Dashboard,News,Pages,Gallery,Agenda,HeroBanners,Programs,Messages,Settings}.tsx
src/components/website/{Header,Footer,HeroSlider,NewsCard,StatsBand,SectionHeading}.tsx
src/App.tsx                                  (routing besar-besaran)
src/contexts/AuthContext.tsx                 (tambah admin_web ke tipe)
src/components/ProtectedRoute.tsx            (tambah admin_web)
src/pages/Dashboard.tsx                      (dipindah dari `/` ke `/dashboard`)
src/index.css                                (token tema website)
```

---

## Catatan
- Tahap 1 fokus pada fondasi + Akademik/Ekstrakurikuler. PPDB, prestasi, testimonial, download dokumen bisa ditambah di tahap berikutnya.
- Karena `/` diganti jadi website publik, user login otomatis diarahkan ke dashboard sesuai role masing-masing (admin → `/dashboard`, admin_web → `/web-admin`, dll).
- Akun `adminweb@nedelcis` akan dibuat dengan email `adminweb@nedelcis.local` agar lolos validasi Supabase; user tetap login menggunakan email tersebut.
- Semua konten dinamis dari database — admin web bisa mengubah teks halaman profil, visi misi, sambutan tanpa perlu edit kode.

Setujui plan ini untuk saya mulai eksekusi?
