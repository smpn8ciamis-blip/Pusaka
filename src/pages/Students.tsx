import React, { useState, useEffect, Fragment } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Trash2, Pencil, ArrowUpDown, ChevronLeft, ChevronRight, Users, Download, FileSpreadsheet, Filter, X, CreditCard, Printer, FileDown, Loader2, User, School, Hash, GraduationCap, CalendarDays, MapPin, Settings2, LayoutTemplate, Save, RotateCcw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { ImportStudents } from '@/components/ImportStudents';
import { ClassPromotionDialog } from '@/components/ClassPromotionDialog';
import { GraduateStudentsDialog } from '@/components/GraduateStudentsDialog';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { HighlightText } from '@/components/HighlightText';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import CryptoJS from 'crypto-js';
import JsBarcode from 'jsbarcode';

const QR_VERIFY_BASE_URL = `${window.location.origin}/verify-student`;
const CARD_SECRET = 'PUSAKA-SMPN8-CIAMIS-2026';
const CARD_ENGINE = 'Card Engine v12';
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';
const ALL = 'all';

const studentSchema = z.object({
  nis: z.string().trim().min(1, 'NIS harus diisi'),
  nisn: z.string().trim().optional(),
  fullName: z.string().trim().min(3, 'Nama minimal 3 karakter'),
  classId: z.string().optional(),
  gender: z.enum(['L', 'P'], { errorMap: () => ({ message: 'Pilih jenis kelamin' }) }),
  birthDate: z.string().optional(),
  birthPlace: z.string().trim().optional(),
  address: z.string().trim().optional(),
  parentName: z.string().trim().optional(),
  parentPhone: z.string().trim().optional(),
});

const THEME_COLORS: Record<string, string> = { blue: '#1e40af', green: '#0f766e', red: '#b91c1c', purple: '#6d28d9', black: '#111827' };
const THEME_DARK: Record<string, string> = { blue: '#172554', green: '#042f2e', red: '#7f1d1d', purple: '#4c1d95', black: '#000000' };
const THEME_LIGHT: Record<string, string> = { blue: '#bfdbfe', green: '#99f6e4', red: '#fecaca', purple: '#ddd6fe', black: '#e5e7eb' };

// v12: + printX / printY (posisi tanggal cetak)
const DEFAULT_LAYOUT = {
  f: {
    headerH: 46, photoX: 10, photoY: 52, photoW: 74, photoH: 92,
    infoX: 92, infoY: 53, footerH: 16, dotsOpacity: 0.35,
    sigLeft: 110, sigY: 30, stampLeft: 62, stampBottom: 30,
    validX: 10, validY: 148, validW: 74,
    printX: 10, printY: 19,
  },
  b: {
    bandTopH: 40, bandBottomH: 26,
    titleX: 70, titleY: 8, subX: 70, subY: 48,
    qrX: 14, qrY: 52, qrSize: 84, bcX: 14, bcY: 148, bcW: 118,
    wmX: 44, wmY: 62, wmSize: 110, wmOpacity: 0.1, footY: 8,
    logoLeftX: 10, logoLeftY: 5, logoLeftSize: 30,
    logoRightX: 10, logoRightY: 5, logoRightSize: 30,
  },
};

const FRONT_CONTROLS: any[] = [
  { key: 'headerH', label: 'Tinggi Header', min: 30, max: 70 },
  { key: 'photoX', label: 'Foto X', min: 0, max: 200 },
  { key: 'photoY', label: 'Foto Y', min: 40, max: 130 },
  { key: 'photoW', label: 'Lebar Foto', min: 50, max: 110 },
  { key: 'photoH', label: 'Tinggi Foto', min: 60, max: 130 },
  { key: 'validX', label: 'Masa Berlaku X', min: 0, max: 220 },
  { key: 'validY', label: 'Masa Berlaku Y', min: 40, max: 190 },
  { key: 'validW', label: 'Lebar Masa Berlaku', min: 40, max: 160 },
  { key: 'printX', label: 'Tanggal Cetak X', min: 0, max: 300 },
  { key: 'printY', label: 'Tanggal Cetak dari Bawah', min: 0, max: 200 },
  { key: 'infoX', label: 'Kolom Info X', min: 60, max: 220 },
  { key: 'infoY', label: 'Kolom Info Y', min: 40, max: 130 },
  { key: 'footerH', label: 'Tinggi Band Bawah', min: 8, max: 40 },
  { key: 'dotsOpacity', label: 'Opasitas Titik', min: 0, max: 1, step: 0.05 },
  { key: 'sigLeft', label: 'Blok TTD X (tengah≈110)', min: 0, max: 220 },
  { key: 'sigY', label: 'Blok TTD dari Bawah', min: 0, max: 90 },
  { key: 'stampLeft', label: 'Stempel X (KIRI ttd≈62)', min: 0, max: 300 },
  { key: 'stampBottom', label: 'Stempel dari Bawah', min: 0, max: 90 },
];

const BACK_CONTROLS: any[] = [
  { key: 'bandTopH', label: 'Tinggi Band Atas', min: 24, max: 70 },
  { key: 'bandBottomH', label: 'Tinggi Band Bawah', min: 12, max: 50 },
  { key: 'logoLeftX', label: 'Logo KIRI X', min: 0, max: 150 },
  { key: 'logoLeftY', label: 'Logo KIRI Y', min: 0, max: 60 },
  { key: 'logoLeftSize', label: 'Ukuran Logo KIRI', min: 14, max: 60 },
  { key: 'logoRightX', label: 'Logo KANAN X (dari kanan)', min: 0, max: 150 },
  { key: 'logoRightY', label: 'Logo KANAN Y', min: 0, max: 60 },
  { key: 'logoRightSize', label: 'Ukuran Logo KANAN', min: 14, max: 60 },
  { key: 'titleX', label: 'Judul X', min: 0, max: 220 },
  { key: 'titleY', label: 'Judul Y (band atas)', min: 0, max: 40 },
  { key: 'subX', label: 'Subjudul X (terpisah)', min: 0, max: 220 },
  { key: 'subY', label: 'Subjudul Y (bawah band)', min: 20, max: 120 },
  { key: 'qrX', label: 'QR X', min: 0, max: 200 },
  { key: 'qrY', label: 'QR Y', min: 40, max: 130 },
  { key: 'qrSize', label: 'Ukuran QR', min: 50, max: 110 },
  { key: 'bcX', label: 'Barcode dari KANAN', min: 0, max: 200 },
  { key: 'bcY', label: 'Barcode Y', min: 40, max: 180 },
  { key: 'bcW', label: 'Lebar Barcode', min: 80, max: 200 },
  { key: 'wmX', label: 'Watermark dari Kanan', min: 0, max: 120 },
  { key: 'wmY', label: 'Watermark Y', min: 20, max: 110 },
  { key: 'wmSize', label: 'Ukuran Watermark', min: 60, max: 170 },
  { key: 'wmOpacity', label: 'Opasitas Watermark', min: 0, max: 0.4, step: 0.02 },
  { key: 'footY', label: 'Teks Footer dari Bawah', min: 0, max: 30 },
];

const Slider = ({ label, value, min, max, step, accent, onChange }: any) => (
  <div className="space-y-0.5">
    <div className="flex justify-between text-[11px] text-muted-foreground">
      <span>{label}</span><span className="font-mono font-semibold text-foreground">{value}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step || 1} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1.5" style={{ accentColor: accent }}
    />
  </div>
);

function StudentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [sortField, setSortField] = useState<'nis' | 'name' | 'class' | 'gender'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const itemsPerPage = 50;

  const [showFilters, setShowFilters] = useState(false);
  const [filterGrade, setFilterGrade] = useState<string>('');
  const [filterClass, setFilterClass] = useState<string>('');
  const [filterGender, setFilterGender] = useState<string>('');
  const [filterAlumniStatus, setFilterAlumniStatus] = useState<string>('');
  const [filterGraduationDateFrom, setFilterGraduationDateFrom] = useState('');
  const [filterGraduationDateTo, setFilterGraduationDateTo] = useState('');

  const [isPrintCardsDialogOpen, setIsPrintCardsDialogOpen] = useState(false);
  const [isBackTextDialogOpen, setIsBackTextDialogOpen] = useState(false);
  const [isLayoutEditorOpen, setIsLayoutEditorOpen] = useState(false);
  const [printStudents, setPrintStudents] = useState<any[]>([]);
  const [isLoadingPrintData, setIsLoadingPrintData] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [barcodeMap, setBarcodeMap] = useState<Record<string, string>>({});
  const [assetMap, setAssetMap] = useState<Record<string, string>>({});
  const [printLayout, setPrintLayout] = useState<'1' | '2' | '4'>('4');
  const [printTemplate, setPrintTemplate] = useState<'front' | 'both'>('both');
  const [printOrientation, setPrintOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [cardSize, setCardSize] = useState<'standard' | 'large'>('standard');
  const [cardTheme, setCardTheme] = useState<string>('blue');
  const [customColor, setCustomColor] = useState('#1e40af');
  const [showQr, setShowQr] = useState(true);
  const [showWatermark, setShowWatermark] = useState(true);
  const [showSignature, setShowSignature] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);

  const [backTitle, setBackTitle] = useState('');
  const [backSub, setBackSub] = useState('');
  const [backFooter, setBackFooter] = useState('');
  const [validityText, setValidityText] = useState('');
  const [printDateText, setPrintDateText] = useState('');

  const [layout, setLayout] = useState<any>(() => JSON.parse(JSON.stringify(DEFAULT_LAYOUT)));
  const [templateName, setTemplateName] = useState('');

  useEffect(() => { console.info('Students ' + CARD_ENGINE + ' loaded'); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterGrade, filterClass, filterGender, filterAlumniStatus, filterGraduationDateFrom, filterGraduationDateTo]);

  const toTitleCase = (name: string): string =>
    (name || '').toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const fixGelarToken = (t: string) => {
    const clean = t.trim();
    if (!clean) return '';
    if (clean.length <= 2) return clean.toUpperCase();
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  };
  const formatKepsekName = (raw: string) => {
    if (!raw) return '';
    const parts = String(raw).split(',');
    const namePart = toTitleCase(parts[0]);
    const gelars = parts.slice(1).map(g => {
      const hadDot = g.trim().endsWith('.');
      const tokens = g.split('.').map(fixGelarToken).filter(Boolean);
      let out = tokens.join('.');
      if (hadDot) out += '.';
      return out.trim();
    }).filter(Boolean);
    return gelars.length ? `${namePart}, ${gelars.join(', ')}` : namePart;
  };

  const formatDateID = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const defaultPrintDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  const { data: schoolSettings, refetch: refetchSchool } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('school_settings').select('*').limit(1).maybeSingle();
      if (error) { console.error('Error fetching school settings:', error); return null; }
      return data;
    },
  });

  useEffect(() => {
    if (!schoolSettings) return;
    setBackTitle(schoolSettings.id_card_back_title || 'Kartu\nNomor Induk\nSiswa Nasional');
    setBackSub(schoolSettings.id_card_back_sub || 'Departemen Pendidikan Nasional\nRepublik Indonesia');
    setBackFooter(schoolSettings.id_card_back_footer || 'hanya berlaku selama pemegang menjadi siswa');
    setValidityText(schoolSettings.card_validity_text || 'Berlaku Selama Menjadi Siswa');
    setPrintDateText(schoolSettings.card_print_date_text || '');
    if (schoolSettings.card_layout) {
      try {
        const p = JSON.parse(schoolSettings.card_layout);
        setLayout({ f: { ...DEFAULT_LAYOUT.f, ...(p.f || {}) }, b: { ...DEFAULT_LAYOUT.b, ...(p.b || {}) } });
      } catch { }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolSettings?.id, schoolSettings?.card_layout]);

  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('classes').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: templates, refetch: refetchTemplates } = useQuery({
    queryKey: ['card-templates'],
    queryFn: async () => {
      const { data } = await supabase.from('card_templates').select('*').order('created_at', { ascending: false });
      return data || [];
    },
  });

  const gradeOptions = React.useMemo(() => {
    const set = Array.from(new Set((classes || []).map((c: any) => String(c.grade ?? '').trim()).filter(Boolean)));
    return set.sort((a, b) => (Number(a) || a) > (Number(b) || b) ? 1 : -1);
  }, [classes]);

  const rombelOptions = React.useMemo(() => {
    return (classes || []).filter((c: any) => !filterGrade || String(c.grade) === String(filterGrade));
  }, [classes, filterGrade]);

  const applyStudentFilters = (query: any) => {
    let q = query;
    if (searchTerm.trim()) q = q.or(`full_name.ilike.%${searchTerm}%,nis.ilike.%${searchTerm}%,nisn.ilike.%${searchTerm}%`);
    if (filterGrade) {
      const ids = (classes || []).filter((c: any) => String(c.grade) === String(filterGrade)).map((c: any) => c.id);
      q = ids.length ? q.in('class_id', ids) : q.in('class_id', [EMPTY_UUID]);
    }
    if (filterClass) q = q.eq('class_id', filterClass);
    if (filterGender) q = q.eq('gender', filterGender);
    if (filterAlumniStatus === 'alumni') q = q.eq('is_alumni', true);
    else if (filterAlumniStatus === 'active') q = q.or('is_alumni.is.null,is_alumni.eq.false');
    if (filterGraduationDateFrom) q = q.gte('graduation_date', filterGraduationDateFrom);
    if (filterGraduationDateTo) q = q.lte('graduation_date', filterGraduationDateTo);
    return q;
  };

  const filterDeps = [searchTerm, filterGrade, filterClass, filterGender, filterAlumniStatus, filterGraduationDateFrom, filterGraduationDateTo, classes?.length];

  const { data: totalCount } = useQuery({
    queryKey: ['students-count', ...filterDeps],
    queryFn: async () => {
      const query = applyStudentFilters(supabase.from('students').select('*', { count: 'exact', head: true }));
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: students, isLoading } = useQuery({
    queryKey: ['students', currentPage, ...filterDeps, sortField, sortOrder],
    queryFn: async () => {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      let query = applyStudentFilters(supabase.from('students').select(`*, classes ( name )`));
      const orderColumn = sortField === 'name' ? 'full_name' : sortField === 'class' ? 'classes.name' : sortField;
      query = query.order(orderColumn, { ascending: sortOrder === 'asc' }).range(from, to);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000,
  });

  const createStudentMutation = useMutation({
    mutationFn: async (values: z.infer<typeof studentSchema> & { photoUrl?: string }) => {
      const { error } = await supabase.from('students').insert({
        nis: values.nis, nisn: values.nisn || null, full_name: values.fullName, class_id: values.classId || null,
        gender: values.gender, birth_date: values.birthDate || null, birth_place: values.birthPlace || null,
        address: values.address || null, parent_name: values.parentName || null, parent_phone: values.parentPhone || null,
        photo_url: values.photoUrl || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-count'] });
      toast.success('Siswa berhasil ditambahkan');
      setIsDialogOpen(false); setEditingStudent(null); setPhotoFile(null);
    },
    onError: (error: any) => toast.error('Gagal menambahkan siswa: ' + error.message),
  });

  const updateStudentMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: z.infer<typeof studentSchema> & { photoUrl?: string | null } }) => {
      const updateData: any = {
        nis: values.nis, nisn: values.nisn || null, full_name: values.fullName, class_id: values.classId || null,
        gender: values.gender, birth_date: values.birthDate || null, birth_place: values.birthPlace || null,
        address: values.address || null, parent_name: values.parentName || null, parent_phone: values.parentPhone || null,
      };
      if (values.photoUrl !== undefined) updateData.photo_url = values.photoUrl;
      const { error } = await supabase.from('students').update(updateData).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-count'] });
      toast.success('Siswa berhasil diperbarui');
      setIsDialogOpen(false); setEditingStudent(null); setPhotoFile(null);
    },
    onError: (error: any) => toast.error('Gagal memperbarui siswa: ' + error.message),
  });

  const deleteStudentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-count'] });
      toast.success('Siswa berhasil dihapus');
    },
    onError: (error: any) => toast.error('Gagal menghapus siswa: ' + error.message),
  });

  const importStudentsMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) throw new Error('File CSV kosong atau tidak valid');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const requiredHeaders = ['nis', 'nama'];
      if (!requiredHeaders.every(h => headers.includes(h))) throw new Error('Format tidak valid. Header minimal: NIS, Nama');
      let insertedCount = 0, updatedCount = 0, errorCount = 0;
      const errors: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length < 2) continue;
        const nisIndex = headers.indexOf('nis'), nisnIndex = headers.indexOf('nisn'), namaIndex = headers.indexOf('nama'),
          kelasIndex = headers.indexOf('kelas'), genderIndex = headers.indexOf('jenis kelamin'),
          birthPlaceIndex = headers.indexOf('tempat lahir'), birthDateIndex = headers.indexOf('tanggal lahir'),
          addressIndex = headers.indexOf('alamat'), parentNameIndex = headers.indexOf('nama orang tua'),
          parentPhoneIndex = headers.indexOf('no hp orang tua');
        const nis = values[nisIndex];
        if (!nis) { errorCount++; errors.push(`Baris ${i + 1}: NIS kosong`); continue; }
        let classId = null;
        if (kelasIndex >= 0 && values[kelasIndex]) {
          const { data: classData } = await supabase.from('classes').select('id').eq('name', values[kelasIndex]).maybeSingle();
          classId = classData?.id || null;
        }
        const studentData = {
          nis, nisn: nisnIndex >= 0 ? values[nisnIndex] || null : null, full_name: values[namaIndex], class_id: classId,
          gender: genderIndex >= 0 ? values[genderIndex] : null, birth_place: birthPlaceIndex >= 0 ? values[birthPlaceIndex] || null : null,
          birth_date: birthDateIndex >= 0 ? values[birthDateIndex] || null : null, address: addressIndex >= 0 ? values[addressIndex] || null : null,
          parent_name: parentNameIndex >= 0 ? values[parentNameIndex] || null : null, parent_phone: parentPhoneIndex >= 0 ? values[parentPhoneIndex] || null : null,
        };
        const { data: existingStudent } = await supabase.from('students').select('id').eq('nis', nis).maybeSingle();
        if (existingStudent) {
          const { error } = await supabase.from('students').update(studentData).eq('id', existingStudent.id);
          if (error) { errorCount++; errors.push(`Baris ${i + 1} (${nis}): ${error.message}`); } else updatedCount++;
        } else {
          const { error } = await supabase.from('students').insert(studentData);
          if (error) { errorCount++; errors.push(`Baris ${i + 1} (${nis}): ${error.message}`); } else insertedCount++;
        }
      }
      return { insertedCount, updatedCount, errorCount, errors };
    },
    onSuccess: ({ insertedCount, updatedCount, errorCount, errors }) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      const messages = [];
      if (insertedCount > 0) messages.push(`${insertedCount} siswa ditambahkan`);
      if (updatedCount > 0) messages.push(`${updatedCount} siswa diperbarui`);
      if (errorCount > 0) messages.push(`${errorCount} gagal`);
      const message = messages.join(', ');
      if (errorCount > 0 && errors.length > 0) toast.error(`${message}. Error: ${errors.slice(0, 3).join('; ')}`);
      else toast.success(`Import selesai: ${message}`);
    },
    onError: (error: any) => toast.error('Gagal import siswa: ' + error.message),
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      const values = studentSchema.parse({
        nis: formData.get('nis'), nisn: formData.get('nisn'), fullName: formData.get('fullName'),
        classId: formData.get('classId'), gender: formData.get('gender'), birthDate: formData.get('birthDate'),
        birthPlace: formData.get('birthPlace'), address: formData.get('address'),
        parentName: formData.get('parentName'), parentPhone: formData.get('parentPhone'),
      });
      let photoUrl: string | null | undefined = undefined;
      if (photoFile) {
        setIsUploadingPhoto(true);
        try {
          const fileExt = photoFile.name.split('.').pop();
          const fileName = `student-${values.nis}-${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('school-logos').upload(fileName, photoFile, { upsert: true });
          if (uploadError) throw uploadError;
          const { data: urlData } = supabase.storage.from('school-logos').getPublicUrl(fileName);
          photoUrl = urlData.publicUrl;
        } catch (error) {
          console.error('Error uploading photo:', error);
          toast.error('Gagal mengunggah foto siswa');
        } finally { setIsUploadingPhoto(false); }
      }
      if (editingStudent) updateStudentMutation.mutate({ id: editingStudent.id, values: { ...values, photoUrl } });
      else createStudentMutation.mutate({ ...values, photoUrl: photoUrl || null });
    } catch (error) {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) { setEditingStudent(null); setPhotoFile(null); }
  };

  const saveBackTextMutation = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase.from('school_settings').select('id').limit(1).maybeSingle();
      if (!existing) throw new Error('school_settings belum ada');
      const { error } = await supabase.from('school_settings').update({
        id_card_back_title: backTitle, id_card_back_sub: backSub, id_card_back_footer: backFooter,
      }).eq('id', existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchSchool();
      toast.success('Teks belakang kartu berhasil disimpan');
      setIsBackTextDialogOpen(false);
    },
    onError: (e: any) => toast.error('Gagal menyimpan: ' + e.message),
  });

  const saveLayoutMutation = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase.from('school_settings').select('id').limit(1).maybeSingle();
      if (!existing) throw new Error('school_settings belum ada');
      const { error } = await supabase.from('school_settings').update({
        card_layout: JSON.stringify(layout),
        card_validity_text: validityText,
        card_print_date_text: printDateText,
      }).eq('id', existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchSchool();
      toast.success('Pengaturan kartu tersimpan');
    },
    onError: (e: any) => toast.error('Gagal menyimpan pengaturan: ' + e.message),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('card_templates').insert({
        name: templateName || `Template ${new Date().toLocaleString('id-ID')}`,
        layout: JSON.stringify(layout),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refetchTemplates();
      toast.success('Template layout disimpan');
      setTemplateName('');
    },
    onError: (e: any) => toast.error('Gagal menyimpan template: ' + e.message),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('card_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { refetchTemplates(); toast.success('Template dihapus'); },
  });

  const loadTemplate = (t: any) => {
    try {
      const p = JSON.parse(t.layout);
      setLayout({ f: { ...DEFAULT_LAYOUT.f, ...(p.f || {}) }, b: { ...DEFAULT_LAYOUT.b, ...(p.b || {}) } });
      toast.success(`Template "${t.name}" dimuat ke editor`);
    } catch { toast.error('Template rusak'); }
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ classId }: { classId: string }) => {
      if (selectedStudentIds.length === 0) throw new Error('Pilih siswa terlebih dahulu');
      const { error } = await supabase.from('students').update({ class_id: classId }).in('id', selectedStudentIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-count'] });
      toast.success(`${selectedStudentIds.length} siswa berhasil diperbarui`);
      setIsBulkEditOpen(false); setSelectedStudentIds([]);
    },
    onError: (error: any) => toast.error('Gagal memperbarui siswa: ' + error.message),
  });

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudentIds(prev => prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]);
  };

  const handleSelectAll = () => {
    if (selectedStudentIds.length === displayStudents.length) setSelectedStudentIds([]);
    else setSelectedStudentIds(displayStudents.map(s => s.id));
  };

  const handleSelectAllFiltered = async () => {
    try {
      const { data, error } = await applyStudentFilters(supabase.from('students').select('id'));
      if (error) throw error;
      const ids = (data || []).map((d: any) => d.id);
      if (ids.length === 0) { toast.error('Tidak ada siswa yang sesuai filter'); return; }
      setSelectedStudentIds(ids);
      toast.success(`${ids.length} siswa dipilih (semua hasil filter)`);
    } catch (e: any) { toast.error('Gagal memilih semua: ' + e.message); }
  };

  const handleBulkSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const classId = new FormData(e.currentTarget).get('classId') as string;
    if (!classId) { toast.error('Pilih kelas tujuan'); return; }
    bulkUpdateMutation.mutate({ classId });
  };

  const handleExportStudents = () => {
    if (!students || students.length === 0) { toast.error('Tidak ada data siswa untuk diekspor'); return; }
    const exportData = students.map(student => ({
      'NIS': student.nis, 'NISN': student.nisn || '', 'Nama': student.full_name, 'Kelas': student.classes?.name || '',
      'Jenis Kelamin': student.gender === 'L' ? 'L' : student.gender === 'P' ? 'P' : '', 'Tempat Lahir': student.birth_place || '',
      'Tanggal Lahir': student.birth_date || '', 'Alamat': student.address || '', 'Nama Orang Tua': student.parent_name || '',
      'No HP Orang Tua': student.parent_phone || '', 'Tanggal Lulus': student.graduation_date || '',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 25 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');
    XLSX.writeFile(wb, `data-siswa-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`Data ${students.length} siswa berhasil diekspor`);
  };

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const wsI = XLSX.utils.aoa_to_sheet([['TEMPLATE IMPORT DATA SISWA'], [''], ['PETUNJUK:'], ['1. Wajib isi: NIS, Nama, Jenis Kelamin (L/P)'], ['2. Tanggal lahir: YYYY-MM-DD'], ['3. Nama kelas harus sesuai sistem'], ['4. Import via tombol Import']]);
    wsI['!cols'] = [{ wch: 60 }];
    const wsD = XLSX.utils.json_to_sheet([{ 'NIS': '2024001', 'NISN': '0051234567', 'Nama': 'Ahmad Rizki Pratama', 'Kelas': classes?.[0]?.name || '7A', 'Jenis Kelamin': 'L', 'Tempat Lahir': 'Jakarta', 'Tanggal Lahir': '2010-05-15', 'Alamat': 'Jl. Merdeka No. 123', 'Nama Orang Tua': 'Budi Pratama', 'No HP Orang Tua': '081234567890' }]);
    wsD['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 35 }, { wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsI, 'Petunjuk');
    XLSX.utils.book_append_sheet(wb, wsD, 'Data Siswa');
    XLSX.writeFile(wb, 'template-import-siswa.xlsx');
    toast.success('Template berhasil diunduh.');
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { toast.error('Ukuran foto maksimal 2MB'); return; }
      if (!file.type.startsWith('image/')) { toast.error('File harus berupa gambar'); return; }
      setPhotoFile(file);
    }
  };

  const displayStudents = students || [];
  const totalPages = Math.ceil((totalCount || 0) / itemsPerPage);

  const handleSort = (field: 'nis' | 'name' | 'class' | 'gender') => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('asc'); }
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilterGrade(''); setFilterClass(''); setFilterGender(''); setFilterAlumniStatus('');
    setFilterGraduationDateFrom(''); setFilterGraduationDateTo('');
    setSearchTerm(''); setCurrentPage(1);
    toast.success('Filter direset');
  };

  const hasActiveFilters = filterGrade || filterClass || filterGender || filterAlumniStatus || filterGraduationDateFrom || filterGraduationDateTo;

  // ================= CETAK KARTU =================
  const cardColor = cardTheme === 'custom' ? customColor : (THEME_COLORS[cardTheme] || THEME_COLORS.blue);
  const cardDark = cardTheme === 'custom' ? customColor : (THEME_DARK[cardTheme] || '#0f172a');
  const cardLight = cardTheme === 'custom' ? '#f3f4f6' : (THEME_LIGHT[cardTheme] || '#bfdbfe');
  const cardPx = cardSize === 'standard' ? { w: 340, h: 214 } : { w: 378, h: 246 };
  const cardMm = cardSize === 'standard' ? { w: 85.6, h: 54 } : { w: 100, h: 65 };
  const L = layout.f || DEFAULT_LAYOUT.f;
  const B = layout.b || DEFAULT_LAYOUT.b;
  const num = (v: any, d = 0) => { const n = Number(v); return isNaN(n) ? d : n; };

  const setL = (group: string, k: string, v: number) => {
    setLayout((p: any) => ({ ...p, [group]: { ...p[group], [k]: v } }));
  };

  const urlToDataUrl = (url: string) => new Promise<string>((resolve) => {
    if (!url) { resolve(''); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 300; c.height = img.naturalHeight || 300;
        c.getContext('2d')?.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch { resolve(url); }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });

  const asset = (url?: string | null) => (url && assetMap[url]) || url || '';

  const preloadAssets = async (list: any[]) => {
    const s = schoolSettings || {};
    const urls = Array.from(new Set([
      ...list.map((x) => x.photo_url).filter(Boolean),
      s.logo_url, s.right_logo_url, s.watermark_url, s.headmaster_signature_url, s.school_stamp_url,
    ].filter(Boolean))) as string[];
    const results = await Promise.all(urls.map((u) => urlToDataUrl(u)));
    const map: Record<string, string> = {};
    urls.forEach((u, i) => { map[u] = results[i]; });
    setAssetMap(map);
  };

  const generateQrCodes = async (list: any[]) => {
    const map: Record<string, string> = {};
    for (const s of list) {
      try {
        const token = CryptoJS.AES.encrypt(JSON.stringify({ nis: s.nis, nisn: s.nisn || '' }), CARD_SECRET).toString();
        map[s.id] = await QRCode.toDataURL(`${QR_VERIFY_BASE_URL}?token=${encodeURIComponent(token)}`, {
          width: 256, margin: 1, color: { dark: '#000000ff', light: '#ffffffff' },
        });
      } catch (e) { console.error('QR generate error', e); }
    }
    setQrMap(map);
  };

  const generateBarcodes = (list: any[]) => {
    const map: Record<string, string> = {};
    for (const s of list) {
      const value = s.nisn || s.nis;
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, value, {
          format: 'CODE128', displayValue: false, margin: 0, height: 28, width: 1.4,
          background: 'rgba(0,0,0,0)', lineColor: '#000000',
        });
        map[s.id] = canvas.toDataURL('image/png');
      } catch (e) { console.error('Barcode error', e); }
    }
    setBarcodeMap(map);
  };

  const handleOpenPrintCardsDialog = async () => {
    if (selectedStudentIds.length === 0) { toast.error('Pilih siswa terlebih dahulu (centang checkbox pada tabel)'); return; }
    setIsPrintCardsDialogOpen(true);
    setIsLoadingPrintData(true);
    try {
      const { data, error } = await supabase
        .from('students')
        .select(`*, classes ( name, grade, academic_year )`)
        .in('id', selectedStudentIds)
        .order('full_name');
      if (error) throw error;
      const list = data || [];
      setPrintStudents(list);
      await preloadAssets(list);
      generateBarcodes(list);
      await generateQrCodes(list);
    } catch (e: any) {
      toast.error('Gagal memuat data kartu: ' + e.message);
      setIsPrintCardsDialogOpen(false);
    } finally { setIsLoadingPrintData(false); }
  };

  const handleExecutePrint = () => {
    if (printStudents.length === 0) { toast.error('Tidak ada data untuk dicetak'); return; }
    window.print();
  };

  const getCardPositions = (lyt: string, pageW: number, pageH: number, dims: { w: number; h: number }) => {
    const GAP = 6;
    let cols = 1, rows = 1;
    if (lyt === '2') { if (pageW >= pageH) { cols = 2; rows = 1; } else { cols = 1; rows = 2; } }
    else if (lyt === '4') { cols = 2; rows = 2; }
    const totalW = cols * dims.w + (cols - 1) * GAP;
    const totalH = rows * dims.h + (rows - 1) * GAP;
    const x0 = Math.max((pageW - totalW) / 2, 5);
    const y0 = Math.max((pageH - totalH) / 2, 5);
    const pos: [number, number][] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pos.push([x0 + c * (dims.w + GAP), y0 + r * (dims.h + GAP)]);
    return pos;
  };

  const handleDownloadPdf = async () => {
    if (printStudents.length === 0 || isGeneratingPdf) return;
    const area = document.getElementById('print-student-cards-area') as HTMLElement | null;
    if (!area) { toast.error('Area cetak tidak ditemukan'); return; }

    setIsGeneratingPdf(true);
    const prevStyle = area.getAttribute('style') || '';
    area.setAttribute('style', 'position:absolute; left:0; top:0; z-index:60; background:#ffffff; padding:8px;');

    try {
      const fronts = Array.from(area.querySelectorAll<HTMLElement>('[data-card-unit="front"]'));
      const backs = Array.from(area.querySelectorAll<HTMLElement>('[data-card-unit="back"]'));
      const sequence = printTemplate === 'both' ? [...fronts, ...backs] : fronts;
      const total = sequence.length;
      setPdfProgress({ done: 0, total });
      await new Promise((r) => setTimeout(r, 50));

      const pdf = new jsPDF({ orientation: printOrientation, unit: 'mm', format: 'a4' });
      const pageW = printOrientation === 'landscape' ? 297 : 210;
      const pageH = printOrientation === 'landscape' ? 210 : 297;
      const positions = getCardPositions(printLayout, pageW, pageH, cardMm);
      let slot = 0;

      for (let i = 0; i < total; i++) {
        const canvas = await html2canvas(sequence[i], {
          scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
        });
        if (slot === 0 && i !== 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', positions[slot][0], positions[slot][1], cardMm.w, cardMm.h);
        slot = (slot + 1) % positions.length;
        setPdfProgress({ done: i + 1, total });
        await new Promise((r) => setTimeout(r, 0));
      }

      pdf.save(`kartu-pelajar-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success(`PDF berhasil dibuat (${total} kartu)`);
    } catch (e: any) {
      console.error(e);
      toast.error('Gagal membuat PDF: ' + e.message);
    } finally {
      area.setAttribute('style', prevStyle);
      setPdfProgress(null);
      setIsGeneratingPdf(false);
    }
  };

  // ===== KARTU DEPAN (v12: posisi tanggal cetak bisa diatur) =====
  const renderCardFront = (student: any) => {
    const s = schoolSettings;
    const cardLogo = s?.right_logo_url || s?.logo_url;
    const showBg = showWatermark && s?.watermark_url;
    const kelasShort = String(student.classes?.name || '-').trim().slice(0, 2);
    const cetak = printDateText || defaultPrintDate;
    return (
      <div className="id-card" data-card-unit="front">
        {showBg && <img className="idc-bg" src={asset(s.watermark_url)} alt="" />}
        <div className="idc-bg-fade" />
        <div className="idc-dots" style={{ position: 'absolute', top: num(L.headerH) + 4, right: 8, opacity: num(L.dotsOpacity, 0.35) }} />
        <div className="idc-dots" style={{ position: 'absolute', bottom: num(L.footerH, 16) + 52, left: 8, opacity: num(L.dotsOpacity, 0.35) * 0.7 }} />
        <div className="idc-ring" style={{ position: 'absolute', top: num(L.headerH) - 6, right: -18, borderColor: cardColor }} />
        <div className="idc-ring idc-ring-sm" style={{ position: 'absolute', bottom: num(L.footerH, 16) - 4, left: -14, borderColor: cardColor }} />

        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: num(L.headerH, 46), zIndex: 2 }}>
          <div className="idc-header-panel" style={{ background: `linear-gradient(120deg, ${cardDark} 0%, ${cardColor} 65%)` }} />
          <div className="idc-header-sheen" />
          <div className="idc-header-accent" style={{ background: cardLight }} />
          <div className="idc-header-content">
            <div className="idc-logo-wrap">
              {cardLogo ? <img src={asset(cardLogo)} alt="" /> : <School className="idc-logo-fallback" style={{ color: cardColor }} />}
            </div>
            <div>
              <p className="idc-motto">{(s?.district_name || 'PEMERINTAH KABUPATEN CIAMIS').toUpperCase()}</p>
              <p className="idc-school">{(s?.school_name || 'NAMA SEKOLAH').toUpperCase()}</p>
              {s?.school_address && <p className="idc-addrline">{toTitleCase(s.school_address)}</p>}
            </div>
          </div>
          <div className="idc-title-wrap">
            <p className="idc-title" style={{ color: cardDark }}>KARTU PELAJAR</p>
            <p className="idc-subtitle" style={{ color: cardColor }}>STUDENT IDENTITY CARD</p>
            <div className="idc-title-line" style={{ background: `linear-gradient(90deg, ${cardColor}, ${cardLight})` }} />
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: num(L.footerH, 16), zIndex: 2 }}>
          <div className="idc-footer-panel" style={{ background: `linear-gradient(120deg, ${cardColor} 35%, ${cardDark} 100%)` }} />
          <div className="idc-footer-sheen" />
          <div className="idc-footer-accent" style={{ background: cardLight }} />
        </div>

        <div className="idc-photo" style={{ position: 'absolute', left: num(L.photoX, 10), top: num(L.photoY, 52), width: num(L.photoW, 74), height: num(L.photoH, 92), borderColor: cardColor, zIndex: 2 }}>
          {student.photo_url ? <img src={asset(student.photo_url)} alt="" /> : <User className="idc-photo-fallback" />}
        </div>

        <div style={{ position: 'absolute', left: num(L.validX, 10), top: num(L.validY, 148), width: num(L.validW, 74), zIndex: 2, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 5.5, fontWeight: 700, letterSpacing: .3, borderRadius: 3, padding: 2, background: cardLight, color: cardDark, whiteSpace: 'pre-line', lineHeight: 1.5 }}>
            {validityText || 'Berlaku Selama Menjadi Siswa'}
          </p>
        </div>

        <div className="idc-info" style={{ position: 'absolute', left: num(L.infoX, 92), top: num(L.infoY, 53), right: 10, zIndex: 2 }}>
          <div className="idc-row"><span className="idc-chip" style={{ background: `linear-gradient(135deg, ${cardColor}, ${cardDark})` }}><User className="idc-ic" /></span><span className="idc-label">Nama</span><span className="idc-val idc-name">{toTitleCase(student.full_name)}</span></div>
          <div className="idc-row"><span className="idc-chip" style={{ background: `linear-gradient(135deg, ${cardColor}, ${cardDark})` }}><CreditCard className="idc-ic" /></span><span className="idc-label">NIS</span><span className="idc-val">{student.nis}</span></div>
          <div className="idc-row"><span className="idc-chip" style={{ background: `linear-gradient(135deg, ${cardColor}, ${cardDark})` }}><Hash className="idc-ic" /></span><span className="idc-label">NISN</span><span className="idc-val">{student.nisn || '-'}</span></div>
          <div className="idc-row"><span className="idc-chip" style={{ background: `linear-gradient(135deg, ${cardColor}, ${cardDark})` }}><GraduationCap className="idc-ic" /></span><span className="idc-label">Kelas</span><span className="idc-val">{kelasShort}</span></div>
          <div className="idc-row"><span className="idc-chip" style={{ background: `linear-gradient(135deg, ${cardColor}, ${cardDark})` }}><CalendarDays className="idc-ic" /></span><span className="idc-label">Tempat, Tgl Lahir</span><span className="idc-val">{toTitleCase(student.birth_place) || '-'}, {formatDateID(student.birth_date)}</span></div>
          <div className="idc-row" style={{ alignItems: 'flex-start' }}>
            <span className="idc-chip" style={{ background: `linear-gradient(135deg, ${cardColor}, ${cardDark})`, marginTop: 1 }}><MapPin className="idc-ic" /></span>
            <span className="idc-label" style={{ marginTop: 1 }}>Alamat</span>
            <span className="idc-val idc-val-multi">{toTitleCase(student.address) || '-'}</span>
          </div>
        </div>

        {/* v12: Tanggal cetak — posisi bisa diatur via printX/printY */}
        <div className="idc-printdate" style={{ position: 'absolute', left: num(L.printX, 10), bottom: num(L.printY, 19), zIndex: 2 }}>
          <p>Dicetak: {cetak}</p>
        </div>

        {showSignature && (
          <>
            <div className="idc-sign-area" style={{ position: 'absolute', left: num(L.sigLeft, 110), bottom: num(L.sigY, 30), zIndex: 3 }}>
              <p className="idc-sign-jab">Kepala Sekolah,</p>
              <div className="idc-sign-space">
                {s?.headmaster_signature_url && <img className="idc-signature" src={asset(s.headmaster_signature_url)} alt="" />}
              </div>
              <p className="idc-sign-name">{formatKepsekName(s?.headmaster_name) || '(............................)'}</p>
              {s?.headmaster_nip && <p className="idc-nip">NIP. {s.headmaster_nip}</p>}
            </div>
            {s?.school_stamp_url && (
              <img className="idc-stamp" src={asset(s.school_stamp_url)} alt="" style={{ position: 'absolute', left: num(L.stampLeft, 62), bottom: num(L.stampBottom, 30), zIndex: 4 }} />
            )}
          </>
        )}
      </div>
    );
  };

  // ===== KARTU BELAKANG =====
  const renderCardBack = (student: any) => {
    const s = schoolSettings;
    const schoolShort = ((s?.school_name || 'SEKOLAH').split(' ').map((w: string) => w.charAt(0)).join('').slice(0, 5)).toUpperCase();
    const serial = `${schoolShort}-${new Date().getFullYear()}-${student.nis}`;
    const logoLeftSrc = s?.logo_url || s?.right_logo_url;
    const logoRightSrc = s?.right_logo_url || s?.logo_url;
    const wmSrc = s?.right_logo_url || s?.logo_url;
    const bTitle = (s?.id_card_back_title || 'Kartu\nNomor Induk\nSiswa Nasional').split('\n');
    const bSub = (s?.id_card_back_sub || 'Departemen Pendidikan Nasional\nRepublik Indonesia').split('\n');
    const bFooter = s?.id_card_back_footer || 'hanya berlaku selama pemegang menjadi siswa';

    return (
      <div className="id-card" data-card-unit="back">
        <div style={{ position: 'absolute', top: 0, left: -16, right: -16, height: num(B.bandTopH, 40), transform: 'skewX(-14deg)', zIndex: 1, background: `linear-gradient(120deg, ${cardDark} 0%, ${cardColor} 65%)`, boxShadow: '0 2px 6px rgba(15,23,42,.18)' }} />
        <div className="idb-band-top-sheen" style={{ position: 'absolute', top: 0, left: -16, width: '26%', height: num(B.bandTopH, 40), transform: 'skewX(-14deg)', zIndex: 1 }} />
        <div className="idb-band-top-accent" style={{ position: 'absolute', top: num(B.bandTopH, 40) + 2, left: '8%', background: cardLight, zIndex: 2 }} />

        <div style={{ position: 'absolute', bottom: 0, left: -16, right: -16, height: num(B.bandBottomH, 26), transform: 'skewX(-14deg)', zIndex: 1, background: `linear-gradient(120deg, ${cardColor} 35%, ${cardDark} 100%)`, boxShadow: '0 -2px 6px rgba(15,23,42,.15)' }} />
        <div className="idb-band-bottom-sheen" style={{ position: 'absolute', bottom: 0, right: -16, width: '20%', height: num(B.bandBottomH, 26), transform: 'skewX(-14deg)', zIndex: 1 }} />
        <div className="idb-band-bottom-accent" style={{ position: 'absolute', bottom: num(B.bandBottomH, 26) + 2, right: '10%', background: cardLight, zIndex: 2 }} />

        {logoLeftSrc && (
          <img src={asset(logoLeftSrc)} alt="" style={{ position: 'absolute', left: num(B.logoLeftX, 10), top: num(B.logoLeftY, 5), width: num(B.logoLeftSize, 30), height: num(B.logoLeftSize, 30), objectFit: 'contain', zIndex: 3 }} />
        )}
        {logoRightSrc && (
          <img src={asset(logoRightSrc)} alt="" style={{ position: 'absolute', right: num(B.logoRightX, 10), top: num(B.logoRightY, 5), width: num(B.logoRightSize, 30), height: num(B.logoRightSize, 30), objectFit: 'contain', zIndex: 3 }} />
        )}
        {wmSrc && (
          <img src={asset(wmSrc)} alt="" style={{ position: 'absolute', right: num(B.wmX, 44), top: num(B.wmY, 62), width: num(B.wmSize, 110), height: num(B.wmSize, 110), opacity: num(B.wmOpacity, 0.1), zIndex: 0, objectFit: 'contain' }} />
        )}

        <div style={{ position: 'absolute', left: num(B.titleX, 70), top: num(B.titleY, 8), zIndex: 3, maxWidth: 220 }}>
          <p style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.15, margin: 0, color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,.25)' }}>
            {bTitle.map((l, i) => <Fragment key={i}>{l}{i < bTitle.length - 1 && <br />}</Fragment>)}
          </p>
        </div>

        <div style={{ position: 'absolute', left: num(B.subX, 70), top: num(B.subY, 48), zIndex: 3, maxWidth: 220 }}>
          <div style={{ height: 2, width: '100%', margin: '0 0 3px', borderRadius: 2, background: cardColor }} />
          <p style={{ fontSize: 6.5, margin: 0, lineHeight: 1.35, color: '#0f172a', fontWeight: 700 }}>
            {bSub.map((l, i) => <Fragment key={i}>{l}{i < bSub.length - 1 && <br />}</Fragment>)}
          </p>
        </div>

        <div style={{ position: 'absolute', left: num(B.qrX, 14), top: num(B.qrY, 52), width: num(B.qrSize, 84), zIndex: 3, textAlign: 'center' }}>
          {showQr && qrMap[student.id] && (
            <div className="idb-qr-box" style={{ borderColor: cardColor, width: num(B.qrSize, 84), height: num(B.qrSize, 84) }}>
              <img src={qrMap[student.id]} alt="QR" />
            </div>
          )}
          <p className="idb-qr-label" style={{ color: cardDark }}>Scan Verifikasi</p>
        </div>

        <div style={{ position: 'absolute', right: num(B.bcX, 14), top: num(B.bcY, 148), zIndex: 3 }}>
          {barcodeMap[student.id] && (
            <div className="idb-barcode-box" style={{ borderColor: cardColor }}>
              <img src={barcodeMap[student.id]} alt="Barcode" style={{ width: num(B.bcW, 118) }} />
              <p>{serial}</p>
            </div>
          )}
        </div>

        <p style={{ position: 'absolute', left: 0, right: 0, bottom: num(B.footY, 8), zIndex: 3, textAlign: 'center', fontSize: 5.5, color: 'rgba(255,255,255,.95)', fontStyle: 'italic', margin: 0, letterSpacing: .4 }}>{bFooter}</p>
      </div>
    );
  };

  const sampleStudent = printStudents[0] || {
    id: 'sample', full_name: 'contoh nama siswa', nis: '2024001', nisn: '0051234567',
    classes: { name: '7A' }, birth_place: 'ciamis', birth_date: '2010-05-15',
    address: 'jl. raya imbanagara no. 517, kec. ciamis, kab. ciamis', photo_url: null,
  };

  const layoutKey = JSON.stringify(layout);
  const pdfPercent = pdfProgress ? Math.round((pdfProgress.done / Math.max(1, pdfProgress.total)) * 100) : 0;

  return (
    <DashboardLayout>
      <style>{`
        #print-student-cards-area { position: fixed; left: -10000px; top: 0; }
        .id-card { position: relative; width: ${cardPx.w}px; height: ${cardPx.h}px; border-radius: 12px; background: #fff; overflow: hidden; box-sizing: border-box; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #0f172a; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,.10); }

        .idc-bg { position: absolute; top: 0; right: 0; width: 62%; height: 100%; object-fit: cover; opacity: .16; }
        .idc-bg-fade { position: absolute; inset: 0; background: linear-gradient(90deg, #fff 32%, rgba(255,255,255,.6) 62%, rgba(255,255,255,.05) 100%); }
        .idc-dots { width: 52px; height: 30px; background-image: radial-gradient(${cardColor} 0.8px, transparent 1.4px); background-size: 5px 5px; z-index: 1; }
        .idc-ring { width: 56px; height: 56px; border: 1.5px solid; border-radius: 50%; opacity: .22; z-index: 1; }
        .idc-ring-sm { width: 34px; height: 34px; opacity: .18; }

        .idc-header-panel { position: absolute; left: -16px; top: 0; bottom: 0; width: 60%; transform: skewX(-14deg); border-bottom-right-radius: 12px; box-shadow: 0 2px 6px rgba(15,23,42,.18); }
        .idc-header-sheen { position: absolute; left: -16px; top: 0; bottom: 0; width: 26%; transform: skewX(-14deg); background: linear-gradient(90deg, rgba(255,255,255,.16), transparent); }
        .idc-header-accent { position: absolute; left: 34%; bottom: -3px; width: 64px; height: 3px; transform: skewX(-14deg); border-radius: 2px; opacity: .95; }
        .idc-header-content { position: absolute; left: 8px; top: 0; bottom: 0; display: flex; align-items: center; gap: 6px; }
        .idc-logo-wrap { width: 32px; height: 32px; border-radius: 50%; background: #fff; padding: 3px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
        .idc-logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
        .idc-logo-fallback { width: 18px; height: 18px; }
        .idc-motto { font-size: 5.5px; color: rgba(255,255,255,.85); margin: 0; letter-spacing: .5px; }
        .idc-school { font-size: 9.5px; font-weight: 800; color: #fff; margin: 0; letter-spacing: .4px; }
        .idc-addrline { font-size: 5px; color: rgba(255,255,255,.8); margin: 0; }
        .idc-title-wrap { position: absolute; right: 10px; top: 7px; text-align: right; }
        .idc-title { font-size: 13px; font-weight: 800; margin: 0; letter-spacing: .8px; }
        .idc-subtitle { font-size: 5px; letter-spacing: 2.4px; margin: 1px 0 0; font-weight: 700; }
        .idc-title-line { height: 2px; margin: 3px 0 0 auto; border-radius: 2px; width: 84%; }

        .idc-footer-panel { position: absolute; right: -16px; top: 0; bottom: 0; width: 52%; transform: skewX(-14deg); border-top-left-radius: 10px; box-shadow: 0 -2px 6px rgba(15,23,42,.15); }
        .idc-footer-sheen { position: absolute; right: -16px; top: 0; bottom: 0; width: 20%; transform: skewX(-14deg); background: linear-gradient(270deg, rgba(255,255,255,.14), transparent); }
        .idc-footer-accent { position: absolute; right: 30%; top: -3px; width: 64px; height: 3px; transform: skewX(-14deg); border-radius: 2px; opacity: .95; }

        .idc-photo { border-radius: 8px; border: 3px solid; background: #fff; padding: 2px; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(15,23,42,.18); }
        .idc-photo img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
        .idc-photo-fallback { width: 30px; height: 30px; color: #94a3b8; }

        .idc-info { min-width: 0; }
        .idc-row { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; }
        .idc-chip { width: 12px; height: 12px; border-radius: 3px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .idc-ic { width: 8px; height: 8px; color: #fff; }
        .idc-label { width: 56px; font-size: 6.5px; color: #64748b; flex-shrink: 0; }
        .idc-val { font-size: 7.5px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .idc-val-multi { white-space: normal; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.25; }
        .idc-name { font-size: 8px; font-weight: 800; text-transform: uppercase; }

        .idc-printdate p { margin: 0; font-size: 5px; color: #64748b; }

        .idc-sign-area { width: 120px; text-align: center; }
        .idc-sign-area p { margin: 0; }
        .idc-sign-jab { font-size: 6px; color: #334155; }
        .idc-sign-space { position: relative; height: 24px; margin: 1px 0; }
        .idc-signature { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); max-height: 20px; max-width: 56px; object-fit: contain; }
        .idc-sign-name { font-weight: 700; font-size: 6px; text-decoration: underline; color: #0f172a; }
        .idc-nip { font-size: 5.5px; color: #475569; }
        .idc-stamp { max-height: 36px; max-width: 40px; object-fit: contain; opacity: .92; }

        .idb-band-top-sheen { background: linear-gradient(90deg, rgba(255,255,255,.16), transparent); }
        .idb-band-top-accent { width: 64px; height: 3px; transform: skewX(-14deg); border-radius: 2px; opacity: .95; }
        .idb-band-bottom-sheen { background: linear-gradient(270deg, rgba(255,255,255,.14), transparent); }
        .idb-band-bottom-accent { width: 64px; height: 3px; transform: skewX(-14deg); border-radius: 2px; opacity: .95; }

        .idb-qr-box { background: #fff; border: 2px solid; border-radius: 10px; padding: 4px; box-sizing: border-box; box-shadow: 0 3px 8px rgba(15,23,42,.15); }
        .idb-qr-box img { width: 100%; height: 100%; display: block; }
        .idb-qr-label { font-size: 4.5px; margin: 3px 0 0; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; }

        .idb-barcode-box { background: #fff; border: 2px solid; border-radius: 8px; padding: 3px 8px 2px; text-align: center; box-shadow: 0 3px 8px rgba(15,23,42,.15); }
        .idb-barcode-box img { height: 20px; object-fit: contain; display: block; margin: 0 auto; }
        .idb-barcode-box p { margin: 1px 0 0; font-size: 4.5px; letter-spacing: 1.4px; color: #334155; font-weight: 700; }

        .id-preview-grid { display: flex; flex-wrap: wrap; gap: 14px; zoom: 0.72; }
        .print-grid { display: flex; flex-wrap: wrap; gap: 4mm; justify-content: center; }
        @media print {
          body * { visibility: hidden; }
          #print-student-cards-area, #print-student-cards-area * { visibility: visible; }
          #print-student-cards-area { position: absolute; left: 0; top: 0; width: 100%; }
          .id-card { page-break-inside: avoid; }
          @page { size: A4 ${printOrientation}; margin: 8mm; }
        }
      `}</style>

      {/* ===== OVERLAY PROGRES PDF ===== */}
      {pdfProgress && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="font-semibold">Membuat PDF Kartu...</p>
                <p className="text-xs text-muted-foreground">Merender kartu {pdfProgress.done} / {pdfProgress.total}</p>
              </div>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all duration-200" style={{ width: `${pdfPercent}%` }} />
            </div>
            <p className="text-xs text-right text-muted-foreground">{pdfPercent}%</p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              Manajemen Siswa
              <span className="text-[10px] font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full">{CARD_ENGINE}</span>
            </h1>
            <p className="text-muted-foreground">Kelola data siswa</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {selectedStudentIds.length > 0 && (
              <>
                <Button variant="secondary" onClick={() => setIsBulkEditOpen(true)}>
                  <Users className="mr-2 h-4 w-4" /> Pindah Kelas ({selectedStudentIds.length})
                </Button>
                <Button variant="secondary" onClick={handleOpenPrintCardsDialog}>
                  <CreditCard className="mr-2 h-4 w-4" /> Cetak Kartu ({selectedStudentIds.length})
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setIsLayoutEditorOpen(true)}>
              <LayoutTemplate className="mr-2 h-4 w-4" /> Editor Layout
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate}><FileSpreadsheet className="mr-2 h-4 w-4" /> Template</Button>
            <Button variant="outline" onClick={handleExportStudents}><Download className="mr-2 h-4 w-4" /> Export</Button>
            <ClassPromotionDialog />
            <GraduateStudentsDialog />
            <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Tambah Siswa</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingStudent ? 'Edit Siswa' : 'Tambah Siswa Baru'}</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="nis">NIS *</Label><Input id="nis" name="nis" defaultValue={editingStudent?.nis} required /></div>
                    <div className="space-y-2"><Label htmlFor="nisn">NISN</Label><Input id="nisn" name="nisn" defaultValue={editingStudent?.nisn} /></div>
                    <div className="space-y-2 md:col-span-2"><Label htmlFor="fullName">Nama Lengkap *</Label><Input id="fullName" name="fullName" defaultValue={editingStudent?.full_name} required /></div>
                    <div className="space-y-2">
                      <Label htmlFor="classId">Kelas</Label>
                      <Select name="classId" defaultValue={editingStudent?.class_id || ''}>
                        <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                        <SelectContent>{classes?.map((cls) => (<SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender">Jenis Kelamin *</Label>
                      <Select name="gender" defaultValue={editingStudent?.gender} required>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="L">Laki-laki</SelectItem><SelectItem value="P">Perempuan</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label htmlFor="birthPlace">Tempat Lahir</Label><Input id="birthPlace" name="birthPlace" defaultValue={editingStudent?.birth_place} /></div>
                    <div className="space-y-2"><Label htmlFor="birthDate">Tanggal Lahir</Label><Input id="birthDate" name="birthDate" type="date" defaultValue={editingStudent?.birth_date} /></div>
                    <div className="space-y-2 md:col-span-2"><Label htmlFor="address">Alamat</Label><Input id="address" name="address" defaultValue={editingStudent?.address} /></div>
                    <div className="space-y-2"><Label htmlFor="parentName">Nama Orang Tua</Label><Input id="parentName" name="parentName" defaultValue={editingStudent?.parent_name} /></div>
                    <div className="space-y-2"><Label htmlFor="parentPhone">No. HP Orang Tua</Label><Input id="parentPhone" name="parentPhone" type="tel" defaultValue={editingStudent?.parent_phone} /></div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="photo">Foto Siswa</Label>
                      <Input id="photo" type="file" accept="image/*" onChange={handlePhotoChange} disabled={isUploadingPhoto} />
                      <p className="text-xs text-muted-foreground">Format: JPG, PNG (Maksimal 2MB)</p>
                      {photoFile && <p className="text-xs text-green-600">File terpilih: {photoFile.name}</p>}
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={createStudentMutation.isPending || updateStudentMutation.isPending || isUploadingPhoto}>
                    {createStudentMutation.isPending || updateStudentMutation.isPending || isUploadingPhoto ? 'Menyimpan...' : editingStudent ? 'Perbarui' : 'Simpan'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ===== EDITOR LAYOUT (v12: + posisi tanggal cetak) ===== */}
        <Dialog open={isLayoutEditorOpen} onOpenChange={setIsLayoutEditorOpen}>
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LayoutTemplate className="h-5 w-5" /> Editor Layout Kartu
                <span className="text-[10px] font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full">{CARD_ENGINE}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-[11px] font-mono bg-muted/60 border rounded-md p-2 text-muted-foreground">
                LIVE → Depan: foto({num(L.photoX)},{num(L.photoY)}) valid({num(L.validX)},{num(L.validY)}) cetak({num(L.printX)},{num(L.printY)}) ttd({num(L.sigLeft)},{num(L.sigY)}) stempel({num(L.stampLeft)},{num(L.stampBottom)}) | Belakang: logoL({num(B.logoLeftX)},{num(B.logoLeftY)}) logoR({num(B.logoRightX)},{num(B.logoRightY)}) judul({num(B.titleX)},{num(B.titleY)}) sub({num(B.subX)},{num(B.subY)})
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-sm mb-2">Preview Depan</h4>
                  <div key={`f-${layoutKey}`} className="overflow-auto bg-muted/40 p-3 rounded-lg" style={{ zoom: 0.85 }}>{renderCardFront(sampleStudent)}</div>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-2">Preview Belakang</h4>
                  <div key={`b-${layoutKey}`} className="overflow-auto bg-muted/40 p-3 rounded-lg" style={{ zoom: 0.85 }}>{renderCardBack(sampleStudent)}</div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2.5 border rounded-lg p-3">
                  <h4 className="font-semibold text-sm">🎛️ Kontrol Depan</h4>
                  {FRONT_CONTROLS.map(c => (
                    <Slider key={`f-${c.key}`} label={c.label} min={c.min} max={c.max} step={c.step} accent={cardColor}
                      value={num(layout.f[c.key])} onChange={(v: number) => setL('f', c.key, v)} />
                  ))}
                  <div className="space-y-1 pt-2">
                    <Label className="text-xs">Teks Masa Berlaku — Enter untuk baris baru</Label>
                    <Textarea value={validityText} onChange={(e) => setValidityText(e.target.value)} rows={2} />
                  </div>
                  <div className="space-y-1 pt-2">
                    <Label className="text-xs">Tanggal Cetak (kosongkan = otomatis hari ini)</Label>
                    <Input value={printDateText} onChange={(e) => setPrintDateText(e.target.value)} placeholder={defaultPrintDate} />
                  </div>
                </div>
                <div className="space-y-2.5 border rounded-lg p-3">
                  <h4 className="font-semibold text-sm">🎛️ Kontrol Belakang</h4>
                  {BACK_CONTROLS.map(c => (
                    <Slider key={`b-${c.key}`} label={c.label} min={c.min} max={c.max} step={c.step} accent={cardColor}
                      value={num(layout.b[c.key])} onChange={(v: number) => setL('b', c.key, v)} />
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-2">
                <Button variant="outline" onClick={() => setLayout(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)))}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset Default
                </Button>
                <Button variant="secondary" onClick={() => saveLayoutMutation.mutate()} disabled={saveLayoutMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" /> {saveLayoutMutation.isPending ? 'Menyimpan...' : 'Simpan Layout Aktif'}
                </Button>
                <div className="flex gap-2">
                  <Input placeholder="Nama template..." value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
                  <Button onClick={() => saveTemplateMutation.mutate()} disabled={saveTemplateMutation.isPending}>Simpan Template</Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Template Tersimpan (klik untuk muat)</Label>
                {(!templates || templates.length === 0) ? (
                  <p className="text-sm text-muted-foreground">Belum ada template tersimpan.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {templates.map((t: any) => (
                      <div key={t.id} className="flex items-center gap-1 border rounded-full pl-3 pr-1 py-1 text-sm bg-muted/40">
                        <button onClick={() => loadTemplate(t)} className="hover:underline font-medium">{t.name}</button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteTemplateMutation.mutate(t.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ===== DIALOG CETAK KARTU ===== */}
        <Dialog open={isPrintCardsDialogOpen} onOpenChange={setIsPrintCardsDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> Cetak Kartu Pelajar ({printStudents.length} Siswa)
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <Label>Kartu per Halaman</Label>
                  <Select value={printLayout} onValueChange={(v: any) => setPrintLayout(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="1">1 Kartu</SelectItem><SelectItem value="2">2 Kartu</SelectItem><SelectItem value="4">4 Kartu</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sisi Kartu</Label>
                  <Select value={printTemplate} onValueChange={(v: any) => setPrintTemplate(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="front">Depan Saja</SelectItem><SelectItem value="both">Depan & Belakang</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Orientasi</Label>
                  <Select value={printOrientation} onValueChange={(v: any) => setPrintOrientation(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="landscape">Landscape</SelectItem><SelectItem value="portrait">Portrait</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ukuran Kartu</Label>
                  <Select value={cardSize} onValueChange={(v: any) => setCardSize(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="standard">Standar (85.6×54mm)</SelectItem><SelectItem value="large">Besar (100×65mm)</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tema Warna</Label>
                  <Select value={cardTheme} onValueChange={setCardTheme}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blue">Biru</SelectItem><SelectItem value="green">Teal</SelectItem>
                      <SelectItem value="red">Merah</SelectItem><SelectItem value="purple">Ungu</SelectItem>
                      <SelectItem value="black">Hitam</SelectItem><SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {cardTheme === 'custom' && (
                  <div className="space-y-2">
                    <Label>Warna Custom</Label>
                    <Input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="h-9 p-1" />
                  </div>
                )}
                <div className="flex items-center gap-2 pt-5">
                  <Switch checked={showQr} onCheckedChange={setShowQr} id="qr" />
                  <Label htmlFor="qr">QR Verifikasi</Label>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch checked={showWatermark} onCheckedChange={setShowWatermark} id="wm" />
                  <Label htmlFor="wm">Foto Gedung</Label>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch checked={showSignature} onCheckedChange={setShowSignature} id="ttd" />
                  <Label htmlFor="ttd">TTD & Stempel (Depan)</Label>
                </div>
                <div className="md:col-span-2">
                  <Button variant="outline" onClick={() => setIsBackTextDialogOpen(true)} className="w-full">
                    <Settings2 className="mr-2 h-4 w-4" /> Atur Teks Halaman Belakang
                  </Button>
                </div>
                <div className="md:col-span-2">
                  <Button variant="outline" onClick={() => setIsLayoutEditorOpen(true)} className="w-full">
                    <LayoutTemplate className="mr-2 h-4 w-4" /> Editor Layout Kartu
                  </Button>
                </div>
              </div>

              {/* FORM TANGGAL CETAK (CRUD) */}
              <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end border rounded-lg p-3 bg-muted/30">
                <div className="space-y-1">
                  <Label className="text-xs">📅 Tanggal Cetak (tampil di kartu depan)</Label>
                  <Input value={printDateText} onChange={(e) => setPrintDateText(e.target.value)} placeholder={`Otomatis: ${defaultPrintDate}`} />
                  <p className="text-[11px] text-muted-foreground">Kosongkan untuk memakai tanggal hari ini secara otomatis. Posisi diatur via Editor Layout (Tanggal Cetak X/Y).</p>
                </div>
                <Button onClick={() => saveLayoutMutation.mutate()} disabled={saveLayoutMutation.isPending}>
                  {saveLayoutMutation.isPending ? 'Menyimpan...' : 'Simpan Tanggal'}
                </Button>
              </div>

              <div>
                <h3 className="font-semibold mb-2 text-sm">Preview Kartu</h3>
                {isLoadingPrintData ? (
                  <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" /> Memuat data & membuat QR/barcode...
                  </div>
                ) : (
                  <div key={`pg-${layoutKey}`} className="id-preview-grid max-h-[50vh] overflow-y-auto p-3 bg-muted/40 rounded-lg">
                    {printStudents.map((student) => (
                      <Fragment key={student.id}>
                        {renderCardFront(student)}
                        {printTemplate === 'both' && renderCardBack(student)}
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsPrintCardsDialogOpen(false)} className="flex-1">Tutup</Button>
                <Button variant="secondary" onClick={handleExecutePrint} className="flex-1" disabled={isLoadingPrintData}>
                  <Printer className="mr-2 h-4 w-4" /> Cetak Sekarang
                </Button>
                <Button onClick={handleDownloadPdf} className="flex-1" disabled={isLoadingPrintData || isGeneratingPdf}>
                  {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                  Download PDF
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ===== DIALOG TEKS BELAKANG ===== */}
        <Dialog open={isBackTextDialogOpen} onOpenChange={setIsBackTextDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" /> Atur Teks Halaman Belakang Kartu
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Judul Utama (putih, di band atas)</Label>
                <Textarea value={backTitle} onChange={(e) => setBackTitle(e.target.value)} rows={3} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Subjudul (hitam, posisi terpisah)</Label>
                <Textarea value={backSub} onChange={(e) => setBackSub(e.target.value)} rows={2} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Teks Footer (Bawah)</Label>
                <Textarea value={backFooter} onChange={(e) => setBackFooter(e.target.value)} rows={2} />
              </div>
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setIsBackTextDialogOpen(false)} className="flex-1">Batal</Button>
              <Button onClick={() => saveBackTextMutation.mutate()} className="flex-1" disabled={saveBackTextMutation.isPending}>
                {saveBackTextMutation.isPending ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div id="print-student-cards-area">
          {isPrintCardsDialogOpen && (
            <div key={`pa-${layoutKey}`} className="print-grid">
              {printStudents.map((student) => (
                <Fragment key={student.id}>
                  {renderCardFront(student)}
                  {printTemplate === 'both' && renderCardBack(student)}
                </Fragment>
              ))}
            </div>
          )}
        </div>

        <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Pindah Kelas ({selectedStudentIds.length} Siswa)</DialogTitle></DialogHeader>
            <form onSubmit={handleBulkSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bulkClassId">Pindahkan ke Kelas</Label>
                <Select name="classId" required>
                  <SelectTrigger><SelectValue placeholder="Pilih kelas tujuan" /></SelectTrigger>
                  <SelectContent>{classes?.map((cls) => (<SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIsBulkEditOpen(false)} className="flex-1">Batal</Button>
                <Button type="submit" className="flex-1" disabled={bulkUpdateMutation.isPending}>
                  {bulkUpdateMutation.isPending ? 'Memproses...' : 'Perbarui'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Cari siswa..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                </div>
                <Button variant={showFilters ? "default" : "outline"} size="icon" onClick={() => setShowFilters(!showFilters)} title="Filter Lanjutan">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>

              {showFilters && (
                <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">Filter Lanjutan</h3>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={handleResetFilters}><X className="h-4 w-4 mr-1" /> Reset</Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Tingkat</Label>
                      <Select value={filterGrade || ALL} onValueChange={(v) => { setFilterGrade(v === ALL ? '' : v); setFilterClass(''); }}>
                        <SelectTrigger><SelectValue placeholder="Semua Tingkat" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL}>Semua Tingkat</SelectItem>
                          {gradeOptions.map((g) => (<SelectItem key={g} value={g}>Tingkat {g}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Kelas / Rombel</Label>
                      <Select value={filterClass || ALL} onValueChange={(v) => setFilterClass(v === ALL ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Semua Rombel" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL}>Semua Rombel</SelectItem>
                          {rombelOptions.map((cls: any) => (<SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Jenis Kelamin</Label>
                      <Select value={filterGender || ALL} onValueChange={(v) => setFilterGender(v === ALL ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Semua" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL}>Semua</SelectItem>
                          <SelectItem value="L">Laki-laki</SelectItem>
                          <SelectItem value="P">Perempuan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={filterAlumniStatus || ALL} onValueChange={(v) => setFilterAlumniStatus(v === ALL ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Semua Status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL}>Semua Status</SelectItem>
                          <SelectItem value="active">Siswa Aktif</SelectItem>
                          <SelectItem value="alumni">Alumni</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Tanggal Kelulusan (Dari)</Label><Input type="date" value={filterGraduationDateFrom} onChange={(e) => setFilterGraduationDateFrom(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Tanggal Kelulusan (Sampai)</Label><Input type="date" value={filterGraduationDateTo} onChange={(e) => setFilterGraduationDateTo(e.target.value)} /></div>
                  </div>
                  {hasActiveFilters && (
                    <div className="pt-2 border-t"><p className="text-sm text-muted-foreground">Menampilkan {totalCount || 0} siswa yang sesuai filter</p></div>
                  )}
                </div>
              )}

              {selectedStudentIds.length > 0 && (
                <div className="flex items-center justify-between p-2 bg-muted rounded-md flex-wrap gap-2">
                  <span className="text-sm font-medium">{selectedStudentIds.length} siswa dipilih</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleSelectAllFiltered}>
                      Pilih Semua Hasil Filter ({totalCount || 0})
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedStudentIds([])}>Batalkan Pilihan</Button>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <p>Halaman {currentPage} dari {totalPages} - Menampilkan {displayStudents.length} dari {totalCount || 0} siswa</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /> Prev</Button>
                  <span className="text-sm">{currentPage} / {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next <ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox checked={displayStudents.length > 0 && selectedStudentIds.length === displayStudents.length} onCheckedChange={handleSelectAll} />
                      </TableHead>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => handleSort('nis')} className="flex items-center gap-1 -ml-4 hover:bg-transparent">
                          NIS <ArrowUpDown className={`h-4 w-4 ${sortField === 'nis' ? 'text-primary' : ''}`} />
                        </Button>
                      </TableHead>
                      <TableHead>NISN</TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => handleSort('name')} className="flex items-center gap-1 -ml-4 hover:bg-transparent">
                          Nama <ArrowUpDown className={`h-4 w-4 ${sortField === 'name' ? 'text-primary' : ''}`} />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => handleSort('class')} className="flex items-center gap-1 -ml-4 hover:bg-transparent">
                          Kelas <ArrowUpDown className={`h-4 w-4 ${sortField === 'class' ? 'text-primary' : ''}`} />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" onClick={() => handleSort('gender')} className="flex items-center gap-1 -ml-4 hover:bg-transparent">
                          Jenis Kelamin <ArrowUpDown className={`h-4 w-4 ${sortField === 'gender' ? 'text-primary' : ''}`} />
                        </Button>
                      </TableHead>
                      <TableHead>Tanggal Lulus</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8">Loading...</TableCell></TableRow>
                    ) : displayStudents.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Tidak ada data siswa</TableCell></TableRow>
                    ) : (
                      displayStudents.map((student, index) => (
                        <TableRow key={student.id}>
                          <TableCell><Checkbox checked={selectedStudentIds.includes(student.id)} onCheckedChange={() => handleToggleStudent(student.id)} /></TableCell>
                          <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                          <TableCell className="font-medium"><HighlightText text={student.nis} searchTerm={searchTerm} /></TableCell>
                          <TableCell className="text-muted-foreground"><HighlightText text={student.nisn || '-'} searchTerm={searchTerm} /></TableCell>
                          <TableCell>
                            <button onClick={() => navigate(`/students/${student.id}`)} className="text-primary hover:underline font-medium text-left">
                              <HighlightText text={toTitleCase(student.full_name)} searchTerm={searchTerm} />
                            </button>
                          </TableCell>
                          <TableCell><HighlightText text={student.classes?.name || '-'} searchTerm={searchTerm} /></TableCell>
                          <TableCell>{student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</TableCell>
                          <TableCell>
                            {student.graduation_date ? (
                              <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                                <GraduationCap className="h-3 w-3" /> {formatDateID(student.graduation_date)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" onClick={() => { setEditingStudent(student); setIsDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => { if (confirm('Yakin ingin menghapus siswa ini?')) deleteStudentMutation.mutate(student.id); }}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">Halaman {currentPage} dari {totalPages}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="gap-1">
                      <ChevronLeft className="h-4 w-4" /> Sebelumnya
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="gap-1">
                      Selanjutnya <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <ImportStudents />
      </div>
    </DashboardLayout>
  );
}

export default function Students() {
  return (
    <ProtectedRoute requireRole="admin">
      <StudentsPage />
    </ProtectedRoute>
  );
}