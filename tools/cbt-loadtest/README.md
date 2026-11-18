# Uji beban CBT PUSAKA

Mensimulasikan banyak siswa mengerjakan ujian CBT bersamaan, lalu menampilkan waktu respons (p50/p95/p99) dan jumlah galat tiap langkah. Hanya butuh **Node 18+**, tanpa paket tambahan.

## Cara termudah: satu skrip di server (`uji-beban.sh`)
Dijalankan **di server lewat SSH**. Skrip mengambil kunci API sendiri dari `.env` Supabase, menolak jalan bila ada ujian sungguhan berlangsung, membuat siswa uji, menjalankan uji, merekam CPU/RAM/swap/koneksi database/container, menghapus data uji, lalu mencetak ringkasan dan kesimpulan (hasil lengkap di `hasil-uji/<tanggal-jam>/`).

```bash
cd /srv/app/app/tools/cbt-loadtest
bash uji-beban.sh --cek                    # periksa kesiapan saja, tidak membuat data
bash uji-beban.sh 50                       # tahap 1
bash uji-beban.sh 200                      # tahap 2
bash uji-beban.sh 650 --serentak --hemat   # tahap 3: skenario terburuk, Studio/meta/vector dihentikan sementara
```
Opsi: `--durasi N`, `--login-rate N`, `--url ALAMAT` (mis. alamat publik agar lewat nginx/TLS), `--simpan-data`, `--paksa`. Ctrl+C aman: data uji tetap dihapus dan container yang dihentikan `--hemat` dinyalakan lagi.
Keterbatasan: uji berjalan di server yang sama lewat jaringan lokal, jadi skripnya ikut memakai CPU (angka CPU cenderung sedikit lebih tinggi dari kenyataan) dan internet/Cloudflare sekolah tidak ikut teruji. Untuk mengujinya dari luar, pakai langkah manual di bawah dari komputer lain.

## Peringatan
- Skrip membuat **data uji di database sungguhan**: kelas `LOADTEST-CBT`, ujian "LOADTEST ujian uji beban", dan siswa "Siswa Uji N". Hapus dengan `cleanup` setelah selesai. Jalankan di luar jam pelajaran/ujian.
- `SERVICE_ROLE_KEY` memberi akses penuh ke database. Jangan di-commit dan jangan dibagikan. Isi hanya di terminal Anda.
- Nilai uji tidak masuk menu Nilai (ujian uji tidak memilih komponen nilai).
- Langkah manual di bawah paling mewakili bila dijalankan dari **komputer/jaringan lain** (bukan dari server itu sendiri) agar jaringan ikut terukur.

## Persiapan
Isi variabel lingkungan (contoh Linux/macOS; di Windows PowerShell pakai `$env:NAMA="nilai"`):

```bash
export SUPABASE_URL="https://api-pusaka.smpn8ciamis.sch.id"
export ANON_KEY="<anon key>"
export SERVICE_ROLE_KEY="<service role key>"   # hanya untuk seed & cleanup
```

## Langkah
1. **Buat data uji** (misalnya 200 siswa, 40 soal):
   ```bash
   node loadtest.mjs seed --students 200 --questions 40
   ```
2. **Jalankan uji** (180 detik, siswa memulai bertahap dalam 20 detik, kirim denyut ringan tiap ~45 detik dan mengumpulkan semua jawaban di akhir, seperti aplikasi asli (butuh migrasi `20261116100000_cbt_lokal_heartbeat.sql`)):
   ```bash
   node loadtest.mjs run --students 200 --duration 180
   ```
   Opsi penting:
   - `--sync-start` semua siswa menekan Mulai di detik yang sama (skenario terburuk, lonjakan memuat soal)
   - `--sync-submit` semua siswa mengumpulkan serentak (lonjakan tulis)
   - `--save-every 10` denyut lebih sering dari biasa (uji ketahanan lebih berat)
   - `--ramp 60` sebar waktu mulai selama 60 detik
   - `--login-rate 5` batas login per detik (lihat catatan di bawah)
3. **Bersihkan**:
   ```bash
   node loadtest.mjs cleanup
   ```

## Tahapan uji yang disarankan
| Tahap | Perintah `run` | Tujuan |
|---|---|---|
| 1 | `--students 50 --duration 120` | memastikan semuanya benar |
| 2 | `--students 200 --duration 180` | beban satu angkatan |
| 3 | `--students 500 --duration 180 --sync-start --sync-submit` | skenario terburuk serentak |

(Untuk 500 siswa jalankan `seed --students 500` lebih dulu.) Selama uji, pantau CPU/RAM server, misalnya `docker stats` atau `htop`.

## Membaca hasil
- **galat** harus 0 atau sangat kecil (< 1%).
- **p95 ms** untuk `cbt_heartbeat` dan `cbt_submit_session` sebaiknya di bawah 2000 ms. `cbt_exam_paper` boleh lebih lambat saat serentak karena membawa seluruh soal (lihat kolom KB/resp).
- Hasil `LOLOS` berarti galat < 1% dan p95 < 2 detik.
- Skrip ini memanggil API langsung, jadi **tidak meniru jeda acak di aplikasi siswa** (setelah token: 2-20 detik sebelum soal diunduh; saat Selesai 0-8 detik dan saat waktu habis 0-15 detik sebelum jawaban dikirim). Karena itu `--sync-start` dan `--sync-submit` tetap mewakili skenario terburuk; di hari ujian sebenarnya lonjakannya lebih landai.
- Setelah migrasi `20261118100000_cbt_paket_soal.sql`, `cbt_exam_paper` memakai paket soal yang disimpan per ujian (dirakit sekali, dibagi ke semua siswa). Bandingkan p95 `cbt_exam_paper` sebelum dan sesudah migrasi bila ingin melihat dampaknya.
- Bila `login` banyak gagal: GoTrue membatasi laju masuk per IP. Turunkan `--login-rate`, atau naikkan `GOTRUE_RATE_LIMIT_TOKEN_REFRESH`/`GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UPS` di pengaturan Supabase Anda untuk sementara. Token login berlaku sekitar 1 jam, jadi jalankan `run` tidak lebih dari 1 jam setelah login.

## Bila ada yang gagal di tengah `seed`
Data yang sudah terbuat tercatat di `.state.json`. Jalankan `cleanup` untuk membersihkannya, lalu ulangi `seed`.
