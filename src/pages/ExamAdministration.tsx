import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Printer, Users, Grid3x3, Hash, FileText, Eye, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JsBarcode from "jsbarcode";
import { addLetterheadToPDF, addQRCodeToPDF } from "@/lib/pdfLetterhead";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DraftNumberInput } from "@/components/exam/DraftNumberInput";
import { buildRooms, filterRoomsKeepNumbers, validateStartNumbers, DEFAULT_START_NUMBERS, snakeTableNumber } from "@/lib/examSeating";
import { buildClassColorMap, createImageLoader, fitText, ellipsize, shortDateLabel } from "@/lib/examPdf";
import { PAPER_LABEL, paperFormat, type PdfPaper } from "@/lib/pdfPaper";
import { layoutIdentityRows } from "@/lib/examCardLayout";


interface Student {
  id: string;
  nis: string;
  nisn?: string;
  full_name: string;
  class_id: string;
  photo_url?: string;
  gender?: string;
  birth_place?: string;
  birth_date?: string;
  classes: {
    name: string;
    grade: number;
  };
}

interface SeatingArrangement {
  tableNumber: number;
  examNumber: number;
  student: Student;
}

interface Room {
  roomNumber: number;
  seats: SeatingArrangement[];
}

const ExamAdministration = () => {
  const [selectedGrades, setSelectedGrades] = useState<string[]>(['7', '8', '9']);
  const [rowsCount, setRowsCount] = useState(8);
  const [columnsCount, setColumnsCount] = useState(4);
  const [startingExamNumberGrade7, setStartingExamNumberGrade7] = useState(25267);
  const [startingExamNumberGrade8, setStartingExamNumberGrade8] = useState(25268);
  const [startingExamNumberGrade9, setStartingExamNumberGrade9] = useState(25269);
  const [previewRooms, setPreviewRooms] = useState<Room[]>([]);
  const [activePreview, setActivePreview] = useState<'seating' | 'cards' | 'numbers'>('seating');
  const [showCardPreview, setShowCardPreview] = useState(false);
  const [cardSize, setCardSize] = useState<'portrait' | 'landscape' | '10x8' | 'custom'>('portrait');
  const [customCardWidth, setCustomCardWidth] = useState<number>(85);
  const [customCardHeight, setCustomCardHeight] = useState<number>(54);
  const [fontScale, setFontScale] = useState<number>(1);
  const [seatingMode, setSeatingMode] = useState<'auto' | 'alternating' | 'by_class'>('auto');
  const [filterType, setFilterType] = useState<'all' | 'class' | 'student'>('all');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showPhotoOnCard, setShowPhotoOnCard] = useState<boolean>(true);
  const [paper, setPaper] = useState<PdfPaper>('f4');
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [layoutWarnings, setLayoutWarnings] = useState<string[]>([]);

  // Print progress state (prevents auto-logout & shows feedback)
  const [printProgress, setPrintProgress] = useState<{ open: boolean; value: number; current: number; total: number; label: string }>({
    open: false, value: 0, current: 0, total: 0, label: '',
  });
  const activityKeepAliveRef = useRef<number | null>(null);

  const startKeepAlive = () => {
    if (activityKeepAliveRef.current) return;
    activityKeepAliveRef.current = window.setInterval(() => {
      // Dispatch synthetic activity to reset inactivity-based auto-logout timers
      window.dispatchEvent(new Event('mousemove'));
      document.dispatchEvent(new Event('mousemove'));
    }, 30_000);
  };
  const stopKeepAlive = () => {
    if (activityKeepAliveRef.current) {
      clearInterval(activityKeepAliveRef.current);
      activityKeepAliveRef.current = null;
    }
  };
  useEffect(() => () => stopKeepAlive(), []);


  // Function to convert name to Title Case
  const toTitleCase = (name: string): string => {
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Function to format date with Indonesian month name
  const formatDateWithMonthName = (date: Date): string => {
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const day = String(date.getDate()).padStart(2, '0');
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Fetch only ACTIVE (non-alumni, non-mutated) students for exam administration
  const { data: students = [], isLoading, isError: studentsError, error: studentsErrorDetail, refetch: refetchStudents } = useQuery({
    queryKey: ['students-for-exam-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select(`
          id,
          nis,
          nisn,
          full_name,
          class_id,
          photo_url,
          gender,
          birth_place,
          birth_date,
          status,
          is_alumni,
          classes (
            name,
            grade
          )
        `)
        .eq('status', 'aktif')
        .eq('is_alumni', false)
        .order('full_name');

      if (error) throw error;

      // Siswa yang pernah dimutasi keluar tidak ikut ujian. Daftar mutasi diambil apa adanya (tabel kecil, dibatasi RLS)
      // dan dicocokkan di sini, tanpa daftar ratusan id di alamat permintaan (alamat panjang bisa memicu 502 di proxy).
      const mutatedIds = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data: mut, error: mutErr } = await supabase
          .from('student_mutations')
          .select('student_id')
          .order('id')
          .range(from, from + 999);
        if (mutErr) throw mutErr;
        (mut || []).forEach((m: any) => mutatedIds.add(m.student_id));
        if (!mut || mut.length < 1000) break;
      }
      // siswa tanpa kelas tidak bisa ditempatkan di ruang ujian
      return (data as Student[]).filter((s: any) => s.classes && !mutatedIds.has(s.id));
    },
  });


  // Fetch school settings
  const { userRole } = useAuth();
  // Panitia ujian tidak membaca tabel school_settings langsung: lewat fungsi server yang hanya memuat kolom ujian.
  const viaRpc = userRole === 'panitia_ujian';
  const { data: settings } = useQuery({
    queryKey: [viaRpc ? 'exam-settings' : 'school-settings'],
    queryFn: async () => {
      if (viaRpc) {
        const { data, error } = await (supabase as any).rpc('exam_settings_get');
        if (error) throw error;
        return data as any;
      }
      const { data, error } = await supabase
        .from('school_settings')
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Username (email login) siswa untuk kartu peserta, lewat fungsi server (panitia tidak membaca tabel akun langsung).
  // Bila migrasi 20261121170000_exam_student_usernames.sql belum dijalankan, kartu tetap tercetak dengan "-".
  const { data: usernameMap, refetch: refetchUsernames } = useQuery({
    queryKey: ['exam-student-usernames'],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const map = new Map<string, string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await (supabase as any).rpc('exam_student_usernames').range(from, from + 999);
        if (error) throw error;
        (data || []).forEach((r: any) => { if (r?.student_id && r?.username) map.set(r.student_id, String(r.username)); });
        if (!data || data.length < 1000) break;
      }
      return map;
    },
  });
  const usernameOf = (studentId: string): string => usernameMap?.get(studentId) || '-'; // pratinjau layar

  // Semua pengaturan yang disimpan (kartu + ruang + nomor peserta) dalam satu objek
  const startNumbers: Record<string, number> = {
    '7': startingExamNumberGrade7, '8': startingExamNumberGrade8, '9': startingExamNumberGrade9,
  };
  const buildPayload = () => ({
    cardSize, customCardWidth, customCardHeight, fontScale, seatingMode, showPhotoOnCard,
    rowsCount, columnsCount, startNumbers, paper, selectedGrades: [...selectedGrades].sort(),
  });
  const payloadKey = JSON.stringify(buildPayload());
  const dirty = savedSnapshot !== null && payloadKey !== savedSnapshot;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const startNumberErrors = validateStartNumbers(startNumbers, selectedGrades);
  const hasNumberErrors = Object.keys(startNumberErrors).length > 0;

  // Muat pengaturan tersimpan (sekali per data server; tidak menimpa ketikan yang belum disimpan)
  useEffect(() => {
    if (!settings || dirtyRef.current) return; // jangan menimpa perubahan yang belum disimpan
    const cfg = ((settings as any)?.exam_card_settings && typeof (settings as any).exam_card_settings === 'object')
      ? (settings as any).exam_card_settings : {};
    const num = (v: any, d: number, min: number, max: number) => (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Math.floor(Number(v)) : d);
    const sn = cfg.startNumbers || {};
    const loaded = {
      cardSize: ['portrait', 'landscape', '10x8', 'custom'].includes(cfg.cardSize) ? cfg.cardSize : 'portrait',
      customCardWidth: num(cfg.customCardWidth, 85, 40, 200),
      customCardHeight: num(cfg.customCardHeight, 54, 30, 200),
      fontScale: Number.isFinite(Number(cfg.fontScale)) && Number(cfg.fontScale) >= 0.7 && Number(cfg.fontScale) <= 1.6 ? Number(cfg.fontScale) : 1,
      seatingMode: ['auto', 'alternating', 'by_class'].includes(cfg.seatingMode) ? cfg.seatingMode : 'auto',
      showPhotoOnCard: typeof cfg.showPhotoOnCard === 'boolean' ? cfg.showPhotoOnCard : true,
      rowsCount: num(cfg.rowsCount, 8, 1, 20),
      columnsCount: num(cfg.columnsCount, 4, 1, 12),
      startNumbers: {
        '7': num(sn['7'], DEFAULT_START_NUMBERS['7'], 10000, 99999),
        '8': num(sn['8'], DEFAULT_START_NUMBERS['8'], 10000, 99999),
        '9': num(sn['9'], DEFAULT_START_NUMBERS['9'], 10000, 99999),
      },
      paper: (cfg.paper === 'a4' ? 'a4' : 'f4') as PdfPaper,
      selectedGrades: Array.isArray(cfg.selectedGrades) && cfg.selectedGrades.length
        ? cfg.selectedGrades.filter((g: any) => ['7', '8', '9'].includes(String(g))).map(String) : ['7', '8', '9'],
    };
    setCardSize(loaded.cardSize as any); setCustomCardWidth(loaded.customCardWidth); setCustomCardHeight(loaded.customCardHeight);
    setFontScale(loaded.fontScale); setSeatingMode(loaded.seatingMode as any); setShowPhotoOnCard(loaded.showPhotoOnCard);
    setRowsCount(loaded.rowsCount); setColumnsCount(loaded.columnsCount);
    setStartingExamNumberGrade7(loaded.startNumbers['7']); setStartingExamNumberGrade8(loaded.startNumbers['8']); setStartingExamNumberGrade9(loaded.startNumbers['9']);
    setPaper(loaded.paper); setSelectedGrades(loaded.selectedGrades.length ? loaded.selectedGrades : ['7', '8', '9']);
    setSavedSnapshot(JSON.stringify({ ...loaded, selectedGrades: [...(loaded.selectedGrades.length ? loaded.selectedGrades : ['7', '8', '9'])].sort() }));
  }, [settings]);

  const saveExamCardSettings = async () => {
    if (hasNumberErrors) { toast.error('Perbaiki nomor peserta awal terlebih dahulu.'); return; }
    if (!settings) { toast.error('Pengaturan sekolah belum dimuat.'); return; }
    setSaving(true);
    try {
      const payload = { ...((settings as any)?.exam_card_settings || {}), ...buildPayload() };
      const { error } = viaRpc
        ? await (supabase as any).rpc('exam_settings_save', { p_exam_card_settings: payload })
        : await supabase.from('school_settings').update({ exam_card_settings: payload } as any).eq('id', (settings as any).id);
      if (error) throw error;
      setSavedSnapshot(payloadKey);
      toast.success("Pengaturan ujian disimpan");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ? `Gagal menyimpan: ${e.message}` : "Gagal menyimpan pengaturan");
    } finally { setSaving(false); }
  };

  const handleGradeToggle = (grade: string) => {
    setSelectedGrades(prev => {
      if (prev.includes(grade)) {
        return prev.filter(g => g !== grade);
      }
      return [...prev, grade];
    });
  };

  /**
   * Susun SELURUH siswa tingkat terpilih ke ruang/meja/nomor peserta (deterministik; urutan nama dalam kelas).
   * Filter kelas/siswa pada cetak kartu TIDAK mengubah susunan ini (lihat filterForCards).
   */
  const generateRooms = (silent = false): Room[] => {
    if (hasNumberErrors) {
      if (!silent) toast.error('Nomor peserta awal belum valid. Perbaiki isian nomor peserta terlebih dahulu.');
      return [];
    }
    const { rooms, warnings } = buildRooms(students as any[], {
      grades: selectedGrades, rows: rowsCount, cols: columnsCount, mode: seatingMode, startNumbers,
    });
    setLayoutWarnings(warnings);
    if (rooms.length === 0) {
      if (!silent) toast.error("Tidak ada siswa untuk kelas yang dipilih");
      return [];
    }
    return rooms as unknown as Room[];
  };

  /** Saring kartu yang dicetak (per kelas / siswa tertentu) tanpa mengubah ruang, meja, dan nomor pesertanya. */
  const filterForCards = (rooms: Room[]): Room[] => {
    if (filterType === 'class' && selectedClasses.length > 0) {
      return filterRoomsKeepNumbers(rooms as any, (st: any) => selectedClasses.includes(st.classes.name)) as unknown as Room[];
    }
    if (filterType === 'student' && selectedStudentIds.length > 0) {
      return filterRoomsKeepNumbers(rooms as any, (st: any) => selectedStudentIds.includes(st.id)) as unknown as Room[];
    }
    return rooms;
  };

  // Pratinjau ikut diperbarui otomatis saat pengaturan/ data siswa berubah, sehingga selalu sama dengan yang dicetak
  useEffect(() => {
    if (previewRooms.length === 0) return;
    const r = generateRooms(true);
    if (r.length > 0) setPreviewRooms(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, selectedGrades, rowsCount, columnsCount, seatingMode, startingExamNumberGrade7, startingExamNumberGrade8, startingExamNumberGrade9]);

  // Warna kelas: satu warna per kelas menurut urutan nama (tidak bentrok antar kelas)
  const classColorMap = useMemo(() => buildClassColorMap(students.map((st) => st.classes.name)), [students]);

  // Generate barcode as base64 image
  const generateBarcode = (text: string): string => {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, text, {
      format: "CODE128",
      width: 2,
      height: 40,
      displayValue: false,
      margin: 0
    });
    return canvas.toDataURL('image/png');
  };

  // Warna kelas (peta dihitung dari seluruh kelas, lihat classColorMap)
  const getClassColor = (className: string): { r: number; g: number; b: number; hex: string } =>
    classColorMap.get(className) || { r: 71, g: 85, b: 105, hex: '#475569' };

  const handlePrintExamCards = async () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const allRooms = generateRooms();
    if (allRooms.length === 0) return;
    // filter kelas/siswa hanya menyaring kartu; ruang, meja, dan nomor peserta tetap sesuai susunan lengkap
    const rooms = filterForCards(allRooms);
    if (rooms.length === 0) { toast.error("Tidak ada kartu yang cocok dengan filter yang dipilih"); return; }

    const totalCards = rooms.reduce((s, r) => s + r.seats.length, 0);
    setPrintProgress({ open: true, value: 0, current: 0, total: totalCards, label: 'Menyiapkan kartu ujian...' });
    startKeepAlive();

    // username siswa: pakai data yang sudah dimuat, atau muat sekarang; gagal (migrasi belum dijalankan) → kartu tetap dicetak dengan "-"
    let unameMap = usernameMap;
    if (!unameMap) {
      try { unameMap = (await refetchUsernames()).data; } catch { unameMap = undefined; }
    }
    if (!unameMap) toast.warning('Username siswa tidak dapat dimuat, kolom Username dicetak "-". Pastikan migrasi 20261121170000_exam_student_usernames.sql sudah dijalankan.', { duration: 9000 });

    try {
      const doc = new jsPDF('portrait', 'mm', paperFormat(paper));
      const loadImg = createImageLoader(); // logo, tanda tangan, stempel hanya dimuat sekali
      let scheduleHidden = 0; // jumlah sesi jadwal yang tidak muat pada kartu
      let signatureSkipped = 0; // kartu yang tanda tangannya dilewati karena tidak ada ruang
      let identityOverflow = 0; // kelebihan tinggi data peserta melampaui tepi kartu (mm)

      // Card layout based on selected size
      let cardsPerPage: number;
      let cardWidth: number;
      let cardHeight: number;
      let marginX: number;
      let marginY: number;
      let gapX: number;
      let gapY: number;
      let cols: number;
      
      const PAGE_W = doc.internal.pageSize.getWidth(), PAGE_H = doc.internal.pageSize.getHeight();
      if (cardSize === 'portrait') {
        cardWidth = 63; cardHeight = 103; cols = 3;
      } else if (cardSize === 'landscape') {
        cardWidth = 85; cardHeight = 54; cols = 2;
      } else if (cardSize === '10x8') {
        // 10cm x 8cm landscape
        cardWidth = 100; cardHeight = 80; cols = 2;
      } else {
        cardWidth = Math.min(customCardWidth || 85, PAGE_W - 10);
        cardHeight = Math.min(customCardHeight || 54, PAGE_H - 10);
        cols = Math.max(1, Math.floor((PAGE_W - 10) / (cardWidth + 5)));
      }
      gapX = 5; gapY = 5;
      const rowsPerPage = Math.max(1, Math.floor((PAGE_H - 10) / (cardHeight + gapY)));
      cardsPerPage = cols * rowsPerPage;
      marginX = Math.max(3, (PAGE_W - (cols * cardWidth + (cols - 1) * gapX)) / 2);
      marginY = 5;
      
      let cardCount = 0;
      let isFirstPage = true;

      // Get exam schedule from settings or use empty array
      const examSchedule = ((settings as any)?.exam_schedule as Array<{
        no: number;
        day: string;
        date: string;
        subject: string;
        time: string;
        duration: string;
      }>) || [];

      for (const room of rooms) {
        for (let i = 0; i < room.seats.length; i++) {
          const seat = room.seats[i];
          const cardIndex = cardCount % cardsPerPage;
          
          if (cardIndex === 0 && !isFirstPage) {
            doc.addPage();
          }
          isFirstPage = false;
          
          // Calculate card position based on columns
          const col = cardIndex % cols;
          const row = Math.floor(cardIndex / cols);
          
          const cardX = marginX + col * (cardWidth + gapX);
          const cardY = marginY + row * (cardHeight + gapY);
          
          // ---------- LAYOUT CONSTANTS (proportional, scaled by fontScale) ----------
          const fs = (n: number) => Math.max(2.5, n * fontScale);
          const pad = 3;
          const innerW = cardWidth - pad * 2;

          // Reserved heights
          // Tanda tangan: tumpukan tetap dari bawah kartu (tanggal, jabatan, ruang TTD+stempel, nama, NIP), tinggi dihitung dari isinya
          const sigLh = fs(2.4); // jarak antarbaris
          const sigZoneH = Math.min(11.5, Math.max(8, cardHeight * 0.1)); // ruang tanda tangan; stempel sedikit lebih besar dari ruang ini (menjorok ±1 mm ke atas/bawah)
          const sigHasNip = !!settings?.headmaster_nip;
          const sigNeed = sigLh * (3 + (sigHasNip ? 1 : 0)) + sigZoneH + 1.4; // 2 baris atas + nama (+NIP) + ruang gambar + celah
          const sigTop = cardY + cardHeight - pad - sigNeed; // batas atas blok tanda tangan (baris tanggal)
          const usableH = sigTop - 0.2 - cardY; // area jadwal berakhir tepat di atas blok tanda tangan (tabel sendiri menyisakan ±4 mm)

          // Background + border
          doc.setFillColor(250, 250, 252);
          doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 2, 2, 'F');
          doc.setDrawColor(59, 130, 246);
          doc.setLineWidth(0.6);
          doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 2, 2, 'S');

          let currentY = cardY + pad + 2;

          // ---------- LETTERHEAD ----------
          const miniLogoSize = Math.min(cardHeight * 0.09, 10);
          const headerStartY = currentY;
          const [leftLogo, rightLogo] = await Promise.all([
            settings?.logo_url ? loadImg(settings.logo_url) : Promise.resolve(null),
            settings?.right_logo_url ? loadImg(settings.right_logo_url) : Promise.resolve(null),
          ]);
          if (leftLogo) doc.addImage(leftLogo, 'PNG', cardX + pad, headerStartY, miniLogoSize, miniLogoSize, 'kartuLogoKiri');
          if (rightLogo) doc.addImage(rightLogo, 'PNG', cardX + cardWidth - pad - miniLogoSize, headerStartY, miniLogoSize, miniLogoSize, 'kartuLogoKanan');

          const centerX = cardX + cardWidth / 2;
          const headerTextW = innerW - miniLogoSize * 2 - 4;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 41, 59);

          if (settings?.district_name) {
            const t = fitText(doc, settings.district_name, headerTextW, fs(5.5), 3);
            doc.text(t, centerX, currentY + 2, { align: "center" });
            currentY += fs(2.2);
          }
          if (settings?.school_name) {
            const t = fitText(doc, settings.school_name, headerTextW, fs(6.5), 3.5);
            doc.text(t, centerX, currentY + 2.5, { align: "center" });
            currentY += fs(3);
          }
          const compact = cardHeight < 70; // kartu pendek: alamat dilewati, tahun pelajaran digabung ke nama ujian
          if (settings?.school_address && !compact) {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            const t = fitText(doc, settings.school_address, headerTextW, fs(4.5), 3);
            doc.text(t, centerX, currentY + 2, { align: "center" });
            currentY += fs(2);
          }
          // Make sure header doesn't overlap logos
          currentY = Math.max(currentY + 1, headerStartY + miniLogoSize + 0.5);
          // Separator
          doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.4);
          doc.line(cardX + pad, currentY, cardX + cardWidth - pad, currentY);
          doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
          doc.line(cardX + pad, currentY + 0.5, cardX + cardWidth - pad, currentY + 0.5);
          currentY += 2.5;

          // ---------- TITLE ----------
          doc.setFontSize(fs(7));
          doc.setFont("helvetica", "bold");
          doc.setTextColor(59, 130, 246);
          doc.text("KARTU PESERTA UJIAN", centerX, currentY + 1, { align: "center" });
          currentY += fs(3);
          if (settings?.exam_name) {
            doc.setTextColor(30, 41, 59);
            const examLine = compact && settings?.academic_year ? `${settings.exam_name} • TP ${settings.academic_year}` : settings.exam_name;
            doc.text(fitText(doc, examLine, innerW, fs(5), 3), centerX, currentY, { align: "center" });
            currentY += fs(2.5);
          }
          if (settings?.academic_year && !compact) {
            doc.setFontSize(fs(4.5));
            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            doc.text(`Tahun Pelajaran ${settings.academic_year}`, centerX, currentY, { align: "center" });
            currentY += fs(2.5);
          }

          // ---------- INFO BAR (Ruang / Meja) ----------
          const infoBarH = fs(4.5);
          doc.setFillColor(59, 130, 246);
          doc.roundedRect(cardX + pad, currentY, innerW, infoBarH, 1, 1, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(fs(5.5));
          doc.setFont("helvetica", "bold");
          doc.text(`RUANG ${room.roomNumber}`, cardX + pad + 2, currentY + infoBarH * 0.7);
          doc.text(`MEJA: ${seat.tableNumber}`, cardX + cardWidth - pad - 2, currentY + infoBarH * 0.7, { align: "right" });
          currentY += infoBarH + 1.5;

          // ---------- IDENTITY + PHOTO ----------
          // Photo (3x4) — optional based on settings
          const photoH = showPhotoOnCard ? Math.min(cardHeight * 0.28, 26) : 0;
          const photoW = showPhotoOnCard ? photoH * 0.75 : 0;
          const photoX = cardX + cardWidth - pad - photoW;
          const photoY = currentY;
          if (showPhotoOnCard) {
            doc.setDrawColor(30, 41, 59); doc.setLineWidth(0.3);
            doc.rect(photoX, photoY, photoW, photoH, 'S');
            if (seat.student.photo_url) {
              const ph = await loadImg(seat.student.photo_url, 'jpeg');
              if (ph) doc.addImage(ph, 'JPEG', photoX + 0.3, photoY + 0.3, photoW - 0.6, photoH - 0.6);
            } else {
              doc.setFontSize(fs(4)); doc.setTextColor(150, 150, 150);
              doc.text("Foto 3x4", photoX + photoW / 2, photoY + photoH / 2, { align: 'center' });
            }
          }

          // Identity rows: kolom sempit di kiri foto; baris yang jatuh di bawah foto memakai lebar penuh
          const infoFs = fs(4.8);
          const rowH = fs(2.9);
          const ttlBirth = [seat.student.birth_place, seat.student.birth_date ? formatDateWithMonthName(new Date(seat.student.birth_date)) : ''].filter(Boolean).join(', ');

          const idRows: Array<{ label: string; value: string; maxLines?: number }> = [
            { label: "No. Peserta", value: seat.examNumber.toString(), maxLines: 1 },
            { label: "NIS", value: seat.student.nis || '-', maxLines: 1 },
            { label: "NISN", value: seat.student.nisn || '-', maxLines: 1 },
            { label: "Nama", value: toTitleCase(seat.student.full_name), maxLines: 2 },
            { label: "Kelas", value: seat.student.classes.name, maxLines: 1 },
            { label: "TTL", value: ttlBirth || '-', maxLines: 2 },
            { label: "Username", value: unameMap?.get(seat.student.id) || '-', maxLines: 2 },
          ];

          // lebar kolom label mengikuti label terpanjang (bukan angka tetap) agar tidak menabrak nilai
          doc.setFont("helvetica", "bold"); doc.setFontSize(infoFs);
          const labelW = Math.min(innerW * 0.4, Math.max(...idRows.map(r => doc.getTextWidth(r.label))) + 3.5);
          const labelX = cardX + pad;
          const valueX = labelX + labelW;
          const rightLimit = cardX + cardWidth - pad;
          const narrowW = (showPhotoOnCard ? rightLimit - photoW - 2 : rightLimit) - valueX;
          const fullW = rightLimit - valueX;
          doc.setFont("helvetica", "normal"); // pengukuran nilai memakai huruf biasa
          const infoStartY = currentY + fs(2.2);
          const { placed, endY } = layoutIdentityRows(
            (t) => doc.getTextWidth(t), idRows,
            { startY: infoStartY, rowH, narrowW, fullW, photoBottom: showPhotoOnCard ? photoY + photoH + 1.8 : -1 },
          );
          placed.forEach((r) => {
            doc.setFont("helvetica", "bold"); doc.setTextColor(71, 85, 105);
            doc.text(r.label, labelX, r.y);
            doc.setFont("helvetica", "normal"); doc.setTextColor(30, 41, 59);
            doc.text(":", valueX - 2, r.y);
            r.lines.forEach((ln, li) => doc.text(ln, valueX, r.y + li * rowH));
          });
          const infoY = endY;
          identityOverflow = Math.max(identityOverflow, infoY - (cardY + cardHeight - 2));
          currentY = Math.max(infoY, photoY + photoH) + 1.5;


          // ---------- SCHEDULE TABLE (constrained inside usable area) ----------
          if (examSchedule && examSchedule.length > 0 && currentY >= cardY + usableH - 4) scheduleHidden = Math.max(scheduleHidden, examSchedule.length);
          if (examSchedule && examSchedule.length > 0 && currentY < cardY + usableH - 4) {
            const remaining = (cardY + usableH) - currentY;
            const rowHeight = Math.max(2.6, fs(3));
            const headerH = rowHeight;
            const maxRows = Math.max(1, Math.floor((remaining - headerH - 2.4) / rowHeight));
            const showRows = Math.min(examSchedule.length, maxRows);
            if (showRows < examSchedule.length) scheduleHidden = Math.max(scheduleHidden, examSchedule.length - showRows);

            doc.setFontSize(fs(4.5));
            doc.setFont("helvetica", "bold");
            doc.setTextColor(59, 130, 246);
            doc.text("JADWAL UJIAN", centerX, currentY, { align: "center" });
            currentY += fs(2.2);

            const tStartX = cardX + pad;
            const tW = innerW;
            // Proportional cols: No 8%, Hari/Tgl 26%, Mapel 38%, Pukul 16%, Durasi 12%
            const colW = [tW * 0.08, tW * 0.26, tW * 0.38, tW * 0.16, tW * 0.12];

            doc.setFillColor(59, 130, 246);
            doc.rect(tStartX, currentY, tW, headerH, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(fs(3.8));
            const headerLabels = ["No", "Hari/Tgl", "Mapel", "Pukul", "Durasi"];
            let cX = tStartX;
            headerLabels.forEach((h, i) => {
              doc.text(h, cX + colW[i] / 2, currentY + headerH * 0.7, { align: "center", maxWidth: colW[i] - 0.5 });
              cX += colW[i];
            });
            currentY += headerH;

            doc.setTextColor(30, 41, 59);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(fs(3.2));
            examSchedule.slice(0, showRows).forEach((schedule, idx) => {
              if (idx % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(tStartX, currentY, tW, rowHeight, 'F');
              }
              cX = tStartX;
              const cellY = currentY + rowHeight * 0.7;
              doc.text(schedule.no.toString(), cX + colW[0] / 2, cellY, { align: "center" });
              cX += colW[0];
              doc.text(ellipsize(doc, shortDateLabel(schedule.day, schedule.date), colW[1] - 1), cX + 0.5, cellY);
              cX += colW[1];
              doc.text(ellipsize(doc, schedule.subject, colW[2] - 1), cX + 0.5, cellY);
              cX += colW[2];
              doc.text(ellipsize(doc, (schedule.time || '').replace(/\s*-\s*/, '-'), colW[3] - 0.6), cX + colW[3] / 2, cellY, { align: "center" });
              cX += colW[3];
              const durRaw = String(schedule.duration ?? '');
              const dur = durRaw.includes(':')
                ? `${parseInt(durRaw.split(':')[0]) * 60 + parseInt(durRaw.split(':')[1])}'`
                : durRaw;
              doc.text(ellipsize(doc, dur, colW[4] - 0.6), cX + colW[4] / 2, cellY, { align: "center" });
              currentY += rowHeight;
            });
            doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.4);
            doc.rect(tStartX, currentY - (showRows + 1) * rowHeight, tW, (showRows + 1) * rowHeight);
          }

          // ---------- SIGNATURE (ditumpuk dari bawah kartu; stempel/tanda tangan di ruangnya sendiri, tidak menimpa teks) ----------
          // tanda tangan hanya digambar bila tidak menimpa data peserta/jadwal di atasnya
          if (sigTop - 0.2 >= currentY - 0.5) {
            const sigBlockW = Math.min(cardWidth * 0.52, 36);
            const sigCenterX = cardX + cardWidth - pad - sigBlockW / 2; // rata kanan sejajar tepi tabel
            const dateStr = formatDateWithMonthName(new Date());
            const line = (txt: string, y: number, style: 'normal' | 'bold', size: number, rgb: [number, number, number]) => {
              doc.setFont("helvetica", style);
              doc.setTextColor(rgb[0], rgb[1], rgb[2]);
              doc.text(fitText(doc, txt, sigBlockW, size, 3), sigCenterX, y, { align: "center" }); // satu baris, tidak pernah turun/meluber
            };
            const y1 = sigTop + sigLh * 0.8;            // tanggal
            const y2 = y1 + sigLh;                      // jabatan
            const zoneTop = y2 + 1.0;                   // ruang tanda tangan + stempel
            const y3 = zoneTop + sigZoneH + sigLh * 0.9; // nama
            const y4 = y3 + sigLh;                      // NIP
            line(`${(settings as any)?.city_name || 'Ciamis'}, ${dateStr}`, y1, 'normal', fs(4.2), [71, 85, 105]);
            line((settings as any)?.headmaster_position || "Kepala Sekolah", y2, 'bold', fs(4.2), [30, 41, 59]);

            // tanda tangan di tengah ruangnya (tetap dalam rasio gambar bawaan 0.55)
            const sigImgW = Math.min(sigBlockW * 0.6, sigZoneH / 0.55);
            const sigImgH = sigImgW * 0.55;
            if (settings?.headmaster_signature_url) {
              const sg = await loadImg(settings.headmaster_signature_url);
              if (sg) doc.addImage(sg, 'PNG', sigCenterX - sigImgW / 2 + 1.5, zoneTop + (sigZoneH - sigImgH) / 2, sigImgW, sigImgH, 'kartuTtd');
            }
            // stempel resmi: lebih besar (sebanding dengan tanda tangan), di sisi kiri, dan MENIMPA sebagian kecil
            // (±28% lebar) ujung kiri tanda tangan, digambar setelah tanda tangan sehingga cap berada di atasnya
            if (settings?.school_stamp_url) {
              const st = await loadImg(settings.school_stamp_url);
              if (st) {
                const stampSize = Math.min(sigZoneH * 1.3, 14);
                const sigLeft = sigCenterX - sigImgW / 2 + 1.5;
                const stampX = Math.max(cardX + pad, sigLeft + sigImgW * 0.28 - stampSize);
                doc.addImage(st, 'PNG', stampX, zoneTop + (sigZoneH - stampSize) / 2, stampSize, stampSize, 'kartuStempel');
              }
            }
            line(settings?.headmaster_name || "___________________", y3, 'bold', fs(4.2), [30, 41, 59]);
            if (sigHasNip) line(`NIP. ${settings.headmaster_nip}`, y4, 'normal', fs(3.5), [71, 85, 105]);
          } else {
            signatureSkipped++;
          }

          cardCount++;
          // Update progress UI & yield to browser so it can repaint
          const pct = Math.round((cardCount / Math.max(1, totalCards)) * 100);
          setPrintProgress({
            open: true, value: pct, current: cardCount, total: totalCards,
            label: `Mencetak kartu ${cardCount} dari ${totalCards}...`,
          });
          if (cardCount % 5 === 0) {
            await new Promise(r => setTimeout(r, 0));
          }
        }
      }

      setPrintProgress(p => ({ ...p, value: 100, label: 'Menyimpan PDF...' }));
      doc.save(`kartu-ujian-${rooms.length}-ruangan-${cardCount}-kartu.pdf`);
      toast.success(`${cardCount} kartu ujian berhasil dicetak (${Math.ceil(cardCount/cardsPerPage)} halaman ${paper.toUpperCase()})`);
      if (identityOverflow > 0.5 || signatureSkipped > 0) {
        toast.warning(
          identityOverflow > 0.5
            ? 'Ukuran kartu terlalu kecil: data peserta melewati tepi kartu. Pilih ukuran 63x103 atau 100x80 mm, atau kecilkan skala tulisan.'
            : `Tanda tangan tidak dicetak karena kartu terlalu pendek (${signatureSkipped} kartu). Pilih ukuran 63x103 atau 100x80 mm.`,
          { duration: 9000 },
        );
      }
      if (scheduleHidden > 0) {
        toast.warning(`Jadwal pada kartu tidak muat (${scheduleHidden} sesi tidak tampil). Perbesar ukuran kartu atau kecilkan skala tulisan.`, { duration: 9000 });
      }
    } catch (error) {
      console.error("Error printing exam cards:", error);
      toast.error("Gagal mencetak kartu ujian. Silakan coba lagi.");
    } finally {
      stopKeepAlive();
      setTimeout(() => setPrintProgress({ open: false, value: 0, current: 0, total: 0, label: '' }), 600);
    }
  };


  const handlePrintSeatingChart = async () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const rooms = generateRooms();
    if (rooms.length === 0) return;

    const doc = new jsPDF('landscape', 'mm', paperFormat(paper));
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const M = 12; // margin halaman
    const cx = PW / 2;
    const BLUE: [number, number, number] = [41, 128, 185];
    const loadImg = createImageLoader(); // logo dimuat sekali untuk semua ruang
    const [leftLogo, rightLogo] = await Promise.all([loadImg(settings?.logo_url), loadImg(settings?.right_logo_url)]);
    const smallCells: string[] = [];
    // nama rombel di data berakhiran tahun ajaran (mis. 7A_2026/2027); pada denah cukup "7A"
    const shortClass = (n: string) => String(n).split('_')[0];

    for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
      const room = rooms[roomIndex];
      if (roomIndex > 0) doc.addPage();

      // ---------- Kop ----------
      const logoSize = 16;
      if (leftLogo) doc.addImage(leftLogo, 'PNG', M, M - 2, logoSize, logoSize, 'denahLogoKiri');
      if (rightLogo) doc.addImage(rightLogo, 'PNG', PW - M - logoSize, M - 2, logoSize, logoSize, 'denahLogoKanan');
      const headW = PW - 2 * (M + logoSize + 4);
      let y = M + 1;
      if (settings?.district_name) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60, 60, 60);
        doc.text(fitText(doc, settings.district_name.toUpperCase(), headW, 9, 6), cx, y, { align: "center" });
        y += 4.5;
      }
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(fitText(doc, (settings?.school_name || "NAMA SEKOLAH").toUpperCase(), headW, 13, 8), cx, y, { align: "center" });
      y += 5;
      const addr = [settings?.school_address, settings?.school_phone ? `Telp: ${settings.school_phone}` : ''].filter(Boolean).join(' | ');
      if (addr) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text(fitText(doc, addr, headW, 7.5, 5), cx, y, { align: "center" });
        y += 3.5;
      }
      y = Math.max(y, M + logoSize) + 0.5;
      doc.setDrawColor(...BLUE);
      doc.setLineWidth(0.6);
      doc.line(M, y, PW - M, y);
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(M, y + 0.9, PW - M, y + 0.9);
      y += 5.5;

      // ---------- Judul + ruang ----------
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BLUE);
      doc.setFontSize(13);
      doc.text("DENAH TEMPAT DUDUK PESERTA", cx, y, { align: "center" });
      y += 4.5;
      const subtitle = [settings?.exam_name, settings?.academic_year ? `Tahun Pelajaran ${settings.academic_year}` : ''].filter(Boolean).join('  •  ');
      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        doc.text(fitText(doc, subtitle, PW - 2 * M, 8.5, 6), cx, y, { align: "center" });
        y += 3.5;
      }
      y += 2.5;
      doc.setFillColor(...BLUE);
      doc.roundedRect(cx - 28, y - 4.2, 56, 6.4, 1, 1, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`RUANG ${room.roomNumber}  •  ${room.seats.length} PESERTA`, cx, y, { align: "center" });
      y += 5;

      // ---------- Ringkasan: tingkat, jenis kelamin ----------
      const gradeCount: Record<number, number> = {};
      const classCount: Record<string, number> = {};
      let male = 0, female = 0, unknown = 0;
      room.seats.forEach((seat) => {
        gradeCount[seat.student.classes.grade] = (gradeCount[seat.student.classes.grade] || 0) + 1;
        classCount[seat.student.classes.name] = (classCount[seat.student.classes.name] || 0) + 1;
        const g = (seat.student.gender || '').toUpperCase();
        if (g === 'L') male++; else if (g === 'P') female++; else unknown++;
      });
      const summary = [
        ...Object.entries(gradeCount).sort(([a], [b]) => Number(a) - Number(b)).map(([g, c]) => `Kelas ${g}: ${c}`),
        `Laki-laki: ${male}`,
        `Perempuan: ${female}`,
        ...(unknown ? [`Belum diisi: ${unknown}`] : []),
      ].join('   |   ');
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(fitText(doc, summary, PW - 2 * M, 8, 6), cx, y, { align: "center" });
      y += 4;

      // ---------- Legenda kelas (membungkus ke baris berikutnya sesuai lebar) ----------
      const classNames = Object.keys(classCount).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
      doc.setFontSize(7.5);
      let lx = M;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BLUE);
      doc.text("Legenda:", lx, y);
      lx += doc.getTextWidth("Legenda:") + 3;
      const legendStart = lx;
      doc.setFont("helvetica", "normal");
      classNames.forEach((name) => {
        const label = `${shortClass(name)} (${classCount[name]})`;
        const w = 5 + 1.5 + doc.getTextWidth(label) + 5;
        if (lx + w > PW - M && lx > legendStart) { lx = legendStart; y += 4.5; }
        const color = getClassColor(name);
        doc.setFillColor(color.r, color.g, color.b);
        doc.rect(lx, y - 3, 5, 3.6, 'F');
        doc.setTextColor(60, 60, 60);
        doc.text(label, lx + 6.5, y);
        lx += w;
      });
      y += 4;

      // ---------- Penanda pengawas / depan ruang ----------
      doc.setFillColor(50, 50, 50);
      doc.rect(cx - 40, y - 1, 80, 4.2, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text("MEJA PENGAWAS / DEPAN RUANGAN", cx, y + 2, { align: "center" });
      y += 6.5;

      // ---------- Grid kursi: seluruh sisa halaman dipakai ----------
      const footerH = 6;
      const gridW = PW - 2 * M;
      const cellW = gridW / columnsCount;
      const cellH = Math.min(24, (PH - M - footerH - y) / rowsCount);
      if (cellH < 11 && !smallCells.includes(room.roomNumber.toString())) smallCells.push(room.roomNumber.toString());
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      // semua ukuran huruf mengikuti ukuran kotak (lebar & tinggi), supaya proporsional pada 4 maupun 10 kolom
      const bar = clamp(cellH * 0.27, 3.4, 6.5);
      const barNumFs = clamp(bar * 2.0, 6, 13);
      const barSmallFs = clamp(bar * 1.45, 5, 9);
      const seatByTable = new Map(room.seats.map((s) => [s.tableNumber, s]));
      const lineH = (fs: number) => fs * 0.3528 * 1.15;

      for (let row = 0; row < rowsCount; row++) {
        for (let col = 0; col < columnsCount; col++) {
          const x = M + col * cellW;
          const cy = y + row * cellH;
          const seat = seatByTable.get(snakeTableNumber(row, col, columnsCount));
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.3);
          if (!seat) { doc.rect(x, cy, cellW, cellH); continue; }

          const color = getClassColor(seat.student.classes.name);
          doc.setFillColor(Math.floor(color.r + (255 - color.r) * 0.82), Math.floor(color.g + (255 - color.g) * 0.82), Math.floor(color.b + (255 - color.b) * 0.82));
          doc.rect(x, cy, cellW, cellH, 'FD');

          // bilah atas: kelas (kiri) | nomor meja (tengah) | L/P (kanan)
          doc.setFillColor(color.r, color.g, color.b);
          doc.rect(x, cy, cellW, bar, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          const barBase = cy + bar / 2 + barNumFs * 0.3528 * 0.35;
          doc.setFontSize(barNumFs);
          doc.text(String(seat.tableNumber), x + cellW / 2, barBase, { align: "center" });
          doc.setFontSize(barSmallFs);
          doc.text(ellipsize(doc, shortClass(seat.student.classes.name), cellW * 0.32), x + 1.5, cy + bar / 2 + barSmallFs * 0.3528 * 0.35);
          const g = (seat.student.gender || '').toUpperCase();
          doc.text(g === 'L' || g === 'P' ? g : '-', x + cellW - 1.5, cy + bar / 2 + barSmallFs * 0.3528 * 0.35, { align: "right" });

          // baris nomor peserta di dasar kotak
          const body = cy + bar;
          const bodyH = cellH - bar;
          const numFs = clamp(Math.min(cellW * 0.09, bodyH * 0.55), 5.5, 9);
          const numAreaH = lineH(numFs) + 1.2;
          const nameAreaH = bodyH - numAreaH;

          // nama: huruf sebesar mungkin yang masih muat (1 baris dulu, lalu 2 baris), tidak melebihi batas proporsi
          const full = toTitleCase(seat.student.full_name);
          const maxW = cellW - 3;
          const maxFs = clamp(Math.min(cellW * 0.16, nameAreaH * 2.4), 5, 12);
          doc.setTextColor(0, 0, 0);
          doc.setFont("helvetica", "bold");
          let nameFs = maxFs;
          let nameLines: string[] = [full];
          for (let fs = maxFs; fs >= 5; fs -= 0.5) {
            doc.setFontSize(fs);
            const ls: string[] = doc.splitTextToSize(full, maxW);
            nameFs = fs; nameLines = ls;
            if (ls.length * lineH(fs) <= nameAreaH + 0.2 && ls.length <= 2) break;
          }
          const maxLines = Math.max(1, Math.min(2, Math.floor(nameAreaH / lineH(nameFs))));
          if (nameLines.length > maxLines) {
            nameLines = nameLines.slice(0, maxLines);
            nameLines[maxLines - 1] = ellipsize(doc, nameLines[maxLines - 1] + ' …', maxW);
          }
          const blockH = nameLines.length * lineH(nameFs);
          const firstBase = body + (nameAreaH - blockH) / 2 + lineH(nameFs) * 0.78;
          nameLines.forEach((ln, i) => doc.text(ln, x + cellW / 2, firstBase + i * lineH(nameFs), { align: "center" }));

          // nomor peserta
          doc.setFont("helvetica", "normal");
          doc.setFontSize(numFs);
          doc.setTextColor(40, 40, 40);
          doc.text(ellipsize(doc, `No. ${seat.examNumber}`, cellW - 3), x + cellW / 2, cy + cellH - 1.4, { align: "center" });
        }
      }

      // ---------- Kaki halaman ----------
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(120, 120, 120);
      doc.text(`Ruang ${room.roomNumber} • halaman ${roomIndex + 1}/${rooms.length}`, PW - M, PH - M + 3, { align: "right" });
    }

    doc.save(`denah-duduk-${rooms.length}-ruangan.pdf`);
    toast.success(`Denah duduk untuk ${rooms.length} ruangan berhasil dicetak (${paper.toUpperCase()})`);
    if (smallCells.length > 0) {
      toast.warning(`Ruang ${smallCells.join(', ')}: baris terlalu banyak sehingga kotak kursi kecil. Kurangi jumlah baris atau pakai kertas F4.`, { duration: 9000 });
    }
  };

  const handleGeneratePreview = () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const rooms = generateRooms();
    if (rooms.length === 0) return;

    setPreviewRooms(rooms);
    toast.success(`Preview berhasil dibuat untuk ${rooms.length} ruangan`);
  };

  const handlePrintTableNumbers = async () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const rooms = generateRooms();
    if (rooms.length === 0) return;

    try {
      const doc = new jsPDF('portrait', 'mm', paperFormat(paper));
      const PW = doc.internal.pageSize.getWidth();
      const PH = doc.internal.pageSize.getHeight();

      // 5 kolom; jumlah baris menyesuaikan kertas (F4: 6 baris = 30 kartu, A4: 5 baris = 25 kartu); grid dipusatkan
      const cols = 5;
      const cardHeight = 52;
      const gapX = 1.5;
      const gapY = 1.5;
      const edge = 5;
      const cardWidth = (PW - 2 * edge - (cols - 1) * gapX) / cols;
      const rows = Math.max(1, Math.floor((PH - 2 * edge + gapY) / (cardHeight + gapY)));
      const cardsPerPage = cols * rows;
      const marginX = edge;
      const marginY = (PH - (rows * cardHeight + (rows - 1) * gapY)) / 2;
      
      let cardCount = 0;
      let isFirstPage = true;

      for (const room of rooms) {
        for (let i = 0; i < room.seats.length; i++) {
          const seat = room.seats[i];
          const cardIndex = cardCount % cardsPerPage;
          
          if (cardIndex === 0 && cardCount > 0) {
            doc.addPage();
            isFirstPage = false;
          }

          const row = Math.floor(cardIndex / cols);
          const col = cardIndex % cols;
          
          const x = marginX + col * (cardWidth + gapX);
          const y = marginY + row * (cardHeight + gapY);
          
          // Modern gradient background
          const classColor = getClassColor(seat.student.classes.name);
          
          // Outer border with shadow effect
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.rect(x + 0.5, y + 0.5, cardWidth, cardHeight);
          
          // Main card border
          doc.setDrawColor(classColor.r, classColor.g, classColor.b);
          doc.setLineWidth(0.8);
          doc.rect(x, y, cardWidth, cardHeight);
          
          // Top colored header bar
          doc.setFillColor(classColor.r, classColor.g, classColor.b);
          doc.rect(x, y, cardWidth, 8, 'F');
          
          // Room number in header
          doc.setFontSize(7);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          doc.text(`RUANG ${room.roomNumber}`, x + cardWidth/2, y + 5, { 
            align: "center"
          });
          
          // "NOMOR MEJA" label (above the number)
          doc.setFontSize(6);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(120, 120, 120);
          doc.text("NOMOR MEJA", x + cardWidth/2, y + 14, { 
            align: "center"
          });
          
          // Table number (large and prominent)
          doc.setFontSize(28);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(classColor.r, classColor.g, classColor.b);
          doc.text(seat.tableNumber.toString(), x + cardWidth/2, y + 23, { 
            align: "center"
          });
          
          // Divider line
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.2);
          doc.line(x + 3, y + 27, x + cardWidth - 3, y + 27);
          
          // Student name
          doc.setFontSize(7);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          const studentName = toTitleCase(seat.student.full_name);
          const maxNameWidth = cardWidth - 4;
          let nameLines: string[] = doc.splitTextToSize(studentName, maxNameWidth);
          if (nameLines.length > 2) nameLines = [nameLines[0], ellipsize(doc, nameLines.slice(1).join(' '), maxNameWidth)];
          const nameY = y + 32;
          nameLines.forEach((ln, i) => doc.text(ln, x + cardWidth / 2, nameY + i * 3, { align: "center" }));

          // Student info section
          const infoY = nameLines.length > 1 ? y + 39 : y + 36;
          
          // Participant number
          doc.setFontSize(5.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text("No. Peserta:", x + 2, infoY);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          doc.text(seat.examNumber.toString(), x + cardWidth - 2, infoY, { align: "right" });
          
          // Class
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text("Kelas:", x + 2, infoY + 4);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(classColor.r, classColor.g, classColor.b);
          doc.text(seat.student.classes.name, x + cardWidth - 2, infoY + 4, { align: "right" });
          
          // Bottom divider line
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.2);
          doc.line(x + 3, y + cardHeight - 9, x + cardWidth - 3, y + cardHeight - 9);
          
          // Exam name and academic year at bottom
          doc.setFont("helvetica", "normal");
          doc.setTextColor(80, 80, 80);
          if (settings?.exam_name) {
            doc.text(fitText(doc, settings.exam_name, cardWidth - 8, 4.5, 3), x + cardWidth / 2, y + cardHeight - 6, { align: "center" });
          }

          // Tahun pelajaran (hanya bila sudah diisi)
          if (settings?.academic_year) {
            doc.setFontSize(4.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(classColor.r, classColor.g, classColor.b);
            doc.text(`TP ${settings.academic_year}`, x + cardWidth / 2, y + cardHeight - 3, { align: "center" });
          }
          
          // Bottom decorative corner
          doc.setFillColor(classColor.r, classColor.g, classColor.b);
          doc.setDrawColor(classColor.r, classColor.g, classColor.b);
          doc.circle(x + cardWidth - 3, y + cardHeight - 3, 1.5, 'F');
          
          cardCount++;
        }
      }

      doc.save(`nomor-meja-${rooms.length}-ruangan-${cardCount}-kartu.pdf`);
      toast.success(`${cardCount} nomor meja berhasil dicetak (${Math.ceil(cardCount/cardsPerPage)} halaman ${paper.toUpperCase()})`);
    } catch (error) {
      console.error("Error printing table numbers:", error);
      toast.error("Gagal mencetak nomor meja. Silakan coba lagi.");
    }
  };

  const handlePrintRoomComposition = async () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const rooms = generateRooms();
    if (rooms.length === 0) return;

    // Kumpulkan semua siswa beserta ruangnya
    const studentRecords = rooms.flatMap((room) =>
      room.seats.map((seat) => ({
        className: seat.student.classes.name,
        fullName: seat.student.full_name,
        examNumber: seat.examNumber,
        gender: (seat.student.gender || '-').toUpperCase(),
        roomNumber: room.roomNumber,
      }))
    );
    // urut kelas (alami: 7A, 7B, ..., 7K) lalu nama
    studentRecords.sort((a, b) =>
      a.className.localeCompare(b.className, 'id', { numeric: true }) ||
      a.fullName.localeCompare(b.fullName, 'id', { sensitivity: 'base' }));

    const doc = new jsPDF('portrait', 'mm', paperFormat(paper));
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const cx = PW / 2;
    const M = 14;
    const BLUE: [number, number, number] = [41, 128, 185];

    let currentY = settings ? await addLetterheadToPDF(doc, settings) : 20;
    currentY += 2;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("REKAP KOMPOSISI RUANGAN UJIAN", cx, currentY, { align: "center" });
    currentY += 6;
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "normal");
    const sub = [settings?.exam_name, settings?.academic_year ? `Tahun Pelajaran ${settings.academic_year}` : ''].filter(Boolean).join('  •  ');
    if (sub) {
      doc.text(fitText(doc, sub, PW - 2 * M, 10.5, 7), cx, currentY, { align: "center" });
      currentY += 6;
    }
    currentY += 2;

    // ---- Kotak ringkasan (tinggi mengikuti jumlah ruang) ----
    const totalStudents = studentRecords.length;
    const avgPerRoom = (totalStudents / rooms.length).toFixed(1);
    const boxX = M, boxW = PW - 2 * M;
    const roomsPerRow = 6;
    const roomRows = Math.ceil(rooms.length / roomsPerRow);
    const boxH = Math.max(20, 12 + roomRows * 4);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(boxX, currentY, boxW, boxH, 2, 2, 'F');
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.4);
    doc.roundedRect(boxX, currentY, boxW, boxH, 2, 2);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLUE);
    doc.text("RINGKASAN", boxX + 5, currentY + 5.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(`Total ruangan: ${rooms.length}`, boxX + 5, currentY + 10.5);
    doc.text(`Total siswa: ${totalStudents}`, boxX + 5, currentY + 15);
    if (boxH > 20) doc.text(`Rata-rata: ${avgPerRoom} siswa/ruang`, boxX + 5, currentY + 19.5);
    else doc.text(`Rata-rata: ${avgPerRoom}/ruang`, boxX + 5, currentY + 19);

    const colX = boxX + 62;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLUE);
    doc.text("JUMLAH SISWA PER RUANG", colX, currentY + 5.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 60);
    const stepX = (boxX + boxW - 5 - colX) / roomsPerRow;
    rooms.forEach((room, idx) => {
      doc.text(`R${room.roomNumber}: ${room.seats.length}`, colX + (idx % roomsPerRow) * stepX, currentY + 10.5 + Math.floor(idx / roomsPerRow) * 4);
    });
    currentY += boxH + 6;

    // ---- Tabel ----
    autoTable(doc, {
      startY: currentY,
      head: [['No', 'Nama Siswa', 'Nomor Peserta', 'Kelas', 'L/P', 'Ruang']],
      body: studentRecords.map((r, i) => [i + 1, toTitleCase(r.fullName), r.examNumber.toString(), r.className, r.gender, r.roomNumber.toString()]),
      theme: 'grid',
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 8 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left' },
        2: { halign: 'center', cellWidth: 28 },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'center', cellWidth: 12 },
        5: { halign: 'center', cellWidth: 16 },
      },
      styles: { fontSize: 8, cellPadding: 1.8, lineWidth: 0.1 },
      margin: { left: M, right: M, top: 15, bottom: 16 },
      rowPageBreak: 'avoid',
    });

    // ---- Rincian per kelas (pindah halaman bila tidak muat) ----
    const classSummary: Record<string, number> = {};
    studentRecords.forEach((r) => { classSummary[r.className] = (classSummary[r.className] || 0) + 1; });
    const classEntries = Object.entries(classSummary).sort(([a], [b]) => a.localeCompare(b, 'id', { numeric: true }));
    const perLine = 4;
    const summaryH = 16 + Math.ceil(classEntries.length / perLine) * 5;
    let finalY = (doc as any).lastAutoTable.finalY + 8;
    if (finalY + summaryH > PH - 16) { doc.addPage(); finalY = 20; }
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Total: ${totalStudents} siswa dalam ${rooms.length} ruangan`, M, finalY);
    finalY += 6;
    doc.setFontSize(9);
    doc.text("Rincian per kelas:", M, finalY);
    finalY += 5;
    doc.setFont("helvetica", "normal");
    const colW = (PW - 2 * M) / perLine;
    classEntries.forEach(([name, count], i) => {
      doc.text(`${name}: ${count} siswa`, M + 3 + (i % perLine) * colW, finalY + Math.floor(i / perLine) * 5);
    });

    // ---- Nomor halaman setelah seluruh isi selesai ----
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(`Halaman ${i} dari ${totalPages}`, cx, PH - 8, { align: 'center' });
    }

    doc.save("rekap-komposisi-ruangan.pdf");
    toast.success(`Rekap komposisi ruangan untuk ${totalStudents} siswa berhasil dicetak (${paper.toUpperCase()})`);
  };

  const handlePrintRoomParticipants = async () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const rooms = generateRooms();
    if (rooms.length === 0) return;

    try {
      const doc = new jsPDF('portrait', 'mm', paperFormat(paper));
      const PW = doc.internal.pageSize.getWidth();
      const PH = doc.internal.pageSize.getHeight();
      const cx = PW / 2;
      const BLUE: [number, number, number] = [41, 128, 185];
      const boxX = 20, boxW = PW - 40;

      for (let roomIdx = 0; roomIdx < rooms.length; roomIdx++) {
        const room = rooms[roomIdx];
        if (roomIdx > 0) doc.addPage();

        let currentY = settings ? await addLetterheadToPDF(doc, settings) : 20;

        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text("DAFTAR PESERTA UJIAN", cx, currentY, { align: "center" });
        currentY += 5;
        doc.setFontSize(10);
        doc.text(`RUANG ${room.roomNumber}`, cx, currentY, { align: "center" });
        currentY += 4;

        const sub = [settings?.exam_name, settings?.academic_year ? `TP ${settings.academic_year}` : ''].filter(Boolean).join('  •  ');
        if (sub) {
          doc.setFont("helvetica", "normal");
          doc.text(fitText(doc, sub, PW - 2 * 20, 8.5, 6), cx, currentY + 1, { align: "center" });
          currentY += 5;
        }
        currentY += 2;

        // Ringkasan ruang
        const gradeCount: Record<number, number> = {};
        const genderCount = { L: 0, P: 0 };
        room.seats.forEach((seat) => {
          const grade = seat.student.classes.grade;
          gradeCount[grade] = (gradeCount[grade] || 0) + 1;
          const gender = seat.student.gender?.toUpperCase();
          if (gender === 'L') genderCount.L++;
          else if (gender === 'P') genderCount.P++;
        });
        const gradeEntries = Object.entries(gradeCount).sort(([a], [b]) => Number(a) - Number(b));
        const gradeRows = Math.ceil(gradeEntries.length / 2);
        const boxH = Math.max(15, 8 + gradeRows * 3.5);
        doc.setFillColor(245, 247, 250);
        doc.roundedRect(boxX, currentY, boxW, boxH, 2, 2, 'F');
        doc.setDrawColor(...BLUE);
        doc.setLineWidth(0.4);
        doc.roundedRect(boxX, currentY, boxW, boxH, 2, 2);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BLUE);
        doc.text("RINGKASAN PESERTA", boxX + 5, currentY + 4.5);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        doc.text(`Total: ${room.seats.length} siswa`, boxX + 5, currentY + 8.5);
        doc.text(`L: ${genderCount.L}  |  P: ${genderCount.P}`, boxX + 5, currentY + 12);
        const gx = boxX + boxW / 2 - 10;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BLUE);
        doc.text("DISTRIBUSI TINGKAT", gx, currentY + 4.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        gradeEntries.forEach(([grade, count], idx) => {
          doc.text(`Kelas ${grade}: ${count}`, gx + (idx % 2) * 32, currentY + 8.5 + Math.floor(idx / 2) * 3.5);
        });
        currentY += boxH + 5;

        // Urut kelas (alami) lalu nama
        const sortedSeats = [...room.seats].sort((a, b) =>
          (a.student.classes.name || '').localeCompare(b.student.classes.name || '', 'id', { numeric: true, sensitivity: 'base' }) ||
          toTitleCase(a.student.full_name).localeCompare(toTitleCase(b.student.full_name), 'id', { sensitivity: 'base' }));

        // Muat di satu halaman bila bisa; bila tidak, kecilkan sedikit lalu lanjut ke halaman berikut dengan kepala tabel diulang
        const availableSpace = PH - currentY - 20;
        let fontSize = 8;
        let cellPadding = 1.9;
        const rowH = (fs: number, pad: number) => fs * 0.3528 * 1.15 + pad * 2;
        if ((sortedSeats.length + 1) * rowH(fontSize, cellPadding) > availableSpace) { fontSize = 7.5; cellPadding = 1.5; }
        if ((sortedSeats.length + 1) * rowH(fontSize, cellPadding) > availableSpace) { fontSize = 7; cellPadding = 1.2; }

        autoTable(doc, {
          startY: currentY,
          head: [['No', 'Nama Siswa', 'Nomor Peserta', 'Kelas']],
          body: sortedSeats.map((seat, index) => [index + 1, toTitleCase(seat.student.full_name), seat.examNumber.toString(), seat.student.classes.name]),
          theme: 'grid',
          headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize },
          columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { halign: 'left' },
            2: { halign: 'center', cellWidth: 32 },
            3: { halign: 'center', cellWidth: 20 },
          },
          styles: { fontSize, cellPadding, lineWidth: 0.1 },
          margin: { left: boxX, right: boxX, top: 15, bottom: 16 },
          rowPageBreak: 'avoid',
        });

        // Jumlah peserta di bawah tabel (pindah halaman bila tidak ada tempat)
        let finalY = (doc as any).lastAutoTable.finalY + 6;
        if (finalY > PH - 16) { doc.addPage(); finalY = 20; }
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(`Total peserta: ${room.seats.length} siswa`, cx, finalY, { align: "center" });
      }

      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`Halaman ${i} dari ${totalPages}`, cx, PH - 7, { align: 'center' });
      }

      doc.save(`daftar-peserta-per-ruang-${rooms.length}-ruangan.pdf`);
      toast.success(`Daftar peserta untuk ${rooms.length} ruangan berhasil dicetak (${paper.toUpperCase()})`);
    } catch (error) {
      console.error("Error printing room participants:", error);
      toast.error("Gagal mencetak daftar peserta. Silakan coba lagi.");
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Administrasi Ujian</h1>
          <p className="text-muted-foreground">Kelola kartu ujian, denah duduk, dan nomor meja</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Pengaturan Ujian</CardTitle>
              <CardDescription>Pilih kelas dan atur denah duduk ujian</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Button type="button" size="sm" onClick={saveExamCardSettings} disabled={saving || hasNumberErrors || !dirty}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Simpan Pengaturan
              </Button>
              <span className={`text-xs ${hasNumberErrors ? 'text-destructive' : dirty ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {hasNumberErrors ? 'Nomor peserta belum valid' : dirty ? 'Ada perubahan belum disimpan' : savedSnapshot !== null ? 'Tersimpan' : ''}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {studentsError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm space-y-2">
                <p className="font-medium text-destructive">Daftar siswa gagal dimuat, jadi denah/kartu belum bisa dibuat.</p>
                <p className="text-xs text-muted-foreground break-words">
                  {(studentsErrorDetail as any)?.message || 'Server tidak merespons (periksa koneksi atau hubungi admin).'}
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => refetchStudents()}>Coba lagi</Button>
              </div>
            )}
            <div className="space-y-2">
              <Label>Pilih Kelas</Label>
              <div className="flex gap-2">
                {['7', '8', '9'].map(grade => (
                  <Button
                    key={grade}
                    variant={selectedGrades.includes(grade) ? "default" : "outline"}
                    onClick={() => handleGradeToggle(grade)}
                  >
                    Kelas {grade}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Filter Cetak Kartu Ujian</Label>
              <Select value={filterType} onValueChange={(value: 'all' | 'class' | 'student') => {
                setFilterType(value);
                setSelectedClasses([]);
                setSelectedStudentIds([]);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Siswa</SelectItem>
                  <SelectItem value="class">Kelas Tertentu</SelectItem>
                  <SelectItem value="student">Siswa Tertentu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filterType === 'class' && (
              <div className="space-y-2">
                <Label>Pilih Kelas Spesifik</Label>
                <div className="border rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
                  {Array.from(new Set(
                    students
                      .filter(s => selectedGrades.includes(s.classes.grade.toString()))
                      .map(s => s.classes.name)
                  )).sort().map(className => (
                    <div key={className} className="flex items-center space-x-2">
                      <Checkbox
                        id={`class-${className}`}
                        checked={selectedClasses.includes(className)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedClasses(prev => [...prev, className]);
                          } else {
                            setSelectedClasses(prev => prev.filter(c => c !== className));
                          }
                        }}
                      />
                      <label htmlFor={`class-${className}`} className="text-sm cursor-pointer">
                        Kelas {className}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Dipilih: {selectedClasses.length} kelas
                </p>
              </div>
            )}

            {filterType === 'student' && (
              <div className="space-y-2">
                <Label>Pilih Siswa Spesifik</Label>
                <div className="border rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
                  {students
                    .filter(s => selectedGrades.includes(s.classes.grade.toString()))
                    .sort((a, b) => a.full_name.localeCompare(b.full_name))
                    .map(student => (
                      <div key={student.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`student-${student.id}`}
                          checked={selectedStudentIds.includes(student.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedStudentIds(prev => [...prev, student.id]);
                            } else {
                              setSelectedStudentIds(prev => prev.filter(id => id !== student.id));
                            }
                          }}
                        />
                        <label htmlFor={`student-${student.id}`} className="text-sm cursor-pointer">
                          {toTitleCase(student.full_name)} - {student.classes.name}
                        </label>
                      </div>
                    ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Dipilih: {selectedStudentIds.length} siswa
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Kapasitas Ruangan</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rows">Jumlah Baris (1–20)</Label>
                  <DraftNumberInput id="rows" value={rowsCount} min={1} max={20} onCommit={setRowsCount} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="columns">Jumlah Kolom (1–12)</Label>
                  <DraftNumberInput id="columns" value={columnsCount} min={1} max={12} onCommit={setColumnsCount} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Kursi per ruangan: {rowsCount * columnsCount} |{' '}
                Siswa terpilih: {students.filter((st) => selectedGrades.includes(st.classes.grade.toString())).length} |{' '}
                Urutan dalam kelas: berdasarkan nama (A–Z)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Mode Penyusunan Denah Duduk</Label>
              <Select value={seatingMode} onValueChange={(v: any) => setSeatingMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Otomatis (1 tingkat dipilih: per rombel; lebih dari 1: berselang-seling)</SelectItem>
                  <SelectItem value="alternating">Berselang-seling antar kelas</SelectItem>
                  <SelectItem value="by_class">Per Rombel (1 ruang = 1 kelas)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Berselang-seling: siswa kelas berbeda duduk berdampingan dan tiap tingkat dipisah ruang. Per rombel: satu ruang hanya satu kelas.
              </p>
              {layoutWarnings.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                  {layoutWarnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paper">Ukuran Kertas Cetak</Label>
              <Select value={paper} onValueChange={(v: any) => setPaper(v)}>
                <SelectTrigger id="paper"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAPER_LABEL) as PdfPaper[]).map((k) => (
                    <SelectItem key={k} value={k}>{PAPER_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">Berlaku untuk semua cetakan (kartu, denah, nomor meja, rekap, daftar peserta).</p>
            </div>

            <div className="space-y-2 border rounded-md p-4 bg-muted/30">
              <Label className="text-base">Pengaturan Kartu Ujian</Label>

              <div className="flex items-center justify-between rounded-md bg-background border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Tampilkan Foto pada Kartu Ujian</Label>
                  <p className="text-xs text-muted-foreground">
                    Matikan untuk mencetak kartu tanpa foto 3x4 (lebih ringkas & cepat).
                  </p>
                </div>
                <Switch checked={showPhotoOnCard} onCheckedChange={setShowPhotoOnCard} />
              </div>



              <div className="space-y-2">
                <Label>Ukuran Kartu</Label>
                <Select value={cardSize} onValueChange={(value: any) => setCardSize(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">63mm x 103mm (Portrait)</SelectItem>
                    <SelectItem value="landscape">85mm x 54mm (Kartu Kredit)</SelectItem>
                    <SelectItem value="10x8">100mm x 80mm (10cm x 8cm)</SelectItem>
                    <SelectItem value="custom">Kustom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {cardSize === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Lebar (mm)</Label>
                    <DraftNumberInput min={40} max={200} value={customCardWidth} onCommit={setCustomCardWidth} />
                  </div>
                  <div>
                    <Label>Tinggi (mm)</Label>
                    <DraftNumberInput min={30} max={200} value={customCardHeight} onCommit={setCustomCardHeight} />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Skala Tulisan: {fontScale.toFixed(2)}x</Label>
                <Input type="range" min={0.7} max={1.6} step={0.05}
                  value={fontScale}
                  onChange={(e) => setFontScale(parseFloat(e.target.value))} />
                <p className="text-xs text-muted-foreground">
                  Atur 0.7x – 1.6x. Semua tulisan, tabel jadwal, dan tanda tangan diskalakan otomatis.
                </p>
              </div>
            </div>

            <div className="space-y-3 border rounded-md p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label className="text-base">Nomor Peserta Awal per Tingkat</Label>
                  <p className="text-xs text-muted-foreground">5 digit awal per tingkat; 3 digit terakhir urut otomatis sesuai nomor meja.</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    const base = startingExamNumberGrade7;
                    setStartingExamNumberGrade7(base); setStartingExamNumberGrade8(base + 1); setStartingExamNumberGrade9(base + 2);
                  }}>Isi berurutan (+1)</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    setStartingExamNumberGrade7(DEFAULT_START_NUMBERS['7']); setStartingExamNumberGrade8(DEFAULT_START_NUMBERS['8']); setStartingExamNumberGrade9(DEFAULT_START_NUMBERS['9']);
                  }}>Kembalikan default</Button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {([
                  ['7', startingExamNumberGrade7, setStartingExamNumberGrade7],
                  ['8', startingExamNumberGrade8, setStartingExamNumberGrade8],
                  ['9', startingExamNumberGrade9, setStartingExamNumberGrade9],
                ] as const).map(([g, val, setVal]) => {
                  const count = students.filter((st) => st.classes.grade.toString() === g).length;
                  const err = startNumberErrors[g];
                  const width = count > 999 ? 4 : 3;
                  return (
                    <div key={g} className="space-y-1.5">
                      <Label htmlFor={`startingExamNumberGrade${g}`}>Kelas {g}</Label>
                      <DraftNumberInput
                        id={`startingExamNumberGrade${g}`}
                        value={val}
                        min={10000}
                        max={99999}
                        digits={5}
                        invalid={!!err}
                        placeholder={String(DEFAULT_START_NUMBERS[g as '7' | '8' | '9'])}
                        onCommit={setVal}
                      />
                      {err ? (
                        <p className="text-xs text-destructive">{err}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {count > 0
                            ? `${val}${'0'.repeat(width - 1)}1 … ${val}${String(count).padStart(width, '0')} (${count} siswa)`
                            : `Contoh: ${val}${'0'.repeat(width - 1)}1`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Nomor tiap siswa mengikuti urutan duduk (ruang 1 meja 1 = urut 001) dan dihitung ulang bila daftar siswa atau susunan ruang berubah.
                Tingkat dengan lebih dari 999 siswa otomatis memakai 4 digit urut. Klik <strong>Simpan Pengaturan</strong> di kanan atas agar tersimpan.
              </p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleGeneratePreview}
                disabled={isLoading || selectedGrades.length === 0}
                className="w-full"
                variant="secondary"
              >
                <Users className="mr-2 h-4 w-4" />
                Generate Preview Semua
              </Button>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button
                  onClick={() => setShowCardPreview(true)}
                  disabled={isLoading || selectedGrades.length === 0 || previewRooms.length === 0}
                  className="w-full"
                  variant="outline"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Preview Kartu Ujian
                </Button>
                
                <Button
                  onClick={handlePrintExamCards}
                  disabled={isLoading || selectedGrades.length === 0}
                  className="w-full"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Cetak Semua Kartu Ujian
                </Button>
                
                <Button
                  onClick={handlePrintSeatingChart}
                  disabled={isLoading || selectedGrades.length === 0}
                  className="w-full"
                >
                  <Grid3x3 className="mr-2 h-4 w-4" />
                  Cetak Semua Denah Duduk
                </Button>
                
                <Button
                  onClick={handlePrintTableNumbers}
                  disabled={isLoading || selectedGrades.length === 0}
                  className="w-full"
                >
                  <Hash className="mr-2 h-4 w-4" />
                  Cetak Semua Nomor Meja
                </Button>

                <Button
                  onClick={handlePrintRoomComposition}
                  disabled={isLoading || selectedGrades.length === 0}
                  className="w-full"
                  variant="secondary"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Cetak Rekap Komposisi Ruangan
                </Button>

                <Button
                  onClick={handlePrintRoomParticipants}
                  disabled={isLoading || selectedGrades.length === 0}
                  className="w-full"
                  variant="secondary"
                >
                  <Users className="mr-2 h-4 w-4" />
                  Cetak Daftar Peserta per Ruang
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {previewRooms.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                Total {previewRooms.length} ruangan | {previewRooms.reduce((acc, r) => acc + r.seats.length, 0)} siswa
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activePreview} onValueChange={(v) => setActivePreview(v as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="seating">
                    <Grid3x3 className="mr-2 h-4 w-4" />
                    Denah Duduk
                  </TabsTrigger>
                  <TabsTrigger value="cards">
                    <Printer className="mr-2 h-4 w-4" />
                    Kartu Ujian
                  </TabsTrigger>
                  <TabsTrigger value="numbers">
                    <Hash className="mr-2 h-4 w-4" />
                    Nomor Meja
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="seating" className="space-y-8">
                  {previewRooms.map((room) => (
                    <div key={room.roomNumber} className="border-2 border-border rounded-lg p-8 bg-background shadow-xl">
                      {/* Modern Header Section - Kop Surat */}
                      <div className="mb-6 pb-4">
                        <div className="flex items-center justify-between mb-3">
                          {settings?.logo_url && (
                            <img 
                              src={settings.logo_url} 
                              alt="Logo" 
                              className="w-14 h-14 object-contain"
                            />
                          )}
                          {settings?.right_logo_url && (
                            <img 
                              src={settings.right_logo_url} 
                              alt="Logo Kanan" 
                              className="w-14 h-14 object-contain"
                            />
                          )}
                        </div>
                        
                        <div className="text-center space-y-1">
                          {settings?.district_name && (
                            <div className="text-sm font-bold uppercase text-muted-foreground">{settings.district_name}</div>
                          )}
                          <div className="text-xl font-bold uppercase">{settings?.school_name || "NAMA SEKOLAH"}</div>
                          <div className="text-xs text-muted-foreground">
                            {settings?.school_address && settings?.school_phone 
                              ? `${settings.school_address} | Telp: ${settings.school_phone}`
                              : settings?.school_address || ''
                            }
                          </div>
                        </div>
                        
                        {/* Modern separator lines */}
                        <div className="mt-3 space-y-0.5">
                          <div className="h-0.5 bg-primary/60"></div>
                          <div className="h-px bg-border"></div>
                        </div>
                      </div>

                      {/* Title Section with modern styling */}
                      <div className="text-center space-y-2 mb-6">
                        <h2 className="text-2xl font-bold text-primary">DENAH TEMPAT DUDUK PESERTA</h2>
                        {settings?.exam_name && <p className="text-xs text-muted-foreground">{settings.exam_name}</p>}
                        {settings?.academic_year && <p className="text-xs text-muted-foreground">Tahun Ajaran {settings.academic_year}</p>}
                        <div className="inline-flex items-center justify-center px-6 py-1.5 bg-primary text-primary-foreground rounded-md font-bold text-sm mt-3">
                          RUANG {room.roomNumber}
                        </div>
                      </div>
                      
                      {/* Distribution Visualization */}
                      {(() => {
                        const gradeDistribution: Record<number, number> = {};
                        const classDistribution: Record<string, number> = {};
                        const genderDistribution: Record<string, number> = { L: 0, P: 0 };
                        
                        room.seats.forEach(seat => {
                          const grade = seat.student.classes.grade;
                          const className = seat.student.classes.name;
                          const gender = seat.student.gender || 'L';
                          
                          gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
                          classDistribution[className] = (classDistribution[className] || 0) + 1;
                          genderDistribution[gender] = (genderDistribution[gender] || 0) + 1;
                        });
                        
                        return (
                          <div className="mb-4 p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                            <div className="grid md:grid-cols-3 gap-4">
                              {/* Grade Distribution */}
                              <div>
                                <div className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                                  <Users className="h-4 w-4 text-primary" />
                                  Distribusi Per Tingkat
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(gradeDistribution).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, count]) => (
                                    <div 
                                      key={grade}
                                      className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-md border border-border shadow-sm"
                                    >
                                      <span className="text-xs font-bold text-primary">Kelas {grade}</span>
                                      <span className="text-xs font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                                        {count}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Class Distribution */}
                              <div>
                                <div className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                                  <Grid3x3 className="h-4 w-4 text-primary" />
                                  Distribusi Per Kelas
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(classDistribution).sort(([a], [b]) => a.localeCompare(b)).map(([className, count]) => {
                                    const color = getClassColor(className);
                                    return (
                                      <div 
                                        key={className}
                                        className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-md border border-border shadow-sm"
                                      >
                                        <div 
                                          className="w-3 h-3 rounded-full border border-border"
                                          style={{ backgroundColor: color.hex }}
                                        />
                                        <span className="text-xs font-bold">{className}</span>
                                        <span className="text-xs font-semibold bg-muted text-foreground px-2 py-0.5 rounded-full">
                                          {count}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              
                              {/* Gender Distribution */}
                              <div>
                                <div className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                                  <Users className="h-4 w-4 text-primary" />
                                  Jenis Kelamin
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-md border border-border shadow-sm">
                                    <span className="text-xs font-bold text-blue-600">Laki-laki</span>
                                    <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                      {genderDistribution.L || 0}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-md border border-border shadow-sm">
                                    <span className="text-xs font-bold text-pink-600">Perempuan</span>
                                    <span className="text-xs font-semibold bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">
                                      {genderDistribution.P || 0}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Total Summary */}
                            <div className="mt-3 pt-3 border-t border-primary/20">
                              <div className="text-xs text-muted-foreground text-center">
                                Total: <span className="font-bold text-foreground">{room.seats.length} siswa</span> dari 
                                <span className="font-bold text-foreground"> {Object.keys(gradeDistribution).length} tingkat</span> dan 
                                <span className="font-bold text-foreground"> {Object.keys(classDistribution).length} kelas</span>
                                {' • '}
                                <span className="font-bold text-blue-600">{genderDistribution.L || 0} L</span>
                                {' / '}
                                <span className="font-bold text-pink-600">{genderDistribution.P || 0} P</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* Color Legend */}
                      {(() => {
                        const uniqueClasses = Array.from(new Set(room.seats.map(s => s.student.classes.name))).sort();
                        return uniqueClasses.length > 0 && (
                          <div className="mb-4 p-3 bg-muted/30 rounded-md">
                            <div className="text-xs font-bold text-muted-foreground mb-2">Legenda Kelas:</div>
                            <div className="flex flex-wrap gap-3">
                              {uniqueClasses.map((className) => {
                                const color = getClassColor(className);
                                return (
                                  <div key={className} className="flex items-center gap-1.5">
                                    <div 
                                      className="w-4 h-4 rounded border border-border"
                                      style={{ backgroundColor: color.hex, opacity: 0.7 }}
                                    />
                                    <span className="text-xs font-medium">{className}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* Supervisor - modern style */}
                      <div className="mb-5">
                        <div className="bg-foreground/90 text-background p-2 rounded-sm">
                          <div className="text-center font-bold text-xs tracking-wide">MEJA PENGAWAS / DEPAN RUANGAN</div>
                        </div>
                      </div>
                      
                      {/* Modern Seating Grid - optimized for 8 columns */}
                      <div 
                        className="grid gap-1.5 mx-auto mb-6"
                        style={{
                          gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))`,
                          maxWidth: `${columnsCount * (columnsCount >= 8 ? 110 : 140)}px`
                        }}
                      >
                        {Array.from({ length: rowsCount * columnsCount }).map((_, index) => {
                          // Calculate row and column from index
                          const row = Math.floor(index / columnsCount);
                          const col = index % columnsCount;
                          
                          // Calculate table number in snake pattern for this position
                          let tableNumber: number;
                          if (row % 2 === 0) {
                            // Even row: left to right
                            tableNumber = row * columnsCount + col + 1;
                          } else {
                            // Odd row: right to left
                            tableNumber = (row + 1) * columnsCount - col;
                          }
                          
                          const seat = room.seats.find(s => s.tableNumber === tableNumber);
                          const classColor = seat ? getClassColor(seat.student.classes.name) : null;
                          
                          return (
                            <div
                              key={index}
                              className={`border rounded-sm overflow-hidden transition-all ${
                                seat 
                                  ? 'border-border hover:shadow-md hover:scale-105' 
                                  : 'border-dashed border-muted-foreground/20 bg-muted/5'
                              }`}
                              style={{
                                minHeight: columnsCount >= 8 ? '90px' : '110px',
                                backgroundColor: classColor ? `${classColor.hex}20` : undefined
                              }}
                            >
                              {/* Exam Number Badge - modern gradient style */}
                              <div className={`px-2 py-1 text-center text-[10px] font-bold ${
                                seat ? 'bg-primary text-primary-foreground' : 'bg-muted/50'
                              }`}>
                                {index + 1}
                              </div>
                              
                              {seat ? (
                                <div className={`p-1.5 space-y-0.5 text-center ${columnsCount >= 8 ? 'text-[10px]' : 'text-xs'}`}>
                                  {/* Student Name - optimized for small cells */}
                                  <div className="font-bold line-clamp-2 leading-tight">
                                    {columnsCount >= 8 
                                      ? toTitleCase(seat.student.full_name).split(' ').length > 2
                                        ? `${toTitleCase(seat.student.full_name).split(' ')[0]} ${toTitleCase(seat.student.full_name).split(' ').slice(-1)[0]}`.substring(0, 12)
                                        : toTitleCase(seat.student.full_name).substring(0, 12)
                                      : toTitleCase(seat.student.full_name)
                                    }
                                  </div>
                                  
                                  {/* Gender - without symbols, matching PDF */}
                                  <div className={`${columnsCount >= 8 ? 'text-[8px]' : 'text-[9px]'} ${
                                    (seat.student.gender || 'L') === 'L' ? 'text-blue-600' : 'text-pink-600'
                                  }`}>
                                    {(seat.student.gender || 'L') === 'L' ? 'Laki-laki' : 'Perempuan'}
                                  </div>
                                  
                                  {/* Exam Number */}
                                  <div className={`font-bold ${columnsCount >= 8 ? 'text-[9px]' : 'text-[10px]'}`}>
                                    No: {seat.examNumber}
                                  </div>
                                  
                                  {/* Class Badge - modern style */}
                                  <div className={`inline-block px-1.5 py-0.5 bg-muted rounded-sm font-semibold text-primary ${columnsCount >= 8 ? 'text-[9px]' : 'text-[10px]'}`}>
                                    {seat.student.classes.name}
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2 h-full flex items-center justify-center">
                                  <span className="text-[10px] text-muted-foreground">•</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="cards" className="space-y-4">
                  {previewRooms.map((room) => (
                    <div key={room.roomNumber} className="space-y-4">
                      <h3 className="text-lg font-semibold">Ruang {room.roomNumber}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {room.seats.map((seat) => (
                          <div 
                            key={seat.tableNumber}
                            className="border-2 border-primary rounded-lg p-4 space-y-2"
                          >
                            <div className="text-lg font-bold">Ruang {room.roomNumber} - Meja {seat.tableNumber}</div>
                            <div className="space-y-1 text-sm">
                              <p><strong>No. Peserta:</strong> {seat.examNumber}</p>
                              <p><strong>NIS:</strong> {seat.student.nis}</p>
                              <p><strong>Nama:</strong> {toTitleCase(seat.student.full_name)}</p>
                              <p><strong>Kelas:</strong> {seat.student.classes.name}</p>
                            </div>
                            <div className="pt-4 border-t">
                              <p className="text-xs text-muted-foreground">Tanda Tangan Peserta:</p>
                              <div className="mt-2 border-b border-dashed border-muted-foreground/50"></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="numbers" className="space-y-4">
                  {previewRooms.map((room) => (
                    <div key={room.roomNumber} className="space-y-4">
                      <h3 className="text-lg font-semibold">Ruang {room.roomNumber}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {room.seats.map((seat) => (
                          <div 
                            key={seat.tableNumber}
                            className="border-2 border-primary rounded-lg p-6 flex flex-col items-center justify-center aspect-square"
                          >
                            <div className="text-sm font-medium text-muted-foreground mb-2">
                              Ruang {room.roomNumber}
                            </div>
                            <div className="text-5xl font-bold">
                              {seat.tableNumber}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>

              <div className="mt-6 flex justify-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary bg-primary/5"></div>
                  <span className="text-sm">Terisi</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-dashed border-muted-foreground/30 bg-muted/20"></div>
                  <span className="text-sm">Kosong</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Informasi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Kartu Ujian:</strong> Mencetak kartu peserta untuk setiap siswa dengan nomor ruangan, nomor meja, NIS, nama, kelas, dan username.</p>
            <p><strong>Denah Duduk:</strong> Mencetak peta ruangan dengan posisi duduk setiap siswa untuk semua ruangan yang diperlukan.</p>
            <p><strong>Nomor Meja:</strong> Mencetak 30 nomor meja per halaman F4 (5 kolom x 6 baris) dengan desain modern yang menampilkan ruang, nomor meja, nama peserta, nomor peserta, dan kelas. Kartu dapat ditempel di setiap meja ujian.</p>
            <p><strong>Rekap Komposisi Ruangan:</strong> Mencetak rekap lengkap semua peserta ujian yang diurutkan berdasarkan kelas, termasuk statistik distribusi siswa per ruangan.</p>
            <p><strong>Daftar Peserta per Ruang:</strong> Mencetak daftar peserta untuk setiap ruangan secara terpisah, lengkap dengan ringkasan peserta (total, distribusi gender, dan distribusi kelas). Setiap ruangan dicetak dalam halaman tersendiri.</p>
            <p className="text-muted-foreground">
              <strong>Urutan Penyusunan:</strong> Siswa disusun secara berselang-seling antara kelas 7, 8, dan 9 untuk memastikan tidak ada siswa sekelas yang duduk bersebelahan (samping kiri atau atas). 
              Dalam setiap tingkat kelas, siswa diurutkan berdasarkan kelas (A, B, C, dst) dan nama alfabetis.
              Setiap ruangan berkapasitas maksimal {rowsCount * columnsCount} siswa. Jika siswa lebih dari kapasitas satu ruangan, secara otomatis akan dibagi ke ruangan berikutnya.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Exam Card Preview Dialog */}
      <Dialog open={showCardPreview} onOpenChange={setShowCardPreview}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Preview Kartu Ujian
            </DialogTitle>
            <DialogDescription>
              Menampilkan 6 contoh kartu ujian pertama. Kartu ujian akan dicetak dalam format F4 dengan 10 kartu per halaman.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 mt-4">
            {previewRooms.slice(0, 2).flatMap(room => 
              room.seats.slice(0, 3).map(seat => {
                const examSchedule = ((settings as any)?.exam_schedule as Array<{
                  no: number;
                  day: string;
                  date: string;
                  subject: string;
                  time: string;
                  duration: string;
                }>) || [];
                
                return (
                  <div 
                    key={`${room.roomNumber}-${seat.tableNumber}`}
                    className="border-2 border-primary rounded-lg p-4 bg-background shadow-md"
                  >
                    {/* Mini Letterhead */}
                    <div className="flex items-start gap-3 mb-3 pb-3 border-b">
                      {settings?.logo_url && (
                        <img src={settings.logo_url} alt="Logo" className="w-10 h-10 object-contain" />
                      )}
                      <div className="flex-1 text-center">
                        {settings?.district_name && (
                          <div className="text-[10px] font-bold text-muted-foreground">
                            {settings.district_name}
                          </div>
                        )}
                        {settings?.school_name && (
                          <div className="text-xs font-bold">{settings.school_name}</div>
                        )}
                        {settings?.school_address && (
                          <div className="text-[9px] text-muted-foreground">{settings.school_address}</div>
                        )}
                      </div>
                      {settings?.right_logo_url && (
                        <img src={settings.right_logo_url} alt="Logo Kanan" className="w-10 h-10 object-contain" />
                      )}
                    </div>

                    {/* Exam Title */}
                    <div className="text-center mb-3">
                      <div className="text-sm font-bold text-primary">
                        KARTU PESERTA
                      </div>
                      {settings?.exam_name && (
                        <div className="text-xs font-bold text-foreground mt-1">
                          {settings.exam_name}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {settings?.academic_year ? `Tahun Pelajaran ${settings.academic_year}` : ''}
                      </div>
                    </div>

                    {/* Room and Table Info */}
                    <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md mb-3 flex justify-between text-xs font-bold">
                      <span>RUANG {room.roomNumber}</span>
                      <span>MEJA: {seat.tableNumber}</span>
                    </div>

                    {/* Student Info + Photo */}
                    <div className="flex gap-3 mb-3">
                      <div className="flex-1 space-y-1.5 text-xs">
                        <div className="flex">
                          <span className="font-bold w-24">No. Peserta:</span>
                          <span>{seat.examNumber}</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold w-24">NIS:</span>
                          <span>{seat.student.nis}</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold w-24">NISN:</span>
                          <span>{seat.student.nisn || '-'}</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold w-24">Nama:</span>
                          <span className="break-words leading-tight">{toTitleCase(seat.student.full_name)}</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold w-24">TTL:</span>
                          <span className="break-words">
                            {[seat.student.birth_place, seat.student.birth_date ? formatDateWithMonthName(new Date(seat.student.birth_date)) : ''].filter(Boolean).join(', ') || '-'}
                          </span>
                        </div>
                        <div className="flex">
                          <span className="font-bold w-24">Kelas:</span>
                          <span>{seat.student.classes.name}</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold w-24">Username:</span>
                          <span className="break-all">{usernameOf(seat.student.id)}</span>
                        </div>
                      </div>
                      {/* Photo Frame */}
                      {showPhotoOnCard && (
                        <div className="w-[72px] h-[96px] shrink-0 border-2 border-foreground rounded-sm overflow-hidden bg-muted flex items-center justify-center">
                          {seat.student.photo_url ? (
                            <img
                              src={seat.student.photo_url}
                              alt={seat.student.full_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-[8px] text-muted-foreground text-center px-1">
                              Foto<br />3x4
                            </div>
                          )}
                        </div>
                      )}

                    </div>

                    {/* Exam Schedule */}
                    {examSchedule.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-bold text-primary mb-2 text-center">
                          JADWAL UJIAN
                        </div>
                        <div className="border-2 border-foreground rounded overflow-hidden">
                          <table className="w-full text-[8px] border-collapse">
                            <thead>
                              <tr className="bg-primary/10">
                                <th className="border-r-2 border-b-2 border-foreground p-1 text-center font-bold w-7">No</th>
                                <th className="border-r-2 border-b-2 border-foreground p-1 text-left font-bold">Hari/Tgl</th>
                                <th className="border-r-2 border-b-2 border-foreground p-1 text-left font-bold">Mapel</th>
                                <th className="border-r-2 border-b-2 border-foreground p-1 text-center font-bold w-14">Pukul</th>
                                <th className="border-b-2 border-foreground p-1 text-center font-bold w-16">Durasi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {examSchedule.slice(0, 5).map((schedule, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                                  <td className="border-r-2 border-t border-foreground p-1 text-center font-semibold">{schedule.no}</td>
                                  <td className="border-r-2 border-t border-foreground p-1">{schedule.day}, {schedule.date}</td>
                                  <td className="border-r-2 border-t border-foreground p-1">{schedule.subject}</td>
                                  <td className="border-r-2 border-t border-foreground p-1 text-center text-[7px]">{schedule.time}</td>
                                  <td className="border-t border-foreground p-1 text-center text-[7px]">
                                    {schedule.duration.includes(':') 
                                      ? (parseInt(schedule.duration.split(':')[0]) * 60 + parseInt(schedule.duration.split(':')[1])).toString()
                                      : schedule.duration} Menit
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {examSchedule.length > 5 && (
                            <div className="text-[8px] text-center text-muted-foreground p-1 bg-muted/20 border-t-2 border-foreground">
                              ... dan {examSchedule.length - 5} sesi lainnya
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Signature Section (sama dengan PDF: tanggal, jabatan, ruang TTD + stempel, nama, NIP) */}
                    <div className="pt-2 border-t mt-auto">
                      <div className="ml-auto w-[52%] max-w-[260px] text-center text-[9px] leading-tight">
                        <div>{(settings as any)?.city_name || 'Ciamis'}, {formatDateWithMonthName(new Date())}</div>
                        <div className="font-bold">{(settings as any)?.headmaster_position || 'Kepala Sekolah'}</div>
                        <div className="relative h-14 flex items-center justify-center">
                          {settings?.headmaster_signature_url && (
                            <img src={settings.headmaster_signature_url} alt="" className="relative h-11 max-w-[60%] object-contain ml-5" />
                          )}
                          {/* stempel menimpa sebagian kecil ujung kiri tanda tangan, seperti dokumen resmi */}
                          {settings?.school_stamp_url && (
                            <img src={settings.school_stamp_url} alt="" className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-14 w-14 object-contain" />
                          )}
                        </div>
                        <div className="font-bold">{settings?.headmaster_name || "___________________"}</div>
                        {settings?.headmaster_nip && (
                          <div className="text-[8px] text-muted-foreground">NIP. {settings.headmaster_nip}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 text-sm text-muted-foreground text-center">
            Ini adalah preview untuk verifikasi tampilan. Klik "Cetak Semua Kartu Ujian" untuk mencetak semua kartu.
          </div>
        </DialogContent>
      </Dialog>

      {/* Print progress dialog */}
      <Dialog open={printProgress.open}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Mencetak Kartu Ujian
            </DialogTitle>
            <DialogDescription>
              Mohon tunggu, sesi Anda tetap aktif selama proses berlangsung.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Progress value={printProgress.value} className="h-3" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{printProgress.label}</span>
              <span className="font-semibold tabular-nums">{printProgress.value}%</span>
            </div>
            {printProgress.total > 0 && (
              <p className="text-xs text-center text-muted-foreground">
                {printProgress.current} / {printProgress.total} kartu
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>

  );
};

export default ExamAdministration;
