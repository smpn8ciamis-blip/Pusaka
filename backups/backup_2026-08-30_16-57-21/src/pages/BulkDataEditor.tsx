import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Upload, Download, FileSpreadsheet, Users, GraduationCap, 
  BookOpen, Calendar, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, Info
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { format } from "date-fns";

type DataType = "students" | "teachers" | "classes" | "schedules" | "violation_types";

interface ImportResult {
  inserted: number;
  updated: number;
  errors: string[];
}

export default function BulkDataEditor() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [activeTab, setActiveTab] = useState<DataType>("students");
  const queryClient = useQueryClient();

  // Fetch data for each type
  const { data: students } = useQuery({
    queryKey: ["students-bulk"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, classes(name)")
        .eq("is_alumni", false)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: teachers } = useQuery({
    queryKey: ["teachers-bulk"],
    queryFn: async () => {
      const { data: teachersData, error } = await supabase
        .from("teachers")
        .select("*")
        .order("nip");
      if (error) throw error;
      
      // Get profiles for teacher names
      const userIds = teachersData?.map(t => t.user_id) || [];
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, full_name")
        .in("id", userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      return teachersData?.map(t => ({
        ...t,
        profile: profileMap.get(t.user_id)
      }));
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["classes-bulk"],
    queryFn: async () => {
      const { data: classesData, error } = await supabase
        .from("classes")
        .select("*")
        .order("grade")
        .order("name");
      if (error) throw error;
      
      // Get homeroom teachers
      const teacherIds = classesData?.filter(c => c.homeroom_teacher_id).map(c => c.homeroom_teacher_id) || [];
      const { data: teachersData } = await supabase
        .from("teachers")
        .select("id, user_id")
        .in("id", teacherIds);
      
      const userIds = teachersData?.map(t => t.user_id) || [];
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, full_name")
        .in("id", userIds);
      
      const teacherUserMap = new Map(teachersData?.map(t => [t.id, t.user_id]) || []);
      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
      
      return classesData?.map(c => ({
        ...c,
        homeroom_teacher_name: c.homeroom_teacher_id 
          ? profileMap.get(teacherUserMap.get(c.homeroom_teacher_id) || "") 
          : null
      }));
    },
  });

  const { data: schedules } = useQuery({
    queryKey: ["schedules-bulk"],
    queryFn: async () => {
      const { data: schedulesData, error } = await supabase
        .from("schedules")
        .select("*, classes(name)")
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      
      // Get teacher names
      const teacherIds = schedulesData?.map(s => s.teacher_id) || [];
      const { data: teachersData } = await supabase
        .from("teachers")
        .select("id, user_id")
        .in("id", teacherIds);
      
      const userIds = teachersData?.map(t => t.user_id) || [];
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, full_name")
        .in("id", userIds);
      
      const teacherUserMap = new Map(teachersData?.map(t => [t.id, t.user_id]) || []);
      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
      
      return schedulesData?.map(s => ({
        ...s,
        teacher_name: profileMap.get(teacherUserMap.get(s.teacher_id) || "")
      }));
    },
  });

  const { data: violationTypes } = useQuery({
    queryKey: ["violation-types-bulk"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("violation_types")
        .select("*")
        .order("category")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const dataTypeConfig = {
    students: {
      label: "Data Siswa",
      icon: Users,
      description: "Export/import data siswa dengan NIS sebagai key unik",
      keyField: "NIS",
      count: students?.length || 0,
    },
    teachers: {
      label: "Data Guru",
      icon: GraduationCap,
      description: "Export/import data guru dengan User ID sebagai key unik",
      keyField: "User ID",
      count: teachers?.length || 0,
    },
    classes: {
      label: "Data Kelas",
      icon: BookOpen,
      description: "Export/import data kelas/rombel dengan nama kelas sebagai key unik",
      keyField: "Nama Kelas",
      count: classes?.length || 0,
    },
    schedules: {
      label: "Data Jadwal",
      icon: Calendar,
      description: "Export/import jadwal pelajaran",
      keyField: "ID",
      count: schedules?.length || 0,
    },
    violation_types: {
      label: "Jenis Pelanggaran",
      icon: AlertTriangle,
      description: "Export/import jenis pelanggaran dengan nama sebagai key unik",
      keyField: "Nama",
      count: violationTypes?.length || 0,
    },
  };

  const getDayName = (dayOfWeek: number) => {
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    return days[dayOfWeek] || "-";
  };

  const handleExport = (type: DataType) => {
    let exportData: any[] = [];
    let fileName = "";

    switch (type) {
      case "students":
        exportData = (students || []).map((s) => ({
          "NIS": s.nis,
          "NISN": s.nisn || "",
          "Nama Lengkap": s.full_name,
          "Rombel": s.classes?.name || "",
          "Jenis Kelamin": s.gender || "",
          "Tempat Lahir": s.birth_place || "",
          "Tanggal Lahir": s.birth_date || "",
          "Alamat": s.address || "",
          "Nama Orang Tua": s.parent_name || "",
          "No. HP Orang Tua": s.parent_phone || "",
        }));
        fileName = `Data_Siswa_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
        break;

      case "teachers":
        exportData = (teachers || []).map((t) => ({
          "User ID": t.user_id,
          "NIP": t.nip || "",
          "Nama Lengkap": t.profile?.full_name || "",
          "Mata Pelajaran": t.subject,
          "Pangkat/Golongan": t.pangkat_golongan || "",
          "Jabatan": t.jabatan || "",
          "Wali Kelas": t.is_homeroom_teacher ? "Ya" : "Tidak",
        }));
        fileName = `Data_Guru_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
        break;

      case "classes":
        exportData = (classes || []).map((c) => ({
          "Nama Kelas": c.name,
          "Tingkat": c.grade,
          "Tahun Ajaran": c.academic_year,
          "Wali Kelas": c.homeroom_teacher_name || "",
        }));
        fileName = `Data_Kelas_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
        break;

      case "schedules":
        exportData = (schedules || []).map((s) => ({
          "ID": s.id,
          "Kelas": s.classes?.name || "",
          "Hari": getDayName(s.day_of_week),
          "Jam Mulai": s.start_time,
          "Jam Selesai": s.end_time,
          "Mata Pelajaran": s.subject,
          "Guru": s.teacher_name || "",
          "Tahun Ajaran": s.academic_year,
          "Semester": s.semester,
        }));
        fileName = `Data_Jadwal_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
        break;

      case "violation_types":
        exportData = (violationTypes || []).map((v) => ({
          "Nama Pelanggaran": v.name,
          "Kategori": v.category,
          "Poin": v.points,
          "Deskripsi": v.description || "",
          "Aktif": v.is_active ? "Ya" : "Tidak",
        }));
        fileName = `Data_Jenis_Pelanggaran_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
        break;
    }

    if (exportData.length === 0) {
      toast.error("Tidak ada data untuk diexport");
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Auto column width
    const maxWidth = 50;
    const colWidths = Object.keys(exportData[0] || {}).map((key) => ({
      wch: Math.min(maxWidth, Math.max(key.length, ...exportData.map((row) => String(row[key] || "").length)))
    }));
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, fileName);
    toast.success(`Data berhasil diexport: ${fileName}`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
        toast.error("File harus berformat Excel (.xlsx atau .xls)");
        return;
      }
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const handleImport = async (type: DataType) => {
    if (!selectedFile) {
      toast.error("Pilih file terlebih dahulu");
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          if (jsonData.length === 0) {
            toast.error("File Excel kosong");
            setIsImporting(false);
            return;
          }

          const result: ImportResult = { inserted: 0, updated: 0, errors: [] };

          switch (type) {
            case "students":
              await importStudents(jsonData, result);
              break;
            case "teachers":
              await importTeachers(jsonData, result);
              break;
            case "classes":
              await importClasses(jsonData, result);
              break;
            case "violation_types":
              await importViolationTypes(jsonData, result);
              break;
            default:
              toast.error("Tipe data tidak didukung untuk import");
          }

          setImportResult(result);
          
          // Invalidate queries
          queryClient.invalidateQueries({ queryKey: [`${type}-bulk`] });
          queryClient.invalidateQueries({ queryKey: [type] });
          
          if (result.errors.length === 0) {
            toast.success(`Import berhasil: ${result.inserted} ditambahkan, ${result.updated} diperbarui`);
          } else {
            toast.warning(`Import selesai dengan ${result.errors.length} error`);
          }
        } catch (error: any) {
          console.error("Import error:", error);
          toast.error(error.message || "Gagal mengimport data");
        } finally {
          setIsImporting(false);
        }
      };

      reader.readAsBinaryString(selectedFile);
    } catch (error: any) {
      console.error("File read error:", error);
      toast.error("Gagal membaca file");
      setIsImporting(false);
    }
  };

  const importStudents = async (jsonData: any[], result: ImportResult) => {
    // Get classes for mapping
    const { data: classesData } = await supabase.from("classes").select("id, name");
    const classMap = new Map(classesData?.map((c) => [c.name.toLowerCase(), c.id]) || []);

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const nis = String(row["NIS"] || "").trim();
      
      if (!nis) {
        result.errors.push(`Baris ${i + 2}: NIS tidak boleh kosong`);
        continue;
      }

      const className = String(row["Rombel"] || "").trim().toLowerCase();
      const classId = classMap.get(className) || null;

      const studentData = {
        nis,
        nisn: String(row["NISN"] || "").trim() || null,
        full_name: String(row["Nama Lengkap"] || "").trim(),
        class_id: classId,
        gender: String(row["Jenis Kelamin"] || "").trim().toUpperCase() === "L" ? "L" : 
                String(row["Jenis Kelamin"] || "").trim().toUpperCase() === "P" ? "P" : null,
        birth_place: String(row["Tempat Lahir"] || "").trim() || null,
        birth_date: row["Tanggal Lahir"] ? String(row["Tanggal Lahir"]).trim() : null,
        address: String(row["Alamat"] || "").trim() || null,
        parent_name: String(row["Nama Orang Tua"] || "").trim() || null,
        parent_phone: String(row["No. HP Orang Tua"] || "").trim() || null,
      };

      if (!studentData.full_name) {
        result.errors.push(`Baris ${i + 2}: Nama lengkap tidak boleh kosong`);
        continue;
      }

      // Check if student exists
      const { data: existing } = await supabase
        .from("students")
        .select("id")
        .eq("nis", nis)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("students")
          .update(studentData)
          .eq("nis", nis);
        
        if (error) {
          result.errors.push(`Baris ${i + 2}: ${error.message}`);
        } else {
          result.updated++;
        }
      } else {
        const { error } = await supabase.from("students").insert(studentData);
        
        if (error) {
          result.errors.push(`Baris ${i + 2}: ${error.message}`);
        } else {
          result.inserted++;
        }
      }
    }
  };

  const importTeachers = async (jsonData: any[], result: ImportResult) => {
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const userId = String(row["User ID"] || "").trim();
      
      if (!userId) {
        result.errors.push(`Baris ${i + 2}: User ID tidak boleh kosong`);
        continue;
      }

      // Check if teacher exists by user_id
      const { data: existing } = await supabase
        .from("teachers")
        .select("id, user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        // Update teacher data - allow duplicate NIP by not checking uniqueness
        const nip = String(row["NIP"] || "").trim() || null;
        const teacherData = {
          nip: nip, // Allow duplicate NIP
          subject: String(row["Mata Pelajaran"] || "").trim(),
          pangkat_golongan: String(row["Pangkat/Golongan"] || "").trim() || null,
          jabatan: String(row["Jabatan"] || "").trim() || null,
          is_homeroom_teacher: String(row["Wali Kelas"] || "").toLowerCase() === "ya",
        };

        const { error } = await supabase
          .from("teachers")
          .update(teacherData)
          .eq("user_id", userId);
        
        if (error) {
          // Ignore duplicate NIP errors, just log and continue
          if (error.message?.includes("duplicate") || error.message?.includes("unique")) {
            result.updated++;
          } else {
            result.errors.push(`Baris ${i + 2}: ${error.message}`);
          }
        } else {
          // Update profile name if provided
          const fullName = String(row["Nama Lengkap"] || "").trim();
          if (fullName) {
            await supabase
              .from("profiles")
              .update({ full_name: fullName })
              .eq("id", userId);
          }
          result.updated++;
        }
      } else {
        result.errors.push(`Baris ${i + 2}: Guru dengan User ID ${userId} tidak ditemukan. Gunakan menu Guru untuk menambah guru baru.`);
      }
    }
  };

  const importClasses = async (jsonData: any[], result: ImportResult) => {
    // Get teachers for mapping
    const { data: teachersData } = await supabase
      .from("teachers")
      .select("id, user_id");
    
    const userIds = teachersData?.map(t => t.user_id) || [];
    const { data: profiles } = await supabase
      .from("profiles_public")
      .select("id, full_name")
      .in("id", userIds);
    
    const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
    const teacherMap = new Map(
      teachersData?.map((t) => [profileMap.get(t.user_id)?.toLowerCase() || "", t.id]) || []
    );

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const name = String(row["Nama Kelas"] || "").trim();
      
      if (!name) {
        result.errors.push(`Baris ${i + 2}: Nama kelas tidak boleh kosong`);
        continue;
      }

      const academicYear = String(row["Tahun Ajaran"] || "").trim();
      const waliKelasName = String(row["Wali Kelas"] || "").trim().toLowerCase();
      const homeroomTeacherId = teacherMap.get(waliKelasName) || null;

      const classData = {
        name,
        grade: parseInt(String(row["Tingkat"] || "7")) || 7,
        academic_year: academicYear,
        homeroom_teacher_id: homeroomTeacherId,
      };

      // Check if class exists
      const { data: existing } = await supabase
        .from("classes")
        .select("id")
        .eq("name", name)
        .eq("academic_year", academicYear)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("classes")
          .update(classData)
          .eq("id", existing.id);
        
        if (error) {
          result.errors.push(`Baris ${i + 2}: ${error.message}`);
        } else {
          result.updated++;
        }
      } else {
        const { error } = await supabase.from("classes").insert(classData);
        
        if (error) {
          result.errors.push(`Baris ${i + 2}: ${error.message}`);
        } else {
          result.inserted++;
        }
      }
    }
  };

  const importViolationTypes = async (jsonData: any[], result: ImportResult) => {
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const name = String(row["Nama Pelanggaran"] || "").trim();
      
      if (!name) {
        result.errors.push(`Baris ${i + 2}: Nama pelanggaran tidak boleh kosong`);
        continue;
      }

      const violationData = {
        name,
        category: String(row["Kategori"] || "ringan").trim().toLowerCase(),
        points: parseInt(String(row["Poin"] || "0")) || 0,
        description: String(row["Deskripsi"] || "").trim() || null,
        is_active: String(row["Aktif"] || "Ya").toLowerCase() !== "tidak",
      };

      // Check if violation type exists
      const { data: existing } = await supabase
        .from("violation_types")
        .select("id")
        .eq("name", name)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("violation_types")
          .update(violationData)
          .eq("id", existing.id);
        
        if (error) {
          result.errors.push(`Baris ${i + 2}: ${error.message}`);
        } else {
          result.updated++;
        }
      } else {
        const { error } = await supabase.from("violation_types").insert(violationData);
        
        if (error) {
          result.errors.push(`Baris ${i + 2}: ${error.message}`);
        } else {
          result.inserted++;
        }
      }
    }
  };

  const config = dataTypeConfig[activeTab];
  const IconComponent = config.icon;

  return (
    <ProtectedRoute requireRole="admin">
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Data Massal</h1>
            <p className="text-muted-foreground">
              Export data ke Excel, edit, lalu import kembali untuk update massal
            </p>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Cara Penggunaan</AlertTitle>
            <AlertDescription>
              1. Export data yang ingin diedit ke file Excel<br />
              2. Edit data di Excel (jangan ubah kolom key seperti NIS/NIP)<br />
              3. Import file Excel yang sudah diedit<br />
              4. Data yang sudah ada akan diperbarui, data baru akan ditambahkan
            </AlertDescription>
          </Alert>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DataType)}>
            <TabsList className="grid w-full grid-cols-5">
              {Object.entries(dataTypeConfig).map(([key, value]) => {
                const Icon = value.icon;
                return (
                  <TabsTrigger key={key} value={key} className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{value.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {Object.keys(dataTypeConfig).map((type) => (
              <TabsContent key={type} value={type} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <IconComponent className="h-5 w-5" />
                      {config.label}
                    </CardTitle>
                    <CardDescription>{config.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Stats */}
                    <div className="flex items-center gap-4">
                      <Badge variant="secondary" className="text-sm">
                        {config.count} data tersedia
                      </Badge>
                      <Badge variant="outline" className="text-sm">
                        Key: {config.keyField}
                      </Badge>
                    </div>

                    {/* Export Section */}
                    <div className="border rounded-lg p-4 space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Download className="h-4 w-4" />
                        Export Data
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Download semua data {config.label.toLowerCase()} dalam format Excel untuk diedit
                      </p>
                      <Button onClick={() => handleExport(activeTab)} disabled={config.count === 0}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export ke Excel ({config.count} data)
                      </Button>
                    </div>

                    {/* Import Section */}
                    <div className="border rounded-lg p-4 space-y-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Import Data
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Upload file Excel yang sudah diedit untuk memperbarui data
                      </p>
                      
                      <div className="flex gap-4 items-end">
                        <div className="flex-1 space-y-2">
                          <Label htmlFor={`file-${type}`}>Pilih File Excel</Label>
                          <Input
                            id={`file-${type}`}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                          />
                        </div>
                        <Button 
                          onClick={() => handleImport(activeTab)} 
                          disabled={!selectedFile || isImporting}
                        >
                          {isImporting ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Mengimport...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Import
                            </>
                          )}
                        </Button>
                      </div>

                      {selectedFile && (
                        <p className="text-sm text-muted-foreground">
                          File terpilih: {selectedFile.name}
                        </p>
                      )}
                    </div>

                    {/* Import Result */}
                    {importResult && (
                      <div className="border rounded-lg p-4 space-y-3">
                        <h3 className="font-semibold">Hasil Import</h3>
                        <div className="flex gap-4">
                          <Badge variant="default" className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {importResult.inserted} ditambahkan
                          </Badge>
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <RefreshCw className="h-3 w-3" />
                            {importResult.updated} diperbarui
                          </Badge>
                          {importResult.errors.length > 0 && (
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <XCircle className="h-3 w-3" />
                              {importResult.errors.length} error
                            </Badge>
                          )}
                        </div>

                        {importResult.errors.length > 0 && (
                          <div className="mt-3">
                            <p className="text-sm font-medium text-destructive mb-2">Daftar Error:</p>
                            <div className="max-h-40 overflow-y-auto bg-muted rounded p-2">
                              {importResult.errors.map((error, idx) => (
                                <p key={idx} className="text-xs text-destructive">
                                  {error}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
