/**
 * Cloudflare Turnstile (verifikasi keamanan pengganti reCAPTCHA di halaman login)
 *
 * Site key bersifat publik (aman ada di kode). Cara membuatnya:
 * 1. Buka https://dash.cloudflare.com → menu "Turnstile" → "Add widget".
 * 2. Isi nama, tambahkan domain aplikasi (mis. pusaka.smpn8ciamis.sch.id), mode "Managed".
 * 3. Salin **Site Key** ke salah satu tempat di bawah:
 *    - berkas .env / .env.production di server (di samping VITE_SUPABASE_URL):
 *        VITE_TURNSTILE_SITE_KEY=0x4AAAAAAA...
 *      lalu build ulang; atau
 *    - ganti string kosong pada TURNSTILE_FALLBACK_SITE_KEY di bawah, lalu commit.
 *
 * Jika kunci belum diisi, halaman login TIDAK menampilkan verifikasi dan tidak memintanya
 * (supaya siswa tidak terkunci di luar). Isi kuncinya agar verifikasi aktif.
 */
const TURNSTILE_FALLBACK_SITE_KEY = "";

export const TURNSTILE_SITE_KEY: string =
  ((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || TURNSTILE_FALLBACK_SITE_KEY).trim();
