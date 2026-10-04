// src/hooks/useHomeroomStudents.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Student {
  id: string;
  nis: string;
  nisn: string | null;
  full_name: string;
  class_id: string | null;
  gender: string | null;
  birth_date: string | null;
  birth_place: string | null;
  address: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  photo_url: string | null;
  status: string | null;
  school_id: string | null;
  rfid_uid: string | null;
  created_at?: string;
}

export interface StudentAccountInfo {
  student_id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
}

/* ============== QUERIES ============== */

export function useHomeroomStudents(classId?: string) {
  return useQuery({
    queryKey: ["homeroom-students-crud", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("class_id", classId!)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Student[];
    },
  });
}

export function useStudentAccounts(studentIds: string[]) {
  return useQuery({
    queryKey: ["student-accounts", studentIds.sort().join(",")],
    enabled: studentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_accounts")
        .select("student_id, user_id")
        .in("student_id", studentIds);
      if (error) throw error;

      if (!data || data.length === 0) return [] as StudentAccountInfo[];

      const userIds = data.map((d) => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

      return data.map<StudentAccountInfo>((d) => {
        const p = profileMap.get(d.user_id);
        return {
          student_id: d.student_id,
          user_id: d.user_id,
          email: p?.email ?? null,
          full_name: p?.full_name ?? null,
        };
      });
    },
  });
}

/* ============== MUTATIONS ============== */

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Student> & { class_id: string; full_name: string; nis: string }) => {
      const { data, error } = await supabase
        .from("students")
        .insert([payload])
        .select()
        .single();
      if (error) throw error;
      return data as Student;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homeroom-students-crud"] });
      toast.success("Siswa berhasil ditambahkan");
    },
    onError: (e: Error) => toast.error("Gagal tambah siswa: " + e.message),
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Student> & { id: string }) => {
      const { data, error } = await supabase
        .from("students")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Student;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homeroom-students-crud"] });
      toast.success("Data siswa berhasil diperbarui");
    },
    onError: (e: Error) => toast.error("Gagal update siswa: " + e.message),
  });
}

export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete (status=nonaktif). Ubah ke .delete() untuk hard delete.
      const { error } = await supabase
        .from("students")
        .update({ status: "nonaktif" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homeroom-students-crud"] });
      toast.success("Siswa dinonaktifkan");
    },
    onError: (e: Error) => toast.error("Gagal hapus siswa: " + e.message),
  });
}

/* ============== ACCOUNT MUTATIONS (Edge Functions) ============== */

async function invokeFn<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export function useCreateStudentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: {
      student_id: string;
      email: string;
      password: string;
      full_name: string;
    }) => invokeFn<{ success: true; user_id: string; email: string }>(
      "create-student-account",
      p
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-accounts"] });
      toast.success("Akun siswa berhasil dibuat");
    },
    onError: (e: Error) => toast.error("Gagal buat akun: " + e.message),
  });
}

export function useUpdateStudentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: {
      student_id: string;
      email?: string;
      password?: string;
      full_name?: string;
    }) => invokeFn<{ success: true }>("update-student-account", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-accounts"] });
      toast.success("Akun berhasil diperbarui");
    },
    onError: (e: Error) => toast.error("Gagal update akun: " + e.message),
  });
}

export function useDeleteStudentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { student_id: string }) =>
      invokeFn<{ success: true }>("delete-student-account", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-accounts"] });
      toast.success("Akun berhasil dihapus");
    },
    onError: (e: Error) => toast.error("Gagal hapus akun: " + e.message),
  });
}

/* ============== BULK GENERATE ============== */

export function defaultPasswordFromNis(nis: string) {
  return `siswa${nis}`; // contoh pattern default
}

export function emailFromNis(nis: string, schoolDomain: string) {
  return `${nis}@${schoolDomain}`;
}