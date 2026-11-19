# Daftar periksa CBT (mode ringan, ±600 siswa)

Semua perintah di bawah **Anda jalankan sendiri** di server (lewat `psql`) atau di SQL Editor Supabase. Semuanya hanya **membaca** (kecuali `VACUUM` dan langkah uji beban yang ditandai). Jalankan sebagai pengguna `postgres`/`supabase_admin`.

Contoh membuka psql di server (sesuaikan nama container database Anda):

```bash
docker exec -it supabase-db psql -U postgres -d postgres
```

Urutan umum: **A (sekali, setelah migrasi) → B (sebelum hari ujian) → C (sehari sebelum) → D (hari H, sebelum dan sesudah)**.

---

## A. Pemeriksaan keamanan (setelah menjalankan migrasi)

Migrasi yang harus sudah dijalankan: `20261116100000_cbt_lokal_heartbeat.sql`, `20261118100000_cbt_paket_soal.sql`, lalu `20261119120000_cbt_hardening_600.sql`.

### A1. Pengguna `anon` tidak boleh menjalankan fungsi CBT

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS argumen,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_boleh
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname LIKE '%cbt%'
ORDER BY anon_boleh DESC, p.proname;
```

**Yang diharapkan:** kolom `anon_boleh` = `f` (false) untuk **semua** baris. Bila ada `t`, jalankan untuk fungsi itu:

```sql
REVOKE ALL ON FUNCTION public.NAMA_FUNGSI(ARGUMEN) FROM PUBLIC, anon;
```

Periksa juga bahwa siswa (`authenticated`) tidak bisa memanggil fungsi internal berawalan `_cbt_`:

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumen,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_boleh
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE '\_cbt\_%'
ORDER BY p.proname;
```

Fungsi `_cbt_*` yang dipakai di dalam RPC lain boleh tetap `t` bila memang dirancang begitu, tetapi `_cbt_score_session` dan `_cbt_apply_answers` sebaiknya **tidak** dapat dipanggil langsung oleh siswa (`f`). Bila `t`, catat dan tanyakan sebelum mengubah, karena sebagian fungsi pembantu dipanggil lewat kebijakan RLS.

### A2. Daftar kebijakan (policy) RLS

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('cbt_questions','cbt_exams','cbt_exam_sessions',
                    'cbt_student_answers','cbt_exam_papers','cbt_session_violations')
ORDER BY tablename, cmd, policyname;

-- pastikan RLS menyala di semua tabel itu
SELECT relname, relrowsecurity AS rls_aktif
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('cbt_questions','cbt_exams','cbt_exam_sessions',
                  'cbt_student_answers','cbt_exam_papers','cbt_session_violations');
```

**Yang diharapkan:**
- `rls_aktif` = `t` untuk keenam tabel.
- `cbt_exam_papers`: **tidak ada policy sama sekali** (akses hanya lewat fungsi `SECURITY DEFINER`).
- `cbt_questions` (berisi kunci jawaban `correct_answer`): policy `SELECT` hanya untuk staf/guru pemilik/admin, **bukan** siswa. Bila ada policy yang `qual`-nya `true` atau bisa dipenuhi siswa, itu temuan serius.
- `cbt_exams` (berisi `exam_token` dan `exit_token`): siswa tidak boleh membaca kolom `exam_token`/`exit_token` (aplikasi memakai fungsi `_cbt_exam_public` yang tidak memuatnya). Bila siswa boleh `SELECT` langsung baris `cbt_exams`, pastikan ada pembatasan sehingga kedua kolom itu tidak terbaca. Uji langsung di C3.
- `cbt_exam_sessions`, `cbt_student_answers`, `cbt_session_violations`: siswa hanya boleh melihat/menulis baris miliknya sendiri (`user_id = auth.uid()` atau setara), dan `UPDATE` siswa pada skor tidak boleh diizinkan.

Hak akses tabel (grant) juga perlu dilihat, karena RLS tidak berlaku untuk pemilik tabel:

```sql
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS hak
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('cbt_questions','cbt_exams','cbt_exam_sessions',
                     'cbt_student_answers','cbt_exam_papers','cbt_session_violations')
  AND grantee IN ('anon','authenticated','PUBLIC')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
