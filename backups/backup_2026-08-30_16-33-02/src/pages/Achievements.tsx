import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Award, Plus, Pencil, Trash2, Search, Calendar, FileDown } from "lucide-react";
import { StudentSearchSelect } from '@/components/StudentSearchSelect';
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF } from '@/lib/pdfLetterhead';

interface Achievement {
  id: string;
  student_id: string;
  achievement_name: string;
  achievement_type: string;
  level: string;
  achievement_date: string;
  description: string | null;
  certificate_url: string | null;
  students: {
    full_name: string;
    nis: string;
    classes: {
      name: string;
    };
  };
}

interface AchievementForm {
  student_id: string;
  achievement_name: string;
  achievement_type: string;
  level: string;
  achievement_date: string;
  description: string;
  certificate_url: string;
}

const ACHIEVEMENT_TYPES = ["Akademik", "Non-Akademik", "Olahraga", "Seni", "Sosial", "Lainnya"];
const ACHIEVEMENT_LEVELS = ["Sekolah", "Kecamatan", "Kota/Kabupaten", "Provinsi", "Nasional", "Internasional"];

export default function Achievements() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState<Achievement | null>(null);
  const [formData, setFormData] = useState<AchievementForm>({
    student_id: "",
    achievement_name: "",
    achievement_type: "Akademik",
    level: "Sekolah",
    achievement_date: format(new Date(), "yyyy-MM-dd"),
    description: "",
    certificate_url: "",
  });

  // Fetch students for dropdown
  const { data: students } = useQuery({
    queryKey: ["students-for-achievements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, nis, class_id, classes:class_id(name)")
        .eq("is_alumni", false)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch achievements
  const { data: achievements, isLoading } = useQuery({
    queryKey: ["achievements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_achievements")
        .select(`
          *,
          students:student_id (
            full_name,
            nis,
            classes:class_id (
              name
            )
          )
        `)
        .order("achievement_date", { ascending: false });
      if (error) throw error;
      return data as Achievement[];
    },
  });

  // Create achievement mutation
  const createMutation = useMutation({
    mutationFn: async (data: AchievementForm) => {
      const { error } = await supabase.from("student_achievements").insert({
        ...data,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["achievements"] });
      toast.success("Penghargaan berhasil ditambahkan");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Gagal menambahkan penghargaan");
      console.error(error);
    },
  });

  // Update achievement mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AchievementForm> }) => {
      const { error } = await supabase
        .from("student_achievements")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["achievements"] });
      toast.success("Penghargaan berhasil diperbarui");
      setIsDialogOpen(false);
      setEditingAchievement(null);
      resetForm();
    },
    onError: (error) => {
      toast.error("Gagal memperbarui penghargaan");
      console.error(error);
    },
  });

  // Delete achievement mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("student_achievements")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["achievements"] });
      toast.success("Penghargaan berhasil dihapus");
    },
    onError: (error) => {
      toast.error("Gagal menghapus penghargaan");
      console.error(error);
    },
  });

  const resetForm = () => {
    setFormData({
      student_id: "",
      achievement_name: "",
      achievement_type: "Akademik",
      level: "Sekolah",
      achievement_date: format(new Date(), "yyyy-MM-dd"),
      description: "",
      certificate_url: "",
    });
    setEditingAchievement(null);
  };

  const handleEdit = (achievement: Achievement) => {
    setEditingAchievement(achievement);
    setFormData({
      student_id: achievement.student_id,
      achievement_name: achievement.achievement_name,
      achievement_type: achievement.achievement_type,
      level: achievement.level,
      achievement_date: achievement.achievement_date,
      description: achievement.description || "",
      certificate_url: achievement.certificate_url || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.student_id || !formData.achievement_name) {
      toast.error("Lengkapi data yang wajib diisi");
      return;
    }

    if (editingAchievement) {
      updateMutation.mutate({ id: editingAchievement.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Yakin ingin menghapus penghargaan ini?")) {
      deleteMutation.mutate(id);
    }
  };

  const filteredAchievements = achievements?.filter((achievement) => {
    const matchesSearch =
      achievement.students.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      achievement.students.nis.includes(searchQuery) ||
      achievement.achievement_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || achievement.achievement_type === filterType;
    const matchesLevel = filterLevel === "all" || achievement.level === filterLevel;
    return matchesSearch && matchesType && matchesLevel;
  });

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      Akademik: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      "Non-Akademik": "bg-purple-500/10 text-purple-500 border-purple-500/20",
      Olahraga: "bg-green-500/10 text-green-500 border-green-500/20",
      Seni: "bg-pink-500/10 text-pink-500 border-pink-500/20",
      Sosial: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      Lainnya: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    };
    return colors[type] || colors.Lainnya;
  };

  const getLevelBadgeColor = (level: string) => {
    const colors: Record<string, string> = {
      Sekolah: "bg-slate-500/10 text-slate-500 border-slate-500/20",
      Kecamatan: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      "Kota/Kabupaten": "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      Provinsi: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      Nasional: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      Internasional: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    return colors[level] || colors.Sekolah;
  };

  const exportAchievementsPDF = async () => {
    try {
      // Fetch school settings
      const { data: settings } = await supabase
        .from('school_settings')
        .select('*')
        .single();

      const doc = new jsPDF();
      
      // Add letterhead
      let yPos = 15;
      if (settings) {
        yPos = await addLetterheadToPDF(doc, {
          school_name: settings.school_name,
          district_name: settings.district_name,
          school_address: settings.school_address,
          school_phone: settings.school_phone,
          logo_url: settings.logo_url,
          right_logo_url: settings.right_logo_url,
          show_address: settings.show_address,
          show_phone: settings.show_phone,
        });
      }

      // Title
      yPos += 5;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('LAPORAN DATA PRESTASI SISWA', doc.internal.pageSize.getWidth() / 2, yPos, { align: 'center' });
      
      yPos += 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Tanggal Cetak: ${format(new Date(), 'dd MMMM yyyy', { locale: id })}`, 14, yPos);
      doc.text(`Total Prestasi: ${filteredAchievements?.length || 0} record`, 14, yPos + 5);

      // Table data
      const tableData = (filteredAchievements || []).map((achievement: any, index: number) => [
        index + 1,
        achievement.students?.full_name || '-',
        achievement.students?.nis || '-',
        achievement.students?.classes?.name || '-',
        achievement.achievement_name,
        achievement.achievement_type,
        achievement.level,
        format(new Date(achievement.achievement_date), 'dd/MM/yyyy'),
        achievement.description || '-',
      ]);

      autoTable(doc, {
        startY: yPos + 10,
        head: [['No', 'Nama Siswa', 'NIS', 'Kelas', 'Nama Prestasi', 'Jenis', 'Tingkat', 'Tanggal', 'Deskripsi']],
        body: tableData,
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          overflow: 'linebreak',
          cellWidth: 'wrap',
        },
        headStyles: {
          fillColor: [34, 197, 94],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 7,
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 28, overflow: 'linebreak' },
          2: { cellWidth: 16, halign: 'center' },
          3: { cellWidth: 12, halign: 'center' },
          4: { cellWidth: 32, overflow: 'linebreak' },
          5: { cellWidth: 18, halign: 'center' },
          6: { cellWidth: 18, halign: 'center' },
          7: { cellWidth: 18, halign: 'center' },
          8: { cellWidth: 28, overflow: 'linebreak' },
        },
        alternateRowStyles: {
          fillColor: [240, 253, 244],
        },
        margin: { left: 10, right: 10 },
        tableWidth: 'auto',
      });

      doc.save(`Laporan-Prestasi-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('PDF berhasil diunduh');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Gagal membuat PDF');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Penghargaan & Prestasi Siswa</h1>
            <p className="text-muted-foreground">Kelola data penghargaan dan prestasi siswa</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportAchievementsPDF}>
              <FileDown className="mr-2 h-4 w-4" />
              Cetak PDF
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Penghargaan
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingAchievement ? "Edit" : "Tambah"} Penghargaan</DialogTitle>
                  <DialogDescription>
                    {editingAchievement ? "Perbarui" : "Tambahkan"} data penghargaan atau prestasi siswa
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <StudentSearchSelect
                    students={students || []}
                    value={formData.student_id}
                    onChange={(value) => setFormData({ ...formData, student_id: value })}
                    label="Siswa"
                    required
                  />
                  <div className="space-y-2">
                    <Label htmlFor="achievement_name">Nama Penghargaan *</Label>
                    <Input
                      id="achievement_name"
                      value={formData.achievement_name}
                      onChange={(e) => setFormData({ ...formData, achievement_name: e.target.value })}
                      placeholder="Contoh: Juara 1 Olimpiade Matematika"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="achievement_type">Jenis Penghargaan</Label>
                      <Select value={formData.achievement_type} onValueChange={(value) => setFormData({ ...formData, achievement_type: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACHIEVEMENT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="level">Tingkat</Label>
                      <Select value={formData.level} onValueChange={(value) => setFormData({ ...formData, level: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACHIEVEMENT_LEVELS.map((level) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="achievement_date">Tanggal Pencapaian</Label>
                    <Input
                      id="achievement_date"
                      type="date"
                      value={formData.achievement_date}
                      onChange={(e) => setFormData({ ...formData, achievement_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Deskripsi</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Deskripsi singkat tentang penghargaan..."
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="certificate_url">URL Sertifikat/Bukti</Label>
                    <Input
                      id="certificate_url"
                      value={formData.certificate_url}
                      onChange={(e) => setFormData({ ...formData, certificate_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Batal
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {editingAchievement ? "Perbarui" : "Simpan"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter & Pencarian</CardTitle>
            <CardDescription>Cari dan filter data penghargaan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="search">Cari Siswa/Penghargaan</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Nama siswa, NIS, atau nama penghargaan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filterType">Jenis</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Jenis</SelectItem>
                    {ACHIEVEMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="filterLevel">Tingkat</Label>
                <Select value={filterLevel} onValueChange={setFilterLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Tingkat</SelectItem>
                    {ACHIEVEMENT_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Data Penghargaan
            </CardTitle>
            <CardDescription>
              Total {filteredAchievements?.length || 0} penghargaan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Siswa</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Penghargaan</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Tingkat</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : filteredAchievements && filteredAchievements.length > 0 ? (
                    filteredAchievements.map((achievement, index) => (
                      <TableRow key={achievement.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{achievement.students.full_name}</span>
                            <span className="text-xs text-muted-foreground">{achievement.students.nis}</span>
                          </div>
                        </TableCell>
                        <TableCell>{achievement.students.classes.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{achievement.achievement_name}</span>
                            {achievement.description && (
                              <span className="text-xs text-muted-foreground line-clamp-1">
                                {achievement.description}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getTypeBadgeColor(achievement.achievement_type)}>
                            {achievement.achievement_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getLevelBadgeColor(achievement.level)}>
                            {achievement.level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(achievement.achievement_date), "dd MMM yyyy", { locale: id })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(achievement)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(achievement.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2">
                          <Award className="h-8 w-8 text-muted-foreground" />
                          <p className="text-muted-foreground">
                            {searchQuery || filterType !== "all" || filterLevel !== "all"
                              ? "Tidak ada penghargaan yang sesuai dengan filter"
                              : "Belum ada data penghargaan"}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
