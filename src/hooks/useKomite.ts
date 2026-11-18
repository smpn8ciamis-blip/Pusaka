import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { KomitePublik } from '@/lib/komite';

// Tabel/RPC komite belum ada di types.ts yang digenerate, jadi klien di-cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const KOMITE_KEY = 'komite';

/** Ringkasan untuk halaman publik (tanpa login). Nama disamarkan di sisi server. */
export function useKomitePublik() {
  return useQuery({
    queryKey: [KOMITE_KEY, 'publik'],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<KomitePublik> => {
      const { data, error } = await db.rpc('komite_publik');
      if (error) throw error;
      return data as KomitePublik;
    },
  });
}

/** Ringkasan sekolah milik pengguna yang login (dashboard bendahara komite / korlas). */
export function useKomiteRingkasan() {
  const { schoolId } = useAuth();
  return useQuery({
    queryKey: [KOMITE_KEY, 'ringkasan', schoolId],
    enabled: !!schoolId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<KomitePublik> => {
      const { data, error } = await db.rpc('komite_publik', { p_school: schoolId });
      if (error) throw error;
      return data as KomitePublik;
    },
  });
}

export interface KomiteSettingsRow {
  school_id: string;
  judul: string;
  deskripsi: string | null;
  target: number;
  batas_waktu: string | null;
  nama_publik: 'lengkap' | 'inisial' | 'anonim';
  tampilkan_rincian: boolean;
}

