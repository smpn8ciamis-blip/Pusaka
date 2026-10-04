// src/components/homeroom/BulkGenerateAccountsDialog.tsx
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateStudentAccount, type Student } from "@/hooks/useHomeroomStudents";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: Student[];
  existingAccountStudentIds: Set<string>;
  schoolDomain?: string;
  schoolId: string;
}

export default function BulkGenerateAccountsDialog({
  open, onOpenChange, students, existingAccountStudentIds, schoolDomain = "sekolah.sch.id", schoolId,
}: Props) {
  const qc = useQueryClient();
  const createMut = useCreateStudentAccount();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [passwordPattern, setPasswordPattern] = useState("siswa{nis}");
  const [running, setRunning] = useState(false);

  const candidates = useMemo(
    () => students.filter((s) => !existingAccountStudentIds.has(s.id) && s.status === "aktif"),
    [students, existingAccountStudentIds]
  );

  const toggle = (id: string) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const toggleAll = () => {
    const allSelected = candidates.every((s) => selected[s.id]);
    const next: Record<string, boolean> = {};
    if (!allSelected) candidates.forEach((s) => (next[s.id] = true));
    setSelected(next);
  };

  const buildPassword = (nis: string) => passwordPattern.replace("{nis}", nis);

  const runBulk = async () => {
    const ids = candidates.filter((s) => selected[s.id]).map((s) => s.id);
    if (ids.length === 0) return toast.error("Pilih minimal satu siswa");

    setRunning(true);
    let ok = 0;
    let fail = 0;

    for (const sid of ids) {
      const s = students.find((x) => x.id === sid)!;
      try {
        await supabase.functions.invoke("create-student-account", {
          body: {
            student_id: s.id,
            email: `${s.nis}@${schoolDomain}`,
            password: buildPassword(s.nis),
            full_name: s.full_name,
          },
        }).then(({ error, data }) => {
          if (error) throw new Error(error.message);
          if ((data as any)?.error) throw new Error((data as any).error);
        });
        ok++;
      } catch (e) {
        fail++;
        console.error("Bulk fail", s.nis, e);
      }
    }

    setRunning(false);
    qc.invalidateQueries({ queryKey: ["student-accounts"] });
    toast.success(`Selesai: ${ok} berhasil, ${fail} gagal`);
    if (ok > 0) onOpenChange(false);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Akun Massal</DialogTitle>
          <DialogDescription>
            Buat akun login untuk siswa yang belum memiliki akun.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Format email: <code>{"{nis}"}@{schoolDomain}</code>
          </AlertDescription>
        </Alert>

        <div>
          <Label>Pola Password</Label>
          <Input
            value={passwordPattern}
            onChange={(e) => setPasswordPattern(e.target.value)}
            placeholder="siswa{nis}"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Gunakan <code>{"{nis}"}</code> sebagai placeholder. Contoh: <code>{buildPassword("20260001")}</code>
          </p>
        </div>

        <div className="rounded-md border max-h-[40vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={candidates.length > 0 && candidates.every((s) => selected[s.id])}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>NIS</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Semua siswa sudah memiliki akun.
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Checkbox
                        checked={!!selected[s.id]}
                        onCheckedChange={() => toggle(s.id)}
                      />
                    </TableCell>
                    <TableCell>{s.nis}</TableCell>
                    <TableCell>{s.full_name}</TableCell>
                    <TableCell><Badge variant="outline">Aktif</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Batal
          </Button>
          <Button onClick={runBulk} disabled={running || selectedCount === 0}>
            {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Memproses...</> : `Generate ${selectedCount} Akun`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}