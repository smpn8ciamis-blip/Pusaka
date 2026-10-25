# PUSAKA (SMPN 8 Ciamis) — panduan untuk Claude

Aplikasi manajemen sekolah. **Bahasa kerja: Indonesia** (UI, pesan commit/PR, balasan ke pengguna). Pengguna bukan programmer penuh waktu: jelaskan langkah yang harus dia jalankan dengan konkret.

## Teknologi
- Frontend: React + Vite + TypeScript, shadcn/ui (Radix), Tailwind, TanStack Query, react-router, zod, jsPDF (cetak PDF), date-fns.
- Backend: Supabase self-hosted (Postgres + RLS + RPC `SECURITY DEFINER` + edge functions di `supabase/functions`). Klien: `@/integrations/supabase/client`.
- Bot WhatsApp + ADMS fingerprint: **`server.js` di root** (Node + Baileys). Di server dijalankan dari `/srv/wa-bot` lewat PM2.
- Deploy frontend: push ke `main` → GitHub Actions (`.github/workflows/deploy.yml`) → SSH `git pull`, `npm install`, `npm run build` di `/srv/app/app`.

## Peta kode
- `src/pages/*` halaman; rute dan akses peran di `src/App.tsx` (`<ProtectedRoute allowedRoles={[...]}>`).
- `src/components/DashboardLayout.tsx` berisi **menu per peran**; menu baru harus ditambahkan di sana dan di rute.
- `src/hooks/*` (mis. `useEkskul`, `usePiket`), `src/lib/*` (PDF, `waBot.ts`, `pdfPaper.ts`, `collectiveReceiptTable.ts`, `letterAttachments.ts`).
- `supabase/migrations/*.sql` migrasi. Nama berkas `YYYYMMDDHHMMSS_deskripsi.sql`, pakai `IF NOT EXISTS`/`DROP ... IF EXISTS` agar aman dijalankan ulang.
- `tools/cbt-loadtest` skrip uji beban CBT. `deploy/install.sh` installer server baru.
- **Jangan** membuat salinan `*.bak`, `backups/`, atau menaruh salinan proyek di dalam `src/` (sudah dibersihkan dan di-`.gitignore`; riwayat git sudah jadi cadangan).

## Peran (enum `app_role`)
admin, super_admin, teacher, staf, tata_usaha, bendahara, guru_piket, kesiswaan, pembina_ekskul, siswa, billing, admin_web, polling, dan peran lain di migrasi. Peran keuangan: `tata_usaha`, `bendahara`, `admin`, `super_admin`.

## Aturan basis data
- Tabel baru: aktifkan RLS. Data per sekolah dibatasi `school_id = get_user_school_id()` (trigger `auto_set_school_id` mengisi saat insert dari pengguna; **service role tidak punya `auth.uid()`**, jadi isi `school_id` dan `uploaded_by` secara eksplisit).
- Helper: `has_role(auth.uid(), 'peran')`, `is_super_admin()`, `get_user_school_id()`. Jangan memakai `USING (true)` pada tabel sensitif; batasi per peran.
- Logika berat/aman → RPC `SECURITY DEFINER` dengan `SET search_path = public`, `REVOKE ... FROM PUBLIC, anon`, `GRANT ... TO authenticated`.
- `src/integrations/supabase/types.ts` bisa tertinggal dari migrasi; untuk RPC/tabel baru pakai `as never`/`as any` seperlunya, jangan edit manual.
- **Pengguna menjalankan migrasi sendiri di SQL Editor**: selalu sebutkan berkas migrasi dan urutannya di akhir pekerjaan.

## Bot WhatsApp (`server.js`)
- Fitur dipicu **kejadian dari aplikasi** (frontend memanggil bot lewat `waAdminFetch`/endpoint ber-token), bukan polling berkala; hindari `setInterval` baru kecuali penjadwalan jam tetap yang ringan.
- Pengaturan: tabel `wa_bot_settings` (`DEFAULT_BOT_SETTINGS` di server.js + UI `WhatsAppBotSettings.tsx`); templat pesan: `DEFAULT_TEMPLATES` di server.js **dan** `WA_TEMPLATES` di `src/lib/waBot.ts` (isi keduanya).
- Endpoint publik hanya bila perlu (kios RFID). Selain itu wajib `requireAdmin`/`requireUser`.
- Setelah mengubah `server.js`, pengguna harus menyalin ke `/srv/wa-bot/` lalu `pm2 restart wa-bot --update-env`. Sebutkan itu.

## Alur kerja git
- Selalu buat **branch + PR ke `main`**, jangan push langsung ke `main`. `gh pr create` ditolak (403); buat PR dengan  
  `gh api repos/smpn8ciamis-blip/pusaka/pulls -f title=... -f head=BRANCH -f base=main -F body=@berkas.md --jq .html_url`
- Atribusi commit/PR mengikuti pengingat dari sistem sesi (jangan menyalin URL sesi lama).
- Hook "unpushed commits" kadang salah deteksi; cek dengan `git ls-remote origin BRANCH` dan bandingkan dengan `git rev-parse HEAD`.

## Verifikasi (lingkungan sesi cloud; bisa berbeda)
- `node_modules` biasanya tidak ada dan `npm install` bisa diblokir. Cek sintaks: `ts.transpileModule` dari `/opt/npm-tools/node_modules/typescript`. `node --check server.js` untuk bot.
- Uji SQL di Postgres sementara di `/var/tmp/pg_*` (jalankan sebagai user `postgres`; folder scratchpad tidak bisa dilewati). Buat dulu role `anon`/`authenticated` dan stub `auth.uid()`.
- Logika bot diuji dengan Supabase/Baileys tiruan. Katakan terus terang bila sesuatu **belum diuji di lingkungan nyata** (WhatsApp, PDF asli, browser).

## Kebiasaan yang disukai pengguna
- Jawaban singkat: apa yang berubah, langkah yang harus dia jalankan, dan batasan jujur. Tanpa rekap langkah kerja.
- Perubahan keamanan/RLS: jelaskan dampaknya bila ada akun yang kehilangan akses.
- PDF: dukung kertas A4 dan F4 (215×330 mm) lewat `src/lib/pdfPaper.ts`; blok tanda tangan tidak boleh terpotong (pindah halaman).