```

### A3. Uji nyata: apakah siswa bisa membaca kunci jawaban / token?

Ini uji paling meyakinkan. Ganti `UID_SISWA` dengan `id` (auth.users) salah satu **akun siswa uji**:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','UID_SISWA','role','authenticated')::text, true);

-- 1) kunci jawaban: harus 0 baris atau error "permission denied"
SELECT count(*) AS soal_terbaca FROM public.cbt_questions;

-- 2) token ujian: kolom exam_token/exit_token harus tidak bisa dibaca atau bernilai NULL
SELECT id, title, exam_token, exit_token FROM public.cbt_exams LIMIT 3;

-- 3) paket soal: harus error "permission denied" / 0 baris
SELECT count(*) FROM public.cbt_exam_papers;
ROLLBACK;
```

**Yang diharapkan:** (1) 0 atau error, (2) `exam_token`/`exit_token` tidak terlihat (error atau NULL), (3) error/0. Bila (1) atau (2) menampilkan data asli, **jangan mulai ujian** sebelum diperbaiki.

Periksa juga bahwa paket soal yang dikirim ke siswa tidak memuat kunci jawaban (ganti `ID_UJIAN`):

```sql
SELECT exam_id,
       paper::text ~* 'correct_answer|"answer_key"|"kunci"' AS ada_kunci_di_paket
FROM public.cbt_exam_papers
WHERE exam_id = 'ID_UJIAN';
```

**Yang diharapkan:** `ada_kunci_di_paket` = `f`.

---

## B. Ukuran paket soal (per ujian)

### B1. Ukuran paket, jumlah soal, dan jumlah soal bergambar

```sql
SELECT e.id,
       e.title,
       count(q.id)                                         AS jumlah_soal,
       count(*) FILTER (WHERE q.image_url IS NOT NULL
                          AND q.image_url <> '')            AS soal_bergambar,
       pg_size_pretty(sum(length(coalesce(q.question_text,'')))::bigint)
                                                           AS total_teks_soal,
       pg_size_pretty(coalesce(max(pg_column_size(pp.paper)),0)::bigint)
                                                           AS ukuran_paket_tersimpan,
       max(pp.built_at)                                    AS paket_dibuat
FROM public.cbt_exams e
LEFT JOIN public.cbt_questions q   ON q.exam_id = e.id
LEFT JOIN public.cbt_exam_papers pp ON pp.exam_id = e.id
WHERE e.id IN ('ID_UJIAN_1','ID_UJIAN_2')   -- ganti; atau hapus baris WHERE untuk melihat semua
GROUP BY e.id, e.title
ORDER BY e.title;
```

`ukuran_paket_tersimpan` kosong/0 = paket belum dibuat (cache dingin; lihat bagian C). Patokan kasar: paket **di atas ±1 MB** berarti 600 siswa mengunduh ±600 MB dalam beberapa menit; periksa B2 dan B3 dahulu.

### B2. Gambar `data:` base64 di dalam teks soal / pilihan (harus 0)

Gambar yang ditempel langsung ke teks soal membuat paket sangat besar dan lambat.

```sql
SELECT q.exam_id, q.question_number,
       length(q.question_text) AS panjang_teks,
       (q.question_text ~* 'data:image/') AS base64_di_soal,
       (coalesce(q.option_a,'') || coalesce(q.option_b,'') || coalesce(q.option_c,'')
        || coalesce(q.option_d,'') || coalesce(q.option_e,'')) ~* 'data:image/' AS base64_di_pilihan,
       (coalesce(q.image_url,'') ~* '^data:') AS base64_di_image_url
FROM public.cbt_questions q
WHERE q.question_text ~* 'data:image/'
   OR (coalesce(q.option_a,'') || coalesce(q.option_b,'') || coalesce(q.option_c,'')
       || coalesce(q.option_d,'') || coalesce(q.option_e,'')) ~* 'data:image/'
   OR coalesce(q.image_url,'') ~* '^data:'
ORDER BY panjang_teks DESC;
```

**Yang diharapkan:** 0 baris. Bila ada, unggah gambarnya ke penyimpanan (storage) lalu pakai tautan, dan perkecil ukurannya (lebar ≤ 1000 px, JPEG/WebP).

### B3. Soal dengan teks sangat panjang (kandidat penyebab paket besar)

```sql
SELECT exam_id, question_number, length(question_text) AS panjang
FROM public.cbt_questions
ORDER BY panjang DESC
LIMIT 10;
```

