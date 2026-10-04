// src/pages/HomeroomFileUploadManagement.tsx

import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Loader2,
  Save,
  Trash2,
  CheckCircle,
  XCircle,
  FileText,
  Eye,
  Upload,
  Download,
  Users,
  Settings,
  Search,
  Filter,
  RefreshCw,
  Image,
  File,
  User,
  Calendar,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  AlertTriangle,
  Info,
  UserCheck,
  CheckCircle2,
  X,
  School,
  BookOpen,
  Edit2,
  PlusCircle,
  FolderPlus,
  ListChecks,
  Clock,
  WifiOff
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicYear } from "@/contexts/AcademicYearContext";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

// ========== KOMPONEN KONFIRMASI HAPUS ==========
const ConfirmDialog = ({ isOpen, onClose, onConfirm, fileName, studentName, isLoading }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in duration-300">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Hapus Berkas Siswa?</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Anda yakin ingin menghapus berkas milik:</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{studentName}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-1">File:</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4 break-all">"{fileName}"</p>
          <p className="text-xs text-red-500 dark:text-red-400 mb-6">⚠️ Tindakan ini tidak dapat dibatalkan!</p>
          <div className="w-full space-y-3">
            <button onClick={onConfirm} disabled={isLoading} className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
              Ya, Hapus
            </button>
            <button onClick={onClose} disabled={isLoading} className="w-full py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold">
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ========== KOMPONEN STATUS BADGE ==========
const StatusBadge = ({ status }: { status: string }) => {
  const statusMap: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    pending: {
      label: '⏳ Menunggu',
      icon: <Clock className="h-3 w-3" />,
      className: 'bg-yellow-100 text-yellow-700 border-yellow-200'
    },
    approved: {
      label: '✅ Disetujui',
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: 'bg-green-100 text-green-700 border-green-200'
    },
    rejected: {
      label: '❌ Ditolak',
      icon: <XCircle className="h-3 w-3" />,
      className: 'bg-red-100 text-red-700 border-red-200'
    }
  };

  const config = statusMap[status] || statusMap.pending;

  return (
    <Badge className={`${config.className} border text-[10px] flex items-center gap-1`}>
      {config.icon}
      {config.label}
    </Badge>
  );
};

