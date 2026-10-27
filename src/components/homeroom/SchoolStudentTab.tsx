// src/components/homeroom/SchoolStudentTab.tsx
// Akun Siswa untuk admin / kesiswaan: seperti tampilan wali kelas, tetapi cakupannya satu sekolah.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataPagination } from "@/components/ui/data-pagination";
import { Users, Plus, Search, MoreHorizontal, Edit2, KeyRound, Trash2, UserCheck, UserX, Zap, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicYear } from "@/contexts/AcademicYearContext";
import { useDeleteStudent, type Student } from "@/hooks/useHomeroomStudents";
import {
  useAdminSchoolStudents,
  useAdminSchoolStudentsAll,
  rowToAccount,
  toStudent,
  type AdminStudentRow,
} from "@/hooks/useAdminSchoolStudents";
import StudentFormDialog from "./StudentFormDialog";
import StudentAccountDialog from "./StudentAccountDialog";
import BulkGenerateAccountsDialog from "./BulkGenerateAccountsDialog";
import PrintStudentAccountsDialog from "./PrintStudentAccountsDialog";

const ALL = "all";
const ALL_YEARS = "__semua__";
const DEFAULT_DOMAIN = "sekolah.sch.id";

export default function SchoolStudentTab() {
  const { schoolId: authSchoolId } = useAuth();
  const { selectedYear } = useAcademicYear();
  const deleteStudentMut = useDeleteStudent();

  const [year, setYear] = useState<string>(ALL_YEARS);
  const [classId, setClassId] = useState<string>(ALL);
  const [account, setAccount] = useState<"all" | "with" | "without">("all");
  const [status, setStatus] = useState<"aktif" | "all">("aktif");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountRow, setAccountRow] = useState<AdminStudentRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  // Tahun pelajaran awal mengikuti pilihan di bilah atas (sekali saja)
  const [yearInit, setYearInit] = useState(false);
  useEffect(() => {
    if (!yearInit && selectedYear) {
      setYear(selectedYear);
      setYearInit(true);
    }
  }, [selectedYear, yearInit]);

  // Debounce pencarian agar tidak memanggil server di tiap ketikan
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const academicYear = year === ALL_YEARS ? null : year;

  const { data: years = [] } = useQuery({
    queryKey: ["school-student-tab-years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes").select("academic_year").order("academic_year", { ascending: false });
      if (error) throw error;
      return [...new Set((data ?? []).map((c: any) => c.academic_year as string).filter(Boolean))];
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["school-student-tab-classes", academicYear],
    queryFn: async () => {
      let q = supabase.from("classes").select("id, name, grade, academic_year, school_id").order("grade").order("name");
      if (academicYear) q = q.eq("academic_year", academicYear);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; grade: number; academic_year: string; school_id: string | null }[];
    },
  });

  const selectedClass = classId === ALL ? null : classes.find((c) => c.id === classId) ?? null;
  const schoolId = authSchoolId ?? selectedClass?.school_id ?? classes[0]?.school_id ?? null;

  const { data, isLoading, isError, error } = useAdminSchoolStudents({
    academicYear,
    classId: classId === ALL ? null : classId,
    search,
    account,
    status,
    page,
    pageSize,
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const stats = data?.stats ?? { total: 0, aktif: 0, with_account: 0, without_account: 0 };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Domain email mengikuti akun yang sudah ada agar akun baru konsisten
  const schoolDomain = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      const d = r.account_email?.split("@")[1];
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : DEFAULT_DOMAIN;
  }, [rows]);

  // Data lengkap untuk dialog massal (siswa aktif tanpa akun) dan cetak (satu kelas)
  const { data: bulkData } = useAdminSchoolStudentsAll(
    { academicYear, classId: classId === ALL ? null : classId, account: "without", status: "aktif" },
    bulkOpen
  );
  const { data: printData } = useAdminSchoolStudentsAll(
    { academicYear: null, classId: classId === ALL ? null : classId, account: "all", status: "all" },
    printOpen && classId !== ALL
  );

  const printAccounts = useMemo(
    () => (printData?.items ?? []).map(rowToAccount).filter((a): a is NonNullable<typeof a> => !!a),
    [printData]
  );

  const resetPage = () => setPage(1);

  const handleAdd = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (r: AdminStudentRow) => { setEditing(toStudent(r)); setFormOpen(true); };
  const handleManageAccount = (r: AdminStudentRow) => { setAccountRow(r); setAccountOpen(true); };
  const handleDelete = async (r: AdminStudentRow) => {
    if (!confirm(`Nonaktifkan siswa ${r.full_name}?`)) return;
    await deleteStudentMut.mutateAsync(r.id);
  };

  const title = selectedClass
    ? `Siswa Kelas ${selectedClass.name}`
    : "Seluruh Siswa Sekolah";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {title}
            </CardTitle>
            <CardDescription>
              Kelola data dan akun login siswa seluruh kelas di sekolah ini
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline" size="sm" className="gap-2"
              onClick={() => setPrintOpen(true)}
              disabled={!selectedClass}
              title={selectedClass ? undefined : "Pilih satu kelas terlebih dahulu"}
            >
              <FileDown className="h-4 w-4" />
              Cetak PDF Akun
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setBulkOpen(true)} disabled={!schoolId}>
              <Zap className="h-4 w-4" />
              Generate Akun Massal
            </Button>
            <Button size="sm" className="gap-2" onClick={handleAdd} disabled={!schoolId}>
              <Plus className="h-4 w-4" />
              Tambah Siswa
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <StatBox label="Total" value={stats.total} />
          <StatBox label="Aktif" value={stats.aktif} tone="emerald" />
          <StatBox label="Sudah Punya Akun" value={stats.with_account} tone="blue" />
          <StatBox label="Belum Punya Akun (aktif)" value={stats.without_account} tone="amber" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">Tahun Pelajaran</Label>
            <Select value={year} onValueChange={(v) => { setYear(v); setClassId(ALL); resetPage(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_YEARS}>Semua tahun</SelectItem>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kelas</Label>
            <Select value={classId} onValueChange={(v) => { setClassId(v); resetPage(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua kelas</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{academicYear ? "" : ` (${c.academic_year})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Akun Login</Label>
            <Select value={account} onValueChange={(v) => { setAccount(v as typeof account); resetPage(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                <SelectItem value="with">Sudah punya akun</SelectItem>
                <SelectItem value="without">Belum punya akun</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status Siswa</Label>
            <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); resetPage(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aktif">Aktif saja</SelectItem>
                <SelectItem value="all">Semua (termasuk nonaktif/lulus)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cari</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nama / NIS / NISN / email"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
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
                <TableHead>Kelas</TableHead>
                <TableHead>JK</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Akun Login</TableHead>
                <TableHead className="w-16 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Memuat data...</TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-destructive">
                    Gagal memuat data: {(error as Error)?.message ?? "kesalahan tidak diketahui"}.
                    Pastikan migrasi <code>20261027100000_admin_akun_siswa_sekolah.sql</code> sudah dijalankan.
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {search || account !== "all" || classId !== ALL ? "Tidak ada siswa yang cocok dengan filter." : "Belum ada siswa."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell>{(page - 1) * pageSize + i + 1}</TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <div className="font-medium">{r.nis}</div>
                        {r.nisn && <div className="text-muted-foreground">{r.nisn}</div>}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell>{r.class_name ?? "-"}</TableCell>
                    <TableCell>{r.gender ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={r.is_active ? "default" : "secondary"}>
                        {r.is_alumni ? "alumni" : r.status ?? "aktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.account_user_id ? (
                        <div className="flex items-center gap-2 text-xs">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="truncate max-w-[200px]">{r.account_email}</span>
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
                          <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(r)}>
                            <Edit2 className="h-4 w-4 mr-2" /> Edit Data
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleManageAccount(r)}>
                            <KeyRound className="h-4 w-4 mr-2" />
                            {r.account_user_id ? "Kelola Akun" : "Buat Akun"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(r)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Nonaktifkan
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4">
          <DataPagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </div>
      </CardContent>

      {schoolId && (
        <StudentFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          classId={classId === ALL ? null : classId}
          schoolId={schoolId}
          student={editing}
          classOptions={classes.map((c) => ({ id: c.id, name: academicYear ? c.name : `${c.name} (${c.academic_year})` }))}
        />
      )}

      <StudentAccountDialog
        open={accountOpen}
        onOpenChange={setAccountOpen}
        student={accountRow ? toStudent(accountRow) : null}
        account={accountRow ? rowToAccount(accountRow) : null}
        schoolDomain={schoolDomain}
      />

      {selectedClass && (
        <PrintStudentAccountsDialog
          open={printOpen}
          onOpenChange={setPrintOpen}
          className={selectedClass.name}
          academicYear={selectedClass.academic_year}
          students={(printData?.items ?? []).map(toStudent)}
          accounts={printAccounts}
        />
      )}

      {schoolId && (
        <BulkGenerateAccountsDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          students={(bulkData?.items ?? []).map(toStudent)}
          existingAccountStudentIds={new Set()}
          schoolDomain={schoolDomain}
          schoolId={schoolId}
        />
      )}
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
