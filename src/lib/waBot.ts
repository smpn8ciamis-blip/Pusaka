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
    description: 'Dikirim ke grup WhatsApp otomatis setelah absen jam pertama SEMUA kelas hari itu terisi (diatur di tab Rekap Grup).',
    variables: [
      { name: 'hari', sample: 'Senin', hint: 'Nama hari' },
      { name: 'tanggal', sample: '12/10/2026', hint: 'Tanggal' },
      { name: 'rekap_kelas', sample: '• *VII A*: H 30 | S 1 | I 0 | A 1\n• *VII B*: H 28 | S 2 | I 1 | A 0', hint: 'Satu baris per kelas' },
      { name: 'total_hadir', sample: '58', hint: 'Total siswa hadir' },
      { name: 'total_siswa', sample: '62', hint: 'Total siswa seluruh kelas' },
      { name: 'jumlah_kelas', sample: '2', hint: 'Jumlah kelas' },
    ],
    defaultBody: `📊 *REKAP ABSENSI SISWA PER KELAS*\n{{hari}}, {{tanggal}}\n\n{{rekap_kelas}}\n\n*Total:* {{total_hadir}} hadir dari {{total_siswa}} siswa ({{jumlah_kelas}} kelas)\nKeterangan: H=Hadir, S=Sakit, I=Izin, A=Alpa\n\n_Pusaka - SMP Negeri 8 Ciamis_`,
  },
];

/** Tanggal hari ini (WIB) format YYYY-MM-DD */
export function wibToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * Dipanggil setelah absensi disimpan. Frontend memeriksa (1 query ringan) apakah absen jam pertama
 * SEMUA kelas hari ini sudah terisi; hanya jika sudah lengkap bot WA diberi tahu untuk mengirim rekap ke grup.
 * Bot tidak melakukan pengecekan berulang. Gagal diam-diam agar tidak mengganggu proses simpan absen.
 */
export async function notifyBotIfAttendanceComplete(savedDate?: string): Promise<void> {
  try {
    const today = wibToday();
    if (savedDate && savedDate !== today) return;
    const key = `wa-class-recap-notified-${today}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* abaikan */ }
    const { data, error } = await (supabase as any).rpc('get_class_attendance_completion', { p_date: today });
    if (error || !Array.isArray(data) || data.length === 0) return;
    if (data.some((c: { filled: boolean }) => !c.filled)) return; // belum lengkap: jangan beri tahu bot
    const res = await waAdminFetch<{ status: string }>('/attendance-complete', { method: 'POST', body: { date: today } });
    if (['queued', 'already_sent', 'disabled'].includes(res.status)) {
      try { sessionStorage.setItem(key, '1'); } catch { /* abaikan */ }
    }
  } catch {
    /* bot tidak aktif / belum diatur: abaikan */
  }
}

export function fillWaTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? '');
}