// ========== KOMPONEN MODAL KATEGORI DOKUMEN ==========
const CategoryModal = ({ isOpen, onClose, onSave, category, isLoading, classId }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxFiles, setMaxFiles] = useState(5);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(10);
  const [allowedTypes, setAllowedTypes] = useState<string[]>(["pdf", "jpg", "jpeg", "png"]);
  const [isRequired, setIsRequired] = useState(true);

  useEffect(() => {
    if (category) {
      setTitle(category.title || "");
      setDescription(category.description || "");
      setMaxFiles(category.max_files || 5);
      setMaxFileSizeMb(category.max_file_size_mb || 10);
      setAllowedTypes(category.allowed_types || ["pdf", "jpg", "jpeg", "png"]);
      setIsRequired(category.is_required !== undefined ? category.is_required : true);
    } else {
      setTitle("");
      setDescription("");
      setMaxFiles(5);
      setMaxFileSizeMb(10);
      setAllowedTypes(["pdf", "jpg", "jpeg", "png"]);
      setIsRequired(true);
    }
  }, [category]);

  if (!isOpen) return null;

  const toggleType = (type: string) => {
    if (allowedTypes.includes(type)) {
      setAllowedTypes(allowedTypes.filter(t => t !== type));
    } else {
      setAllowedTypes([...allowedTypes, type]);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto animate-in zoom-in duration-300">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">
            {category ? '✏️ Edit Dokumen' : '📄 Tambah Dokumen Baru'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Judul Dokumen *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Tugas PKN, Surat Pernyataan, dll"
            />
          </div>

          <div>
            <Label>Deskripsi</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deskripsi singkat tentang dokumen yang harus diupload"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Maksimal File</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={maxFiles}
                onChange={(e) => setMaxFiles(parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <Label>Maksimal Ukuran (MB)</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={maxFileSizeMb}
                onChange={(e) => setMaxFileSizeMb(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          <div>
            <Label>Jenis File yang Diizinkan</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`px-3 py-1 rounded-lg border text-sm font-medium transition-all ${
                    allowedTypes.includes(type)
                      ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30'
                      : 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800'
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Wajib diupload
            </Label>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={() => onSave({ 
              title, 
              description, 
              max_files: maxFiles, 
              max_file_size_mb: maxFileSizeMb, 
              allowed_types: allowedTypes, 
              is_required: isRequired, 
              class_id: classId 
            })} disabled={isLoading || !title}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Simpan
            </Button>
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ========== KOMPONEN UTAMA ==========
export default function HomeroomFileUploadManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, userRole } = useAuth();
  const { selectedYear, selectedSemester } = useAcademicYear(); // ✅ AMBIL TAHUN & SEMESTER AKTIF
  
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // ========== STATE ==========
  const [activeTab, setActiveTab] = useState("documents");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(false);

  // ========== FILTER STATE ==========
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<string>("all");
  const [selectedFileType, setSelectedFileType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // ========== KONFIRMASI HAPUS ==========
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    fileId: '',
    fileName: '',
    studentName: '',
    fileUrl: ''
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // ============================================================
  // QUERY 1: Cek Wali Kelas (DENGAN FILTER TAHUN AJARAN)
  // ============================================================
  const { data: homeroomData, isLoading: homeroomLoading, error: homeroomError, refetch: refetchHomeroom } = useQuery({
    queryKey: ['homeroom-data-with-academic-year', user?.id, selectedYear, selectedSemester],
    queryFn: async () => {
      if (!user?.id) {
        console.log("❌ No user ID");
        return null;
      }
      
      console.log("🔍 [Homeroom] Checking homeroom status for user:", user.id);
      console.log("📅 Academic Year:", selectedYear);
      console.log("📅 Semester:", selectedSemester);
      
      try {
        // STEP 1: Cari teacher dari user_id
        const { data: teacher, error: teacherError } = await supabase
          .from('teachers')
          .select(`
            id,
            user_id,
            nip,
            subject,
            is_homeroom_teacher,
            pangkat_golongan,
            jabatan,
            nuptk,
            school_id,
            photo_url,
            profiles:user_id (
              full_name,
              email,
              phone
            )
          `)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (teacherError) {
          console.error("❌ [Homeroom] Error fetching teacher:", teacherError);
          return { teacher: null, class: null, error: teacherError };
        }
        
        if (!teacher) {
          console.log("❌ [Homeroom] User is not a teacher");
          return { teacher: null, class: null };
        }
        
        const teacherName = teacher.profiles?.full_name || 'N/A';
        
        console.log("✅ [Homeroom] Teacher found:", teacher.id, teacherName);
        console.log("✅ [Homeroom] is_homeroom_teacher:", teacher.is_homeroom_teacher);
        
        if (!teacher.is_homeroom_teacher) {
          console.log("❌ [Homeroom] Teacher is not marked as homeroom teacher");
          return { teacher, class: null };
        }
        
        // STEP 2: Cari class - DENGAN FILTER ACADEMIC YEAR
        let classData = null;
        
        // METODE 1: Cari dengan teacher.id + academic_year
        if (selectedYear) {
          console.log("🔍 [Method 1] Trying with teacher.id + academic_year:", selectedYear);
          try {
            const { data, error } = await supabase
              .from('classes')
              .select('*, teachers(*)')
              .eq('homeroom_teacher_id', teacher.id)
              .eq('academic_year', selectedYear)
              .maybeSingle();
            
            if (!error && data) {
              console.log("✅ [Method 1] Found class:", data.name);
              classData = data;
            }
          } catch (err) {
            console.log("⚠️ [Method 1] Failed:", err);
          }
        }
        
        // METODE 2: Cari dengan user.id + academic_year
        if (!classData && selectedYear) {
          console.log("🔍 [Method 2] Trying with user.id + academic_year:", selectedYear);
          try {
            const { data, error } = await supabase
              .from('classes')
              .select('*, teachers(*)')
              .eq('homeroom_teacher_id', user.id)
              .eq('academic_year', selectedYear)
              .maybeSingle();
            
            if (!error && data) {
              console.log("✅ [Method 2] Found class:", data.name);
              classData = data;
            }
          } catch (err) {
            console.log("⚠️ [Method 2] Failed:", err);
          }
        }
        
        // METODE 3: Cari dengan teacher.id (tanpa filter tahun)
        if (!classData) {
          console.log("🔍 [Method 3] Trying with teacher.id (no year filter)");
          try {
            const { data, error } = await supabase
              .from('classes')
              .select('*, teachers(*)')
              .eq('homeroom_teacher_id', teacher.id)
              .maybeSingle();
            
            if (!error && data) {
              console.log("✅ [Method 3] Found class:", data.name);
              classData = data;
            }
          } catch (err) {
            console.log("⚠️ [Method 3] Failed:", err);
          }
        }
        
        // METODE 4: Cari semua class dan filter manual
        if (!classData && selectedYear) {
          console.log("🔍 [Method 4] Searching all classes with academic_year:", selectedYear);
          try {
            const { data, error } = await supabase
              .from('classes')
              .select('id, name, homeroom_teacher_id, academic_year')
              .eq('academic_year', selectedYear)
              .limit(50);
            
            if (!error && data) {
              const match = data.find(c => 
                c.homeroom_teacher_id === teacher.id || 
                c.homeroom_teacher_id === user.id
              );
              if (match) {
                console.log("✅ [Method 4] Found class:", match.name);
                classData = match;
              }
            }
          } catch (err) {
            console.log("⚠️ [Method 4] Failed:", err);
          }
        }
        
        if (!classData) {
          console.log("❌ [Homeroom] No class found for academic year:", selectedYear);
          return { teacher, class: null };
        }
        
        console.log("✅ [Homeroom] Final class found:", classData.name, "| Year:", classData.academic_year);
        return { teacher, class: classData };
        
      } catch (err) {
        console.error("❌ [Homeroom] Exception:", err);
        return { teacher: null, class: null, error: err };
      }
    },
    enabled: !!user?.id,
    retry: 3,
    staleTime: 5 * 60 * 1000
  });

  // ============================================================
  // QUERY 2: Ambil semua dokumen/kategori upload
  // ============================================================
  const { data: categories, refetch: refetchCategories, error: categoriesError } = useQuery({
    queryKey: ['upload-categories-with-academic-year', homeroomData?.class?.id],
    queryFn: async () => {
      if (!homeroomData?.class?.id) return [];
      
      console.log("🔍 [Categories] Fetching categories for class:", homeroomData.class.id);
      
      try {
        const { data, error } = await supabase
          .from('upload_categories')
          .select('*')
          .eq('class_id', homeroomData.class.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        
        if (error) {
          console.error("❌ [Categories] Error:", error);
          return [];
        }
        
        console.log("✅ [Categories] Categories found:", data?.length || 0);
        return data || [];
      } catch (err) {
        console.error("❌ [Categories] Exception:", err);
        return [];
      }
    },
    enabled: !!homeroomData?.class?.id,
    staleTime: 0,
    retry: 2
  });

  // ============================================================
  // QUERY 3: Ambil siswa di kelas (dengan filter status aktif)
  // ============================================================
  const { data: students, isLoading: studentsLoading, error: studentsError } = useQuery({
    queryKey: ['class-students-with-academic-year', homeroomData?.class?.id],
    queryFn: async () => {
      if (!homeroomData?.class?.id) return [];
      
      try {
        const { data, error } = await supabase
          .from('students')
          .select('id, full_name, nis, nisn, gender, photo_url')
          .eq('class_id', homeroomData.class.id)
          .eq('status', 'aktif')
          .order('full_name');
        
        if (error) {
          console.error("❌ [Students] Error:", error);
          return [];
        }
        
        return data || [];
      } catch (err) {
        console.error("❌ [Students] Exception:", err);
        return [];
      }
    },
    enabled: !!homeroomData?.class?.id,
    retry: 2
  });

  // ============================================================
  // QUERY 4: Ambil semua file siswa (DENGAN FILTER TAHUN AJARAN)
  // ============================================================
  const { data: studentUploads, refetch: refetchUploads, isLoading: uploadsLoading, error: uploadsError } = useQuery({
    queryKey: ['homeroom-uploads-with-academic-year', homeroomData?.class?.id, selectedCategory, selectedStudent, selectedFileType, selectedStatus, selectedYear],
    queryFn: async () => {
      if (!homeroomData?.class?.id) {
        console.log("❌ No class ID for uploads query");
        return [];
      }
      
      console.log("🔍 [Uploads] Fetching uploads for class:", homeroomData.class.id);
      console.log("📅 Academic Year:", selectedYear);
      console.log("🔍 Filters:", { selectedCategory, selectedStudent, selectedFileType, selectedStatus });
      
      try {
        // ============================================================
        // METODE 1: Query dengan filter class_id
        // ============================================================
        let query = supabase
          .from('student_uploads')
          .select('*')
          .eq('class_id', homeroomData.class.id);

        if (selectedCategory && selectedCategory !== "all") {
          query = query.eq('category_id', selectedCategory);
        }

        if (selectedStudent !== "all") {
          query = query.eq('student_id', selectedStudent);
        }

        if (selectedFileType !== "all") {
          query = query.eq('file_type', selectedFileType);
        }

        if (selectedStatus !== "all") {
          query = query.eq('status', selectedStatus);
        }

        const { data: uploadsData, error: uploadsError } = await query
          .order('created_at', { ascending: false });

        if (uploadsError) {
          console.error("❌ [Method 1] Error:", uploadsError);
        } else if (uploadsData) {
          console.log("✅ [Method 1] Found:", uploadsData.length);
          
          // Ambil data siswa
          const studentIds = [...new Set(uploadsData.map(u => u.student_id).filter(Boolean))];
          let studentMap: Record<string, any> = {};
          
          if (studentIds.length > 0) {
            try {
              const { data: sData, error: sError } = await supabase
                .from('students')
                .select('id, full_name, nis, nisn, gender, photo_url')
                .in('id', studentIds);
              
              if (!sError && sData) {
                sData.forEach(s => { studentMap[s.id] = s; });
                console.log("✅ [Students] Found:", sData.length);
              }
            } catch (err) {
              console.log("⚠️ [Students] Failed to fetch:", err);
            }
          }
          
          // Ambil data kategori
          const categoryIds = [...new Set(uploadsData.map(u => u.category_id).filter(Boolean))];
          let categoryMap: Record<string, any> = {};
          
          if (categoryIds.length > 0) {
            try {
              const { data: cData, error: cError } = await supabase
                .from('upload_categories')
                .select('id, title, description, is_required')
                .in('id', categoryIds);
              
              if (!cError && cData) {
                cData.forEach(c => { categoryMap[c.id] = c; });
                console.log("✅ [Categories] Found:", cData.length);
              }
            } catch (err) {
              console.log("⚠️ [Categories] Failed to fetch:", err);
            }
          }
          
          // Gabungkan data
          const result = uploadsData.map((upload: any) => ({
            ...upload,
            students: studentMap[upload.student_id] || null,
            upload_categories: upload.category_id ? categoryMap[upload.category_id] : null
          }));
          
          console.log("✅ [Final] Result:", result.length);
          return result;
        }

        // ============================================================
        // METODE 2: Query sederhana (tanpa join)
        // ============================================================
        console.log("🔍 [Method 2] Trying simple query...");
        let query2 = supabase
          .from('student_uploads')
          .select('*')
          .eq('class_id', homeroomData.class.id)
          .order('created_at', { ascending: false });

        const { data: data2, error: error2 } = await query2;

        if (!error2 && data2) {
          console.log("✅ [Method 2] Found:", data2.length);
          return data2;
        }

        console.log("❌ All methods failed, returning empty array");
        return [];

      } catch (err) {
        console.error("❌ [Uploads] Exception:", err);
        return [];
      }
    },
    enabled: !!homeroomData?.class?.id,
    staleTime: 0,
    retry: 3
  });

  // ============================================================
  // HANDLER: Kategori Dokumen
  // ============================================================
  const handleSaveCategory = async (data: any) => {
    if (!homeroomData?.class?.id) {
      toast({ variant: "destructive", title: "❌ Gagal", description: "Kelas tidak ditemukan." });
      return;
    }

    setSavingCategory(true);
    try {
      const insertData = {
        class_id: homeroomData.class.id,
        title: data.title,
        description: data.description || null,
        max_files: data.max_files || 5,
        max_file_size_mb: data.max_file_size_mb || 10,
        allowed_types: data.allowed_types || ['pdf', 'jpg', 'jpeg', 'png'],
        sort_order: (categories?.length || 0) + 1,
        is_active: true
      };
      
      try {
        const { data: columnCheck, error: columnError } = await supabase
          .from('upload_categories')
          .select('is_required')
          .limit(1)
          .maybeSingle();
        
        if (!columnError) {
          insertData.is_required = data.is_required !== undefined ? data.is_required : true;
        }
      } catch (err) {
        console.log("ℹ️ is_required column check failed, skipping");
      }

      if (editingCategory) {
        const { error } = await supabase
          .from('upload_categories')
          .update(insertData)
          .eq('id', editingCategory.id);
        
        if (error) throw error;
        toast({ title: "✅ Berhasil", description: "Dokumen berhasil diperbarui." });
      } else {
        const { error } = await supabase
          .from('upload_categories')
          .insert(insertData);
        
        if (error) throw error;
        toast({ title: "✅ Berhasil", description: "Dokumen baru berhasil ditambahkan." });
      }
      
      await refetchCategories();
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
    } catch (err: any) {
      console.error("❌ [SaveCategory] Error:", err);
      toast({ variant: "destructive", title: "❌ Gagal", description: err.message });
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm(`Hapus dokumen ini? File yang sudah diupload oleh siswa akan tetap tersimpan.`)) return;
    
    setDeletingCategory(true);
    try {
      const { error } = await supabase
        .from('upload_categories')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;
      toast({ title: "✅ Berhasil", description: "Dokumen dinonaktifkan." });
      await refetchCategories();
      if (selectedCategory === id) setSelectedCategory(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "❌ Gagal", description: err.message });
    } finally {
      setDeletingCategory(false);
    }
  };

  // ============================================================
  // HANDLER: Review File
  // ============================================================
  const handleApproveFile = async (id: string) => {
    try {
      const { error } = await supabase
        .from('student_uploads')
        .update({ 
          status: 'approved', 
          reviewed_by: homeroomData?.teacher?.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (error) throw error;
      toast({ title: "✅ Berhasil", description: "File disetujui." });
      await refetchUploads();
    } catch (err: any) {
      toast({ variant: "destructive", title: "❌ Gagal", description: err.message });
    }
  };

  const handleRejectFile = async (id: string) => {
    try {
      const { error } = await supabase
        .from('student_uploads')
        .update({ 
          status: 'rejected', 
          reviewed_by: homeroomData?.teacher?.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (error) throw error;
      toast({ title: "✅ Berhasil", description: "File ditolak." });
      await refetchUploads();
    } catch (err: any) {
      toast({ variant: "destructive", title: "❌ Gagal", description: err.message });
    }
  };

  const handleResetStatus = async (id: string) => {
    try {
      const { error } = await supabase
        .from('student_uploads')
        .update({ 
          status: 'pending', 
          reviewed_by: null,
          reviewed_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (error) throw error;
      toast({ title: "✅ Berhasil", description: "Status file direset." });
      await refetchUploads();
    } catch (err: any) {
      toast({ variant: "destructive", title: "❌ Gagal", description: err.message });
    }
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: '✅ Download Berhasil', description: `File "${fileName}" berhasil diunduh.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: '❌ Gagal Download', description: err.message });
    }
  };

  const handleDeleteClick = (id: string, fileName: string, studentName: string, fileUrl: string) => {
    setConfirmDialog({ isOpen: true, fileId: id, fileName, studentName, fileUrl });
  };

  const handleConfirmDelete = async () => {
    const { fileId, fileName, studentName, fileUrl } = confirmDialog;
    setIsDeleting(true);

    try {
      const storedFileName = fileUrl.split('/').pop();
      if (storedFileName) {
        await supabase.storage.from('student-uploads').remove([storedFileName]);
      }
      const { error } = await supabase.from('student_uploads').delete().eq('id', fileId);
      if (error) throw error;
      toast({ title: '✅ Berhasil', description: `Berkas "${fileName}" milik ${studentName} berhasil dihapus.` });
      await refetchUploads();
      setConfirmDialog({ isOpen: false, fileId: '', fileName: '', studentName: '', fileUrl: '' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: '❌ Gagal Hapus', description: err.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDialog({ isOpen: false, fileId: '', fileName: '', studentName: '', fileUrl: '' });
  };

  const handleRefresh = () => {
    refetchUploads();
    refetchCategories();
    refetchHomeroom();
    toast({ title: '🔄 Refresh', description: 'Data berhasil diperbarui.' });
  };

  // ============================================================
  // HELPERS
  // ============================================================
  const formatFileSize = (bytes: number) => {
    if (!bytes) return 'Unknown';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === 'pdf') return <FileText className="h-5 w-5 text-red-500" />;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) {
      return <Image className="h-5 w-5 text-blue-500" />;
    }
    return <File className="h-5 w-5 text-gray-500" />;
  };

  const getFileTypeBadge = (fileType: string) => {
    const colors: Record<string, string> = {
      pdf: 'bg-red-100 text-red-700',
      jpg: 'bg-blue-100 text-blue-700',
      jpeg: 'bg-blue-100 text-blue-700',
      png: 'bg-green-100 text-green-700',
      gif: 'bg-purple-100 text-purple-700',
      webp: 'bg-cyan-100 text-cyan-700',
    };
    return colors[fileType] || 'bg-gray-100 text-gray-700';
  };

  const getStatusBadge = (status: string) => {
    return <StatusBadge status={status} />;
  };

  // ============================================================
  // FILTERED & STATISTICS
  // ============================================================
  const filteredUploads = studentUploads?.filter((upload: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (upload.students?.full_name?.toLowerCase() || '').includes(q) ||
           (upload.file_name?.toLowerCase() || '').includes(q);
  }) || [];

  const totalFiles = filteredUploads.length;
  const totalStudents = students?.length || 0;
  const studentsWithUploads = new Set(filteredUploads.map((u: any) => u.student_id)).size;
  const pendingCount = filteredUploads.filter((u: any) => u.status === 'pending' || !u.status).length;
  const approvedCount = filteredUploads.filter((u: any) => u.status === 'approved').length;
  const rejectedCount = filteredUploads.filter((u: any) => u.status === 'rejected').length;

  // ============================================================
  // AUTO-REFRESH SAAT TAB DIACTIVE
  // ============================================================
  useEffect(() => {
    if (activeTab === "uploads") {
      refetchUploads();
    }
  }, [activeTab]);

  // ============================================================
  // LOADING STATE
  // ============================================================
  if (homeroomLoading || studentsLoading || uploadsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-500">Memuat data...</span>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // CEK KONEKSI
  // ============================================================
  if (!isOnline) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <WifiOff className="h-16 w-16 text-gray-400 mb-4" />
          <h2 className="text-xl font-bold text-gray-700">Tidak Ada Koneksi Internet</h2>
          <p className="text-gray-400 mt-2 max-w-md">
            Silakan periksa koneksi internet Anda dan refresh halaman.
          </p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // CEK AKSES
  // ============================================================
  const allowedRoles = ['teacher', 'guru', 'admin', 'super_admin'];
  const isAuthorized = userRole && allowedRoles.includes(userRole.toLowerCase());

  if (!isAuthorized) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <UserCheck className="h-16 w-16 text-red-400 mb-4" />
          <h2 className="text-xl font-bold text-gray-700">Akses Ditolak</h2>
          <p className="text-gray-400 mt-2 max-w-md">Anda tidak memiliki izin untuk mengakses halaman ini.</p>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // ERROR STATE
  // ============================================================
  if (homeroomError || categoriesError || studentsError || uploadsError) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <AlertTriangle className="h-16 w-16 text-yellow-400 mb-4" />
          <h2 className="text-xl font-bold text-gray-700">Gagal Memuat Data</h2>
          <p className="text-gray-400 mt-2 max-w-md">
            Terjadi kesalahan saat memuat data. Silakan refresh halaman.
          </p>
          <div className="flex gap-3 mt-4">
            <Button onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh Halaman
            </Button>
          </div>
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-left text-xs text-gray-500 max-w-md w-full">
            <p><strong>Debug Info:</strong></p>
            <p>User ID: {user?.id || 'N/A'}</p>
            <p>Role: {userRole || 'N/A'}</p>
            <p>Selected Year: {selectedYear || 'N/A'}</p>
            <p>Selected Semester: {selectedSemester || 'N/A'}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!homeroomData?.teacher) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <UserCheck className="h-16 w-16 text-orange-400 mb-4" />
          <h2 className="text-xl font-bold text-gray-700">Data Guru Tidak Ditemukan</h2>
          <p className="text-gray-400 mt-2 max-w-md">Anda memiliki role guru, tetapi data guru tidak ditemukan di sistem.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!homeroomData?.teacher.is_homeroom_teacher) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <FolderOpen className="h-16 w-16 text-gray-300 mb-4" />
          <h2 className="text-xl font-bold text-gray-700">Anda Bukan Wali Kelas</h2>
          <p className="text-gray-400 mt-2 max-w-md">Anda tidak terdaftar sebagai wali kelas.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!homeroomData?.class) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <School className="h-16 w-16 text-gray-300 mb-4" />
          <h2 className="text-xl font-bold text-gray-700">Kelas Tidak Ditemukan</h2>
          <p className="text-gray-400 mt-2 max-w-md">
            Tidak ada kelas yang terhubung untuk tahun ajaran {selectedYear || 'yang dipilih'}.
          </p>
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-left text-xs text-gray-500 max-w-md w-full">
            <p><strong>Debug Info:</strong></p>
            <p>Teacher ID: {homeroomData?.teacher?.id || 'N/A'}</p>
            <p>Selected Year: {selectedYear || 'N/A'}</p>
            <p>Selected Semester: {selectedSemester || 'N/A'}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // RENDER UTAMA
  // ============================================================
  return (
    <DashboardLayout>
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        fileName={confirmDialog.fileName}
        studentName={confirmDialog.studentName}
        isLoading={isDeleting}
      />

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          setEditingCategory(null);
        }}
        onSave={handleSaveCategory}
        category={editingCategory}
        isLoading={savingCategory}
        classId={homeroomData.class?.id}
      />

      <div className="space-y-6 p-4">
        {/* ====== HEADER ====== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">📁 Manajemen Upload Siswa</h1>
            <p className="text-muted-foreground">
              Kelola dokumen yang harus diupload dan review berkas siswa untuk kelas {homeroomData.class?.name || '...'}
            </p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <p className="text-xs text-green-600 dark:text-green-400">
                ✅ Wali Kelas: {homeroomData.teacher?.profiles?.full_name || 'N/A'}
              </p>
              <Badge className="bg-green-100 text-green-700 text-[10px]">{homeroomData.class?.name}</Badge>
              <Badge className="bg-blue-100 text-blue-700 text-[10px]">📅 {homeroomData.class?.academic_year || 'N/A'}</Badge>
              {selectedSemester && (
                <Badge className="bg-purple-100 text-purple-700 text-[10px]">
                  Semester {selectedSemester}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={activeTab === "documents" ? "default" : "outline"}
              onClick={() => setActiveTab("documents")}
            >
              <ListChecks className="h-4 w-4 mr-2" />
              Dokumen ({categories?.length || 0})
            </Button>
            <Button
              variant={activeTab === "uploads" ? "default" : "outline"}
              onClick={() => setActiveTab("uploads")}
            >
              <Users className="h-4 w-4 mr-2" />
              Berkas Siswa ({studentUploads?.length || 0})
            </Button>
          </div>
        </div>

        {/* ====== TAB: DOKUMEN ====== */}
        {activeTab === "documents" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>📄 Dokumen yang Harus Diupload Siswa</CardTitle>
                <CardDescription>
                  Buat daftar dokumen yang harus diupload oleh siswa di kelas {homeroomData.class?.name}.
                </CardDescription>
              </div>
              <Button onClick={() => { setEditingCategory(null); setIsCategoryModalOpen(true); }}>
                <PlusCircle className="h-4 w-4 mr-2" />
                Tambah Dokumen
              </Button>
            </CardHeader>
            <CardContent>
              {categories && categories.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {categories.map((cat: any, index: number) => (
                    <div key={cat.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">#{index + 1}</span>
                            <h3 className="font-semibold text-gray-800 dark:text-gray-100">{cat.title}</h3>
                            {cat.is_required && (
                              <Badge className="bg-red-100 text-red-700 text-[10px]">Wajib</Badge>
                            )}
                          </div>
                          {cat.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{cat.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                              {cat.max_files} file
                            </Badge>
                            <Badge className="bg-green-100 text-green-700 text-[10px]">
                              {cat.max_file_size_mb} MB
                            </Badge>
                            <Badge className="bg-purple-100 text-purple-700 text-[10px]">
                              {cat.allowed_types?.join(', ').toUpperCase() || 'PDF, JPG'}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditingCategory(cat); setIsCategoryModalOpen(true); }}
                            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                            title="Edit dokumen"
                          >
                            <Edit2 className="h-4 w-4 text-gray-500" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30"
                            title="Hapus dokumen"
                            disabled={deletingCategory}
                          >
                            {deletingCategory ? (
                              <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-red-500" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <FolderPlus className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-base font-medium">Belum ada dokumen yang dibuat</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Klik tombol "Tambah Dokumen" untuk membuat daftar dokumen yang harus diupload siswa
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ====== TAB: UPLOADS ====== */}
        {activeTab === "uploads" && (
          <div className="space-y-4">
            {/* Filter Dokumen */}
            {categories && categories.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
                <Label className="text-sm font-medium">Filter Berdasarkan Dokumen</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      !selectedCategory
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Semua
                  </button>
                  {categories.map((cat: any) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                        selectedCategory === cat.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {cat.is_required && <span className="text-red-500">*</span>}
                      {cat.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white dark:bg-gray-900 rounded-xl p-3 shadow-lg border">
                <p className="text-xs text-gray-400">Total Berkas</p>
                <p className="text-2xl font-bold">{totalFiles}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl p-3 shadow-lg border">
                <p className="text-xs text-gray-400">Siswa Upload</p>
                <p className="text-2xl font-bold">{studentsWithUploads}/{totalStudents}</p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-xl p-3 shadow-lg border border-yellow-200">
                <p className="text-xs text-yellow-600">⏳ Menunggu</p>
                <p className="text-2xl font-bold text-yellow-700">{pendingCount}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-3 shadow-lg border border-green-200">
                <p className="text-xs text-green-600">✅ Disetujui</p>
                <p className="text-2xl font-bold text-green-700">{approvedCount}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3 shadow-lg border border-red-200">
                <p className="text-xs text-red-600">❌ Ditolak</p>
                <p className="text-2xl font-bold text-red-700">{rejectedCount}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Cari nama siswa atau file..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="shrink-0">
                  <Filter className="h-4 w-4 mr-2" /> Filter {showFilters ? '▲' : '▼'}
                </Button>
                <Button variant="outline" onClick={handleRefresh} className="shrink-0" disabled={uploadsLoading}>
                  <RefreshCw className={`h-4 w-4 ${uploadsLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              {showFilters && (
                <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium">Filter Siswa</label>
                    <select
                      value={selectedStudent}
                      onChange={(e) => setSelectedStudent(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-sm"
                    >
                      <option value="all">Semua Siswa</option>
                      {students?.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.full_name} ({s.nis})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium">Filter Jenis File</label>
                    <select
                      value={selectedFileType}
                      onChange={(e) => setSelectedFileType(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-sm"
                    >
                      <option value="all">Semua Jenis</option>
                      <option value="pdf">PDF</option><option value="jpg">JPG</option>
                      <option value="jpeg">JPEG</option><option value="png">PNG</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium">Filter Status</label>
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-sm"
                    >
                      <option value="all">Semua Status</option>
                      <option value="pending">⏳ Menunggu</option>
                      <option value="approved">✅ Disetujui</option>
                      <option value="rejected">❌ Ditolak</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* File List */}
            <Card>
              <CardHeader>
                <CardTitle>Berkas Siswa</CardTitle>
                <CardDescription>
                  {filteredUploads.length > 0 && `Menampilkan ${filteredUploads.length} berkas.`}
                  {selectedCategory && categories?.find((c: any) => c.id === selectedCategory) && (
                    <Badge className="ml-2 bg-blue-100 text-blue-700">
                      📄 {categories.find((c: any) => c.id === selectedCategory)?.title}
                    </Badge>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {filteredUploads.length > 0 ? (
                  filteredUploads.map((file: any) => {
                    const statusInfo = getStatusBadge(file.status || 'pending');
                    return (
                      <div key={file.id} className="flex flex-col gap-3 p-4 rounded-xl border hover:shadow-lg transition-shadow">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                              {getFileIcon(file.file_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">{file.file_name}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge className={`text-[10px] ${getFileTypeBadge(file.file_type)}`}>
                                  {file.file_type?.toUpperCase() || 'FILE'}
                                </Badge>
                                {file.file_size && (
                                  <Badge className="bg-gray-100 text-gray-700 text-[10px]">
                                    {formatFileSize(file.file_size)}
                                  </Badge>
                                )}
                                <StatusBadge status={file.status || 'pending'} />
                                {file.upload_categories && (
                                  <Badge className="bg-purple-100 text-purple-700 text-[10px]">
                                    📄 {file.upload_categories.title}
                                    {file.upload_categories.is_required && (
                                      <span className="text-red-500 ml-1">*</span>
                                    )}
                                  </Badge>
                                )}
                                <span className="text-xs text-gray-400">👤 {file.students?.full_name || 'Unknown'}</span>
                                <span className="text-xs text-gray-400">
                                  📅 {file.created_at ? format(new Date(file.created_at), 'dd MMM yyyy', { locale: localeId }) : '-'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            <button onClick={() => window.open(file.file_url, '_blank')} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                              <Eye className="h-4 w-4 text-gray-600" />
                            </button>
                            <button onClick={() => handleDownload(file.file_url, file.file_name)} className="w-8 h-8 rounded-lg bg-green-100 hover:bg-green-200 flex items-center justify-center">
                              <Download className="h-4 w-4 text-green-600" />
                            </button>
                            {file.status !== 'approved' && (
                              <button onClick={() => handleApproveFile(file.id)} className="w-8 h-8 rounded-lg bg-green-100 hover:bg-green-200 flex items-center justify-center">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </button>
                            )}
                            {file.status !== 'rejected' && (
                              <button onClick={() => handleRejectFile(file.id)} className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 flex items-center justify-center">
                                <XCircle className="h-4 w-4 text-red-600" />
                              </button>
                            )}
                            {file.status && file.status !== 'pending' && (
                              <button onClick={() => handleResetStatus(file.id)} className="w-8 h-8 rounded-lg bg-yellow-100 hover:bg-yellow-200 flex items-center justify-center">
                                <RefreshCw className="h-4 w-4 text-yellow-600" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteClick(file.id, file.file_name, file.students?.full_name || 'Unknown', file.file_url)}
                              className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 flex items-center justify-center"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </button>
                          </div>
                        </div>
                        <div className="border rounded-lg overflow-hidden bg-gray-50">
                          {file.file_type === 'pdf' ? (
                            <iframe src={file.file_url} className="w-full h-48" />
                          ) : (
                            <img src={file.file_url} alt={file.file_name} className="w-full max-h-48 object-contain" />
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-16 text-gray-400">
                    <Upload className="h-16 w-16 mx-auto mb-3 text-gray-300" />
                    <p className="text-base font-medium">Belum ada file yang diupload siswa</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {selectedCategory && categories?.find((c: any) => c.id === selectedCategory) ? (
                        `Belum ada siswa yang mengupload dokumen "${categories.find((c: any) => c.id === selectedCategory)?.title}"`
                      ) : (
                        'Siswa akan mengupload berkas melalui halaman student dashboard'
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}