import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { compressImage } from '@/lib/imageCompress';
import { KOMITE_FOTO_BUCKET, type KomiteAnggaranPublik } from '@/lib/komiteAnggaran';

// Tabel/RPC komite belum ada di types.ts yang digenerate, jadi klien di-cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const KEY = 'komite-anggaran';

/** RAB + Penggunaan untuk halaman publik. Bila migrasi belum dijalankan, kueri gagal dan tab tidak tampil. */
export function useKomiteAnggaranPublik() {
  return useQuery({
    queryKey: [KEY, 'publik'],
    staleTime: 60_000,
    refetchInterval: 180_000,
    retry: false,
    queryFn: async (): Promise<KomiteAnggaranPublik> => {
      const { data, error } = await db.rpc('komite_anggaran_publik');
      if (error) throw error;
      return data as KomiteAnggaranPublik;
    },
  });
}

export interface KomiteRabRow {
  id: string;
  kelompok: string;
  uraian: string;
  volume: number;
  satuan: string | null;
  harga_satuan: number;
  jumlah: number;
  keterangan: string | null;
  urutan: number;
}

export function useKomiteRab() {
  const { schoolId } = useAuth();
  return useQuery({
    queryKey: [KEY, 'rab', schoolId],
    enabled: !!schoolId,
    queryFn: async (): Promise<KomiteRabRow[]> => {
      const { data, error } = await db.from('komite_rab').select('*').eq('school_id', schoolId)
        .order('kelompok').order('urutan').order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type KomiteRabInput = Omit<KomiteRabRow, 'id' | 'jumlah'> & { id?: string };

export function useKomiteRabMutations() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: [KEY] });
  const save = useMutation({
    mutationFn: async (v: KomiteRabInput) => {
      if (!schoolId) throw new Error('Akun ini belum terhubung ke sekolah');
      const { id, ...rest } = v;
      const { error } = id
        ? await db.from('komite_rab').update(rest).eq('id', id)
        : await db.from('komite_rab').insert({ ...rest, school_id: schoolId });
      if (error) throw error;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('komite_rab').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  return { save, remove };
}

export interface KomitePenggunaanRow {
  id: string;
  tanggal: string;
  uraian: string;
  rab_id: string | null;
  penerima: string | null;
  volume: number;
  satuan: string | null;
  jumlah: number;
  keterangan: string | null;
  foto_path: string | null;
}

export function useKomitePenggunaan() {
  const { schoolId } = useAuth();
  return useQuery({
    queryKey: [KEY, 'penggunaan', schoolId],
    enabled: !!schoolId,
    queryFn: async (): Promise<KomitePenggunaanRow[]> => {
      const { data, error } = await db.from('komite_penggunaan').select('*').eq('school_id', schoolId)
        .order('tanggal', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type KomitePenggunaanInput = Omit<KomitePenggunaanRow, 'id' | 'foto_path'> & {
  id?: string;
  /** Foto yang tersimpan saat ini (path), bila ada. */
  fotoLama?: string | null;
  /** Foto baru (dikompres sebelum diunggah); menggantikan foto lama. */
  fotoBaru?: File | null;
  /** Bendahara menghapus foto lama tanpa menggantinya. */
  buangFoto?: boolean;
};

const hapusFoto = async (path: string | null | undefined) => {
  if (!path) return;
  // Gagal menghapus berkas tidak boleh menggagalkan simpan; berkas yatim hanya memakai sedikit ruang.
  try { await supabase.storage.from(KOMITE_FOTO_BUCKET).remove([path]); } catch { /* abaikan */ }
};

export function useKomitePenggunaanMutations() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: [KEY] });

  const save = useMutation({
    mutationFn: async (v: KomitePenggunaanInput) => {
      if (!schoolId) throw new Error('Akun ini belum terhubung ke sekolah');
      const { id, fotoBaru, fotoLama = null, buangFoto = false, ...rest } = v;

      // 1) Unggah foto baru lebih dulu; bila simpan gagal, berkas baru dibersihkan lagi.
      let pathBaru: string | null = null;
      if (fotoBaru) {
        const kecil = await compressImage(fotoBaru, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
        pathBaru = `${schoolId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from(KOMITE_FOTO_BUCKET)
          .upload(pathBaru, kecil, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw new Error(`Foto gagal diunggah: ${upErr.message}`);
      }
      const fotoAkhir = pathBaru ?? (buangFoto ? null : fotoLama);

      const { error } = id
        ? await db.from('komite_penggunaan').update({ ...rest, foto_path: fotoAkhir }).eq('id', id)
        : await db.from('komite_penggunaan').insert({ ...rest, foto_path: fotoAkhir, school_id: schoolId });
      if (error) {
        await hapusFoto(pathBaru);
        throw error;
      }
      // 2) Simpan berhasil: foto lama yang diganti/dibuang dihapus dari penyimpanan.
      if (fotoLama && fotoAkhir !== fotoLama) await hapusFoto(fotoLama);
    },
    onSuccess: done,
  });

  const remove = useMutation({
    mutationFn: async (row: Pick<KomitePenggunaanRow, 'id' | 'foto_path'>) => {
      const { error } = await db.from('komite_penggunaan').delete().eq('id', row.id);
      if (error) throw error;
      await hapusFoto(row.foto_path);
    },
    onSuccess: done,
  });

  return { save, remove };
}
