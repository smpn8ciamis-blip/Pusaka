// src/components/homeroom/StudentAccountDialog.tsx
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Eye, EyeOff } from "lucide-react";
import {
  useCreateStudentAccount,
  useUpdateStudentAccount,
  useDeleteStudentAccount,
  defaultPasswordFromNis,
  type Student,
  type StudentAccountInfo,
} from "@/hooks/useHomeroomStudents";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  student: Student | null;
  account: StudentAccountInfo | null; // null = belum punya akun
  schoolDomain?: string; // e.g. "sman1.sch.id"
}

export default function StudentAccountDialog({ open, onOpenChange, student, account, schoolDomain = "sekolah.sch.id" }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const createMut = useCreateStudentAccount();
  const updateMut = useUpdateStudentAccount();
  const deleteMut = useDeleteStudentAccount();

  const isEdit = !!account;

  useEffect(() => {
    if (!open || !student) return;
    if (account) {
      setEmail(account.email ?? "");
      setPassword("");
    } else {
      setEmail(`${student.nis}@${schoolDomain}`);
      setPassword(defaultPasswordFromNis(student.nis));
    }
  }, [open, student, account, schoolDomain]);

  const submit = async () => {
    if (!student) return;
    if (!isEdit) {
      await createMut.mutateAsync({
        student_id: student.id,
        email,
        password,
        full_name: student.full_name,
      });
    } else {
      await updateMut.mutateAsync({
        student_id: student.id,
        email: email || undefined,
        password: password || undefined,
        full_name: student.full_name,
      });
    }
    onOpenChange(false);
  };

  const onDelete = async () => {
    if (!student) return;
    if (!confirm("Hapus akun siswa ini? Siswa tidak akan bisa login lagi.")) return;
    await deleteMut.mutateAsync({ student_id: student.id });
    onOpenChange(false);
  };

  const loading = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Kelola Akun Siswa" : "Buat Akun Siswa"}</DialogTitle>
          <DialogDescription>
            {student.full_name} — NIS {student.nis}
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {isEdit
              ? "Kosongkan password jika tidak ingin mengubahnya."
              : "Akun akan dibuat dengan role student dan langsung aktif."}
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`${student.nis}@${schoolDomain}`}
            />
          </div>
          <div>
            <Label>Password {isEdit ? "(kosongkan jika tidak diubah)" : ""}</Label>
            <div className="relative">
              <Input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPwd((v) => !v)}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          {isEdit && (
            <Button variant="destructive" onClick={onDelete} disabled={loading} className="sm:mr-auto">
              Hapus Akun
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={submit} disabled={loading || !email}>
            {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat Akun"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}