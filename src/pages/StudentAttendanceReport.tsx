import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/contexts/AcademicYearContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Student {
  id: string;
  full_name: string;
  nis: string;
  class_id: string;
}

interface Class {
  id: string;
  name: string;
  grade: number;
}

interface AttendanceStats {
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  total: number;
  percentage: number;
}

export default function StudentAttendanceReport() {
  const navigate = useNavigate();
  const { availableYears, activeYear, selectedSemester } = useAcademicYear();
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>(activeYear?.year || "");
  const [selectedSemesterFilter, setSelectedSemesterFilter] = useState<string>(selectedSemester?.toString() || "1");
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(selectedClassId);
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedStudentId && selectedYear && selectedSemesterFilter) {
      fetchAttendanceStats(selectedStudentId);
    }
  }, [selectedStudentId, selectedYear, selectedSemesterFilter]);

  const fetchClasses = async () => {
    const { data, error } = await supabase
      .from("classes")
      .select("*")
      .order("grade", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      toast.error("Gagal memuat data kelas");
      return;
    }
    setClasses(data || []);
  };

  const fetchStudents = async (classId: string) => {
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("class_id", classId)
      .order("full_name", { ascending: true });

    if (error) {
      toast.error("Gagal memuat data siswa");
      return;
    }
    setStudents(data || []);
    setSelectedStudentId("");
    setStats(null);
  };

  const fetchAttendanceStats = async (studentId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("attendance")
      .select("status")
      .eq("student_id", studentId)
      // snapshot jadwal di baris absensi: tetap terhitung walau jadwalnya sudah dihapus
      .eq("sched_academic_year", selectedYear)
      .eq("sched_semester", parseInt(selectedSemesterFilter));

    if (error) {
      toast.error("Gagal memuat data absensi");
      setLoading(false);
      return;
    }

    const hadir = data?.filter((a) => a.status === "hadir").length || 0;
    const sakit = data?.filter((a) => a.status === "sakit").length || 0;
    const izin = data?.filter((a) => a.status === "izin").length || 0;
    const alpa = data?.filter((a) => a.status === "alpa").length || 0;
    const total = data?.length || 0;
    const percentage = total > 0 ? (hadir / total) * 100 : 0;

    setStats({ hadir, sakit, izin, alpa, total, percentage });
    setLoading(false);
  };

  const pieData = stats
    ? [
        { name: "Hadir", value: stats.hadir, color: "#10b981" },
        { name: "Sakit", value: stats.sakit, color: "#f59e0b" },
        { name: "Izin", value: stats.izin, color: "#3b82f6" },
        { name: "Alpa", value: stats.alpa, color: "#ef4444" },
      ].filter((item) => item.value > 0)
    : [];

  const barData = stats
    ? [
        { status: "Hadir", jumlah: stats.hadir },
        { status: "Sakit", jumlah: stats.sakit },
        { status: "Izin", jumlah: stats.izin },
        { status: "Alpa", jumlah: stats.alpa },
      ]
    : [];

  const exportToPDF = async () => {
    if (!stats || !selectedStudentId) return;

    const student = students.find((s) => s.id === selectedStudentId);
    const className = classes.find((c) => c.id === selectedClassId);

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Rekap Absensi Siswa", 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Nama: ${student?.full_name}`, 14, 30);
    doc.text(`NIS: ${student?.nis}`, 14, 37);
    doc.text(`Kelas: ${className?.name}`, 14, 44);
    doc.text(`Tahun Ajaran: ${selectedYear}`, 14, 51);
    doc.text(`Semester: ${selectedSemesterFilter === "1" ? "Ganjil" : "Genap"}`, 14, 58);
    doc.text(`Tanggal: ${new Date().toLocaleDateString("id-ID")}`, 14, 65);

    autoTable(doc, {
      startY: 73,
      head: [["Status", "Jumlah", "Persentase"]],
      body: [
        ["Hadir", stats.hadir, `${((stats.hadir / stats.total) * 100).toFixed(1)}%`],
        ["Sakit", stats.sakit, `${((stats.sakit / stats.total) * 100).toFixed(1)}%`],
        ["Izin", stats.izin, `${((stats.izin / stats.total) * 100).toFixed(1)}%`],
        ["Alpa", stats.alpa, `${((stats.alpa / stats.total) * 100).toFixed(1)}%`],
        ["Total", stats.total, "100%"],
      ],
    });

    doc.save(`Rekap-Absensi-${student?.full_name}.pdf`);
    toast.success("PDF berhasil diunduh");
  };

  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Rekap Absensi Per Siswa</h1>
            <p className="text-muted-foreground">Statistik dan grafik kehadiran siswa</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Siswa</CardTitle>
            <CardDescription>Pilih kelas dan siswa untuk melihat rekap absensi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tahun Ajaran</label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Tahun Ajaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year.id} value={year.year}>
                        {year.year} {year.is_active && '(Aktif)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Semester</label>
                <Select value={selectedSemesterFilter} onValueChange={setSelectedSemesterFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Semester" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Semester Ganjil</SelectItem>
                    <SelectItem value="2">Semester Genap</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Kelas</label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name} (Kelas {cls.grade})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Siswa</label>
                <Select value={selectedStudentId} onValueChange={setSelectedStudentId} disabled={!selectedClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Siswa" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.full_name} - {student.nis}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Memuat data...</p>
            </CardContent>
          </Card>
        )}

        {stats && !loading && (
          <>
            <div className="flex justify-end">
              <Button onClick={exportToPDF} className="gap-2">
                <Download className="h-4 w-4" />
                Unduh PDF
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-muted-foreground">Hadir</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-green-600">{stats.hadir}</p>
                  <p className="text-xs text-muted-foreground">
                    {((stats.hadir / stats.total) * 100).toFixed(1)}%
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-amber-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-muted-foreground">Sakit</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-amber-600">{stats.sakit}</p>
                  <p className="text-xs text-muted-foreground">
                    {((stats.sakit / stats.total) * 100).toFixed(1)}%
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-muted-foreground">Izin</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-blue-600">{stats.izin}</p>
                  <p className="text-xs text-muted-foreground">
                    {((stats.izin / stats.total) * 100).toFixed(1)}%
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-red-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-muted-foreground">Alpa</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-red-600">{stats.alpa}</p>
                  <p className="text-xs text-muted-foreground">
                    {((stats.alpa / stats.total) * 100).toFixed(1)}%
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-primary">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-muted-foreground">Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Pertemuan</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Distribusi Kehadiran</CardTitle>
                  <CardDescription>Grafik persentase kehadiran siswa</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Statistik Kehadiran</CardTitle>
                  <CardDescription>Grafik jumlah kehadiran per status</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="jumlah" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {selectedStudent && (
              <Card>
                <CardHeader>
                  <CardTitle>Informasi Siswa</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Nama Lengkap</p>
                      <p className="font-medium">{selectedStudent.full_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">NIS</p>
                      <p className="font-medium">{selectedStudent.nis}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Persentase Kehadiran</p>
                      <p className="font-medium text-lg">{stats.percentage.toFixed(1)}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!selectedStudentId && !loading && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Pilih kelas dan siswa untuk melihat rekap absensi</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
