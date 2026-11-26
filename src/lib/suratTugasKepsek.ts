// Surat tugas Kepala Sekolah / Plt: format Dinas Pendidikan (ditandatangani Kabid Pembinaan SMP).
// Kepsek/Plt mendapat surat tugas terpisah dari guru; di sini logika pengenalan, penomoran, dan teks tanggal.
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { parseSuratSequence, renderSuratNumber, validateSuratPattern } from '@/lib/suratNumber';

export interface KepsekLetterSettings {
  /** Pola nomor surat, mis. 400.3.5/{URUT}/SMPN8Ciamis/{TAHUN} */
  pattern: string;
  tempat: string;
  kop1: string;
  kop2: string;
  kop3: string;
  /** Pejabat penandatangan (Kabid Pembinaan SMP) */
  penerbit_nama: string;
  penerbit_nip: string;
  penerbit_pangkat: string;
  penerbit_jabatan: string;
  /** Pangkat/golongan kepsek/Plt bila tidak ada di data guru. */
  kepsek_pangkat: string;
}

export const DEFAULT_KEPSEK_SETTINGS: KepsekLetterSettings = {
  pattern: '400.3.5/{URUT}/SMPN8Ciamis/{TAHUN}',
  tempat: 'Ciamis',
  kop1: 'PEMERINTAH KABUPATEN CIAMIS',
  kop2: 'DINAS PENDIDIKAN',
  kop3: 'Jalan R.A.A.Kusumasubrata Nomor 3 Telepon (0265) 773709',
  penerbit_nama: '',
  penerbit_nip: '',
  penerbit_pangkat: '',
  penerbit_jabatan: 'Kepala Bidang Pembinaan SMP',
  kepsek_pangkat: '',
};

/** Menggabungkan isi tersimpan dengan bawaan; isian kosong memakai bawaan (kecuali data pejabat). */
export function mergeKepsekSettings(stored: Partial<Record<keyof KepsekLetterSettings, unknown>> | null | undefined): KepsekLetterSettings {
  const out = { ...DEFAULT_KEPSEK_SETTINGS };
  const optional: (keyof KepsekLetterSettings)[] = ['penerbit_nama', 'penerbit_nip', 'penerbit_pangkat', 'kepsek_pangkat'];
  (Object.keys(out) as (keyof KepsekLetterSettings)[]).forEach((k) => {
    const v = typeof stored?.[k] === 'string' ? (stored[k] as string).trim() : '';
    if (v || optional.includes(k)) out[k] = v;
  });
  return out;
}

export interface ExecutorLike {
  full_name?: string | null;
  nip?: string | null;
  jabatan?: string | null;
  pangkat_golongan?: string | null;
}

export interface HeadmasterInfo {
  name?: string | null;
  nip?: string | null;
  position?: string | null;
}

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const normName = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const JABATAN_KEPSEK = /^\s*((plt|plh|pjs|pj)\.?\s+)?kepala\s+(sekolah|smp|smpn)\b/i;

/** Cara pelaksana dikenali sebagai kepala sekolah/Plt: NIP atau nama sama dengan data kepala sekolah, atau jabatannya. */
export function kepsekMatch(ex: ExecutorLike, hm?: HeadmasterInfo | null): 'pengaturan' | 'jabatan' | null {
  const nip = digits(ex.nip);
  if (hm && nip.length >= 8 && nip === digits(hm.nip)) return 'pengaturan';
  if (hm && normName(hm.name) && normName(ex.full_name) === normName(hm.name)) return 'pengaturan';
  if (JABATAN_KEPSEK.test(String(ex.jabatan ?? ''))) return 'jabatan';
  return null;
}

export const isKepsekExecutor = (ex: ExecutorLike, hm?: HeadmasterInfo | null) => kepsekMatch(ex, hm) !== null;

export interface KepsekPerson {
  nama: string;
  nip: string;
  pangkat: string;
  jabatan: string;
}

/** Data yang dicetak untuk kepsek/Plt: dari Pengaturan Sekolah bila cocok (otomatis), selain itu dari data pelaksana. */
export function kepsekPerson(ex: ExecutorLike, hm: HeadmasterInfo | null | undefined, pangkatCadangan = ''): KepsekPerson {
  const dariPengaturan = kepsekMatch(ex, hm) === 'pengaturan';
  return {
    nama: (dariPengaturan ? hm?.name : ex.full_name)?.trim() || ex.full_name?.trim() || '-',
    nip: (dariPengaturan ? hm?.nip : ex.nip)?.trim() || ex.nip?.trim() || '-',
    pangkat: ex.pangkat_golongan?.trim() || pangkatCadangan.trim() || '-',
    jabatan: (dariPengaturan ? hm?.position : ex.jabatan)?.trim() || ex.jabatan?.trim() || 'Kepala Sekolah',
  };
}

/** Nomor berikutnya: urutan terbesar dari nomor yang cocok pola pada bulan/tahun surat, ditambah 1. */
export function nextKepsekNumber(pattern: string, existing: (string | null | undefined)[], date: Date): string | null {
  if (validateSuratPattern(pattern)) return null;
  const ctx = { year: date.getFullYear(), month: date.getMonth() + 1 };
  let max = 0;
  for (const n of existing) {
    if (!n) continue;
    const seq = parseSuratSequence(pattern, n, ctx);
    if (seq && seq > max) max = seq;
  }
  return renderSuratNumber(pattern, ctx, max + 1);
}

const parseDate = (s: string) => new Date(`${String(s).slice(0, 10)}T00:00:00`);

/** "Senin s.d. Rabu, 23 s.d. 25 November 2026" (satu hari: "Senin, 23 November 2026"). */
export function rentangTanggalTeks(start: string, end: string): string {
  const a = parseDate(start);
  const b = parseDate(end);
  const hari = (d: Date) => format(d, 'EEEE', { locale: idLocale });
  const tgl = (d: Date, pola: string) => format(d, pola, { locale: idLocale });
  if (Number.isNaN(a.getTime())) return '-';
  if (Number.isNaN(b.getTime()) || a.getTime() >= b.getTime()) return `${hari(a)}, ${tgl(a, 'd MMMM yyyy')}`;
  if (a.getFullYear() !== b.getFullYear()) return `${hari(a)} s.d. ${hari(b)}, ${tgl(a, 'd MMMM yyyy')} s.d. ${tgl(b, 'd MMMM yyyy')}`;
  if (a.getMonth() !== b.getMonth()) return `${hari(a)} s.d. ${hari(b)}, ${tgl(a, 'd MMMM')} s.d. ${tgl(b, 'd MMMM yyyy')}`;
  return `${hari(a)} s.d. ${hari(b)}, ${tgl(a, 'd')} s.d. ${tgl(b, 'd MMMM yyyy')}`;
}

/** "Di <lokasi>" tanpa menggandakan kata "di" bila sudah ditulis. */
export const lokasiTeks = (lokasi: string) => {
  const l = String(lokasi ?? '').trim();
  return /^di\s/i.test(l) ? l : `Di ${l}`;
};

export const tanggalSuratTeks = (iso: string) => format(parseDate(iso), 'd MMMM yyyy', { locale: idLocale });
