// src/hooks/useAdminSchoolStudents.ts
// Data siswa + akun login se-sekolah untuk admin / kesiswaan (cakupan lebih luas dari wali kelas).
// Memakai RPC `admin_school_students` (migrasi 20261027100000) sehingga tidak ada daftar ID di URL.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Student, StudentAccountInfo } from "@/hooks/useHomeroomStudents";

export interface AdminStudentRow extends Student {
  class_name: string | null;
  class_grade: number | null;
  is_alumni: boolean;
  is_active: boolean;
  account_user_id: string | null;
  account_email: string | null;
  account_name: string | null;
}

export interface AdminStudentFilters {
  academicYear: string | null;
  classId: string | null;
  search: string;
  account: "all" | "with" | "without";
  status: "aktif" | "all";
  page: number; // mulai dari 1
  pageSize: number;
}

export interface AdminStudentStats {
  total: number;
  aktif: number;
  with_account: number;
  without_account: number;
}

export interface AdminStudentPage {
  total: number;
  stats: AdminStudentStats;
  items: AdminStudentRow[];
}

const EMPTY_STATS: AdminStudentStats = { total: 0, aktif: 0, with_account: 0, without_account: 0 };

async function callRpc(args: {
  academicYear: string | null;
  classId: string | null;
  search: string;
  account: string;
  status: string;
  limit: number;
  offset: number;
}): Promise<AdminStudentPage> {
  const { data, error } = await (supabase as any).rpc("admin_school_students", {
    p_academic_year: args.academicYear,
    p_class_id: args.classId,
    p_search: args.search || null,
    p_account: args.account,
    p_status: args.status,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (error) throw error;
  const d = (data ?? {}) as Partial<AdminStudentPage>;
  return {
    total: Number(d.total ?? 0),
    stats: { ...EMPTY_STATS, ...(d.stats ?? {}) },
    items: (d.items ?? []) as AdminStudentRow[],
  };
}

/** Satu halaman daftar siswa (paginasi dan penyaringan dilakukan di server). */
export function useAdminSchoolStudents(f: AdminStudentFilters) {
  return useQuery({
    // diawali "student-accounts" agar ikut tersegarkan saat akun dibuat/diubah/dihapus
    queryKey: ["student-accounts", "admin-school", f],
    placeholderData: keepPreviousData,
    queryFn: () =>
      callRpc({
        academicYear: f.academicYear,
        classId: f.classId,
        search: f.search.trim(),
        account: f.account,
        status: f.status,
        limit: f.pageSize,
        offset: (f.page - 1) * f.pageSize,
      }),
  });
}

/**
 * Seluruh siswa yang cocok (maks. 1000) — untuk cetak PDF akun satu kelas
 * dan pembuatan akun massal. Hanya aktif bila `enabled`.
 */
export function useAdminSchoolStudentsAll(
  opts: { academicYear: string | null; classId: string | null; account: "all" | "without"; status: "aktif" | "all" },
  enabled: boolean
) {
  return useQuery({
    queryKey: ["student-accounts", "admin-school-all", opts],
    enabled,
    queryFn: () =>
      callRpc({
        academicYear: opts.academicYear,
        classId: opts.classId,
        search: "",
        account: opts.account,
        status: opts.status,
        limit: 1000,
        offset: 0,
      }),
  });
}

export function rowToAccount(r: AdminStudentRow): StudentAccountInfo | null {
  if (!r.account_user_id) return null;
  return { student_id: r.id, user_id: r.account_user_id, email: r.account_email, full_name: r.account_name };
}

/** Ambil hanya kolom tabel `students` (tanpa kolom gabungan) — aman dipakai untuk formulir ubah data. */
export function toStudent(r: AdminStudentRow): Student {
  return {
    id: r.id, nis: r.nis, nisn: r.nisn, full_name: r.full_name, class_id: r.class_id, gender: r.gender,
    birth_date: r.birth_date, birth_place: r.birth_place, address: r.address, parent_name: r.parent_name,
    parent_phone: r.parent_phone, photo_url: r.photo_url, status: r.status, school_id: r.school_id, rfid_uid: r.rfid_uid,
  };
}