### B4. Gambar bertautan: pastikan alamatnya dapat dijangkau dari internet

Ambil beberapa tautan gambar, lalu buka di browser dari jaringan luar sekolah:

```sql
SELECT DISTINCT image_url FROM public.cbt_questions
WHERE exam_id = 'ID_UJIAN' AND image_url IS NOT NULL AND image_url <> ''
LIMIT 10;
```

---

## C. Sehari sebelum ujian

### C1. Pelaksanaan `VACUUM` (sebelum ujian)

```sql
VACUUM (ANALYZE) public.cbt_exam_sessions;
```

Jalankan di luar jam ujian (VACUUM biasa tidak mengunci tabel, tetapi tetap memakai disk/CPU). Tidak boleh di dalam blok `BEGIN ... COMMIT`.

Lihat kondisi tabel:

```sql
SELECT relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum, last_analyze
FROM pg_stat_user_tables
WHERE relname IN ('cbt_exam_sessions','cbt_student_answers','cbt_exam_papers');
```

### C2. Memanaskan cache paket soal (`cbt_warm_paper`)

Tanpa ini, paket dirakit saat siswa pertama mulai. Migrasi `20261119120000_cbt_hardening_600.sql` sudah mencegah perakitan ganda, tetapi memanaskan di muka tetap lebih aman.

1. Pastikan soal ujian **sudah final** (mengubah soal otomatis menghapus/menyegarkan cache lewat trigger; setelah revisi terakhir, panaskan lagi).
2. Jalankan lewat psql dengan menyamar sebagai guru pemilik ujian (ganti `UID_GURU` = id akun guru/staf di `auth.users`, dan `ID_UJIAN`). Fungsi menolak akun non-staf dan ujian sekolah lain:

   ```sql
   BEGIN;
   SET LOCAL ROLE authenticated;
   SELECT set_config('request.jwt.claims',
     json_build_object('sub','UID_GURU','role','authenticated')::text, true);
   SELECT public.cbt_warm_paper('ID_UJIAN');
   COMMIT;
   ```

   (Saat ini belum ada tombol "Panaskan" di aplikasi; fungsi ini hanya dipanggil lewat SQL atau RPC dari akun staf.)
3. Hasil yang diharapkan: `{"exam_id": "...", "question_count": N, "bytes": M}`. Periksa:

   ```sql
   SELECT exam_id, question_count, pg_size_pretty(pg_column_size(paper)::bigint) AS ukuran, built_at
   FROM public.cbt_exam_papers WHERE exam_id = 'ID_UJIAN';
   ```
4. Ulangi untuk **setiap ujian** yang akan berlangsung (satu panggilan per ujian).

### C3. Cek dari sisi siswa (satu akun siswa uji, bukan akun asli)

Masuk sebagai siswa uji, mulai ujian, dan pastikan: soal terunduh, gambar tampil, jawaban tetap ada setelah halaman dimuat ulang, dan tidak ada kunci jawaban/token di tab **Network** (F12 → Network → cari `cbt_exam_paper`, lihat responsnya).

---

## D. Uji beban 100 siswa asli

Tujuan: memastikan server, jaringan sekolah, dan perangkat siswa kuat. Ini **bukan** pengganti uji beban skrip (`tools/cbt-loadtest`, lihat `README.md` di sana), tetapi menguji jalur nyata: wifi sekolah, Cloudflare, perangkat siswa.

### D1. Buat ujian uji

1. Buat ujian baru di menu CBT dengan judul jelas, mis. **"UJI COBA – jangan dinilai"**, 15–20 soal (campur pilihan ganda dan 1–2 gambar), durasi 20 menit.
2. **Komponen nilai (`grade_component`) harus kosong / NULL** ("Tidak dikirim ke menu Nilai"). Ini yang membuat hasil tidak masuk tabel `grades`. Jangan pilih tugas/kuis/UTS/UAS/praktik.
3. Catat jumlah baris `grades` sekarang (`SELECT count(*) FROM public.grades;`) lalu periksa:

   ```sql
   SELECT id, title, grade_component FROM public.cbt_exams WHERE title ILIKE '%UJI COBA%';
   ```

   **Yang diharapkan:** `grade_component` = NULL. Bila terisi, ubah di aplikasi sebelum siapa pun mengerjakan.
4. Panaskan cache (C2) untuk ujian ini.

### D2. Pelaksanaan

1. Kumpulkan 100 siswa di satu atau dua lab/kelas dengan perangkat dan wifi yang akan dipakai saat ujian sungguhan. Rencanakan ujian uji **di luar jam ujian sungguhan**.
2. Jalankan `VACUUM (ANALYZE) public.cbt_exam_sessions;` (C1).
3. Buka halaman monitoring server (htop/`docker stats`) dan halaman monitoring ujian guru.
4. Semua siswa login, masuk token, dan menekan Mulai **hampir bersamaan** (aba-aba "sekarang"). Jeda acak di aplikasi (2–45 detik) akan menyebar unduhannya; catat berapa lama hingga **semua** soal terunduh.
5. Siswa mengerjakan beberapa menit. Guru mengamati kolom "terakhir aktif" (denyut ±60–70 detik).
6. **Uji tiga skenario (minta sebagian siswa):**
   - ±70 siswa menekan **Selesai** biasa.
   - ±20 siswa dibiarkan sampai **waktu habis** (semua kirim sekaligus, jeda acak sampai 45 detik).
   - ±10 siswa **dicabut internetnya** (wifi dimatikan) selama 4–5 menit lalu guru menekan **Akhiri**: guru harus melihat peringatan "Siswa ini offline…"; setelah wifi siswa dinyalakan kembali (dalam 30 menit), jawabannya harus masuk sebagai **jawaban susulan** (pesan "Jawaban susulan Anda sudah diterima"). Bila tidak bisa tersambung, uji tombol **Unduh file jawaban** pada dialog kegagalan.
7. Catat: waktu unduh paket tersalin, jumlah galat/siswa yang tersangkut, pemakaian CPU/RAM server, dan keluhan siswa.

### D3. Pemeriksaan hasil (ganti `ID_UJIAN_UJI`)

```sql
-- semua sesi harus berstatus selesai, tidak ada yang tertinggal
SELECT status, count(*), min(score), max(score), avg(score)::numeric(6,2) AS rata2
FROM public.cbt_exam_sessions WHERE exam_id = 'ID_UJIAN_UJI'
GROUP BY status;

-- siswa yang dipaksa selesai & yang mengirim susulan
SELECT count(*) FILTER (WHERE forced_finished_at IS NOT NULL) AS dipaksa,
       count(*) FILTER (WHERE late_submitted_at   IS NOT NULL) AS susulan_masuk
FROM public.cbt_exam_sessions WHERE exam_id = 'ID_UJIAN_UJI';

-- ujian uji harus tidak punya komponen nilai (NULL) -> tidak ada yang disinkronkan ke tabel grades
SELECT id, title, grade_component FROM public.cbt_exams WHERE id = 'ID_UJIAN_UJI';
-- Bila grade_component NULL, fungsi sinkron nilai mengembalikan 'skip' dan tabel grades tidak disentuh.
-- Cadangan: hitung baris grades sebelum dan sesudah uji; jumlahnya harus sama.
SELECT count(*) AS jumlah_baris_grades, max(updated_at) AS terakhir_diubah FROM public.grades;
```

### D4. Setelah uji / setelah ujian sungguhan

1. Hapus ujian uji dari aplikasi (atau sesi-sesi uji bila ingin menyimpan soal).
2. Jalankan lagi:

   ```sql
   VACUUM (ANALYZE) public.cbt_exam_sessions;
   ```
3. Periksa `n_dead_tup` dengan kueri di C1; nilainya harus turun mendekati 0 setelah VACUUM.

---

## Catatan batas
- Hasil uji dengan 100 siswa asli lebih kecil daripada 600; bandingkan dengan uji beban skrip (650 siswa `--serentak`) untuk gambaran beban penuh.
- Interval denyut sekarang 60 detik + acak ≤ 10 detik (`src/lib/cbtJitter.ts`). Skrip `tools/cbt-loadtest/loadtest.mjs` masih memakai ±45 detik, sehingga beban denyutnya sedikit lebih tinggi daripada aplikasi sebenarnya (aman, hasil cenderung lebih berat dari kenyataan).
- Batas "tidak aktif 3 menit" pada `cbt_finish_or_request` bergantung pada interval denyut. Jika interval diubah, sesuaikan angka itu di migrasi.
