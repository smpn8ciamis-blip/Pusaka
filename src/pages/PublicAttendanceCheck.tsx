import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Search, User, BookOpen, Calendar, ChevronLeft, ChevronRight, CheckCircle2, GraduationCap, AlertTriangle, TrendingUp, Award, Shield, Clock, Filter } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "sonner";
import ReCAPTCHA from "react-google-recaptcha";
import { RECAPTCHA_SITE_KEY } from "@/config/recaptcha";
import { useCaptchaConfig } from "@/hooks/useCaptchaConfig";

interface StudentInfo {
  id: string;
  full_name: string;
  nis: string;
  nisn: string;
  photo_url: string | null;
  class_name: string;
  grade: number;
  homeroom_teacher: string;
  academic_year: string;
  semester: number;
  school_name?: string;
  status?: string;
}

interface AttendanceStats {
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  total: number;
  percentage: number;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  notes: string | null;
  subject: string;
  teacher_name: string;
}

interface ViolationRecord {
  id: string;
  violation_date: string;
  violation_name: string;
  category: string;
  points: number;
  notes: string | null;
}

interface AchievementRecord {
  id: string;
  achievement_date: string;
  achievement_name: string;
  achievement_type: string;
  level: string;
  description: string | null;
}

export default function PublicAttendanceCheck() {
  const { captchaEnabled } = useCaptchaConfig();
  const [nisn, setNisn] = useState("");
  const [loading, setLoading] = useState(false);
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [allAttendanceRecords, setAllAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [violationRecords, setViolationRecords] = useState<ViolationRecord[]>([]);
  const [allViolationRecords, setAllViolationRecords] = useState<ViolationRecord[]>([]);
  const [totalViolationPoints, setTotalViolationPoints] = useState(0);
  const [achievementRecords, setAchievementRecords] = useState<AchievementRecord[]>([]);
  const [allAchievementRecords, setAllAchievementRecords] = useState<AchievementRecord[]>([]);
  const [mutationRecords, setMutationRecords] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRef, setCaptchaRef] = useState<ReCAPTCHA | null>(null);
  
  // Filter states
  const [academicYears, setAcademicYears] = useState<{ year: string; is_active: boolean }[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedSemester, setSelectedSemester] = useState<number>(0);
  const [filterPeriod, setFilterPeriod] = useState<string>("all");
  
  // Fetch academic years on mount (public view accessible)
  useEffect(() => {
    const fetchAcademicYears = async () => {
      const { data } = await supabase
        .from("academic_years")
        .select("year, is_active")
        .order("year", { ascending: false });
      
      if (data) {
        setAcademicYears(data);
        const active = data.find(y => y.is_active);
        if (active) {
          setSelectedYear(active.year);
        }
      }
    };
    
    fetchAcademicYears();
  }, []);

  const handleSearch = async () => {
    if (!nisn.trim()) {
      toast.error("Masukkan NIS/NISN terlebih dahulu");
      return;
    }

    if (captchaEnabled && !captchaToken) {
      toast.error("Silakan verifikasi captcha terlebih dahulu");
      return;
    }

    setLoading(true);
    try {
      // Use secure edge function for public lookup
      const { data, error } = await supabase.functions.invoke("public-student-lookup", {
        body: { nis: nisn.trim(), nisn: nisn.trim() }
      });

      if (error) {
        console.error("Lookup error:", error);
        toast.error("Gagal memuat data");
        resetState();
        return;
      }

      if (data.error) {
        toast.error(data.error);
        resetState();
        return;
      }

      // Set student info
      setStudentInfo(data.student);
      setSelectedSemester(data.student.semester || 0);

      // Set attendance data
      setAllAttendanceRecords(data.attendanceRecords || []);
      setAttendanceRecords(data.attendanceRecords || []);
      setStats(data.attendanceStats);

      // Set violation data
      setAllViolationRecords(data.violations || []);
      setViolationRecords(data.violations || []);
      setTotalViolationPoints(data.totalViolationPoints || 0);

      // Set achievement data
      setAllAchievementRecords(data.achievements || []);
      setAchievementRecords(data.achievements || []);
      setMutationRecords(data.mutations || []);

      setCurrentPage(1);
      setFilterPeriod("all");
      toast.success("Data kehadiran, pelanggaran, dan penghargaan berhasil dimuat");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Gagal memuat data");
      resetState();
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setStudentInfo(null);
    setStats(null);
    setAttendanceRecords([]);
    setAllAttendanceRecords([]);
    setViolationRecords([]);
    setAllViolationRecords([]);
    setTotalViolationPoints(0);
    setAchievementRecords([]);
    setAllAchievementRecords([]);
    setMutationRecords([]);
    setCurrentPage(1);
    captchaRef?.reset();
    setCaptchaToken(null);
  };

  // Apply filters when filter values change
  useEffect(() => {
    if (!studentInfo || allAttendanceRecords.length === 0) return;
    
    let filteredAttendance = [...allAttendanceRecords];
    let filteredViolations = [...allViolationRecords];
    let filteredAchievements = [...allAchievementRecords];
    
    // Apply period filter
    if (filterPeriod !== "all") {
      const now = new Date();
      let startDate: Date | null = null;
      let endDate: Date | null = null;
      
      if (filterPeriod === "month") {
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
      }
      
      if (startDate && endDate) {
        filteredAttendance = filteredAttendance.filter(record => {
          const recordDate = parseISO(record.date);
          return isWithinInterval(recordDate, { start: startDate!, end: endDate! });
        });
        
        filteredViolations = filteredViolations.filter(record => {
          const recordDate = parseISO(record.violation_date);
          return isWithinInterval(recordDate, { start: startDate!, end: endDate! });
        });
        
        filteredAchievements = filteredAchievements.filter(record => {
          const recordDate = parseISO(record.achievement_date);
          return isWithinInterval(recordDate, { start: startDate!, end: endDate! });
        });
      }
    }
    
    // Calculate new stats based on filtered data
    const hadir = filteredAttendance.filter((a) => a.status === "hadir").length;
    const sakit = filteredAttendance.filter((a) => a.status === "sakit").length;
    const izin = filteredAttendance.filter((a) => a.status === "izin").length;
    const alpa = filteredAttendance.filter((a) => a.status === "alpa").length;
    const total = filteredAttendance.length;
    const percentage = total > 0 ? (hadir / total) * 100 : 0;
    
    setStats({ hadir, sakit, izin, alpa, total, percentage });
    setAttendanceRecords(filteredAttendance);
    setViolationRecords(filteredViolations);
    setAchievementRecords(filteredAchievements);
    
    const totalPoints = filteredViolations.reduce((sum, v) => sum + v.points, 0);
    setTotalViolationPoints(totalPoints);
    setCurrentPage(1);
  }, [filterPeriod, selectedYear, selectedSemester, allAttendanceRecords, allViolationRecords, allAchievementRecords, studentInfo]);

  const pieData = stats
    ? [
        { name: "Hadir", value: stats.hadir, color: "hsl(var(--success))" },
        { name: "Sakit", value: stats.sakit, color: "hsl(var(--warning))" },
        { name: "Izin", value: stats.izin, color: "hsl(var(--info))" },
        { name: "Alpa", value: stats.alpa, color: "hsl(var(--destructive))" },
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

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "hadir":
        return "bg-success/10 text-success border-success/20";
      case "sakit":
        return "bg-warning/10 text-warning border-warning/20";
      case "izin":
        return "bg-info/10 text-info border-info/20";
      case "alpa":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case "ringan":
        return "bg-warning/10 text-warning border-warning/20";
      case "sedang":
        return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400";
      case "berat":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getViolationPointsColor = () => {
    if (totalViolationPoints === 0) return "text-success";
    if (totalViolationPoints < 50) return "text-warning";
    return "text-destructive";
  };

  // Pagination
  const totalPages = Math.ceil(attendanceRecords.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentRecords = attendanceRecords.slice(startIndex, endIndex);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <div className="container mx-auto py-8 px-4 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <div className="p-3 rounded-2xl bg-primary/10">
              <GraduationCap className="h-10 w-10 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Cek Status Peserta Didik
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Masukkan NIS atau NISN untuk melihat data kehadiran, pelanggaran, dan prestasi siswa
          </p>
        </div>

        {/* Search Card */}
        <Card className="max-w-xl mx-auto border-2 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-primary" />
              Cari Data Siswa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nisn">NIS / NISN</Label>
              <div className="flex gap-2">
                <Input
                  id="nisn"
                  placeholder="Masukkan NIS atau NISN siswa..."
                  value={nisn}
                  onChange={(e) => setNisn(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1"
                />
                <Button 
                  onClick={handleSearch} 
                  disabled={loading || (captchaEnabled && !captchaToken)}
                  className="bg-gradient-primary"
                >
                  {loading ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Cari
                    </>
                  )}
                </Button>
              </div>
            </div>
            {captchaEnabled && (
              <div className="flex justify-center">
                <ReCAPTCHA
                  ref={(ref) => setCaptchaRef(ref)}
                  sitekey={RECAPTCHA_SITE_KEY}
                  onChange={(token) => setCaptchaToken(token)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <div className="grid md:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          </div>
        )}

        {/* Results */}
        {studentInfo && !loading && (
          <div className="space-y-6">
            {/* Student Info Card */}
            <Card className="border-2 shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-6">
                <div className="flex items-start gap-4">
                  {studentInfo.photo_url ? (
                    <img 
                      src={studentInfo.photo_url} 
                      alt={studentInfo.full_name}
                      className="h-20 w-20 rounded-full object-cover shadow-md border-2 border-background"
                    />
                  ) : (
                    <div className="p-4 rounded-full bg-background shadow-md">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold">{studentInfo.full_name}</h2>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="outline" className="bg-background">
                        NIS: {studentInfo.nis}
                      </Badge>
                      {studentInfo.nisn && (
                        <Badge variant="outline" className="bg-background">
                          NISN: {studentInfo.nisn}
                        </Badge>
                      )}
                      <Badge className="bg-primary/20 text-primary hover:bg-primary/30">
                        Kelas {studentInfo.class_name}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
              <CardContent className="grid md:grid-cols-3 gap-4 p-6">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Wali Kelas</p>
                    <p className="font-medium">{studentInfo.homeroom_teacher}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Tahun Ajaran</p>
                    <p className="font-medium">{studentInfo.academic_year}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Semester</p>
                    <p className="font-medium">{studentInfo.semester}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Filter Section */}
            <Card className="border shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="h-5 w-5 text-primary" />
                  Filter Data
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Pilih Periode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Waktu</SelectItem>
                      <SelectItem value="month">Bulan Ini</SelectItem>
                      <SelectItem value="semester_1">Semester 1</SelectItem>
                      <SelectItem value="semester_2">Semester 2</SelectItem>
                    </SelectContent>
                  </Select>
                  {filterPeriod !== "all" && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      Filter Aktif
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-4 w-4 p-0 ml-1"
                        onClick={() => setFilterPeriod("all")}
                      >
                        ×
                      </Button>
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="border-l-4 border-l-success">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Hadir</p>
                        <p className="text-2xl font-bold text-success">{stats.hadir}</p>
                      </div>
                      <CheckCircle2 className="h-8 w-8 text-success/20" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-warning">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Sakit</p>
                        <p className="text-2xl font-bold text-warning">{stats.sakit}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-info">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Izin</p>
                        <p className="text-2xl font-bold text-info">{stats.izin}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-destructive">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Alpa</p>
                        <p className="text-2xl font-bold text-destructive">{stats.alpa}</p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-destructive/20" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Persentase Hadir</p>
                        <p className="text-2xl font-bold text-primary">{stats.percentage.toFixed(1)}%</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-primary/20" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Violation Points Card */}
            <Card className="border-2 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Total Poin Pelanggaran
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center p-6">
                  <div className={`text-6xl font-bold ${getViolationPointsColor()}`}>
                    {totalViolationPoints}
                  </div>
                  <span className="text-2xl text-muted-foreground ml-2">poin</span>
                </div>
                {totalViolationPoints === 0 ? (
                  <p className="text-center text-success">Tidak ada catatan pelanggaran</p>
                ) : (
                  <p className="text-center text-muted-foreground">
                    Total dari {violationRecords.length} pelanggaran
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Charts */}
            {stats && stats.total > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                <Card>
                  <CardHeader className="pb-2 md:pb-6">
                    <CardTitle className="text-sm md:text-lg">Distribusi Kehadiran</CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 md:p-6">
                    <ResponsiveContainer width="100%" height={180} className="md:!h-[250px]">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={60}
                          paddingAngle={5}
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
                  <CardHeader className="pb-2 md:pb-6">
                    <CardTitle className="text-sm md:text-lg">Statistik Kehadiran</CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 md:p-6">
                    <ResponsiveContainer width="100%" height={180} className="md:!h-[250px]">
                      <BarChart data={barData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="status" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="jumlah" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Violations Table */}
            {violationRecords.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    Riwayat Pelanggaran
                  </CardTitle>
                  <CardDescription>
                    Daftar pelanggaran yang tercatat
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Jenis Pelanggaran</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead className="text-right">Poin</TableHead>
                          <TableHead>Catatan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {violationRecords.map((violation) => (
                          <TableRow key={violation.id}>
                            <TableCell>
                              {format(new Date(violation.violation_date), "dd MMM yyyy", { locale: id })}
                            </TableCell>
                            <TableCell className="font-medium">{violation.violation_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getCategoryBadgeClass(violation.category)}>
                                {violation.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-bold text-destructive">
                              {violation.points}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {violation.notes || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Achievements Table */}
            {achievementRecords.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />
                    Prestasi & Penghargaan
                  </CardTitle>
                  <CardDescription>
                    Daftar prestasi dan penghargaan siswa
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Nama Prestasi</TableHead>
                          <TableHead>Jenis</TableHead>
                          <TableHead>Tingkat</TableHead>
                          <TableHead>Deskripsi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {achievementRecords.map((achievement) => (
                          <TableRow key={achievement.id}>
                            <TableCell>
                              {format(new Date(achievement.achievement_date), "dd MMM yyyy", { locale: id })}
                            </TableCell>
                            <TableCell className="font-medium">{achievement.achievement_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{achievement.achievement_type}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-primary/20 text-primary">
                                {achievement.level}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {achievement.description || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Mutation History */}
            {mutationRecords.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Riwayat Mutasi Keluar
                  </CardTitle>
                  <CardDescription>
                    {mutationRecords.length} catatan mutasi
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Sekolah Tujuan</TableHead>
                          <TableHead>Alasan</TableHead>
                          <TableHead>Catatan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mutationRecords.map((m: any) => (
                          <TableRow key={m.id}>
                            <TableCell>
                              {format(new Date(m.mutation_date), "dd MMM yyyy", { locale: id })}
                            </TableCell>
                            <TableCell className="font-medium">{m.destination_school}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{m.reason || "-"}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {m.notes || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Attendance Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Riwayat Kehadiran
                </CardTitle>
                <CardDescription>
                  {attendanceRecords.length} catatan kehadiran
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Mata Pelajaran</TableHead>
                        <TableHead>Guru</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Catatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            {format(new Date(record.date), "dd MMM yyyy", { locale: id })}
                          </TableCell>
                          <TableCell>{record.subject}</TableCell>
                          <TableCell>{record.teacher_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getStatusBadgeClass(record.status)}>
                              {getStatusLabel(record.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {record.notes || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Menampilkan {startIndex + 1}-{Math.min(endIndex, attendanceRecords.length)} dari {attendanceRecords.length}
                    </div>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <PaginationItem key={pageNum}>
                              <PaginationLink
                                onClick={() => setCurrentPage(pageNum)}
                                isActive={currentPage === pageNum}
                                className="cursor-pointer"
                              >
                                {pageNum}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
