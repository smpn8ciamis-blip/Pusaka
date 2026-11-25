// RAB (Rencana Anggaran Biaya) dan Penggunaan dana Komite: tipe dan helper bersama (halaman publik + dashboard bendahara).
import { supabase } from '@/integrations/supabase/client';

export const KOMITE_FOTO_BUCKET = 'komite-penggunaan';
export const KOMITE_FOTO_MAKS_MB = 5;

export interface KomiteRabPublik {
  id: string;
  kelompok: string;
  uraian: string;
  volume: number;
  satuan: string | null;
  harga_satuan: number;
  jumlah: number;
  keterangan: string | null;
  urutan: number;
  /** Total belanja yang dikaitkan ke pos ini; null bila tab Penggunaan disembunyikan. */
  terpakai: number | null;
}

export interface KomitePenggunaanPublik {
  id: string;
  tanggal: string;
  uraian: string;
  rab_id: string | null;
  kelompok: string | null;
  rab_uraian: string | null;
  penerima: string | null;
  volume: number;
  satuan: string | null;
  jumlah: number;
  keterangan: string | null;
  foto_path: string | null;
}

export interface KomiteAnggaranPublik {
  configured: boolean;
  tampilkan_rab?: boolean;
  tampilkan_penggunaan?: boolean;
  terkumpul?: number;
  target?: number;
  total_rab?: number;
  total_penggunaan?: number;
  jumlah_penggunaan?: number;
  rab?: KomiteRabPublik[];
  penggunaan?: KomitePenggunaanPublik[];
}

/** URL publik foto barang; null bila tidak ada foto. */
export const fotoUrl = (path: string | null | undefined) =>
  path ? supabase.storage.from(KOMITE_FOTO_BUCKET).getPublicUrl(path).data.publicUrl : null;

/** "10" atau "2,5" (maksimal dua desimal, tanpa nol di belakang). */
export const formatVolume = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });

/** Menerima angka desimal dengan koma/titik dari input, mis. "2,5" -> 2.5. Tanpa angka -> 0. */
export const parseDesimalInput = (v: string) => {
  const n = Number(String(v ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Akar kata kunci pencarian yang tidak peka huruf besar-kecil. */
export const cocok = (teks: string | null | undefined, kata: string) => String(teks ?? '').toLowerCase().includes(kata.toLowerCase());
