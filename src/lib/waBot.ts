import { supabase } from '@/integrations/supabase/client';

/** Alamat bot WhatsApp (server.js terpisah, di-proxy oleh Nginx) */
export const WA_BOT_URL = 'https://pusaka.smpn8ciamis.sch.id/wa-api';

/** Panggil endpoint admin bot dengan token login (bot memverifikasi role admin). */
export async function waAdminFetch<T = any>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sesi login tidak ditemukan.');
  let res: Response;
  try {
    res = await fetch(`${WA_BOT_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new Error('Server bot tidak dapat dihubungi. Pastikan bot berjalan dan versi terbaru server.js sudah terpasang.');
  }
  const json = await res.json().catch(() => ({}));
  if ([502, 503, 504].includes(res.status)) {
    throw new Error('Bot WhatsApp tidak berjalan (HTTP ' + res.status + '). Jalankan/restart server.js di server, lalu klik Muat ulang.');
  }
  if (res.status === 404) {
    throw new Error('Endpoint bot belum ada (HTTP 404). Pasang server.js versi terbaru lalu restart bot.');
  }
  if (!res.ok) throw new Error(json.message || `Bot membalas error ${res.status}`);
  return json as T;
}

export interface WaTemplateDef {
  key: string;
  title: string;
  description: string;
  variables: { name: string; sample: string; hint: string }[];
  defaultBody: string;
}

const SIGN = '_SMP Negeri 8 Ciamis_';

/** Template bawaan — harus sama dengan DEFAULT_TEMPLATES di server.js */
export const WA_TEMPLATES: WaTemplateDef[] = [
  {
    key: 'parent_presence',
    title: 'Presensi Siswa (RFID) ke Orang Tua',
    description: 'Dikirim ke orang tua saat siswa tap masuk/pulang.',
    variables: [
      { name: 'nama_siswa', sample: 'Ahmad Fauzi', hint: 'Nama siswa' },
      { name: 'tanggal', sample: '09/10/2026', hint: 'Tanggal presensi' },
      { name: 'waktu', sample: '06:52', hint: 'Jam presensi' },
      { name: 'jenis', sample: 'Masuk', hint: 'Masuk / Pulang' },
      { name: 'status', sample: 'Hadir', hint: 'Hadir / Terlambat' },
    ],
    defaultBody: `📢 *NOTIFIKASI PRESENSI SISWA*\n\nYth. Bapak/Ibu Orang Tua/Wali,\nMemberitahukan bahwa ananda:\n• Nama: *{{nama_siswa}}*\n• Tanggal: *{{tanggal}}*\n• Waktu: *{{waktu}} WIB*\n• Status: *{{jenis}} - {{status}}*\n\nTerima kasih atas perhatiannya.\n${SIGN}`,
  },
  {
    key: 'attendance_batch',
    title: 'Presensi Massal ke Orang Tua',
    description: 'Dikirim lewat pengiriman notifikasi presensi kolektif.',
    variables: [
      { name: 'nama_siswa', sample: 'Ahmad Fauzi', hint: 'Nama siswa' },
      { name: 'tanggal', sample: '09/10/2026', hint: 'Tanggal' },
      { name: 'waktu', sample: '06:52', hint: 'Jam' },
      { name: 'status', sample: 'Hadir', hint: 'Status kehadiran' },
    ],
    defaultBody: `📢 *NOTIFIKASI PRESENSI*\n\nYth. Orang Tua/Wali,\nAnanda *{{nama_siswa}}* pada *{{tanggal}}* pukul *{{waktu}} WIB* statusnya: *{{status}}*.\n\n${SIGN}`,
  },
  {
    key: 'teacher_first',
    title: 'Pengingat Guru — Jam Pertama',
    description: 'Dikirim sebelum jam mengajar pertama guru pada hari itu.',
    variables: [
      { name: 'nama_guru', sample: 'Budi Santoso, S.Pd', hint: 'Nama guru' },
      { name: 'kelas', sample: 'VIII A', hint: 'Nama kelas' },
      { name: 'mapel', sample: 'Matematika', hint: 'Mata pelajaran' },
      { name: 'jam', sample: '07:00–08:20 WIB', hint: 'Jam pelajaran' },
    ],
    defaultBody: `⏰ *PENGINGAT JAM PERTAMA MENGAJAR*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\nHari ini jam pertama mengajar Anda:\n• Kelas: *{{kelas}}*\n• Mapel: *{{mapel}}*\n• Jam: *{{jam}}*\n\nMohon segera masuk kelas, lalu:\n1️⃣ Isi *absensi siswa*\n2️⃣ Isi *jurnal mengajar*\n\nTerima kasih.\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'teacher_next',
    title: 'Pengingat Guru — Jam Berikutnya',
    description: 'Dikirim sebelum jam mengajar selain jam pertama.',
    variables: [
      { name: 'nama_guru', sample: 'Budi Santoso, S.Pd', hint: 'Nama guru' },
      { name: 'kelas', sample: 'VIII A', hint: 'Nama kelas' },
      { name: 'mapel', sample: 'Matematika', hint: 'Mata pelajaran' },
      { name: 'jam', sample: '09:00–10:20 WIB', hint: 'Jam pelajaran' },
    ],
    defaultBody: `⏰ *PENGINGAT MENGAJAR*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\nSebentar lagi jadwal mengajar Anda:\n• Kelas: *{{kelas}}*\n• Mapel: *{{mapel}}*\n• Jam: *{{jam}}*\n\nMohon masuk kelas tepat waktu dan jangan lupa mengisi *jurnal mengajar* setelah pembelajaran.\n\nTerima kasih.\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'teacher_followup',
    title: 'Tindak Lanjut — Absensi/Jurnal Belum Diisi',
    description: 'Dikirim bila setelah jam mulai absensi/jurnal belum terisi.',
    variables: [
      { name: 'nama_guru', sample: 'Budi Santoso, S.Pd', hint: 'Nama guru' },
      { name: 'kelas', sample: 'VIII A', hint: 'Nama kelas' },
      { name: 'mapel', sample: 'Matematika', hint: 'Mata pelajaran' },
      { name: 'jam', sample: '07:00–08:20 WIB', hint: 'Jam pelajaran' },
      { name: 'belum_terisi', sample: '• *absensi siswa*\n• *jurnal mengajar*', hint: 'Daftar yang belum diisi' },
    ],
    defaultBody: `📝 *PENGINGAT PENGISIAN*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\nData berikut belum terisi untuk kelas *{{kelas}}* ({{mapel}}, {{jam}}):\n{{belum_terisi}}\n\nMohon segera dilengkapi di aplikasi Pusaka.\n\nTerima kasih.\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'teacher_daily_recap',
    title: 'Rekap Jadwal Harian Guru',
    description: 'Dikirim pagi hari (jam diatur di tab Pengingat Guru) berisi jadwal mengajar guru hari itu.',
    variables: [
      { name: 'nama_guru', sample: 'Budi Santoso, S.Pd', hint: 'Nama guru' },
      { name: 'hari', sample: 'Senin', hint: 'Nama hari' },
      { name: 'tanggal', sample: '12/10/2026', hint: 'Tanggal' },
      { name: 'jumlah_jam', sample: '3', hint: 'Jumlah sesi mengajar' },
      { name: 'rekap', sample: '1. 07:00-08:20 | VIII A | Matematika\n2. 09:00-10:20 | VII B | Matematika', hint: 'Daftar jadwal' },
    ],
    defaultBody: `📅 *REKAP JADWAL MENGAJAR*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\nJadwal mengajar Anda hari *{{hari}}, {{tanggal}}* ({{jumlah_jam}} sesi):\n\n{{rekap}}\n\nJangan lupa mengisi *absensi* dan *jurnal mengajar*.\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'teacher_saturday_greeting',
    title: 'Ucapan Akhir Pekan (Sabtu) untuk Guru',
    description: 'Dikirim hari Sabtu ke guru yang tidak punya jadwal mengajar hari itu (jam kirim diatur di tab Pengingat Guru).',
    variables: [
      { name: 'nama_guru', sample: 'Budi Santoso, S.Pd', hint: 'Nama guru' },
      { name: 'hari', sample: 'Sabtu', hint: 'Nama hari' },
    ],
    defaultBody: `🌿 *SELAMAT AKHIR PEKAN*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\n\nTerima kasih atas dedikasi dan kerja keras Bapak/Ibu dalam mendidik anak-anak kita sepanjang pekan ini.\n\nHari {{hari}} adalah waktu untuk berhenti sejenak. Nikmatilah akhir pekan bersama keluarga, karena keluarga adalah sumber kekuatan terbesar seorang pendidik. Istirahatlah yang cukup dan siapkan energi terbaik untuk mengajar kembali di hari Senin.\n\nSemoga sehat dan bahagia selalu. 🙏\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'homeroom_attendance_reminder',
    title: 'Pengingat Absensi ke Wali Kelas',
    description: 'Dikirim ke wali kelas bila pada jam pengecekan absensi jam pertama kelasnya belum diisi (aturan di tab Pengingat Guru).',
    variables: [
      { name: 'nama_wali', sample: 'Siti Aminah, S.Pd', hint: 'Nama wali kelas' },
      { name: 'kelas', sample: 'VIII A', hint: 'Nama kelas' },
      { name: 'hari', sample: 'Senin', hint: 'Nama hari' },
      { name: 'tanggal', sample: '12/10/2026', hint: 'Tanggal' },
      { name: 'waktu', sample: '08:30', hint: 'Jam pengecekan (WIB)' },
      { name: 'jam_pertama', sample: '07:00-08:20', hint: 'Jam pelajaran pertama kelas' },
      { name: 'mapel', sample: 'Matematika', hint: 'Mapel jam pertama' },
      { name: 'guru_pengajar', sample: 'Budi Santoso, S.Pd', hint: 'Guru pengajar jam pertama yang belum mengisi absensi' },
    ],
    defaultBody: `📋 *PENGINGAT ABSENSI KELAS*\n\nYth. Bapak/Ibu *{{nama_wali}}* (Wali Kelas {{kelas}}),\nPada pukul {{waktu}} WIB absensi kelas *{{kelas}}* hari {{hari}}, {{tanggal}} belum terisi.\n\nJadwal jam pertama:\n• Jam: *{{jam_pertama}}*\n• Mapel: *{{mapel}}*\n• Guru pengajar: *{{guru_pengajar}}* (belum mengisi absensi)\n\nMohon bantu mengisi absensi kelas Anda di aplikasi Pusaka.\n\nTerima kasih.\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'weekly_absence_wali',
    title: 'Rekap Mingguan Siswa Tidak Hadir (Wali Kelas)',
    description: 'Dikirim ke wali kelas pada hari & jam yang diatur di tab Pengingat Guru, berisi siswa sakit/izin/alfa pekan itu.',
    variables: [
      { name: 'nama_wali', sample: 'Siti Aminah, S.Pd', hint: 'Nama wali kelas' },
      { name: 'kelas', sample: 'VIII A', hint: 'Nama kelas' },
      { name: 'periode', sample: '19/10/2026 - 24/10/2026', hint: 'Rentang tanggal rekap' },
      { name: 'jumlah_siswa', sample: '5', hint: 'Jumlah siswa yang tidak hadir' },
      { name: 'rekap', sample: '1. Andi (S:1 I:0 A:2) ⚠️\n2. Cici (S:0 I:1 A:0)', hint: 'Daftar siswa beserta jumlah hari S/I/A' },
      { name: 'sering', sample: '⚠️ *Perlu perhatian* ...', hint: 'Bagian siswa yang sering tidak hadir (otomatis)' },
    ],
    defaultBody: `📊 *REKAP KETIDAKHADIRAN MINGGUAN*\n\nYth. Bapak/Ibu *{{nama_wali}}* (Wali Kelas {{kelas}}),\nSiswa yang tidak hadir pada *{{periode}}* ({{jumlah_siswa}} siswa):\n\n{{rekap}}\n_S=Sakit, I=Izin, A=Alfa (jumlah hari)_\n\n{{sering}}\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'weekly_absence_group',
    title: 'Rekap Mingguan Siswa Sering Tidak Hadir (Grup)',
    description: 'Dikirim ke grup rekap (tab Rekap Grup) bila opsi "kirim ringkasan ke grup" aktif; hanya siswa yang sering tidak hadir.',
    variables: [
      { name: 'periode', sample: '19/10/2026 - 24/10/2026', hint: 'Rentang tanggal rekap' },
      { name: 'rekap', sample: '*VIII A*\n- Andi (S:1 I:0 A:2)', hint: 'Daftar per kelas' },
    ],
    defaultBody: `📊 *SISWA SERING TIDAK HADIR*\nPeriode *{{periode}}*\n\n{{rekap}}\n_S=Sakit, I=Izin, A=Alfa (jumlah hari)_\n\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'assignment_notice',
    title: 'Surat Tugas / SPPD Baru (Guru/Staf)',
    description: 'Dikirim otomatis ke guru/staf pelaksana saat SPPD dibuat: jenis, waktu, lokasi, plus pengingat mengisi LPT dan mengunggah bukti kunjungan.',
    variables: [
      { name: 'nama', sample: 'Budi Santoso, S.Pd', hint: 'Nama penerima tugas' },
      { name: 'nomor_surat', sample: '800/123/SMPN8/2026', hint: 'Nomor surat tugas' },
      { name: 'jenis', sample: 'Bimbingan Teknis', hint: 'Jenis tugas' },
      { name: 'uraian', sample: 'Mengikuti bimtek kurikulum', hint: 'Uraian tugas' },
      { name: 'waktu', sample: 'Senin, 26/10/2026 s.d. Selasa, 27/10/2026 (2 hari)', hint: 'Tanggal pelaksanaan' },
      { name: 'lokasi', sample: 'Dinas Pendidikan Kab. Ciamis', hint: 'Lokasi tugas' },
    ],
    defaultBody: `📄 *SURAT TUGAS BARU*\n\nYth. Bapak/Ibu *{{nama}}*,\nAnda mendapat surat tugas berikut:\n• Nomor: {{nomor_surat}}\n• Jenis tugas: *{{jenis}}*\n• Uraian: {{uraian}}\n• Waktu: *{{waktu}}*\n• Lokasi: *{{lokasi}}*\n\nSetelah tugas selesai, mohon:\n1. Mengisi *LPT* (Laporan Pelaksanaan Tugas)\n2. Mengunggah *bukti kunjungan* (foto dan berkas PDF)\npada akun Pusaka, menu *Surat Tugas & SPPD*.\n\nTerima kasih.\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'piket_punch',
    title: 'Absensi Piket Tercatat (Mesin Fingerprint)',
    description: 'Dikirim ke petugas piket (malam / Sabtu-Minggu) saat absen masuk atau pulangnya tercatat di mesin fingerprint.',
    variables: [
      { name: 'nama', sample: 'Ahmad Fauzi', hint: 'Nama petugas piket' },
      { name: 'shift', sample: 'Piket Malam', hint: 'Jenis piket' },
      { name: 'jenis', sample: 'masuk', hint: '"masuk" atau "pulang"' },
      { name: 'tanggal', sample: '12/10/2026', hint: 'Tanggal piket' },
      { name: 'jam', sample: '19:45', hint: 'Jam absen (WIB)' },
    ],
    defaultBody: `🕒 *ABSENSI PIKET TERCATAT*\n\nYth. Bapak/Ibu *{{nama}}*,\nAbsen *{{jenis}}* {{shift}} Anda tercatat pada {{tanggal}} pukul *{{jam}} WIB* melalui mesin absensi.\n\nTerima kasih atas pengabdiannya.\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'test_connection',
    title: 'Tes Koneksi ke Guru',
    description: 'Dikirim lewat tombol "Kirim Tes Koneksi ke Semua Guru" di tab Koneksi, agar guru menyimpan nomor bot.',
    variables: [
      { name: 'nama_guru', sample: 'Budi Santoso, S.Pd', hint: 'Nama guru penerima' },
    ],
    defaultBody: `✅ *TES KONEKSI BERHASIL*\n\nHalo Bapak/Ibu,\n\nNomor WhatsApp ini adalah *Akun Resmi SMP Negeri 8 Ciamis* yang digunakan untuk mengirimkan:\n\n📅 *Notifikasi Jadwal Pelajaran*\n📢 *Notifikasi Presensi Siswa*\n🔔 *Pengingat Mengajar*\n📝 *Pengingat Pengisian Jurnal*\n\n━━━━━━━━━━━━━━━━━━\n\n⚠️ *PENTING:*\nSilakan *SIMPAN NOMOR INI* ke kontak WhatsApp Bapak/Ibu.\n\nJika nomor ini *TIDAK disimpan*, WhatsApp akan memblokir pesan dari nomor yang tidak dikenal, sehingga Bapak/Ibu *tidak akan menerima notifikasi* penting dari sekolah.\n\n━━━━━━━━━━━━━━━━━━\n\nTerima kasih atas perhatiannya.\n_SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'class_attendance_recap',
    title: 'Rekap Absensi Per Kelas (ke Grup)',
    description: 'Dikirim ke grup WhatsApp otomatis setelah absen jam pertama SEMUA kelas hari itu terisi (diatur di tab Rekap Grup). Berbentuk tabel per kelas + rekap seluruh kelas.',
    variables: [
      { name: 'hari', sample: 'Senin', hint: 'Nama hari' },
      { name: 'tanggal', sample: '12/10/2026', hint: 'Tanggal' },
      { name: 'tabel_rekap', sample: '```\n+---+---+---+-+-+-+---+\n|Kls|Sis|  H|S|I|A|Jml|\n+---+---+---+-+-+-+---+\n|7A | 32| 30|1|1|0|  2|\n|7B | 31| 29|1|0|1|  2|\n|8A | 32| 30|0|1|1|  2|\n|8B | 31| 30|1|0|0|  1|\n|9A | 32| 31|0|1|0|  1|\n|9B | 32| 31|1|0|0|  1|\n+---+---+---+-+-+-+---+\n|Tot|190|181|4|3|2|  9|\n+---+---+---+-+-+-+---+\n```', hint: 'Tabel ber-border: Kls, Sis, H, S, I, A, Jml tidak sekolah + baris Tot' },
      { name: 'jumlah_kelas', sample: '6', hint: 'Jumlah kelas' },
      { name: 'total_siswa', sample: '190', hint: 'Total siswa seluruh kelas' },
      { name: 'total_hadir', sample: '181', hint: 'Total hadir' },
      { name: 'total_sakit', sample: '4', hint: 'Total sakit' },
      { name: 'total_izin', sample: '3', hint: 'Total izin' },
      { name: 'total_alfa', sample: '2', hint: 'Total alfa' },
      { name: 'total_tidak_hadir', sample: '9', hint: 'Sakit + izin + alfa' },
      { name: 'persen_hadir', sample: '95,3', hint: 'Persentase hadir' },
    ],
    defaultBody: `📊 *REKAP ABSENSI SISWA PER KELAS*\n{{hari}}, {{tanggal}}\n\n{{tabel_rekap}}\nKls=Kelas, Sis=Siswa, H=Hadir, S=Sakit, I=Izin, A=Alfa, Jml=Jumlah tidak sekolah\n\n*REKAP SEMUA KELAS* ({{jumlah_kelas}} kelas, {{total_siswa}} siswa)\n• Hadir: *{{total_hadir}}* ({{persen_hadir}}%)\n• Sakit: *{{total_sakit}}*\n• Izin: *{{total_izin}}*\n• Alfa: *{{total_alfa}}*\n• Jml tidak hadir: *{{total_tidak_hadir}}*\n\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
  {
    key: 'class_group_recap',
    title: 'Rekap Absensi ke Grup Kelas (per kelas)',
    description: 'Dikirim ke grup WhatsApp masing-masing kelas setelah absen kelas itu terisi (diatur di tab Grup Kelas). Berisi jumlah hadir/sakit/izin/alfa dan nama siswa yang tidak masuk.',
    variables: [
      { name: 'kelas', sample: 'VIII A', hint: 'Nama kelas' },
      { name: 'hari', sample: 'Senin', hint: 'Nama hari' },
      { name: 'tanggal', sample: '12/10/2026', hint: 'Tanggal' },
      { name: 'total_siswa', sample: '32', hint: 'Jumlah siswa aktif di kelas' },
      { name: 'hadir', sample: '29', hint: 'Jumlah hadir' },
      { name: 'sakit', sample: '1', hint: 'Jumlah sakit' },
      { name: 'izin', sample: '1', hint: 'Jumlah izin' },
      { name: 'alpa', sample: '1', hint: 'Jumlah alfa' },
      { name: 'jumlah_tidak_hadir', sample: '3', hint: 'Sakit + izin + alfa' },
      { name: 'daftar_tidak_hadir', sample: '*Siswa yang tidak masuk (3):*\n1. Ahmad Fauzi (Sakit)\n2. Siti Aisyah (Izin)\n3. Rudi Hartono (Alfa)', hint: 'Daftar bernomor beserta judulnya (otomatis berisi ucapan syukur bila semua hadir)' },
    ],
    defaultBody: `📊 *ABSENSI KELAS {{kelas}}*\n{{hari}}, {{tanggal}}\n\nJumlah siswa: *{{total_siswa}}*\n✅ Hadir: *{{hadir}}*\n🤒 Sakit: *{{sakit}}*\n📝 Izin: *{{izin}}*\n❌ Alfa: *{{alpa}}*\n\n{{daftar_tidak_hadir}}\n\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
];

/** Tanggal hari ini (WIB) format YYYY-MM-DD */
export function wibToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * Beri tahu bot bahwa absen baru saja disimpan. Bot mengirim rekap ke grup KELAS yang absennya sudah terisi
 * (satu kali per kelas per hari; diatur server). Gagal diam-diam agar tidak mengganggu proses simpan absen.
 */
export async function notifyBotClassGroups(): Promise<void> {
  try {
    const res = await waAdminFetch<{ status: string; queued?: string[] }>('/attendance-class-saved', { method: 'POST', body: {} });
    if (res.queued && res.queued.length) console.info('[Rekap grup kelas] dikirim ke:', res.queued.join(', '));
  } catch (e) {
    console.warn('[Rekap grup kelas] tidak dapat memberi tahu bot:', (e as Error)?.message);
  }
}

/**
 * Dipanggil setelah absensi disimpan. Frontend memeriksa (1 query ringan) apakah absen jam pertama
 * SEMUA kelas hari ini sudah terisi; hanya jika sudah lengkap bot WA diberi tahu untuk mengirim rekap ke grup.
 * Bot tidak melakukan pengecekan berulang. Gagal diam-diam agar tidak mengganggu proses simpan absen.
 */
export async function notifyBotIfAttendanceComplete(savedDate?: string): Promise<void> {
  // Rekap per kelas ke grup masing-masing: tidak perlu menunggu semua kelas terisi.
  if (!savedDate || savedDate === wibToday()) void notifyBotClassGroups();
  try {
    const today = wibToday();
    if (savedDate && savedDate !== today) return;
    const key = `wa-class-recap-notified-${today}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* abaikan */ }
    const { data, error } = await (supabase as any).rpc('get_class_attendance_completion', { p_date: today });
    if (error) { console.warn('[Rekap grup] gagal memeriksa kelengkapan absensi:', error.message); return; }
    if (!Array.isArray(data) || data.length === 0) return;
    if (data.some((c: { filled: boolean }) => !c.filled)) return; // belum lengkap: jangan beri tahu bot
    const res = await waAdminFetch<{ status: string }>('/attendance-complete', { method: 'POST', body: { date: today } });
    console.info('[Rekap grup] bot menjawab:', res.status);
    if (['queued', 'already_sent', 'disabled'].includes(res.status)) {
      try { sessionStorage.setItem(key, '1'); } catch { /* abaikan */ }
    }
  } catch (e) {
    // Bot tidak aktif / belum diatur: tidak mengganggu simpan absen, tetapi dicatat di konsol untuk diagnosis.
    console.warn('[Rekap grup] tidak dapat memberi tahu bot:', (e as Error)?.message);
  }
}

/**
 * Dipanggil sekali setelah SPPD berhasil dibuat: bot mengirim WA ke guru/staf pelaksana (jenis, waktu, lokasi,
 * pengingat LPT & bukti kunjungan). Bot tidak melakukan pengecekan berkala. Gagal diam-diam agar tidak mengganggu pembuatan SPPD.
 */
export async function notifyBotTravelCreated(travelId: string): Promise<void> {
  try {
    const res = await waAdminFetch<{ status: string; queued?: number; no_phone?: number }>('/travel-created', { method: 'POST', body: { travel_id: travelId } });
    console.info('[WA SPPD] bot menjawab:', res.status, res.queued ?? '', res.no_phone ? `(tanpa nomor HP: ${res.no_phone})` : '');
  } catch (e) {
    console.warn('[WA SPPD] tidak dapat memberi tahu bot:', (e as Error)?.message);
  }
}

export function fillWaTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? '');
}
