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
];

export function fillWaTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? '');
}
