# Berkas upload PUSAKA → Google Drive

Semua berkas yang diunggah di aplikasi (foto, tugas siswa, surat, SPJ, berkas guru, dll.) disimpan di Google Drive,
bukan di disk server. Saat berkas dibuka, server mengambilnya dari Drive (dengan cache disk terbatas supaya cepat).
Aplikasi, tautan, dan aturan hak akses (RLS) **tidak berubah**.

```
Aplikasi → Supabase Storage (storage-api) → gerbang S3 (drive-s3-gateway.cjs, port 9100) → Google Drive
```

## Yang perlu diketahui dulu
- **Kapasitas**: Gmail pribadi hanya 15 GB gratis (dibagi dengan Gmail & Foto). Cek ukuran berkas sekarang (langkah 1).
  Jika kurang, pakai akun Google One/Workspace. Drive penuh → upload ditolak (HTTP 507).
- **Token Google**: jika aplikasi OAuth di Google Cloud berstatus *Testing*, token kedaluwarsa tiap 7 hari dan semua
  berkas tidak bisa dibuka sampai tersambung ulang. Ubah ke *In production* di Google Cloud Console.
- Jika gerbang mati atau Drive/token bermasalah, berkas **tidak bisa dilihat/diunggah** (bukan hilang). Pantau dengan
  `pm2 status` dan `curl http://127.0.0.1:9100/__health`.
- Menu Google Drive (backup) di aplikasi bot harus sudah tersambung: gerbang memakai token yang sama
  (`gdrive-token.json`, scope `drive.file`). Berkas dibuat di folder **"Pusaka Storage"** di Drive tersebut.
- **Belum diuji** dengan Google Drive asli maupun storage-api asli (hanya dengan Drive tiruan dan vektor uji AWS SigV4).
  Lakukan uji kecil di langkah 7 sebelum menghapus apa pun.

## Langkah (berurutan)
1. **Ukur dan cek struktur berkas lama** (di server):
   ```bash
   cd ~/sekolah-app/supabase-docker/docker
   du -sh volumes/storage
   find volumes/storage -maxdepth 4 | head -20      # harus terlihat stub/stub/<bucket>/...
   ```
2. **Salin berkas ke folder bot** dan isi `.env` bot (`/srv/wa-bot/.env`), tambahkan baris (kunci/rahasia buat sendiri, mis. `openssl rand -hex 16` dan `openssl rand -hex 32`):
   ```
   S3_GATEWAY_ACCESS_KEY=isi-acak-pendek
   S3_GATEWAY_SECRET_KEY=isi-acak-panjang
   ```
   `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` sudah ada di `.env` bot. Lalu:
   ```bash
   cp drive-s3-gateway.cjs drive-s3-migrate.cjs /srv/wa-bot/
   cd /srv/wa-bot
   pm2 start drive-s3-gateway.cjs --name drive-s3 && pm2 save
   curl http://127.0.0.1:9100/__health         # harus menampilkan kuota Drive
   ```
3. **Firewall port 9100**: hanya boleh diakses dari Docker (bukan dari internet). Contoh (UFW):
   `sudo ufw deny 9100` lalu `sudo ufw allow from 172.16.0.0/12 to any port 9100`. Permintaan juga wajib bertanda tangan SigV4.
4. **Simulasi, lalu salin berkas lama ke Drive** (berkas lokal tidak dihapus; aman diulang, yang sudah ada dilewati):
   ```bash
   cd /srv/wa-bot
   ROOT=~/sekolah-app/supabase-docker/docker/volumes/storage
   node drive-s3-migrate.cjs --root $ROOT                       # simulasi
   node drive-s3-migrate.cjs --root $ROOT --run --db-container supabase-db
   node drive-s3-migrate.cjs --root $ROOT --verify              # cocokkan ukuran + MD5
   ```
   (`--db-container` agar tipe berkas dibaca dari database; tanpa itu ditebak dari ekstensi. Nama container cek `docker ps`.)
5. **Alihkan Storage ke gerbang**: tambahkan ke `.env` Supabase (`~/sekolah-app/supabase-docker/docker/.env`) dua baris
   `S3_GATEWAY_ACCESS_KEY` dan `S3_GATEWAY_SECRET_KEY` (nilai **sama** dengan langkah 2), salin
   `deploy/storage-drive/docker-compose.drive.yml` ke folder itu, lalu:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.drive.yml up -d storage
   docker logs --tail 50 supabase-storage   # nama container: cek `docker ps`
   ```
6. Agar tetap aktif setelah `docker compose up` biasa, tambahkan `COMPOSE_FILE=docker-compose.yml:docker-compose.drive.yml` ke `.env` Supabase.
7. **Uji**: unggah satu foto/tugas di aplikasi, buka lagi, lalu cek folder "Pusaka Storage" di Google Drive. Buka juga berkas lama
   (mis. logo sekolah, surat izin). Bila semuanya normal beberapa hari, baru hapus berkas lokal
   (`volumes/storage/stub`) setelah `--verify` bersih. Catatan: backup harian di server memakai `tar` folder ini; setelah dihapus
   backup berkas tidak lagi berisi upload (sudah ada di Drive).

## Kembali ke penyimpanan lokal (rollback)
Hapus `COMPOSE_FILE` dan berkas override (atau ubah `STORAGE_BACKEND: file`), lalu `docker compose up -d storage`.
Berkas yang diunggah **setelah** pindah hanya ada di Drive; berkas lama masih di disk selama belum dihapus.

## Variabel opsional gerbang
`S3_GATEWAY_HOST` (0.0.0.0), `S3_GATEWAY_PORT` (9100), `S3_CACHE_DIR`, `S3_CACHE_MAX_MB` (1024), `S3_CACHE_FILE_MAX_MB` (25),
`S3_SPOOL_DIR`, `S3_DRIVE_ROOT_NAME` ("Pusaka Storage"), `S3_LOG=1` (log detail). Cache dan spool memakai disk sementara
(unggahan besar ditampung dulu di disk sebelum dikirim ke Drive).
