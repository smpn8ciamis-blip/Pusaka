-- Berita website: panduan orang tua menautkan nomor WhatsApp ke siswa dan mengecek poin pelanggaran / absensi lewat bot.
-- Aman dijalankan ulang (dilewati bila slug sudah ada). Isi bisa diubah di Admin Web > Berita.
INSERT INTO public.website_news (school_id, slug, title, excerpt, content, category_id, author_name, status, is_featured, published_at)
SELECT
  COALESCE((SELECT school_id FROM public.website_news WHERE school_id IS NOT NULL LIMIT 1),
           (SELECT school_id FROM public.website_news_categories WHERE school_id IS NOT NULL LIMIT 1)),
  'panduan-cek-poin-pelanggaran-dan-absensi-lewat-whatsapp',
  'Panduan Orang Tua: Cek Poin Pelanggaran dan Absensi Anak lewat WhatsApp',
  'Orang tua/wali kini dapat memantau poin pelanggaran dan kehadiran anak lewat WhatsApp. Tautkan nomor WA Anda dengan NISN siswa, lalu ketik "cek poin" atau "absen".',
  $html$
<p>Orang tua/wali siswa SMP Negeri 8 Ciamis kini dapat memantau <strong>poin pelanggaran</strong> dan <strong>kehadiran</strong> anak langsung lewat WhatsApp, kapan saja, tanpa perlu datang ke sekolah.</p>

<h2>A. Menautkan Nomor WhatsApp dengan Akun Siswa</h2>
<p>Langkah ini cukup dilakukan <strong>satu kali</strong>. Gunakan nomor WhatsApp yang akan dipakai untuk menerima informasi.</p>
<p><strong>Siapkan dahulu:</strong> NISN siswa dan tanggal lahir siswa.</p>
<ol>
  <li>Simpan nomor WhatsApp resmi sekolah (bot Pusaka). Nomornya dapat ditanyakan ke wali kelas atau tata usaha.</li>
  <li>Buka WhatsApp, lalu kirim pesan: <strong>DAFTAR</strong></li>
  <li>Bot akan meminta <strong>NISN</strong> siswa. Balas dengan NISN anak Anda.</li>
  <li>Bot akan meminta <strong>tanggal lahir</strong> siswa. Tulis dengan format <strong>DDMMYYYY</strong> tanpa tanda baca. Contoh: lahir 15 Agustus 2011 ditulis <strong>15082011</strong>.</li>
  <li>Jika data cocok, bot membalas <strong>BERHASIL</strong> dan nomor Anda sudah tertaut dengan siswa tersebut.</li>
</ol>
<p>Untuk membatalkan proses pendaftaran, ketik <strong>BATAL</strong>.</p>
<p><em>Catatan:</em> satu nomor dapat ditautkan ke lebih dari satu anak (misalnya kakak dan adik yang sama-sama bersekolah di sini). Ulangi langkah di atas untuk setiap anak.</p>

<h2>B. Mengecek Poin Pelanggaran</h2>
<p>Setelah nomor tertaut, kirim pesan:</p>
<p style="font-size:1.25em"><strong>cek poin</strong></p>
<p>Bot akan membalas berisi:</p>
<ul>
  <li>Nama dan kelas siswa</li>
  <li>Total poin pelanggaran</li>
  <li>Rincian pelanggaran: tanggal, jenis pelanggaran, poin, dan catatan (10 catatan terbaru)</li>
</ul>
<p>Jika siswa belum memiliki catatan pelanggaran, bot akan memberi tahu bahwa tidak ada catatan.</p>

<h2>C. Mengecek Rekap Kehadiran (1 Bulan Terakhir)</h2>
<p>Setelah nomor tertaut, kirim pesan:</p>
<p style="font-size:1.25em"><strong>absen</strong></p>
<p>Bot akan membalas rekap kehadiran <strong>30 hari terakhir</strong> berisi jumlah hari hadir (beserta persentasenya), terlambat, sakit, izin, dan alfa, serta daftar tanggal siswa tidak hadir.</p>

<h2>Perlu Diketahui</h2>
<ul>
  <li>Perintah ditulis biasa, huruf besar atau kecil tidak berpengaruh.</li>
  <li>Bot menjawab otomatis. Bila belum ada balasan, tunggu beberapa saat sebelum mengirim ulang (ada jeda singkat antarperintah).</li>
  <li>Jika bot menjawab bahwa nomor belum tertaut, ulangi langkah <strong>DAFTAR</strong> di atas.</li>
  <li>Satu siswa hanya dapat ditautkan ke <strong>satu nomor</strong>. Jika bot menjawab bahwa NISN sudah tertaut, tetapi bukan nomor Anda, atau Anda ingin mengganti nomor, hubungi wali kelas atau tata usaha agar tautan lama dilepas, lalu lakukan <strong>DAFTAR</strong> dari nomor baru.</li>
  <li>Bila NISN atau tanggal lahir ditolak, hubungi wali kelas atau tata usaha untuk memeriksa data siswa.</li>
</ul>
<p>Data yang ditampilkan bersifat rahasia dan hanya dapat dilihat oleh nomor yang tertaut. Mohon tidak membagikan NISN dan tanggal lahir siswa kepada pihak lain.</p>
$html$,
  (SELECT id FROM public.website_news_categories WHERE slug = 'pengumuman' LIMIT 1),
  'Tim Pusaka SMPN 8 Ciamis', 'published', false, now()
WHERE NOT EXISTS (SELECT 1 FROM public.website_news WHERE slug = 'panduan-cek-poin-pelanggaran-dan-absensi-lewat-whatsapp');
