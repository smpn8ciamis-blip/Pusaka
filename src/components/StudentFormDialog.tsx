// src/components/homeroom/StudentFormDialog.tsx
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateStudent, useUpdateStudent, type Student } from "@/hooks/useHomeroomStudents";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classId: string;
  schoolId: string;
  student?: Student | null; // null = create
}

const EMPTY: Partial<Student> = {
  nis: "",
  nisn: "",
  full_name: "",
  gender: "",
  birth_date: "",
  birth_place: "",
  address: "",
  parent_name: "",
  parent_phone: "",
  status: "aktif",
};

export default function StudentFormDialog({ open, onOpenChange, classId, schoolId, student }: Props) {
  const [form, setForm] = useState<Partial<Student>>(EMPTY);
  const isEdit = !!student?.id;

  const createMut = useCreateStudent();
  const updateMut = useUpdateStudent();

  useEffect(() => {
    if (open) setForm(student ?? EMPTY);
  }, [open, student]);

  const set = <K extends keyof Student>(key: K, value: Student[K] | string) =>
    setForm((f) => ({ ...f, [key]: value as any }));

  const submit = async () => {
    if (!form.full_name?.trim() || !form.nis?.trim()) return;

    const payload: any = {
      ...form,
      class_id: classId,
      school_id: schoolId,
    };

    if (isEdit && student?.id) {
      await updateMut.mutateAsync({ id: student.id, ...payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const loading = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Data Siswa" : "Tambah Siswa Baru"}</DialogTitle>
          <DialogDescription>
            Data siswa akan otomatis terhubung ke kelas ini.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Nama Lengkap *</Label>
            <Input value={form.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <div>
            <Label>NIS *</Label>
            <Input value={form.nis ?? ""} onChange={(e) => set("nis", e.target.value)} placeholder="20260001" />
          </div>
          <div>
            <Label>NISN</Label>
            <Input value={form.nisn ?? ""} onChange={(e) => set("nisn", e.target.value)} />
          </div>
          <div>
            <Label>Jenis Kelamin</Label>
            <Select value={form.gender ?? ""} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger><SelectValue placeholder="Pilih..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="L">Laki-laki</SelectItem>
                <SelectItem value="P">Perempuan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status ?? "aktif"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aktif">Aktif</SelectItem>
                <SelectItem value="nonaktif">Nonaktif</SelectItem>
                <SelectItem value="mutasi">Mutasi</SelectItem>
                <SelectItem value="lulus">Lulus</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tempat Lahir</Label>
            <Input value={form.birth_place ?? ""} onChange={(e) => set("birth_place", e.target.value)} />
          </div>
          <div>
            <Label>Tanggal Lahir</Label>
            <Input type="date" value={form.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Alamat</Label>
            <Textarea rows={2} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div>
            <Label>Nama Orang Tua/Wali</Label>
            <Input value={form.parent_name ?? ""} onChange={(e) => set("parent_name", e.target.value)} />
          </div>
          <div>
            <Label>No. HP Orang Tua</Label>
            <Input value={form.parent_phone ?? ""} onChange={(e) => set("parent_phone", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={submit} disabled={loading || !form.full_name || !form.nis}>
            {loading ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}