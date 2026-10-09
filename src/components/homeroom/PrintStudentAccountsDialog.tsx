// src/components/homeroom/PrintStudentAccountsDialog.tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, FileDown, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import type { Student, StudentAccountInfo } from "@/hooks/useHomeroomStudents";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  className: string;
  academicYear?: string | null;
  students: Student[];
  accounts: StudentAccountInfo[];
}

type Mode = "initial" | "reset";

const applyPattern = (pattern: string, s: Student) =>
  pattern.replace(/\{nisn\}/gi, s.nisn || s.nis).replace(/\{nis\}/gi, s.nis);

export default function PrintStudentAccountsDialog({
  open, onOpenChange, className, academicYear, students, accounts,
}: Props) {
  const [mode, setMode] = useState<Mode>("initial");
  const [pattern, setPattern] = useState("{nisn}");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const { data: school } = useQuery({
    queryKey: ["school-settings-print-accounts"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("school_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.student_id, a])), [accounts]);
  const rows = useMemo(
    () => students.filter((s) => accountMap.has(s.id)),
    [students, accountMap],
  );

  const run = async () => {
    if (rows.length === 0) return toast.error("Belum ada siswa yang memiliki akun");
    if (!pattern.trim()) return toast.error("Pola password wajib diisi");
    if (mode === "reset") {
      if (!confirm(`Password ${rows.length} akun siswa akan DIATUR ULANG. Siswa yang sudah mengganti password sendiri harus memakai password baru. Lanjutkan?`)) return;
    }

    setRunning(true);
    try {
      const printRows: { s: Student; username: string; password: string }[] = [];
      let failed = 0;

      for (let i = 0; i < rows.length; i++) {
        const s = rows[i];
        const acc = accountMap.get(s.id)!;
        const password = applyPattern(pattern, s);

        if (mode === "reset") {
          setProgress(`Mengatur ulang password ${i + 1}/${rows.length}...`);
          if (password.length < 6) { failed++; continue; }
          const { data, error } = await supabase.functions.invoke("update-student-account", {
            body: { student_id: s.id, password, full_name: s.full_name },
          });
          if (error || (data as any)?.error) { failed++; continue; }
        }
        printRows.push({ s, username: acc.email ?? "-", password });
      }

      if (printRows.length === 0) throw new Error("Tidak ada akun yang bisa dicetak");

      setProgress("Membuat PDF...");
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();

      let y = 15;
      if (school) {
        y = await addLetterheadToPDF(doc, {
          school_name: school.school_name || "NAMA SEKOLAH",
          district_name: school.district_name || undefined,
          school_address: school.school_address || undefined,
          school_phone: school.school_phone || undefined,
          logo_url: school.logo_url || undefined,
          right_logo_url: school.right_logo_url || undefined,
          show_address: school.show_address ?? true,
          show_phone: school.show_phone ?? true,
        } as any);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("DAFTAR AKUN SISWA", pageWidth / 2, y + 2, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Kelas: ${className}${academicYear ? `   |   Tahun Pelajaran: ${academicYear}` : ""}`, 14, y + 10);
      doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`, 14, y + 15);

      autoTable(doc, {
        startY: y + 20,
        head: [["No", "Nama Siswa", "NIS", "Username", "Password"]],
        body: printRows.map((r, i) => [String(i + 1), r.s.full_name, r.s.nis, r.username, r.password]),
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235], fontSize: 9, halign: "center" },
        styles: { fontSize: 9, cellPadding: 1.8, overflow: "linebreak" },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          2: { cellWidth: 26 },
          3: { cellWidth: 52 },
          4: { cellWidth: 32, font: "courier", fontStyle: "bold" },
        },
        margin: { left: 14, right: 14, bottom: 18 },
        didDrawPage: () => {
          const h = doc.internal.pageSize.getHeight();
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.text(
            "RAHASIA — dokumen ini hanya untuk wali kelas dan siswa yang bersangkutan. Segera ganti password setelah login pertama.",
            pageWidth / 2, h - 8, { align: "center" },
          );
          doc.setTextColor(0);
        },
      });

      doc.save(`Daftar-Akun-Siswa-${className.replace(/\s+/g, "_")}.pdf`);
      toast.success(
        failed > 0
          ? `PDF dibuat. ${failed} akun dilewati (gagal diatur ulang / password < 6 karakter).`
          : "PDF daftar akun siswa berhasil dibuat",
      );
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat PDF");
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cetak PDF Daftar Akun Siswa</DialogTitle>
          <DialogDescription>
            Kelas {className} — {rows.length} siswa memiliki akun.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Password tersimpan dalam bentuk terenkripsi sehingga tidak bisa dibaca ulang oleh sistem. Pilih salah satu cara berikut.
          </AlertDescription>
        </Alert>

        <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="space-y-3">
          <div className="flex items-start gap-3 rounded-md border p-3">
            <RadioGroupItem value="initial" id="mode-initial" className="mt-1" />
            <Label htmlFor="mode-initial" className="cursor-pointer space-y-1">
              <div className="font-medium">Cetak sesuai pola (tanpa mengubah password)</div>
              <p className="text-xs font-normal text-muted-foreground">
                Mencetak password bawaan menurut pola di bawah. Tidak mengubah apa pun, tetapi tidak berlaku untuk akun yang
                polanya berbeda atau yang sudah diganti passwordnya oleh siswa.
              </p>
            </Label>
          </div>
          <div className="flex items-start gap-3 rounded-md border p-3">
            <RadioGroupItem value="reset" id="mode-reset" className="mt-1" />
            <Label htmlFor="mode-reset" className="cursor-pointer space-y-2 flex-1">
              <div className="font-medium">Atur ulang password lalu cetak</div>
              <p className="text-xs font-normal text-muted-foreground">
                Semua password diganti dengan pola di bawah, sehingga isi PDF pasti benar.
              </p>
            </Label>
          </div>
        </RadioGroup>

        <div>
          <Label>Pola password</Label>
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="{nisn}" />
          <p className="text-xs text-muted-foreground mt-1">
            Gunakan <code>{"{nis}"}</code> / <code>{"{nisn}"}</code> (NISN kosong → NIS). Contoh: <code>siswa{"{nis}"}</code>.
            Contoh hasil: <code>{students[0] ? applyPattern(pattern, students[0]) : "-"}</code>. Minimal 6 karakter.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>Batal</Button>
          <Button onClick={run} disabled={running || rows.length === 0} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            {running ? progress || "Memproses..." : "Cetak PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
