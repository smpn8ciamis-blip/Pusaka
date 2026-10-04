import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Plus, Search, Eye, Pencil, Trash2, FileText, CalendarIcon, ArrowUpDown, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addLetterheadToPDF, LetterheadSettings } from "@/lib/pdfLetterhead";

interface EventNote {
  id: string;
  teacher_id: string;
  title: string;
  description: string;
  event_date: string;
  category: string;
  severity: string;
  created_at: string;
  updated_at: string;
  teacher_name?: string;
}

const CATEGORIES = [
  { value: "umum", label: "Umum" },
  { value: "akademik", label: "Akademik" },
  { value: "disiplin", label: "Disiplin" },
  { value: "keamanan", label: "Keamanan" },
  { value: "kesehatan", label: "Kesehatan" },
  { value: "prestasi", label: "Prestasi" },
];

const SEVERITIES = [
  { value: "normal", label: "Normal", color: "bg-blue-500" },
  { value: "penting", label: "Penting", color: "bg-yellow-500" },
  { value: "sangat_penting", label: "Sangat Penting", color: "bg-red-500" },
];

const ImportantEventNotes = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<EventNote | null>(null);
  const [editingNote, setEditingNote] = useState<EventNote | null>(null);
  
  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState<Date>(new Date());
  const [category, setCategory] = useState("umum");
  const [severity, setSeverity] = useState("normal");
  
  // Filter & Sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>();
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>();
  const [sortField, setSortField] = useState<"event_date" | "created_at" | "title">("event_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Fetch teacher data
  const { data: teacherData } = useQuery({
    queryKey: ["teacher-data", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("teachers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && userRole === "teacher",
  });

  // Fetch notes with teacher names
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["important-event-notes", userRole, teacherData?.id],
    queryFn: async () => {
      const { data: notesData, error } = await supabase
        .from("important_event_notes")
        .select("*")
        .order(sortField, { ascending: sortOrder === "asc" });

      if (error) throw error;

      // Fetch teacher names separately
      const teacherIds = [...new Set(notesData.map(n => n.teacher_id))];
      const { data: teachersData } = await supabase
        .from("teachers")
        .select("id, user_id")
        .in("id", teacherIds);

      const userIds = teachersData?.map(t => t.user_id) || [];
      const { data: profilesData } = await supabase
        .from("profiles_public")
        .select("id, full_name")
        .in("id", userIds);

      const teacherNameMap = new Map();
      teachersData?.forEach(t => {
        const profile = profilesData?.find(p => p.id === t.user_id);
        teacherNameMap.set(t.id, profile?.full_name || "-");
      });

      return notesData.map(note => ({
        ...note,
        teacher_name: teacherNameMap.get(note.teacher_id) || "-"
      })) as EventNote[];
    },
    enabled: userRole === "admin" || !!teacherData?.id,
  });

  // Fetch school settings for PDF
  const { data: schoolSettings } = useQuery({
    queryKey: ["school-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("school_settings")
        .select("*")
        .maybeSingle();
      return data;
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (noteData: {
      title: string;
      description: string;
      event_date: string;
      category: string;
      severity: string;
      teacher_id?: string;
      id?: string;
    }) => {
      if (noteData.id) {
        const { error } = await supabase
          .from("important_event_notes")
          .update({
            title: noteData.title,
            description: noteData.description,
            event_date: noteData.event_date,
            category: noteData.category,
            severity: noteData.severity,
          })
          .eq("id", noteData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("important_event_notes")
          .insert({
            title: noteData.title,
            description: noteData.description,
            event_date: noteData.event_date,
            category: noteData.category,
            severity: noteData.severity,
            teacher_id: noteData.teacher_id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["important-event-notes"] });
      toast.success(editingNote ? "Catatan berhasil diperbarui" : "Catatan berhasil ditambahkan");
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Gagal menyimpan catatan: " + error.message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("important_event_notes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["important-event-notes"] });
      toast.success("Catatan berhasil dihapus");
    },
    onError: (error) => {
      toast.error("Gagal menghapus catatan: " + error.message);
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setEventDate(new Date());
    setCategory("umum");
    setSeverity("normal");
    setEditingNote(null);
  };

  const handleEdit = (note: EventNote) => {
    setEditingNote(note);
    setTitle(note.title);
    setDescription(note.description);
    setEventDate(new Date(note.event_date));
    setCategory(note.category);
    setSeverity(note.severity);
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Judul dan deskripsi harus diisi");
      return;
    }

    saveMutation.mutate({
      id: editingNote?.id,
      title,
      description,
      event_date: format(eventDate, "yyyy-MM-dd"),
      category,
      severity,
      teacher_id: teacherData?.id,
    });
  };

  const handlePreview = (note: EventNote) => {
    setSelectedNote(note);
    setIsPreviewOpen(true);
  };

  // Filter and sort notes
  const filteredNotes = notes
    .filter((note) => {
      const matchesSearch =
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterCategory === "all" || note.category === filterCategory;
      const matchesSeverity = filterSeverity === "all" || note.severity === filterSeverity;
      const noteDate = new Date(note.event_date);
      const matchesStartDate = !filterStartDate || noteDate >= filterStartDate;
      const matchesEndDate = !filterEndDate || noteDate <= filterEndDate;
      return matchesSearch && matchesCategory && matchesSeverity && matchesStartDate && matchesEndDate;
    })
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (sortOrder === "asc") {
        return aVal < bVal ? -1 : 1;
      }
      return aVal > bVal ? -1 : 1;
    });

  const handleSort = (field: "event_date" | "created_at" | "title") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const generatePDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Add letterhead
    const letterheadSettings: LetterheadSettings = {
      school_name: schoolSettings?.school_name || "Sekolah",
      district_name: schoolSettings?.district_name || undefined,
      district_font_size: schoolSettings?.district_font_size || undefined,
      district_font_style: schoolSettings?.district_font_style || undefined,
      district_line_spacing: schoolSettings?.district_line_spacing || undefined,
      school_address: schoolSettings?.school_address || undefined,
      school_phone: schoolSettings?.school_phone || undefined,
      logo_url: schoolSettings?.logo_url || undefined,
      logo_width: schoolSettings?.logo_width || undefined,
      logo_height: schoolSettings?.logo_height || undefined,
      logo_position_x: schoolSettings?.logo_position_x || undefined,
      logo_position_y: schoolSettings?.logo_position_y || undefined,
      right_logo_url: schoolSettings?.right_logo_url || undefined,
      right_logo_width: schoolSettings?.right_logo_width || undefined,
      right_logo_height: schoolSettings?.right_logo_height || undefined,
      right_logo_position_x: schoolSettings?.right_logo_position_x || undefined,
      right_logo_position_y: schoolSettings?.right_logo_position_y || undefined,
      header_font_size: schoolSettings?.header_font_size || undefined,
      header_font_style: schoolSettings?.header_font_style || undefined,
      school_line_spacing: schoolSettings?.school_line_spacing || undefined,
      subheader_font_size: schoolSettings?.subheader_font_size || undefined,
      show_address: schoolSettings?.show_address ?? true,
      show_phone: schoolSettings?.show_phone ?? true,
      watermark_url: schoolSettings?.watermark_url || undefined,
      watermark_opacity: schoolSettings?.watermark_opacity || undefined,
      watermark_size: schoolSettings?.watermark_size || undefined,
      watermark_position: schoolSettings?.watermark_position || undefined,
      watermark_enabled: schoolSettings?.watermark_enabled ?? false,
    };

    const startY = await addLetterheadToPDF(doc, letterheadSettings);

    // Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("REKAP CATATAN KEJADIAN PENTING", pageWidth / 2, startY + 5, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Dicetak: ${format(new Date(), "dd MMMM yyyy", { locale: localeId })}`, pageWidth / 2, startY + 12, { align: "center" });

    // Table
    const tableData = filteredNotes.map((note, index) => [
      index + 1,
      format(new Date(note.event_date), "dd/MM/yyyy"),
      note.title,
      CATEGORIES.find((c) => c.value === note.category)?.label || note.category,
      SEVERITIES.find((s) => s.value === note.severity)?.label || note.severity,
      note.teacher_name || "-",
    ]);

    let finalY = startY + 20;
    autoTable(doc, {
      startY: startY + 18,
      head: [["No", "Tanggal", "Judul", "Kategori", "Tingkat", "Pencatat"]],
      body: tableData,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
      didDrawPage: (data) => {
        finalY = data.cursor?.y || finalY;
      },
    });

    // Add signature section
    const signatureY = finalY + 15;
    const currentDate = format(new Date(), "dd MMMM yyyy", { locale: localeId });

    if (userRole === "admin") {
      // Admin: Headmaster signature
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Ciamis, ${currentDate}`, pageWidth - 60, signatureY, { align: "center" });
      doc.text("Mengetahui,", pageWidth - 60, signatureY + 6, { align: "center" });
      doc.text("Kepala Sekolah", pageWidth - 60, signatureY + 12, { align: "center" });
      
      // Signature space
      doc.text("", pageWidth - 60, signatureY + 30, { align: "center" });
      
      // Headmaster name
      doc.setFont("helvetica", "bold");
      const headmasterName = schoolSettings?.headmaster_name || "Nama Kepala Sekolah";
      doc.text(headmasterName, pageWidth - 60, signatureY + 38, { align: "center" });
      doc.setFont("helvetica", "normal");
      if (schoolSettings?.headmaster_nip) {
        doc.text(`NIP. ${schoolSettings.headmaster_nip}`, pageWidth - 60, signatureY + 44, { align: "center" });
      }
    } else {
      // Teacher: Teacher signature (pencatat)
      // Get current teacher name
      const currentTeacherNote = filteredNotes.find(n => n.teacher_id === teacherData?.id);
      const teacherName = currentTeacherNote?.teacher_name || "Nama Guru";
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Ciamis, ${currentDate}`, pageWidth - 60, signatureY, { align: "center" });
      doc.text("Pencatat,", pageWidth - 60, signatureY + 6, { align: "center" });
      
      // Signature space
      doc.text("", pageWidth - 60, signatureY + 30, { align: "center" });
      
      // Teacher name
      doc.setFont("helvetica", "bold");
      doc.text(teacherName, pageWidth - 60, signatureY + 38, { align: "center" });
    }

    doc.save(`catatan-kejadian-${format(new Date(), "yyyyMMdd")}.pdf`);
    toast.success("PDF berhasil diunduh");
  };

  const getCategoryLabel = (value: string) => CATEGORIES.find((c) => c.value === value)?.label || value;
  const getSeverityInfo = (value: string) => SEVERITIES.find((s) => s.value === value) || SEVERITIES[0];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Catatan Kejadian Penting</h1>
            <p className="text-muted-foreground">
              {userRole === "admin" ? "Kelola semua catatan kejadian penting" : "Catatan kejadian penting Anda"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={generatePDF}>
              <FileText className="h-4 w-4 mr-2" />
              Cetak PDF
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Catatan
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingNote ? "Edit Catatan" : "Tambah Catatan Baru"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Judul</Label>
                    <Input
                      placeholder="Masukkan judul catatan"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Deskripsi</Label>
                    <Textarea
                      placeholder="Masukkan deskripsi kejadian"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tanggal Kejadian</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {format(eventDate, "dd MMM yyyy", { locale: localeId })}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={eventDate}
                            onSelect={(date) => date && setEventDate(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>Kategori</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Tingkat Kepentingan</Label>
                    <Select value={severity} onValueChange={setSeverity}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEVERITIES.map((sev) => (
                          <SelectItem key={sev.value} value={sev.value}>
                            {sev.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Batal
                    </Button>
                    <Button onClick={handleSave} disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? "Menyimpan..." : "Simpan"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filter & Pencarian
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari judul atau deskripsi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                <SelectTrigger>
                  <SelectValue placeholder="Tingkat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tingkat</SelectItem>
                  {SEVERITIES.map((sev) => (
                    <SelectItem key={sev.value} value={sev.value}>
                      {sev.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filterStartDate ? format(filterStartDate, "dd/MM/yy") : "Dari"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={filterStartDate}
                    onSelect={setFilterStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filterEndDate ? format(filterEndDate, "dd/MM/yy") : "Sampai"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={filterEndDate}
                    onSelect={setFilterEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            {(filterCategory !== "all" || filterSeverity !== "all" || filterStartDate || filterEndDate) && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setFilterCategory("all");
                  setFilterSeverity("all");
                  setFilterStartDate(undefined);
                  setFilterEndDate(undefined);
                }}
              >
                Reset Filter
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("event_date")}>
                    <div className="flex items-center gap-1">
                      Tanggal
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("title")}>
                    <div className="flex items-center gap-1">
                      Judul
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Tingkat</TableHead>
                  {userRole === "admin" && <TableHead>Pencatat</TableHead>}
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={userRole === "admin" ? 7 : 6} className="text-center py-8">
                      Memuat data...
                    </TableCell>
                  </TableRow>
                ) : filteredNotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={userRole === "admin" ? 7 : 6} className="text-center py-8 text-muted-foreground">
                      Belum ada catatan kejadian
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredNotes.map((note, index) => {
                    const severityInfo = getSeverityInfo(note.severity);
                    return (
                      <TableRow key={note.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          {format(new Date(note.event_date), "dd MMM yyyy", { locale: localeId })}
                        </TableCell>
                        <TableCell className="font-medium">{note.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getCategoryLabel(note.category)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-white", severityInfo.color)}>
                            {severityInfo.label}
                          </Badge>
                        </TableCell>
                        {userRole === "admin" && (
                          <TableCell>{note.teacher_name || "-"}</TableCell>
                        )}
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handlePreview(note)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(note)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Yakin ingin menghapus catatan ini?")) {
                                  deleteMutation.mutate(note.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Preview Dialog */}
        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Detail Catatan Kejadian</DialogTitle>
            </DialogHeader>
            {selectedNote && (
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-white", getSeverityInfo(selectedNote.severity).color)}>
                    {getSeverityInfo(selectedNote.severity).label}
                  </Badge>
                  <Badge variant="outline">{getCategoryLabel(selectedNote.category)}</Badge>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{selectedNote.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedNote.event_date), "EEEE, dd MMMM yyyy", { locale: localeId })}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="whitespace-pre-wrap">{selectedNote.description}</p>
                </div>
                {userRole === "admin" && (
                  <div className="text-sm text-muted-foreground">
                    Dicatat oleh: {selectedNote.teacher_name || "-"}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ImportantEventNotes;
