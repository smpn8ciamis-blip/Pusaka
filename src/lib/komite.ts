// Penggalangan dana Komite: tipe, format, dan perhitungan bersama (halaman publik + dashboard).

export interface KomiteGrade {
  grade: number;
  total: number;
  jumlah: number;
  rekening: number;
  tunai: number;
  siswa_penyumbang: number;
  siswa_total: number;
}

export interface KomiteRekening {
  id: string;
  bank: string;
  nomor: string;
  atas_nama: string;
  catatan: string | null;
}

export interface KomiteRincianPublik {
  tanggal: string;
  jumlah: number;
  sumber: 'rekening' | 'tunai';
  kategori: 'siswa' | 'donatur_lain';
  grade: number | null;
  nama: string;
}

export interface KomitePublik {
  configured: boolean;
  judul?: string;
  deskripsi?: string | null;
  target?: number;
  batas_waktu?: string | null;
  tampilkan_rincian?: boolean;
  nama_publik?: 'lengkap' | 'inisial' | 'anonim';
  total?: number;
  rekening_total?: number;
  tunai_total?: number;
  jumlah?: number;
  per_tingkat?: KomiteGrade[];
  donatur_lain?: { total: number; jumlah: number; rekening: number; tunai: number };
  rekening?: KomiteRekening[];
  rincian?: KomiteRincianPublik[];
  diperbarui?: string | null;
}

export const KOMITE_GRADES = [7, 8, 9] as const;

export const formatRupiah = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);

/** Persentase 0..100 (dibatasi), 0 bila pembagi 0. */
export const persen = (bagian: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, (Number(bagian) / Number(total)) * 100)) : 0;

/** Persentase untuk teks: satu desimal, boleh lebih dari 100 (target terlampaui). */
export const persenTeks = (bagian: number, total: number) =>
  total > 0 ? `${((Number(bagian) / Number(total)) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '0%';

export const formatTanggal = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Sisa hari sampai batas waktu (negatif bila lewat); null bila tidak ada batas. */
export const sisaHari = (batas: string | null | undefined, now: Date = new Date()) => {
  if (!batas) return null;
  const end = new Date(`${batas}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - now.getTime()) / 86400000);
};

export const SUMBER_LABEL: Record<string, string> = { rekening: 'Rekening', tunai: 'Tunai' };
export const KATEGORI_LABEL: Record<string, string> = { siswa: 'Siswa', donatur_lain: 'Donatur lain' };
export const NAMA_PUBLIK_LABEL: Record<string, string> = {
  inisial: 'Inisial (A*** S***)',
  lengkap: 'Nama lengkap',
  anonim: 'Anonim (Hamba Allah)',
};

/** Menerima angka dengan titik/koma/"Rp" dari kolom input, mis. "1.500.000" -> 1500000. */
export const parseRupiahInput = (v: string) => {
  const digits = String(v ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
};