export function useKomiteSettings() {
  const { schoolId } = useAuth();
  return useQuery({
    queryKey: [KOMITE_KEY, 'settings', schoolId],
    enabled: !!schoolId,
    queryFn: async (): Promise<KomiteSettingsRow | null> => {
      const { data, error } = await db.from('komite_settings').select('*').eq('school_id', schoolId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveKomiteSettings() {
  const { schoolId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Omit<KomiteSettingsRow, 'school_id'>) => {
      if (!schoolId) throw new Error('Akun ini belum terhubung ke sekolah');
      const { error } = await db
        .from('komite_settings')
        .upsert({ ...v, school_id: schoolId, updated_by: user?.id ?? null }, { onConflict: 'school_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KOMITE_KEY] }),
  });
}

export interface KomiteRekeningRow {
  id: string;
  bank: string;
  nomor: string;
  atas_nama: string;
  catatan: string | null;
  urutan: number;
  aktif: boolean;
}

export function useKomiteRekening() {
  const { schoolId } = useAuth();
  return useQuery({
    queryKey: [KOMITE_KEY, 'rekening', schoolId],
    enabled: !!schoolId,
    queryFn: async (): Promise<KomiteRekeningRow[]> => {
      const { data, error } = await db.from('komite_rekening').select('*').eq('school_id', schoolId).order('urutan').order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useKomiteRekeningMutations() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: [KOMITE_KEY] });
  const save = useMutation({
    mutationFn: async (v: Partial<KomiteRekeningRow> & { bank: string; nomor: string; atas_nama: string }) => {
      if (!schoolId) throw new Error('Akun ini belum terhubung ke sekolah');
      const { id, ...rest } = v;
      const { error } = id
        ? await db.from('komite_rekening').update(rest).eq('id', id)
        : await db.from('komite_rekening').insert({ ...rest, school_id: schoolId });
      if (error) throw error;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('komite_rekening').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  return { save, remove };
}

export interface KomiteDonasiRow {
  id: string;
  tanggal: string;
  jumlah: number;
  sumber: 'rekening' | 'tunai';
  kategori: 'siswa' | 'donatur_lain';
  grade: number | null;
  student_id: string | null;
  nama: string;
  rekening_id: string | null;
  keterangan: string | null;
  created_at: string;
}

export interface DonasiFilter {
  kategori: 'all' | 'siswa' | 'donatur_lain';
  grade: 'all' | 7 | 8 | 9;
  sumber: 'all' | 'rekening' | 'tunai';
  search: string;
}

/** Daftar catatan pendapatan dengan paginasi di server (batas 1000 baris PostgREST tidak menjadi masalah). */
export function useKomiteDonasi(filter: DonasiFilter, page: number, pageSize: number, enabled = true) {
  const { schoolId } = useAuth();
  return useQuery({
    queryKey: [KOMITE_KEY, 'donasi', schoolId, filter, page, pageSize],
    enabled: enabled && !!schoolId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: KomiteDonasiRow[]; total: number }> => {
      let q = db.from('komite_donasi').select('*', { count: 'exact' }).eq('school_id', schoolId);
      if (filter.kategori !== 'all') q = q.eq('kategori', filter.kategori);
      if (filter.grade !== 'all') q = q.eq('grade', filter.grade);
      if (filter.sumber !== 'all') q = q.eq('sumber', filter.sumber);
      const term = filter.search.trim().replace(/[%,()]/g, ' ');
      if (term) q = q.ilike('nama', `%${term}%`);
      const from = (page - 1) * pageSize;
      const { data, error, count } = await q
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
}

export interface DonasiInput {
  id?: string;
  tanggal: string;
  jumlah: number;
  sumber: 'rekening' | 'tunai';
  kategori: 'siswa' | 'donatur_lain';
  student_id: string | null;
  nama: string;
  rekening_id: string | null;
  keterangan: string | null;
}

/** Tambah/ubah/hapus catatan pendapatan oleh bendahara komite (CRUD penuh). */
export function useKomiteDonasiMutations() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: [KOMITE_KEY] });
  const save = useMutation({
    mutationFn: async (v: DonasiInput) => {
      if (!schoolId) throw new Error('Akun ini belum terhubung ke sekolah');
      const { id, ...rest } = v;
      const payload = {
        ...rest,
        student_id: rest.kategori === 'siswa' ? rest.student_id : null,
        rekening_id: rest.sumber === 'rekening' ? rest.rekening_id : null,
        keterangan: rest.keterangan?.trim() || null,
      };
      const { error } = id
        ? await db.from('komite_donasi').update(payload).eq('id', id)
        : await db.from('komite_donasi').insert({ ...payload, school_id: schoolId });
      if (error) throw error;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('komite_donasi').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  return { save, remove };
}

export interface KomiteSiswa {
  student_id: string;
  nis: string;
  nama: string;
  kelas: string;
  grade: number;
  total: number;
  jumlah_kali: number;
}

/** Daftar siswa aktif untuk dipilih. Korlas hanya menerima siswa tingkat kelasnya (dibatasi di server). */
export function useKomiteStudents(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [KOMITE_KEY, 'students', user?.id],
    enabled: enabled && !!user,
    queryFn: async (): Promise<KomiteSiswa[]> => {
      const { data, error } = await db.rpc('komite_students');
      if (error) throw error;
      return ((data ?? []) as KomiteSiswa[]).map((s) => ({ ...s, total: Number(s.total), jumlah_kali: Number(s.jumlah_kali) }));
    },
  });
}

/** Tingkat kelas (7/8/9) milik korlas yang login; null bila belum ditetapkan. */
export function useKorlasGrade() {
  const { user, userRole } = useAuth();
  return useQuery({
    queryKey: [KOMITE_KEY, 'my-grade', user?.id],
    enabled: !!user && userRole === 'korlas',
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await db.rpc('komite_my_grade');
      if (error) throw error;
      return data ?? null;
    },
  });
}

/** Korlas menginput sumbangan satu siswa (hanya lewat RPC yang memeriksa tingkat kelas). */
export function useInputDonasiKorlas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { student_id: string; jumlah: number; sumber: 'rekening' | 'tunai'; tanggal: string; keterangan: string }) => {
      const { error } = await db.rpc('komite_input_donasi', {
        p_student_id: v.student_id,
        p_jumlah: v.jumlah,
        p_sumber: v.sumber,
        p_tanggal: v.tanggal,
        p_keterangan: v.keterangan || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KOMITE_KEY] }),
  });
}

export interface KomiteKorlasRow {
  user_id: string;
  email: string;
  nama: string;
  grade: number | null;
  asal: 'manual' | 'email' | null;
}

export function useKomiteKorlasList() {
  const { schoolId } = useAuth();
  return useQuery({
    queryKey: [KOMITE_KEY, 'korlas', schoolId],
    enabled: !!schoolId,
    queryFn: async (): Promise<KomiteKorlasRow[]> => {
      const { data, error } = await db.rpc('komite_korlas_list');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSetKorlasGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { user_id: string; grade: number | null }) => {
      const { error } = await db.rpc('komite_set_korlas', { p_user: v.user_id, p_grade: v.grade });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KOMITE_KEY] }),
  });
}

/** Pesan error yang ramah untuk pengguna. */
export function komiteErrorMessage(e: unknown): string {
  const m = (e as { message?: string })?.message ?? 'Terjadi kesalahan';
  if (/row-level security|permission denied/i.test(m)) return 'Anda tidak berwenang melakukan ini.';
  return m;
}
