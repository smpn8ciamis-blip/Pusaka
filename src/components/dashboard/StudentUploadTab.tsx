// src/components/dashboard/StudentUploadTab.tsx

import React, { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  Eye,
  Trash2,
  Loader2,
  AlertCircle,
  Info,
  RefreshCw,
  Image,
  File,
  AlertTriangle,
  X,
  CheckCircle,
  ListChecks,
  FolderOpen,
  Clock,
  CheckCircle2,
  XCircle,
  Shield,
  ShieldCheck,
  ShieldAlert
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

interface StudentUploadTabProps {
  studentAccount: any;
  user?: any;
}

// ========== KOMPONEN STATUS BADGE ==========
const StatusBadge = ({ status }: { status: string }) => {
  const statusMap: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    pending: {
      label: '⏳ Menunggu',
      icon: <Clock className="h-3 w-3" />,
      className: 'bg-yellow-100 text-yellow-700 border-yellow-200'
    },
    approved: {
      label: '✅ Diterima',
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

// ========== KOMPONEN KONFIRMASI HAPUS ==========
const ConfirmDialog = ({ isOpen, onClose, onConfirm, fileName, isLoading }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Hapus Berkas?</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Anda yakin ingin menghapus berkas:</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4 break-all">"{fileName}"</p>
          <p className="text-xs text-gray-400 mb-6">Tindakan ini tidak dapat dibatalkan.</p>
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

// ========== KOMPONEN UTAMA ==========
export const StudentUploadTab: React.FC<StudentUploadTabProps> = ({ studentAccount, user }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ========== STATE ==========
  const [uploadSettings, setUploadSettings] = useState({
    allowed_types: ['pdf', 'jpg', 'jpeg', 'png'],
    max_files: 5,
    max_file_size: 10 * 1024 * 1024
  });
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [fileSecurityCheck, setFileSecurityCheck] = useState<{ passed: boolean; message: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // ========== KONFIRMASI HAPUS ==========
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, fileId: '', fileName: '', fileUrl: '' });
  const [isDeleting, setIsDeleting] = useState(false);

  // ============================================================
  // QUERY 1: Upload Settings (legacy)
  // ============================================================
  const { data: uploadSettingsData } = useQuery({
    queryKey: ['upload-settings', studentAccount?.students?.class_id],
    queryFn: async () => {
      if (!studentAccount?.students?.class_id) return null;
      const { data, error } = await supabase
        .from('upload_settings')
        .select('*')
        .eq('class_id', studentAccount.students.class_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!studentAccount?.students?.class_id
  });

  // ============================================================
  // QUERY 2: KATEGORI
  // ============================================================
  const { data: categories, isLoading: categoriesLoading, error: categoriesError } = useQuery({
    queryKey: ['upload-categories-student', studentAccount?.students?.class_id],
    queryFn: async () => {
      if (!studentAccount?.students?.class_id) {
        console.log("ℹ️ No class_id found");
        return [];
      }
      
      console.log("🔍 [CATEGORIES] Fetching for class:", studentAccount.students.class_id);
      
      const { data, error } = await supabase
        .from('upload_categories')
        .select('*')
        .eq('class_id', studentAccount.students.class_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (error) {
        console.error("❌ [CATEGORIES] Error:", error);
        return [];
      }
      
      console.log("✅ [CATEGORIES] Found:", data?.length);
      return data || [];
    },
    enabled: !!studentAccount?.students?.class_id,
    staleTime: 5 * 60 * 1000
  });

  // ============================================================
  // QUERY 3: AMBIL NAMA KELAS DARI TABEL CLASSES (TERPISAH)
  // ============================================================
  const { data: classData, isLoading: classLoading } = useQuery({
    queryKey: ['student-class-name', studentAccount?.students?.class_id],
    queryFn: async () => {
      const classId = studentAccount?.students?.class_id;
      if (!classId) {
        console.log("ℹ️ No class_id found for class name query");
        return null;
      }
      
      console.log("🔍 [CLASS] Fetching class name for class_id:", classId);
      
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, grade, academic_year')
        .eq('id', classId)
        .maybeSingle();
      
      if (error) {
        console.error("❌ [CLASS] Error fetching class:", error);
        return null;
      }
      
      console.log("✅ [CLASS] Class found:", data?.name);
      return data;
    },
    enabled: !!studentAccount?.students?.class_id,
    staleTime: 5 * 60 * 1000
  });

  // ============================================================
  // QUERY 4: STUDENT UPLOADS
  // ============================================================
  const { data: uploadsRaw, refetch: refetchUploads, isLoading: uploadsLoading } = useQuery({
    queryKey: ['student-uploads-raw-final', studentAccount?.student_id],
    queryFn: async () => {
      if (!studentAccount?.student_id) {
        console.log("ℹ️ No student_id found");
        return [];
      }
      
      console.log("🔍 [UPLOADS] Fetching for student:", studentAccount.student_id);
      
      const { data, error } = await supabase
        .from('student_uploads')
        .select('*')
        .eq('student_id', studentAccount.student_id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error("❌ [UPLOADS] Error:", error);
        return [];
      }
      
      console.log("✅ [UPLOADS] Found:", data?.length);
      return data || [];
    },
    enabled: !!studentAccount?.student_id,
    staleTime: 0
  });

  // ============================================================
  // GABUNGKAN: Uploads + Category Info
  // ============================================================
  const studentUploads = React.useMemo(() => {
    if (!uploadsRaw) return [];
    if (!categories || categories.length === 0) return uploadsRaw;
    
    const categoryMap: Record<string, any> = {};
    categories.forEach(cat => {
      categoryMap[cat.id] = cat;
    });
    
    return uploadsRaw.map((upload: any) => {
      const category = upload.category_id ? categoryMap[upload.category_id] : null;
      return {
        ...upload,
        upload_categories: category
      };
    });
  }, [uploadsRaw, categories]);

  // ========== EFFECTS ==========
  useEffect(() => {
    if (uploadSettingsData) {
      setUploadSettings({
        allowed_types: uploadSettingsData.allowed_types || ['pdf', 'jpg', 'jpeg', 'png'],
        max_files: uploadSettingsData.max_files || 5,
        max_file_size: uploadSettingsData.max_file_size || 10 * 1024 * 1024
      });
    }
  }, [uploadSettingsData]);

  useEffect(() => {
    if (studentUploads) {
      setUploadedFiles(studentUploads);
    }
  }, [studentUploads]);

  // ========== HELPERS ==========
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === 'pdf') return <FileText className="h-6 w-6 text-red-500" />;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType)) {
      return <Image className="h-6 w-6 text-blue-500" />;
    }
    return <File className="h-6 w-6 text-gray-500" />;
  };

  // ========== CEK UPLOAD PER KATEGORI ==========
  const hasUploadedForCategory = (categoryId: string) => {
    return uploadedFiles.some(f => f.category_id === categoryId);
  };

  const getFileForCategory = (categoryId: string) => {
    return uploadedFiles.find(f => f.category_id === categoryId);
  };

  // ============================================================
  // KEAMANAN: VALIDASI FILE (CLIENT-SIDE)
  // ============================================================
  
  // 1. Validasi Ekstensi
  const validateExtension = (file: File): { valid: boolean; error?: string } => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext) {
      return { valid: false, error: 'File tidak memiliki ekstensi' };
    }
    if (!uploadSettings.allowed_types.includes(ext)) {
      return { 
        valid: false, 
        error: `Ekstensi .${ext} tidak diizinkan. Hanya: ${uploadSettings.allowed_types.join(', ')}` 
      };
    }
    return { valid: true };
  };

  // 2. Validasi Ukuran
  const validateSize = (file: File): { valid: boolean; error?: string } => {
    if (file.size > uploadSettings.max_file_size) {
      return { 
        valid: false, 
        error: `Ukuran file terlalu besar (${formatFileSize(file.size)}). Maksimal ${formatFileSize(uploadSettings.max_file_size)}` 
      };
    }
    return { valid: true };
  };

  // 3. Validasi MIME Type (Magic Number)
  const validateMimeType = async (file: File): Promise<{ valid: boolean; error?: string }> => {
    // Jika bukan gambar/PDF, skip magic number check (tapi sudah dicek ekstensi)
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
      return { valid: true };
    }

    try {
      // Baca 4 byte pertama untuk magic number
      const buffer = await file.slice(0, 4).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      // Magic number untuk berbagai format
      const isPDF = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      const isJPEG = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
      const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
      const isGIF = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;
      const isWebP = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
      
      const validMime = isPDF || isJPEG || isPNG || isGIF || isWebP;
      
      if (!validMime) {
        return { 
          valid: false, 
          error: `File tidak valid (format tidak dikenali). Detected: ${Array.from(bytes).map(b => b.toString(16)).join(' ')}` 
        };
      }
      
      return { valid: true };
    } catch (error) {
      console.error('Error validating mime type:', error);
      return { valid: true }; // Skip jika gagal baca magic number
    }
  };

  // 4. Cek Nama File Berbahaya
  const validateFileName = (file: File): { valid: boolean; error?: string } => {
    const dangerousExtensions = ['.php', '.exe', '.sh', '.bat', '.cmd', '.js', '.html', '.htm', '.asp', '.aspx', '.jsp'];
    const fileName = file.name.toLowerCase();
    
    for (const ext of dangerousExtensions) {
      if (fileName.includes(ext)) {
        return { 
          valid: false, 
          error: `Nama file mengandung ekstensi berbahaya: ${ext}` 
        };
      }
    }
    
    // Cek karakter berbahaya
    const dangerousChars = /[<>{}|\\^`]/;
    if (dangerousChars.test(fileName)) {
      return { 
        valid: false, 
        error: 'Nama file mengandung karakter yang tidak diizinkan' 
      };
    }
    
    return { valid: true };
  };

  // 5. Validasi Lengkap
  const validateFile = async (file: File): Promise<{ valid: boolean; error?: string }> => {
    // Ekstensi
    const extCheck = validateExtension(file);
    if (!extCheck.valid) return extCheck;
    
    // Ukuran
    const sizeCheck = validateSize(file);
    if (!sizeCheck.valid) return sizeCheck;
    
    // Nama file berbahaya
    const nameCheck = validateFileName(file);
    if (!nameCheck.valid) return nameCheck;
    
    // MIME type (Magic Number) - hanya untuk gambar dan PDF
    const mimeCheck = await validateMimeType(file);
    if (!mimeCheck.valid) return mimeCheck;
    
    return { valid: true };
  };

  // ============================================================
  // GENERATE FILE NAME: KATEGORI_NAMA_KELAS_TIMESTAMP_UNIK.ext
  // ============================================================
  const generateFileName = (categoryTitle: string, originalFile: File): string => {
    // Ambil nama siswa
    const studentName = studentAccount?.students?.full_name || 'Siswa';
    const nameParts = studentName.toUpperCase().split(' ').filter(s => s.length > 0);
    let cleanName = nameParts.slice(0, 3).join('_').replace(/[^A-Z0-9_]/g, '');
    if (cleanName.length > 30) {
      cleanName = cleanName.substring(0, 30);
    }

    // Ambil nama kelas dari classData
    let className = classData?.name || '';
    
    if (!className || className.length === 0) {
      className = 
        studentAccount?.students?.class?.name || 
        studentAccount?.class_name || 
        studentAccount?.students?.class_name || 
        '';
    }
    
    if (!className || className.length === 0 || className.includes('-')) {
      const classId = studentAccount?.students?.class_id || '';
      if (classId && classId.length > 0) {
        className = 'KLS' + classId.substring(0, 6).toUpperCase();
      } else {
        className = 'KELAS';
      }
    }

    let cleanClass = className
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    if (cleanClass.length > 20) {
      const shortMatch = cleanClass.match(/^[A-Z0-9]{1,3}[A-Z]?/);
      if (shortMatch) {
        cleanClass = shortMatch[0];
      }
    }

    // Bersihkan kategori
    const cleanCategory = categoryTitle
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    // Ekstensi
    const ext = originalFile.name.split('.').pop() || '';

    // Timestamp & Unique ID
    const now = new Date();
    const timestamp = format(now, 'yyyyMMdd_HHmmss');
    const uniqueId = Math.floor(100000 + Math.random() * 900000).toString();

    // Format: KATEGORI_NAMA_KELAS_TIMESTAMP_UNIK.ext
    const newFileName = `${cleanCategory}_${cleanName}_${cleanClass}_${timestamp}_${uniqueId}.${ext}`;

    console.log("📝 Generated filename:", {
      original: originalFile.name,
      new: newFileName,
      category: cleanCategory,
      name: cleanName,
      class: cleanClass,
      classSource: className,
      timestamp,
      uniqueId
    });

    return newFileName;
  };

  // ========== COMPRESS GAMBAR ==========
  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        resolve(file);
        return;
      }
      if (file.size < 500 * 1024) {
        resolve(file);
        return;
      }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          let width = img.width;
          let height = img.height;
          const MAX_DIMENSION = 1920;
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = (height / width) * MAX_DIMENSION;
              width = MAX_DIMENSION;
            } else {
              width = (width / height) * MAX_DIMENSION;
              height = MAX_DIMENSION;
            }
          }
          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Gagal compress gambar'));
              return;
            }
            const compressedFile = new File([blob], file.name, { type: file.type, lastModified: Date.now() });
            console.log(`📦 Compress: ${formatFileSize(file.size)} → ${formatFileSize(compressedFile.size)}`);
            resolve(compressedFile);
          }, file.type, 0.92);
        };
        img.onerror = () => reject(new Error('Gagal memuat gambar untuk compress'));
      };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
    });
  };

  // ========== HANDLER UPLOAD ==========
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.warn("No file selected");
      return;
    }

    setFileSecurityCheck(null);
    setSelectedFile(file);

    // ============================================================
    // 🔒 VALIDASI KEAMANAN SEBELUM UPLOAD
    // ============================================================
    const securityResult = await validateFile(file);
    
    if (!securityResult.valid) {
      setFileSecurityCheck({ 
        passed: false, 
        message: securityResult.error || 'File tidak valid' 
      });
      toast({ 
        variant: 'destructive', 
        title: '🔒 Keamanan: File Ditolak', 
        description: securityResult.error 
      });
      e.target.value = '';
      return;
    }

    setFileSecurityCheck({ passed: true, message: '✅ File aman' });

    console.group("📤 UPLOAD DEBUG");
    console.log("File:", file.name, file.size);
    console.log("Security Check: PASSED");
    console.log("selectedCategoryId:", selectedCategoryId);
    console.groupEnd();

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (!fileExt || !uploadSettings.allowed_types.includes(fileExt)) {
      toast({ variant: 'destructive', title: '❌ Ekstensi Tidak Valid', description: `Hanya file ${uploadSettings.allowed_types.join(', ')} yang diizinkan.` });
      e.target.value = '';
      return;
    }

    if (file.size > uploadSettings.max_file_size) {
      toast({ variant: 'destructive', title: '❌ File Terlalu Besar', description: `Maksimal ${uploadSettings.max_file_size / (1024 * 1024)}MB.` });
      e.target.value = '';
      return;
    }

    if (!selectedCategoryId) {
      toast({ variant: 'destructive', title: '❌ Pilih Dokumen', description: 'Silakan pilih dokumen yang akan diupload terlebih dahulu.' });
      e.target.value = '';
      return;
    }

    if (hasUploadedForCategory(selectedCategoryId)) {
      toast({ variant: 'destructive', title: '❌ Sudah Upload', description: 'Anda sudah mengupload untuk dokumen ini.' });
      e.target.value = '';
      return;
    }

    if (uploadedFiles.length >= uploadSettings.max_files) {
      toast({ variant: 'destructive', title: '❌ Batas File Tercapai', description: `Anda hanya bisa mengupload maksimal ${uploadSettings.max_files} berkas.` });
      e.target.value = '';
      return;
    }

    if (!studentAccount?.student_id) {
      toast({ variant: 'destructive', title: '❌ Error', description: 'Student ID tidak ditemukan. Silakan logout dan login kembali.' });
      e.target.value = '';
      return;
    }

    setUploadLoading(true);
    setUploadProgress(10);
    
    try {
      let fileToUpload = file;
      if (file.type.startsWith('image/')) {
        console.log("🔄 Compressing image...");
        setUploadProgress(20);
        fileToUpload = await compressImage(file);
      }

      setUploadProgress(30);
      
      // Generate file name
      const category = categories?.find(c => c.id === selectedCategoryId);
      const newFileName = generateFileName(category?.title || 'DOKUMEN', file);
      
      console.log("📝 Uploading as:", newFileName);
      
      const { error: uploadError } = await supabase.storage
        .from('student-uploads')
        .upload(newFileName, fileToUpload, { 
          cacheControl: '3600', 
          upsert: false 
        });

      if (uploadError) {
        console.error("❌ Storage error:", uploadError);
        toast({ variant: 'destructive', title: '❌ Gagal Upload ke Storage', description: uploadError.message });
        throw uploadError;
      }
      
      setUploadProgress(70);
      
      const { data: urlData } = supabase.storage
        .from('student-uploads')
        .getPublicUrl(newFileName);
      
      setUploadProgress(85);
      
      // Insert ke database
      const insertData = {
        student_id: studentAccount.student_id,
        class_id: studentAccount.students?.class_id,
        category_id: selectedCategoryId,
        file_name: newFileName,
        file_type: fileExt,
        file_url: urlData.publicUrl,
        file_size: fileToUpload.size,
        status: 'pending'
      };
      
      console.log("📄 Insert data:", insertData);

      const { data: insertedData, error: dbError } = await supabase
        .from('student_uploads')
        .insert(insertData)
        .select();

      if (dbError) {
        console.error("❌ Database error:", dbError);
        await supabase.storage.from('student-uploads').remove([newFileName]);
        toast({ variant: 'destructive', title: '❌ Gagal Simpan', description: dbError.message });
        throw dbError;
      }

      console.log("✅ Insert success:", insertedData);
      setUploadProgress(100);

      const compressInfo = fileToUpload.size < file.size 
        ? ` (${formatFileSize(file.size)} → ${formatFileSize(fileToUpload.size)})` 
        : '';
      
      toast({ 
        title: '✅ Berhasil!', 
        description: `Berkas "${newFileName}" berhasil diupload!${compressInfo}` 
      });

      setFileSecurityCheck(null);
      setSelectedFile(null);
      await refetchUploads();
      setSelectedCategoryId(null);

    } catch (err) {
      console.error("❌ Upload error:", err);
    } finally {
      setUploadLoading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  // ========== HANDLER HAPUS ==========
  const handleDeleteClick = (id: string, fileName: string, fileUrl: string) => {
    setConfirmDialog({ isOpen: true, fileId: id, fileName, fileUrl });
  };

  const handleConfirmDelete = async () => {
    const { fileId, fileName, fileUrl } = confirmDialog;
    setIsDeleting(true);

    try {
      const storedFileName = fileUrl.split('/').pop();
      if (storedFileName) {
        await supabase.storage.from('student-uploads').remove([storedFileName]);
      }
      const { error } = await supabase.from('student_uploads').delete().eq('id', fileId);
      if (error) throw error;
      toast({ title: '✅ Berhasil', description: `Berkas "${fileName}" berhasil dihapus.` });
      await refetchUploads();
      setConfirmDialog({ isOpen: false, fileId: '', fileName: '', fileUrl: '' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: '❌ Gagal Hapus', description: err.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDialog({ isOpen: false, fileId: '', fileName: '', fileUrl: '' });
  };

  const handleRefresh = () => {
    refetchUploads();
    toast({ title: '🔄 Refresh', description: 'Data berhasil diperbarui.' });
  };

  // ============================================================
  // RENDER
  // ============================================================
  const isLoading = categoriesLoading || uploadsLoading || classLoading;
  const className = classData?.name || 'Memuat...';

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        fileName={confirmDialog.fileName}
        isLoading={isDeleting}
      />

      {/* ====== DEBUG PANEL ====== */}
      <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-xl overflow-hidden">
        <button onClick={() => setDebugOpen(!debugOpen)} className="w-full flex items-center justify-between p-3 text-left hover:bg-yellow-100">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-700">🔍 Debug Panel</span>
            <Badge className="bg-yellow-200 text-yellow-800 text-[10px]">{debugOpen ? 'Sembunyikan' : 'Tampilkan'}</Badge>
          </div>
          <span className="text-yellow-600">{debugOpen ? '▲' : '▼'}</span>
        </button>
        
        {debugOpen && (
          <div className="p-4 border-t border-yellow-200 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white dark:bg-gray-900 p-2 rounded">
                <span className="text-gray-500">Student ID:</span>
                <p className="font-mono font-bold truncate text-green-600">{studentAccount?.student_id || '❌ NULL'}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 p-2 rounded">
                <span className="text-gray-500">Class ID:</span>
                <p className="font-mono font-bold truncate text-purple-600">{studentAccount?.students?.class_id || '❌ NULL'}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 p-2 rounded col-span-2">
                <span className="text-gray-500">Class Name (from classes table):</span>
                <p className="font-mono font-bold truncate text-blue-600">
                  {classLoading ? 'Loading...' : (classData?.name || '❌ NOT FOUND')}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-900 p-2 rounded col-span-2">
                <span className="text-gray-500">Categories:</span>
                <p className="font-mono text-xs">
                  {categoriesLoading ? 'Loading...' : 
                   categories && categories.length > 0 ? 
                   `✅ ${categories.length} found: ${categories.map(c => c.title).join(', ')}` : 
                   '❌ No categories found'}
                </p>
                {categoriesError && (
                  <p className="text-red-500">❌ Error: {categoriesError.message}</p>
                )}
              </div>
              <div className="bg-white dark:bg-gray-900 p-2 rounded col-span-2">
                <span className="text-gray-500">Uploads:</span>
                <p className="font-mono text-xs">
                  {uploadsLoading ? 'Loading...' : 
                   uploadsRaw && uploadsRaw.length > 0 ? 
                   `✅ ${uploadsRaw.length} uploads found` : 
                   '❌ No uploads'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* ====== DAFTAR DOKUMEN + UPLOAD AREA ====== */}
      {/* ============================================================ */}
      {categoriesLoading ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border">
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">Memuat daftar dokumen...</span>
          </div>
        </div>
      ) : categories && categories.length > 0 ? (
        <div className="space-y-4">
          {/* DAFTAR DOKUMEN */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <ListChecks className="h-5 w-5 text-blue-500" />
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">📋 Dokumen yang Harus Diupload</h3>
              <Badge className="bg-blue-100 text-blue-700">{categories.length} dokumen</Badge>
            </div>
            
            <div className="space-y-2">
              {categories.map((cat: any) => {
                const isUploaded = hasUploadedForCategory(cat.id);
                const uploadedFile = getFileForCategory(cat.id);
                const isSelected = selectedCategoryId === cat.id;
                
                return (
                  <div
                    key={cat.id}
                    onClick={() => {
                      if (!isUploaded) {
                        setSelectedCategoryId(isSelected ? null : cat.id);
                      }
                    }}
                    className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
                      isUploaded
                        ? 'border-green-300 bg-green-50 dark:bg-green-950/20'
                        : isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isUploaded ? 'bg-green-100 text-green-600' :
                          isSelected ? 'bg-blue-100 text-blue-600' :
                          'bg-gray-100 text-gray-400'
                        }`}>
                          {isUploaded ? <CheckCircle className="h-4 w-4" /> :
                           isSelected ? <FolderOpen className="h-4 w-4" /> :
                           <FileText className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                            {cat.title}
                            {cat.is_required && <span className="ml-1 text-red-500 text-xs">*</span>}
                          </p>
                          {cat.description && <p className="text-xs text-gray-500 truncate">{cat.description}</p>}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge className="bg-gray-100 text-gray-600 text-[10px]">{cat.max_files} file</Badge>
                            <Badge className="bg-gray-100 text-gray-600 text-[10px]">{cat.max_file_size_mb} MB</Badge>
                            <Badge className="bg-gray-100 text-gray-600 text-[10px]">{cat.allowed_types?.join(', ').toUpperCase() || 'PDF, JPG'}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 ml-2">
                        {isUploaded && uploadedFile ? (
                          <StatusBadge status={uploadedFile.status || 'pending'} />
                        ) : isSelected ? (
                          <Badge className="bg-blue-100 text-blue-700">📤 Dipilih</Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-500">Pilih</Badge>
                        )}
                      </div>
                    </div>
                    
                    {isUploaded && uploadedFile && (
                      <div className="mt-2 ml-11 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <FileText className="h-3 w-3" />
                          <span className="truncate font-mono">{uploadedFile.file_name}</span>
                          <span className="text-gray-400">•</span>
                          <span>{uploadedFile.file_size ? formatFileSize(uploadedFile.file_size) : 'Unknown'}</span>
                          <span className="text-gray-400">•</span>
                          <span>{uploadedFile.created_at ? format(new Date(uploadedFile.created_at), 'dd MMM yyyy', { locale: localeId }) : '-'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {selectedCategoryId && (
              <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                📤 Dokumen terpilih: {categories.find(c => c.id === selectedCategoryId)?.title}
              </div>
            )}
          </div>

          {/* ====== UPLOAD AREA ====== */}
          {selectedCategoryId && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-blue-200 dark:border-blue-800 animate-in fade-in slide-in-from-top-5 duration-300">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold">📤 Upload Berkas</h2>
                  <p className="text-sm text-gray-500">Jenis berkas: {uploadSettings.allowed_types.join(', ')} • Maksimal {uploadSettings.max_files} berkas • {uploadSettings.max_file_size / (1024 * 1024)} MB</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">⚡ Gambar akan dikompres otomatis (tanpa mengurangi kualitas)</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    📝 Nama file: <span className="font-mono font-bold">KATEGORI_NAMA_KELAS_TANGGAL_JAM_UNIK.ext</span>
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                    📋 Kelas: <span className="font-semibold">{classData?.name || 'Memuat...'}</span>
                  </p>
                  {/* 🔒 Security Info */}
                  <div className="flex items-center gap-2 mt-2">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    <p className="text-xs text-green-600 dark:text-green-400">
                      🔒 File divalidasi: Ekstensi, Ukuran, MIME Type, Nama File
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-100 text-blue-700">{uploadedFiles.length}/{uploadSettings.max_files}</Badge>
                  <button onClick={handleRefresh} className="p-2 rounded-lg hover:bg-gray-100"><RefreshCw className="h-4 w-4 text-gray-500" /></button>
                </div>
              </div>

              {/* 🔒 Security Check Result */}
              {fileSecurityCheck && (
                <div className={`mb-3 p-3 rounded-lg flex items-center gap-2 ${
                  fileSecurityCheck.passed 
                    ? 'bg-green-50 border border-green-200 text-green-700' 
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {fileSecurityCheck.passed ? (
                    <ShieldCheck className="h-5 w-5" />
                  ) : (
                    <ShieldAlert className="h-5 w-5" />
                  )}
                  <span className="text-sm">{fileSecurityCheck.message}</span>
                </div>
              )}

              <label className={`relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                uploadedFiles.length >= uploadSettings.max_files || uploadLoading
                  ? 'border-gray-300 bg-gray-50 cursor-not-allowed opacity-60'
                  : 'border-gray-300 hover:bg-gray-50 hover:border-blue-400'
              }`}>
                <div className="flex flex-col items-center gap-2">
                  {uploadLoading ? (
                    <>
                      <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                      <span className="text-sm text-blue-500 font-medium">Mengupload... {uploadProgress}%</span>
                      <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-gray-400" />
                      <span className="text-sm text-gray-500 font-medium">Klik untuk pilih file</span>
                      <span className="text-xs text-gray-400">{uploadSettings.allowed_types.map(t => `.${t}`).join(', ')} • Max {formatFileSize(uploadSettings.max_file_size)}</span>
                      <span className="text-xs text-green-500">🔄 Gambar otomatis dikompres</span>
                      <span className="text-xs text-blue-500">📝 Nama file akan diganti otomatis</span>
                      <span className="text-xs text-green-600">🔒 File akan divalidasi keamanan</span>
                    </>
                  )}
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  accept={uploadSettings.allowed_types.map(t => `.${t}`).join(',')} 
                  onChange={handleFileUpload}
                  disabled={uploadLoading || uploadedFiles.length >= uploadSettings.max_files}
                  multiple={false}
                />
              </label>
              
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 text-center">
                📤 Upload untuk: <span className="font-semibold">{categories.find(c => c.id === selectedCategoryId)?.title}</span>
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">📋 Belum Ada Dokumen yang Ditentukan</p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Wali kelas Anda belum menentukan dokumen yang harus diupload.</p>
            </div>
          </div>
        </div>
      )}

      {/* ====== FILE LIST ====== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">📁 Berkas Terupload ({uploadedFiles.length})</h3>
          {uploadsLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>

        {uploadedFiles.length > 0 ? (
          uploadedFiles.map((file: any) => (
            <div key={file.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800 hover:shadow-xl transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
                    {getFileIcon(file.file_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate font-mono">
                      {file.file_name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className="bg-gray-100 text-gray-700 text-[10px]">{file.file_type?.toUpperCase() || 'FILE'}</Badge>
                      {file.file_size && <Badge className="bg-green-100 text-green-700 text-[10px]">{formatFileSize(file.file_size)}</Badge>}
                      {file.upload_categories && <Badge className="bg-purple-100 text-purple-700 text-[10px]">📄 {file.upload_categories.title}</Badge>}
                      <StatusBadge status={file.status || 'pending'} />
                      <span className="text-xs text-gray-400">{file.created_at ? format(new Date(file.created_at), 'dd MMM yyyy HH:mm', { locale: localeId }) : '-'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => window.open(file.file_url, '_blank')} className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                    <Eye className="h-4 w-4 text-gray-600" />
                  </button>
                  {file.status === 'pending' && (
                    <button onClick={() => handleDeleteClick(file.id, file.file_name, file.file_url)} className="w-9 h-9 rounded-lg bg-red-100 hover:bg-red-200 flex items-center justify-center">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800/50">
                {file.file_type === 'pdf' ? (
                  <iframe src={file.file_url} className="w-full h-64" title={`Preview ${file.file_name}`} />
                ) : (
                  <img src={file.file_url} alt={file.file_name} className="w-full max-h-64 object-contain" />
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-16 text-gray-400 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
            <Upload className="h-16 w-16 mx-auto mb-3 text-gray-300" />
            <p className="text-base font-medium">Belum ada berkas diupload</p>
            <p className="text-sm text-gray-400 mt-1">Pilih dokumen dari daftar di atas, lalu upload file</p>
          </div>
        )}
      </div>

      {/* ====== INFORMASI ====== */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">💡 Informasi Upload:</p>
            <ul className="text-xs text-blue-600 dark:text-blue-400 mt-1 space-y-1 list-disc list-inside">
              <li>Pilih dokumen yang akan diupload dari daftar di atas</li>
              <li>Nama file otomatis: <span className="font-mono font-semibold">KATEGORI_NAMA_KELAS_TANGGAL_JAM_UNIK.ext</span></li>
              <li>Nama kelas diambil dari tabel <span className="font-mono">classes</span> (field <span className="font-mono">name</span>)</li>
              <li>Setelah upload, file akan berstatus <span className="font-semibold">⏳ Menunggu</span></li>
              <li>Wali kelas akan memeriksa dan mengubah status menjadi <span className="font-semibold text-green-600">✅ Diterima</span> atau <span className="font-semibold text-red-600">❌ Ditolak</span></li>
              <li>File yang sudah <span className="font-semibold">Diterima</span> atau <span className="font-semibold">Ditolak</span> tidak bisa dihapus oleh siswa</li>
              <li className="text-green-600 font-semibold">🔒 File divalidasi: Ekstensi, Ukuran, MIME Type (Magic Number), Nama File</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentUploadTab;