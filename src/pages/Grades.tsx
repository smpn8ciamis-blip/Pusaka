import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Printer, Download, Award, TrendingUp, FileText, Scale, FileSpreadsheet } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addLetterheadToPDF, addSignatureToPDF } from '@/lib/pdfLetterhead';
import { GradeVisibilityPanel } from '@/components/GradeVisibilityPanel';
import { GradeComponentsDialog } from '@/components/grades/GradeComponentsDialog';
import { GradeImportDialog } from '@/components/grades/GradeImportDialog';
import { clearDraft, loadDraft, saveDraft } from '@/lib/gradeDraft';
import { parseClipboardGrid, parseScore, type ImportRow } from '@/lib/gradeImport';
import { useGradeComponents, useCustomScores } from '@/hooks/useGradeComponents';
import {
  CATEGORY_LABEL,
  LEGACY_KEYS,
  componentKey,
  computeCategoryAverages,
  computeFinal,
  gradeLabel,
  usedCategories,
  type LegacyKey,
  type StudentScores,
} from '@/lib/gradeComponents';

// Nilai yang sedang diketik per siswa ('' = belum diisi). Kolom lama (tugas..praktik) selalu dibawa
// supaya nilai yang tidak dipakai di rumus tidak hilang saat disimpan.
interface StudentInput {
  legacy: Record<LegacyKey, number | ''>;
  custom: Record<string, number | ''>;
}

/** Nilai awal tabel input dari data server (kolom lama + nilai jenis buatan guru). */
function buildInputs(students: any[], customScores: Record<string, Record<string, number>>) {
  const next: Record<string, StudentInput> = {};
  for (const st of students) {
    const g = st.existingGrade;
    const legacy = {} as Record<LegacyKey, number | ''>;
    for (const k of LEGACY_KEYS) legacy[k] = g?.[k] != null ? Number(g[k]) : 0;
    next[st.id] = { legacy, custom: { ...(customScores[st.id] || {}) } };
  }
  return next;
}

/** sel CSV aman: nama jenis penilaian buatan guru bisa memuat koma/tanda kutip */
const csvCell = (v: unknown) => {
  const t = String(v ?? '');
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

function GradesPage() {
  const { userRole, user } = useAuth();
  const { selectedYear } = useAcademicYear();
  
  // Function to convert name to Title Case
  const toTitleCase = (name: string): string => {
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [inputs, setInputs] = useState<Record<string, StudentInput>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [isComponentsOpen, setIsComponentsOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const initializedFor = useRef<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: classes } = useQuery({
    queryKey: ['classes', selectedYear],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('academic_year', selectedYear)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: schedules } = useQuery({
    queryKey: ['teacher-schedules-grades', user?.id, userRole, selectedYear],
    queryFn: async () => {
      if (!selectedYear) return [];
      
      if (userRole === 'admin') {
        const { data, error } = await supabase
          .from('schedules')
          .select('*, classes(name, grade)')
          .eq('academic_year', selectedYear)
          .order('subject');
        if (error) throw error;
        return data;
      } else {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();
        
        if (!teacher) return [];

        const { data, error } = await supabase
          .from('schedules')
          .select('*, classes(name, grade)')
          .eq('teacher_id', teacher.id)
          .eq('academic_year', selectedYear)
          .order('subject');
        
        if (error) throw error;
        return data;
      }
    },
    enabled: !!user?.id && !!userRole,
  });

  const { data: students } = useQuery({
    queryKey: ['students-with-grades', selectedClass],
    queryFn: async () => {
      let query = supabase
        .from('students')
        .select(`
          *,
          classes (
            name
          )
        `)
        .order('full_name');

      if (selectedClass !== 'all') {
        query = query.eq('class_id', selectedClass);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: scheduleStudents } = useQuery({
    queryKey: ['schedule-students-grades', selectedSchedule],
    queryFn: async () => {
      if (!selectedSchedule) return [];
      
      const { data: schedule } = await supabase
        .from('schedules')
        .select('class_id')
        .eq('id', selectedSchedule)
        .maybeSingle();
      
      if (!schedule) return [];

      const { data: students, error } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', schedule.class_id)
        .order('full_name');
      
      if (error) throw error;

      // Fetch existing grades
      const { data: existingGrades } = await supabase
        .from('grades')
        .select('*')
        .eq('schedule_id', selectedSchedule);

      // Merge students with their grades
      const studentsWithGrades = students?.map(student => {
        const grade = existingGrades?.find(g => g.student_id === student.id);
        return {
          ...student,
          existingGrade: grade,
        };
      });

      return studentsWithGrades || [];
    },
    enabled: !!selectedSchedule,
  });

  // Ujian CBT yang nilainya otomatis masuk ke mapel/kelas ini
  const { data: linkedCbt = [] } = useQuery({
    queryKey: ['grades-linked-cbt', selectedSchedule, selectedYear],
    enabled: !!selectedSchedule && !!selectedYear,
    queryFn: async () => {
      const sc = schedules?.find((x: any) => x.id === selectedSchedule);
      if (!sc) return [];
      const { data, error } = await (supabase as any).from('cbt_exams')
        .select('id, title, subject, grade_component, grade_policy, class_id, class_ids')
        .eq('academic_year', selectedYear).not('grade_component', 'is', null);
      if (error) return [];
      return ((data || []) as any[]).filter((e) => {
        if (String(e.subject || '').trim().toLowerCase() !== String(sc.subject || '').trim().toLowerCase()) return false;
        const ids: string[] = Array.isArray(e.class_ids) ? e.class_ids : [];
        if (ids.length === 0 && !e.class_id) return true;
        return ids.includes(sc.class_id) || e.class_id === sc.class_id;
      });
    },
  });

  // Jenis penilaian & bobot jadwal terpilih (rumus bawaan bila guru belum mengatur)
  const { components, isDefault } = useGradeComponents(selectedSchedule || null);
  const { data: customScores } = useCustomScores(selectedSchedule || null);
  const selectedScheduleObj = useMemo(
    () => (schedules as any[] | undefined)?.find((x) => x.id === selectedSchedule),
    [schedules, selectedSchedule],
  );
  const parallelCount = useMemo(() => {
    const sc = selectedScheduleObj;
    if (!sc) return 0;
    return ((schedules as any[]) || []).filter((o) =>
      o.id !== sc.id && o.teacher_id === sc.teacher_id && o.academic_year === sc.academic_year &&
      o.semester === sc.semester && String(o.subject || '').trim().toLowerCase() === String(sc.subject || '').trim().toLowerCase(),
    ).length;
  }, [schedules, selectedScheduleObj]);
  const otherSchedules = useMemo(
    () => ((schedules as any[]) || []).filter((o) => o.id !== selectedSchedule)
      .map((o) => ({ id: o.id as string, label: `${o.subject} - ${o.classes?.name ?? ''}` })),
    [schedules, selectedSchedule],
  );

  // Isi nilai awal kolom input sekali per mata pelajaran yang dibuka
  useEffect(() => {
    if (!selectedSchedule) { initializedFor.current = null; return; }
    if (!scheduleStudents || customScores === undefined || initializedFor.current === selectedSchedule) return;
    const students = scheduleStudents as any[];
    const next = buildInputs(students, customScores);
    const dirtyIds = new Set<string>();
    const draft = user?.id ? loadDraft<StudentInput>(user.id, selectedSchedule) : null;
    if (draft) {
      for (const [sid, v] of Object.entries(draft.students)) {
        if (!next[sid]) continue;
        next[sid] = { legacy: { ...next[sid].legacy, ...v.legacy }, custom: { ...next[sid].custom, ...v.custom } };
        dirtyIds.add(sid);
      }
    }
    setInputs(next);
    setDirty(dirtyIds);
    initializedFor.current = selectedSchedule;
    if (dirtyIds.size > 0 && user?.id) {
      const uid = user.id;
      const sched = selectedSchedule;
      toast.info(`Draf nilai yang belum disimpan dipulihkan (${dirtyIds.size} siswa)`, {
        duration: 10000,
        action: {
          label: 'Buang draf',
          onClick: () => {
            clearDraft(uid, sched);
            setInputs(buildInputs(students, customScores));
            setDirty(new Set());
          },
        },
      });
    }
  }, [selectedSchedule, scheduleStudents, customScores]);

  // Simpan draf otomatis (per perangkat) agar ketikan tidak hilang bila tab tertutup / koneksi putus
  useEffect(() => {
    if (!user?.id || !selectedSchedule || initializedFor.current !== selectedSchedule) return;
    const t = setTimeout(() => {
      const subset: Record<string, StudentInput> = {};
      dirty.forEach((sid) => { if (inputs[sid]) subset[sid] = inputs[sid]; });
      saveDraft(user.id, selectedSchedule, subset);
    }, 600);
    return () => clearTimeout(t);
  }, [inputs, dirty, selectedSchedule, user?.id]);

  const toScores = (input: StudentInput | undefined): StudentScores => {
    const legacy = {} as Record<LegacyKey, number>;
    for (const k of LEGACY_KEYS) legacy[k] = Number(input?.legacy[k]) || 0;
    const custom: Record<string, number> = {};
    for (const [id, v] of Object.entries(input?.custom || {})) custom[id] = Number(v) || 0;
    return { legacy, custom };
  };

  const saveGradesMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      const ids = Array.from(dirty);
      if (ids.length === 0) throw new Error('Tidak ada nilai yang diubah');

      const gradeRows = ids.map((sid) => {
        const sc = toScores(inputs[sid]);
        return { student_id: sid, schedule_id: selectedSchedule, created_by: user.id, ...sc.legacy };
      });
      const { error } = await supabase
        .from('grades')
        .upsert(gradeRows as any, { onConflict: 'student_id,schedule_id', ignoreDuplicates: false });
      if (error) throw error;

      // Nilai jenis penilaian buatan guru
      const customComps = components.filter((c) => !c.legacy_key && c.id);
      if (customComps.length > 0) {
        const upserts: any[] = [];
        const deletes: { student_id: string; component_id: string }[] = [];
        for (const sid of ids) {
          for (const c of customComps) {
            const v = inputs[sid]?.custom[c.id as string];
            if (v === '' || v === undefined) {
              if (customScores?.[sid]?.[c.id as string] !== undefined) deletes.push({ student_id: sid, component_id: c.id as string });
            } else {
              upserts.push({ student_id: sid, schedule_id: selectedSchedule, component_id: c.id, score: v, created_by: user.id });
            }
          }
        }
        if (upserts.length > 0) {
          const { error: e2 } = await (supabase as any)
            .from('grade_scores')
            .upsert(upserts, { onConflict: 'student_id,component_id', ignoreDuplicates: false });
          if (e2) throw e2;
        }
        for (const d of deletes) {
          const { error: e3 } = await (supabase as any).from('grade_scores').delete()
            .eq('student_id', d.student_id).eq('component_id', d.component_id);
          if (e3) throw e3;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-students-grades'] });
      queryClient.invalidateQueries({ queryKey: ['grade-scores'] });
      toast.success('Nilai berhasil disimpan');
      setIsDialogOpen(false);
      // kolom input sudah memuat nilai yang baru disimpan; cukup kosongkan penanda perubahan
      setDirty(new Set());
      if (user?.id && selectedSchedule) clearDraft(user.id, selectedSchedule);
    },
    onError: (error: any) => {
      console.error('Error saving grades:', error);
      toast.error(`Gagal menyimpan nilai: ${error.message}`);
    },
  });

  /** raw dari kolom input; kosong = belum diisi, selain itu dibatasi 0-100 */
  const updateInput = (studentId: string, target: { legacy: LegacyKey } | { custom: string }, raw: string) => {
    const value: number | '' = raw === '' ? '' : Math.min(100, Math.max(0, Number(raw) || 0));
    setInputs((prev) => {
      const cur = prev[studentId] ?? { legacy: { tugas: 0, kuis: 0, uts: 0, uas: 0, praktik: 0 }, custom: {} };
      return 'legacy' in target
        ? { ...prev, [studentId]: { ...cur, legacy: { ...cur.legacy, [target.legacy]: value } } }
        : { ...prev, [studentId]: { ...cur, custom: { ...cur.custom, [target.custom]: value } } };
    });
    setDirty((prev) => new Set(prev).add(studentId));
  };

  /** Terapkan banyak nilai sekaligus (tempel dari Excel / impor berkas). */
  const applyChanges = (changes: { studentId: string; comp: (typeof components)[number]; value: number }[]) => {
    if (changes.length === 0) return;
    setInputs((prev) => {
      const next = { ...prev };
      for (const ch of changes) {
        const cur = next[ch.studentId] ?? { legacy: { tugas: 0, kuis: 0, uts: 0, uas: 0, praktik: 0 }, custom: {} };
        next[ch.studentId] = ch.comp.legacy_key
          ? { ...cur, legacy: { ...cur.legacy, [ch.comp.legacy_key]: ch.value } }
          : { ...cur, custom: { ...cur.custom, [ch.comp.id as string]: ch.value } };
      }
      return next;
    });
    setDirty((prev) => {
      const n = new Set(prev);
      changes.forEach((c) => n.add(c.studentId));
      return n;
    });
  };

  const applyImport = (rows: ImportRow[]) => {
    const byKey = new Map(components.map((c, i) => [componentKey(c, i), c] as const));
    const changes: Parameters<typeof applyChanges>[0] = [];
    for (const r of rows) {
      if (!r.studentId) continue;
      for (const [key, v] of Object.entries(r.values)) {
        const comp = byKey.get(key);
        if (comp && v !== '') changes.push({ studentId: r.studentId, comp, value: v });
      }
    }
    applyChanges(changes);
  };

  const focusCell = (r: number, c: number) => {
    const el = gridRef.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
    if (el) { el.focus(); el.select(); }
  };

  /** Enter / panah bawah = sel di bawahnya; panah atas / Shift+Enter = sel di atasnya */
  const handleCellKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focusCell(r + (e.shiftKey ? -1 : 1), c); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(r - 1, c); }
  };

  /** Tempel beberapa sel dari Excel/Sheets: mulai dari sel yang sedang aktif */
  const handleCellPaste = (e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.trim())) return; // satu nilai: perilaku biasa
    e.preventDefault();
    const students = (scheduleStudents as any[]) || [];
    const changes: Parameters<typeof applyChanges>[0] = [];
    let skipped = 0;
    parseClipboardGrid(text).forEach((line, dr) => {
      line.forEach((cell, dc) => {
        const st = students[r + dr];
        const comp = components[c + dc];
        if (!st || !comp) return;
        const v = parseScore(cell);
        if (v === '') return;
        if (v === null || v < 0 || v > 100) { skipped++; return; }
        changes.push({ studentId: st.id, comp, value: v });
      });
    });
    applyChanges(changes);
    toast.success(`${changes.length} nilai ditempel${skipped ? `, ${skipped} sel dilewati (bukan angka 0–100)` : ''}`);
  };

  const getGradeLabel = gradeLabel;

  const handleSaveGrades = () => {
    if (dirty.size === 0) {
      toast.error('Tidak ada nilai yang diubah');
      return;
    }
    saveGradesMutation.mutate();
  };

  /** nilai tiap jenis penilaian (urut sama dengan `components`) untuk ekspor PDF/CSV */
  const exportValues = (student: any) => {
    const g = student.existingGrade;
    return components.map((c) => {
      const v = c.legacy_key ? g?.[c.legacy_key] : c.id ? customScores?.[student.id]?.[c.id] : 0;
      return v == null ? 0 : Number(v);
    });
  };

  const cats = usedCategories(components);
  const showCats = cats.length > 1;
  /** rata-rata per kategori untuk ekspor (urut `cats`) */
  const exportCategoryValues = (student: any) => {
    const g = student.existingGrade;
    const legacy = {} as Record<LegacyKey, number>;
    for (const k of LEGACY_KEYS) legacy[k] = Number(g?.[k]) || 0;
    const custom: Record<string, number> = {};
    for (const [id, v] of Object.entries(customScores?.[student.id] || {})) custom[id] = Number(v) || 0;
    const avg = computeCategoryAverages(components, { legacy, custom });
    return cats.map((k) => (avg[k] == null ? '-' : Number(avg[k]!.toFixed(2))));
  };

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('school_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const handleExportPDF = async () => {
    if (!scheduleStudents || !selectedSchedule) {
      toast.error('Pilih mata pelajaran terlebih dahulu');
      return;
    }

    const schedule = schedules?.find(s => s.id === selectedSchedule);
    if (!schedule) return;

    // Get teacher info for the schedule
    const { data: teacherData } = await supabase
      .from('teachers')
      .select('nip, user_id, profiles(full_name)')
      .eq('id', schedule.teacher_id)
      .single();

    // banyak jenis penilaian -> kertas landscape agar kolom tidak sempit
    const doc = new jsPDF({ orientation: components.length > 6 ? 'landscape' : 'portrait' });
    
    // Add letterhead
    const startY = await addLetterheadToPDF(doc, schoolSettings);
    
    // Report title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN NILAI SISWA', doc.internal.pageSize.getWidth() / 2, startY, { align: 'center' });
    
    // Report info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Mata Pelajaran: ${schedule.subject}`, 14, startY + 8);
    doc.text(`Kelas: ${schedule.classes?.name || '-'}`, 14, startY + 14);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, startY + 20);

    // Table data
    const tableData = scheduleStudents.map((student: any, index: number) => {
      const grade = student.existingGrade;
      const finalGrade = grade?.final_grade || 0;
      const { label } = getGradeLabel(Number(finalGrade));
      
      return [
        index + 1,
        student.nis,
        toTitleCase(student.full_name),
        ...exportValues(student),
        ...(showCats ? exportCategoryValues(student) : []),
        Number(finalGrade).toFixed(2),
        label
      ];
    });

    autoTable(doc, {
      startY: startY + 26,
      head: [['No', 'NIS', 'Nama', ...components.map((c) => `${c.name} (${c.weight}%)`), ...(showCats ? cats.map((k) => `Rata² ${CATEGORY_LABEL[k]}`) : []), 'Nilai', 'Grade']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246] },
      styles: { fontSize: components.length > 8 ? 7 : 9 },
    });

    // Save report data to database
    const finalY = (doc as any).lastAutoTable.finalY;
    const reportData = {
      verification: 'DOKUMEN VALID',
      type: 'Laporan Nilai Siswa',
      school: schoolSettings?.school_name,
      subject: schedule.subject,
      class: schedule.classes?.name,
      printDate: new Date().toISOString(),
      totalStudents: scheduleStudents.length,
      grades: scheduleStudents.map((s: any) => {
        const grade = s.existingGrade;
        const finalGrade = grade?.final_grade || 0;
        return {
          nis: s.nis,
          nama: toTitleCase(s.full_name),
          komponen: Object.fromEntries(components.map((c, i) => [`${c.name} (${c.weight}%)`, exportValues(s)[i]])),
          ...(showCats ? { kategori: Object.fromEntries(cats.map((k, i) => [CATEGORY_LABEL[k], exportCategoryValues(s)[i]])) } : {}),
          nilaiAkhir: Number(finalGrade).toFixed(2),
          predikat: getGradeLabel(Number(finalGrade)).label
        };
      })
    };

    // Generate serial number and save to database
    const { data: serialData, error: serialError } = await supabase.rpc('generate_report_serial');
    if (serialError) {
      console.error('Error generating serial:', serialError);
      toast.error('Gagal menggenerate nomor seri laporan');
      return;
    }
    
    const { error: insertError } = await supabase
      .from('verified_reports')
      .insert({
        serial_number: serialData,
        report_type: 'grades',
        report_data: reportData,
        created_by: user?.id
      });

    if (insertError) {
      console.error('Error saving report:', insertError);
      toast.error('Gagal menyimpan data laporan untuk verifikasi');
      return;
    }

    // Add signature with serial number QR code
    await addSignatureToPDF(doc, schoolSettings, schoolSettings?.headmaster_name, schoolSettings?.headmaster_nip, finalY, serialData);

    doc.save(`nilai-${schedule.subject}-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Laporan berhasil dicetak dengan QR code verifikasi');
  };

  const handleExport = () => {
    if (!scheduleStudents || !selectedSchedule) {
      toast.error('Pilih mata pelajaran terlebih dahulu');
      return;
    }

    const schedule = schedules?.find(s => s.id === selectedSchedule);
    
    const csvContent = [
      ['NIS', 'Nama', 'Kelas', ...components.map((c) => csvCell(`${c.name} (${c.weight}%)`)), ...(showCats ? cats.map((k) => `Rata-rata ${CATEGORY_LABEL[k]}`) : []), 'Nilai Akhir', 'Predikat'].join(','),
      ...scheduleStudents.map((s: any) => {
        const grade = s.existingGrade;
        const finalGrade = grade?.final_grade || 0;
        const { label } = getGradeLabel(Number(finalGrade));
        return [
          csvCell(s.nis),
          csvCell(toTitleCase(s.full_name)),
          csvCell(schedule?.classes?.name || ''),
          ...exportValues(s),
          ...(showCats ? exportCategoryValues(s) : []),
          Number(finalGrade).toFixed(2),
          label
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nilai-${schedule?.subject}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const filteredStudents = students?.filter((student) =>
    toTitleCase(student.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.nis?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">Input Nilai</h1>
            <p className="text-muted-foreground">Kelola nilai siswa per mata pelajaran</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportPDF} className="gap-2">
              <FileText className="h-4 w-4" />
              Cetak PDF
            </Button>
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  Input Nilai
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Input Nilai Siswa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Pilih Mata Pelajaran</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select value={selectedSchedule} onValueChange={setSelectedSchedule}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih mata pelajaran" />
                        </SelectTrigger>
                        <SelectContent>
                          {schedules?.map((schedule) => (
                            <SelectItem key={schedule.id} value={schedule.id}>
                              {schedule.subject} - {schedule.classes?.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedSchedule && (
                        <Button type="button" variant="outline" className="gap-2 shrink-0" onClick={() => setIsComponentsOpen(true)}>
                          <Scale className="h-4 w-4" />
                          Atur Jenis & Bobot
                        </Button>
                      )}
                      {selectedSchedule && (
                        <Button type="button" variant="outline" className="gap-2 shrink-0" onClick={() => setIsImportOpen(true)} disabled={!scheduleStudents || scheduleStudents.length === 0}>
                          <FileSpreadsheet className="h-4 w-4" />
                          Impor Excel/CSV
                        </Button>
                      )}
                    </div>
                    {selectedSchedule && (
                      <p className="text-xs text-muted-foreground">
                        Rumus nilai akhir{isDefault ? ' (bawaan sekolah)' : ' (diatur guru)'}:{' '}
                        {components.map((c) => `${c.name} ${c.weight}%`).join(' + ')}
                      </p>
                    )}
                  </div>

                  {selectedSchedule && linkedCbt.length > 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs space-y-1">
                      <p className="font-medium">Nilai dari ujian CBT terisi otomatis:</p>
                      {linkedCbt.map((e: any) => {
                        const target = components.find((c) => c.legacy_key === e.grade_component);
                        return (
                          <p key={e.id}>
                            • <b>{target ? target.name : String(e.grade_component).toUpperCase()}</b> ← {e.title} ({e.grade_policy === 'latest' ? 'nilai terakhir' : e.grade_policy === 'average' ? 'rata-rata' : 'nilai tertinggi'})
                            {!target && <span className="text-destructive font-medium"> — tidak ada jenis penilaian yang menerimanya, nilai ini tidak ikut dihitung. Atur lewat “Atur Jenis & Bobot”.</span>}
                          </p>
                        );
                      })}
                      <p className="text-muted-foreground">Mengubah komponen tersebut di sini akan tertimpa lagi bila siswa menyelesaikan atau guru mengirim ulang nilai CBT.</p>
                    </div>
                  )}

                  {selectedSchedule && scheduleStudents && scheduleStudents.length > 0 && (
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">
                        Tips: Enter atau panah bawah pindah ke siswa berikutnya. Anda bisa menyalin kolom nilai dari Excel lalu menempelnya di sel pertama. Ketikan tersimpan otomatis sebagai draf di perangkat ini.
                        {dirty.size > 0 && <b className="text-foreground"> {dirty.size} siswa diubah, belum disimpan.</b>}
                      </p>
                      <div className="overflow-x-auto" ref={gridRef}>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">No</TableHead>
                              <TableHead className="min-w-[180px] sticky left-0 z-10 bg-background">Nama Siswa</TableHead>
                              {components.map((c, ci) => (
                                <TableHead key={componentKey(c, ci)} className="w-[100px]">
                                  {c.name} ({c.weight}%)
                                  {showCats && <div className="text-[10px] font-normal text-muted-foreground">{CATEGORY_LABEL[c.category]}</div>}
                                </TableHead>
                              ))}
                              {showCats && cats.map((k) => (
                                <TableHead key={k} className="w-[90px] text-xs">Rata² {CATEGORY_LABEL[k]}</TableHead>
                              ))}
                              <TableHead className="w-[100px]">Nilai Akhir</TableHead>
                              <TableHead className="w-[80px]">Predikat</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {scheduleStudents.map((student: any, index) => {
                              const input = inputs[student.id];
                              const finalGrade = computeFinal(components, toScores(input));
                              const { label, color } = getGradeLabel(finalGrade);
                              const catAvg = showCats ? computeCategoryAverages(components, toScores(input)) : null;

                              return (
                                <TableRow key={student.id}>
                                  <TableCell>{index + 1}</TableCell>
                                  <TableCell className="font-medium sticky left-0 z-10 bg-background">{toTitleCase(student.full_name)}</TableCell>
                                  {components.map((c, ci) => {
                                    const raw = c.legacy_key ? input?.legacy[c.legacy_key] : c.id ? input?.custom[c.id] : '';
                                    return (
                                      <TableCell key={componentKey(c, ci)}>
                                        <Input
                                          type="number"
                                          min="0"
                                          max="100"
                                          value={raw === '' || raw === undefined || raw === 0 ? '' : raw}
                                          onChange={(e) =>
                                            updateInput(
                                              student.id,
                                              c.legacy_key ? { legacy: c.legacy_key } : { custom: c.id as string },
                                              e.target.value,
                                            )
                                          }
                                          placeholder="0-100"
                                          className="w-20"
                                          data-r={index}
                                          data-c={ci}
                                          onKeyDown={(e) => handleCellKey(e, index, ci)}
                                          onPaste={(e) => handleCellPaste(e, index, ci)}
                                          aria-label={`${c.name} ${toTitleCase(student.full_name)}`}
                                        />
                                      </TableCell>
                                    );
                                  })}
                                  {catAvg && cats.map((k) => (
                                    <TableCell key={k} className="text-sm">{catAvg[k] == null ? '-' : Number(catAvg[k]!.toFixed(2))}</TableCell>
                                  ))}
                                  <TableCell>
                                    <span className="font-bold text-lg">{Number(finalGrade.toFixed(2))}</span>
                                  </TableCell>
                                  <TableCell>
                                    <span className={`px-3 py-1 rounded-full font-bold ${color}`}>
                                      {label}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                          Batal
                        </Button>
                        <Button onClick={handleSaveGrades} className="bg-gradient-primary">
                          Simpan Nilai
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <GradeVisibilityPanel />

        {selectedSchedule && (
          <GradeImportDialog
            open={isImportOpen}
            onOpenChange={setIsImportOpen}
            scheduleLabel={selectedScheduleObj ? `${selectedScheduleObj.subject} - ${selectedScheduleObj.classes?.name ?? ''}` : ''}
            students={((scheduleStudents as any[]) || []).map((st) => ({ id: st.id, nis: st.nis ?? null, full_name: st.full_name, active: (st.status ?? 'aktif') === 'aktif' && !st.is_alumni }))}
            components={components}
            valueOf={(sid, c) => (c.legacy_key ? inputs[sid]?.legacy[c.legacy_key] : c.id ? inputs[sid]?.custom[c.id] : '')}
            onApply={applyImport}
          />
        )}

        {selectedSchedule && (
          <GradeComponentsDialog
            open={isComponentsOpen}
            onOpenChange={setIsComponentsOpen}
            scheduleId={selectedSchedule}
            scheduleLabel={selectedScheduleObj ? `${selectedScheduleObj.subject} - ${selectedScheduleObj.classes?.name ?? ''}` : ''}
            current={components}
            isDefault={isDefault}
            otherSchedules={otherSchedules}
            parallelCount={parallelCount}
          />
        )}

        {/* Filter Section */}
        <Card className="card-hover border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Filter Siswa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari nama atau NIS..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua Kelas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kelas</SelectItem>
                  {classes?.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Students List */}
        <Card className="card-hover border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Daftar Siswa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>NIS</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>Jenis Kelamin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents && filteredStudents.length > 0 ? (
                  filteredStudents.map((student, index) => (
                    <TableRow key={student.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{student.nis}</TableCell>
                      <TableCell>{toTitleCase(student.full_name)}</TableCell>
                      <TableCell>{student.classes?.name || '-'}</TableCell>
                      <TableCell>{student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Tidak ada data siswa
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function Grades() {
  return (
    <GradesPage />
  );
}
