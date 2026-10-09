// src/components/homeroom/HomeroomStudentTab.tsx
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Users, Plus, Search, MoreHorizontal, Edit2, KeyRound, Trash2, UserCheck, UserX, Zap, FileDown } from "lucide-react";
import { toast } from "sonner";
import {
  useHomeroomStudents,
  useStudentAccounts,
  useDeleteStudent,
  type Student,
} from "@/hooks/useHomeroomStudents";
import StudentFormDialog from "./StudentFormDialog";
import StudentAccountDialog from "./StudentAccountDialog";
import BulkGenerateAccountsDialog from "./BulkGenerateAccountsDialog";
import PrintStudentAccountsDialog from "./PrintStudentAccountsDialog";

interface Props {
  classId: string;
  schoolId: string;
  schoolDomain?: string;
  className?: string;
  academicYear?: string | null;
}

export default function HomeroomStudentTab({ classId, schoolId, schoolDomain: domainProp = "sekolah.sch.id", className = "Kelas", academicYear }: Props) {
  const { data: students = [], isLoading } = useHomeroomStudents(classId);
  const studentIds = useMemo(() => students.map((s) => s.id), [students]);
  const { data: accounts = [] } = useStudentAccounts(studentIds);
  const deleteStudentMut = useDeleteStudent();

  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountStudent, setAccountStudent] = useState<Student | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  // Domain email mengikuti akun yang sudah ada (mis. nedelcis.com) agar akun baru konsisten
  const schoolDomain = useMemo(() => {
    const counts = new Map<string, number>();
    accounts.forEach((a) => {
      const d = a.email?.split("@")[1];
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : domainProp;
  }, [accounts, domainProp]);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.student_id, a])),
    [accounts]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.nis.toLowerCase().includes(q) ||
        (s.nisn ?? "").toLowerCase().includes(q)
    );
  }, [students, query]);

  const stats = useMemo(() => {
    const total = students.length;
    const aktif = students.filter((s) => s.status === "aktif").length;
    const withAccount = accounts.length;
    const withoutAccount = total - withAccount;
    return { total, aktif, withAccount, withoutAccount };
  }, [students, accounts]);

  const handleAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (s: Student) => {
    setEditing(s);
    setFormOpen(true);
  };

  const handleManageAccount = (s: Student) => {
    setAccountStudent(s);
    setAccountOpen(true);
  };

  const handleDelete = async (s: Student) => {
    if (!confirm(`Nonaktifkan siswa ${s.full_name}?`)) return;
    await deleteStudentMut.mutateAsync(s.id);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Data Siswa Kelas
            </CardTitle>
            <CardDescription>
              Kelola data & akun login siswa kelas
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)} className="gap-2">
              <FileDown className="h-4 w-4" />
              Cetak PDF Akun
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} className="gap-2">
              <Zap className="h-4 w-4" />
              Generate Akun Massal
            </Button>
            <Button size="sm" onClick={handleAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              Tambah Siswa
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <StatBox label="Total" value={stats.total} />
          <StatBox label="Aktif" value={stats.aktif} tone="emerald" />
          <StatBox label="Sudah Punya Akun" value={stats.withAccount} tone="blue" />
          <StatBox label="Belum Punya Akun" value={stats.withoutAccount} tone="amber" />
        </div>

        {/* Search */}
        <div className="relative mt-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama / NIS / NISN..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No</TableHead>
                <TableHead>NIS / NISN</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>JK</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Akun Login</TableHead>
                <TableHead className="w-16 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {query ? "Tidak ada siswa yang cocok." : "Belum ada siswa di kelas ini."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s, i) => {
                  const acc = accountMap.get(s.id);
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <div className="font-medium">{s.nis}</div>
                          {s.nisn && <div className="text-muted-foreground">{s.nisn}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{s.full_name}</TableCell>
                      <TableCell>{s.gender ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "aktif" ? "default" : "secondary"}>
                          {s.status ?? "aktif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {acc ? (
                          <div className="flex items-center gap-2 text-xs">
                            <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="truncate max-w-[180px]">{acc.email}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <UserX className="h-3.5 w-3.5" />
                            <span>Belum ada</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(s)}>
                              <Edit2 className="h-4 w-4 mr-2" /> Edit Data
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleManageAccount(s)}>
                              <KeyRound className="h-4 w-4 mr-2" />
                              {acc ? "Kelola Akun" : "Buat Akun"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(s)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Nonaktifkan
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <StudentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        classId={classId}
        schoolId={schoolId}
        student={editing}
      />

      <StudentAccountDialog
        open={accountOpen}
        onOpenChange={setAccountOpen}
        student={accountStudent}
        account={accountStudent ? accountMap.get(accountStudent.id) ?? null : null}
        schoolDomain={schoolDomain}
      />

      <PrintStudentAccountsDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        className={className}
        academicYear={academicYear}
        students={students}
        accounts={accounts}
      />

      <BulkGenerateAccountsDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        students={students}
        existingAccountStudentIds={new Set(accounts.map((a) => a.student_id))}
        schoolDomain={schoolDomain}
        schoolId={schoolId}
      />
    </Card>
  );
}

function StatBox({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "emerald" | "blue" | "amber" }) {
  const toneCls =
    tone === "emerald" ? "text-emerald-600" :
    tone === "blue" ? "text-blue-600" :
    tone === "amber" ? "text-amber-600" :
    "text-foreground";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${toneCls}`}>{value}</div>
    </div>
  );
}