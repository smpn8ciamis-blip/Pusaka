import { cleanPhoneNumber } from '@/lib/phone';

/** Baris siswa untuk Galeri Foto & Buku Kontak (dibaca dari tabel students). */
export interface DirectoryStudent {
  id: string;
  nis: string | null;
  nisn: string | null;
  full_name: string;
  gender: string | null;
  class_id: string | null;
  photo_url: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  address: string | null;
  status: string | null;
  is_alumni: boolean | null;
  classes?: { name: string | null } | null;
}

export type StatusFilter = 'aktif' | 'nonaktif' | 'all';
export type SortDir = 'asc' | 'desc';
export type DirectorySortKey = 'name' | 'nis' | 'class' | 'parent';

export interface DirectoryOptions {
  search: string;
  classId: string; // 'all' atau id kelas
  gender: string; // 'all' | 'L' | 'P'
  status: StatusFilter;
  photo?: 'all' | 'with' | 'without';
  contact?: 'all' | 'with' | 'without';
  sortKey: DirectorySortKey;
  sortDir: SortDir;
}

/** Siswa aktif = status 'aktif' dan bukan alumni (sama dengan menu Siswa, Nilai & E-Learning). */
export const isActiveStudent = (s: Pick<DirectoryStudent, 'status' | 'is_alumni'>) =>
  (s.status ?? 'aktif') === 'aktif' && !s.is_alumni;

export const studentStatusLabel = (s: Pick<DirectoryStudent, 'status' | 'is_alumni'>) =>
  s.is_alumni ? 'Alumni' : (s.status ?? 'aktif') === 'aktif' ? 'Aktif' : (s.status ?? 'nonaktif');

const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });
export const compareText = (a: string | null | undefined, b: string | null | undefined) =>
  collator.compare(a ?? '', b ?? '');

/** Nomor untuk tautan WhatsApp (format 62…); null bila tidak valid. */
export function waNumber(raw: string | null | undefined): string | null {
  let n = cleanPhoneNumber(raw ?? '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  return n.length >= 10 && n.length <= 15 ? n : null;
}

export const hasPhone = (s: DirectoryStudent) => cleanPhoneNumber(s.parent_phone ?? '').length > 0;

/** Saring + urutkan seluruh daftar (pagination dilakukan pemanggil). */
export function applyDirectory(list: DirectoryStudent[], o: DirectoryOptions): DirectoryStudent[] {
  const term = o.search.trim().toLowerCase();
  const digits = cleanPhoneNumber(o.search);
  const out = list.filter((s) => {
    if (o.status === 'aktif' && !isActiveStudent(s)) return false;
    if (o.status === 'nonaktif' && isActiveStudent(s)) return false;
    if (o.classId !== 'all' && s.class_id !== o.classId) return false;
    if (o.gender !== 'all' && s.gender !== o.gender) return false;
    if (o.photo === 'with' && !s.photo_url) return false;
    if (o.photo === 'without' && s.photo_url) return false;
    if (o.contact === 'with' && !hasPhone(s)) return false;
    if (o.contact === 'without' && hasPhone(s)) return false;
    if (!term) return true;
    const hay = `${s.full_name} ${s.nis ?? ''} ${s.nisn ?? ''} ${s.parent_name ?? ''} ${s.classes?.name ?? ''}`.toLowerCase();
    if (hay.includes(term)) return true;
    return digits.length >= 3 && cleanPhoneNumber(s.parent_phone ?? '').includes(digits);
  });

  const dir = o.sortDir === 'asc' ? 1 : -1;
  const key = (s: DirectoryStudent) =>
    o.sortKey === 'nis' ? s.nis : o.sortKey === 'class' ? s.classes?.name : o.sortKey === 'parent' ? s.parent_name : s.full_name;
  return out.sort((a, b) => {
    const ka = key(a), kb = key(b);
    // data kosong selalu di bawah, apa pun arah urutannya
    if (!ka && kb) return 1;
    if (ka && !kb) return -1;
    return (compareText(ka, kb) || compareText(a.full_name, b.full_name)) * dir;
  });
}
