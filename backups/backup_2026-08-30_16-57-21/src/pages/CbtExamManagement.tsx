import { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Plus, Search, Edit, Trash2, FileSpreadsheet, Users, Download, Printer, KeyRound, Activity, BookmarkPlus, Library, RefreshCcw, Pause, Play, Power, Clock, BarChart3, ShieldAlert } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { RichTextEditor, RichTextDisplay } from '@/components/cbt/RichTextEditor';

const ITEMS_PER_PAGE = 10;

const generateToken = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export default function CbtExamManagement() {
  const { user, userRole } = useAuth();
  const { selectedYear } = useAcademicYear();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isQuestionsOpen, setIsQuestionsOpen] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isControlOpen, setIsControlOpen] = useState(false);
  const [isGradingOpen, setIsGradingOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const initialExamForm = {
    title: '', subject: '', class_id: '', class_ids: [] as string[], duration_minutes: 60,
    pass_score: 70, is_active: false, show_result_to_student: true,
    start_datetime: '', end_datetime: '', shuffle_questions: false, shuffle_options: false,
    require_token: false, exam_token: '', max_attempts: 1, allow_resume: true,
    instructions: '', exam_type: 'mixed',
    anti_cheat_enabled: false, exit_token: '', max_violations: 3,
  };
  const [examForm, setExamForm] = useState(initialExamForm);

  const initialQuestionForm = {
    question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', option_e: '',
    correct_answer: 'A', points: 1, question_type: 'multiple_choice', essay_answer_key: '',
  };
  const [questionForm, setQuestionForm] = useState(initialQuestionForm);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);

  const [templateForm, setTemplateForm] = useState({ title: '', subject: '', description: '' });

  // Fetch teacher
  const { data: teacherData } = useQuery({
    queryKey: ['teacher-for-cbt', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from('teachers').select('id').eq('user_id', user.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: classes } = useQuery({
    queryKey: ['classes-for-cbt', selectedYear],
    queryFn: async () => {
      const { data } = await supabase.from('classes').select('id, name, grade').eq('academic_year', selectedYear).order('grade').order('name');
      return data || [];
    },
  });

  const { data: exams, isLoading } = useQuery({
    queryKey: ['cbt-exams', selectedYear, user?.id, userRole],
    queryFn: async () => {
      let query = supabase.from('cbt_exams').select('*, classes(name, grade)').eq('academic_year', selectedYear).order('created_at', { ascending: false });
      if (userRole === 'teacher') query = query.eq('created_by', user!.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: questions } = useQuery({
    queryKey: ['cbt-questions', selectedExam?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('cbt_questions').select('*').eq('exam_id', selectedExam.id).order('question_number');
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedExam?.id,
  });

  const { data: examResults } = useQuery({
    queryKey: ['cbt-results', selectedExam?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cbt_exam_sessions')
        .select('*, students(full_name, nis, class_id, classes(name, grade))')
        .eq('exam_id', selectedExam.id)
        .order('score', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedExam?.id && (isResultsOpen || isControlOpen || isGradingOpen),
    refetchInterval: isControlOpen ? 5000 : false,
  });

  // Live answer counts per session for monitoring panel
  const { data: answerCounts } = useQuery({
    queryKey: ['cbt-answer-counts', selectedExam?.id, examResults?.length],
    queryFn: async () => {
      const ids = (examResults || []).map((r: any) => r.id);
      if (!ids.length) return {} as Record<string, number>;
      const { data } = await supabase.from('cbt_student_answers').select('session_id').in('session_id', ids);
      const map: Record<string, number> = {};
      (data || []).forEach((a: any) => { map[a.session_id] = (map[a.session_id] || 0) + 1; });
      return map;
    },
    enabled: !!selectedExam?.id && isControlOpen && (examResults?.length || 0) > 0,
    refetchInterval: isControlOpen ? 5000 : false,
  });

  // Templates
  const { data: templates } = useQuery({
    queryKey: ['cbt-templates', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('cbt_question_templates').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isTemplatesOpen,
  });

  // Session being graded - load all answers
  const { data: gradingAnswers } = useQuery({
    queryKey: ['cbt-grading-answers', selectedSession?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('cbt_student_answers')
        .select('*, cbt_questions(question_text, question_type, points, essay_answer_key, correct_answer)')
        .eq('session_id', selectedSession.id);
      return data || [];
    },
    enabled: !!selectedSession?.id && isGradingOpen,
  });

  // Analysis data
  const { data: analysisData } = useQuery({
    queryKey: ['cbt-analysis', selectedExam?.id],
    queryFn: async () => {
      const { data: sessions } = await supabase.from('cbt_exam_sessions')
        .select('*, students(full_name, nis, classes(name, grade))')
        .eq('exam_id', selectedExam.id).eq('status', 'completed');
      const sessionIds = (sessions || []).map((s: any) => s.id);
      const [ansRes, qsRes, vRes] = await Promise.all([
        sessionIds.length ? supabase.from('cbt_student_answers').select('*').in('session_id', sessionIds) : Promise.resolve({ data: [] as any[] }),
        supabase.from('cbt_questions').select('*').eq('exam_id', selectedExam.id).order('question_number'),
        supabase.from('cbt_session_violations').select('*').eq('exam_id', selectedExam.id),
      ]);
      return { sessions: sessions || [], answers: ansRes.data || [], questions: qsRes.data || [], violations: vRes.data || [] };
    },
    enabled: !!selectedExam?.id && isAnalysisOpen,
  });

  const filteredExams = useMemo(() => {
    if (!exams) return [];
    if (!searchQuery) return exams;
    const q = searchQuery.toLowerCase();
    return exams.filter((e: any) => e.title.toLowerCase().includes(q) || e.subject.toLowerCase().includes(q));
  }, [exams, searchQuery]);

  const totalPages = Math.ceil(filteredExams.length / ITEMS_PER_PAGE);
  const paginatedExams = filteredExams.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const createExamMutation = useMutation({
    mutationFn: async (data: typeof examForm) => {
      const cIds = (data.class_ids || []).filter(Boolean);
      const payload: any = {
        ...data,
        teacher_id: teacherData?.id || user!.id,
        academic_year: selectedYear,
        created_by: user!.id,
        start_datetime: data.start_datetime || null,
        end_datetime: data.end_datetime || null,
        class_id: cIds[0] || data.class_id || null,
        class_ids: cIds.length > 0 ? cIds : null,
        exam_token: data.require_token ? (data.exam_token || generateToken()) : null,
      };
      const { error } = await supabase.from('cbt_exams').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cbt-exams'] });
      setIsCreateOpen(false);
      setExamForm(initialExamForm);
      toast.success('Ujian CBT berhasil dibuat');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateExamMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const cIds = (data.class_ids || []).filter(Boolean);
      const payload = {
        ...data,
        class_id: cIds[0] || data.class_id || null,
        class_ids: cIds.length > 0 ? cIds : null,
        start_datetime: data.start_datetime || null,
        end_datetime: data.end_datetime || null,
        exam_token: data.require_token ? (data.exam_token || generateToken()) : null,
      };
      const { error } = await supabase.from('cbt_exams').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cbt-exams'] });
      setIsEditOpen(false);
      toast.success('Ujian berhasil diperbarui');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteExamMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cbt_exams').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cbt-exams'] });
      toast.success('Ujian berhasil dihapus');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addQuestionMutation = useMutation({
    mutationFn: async (data: typeof questionForm) => {
      const nextNumber = (questions?.length || 0) + 1;
      const payload: any = {
        exam_id: selectedExam.id,
        question_number: nextNumber,
        question_text: data.question_text,
        question_type: data.question_type,
        points: data.points,
      };
      if (data.question_type === 'multiple_choice') {
        Object.assign(payload, {
          option_a: data.option_a, option_b: data.option_b, option_c: data.option_c,
          option_d: data.option_d, option_e: data.option_e || null, correct_answer: data.correct_answer,
        });
      } else {
        payload.essay_answer_key = data.essay_answer_key;
        payload.correct_answer = 'ESSAY';
      }
      const { error } = await supabase.from('cbt_questions').insert(payload);
      if (error) throw error;
      await supabase.from('cbt_exams').update({ total_questions: nextNumber }).eq('id', selectedExam.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cbt-questions'] });
      queryClient.invalidateQueries({ queryKey: ['cbt-exams'] });
      setQuestionForm(initialQuestionForm);
      toast.success('Soal berhasil ditambahkan');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const payload: any = {
        question_text: data.question_text,
        question_type: data.question_type,
        points: data.points,
      };
      if (data.question_type === 'multiple_choice') {
        Object.assign(payload, {
          option_a: data.option_a, option_b: data.option_b, option_c: data.option_c,
          option_d: data.option_d, option_e: data.option_e || null, correct_answer: data.correct_answer,
          essay_answer_key: null,
        });
      } else {
        payload.essay_answer_key = data.essay_answer_key;
        payload.correct_answer = 'ESSAY';
        payload.option_a = null; payload.option_b = null; payload.option_c = null; payload.option_d = null; payload.option_e = null;
      }
      const { error } = await supabase.from('cbt_questions').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cbt-questions'] });
      setEditingQuestion(null);
      setQuestionForm(initialQuestionForm);
      toast.success('Soal berhasil diperbarui');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cbt_questions').delete().eq('id', id);
      if (error) throw error;
      const remaining = (questions?.length || 1) - 1;
      await supabase.from('cbt_exams').update({ total_questions: remaining }).eq('id', selectedExam.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cbt-questions'] });
      queryClient.invalidateQueries({ queryKey: ['cbt-exams'] });
      toast.success('Soal berhasil dihapus');
    },
  });

  // Save current exam questions as template
  const saveAsTemplateMutation = useMutation({
    mutationFn: async (form: typeof templateForm) => {
      if (!questions || questions.length === 0) throw new Error('Tidak ada soal untuk disimpan');
      const { error } = await supabase.from('cbt_question_templates').insert({
        title: form.title || selectedExam?.title || 'Template',
        subject: form.subject || selectedExam?.subject || '-',
        description: form.description,
        created_by: user!.id,
        questions: questions.map((q: any) => ({
          question_text: q.question_text, question_type: q.question_type, points: q.points,
          option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d, option_e: q.option_e,
          correct_answer: q.correct_answer, essay_answer_key: q.essay_answer_key,
        })),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Template tersimpan');
      setTemplateForm({ title: '', subject: '', description: '' });
      queryClient.invalidateQueries({ queryKey: ['cbt-templates'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async (template: any) => {
      if (!selectedExam) throw new Error('Pilih ujian dulu');
      const startNum = (questions?.length || 0) + 1;
      const inserts = (template.questions || []).map((q: any, i: number) => ({
        exam_id: selectedExam.id,
        question_number: startNum + i,
        question_text: q.question_text,
        question_type: q.question_type || 'multiple_choice',
        option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d, option_e: q.option_e || null,
        correct_answer: q.correct_answer || 'A',
        essay_answer_key: q.essay_answer_key,
        points: q.points || 1,
      }));
      const { error } = await supabase.from('cbt_questions').insert(inserts);
      if (error) throw error;
      await supabase.from('cbt_exams').update({ total_questions: startNum + inserts.length - 1 }).eq('id', selectedExam.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cbt-questions'] });
      queryClient.invalidateQueries({ queryKey: ['cbt-exams'] });
      setIsTemplatesOpen(false);
      toast.success('Template berhasil diterapkan');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cbt_question_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cbt-templates'] });
      toast.success('Template dihapus');
    },
  });

  // Control panel actions
  const sessionActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'pause' | 'resume' | 'finalize' | 'reset' }) => {
      if (action === 'pause') {
        await supabase.from('cbt_exam_sessions').update({ status: 'paused' }).eq('id', id);
      } else if (action === 'resume') {
        await supabase.from('cbt_exam_sessions').update({ status: 'in_progress', last_activity_at: new Date().toISOString() }).eq('id', id);
      } else if (action === 'finalize') {
        await supabase.from('cbt_exam_sessions').update({ status: 'completed', end_time: new Date().toISOString() }).eq('id', id);
      } else if (action === 'reset') {
        await supabase.from('cbt_student_answers').delete().eq('session_id', id);
        await supabase.from('cbt_exam_sessions').delete().eq('id', id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cbt-results'] });
      toast.success('Aksi berhasil');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Save essay grades
  const saveGradingMutation = useMutation({
    mutationFn: async (grades: { id: string; essay_score_given: number; grader_note: string }[]) => {
      for (const g of grades) {
        await supabase.from('cbt_student_answers').update({
          essay_score_given: g.essay_score_given,
          grader_note: g.grader_note,
          graded_by: user!.id,
          graded_at: new Date().toISOString(),
        }).eq('id', g.id);
      }
      // Recalculate session score: pg_score + essay_score
      if (selectedSession && gradingAnswers) {
        const totalPoints = gradingAnswers.reduce((s: number, a: any) => s + (a.cbt_questions?.points || 1), 0);
        const correctPg = gradingAnswers.filter((a: any) => a.cbt_questions?.question_type !== 'essay' && a.is_correct)
          .reduce((s: number, a: any) => s + (a.cbt_questions?.points || 1), 0);
        const essayEarned = grades.reduce((s, g) => s + (Number(g.essay_score_given) || 0), 0);
        const totalEarned = correctPg + essayEarned;
        const finalScore = totalPoints > 0 ? (totalEarned / totalPoints) * 100 : 0;
        await supabase.from('cbt_exam_sessions').update({
          essay_score: essayEarned,
          pg_score: correctPg,
          score: finalScore,
          grading_status: 'fully_graded',
        }).eq('id', selectedSession.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cbt-results'] });
      queryClient.invalidateQueries({ queryKey: ['cbt-grading-answers'] });
      setIsGradingOpen(false);
      toast.success('Penilaian disimpan');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleEditExam = (exam: any) => {
    setSelectedExam(exam);
    setExamForm({
      title: exam.title, subject: exam.subject, class_id: exam.class_id || '',
      class_ids: Array.isArray(exam.class_ids) ? exam.class_ids : (exam.class_id ? [exam.class_id] : []),
      duration_minutes: exam.duration_minutes, pass_score: exam.pass_score,
      is_active: exam.is_active, show_result_to_student: exam.show_result_to_student,
      start_datetime: exam.start_datetime ? format(new Date(exam.start_datetime), "yyyy-MM-dd'T'HH:mm") : '',
      end_datetime: exam.end_datetime ? format(new Date(exam.end_datetime), "yyyy-MM-dd'T'HH:mm") : '',
      shuffle_questions: exam.shuffle_questions, shuffle_options: exam.shuffle_options,
      require_token: exam.require_token || false,
      exam_token: exam.exam_token || '',
      max_attempts: exam.max_attempts || 1,
      allow_resume: exam.allow_resume !== false,
      instructions: exam.instructions || '',
      exam_type: exam.exam_type || 'mixed',
      anti_cheat_enabled: exam.anti_cheat_enabled || false,
      exit_token: exam.exit_token || '',
      max_violations: exam.max_violations || 3,
    });
    setIsEditOpen(true);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedExam) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);
        const startNum = (questions?.length || 0) + 1;
        const inserts = rows.map((row, i) => {
          const type = String(row['Tipe'] || row['type'] || 'multiple_choice').toLowerCase().includes('essay') ? 'essay' : 'multiple_choice';
          return {
            exam_id: selectedExam.id,
            question_number: startNum + i,
            question_text: String(row['Soal'] || row['question_text'] || ''),
            question_type: type,
            option_a: type === 'multiple_choice' ? String(row['A'] || row['option_a'] || '') : null,
            option_b: type === 'multiple_choice' ? String(row['B'] || row['option_b'] || '') : null,
            option_c: type === 'multiple_choice' ? String(row['C'] || row['option_c'] || '') : null,
            option_d: type === 'multiple_choice' ? String(row['D'] || row['option_d'] || '') : null,
            option_e: type === 'multiple_choice' ? (row['E'] || row['option_e'] || null) : null,
            correct_answer: type === 'essay' ? 'ESSAY' : String(row['Kunci'] || row['correct_answer'] || 'A').toUpperCase(),
            essay_answer_key: type === 'essay' ? String(row['KunciEssay'] || row['essay_answer_key'] || '') : null,
            points: Number(row['Poin'] || row['points'] || 1),
          };
        });
        const { error } = await supabase.from('cbt_questions').insert(inserts);
        if (error) throw error;
        await supabase.from('cbt_exams').update({ total_questions: startNum + rows.length - 1 }).eq('id', selectedExam.id);
        queryClient.invalidateQueries({ queryKey: ['cbt-questions'] });
        queryClient.invalidateQueries({ queryKey: ['cbt-exams'] });
        toast.success(`${rows.length} soal berhasil diimport`);
        setIsImportOpen(false);
      } catch (err: any) {
        toast.error('Gagal import: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const data = [
      { Soal: 'Contoh soal pilihan ganda?', Tipe: 'multiple_choice', A: 'Jawaban A', B: 'Jawaban B', C: 'Jawaban C', D: 'Jawaban D', E: '', Kunci: 'A', KunciEssay: '', Poin: 1 },
      { Soal: 'Jelaskan tentang ...?', Tipe: 'essay', A: '', B: '', C: '', D: '', E: '', Kunci: '', KunciEssay: 'Jawaban ideal/kunci essay', Poin: 5 },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Template_Soal_CBT.xlsx');
  };

  const handleExportResults = (type: 'excel' | 'pdf') => {
    if (!examResults || !selectedExam) return;
    if (type === 'excel') {
      const wsData = examResults.map((r: any, i: number) => ({
        'No': i + 1,
        'Nama': (r.students as any)?.full_name || '-',
        'NIS': (r.students as any)?.nis || '-',
        'PG Benar': r.correct_count, 'PG Salah': r.wrong_count,
        'Skor PG': r.pg_score?.toFixed(1) || '-',
        'Skor Essay': r.essay_score?.toFixed(1) || '-',
        'Nilai Total': r.score?.toFixed(1) || '-',
        'Status': r.status, 'Koreksi': r.grading_status,
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), 'Hasil');
      XLSX.writeFile(wb, `Hasil_${selectedExam.title}.xlsx`);
    } else {
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text(`Hasil Ujian: ${selectedExam.title}`, 14, 20);
      doc.setFontSize(10);
      doc.text(`Mata Pelajaran: ${selectedExam.subject}`, 14, 28);
      (doc as any).autoTable({
        startY: 35,
        head: [['No', 'Nama', 'NIS', 'PG', 'Essay', 'Total', 'Status']],
        body: examResults.map((r: any, i: number) => [
          i + 1, (r.students as any)?.full_name || '-', (r.students as any)?.nis || '-',
          r.pg_score?.toFixed(1) || '-', r.essay_score?.toFixed(1) || '-',
          r.score?.toFixed(1) || '-', r.status,
        ]),
      });
      doc.save(`Hasil_${selectedExam.title}.pdf`);
    }
    toast.success('Diekspor');
  };

  const renderExamForm = () => (
    <Tabs defaultValue="basic" className="w-full">
      <TabsList className="grid grid-cols-3">
        <TabsTrigger value="basic">Dasar</TabsTrigger>
        <TabsTrigger value="schedule">Jadwal & Token</TabsTrigger>
        <TabsTrigger value="rules">Aturan</TabsTrigger>
      </TabsList>
      <div className="max-h-[60vh] overflow-y-auto pr-2 mt-3">
        <TabsContent value="basic" className="space-y-3 mt-0">
          <div><Label>Judul Ujian</Label><Input value={examForm.title} onChange={e => setExamForm(p => ({ ...p, title: e.target.value }))} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Mata Pelajaran</Label><Input value={examForm.subject} onChange={e => setExamForm(p => ({ ...p, subject: e.target.value }))} /></div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Kelas Sasaran</Label>
                <button type="button" className="text-xs text-primary hover:underline"
                  onClick={() => setExamForm(p => ({
                    ...p,
                    class_ids: p.class_ids.length === (classes?.length || 0) ? [] : (classes || []).map(c => c.id),
                  }))}>
                  {examForm.class_ids.length === (classes?.length || 0) && classes?.length ? 'Hapus semua' : 'Pilih semua'}
                </button>
              </div>
              <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1 bg-background mt-1">
                {(!classes || classes.length === 0) && <p className="text-xs text-muted-foreground">Tidak ada kelas.</p>}
                {classes?.map(c => {
                  const checked = examForm.class_ids.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded">
                      <input type="checkbox" checked={checked} onChange={() => {
                        setExamForm(p => ({
                          ...p,
                          class_ids: checked ? p.class_ids.filter(id => id !== c.id) : [...p.class_ids, c.id],
                        }));
                      }} />
                      <span>{c.grade} - {c.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{examForm.class_ids.length === 0 ? 'Kosong = semua kelas dapat mengakses.' : `${examForm.class_ids.length} kelas dipilih`}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Durasi (menit)</Label><Input type="number" value={examForm.duration_minutes} onChange={e => setExamForm(p => ({ ...p, duration_minutes: +e.target.value }))} /></div>
            <div><Label>Nilai KKM</Label><Input type="number" value={examForm.pass_score} onChange={e => setExamForm(p => ({ ...p, pass_score: +e.target.value }))} /></div>
            <div><Label>Jenis</Label>
              <Select value={examForm.exam_type} onValueChange={v => setExamForm(p => ({ ...p, exam_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Campuran</SelectItem>
                  <SelectItem value="multiple_choice">Pilihan Ganda</SelectItem>
                  <SelectItem value="essay">Essay</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Petunjuk Ujian</Label><Textarea rows={3} placeholder="Contoh: Bacalah soal dengan teliti..." value={examForm.instructions} onChange={e => setExamForm(p => ({ ...p, instructions: e.target.value }))} /></div>
        </TabsContent>
        <TabsContent value="schedule" className="space-y-3 mt-0">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Waktu Mulai</Label><Input type="datetime-local" value={examForm.start_datetime} onChange={e => setExamForm(p => ({ ...p, start_datetime: e.target.value }))} /></div>
            <div><Label>Waktu Selesai</Label><Input type="datetime-local" value={examForm.end_datetime} onChange={e => setExamForm(p => ({ ...p, end_datetime: e.target.value }))} /></div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div>
              <Label>Wajib Token Ujian</Label>
              <p className="text-xs text-muted-foreground">Siswa harus memasukkan token sebelum mulai</p>
            </div>
            <Switch checked={examForm.require_token} onCheckedChange={v => setExamForm(p => ({ ...p, require_token: v, exam_token: v && !p.exam_token ? generateToken() : p.exam_token }))} />
          </div>
          {examForm.require_token && (
            <div className="flex gap-2">
              <Input value={examForm.exam_token} onChange={e => setExamForm(p => ({ ...p, exam_token: e.target.value.toUpperCase() }))} placeholder="Token (6 karakter)" maxLength={12} />
              <Button type="button" variant="outline" onClick={() => setExamForm(p => ({ ...p, exam_token: generateToken() }))}><RefreshCcw className="h-4 w-4" /></Button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="rules" className="space-y-3 mt-0">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Maksimal Percobaan</Label><Input type="number" min={1} value={examForm.max_attempts} onChange={e => setExamForm(p => ({ ...p, max_attempts: +e.target.value }))} /></div>
            <div className="flex items-end">
              <div className="flex items-center justify-between w-full p-2 rounded border">
                <Label className="text-sm">Izinkan Lanjut Ujian</Label>
                <Switch checked={examForm.allow_resume} onCheckedChange={v => setExamForm(p => ({ ...p, allow_resume: v }))} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between p-2 rounded border"><Label>Aktifkan Ujian</Label><Switch checked={examForm.is_active} onCheckedChange={v => setExamForm(p => ({ ...p, is_active: v }))} /></div>
          <div className="flex items-center justify-between p-2 rounded border"><Label>Tampilkan Nilai ke Siswa</Label><Switch checked={examForm.show_result_to_student} onCheckedChange={v => setExamForm(p => ({ ...p, show_result_to_student: v }))} /></div>
          <div className="flex items-center justify-between p-2 rounded border"><Label>Acak Soal</Label><Switch checked={examForm.shuffle_questions} onCheckedChange={v => setExamForm(p => ({ ...p, shuffle_questions: v }))} /></div>
          <div className="flex items-center justify-between p-2 rounded border"><Label>Acak Pilihan Jawaban</Label><Switch checked={examForm.shuffle_options} onCheckedChange={v => setExamForm(p => ({ ...p, shuffle_options: v }))} /></div>

          <div className="rounded-lg border-2 border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-1.5 text-red-700 dark:text-red-300 font-semibold">
                  <span>🛡️ Mode Anti Curang</span>
                </Label>
                <p className="text-[11px] text-muted-foreground">Cegah siswa pindah tab/window. Pelanggaran tercatat otomatis.</p>
              </div>
              <Switch checked={examForm.anti_cheat_enabled} onCheckedChange={v => setExamForm(p => ({ ...p, anti_cheat_enabled: v, exit_token: v && !p.exit_token ? generateToken() : p.exit_token }))} />
            </div>
            {examForm.anti_cheat_enabled && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Token Keluar (untuk pengawas)</Label>
                  <div className="flex gap-1">
                    <Input value={examForm.exit_token} onChange={e => setExamForm(p => ({ ...p, exit_token: e.target.value.toUpperCase() }))} placeholder="Token keluar" className="font-mono" maxLength={12} />
                    <Button type="button" size="icon" variant="outline" onClick={() => setExamForm(p => ({ ...p, exit_token: generateToken() }))}><RefreshCcw className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Maksimal Pelanggaran</Label>
                  <Input type="number" min={1} value={examForm.max_violations} onChange={e => setExamForm(p => ({ ...p, max_violations: +e.target.value }))} />
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );

  // Grading dialog state
  const [gradeValues, setGradeValues] = useState<Record<string, { score: string; note: string }>>({});
  useEffect(() => {
    if (gradingAnswers) {
      const init: Record<string, { score: string; note: string }> = {};
      gradingAnswers.forEach((a: any) => {
        if (a.cbt_questions?.question_type === 'essay') {
          init[a.id] = { score: a.essay_score_given?.toString() || '', note: a.grader_note || '' };
        }
      });
      setGradeValues(init);
    }
  }, [gradingAnswers]);

  return (
    <ProtectedRoute allowedRoles={['teacher', 'admin']}>
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Ujian CBT</h1>
              <p className="text-muted-foreground">Kelola ujian online: PG, Essay, Token, Resume, Template</p>
            </div>
            <div className="flex gap-2">
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" onClick={() => setExamForm(initialExamForm)}><Plus className="h-4 w-4" /> Buat Ujian</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>Buat Ujian CBT Baru</DialogTitle></DialogHeader>
                  {renderExamForm()}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Batal</Button>
                    <Button onClick={() => createExamMutation.mutate(examForm)} disabled={!examForm.title || !examForm.subject || createExamMutation.isPending}>
                      {createExamMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari ujian..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="pl-10" />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Mapel</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Soal</TableHead>
                      <TableHead>Token</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedExams.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{isLoading ? 'Memuat...' : 'Belum ada ujian'}</TableCell></TableRow>
                    ) : paginatedExams.map((exam: any, idx: number) => (
                      <TableRow key={exam.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}</TableCell>
                        <TableCell className="font-medium">{exam.title}</TableCell>
                        <TableCell>{exam.subject}</TableCell>
                        <TableCell>{exam.classes ? `${exam.classes.grade}-${exam.classes.name}` : 'Semua'}</TableCell>
                        <TableCell>{exam.total_questions}</TableCell>
                        <TableCell>{exam.require_token ? <Badge variant="outline" className="font-mono text-xs">{exam.exam_token}</Badge> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                        <TableCell><Badge variant={exam.is_active ? 'default' : 'secondary'}>{exam.is_active ? 'Aktif' : 'Off'}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" title="Kelola Soal" onClick={() => { setSelectedExam(exam); setIsQuestionsOpen(true); }}><FileSpreadsheet className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Control Panel" onClick={() => { setSelectedExam(exam); setIsControlOpen(true); }}><Activity className="h-4 w-4 text-blue-600" /></Button>
                            <Button variant="ghost" size="icon" title="Hasil" onClick={() => { setSelectedExam(exam); setIsResultsOpen(true); }}><Users className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Analisis Jawaban" onClick={() => { setSelectedExam(exam); setIsAnalysisOpen(true); }}><BarChart3 className="h-4 w-4 text-purple-600" /></Button>
                            <Button variant="ghost" size="icon" title="Edit" onClick={() => handleEditExam(exam)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Hapus" onClick={() => { if (confirm('Hapus ujian ini?')) deleteExamMutation.mutate(exam.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">Hal {currentPage} dari {totalPages}</p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem><PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                      <PaginationItem><PaginationNext onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit Exam */}
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Edit Ujian</DialogTitle></DialogHeader>
              {renderExamForm()}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>Batal</Button>
                <Button onClick={() => updateExamMutation.mutate({ id: selectedExam?.id, data: examForm })} disabled={updateExamMutation.isPending}>
                  {updateExamMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Questions Dialog */}
          <Dialog open={isQuestionsOpen} onOpenChange={setIsQuestionsOpen}>
            <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Soal: {selectedExam?.title}</DialogTitle>
                <DialogDescription>Total: {questions?.length || 0} soal</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-2 mb-3">
                <Button size="sm" variant="outline" onClick={() => setIsImportOpen(true)}><FileSpreadsheet className="h-4 w-4 mr-1" /> Import Excel</Button>
                <Button size="sm" variant="outline" onClick={downloadTemplate}><Download className="h-4 w-4 mr-1" /> Template Excel</Button>
                <Button size="sm" variant="outline" onClick={() => setIsTemplatesOpen(true)}><Library className="h-4 w-4 mr-1" /> Bank Soal</Button>
              </div>

              <Card className="mb-4">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">{editingQuestion ? `Edit Soal #${editingQuestion.question_number}` : 'Tambah Soal Baru'}</CardTitle>
                  <Select value={questionForm.question_type} onValueChange={v => setQuestionForm(p => ({ ...p, question_type: v }))}>
                    <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Pilihan Ganda</SelectItem>
                      <SelectItem value="essay">Essay</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Pertanyaan</Label>
                    <RichTextEditor value={questionForm.question_text} onChange={v => setQuestionForm(p => ({ ...p, question_text: v }))} minHeight="100px" />
                  </div>
                  {questionForm.question_type === 'multiple_choice' ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        {(['a', 'b', 'c', 'd'] as const).map(opt => (
                          <div key={opt}>
                            <Label className="uppercase">{opt}</Label>
                            <Input value={(questionForm as any)[`option_${opt}`]} onChange={e => setQuestionForm(p => ({ ...p, [`option_${opt}`]: e.target.value }))} />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div><Label>E (opsional)</Label><Input value={questionForm.option_e} onChange={e => setQuestionForm(p => ({ ...p, option_e: e.target.value }))} /></div>
                        <div><Label>Kunci</Label>
                          <Select value={questionForm.correct_answer} onValueChange={v => setQuestionForm(p => ({ ...p, correct_answer: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{'ABCDE'.split('').map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div><Label>Poin</Label><Input type="number" value={questionForm.points} onChange={e => setQuestionForm(p => ({ ...p, points: +e.target.value }))} /></div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label>Kunci Jawaban Essay (referensi koreksi)</Label>
                        <RichTextEditor value={questionForm.essay_answer_key} onChange={v => setQuestionForm(p => ({ ...p, essay_answer_key: v }))} minHeight="80px" />
                      </div>
                      <div className="w-32"><Label>Poin Maks</Label><Input type="number" value={questionForm.points} onChange={e => setQuestionForm(p => ({ ...p, points: +e.target.value }))} /></div>
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={() => {
                      if (editingQuestion) updateQuestionMutation.mutate({ id: editingQuestion.id, data: questionForm });
                      else addQuestionMutation.mutate(questionForm);
                    }} disabled={!questionForm.question_text}>
                      {editingQuestion ? 'Simpan Perubahan' : 'Tambah Soal'}
                    </Button>
                    {editingQuestion && <Button variant="ghost" onClick={() => { setEditingQuestion(null); setQuestionForm(initialQuestionForm); }}>Batal</Button>}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {questions?.map((q: any) => (
                  <Card key={q.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">Soal #{q.question_number}</span>
                          <Badge variant={q.question_type === 'essay' ? 'secondary' : 'outline'} className="text-xs">{q.question_type === 'essay' ? 'Essay' : 'PG'}</Badge>
                          <Badge variant="outline" className="text-xs">{q.points} poin</Badge>
                        </div>
                        <RichTextDisplay html={q.question_text} className="text-sm" />
                        {q.question_type === 'multiple_choice' && (
                          <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
                            {['A', 'B', 'C', 'D', 'E'].map(opt => {
                              const val = q[`option_${opt.toLowerCase()}`];
                              if (!val) return null;
                              return (
                                <span key={opt} className={`px-2 py-1 rounded ${q.correct_answer === opt ? 'bg-primary/10 text-primary font-medium' : 'bg-muted'}`}>
                                  {opt}. {val}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {q.question_type === 'essay' && q.essay_answer_key && (
                          <div className="mt-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 text-xs">
                            <p className="font-medium mb-1">Kunci:</p>
                            <RichTextDisplay html={q.essay_answer_key} />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditingQuestion(q);
                          setQuestionForm({
                            question_text: q.question_text || '',
                            option_a: q.option_a || '', option_b: q.option_b || '', option_c: q.option_c || '',
                            option_d: q.option_d || '', option_e: q.option_e || '',
                            correct_answer: q.correct_answer || 'A', points: q.points || 1,
                            question_type: q.question_type || 'multiple_choice',
                            essay_answer_key: q.essay_answer_key || '',
                          });
                        }}><Edit className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm('Hapus?')) deleteQuestionMutation.mutate(q.id); }}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          {/* Import */}
          <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Import Soal dari Excel</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">Kolom: Soal, Tipe (multiple_choice/essay), A-E, Kunci, KunciEssay, Poin</p>
              <Button size="sm" variant="outline" onClick={downloadTemplate}><Download className="h-4 w-4 mr-1" /> Download Template</Button>
              <Input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} />
            </DialogContent>
          </Dialog>

          {/* Templates / Bank Soal */}
          <Dialog open={isTemplatesOpen} onOpenChange={setIsTemplatesOpen}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Bank Soal / Template</DialogTitle>
                <DialogDescription>Simpan & gunakan ulang soal lintas ujian</DialogDescription>
              </DialogHeader>
              <Card className="mb-3">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BookmarkPlus className="h-4 w-4" /> Simpan Soal Saat Ini Sebagai Template</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Judul template" value={templateForm.title} onChange={e => setTemplateForm(p => ({ ...p, title: e.target.value }))} />
                    <Input placeholder="Mata pelajaran" value={templateForm.subject} onChange={e => setTemplateForm(p => ({ ...p, subject: e.target.value }))} />
                  </div>
                  <Textarea placeholder="Deskripsi (opsional)" value={templateForm.description} onChange={e => setTemplateForm(p => ({ ...p, description: e.target.value }))} />
                  <Button size="sm" onClick={() => saveAsTemplateMutation.mutate(templateForm)} disabled={!questions?.length}>Simpan ({questions?.length || 0} soal)</Button>
                </CardContent>
              </Card>
              <div className="space-y-2">
                {templates?.length === 0 ? <p className="text-sm text-center text-muted-foreground py-4">Belum ada template</p> :
                  templates?.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.subject} • {(t.questions || []).length} soal</p>
                        {t.description && <p className="text-xs mt-1">{t.description}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => applyTemplateMutation.mutate(t)} disabled={!selectedExam}>Gunakan</Button>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm('Hapus template?')) deleteTemplateMutation.mutate(t.id); }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
              </div>
            </DialogContent>
          </Dialog>

          {/* Control Panel - Live Monitoring (Modern) */}
          <Dialog open={isControlOpen} onOpenChange={setIsControlOpen}>
            <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-600 animate-pulse" />
                  Live Monitor: {selectedExam?.title}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 text-xs">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Auto-refresh setiap 5 detik
                  {selectedExam?.duration_minutes && <span>• Durasi: {selectedExam.duration_minutes} menit</span>}
                  {selectedExam?.exam_token && <span className="font-mono">• Token: {selectedExam.exam_token}</span>}
                </DialogDescription>
              </DialogHeader>

              {/* Stats */}
              {(() => {
                const inProg = (examResults || []).filter((r: any) => r.status === 'in_progress');
                const paused = (examResults || []).filter((r: any) => r.status === 'paused');
                const done = (examResults || []).filter((r: any) => r.status === 'completed');
                const totalQ = selectedExam?.total_questions || 0;
                const avgProgress = inProg.length && totalQ ? Math.round(inProg.reduce((s: number, r: any) => s + Math.min(100, ((answerCounts?.[r.id] || 0) / totalQ) * 100), 0) / inProg.length) : 0;
                return (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Sedang Ujian</p><p className="text-2xl font-bold text-blue-600">{inProg.length}</p></CardContent></Card>
                    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Dijeda</p><p className="text-2xl font-bold text-amber-600">{paused.length}</p></CardContent></Card>
                    <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Selesai</p><p className="text-2xl font-bold text-emerald-600">{done.length}</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Sesi</p><p className="text-2xl font-bold">{examResults?.length || 0}</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Rata-rata Progres</p><p className="text-2xl font-bold">{avgProgress}%</p></CardContent></Card>
                  </div>
                );
              })()}

              {/* Bulk actions */}
              <div className="flex flex-wrap gap-2 mb-3">
                <Button size="sm" variant="outline" onClick={() => {
                  const inProg = (examResults || []).filter((r: any) => r.status === 'in_progress');
                  if (!inProg.length) return toast.info('Tidak ada sesi aktif');
                  if (confirm(`Jeda ${inProg.length} sesi yang sedang berjalan?`)) {
                    inProg.forEach((r: any) => sessionActionMutation.mutate({ id: r.id, action: 'pause' }));
                  }
                }}><Pause className="h-3 w-3 mr-1" /> Jeda Semua</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const paused = (examResults || []).filter((r: any) => r.status === 'paused');
                  if (!paused.length) return toast.info('Tidak ada sesi dijeda');
                  if (confirm(`Lanjutkan ${paused.length} sesi yang dijeda?`)) {
                    paused.forEach((r: any) => sessionActionMutation.mutate({ id: r.id, action: 'resume' }));
                  }
                }}><Play className="h-3 w-3 mr-1" /> Resume Semua</Button>
                <Button size="sm" variant="destructive" onClick={() => {
                  const active = (examResults || []).filter((r: any) => r.status !== 'completed');
                  if (!active.length) return toast.info('Tidak ada sesi aktif');
                  if (confirm(`Akhiri PAKSA ${active.length} sesi? Tindakan tidak bisa dibatalkan.`)) {
                    active.forEach((r: any) => sessionActionMutation.mutate({ id: r.id, action: 'finalize' }));
                  }
                }}><Power className="h-3 w-3 mr-1" /> Akhiri Semua</Button>
                <Button size="sm" variant="ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ['cbt-results'] })}>
                  <RefreshCcw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>

              {/* Modern card grid */}
              {(!examResults || examResults.length === 0) ? (
                <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/20">
                  <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>Belum ada peserta yang memulai ujian</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {examResults.map((r: any) => {
                    const totalQ = selectedExam?.total_questions || 0;
                    const answered = answerCounts?.[r.id] || 0;
                    const progress = totalQ > 0 ? Math.min(100, Math.round((answered / totalQ) * 100)) : 0;
                    const remainingMin = r.time_remaining_seconds ? Math.floor(r.time_remaining_seconds / 60) : 0;
                    const remainingSec = r.time_remaining_seconds ? r.time_remaining_seconds % 60 : 0;
                    const lastAct = r.last_activity_at ? new Date(r.last_activity_at) : null;
                    const lastActMin = lastAct ? Math.floor((Date.now() - lastAct.getTime()) / 60000) : null;
                    const isStale = lastActMin !== null && lastActMin > 2 && r.status === 'in_progress';
                    const statusColor = r.status === 'in_progress' ? 'border-blue-300 bg-blue-50/40 dark:bg-blue-950/20'
                      : r.status === 'paused' ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20'
                      : r.status === 'completed' ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-border';
                    const cls = (r.students?.classes as any);
                    return (
                      <Card key={r.id} className={`${statusColor} transition-shadow hover:shadow-md`}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{(r.students as any)?.full_name || 'Tanpa nama'}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {(r.students as any)?.nis || '-'} {cls && `• ${cls.grade} ${cls.name}`}
                              </p>
                            </div>
                            <Badge variant={r.status === 'completed' ? 'default' : r.status === 'paused' ? 'secondary' : 'outline'} className="text-[10px]">
                              {r.status === 'in_progress' ? 'Mengerjakan' : r.status === 'paused' ? 'Dijeda' : r.status === 'completed' ? 'Selesai' : r.status}
                            </Badge>
                          </div>

                          {r.status !== 'completed' && (
                            <>
                              <div>
                                <div className="flex justify-between text-[11px] mb-0.5">
                                  <span className="text-muted-foreground">Progres</span>
                                  <span className="font-medium">{answered}/{totalQ} ({progress}%)</span>
                                </div>
                                <Progress value={progress} className="h-1.5" />
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-3 w-3" /> Sisa: <span className="font-mono font-medium">{String(remainingMin).padStart(2, '0')}:{String(remainingSec).padStart(2, '0')}</span>
                                </span>
                                {lastAct && (
                                  <span className={isStale ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                                    {isStale && '⚠ '}{lastActMin === 0 ? 'baru saja' : `${lastActMin}m lalu`}
                                  </span>
                                )}
                              </div>
                            </>
                          )}

                          {r.status === 'completed' && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Skor</span>
                              <span className={`font-bold text-lg ${r.score >= (selectedExam?.pass_score || 70) ? 'text-emerald-600' : 'text-destructive'}`}>{r.score?.toFixed(1) || '-'}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 border-t">
                            <span className="text-[10px] text-muted-foreground">Percobaan #{r.attempt_number || 1}</span>
                            <div className="flex gap-1">
                              {r.status === 'in_progress' && <Button size="icon" variant="ghost" className="h-7 w-7" title="Jeda" onClick={() => sessionActionMutation.mutate({ id: r.id, action: 'pause' })}><Pause className="h-3 w-3" /></Button>}
                              {r.status === 'paused' && <Button size="icon" variant="ghost" className="h-7 w-7" title="Resume" onClick={() => sessionActionMutation.mutate({ id: r.id, action: 'resume' })}><Play className="h-3 w-3" /></Button>}
                              {r.status !== 'completed' && <Button size="icon" variant="ghost" className="h-7 w-7" title="Akhiri" onClick={() => { if (confirm('Akhiri ujian siswa ini?')) sessionActionMutation.mutate({ id: r.id, action: 'finalize' }); }}><Power className="h-3 w-3" /></Button>}
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Reset" onClick={() => { if (confirm('Reset sesi ini? Semua jawaban akan dihapus.')) sessionActionMutation.mutate({ id: r.id, action: 'reset' }); }}><RefreshCcw className="h-3 w-3 text-destructive" /></Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Results */}
          <Dialog open={isResultsOpen} onOpenChange={setIsResultsOpen}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Hasil: {selectedExam?.title}</DialogTitle></DialogHeader>
              <div className="flex gap-2 mb-4">
                <Button size="sm" variant="outline" onClick={() => handleExportResults('excel')}><Download className="h-4 w-4 mr-1" /> Excel</Button>
                <Button size="sm" variant="outline" onClick={() => handleExportResults('pdf')}><Printer className="h-4 w-4 mr-1" /> PDF</Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead><TableHead>Nama</TableHead><TableHead>NIS</TableHead>
                    <TableHead>PG</TableHead><TableHead>Essay</TableHead><TableHead>Total</TableHead>
                    <TableHead>Status</TableHead><TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!examResults || examResults.length === 0) ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Belum ada siswa mengerjakan</TableCell></TableRow>
                  ) : examResults.map((r: any, i: number) => (
                    <TableRow key={r.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{(r.students as any)?.full_name}</TableCell>
                      <TableCell>{(r.students as any)?.nis}</TableCell>
                      <TableCell>{r.pg_score?.toFixed(1) || r.correct_count}</TableCell>
                      <TableCell>
                        {r.essay_score?.toFixed(1) || '0'}
                        {r.grading_status !== 'fully_graded' && <Badge variant="outline" className="ml-1 text-xs">Perlu Koreksi</Badge>}
                      </TableCell>
                      <TableCell><Badge variant={r.score >= (selectedExam?.pass_score || 70) ? 'default' : 'destructive'}>{r.score?.toFixed(1) || '-'}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => { setSelectedSession(r); setIsGradingOpen(true); }}>Koreksi</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DialogContent>
          </Dialog>

          {/* Essay Grading Dialog */}
          <Dialog open={isGradingOpen} onOpenChange={setIsGradingOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Koreksi Jawaban: {(selectedSession?.students as any)?.full_name}</DialogTitle>
                <DialogDescription>Beri nilai pada soal essay; nilai PG terkoreksi otomatis</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {gradingAnswers?.map((a: any) => {
                  const q = a.cbt_questions;
                  const isEssay = q?.question_type === 'essay';
                  return (
                    <Card key={a.id} className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={isEssay ? 'secondary' : 'outline'}>{isEssay ? 'Essay' : 'PG'}</Badge>
                        <Badge variant="outline">{q?.points} poin</Badge>
                        {!isEssay && <Badge variant={a.is_correct ? 'default' : 'destructive'}>{a.is_correct ? 'Benar' : 'Salah'}</Badge>}
                      </div>
                      <RichTextDisplay html={q?.question_text || ''} className="text-sm mb-2" />
                      <div className="bg-muted/30 p-2 rounded text-sm">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Jawaban Siswa:</p>
                        {isEssay ? <p className="whitespace-pre-wrap">{a.essay_answer || <em className="text-muted-foreground">Tidak menjawab</em>}</p>
                         : <p>{a.selected_answer || '-'}</p>}
                      </div>
                      {isEssay && q?.essay_answer_key && (
                        <div className="bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded mt-2 text-sm">
                          <p className="text-xs font-medium mb-1">Kunci:</p>
                          <RichTextDisplay html={q.essay_answer_key} />
                        </div>
                      )}
                      {isEssay && (
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <div>
                            <Label className="text-xs">Nilai (0-{q?.points})</Label>
                            <Input type="number" min={0} max={q?.points} step={0.5}
                              value={gradeValues[a.id]?.score || ''}
                              onChange={e => setGradeValues(p => ({ ...p, [a.id]: { ...p[a.id], score: e.target.value } }))} />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs">Catatan (opsional)</Label>
                            <Input value={gradeValues[a.id]?.note || ''}
                              onChange={e => setGradeValues(p => ({ ...p, [a.id]: { ...p[a.id], note: e.target.value } }))} />
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsGradingOpen(false)}>Tutup</Button>
                <Button onClick={() => {
                  const grades = Object.entries(gradeValues).map(([id, v]) => ({
                    id, essay_score_given: Number(v.score) || 0, grader_note: v.note || '',
                  }));
                  saveGradingMutation.mutate(grades);
                }} disabled={saveGradingMutation.isPending}>Simpan Penilaian</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Answer Analysis Dialog */}
          <Dialog open={isAnalysisOpen} onOpenChange={setIsAnalysisOpen}>
            <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-purple-600" /> Analisis Jawaban: {selectedExam?.title}</DialogTitle>
                <DialogDescription>Statistik per soal, distribusi nilai, dan pelanggaran</DialogDescription>
              </DialogHeader>
              {!analysisData ? <p className="text-center py-12 text-muted-foreground">Memuat...</p> : (() => {
                const { sessions, answers, questions, violations } = analysisData;
                if (!sessions.length) return <p className="text-center py-12 text-muted-foreground">Belum ada peserta selesai</p>;

                // Per-question statistics
                const perQuestion = questions.map((q: any) => {
                  const qAns = answers.filter((a: any) => a.question_id === q.id);
                  const total = qAns.length;
                  if (q.question_type === 'essay') {
                    const graded = qAns.filter((a: any) => a.essay_score_given != null);
                    const avg = graded.length ? graded.reduce((s: number, a: any) => s + (a.essay_score_given || 0), 0) / graded.length : 0;
                    return { q, total, type: 'essay', graded: graded.length, avg, correctPct: 0, distribution: {} };
                  }
                  const correct = qAns.filter((a: any) => a.is_correct).length;
                  const correctPct = total ? Math.round((correct / total) * 100) : 0;
                  const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, '-': 0 };
                  qAns.forEach((a: any) => { const k = a.selected_answer || '-'; dist[k] = (dist[k] || 0) + 1; });
                  return { q, total, type: 'pg', correct, correctPct, distribution: dist };
                });

                // Score distribution buckets
                const buckets = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
                sessions.forEach((s: any) => {
                  const sc = s.score || 0;
                  const idx = Math.min(4, Math.floor(sc / 20));
                  buckets[idx]++;
                });
                const bucketLabels = ['0-20', '21-40', '41-60', '61-80', '81-100'];
                const maxBucket = Math.max(...buckets, 1);
                const passScore = selectedExam?.pass_score || 70;
                const passed = sessions.filter((s: any) => (s.score || 0) >= passScore).length;
                const failed = sessions.length - passed;
                const avgScore = sessions.reduce((s: number, x: any) => s + (x.score || 0), 0) / sessions.length;
                const minScore = Math.min(...sessions.map((s: any) => s.score || 0));
                const maxScore = Math.max(...sessions.map((s: any) => s.score || 0));

                const exportExcel = () => {
                  const wb = XLSX.utils.book_new();
                  // Sheet 1: Summary
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
                    { Metrik: 'Total Peserta', Nilai: sessions.length },
                    { Metrik: 'Lulus', Nilai: passed }, { Metrik: 'Tidak Lulus', Nilai: failed },
                    { Metrik: 'Rata-rata', Nilai: avgScore.toFixed(2) },
                    { Metrik: 'Tertinggi', Nilai: maxScore.toFixed(2) },
                    { Metrik: 'Terendah', Nilai: minScore.toFixed(2) },
                    { Metrik: 'Total Pelanggaran', Nilai: violations.length },
                  ]), 'Ringkasan');
                  // Sheet 2: Per-question
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(perQuestion.map((p: any, i: number) => ({
                    No: i + 1, Tipe: p.type === 'essay' ? 'Essay' : 'PG',
                    Soal: (p.q.question_text || '').replace(/<[^>]+>/g, '').slice(0, 100),
                    Total: p.total, Benar: p.type === 'pg' ? p.correct : '-',
                    'Persen Benar': p.type === 'pg' ? `${p.correctPct}%` : '-',
                    'Rata-rata Essay': p.type === 'essay' ? p.avg.toFixed(2) : '-',
                  }))), 'Per Soal');
                  // Sheet 3: Per-student
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessions.map((s: any, i: number) => ({
                    No: i + 1, Nama: s.students?.full_name || '-', NIS: s.students?.nis || '-',
                    Kelas: s.students?.classes ? `${s.students.classes.grade}-${s.students.classes.name}` : '-',
                    Skor: s.score?.toFixed(2) || '-', PG: s.pg_score?.toFixed(2) || '-',
                    Essay: s.essay_score?.toFixed(2) || '-', Status: (s.score || 0) >= passScore ? 'Lulus' : 'Tidak Lulus',
                    Pelanggaran: violations.filter((v: any) => v.session_id === s.id).length,
                  }))), 'Per Siswa');
                  XLSX.writeFile(wb, `Analisis_${selectedExam.title}.xlsx`);
                  toast.success('Excel diunduh');
                };

                const exportPdf = () => {
                  const doc = new jsPDF();
                  doc.setFontSize(14);
                  doc.text(`Analisis Ujian: ${selectedExam.title}`, 14, 18);
                  doc.setFontSize(10);
                  doc.text(`Mata Pelajaran: ${selectedExam.subject}`, 14, 25);
                  doc.text(`Total Peserta: ${sessions.length} | Lulus: ${passed} | Rata-rata: ${avgScore.toFixed(1)}`, 14, 31);
                  (doc as any).autoTable({
                    startY: 38, head: [['No', 'Tipe', 'Soal', 'Benar', '% Benar']],
                    body: perQuestion.map((p: any, i: number) => [
                      i + 1, p.type === 'essay' ? 'Essay' : 'PG',
                      (p.q.question_text || '').replace(/<[^>]+>/g, '').slice(0, 60),
                      p.type === 'pg' ? `${p.correct}/${p.total}` : `${p.graded}/${p.total}`,
                      p.type === 'pg' ? `${p.correctPct}%` : `${p.avg.toFixed(1)}`,
                    ]),
                    styles: { fontSize: 8 },
                  });
                  doc.addPage();
                  doc.setFontSize(12); doc.text('Hasil Per Siswa', 14, 18);
                  (doc as any).autoTable({
                    startY: 25, head: [['No', 'Nama', 'NIS', 'Skor', 'Status', 'Pelanggaran']],
                    body: sessions.map((s: any, i: number) => [
                      i + 1, s.students?.full_name || '-', s.students?.nis || '-',
                      s.score?.toFixed(1) || '-', (s.score || 0) >= passScore ? 'Lulus' : 'Gagal',
                      violations.filter((v: any) => v.session_id === s.id).length,
                    ]),
                    styles: { fontSize: 8 },
                  });
                  doc.save(`Analisis_${selectedExam.title}.pdf`);
                  toast.success('PDF diunduh');
                };

                return (
                  <div className="space-y-4">
                    {/* Export buttons */}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={exportExcel}><Download className="h-4 w-4 mr-1" /> Excel</Button>
                      <Button size="sm" variant="outline" onClick={exportPdf}><Printer className="h-4 w-4 mr-1" /> PDF</Button>
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/20 border-blue-200"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase">Peserta</p><p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{sessions.length}</p></CardContent></Card>
                      <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/40 dark:to-emerald-900/20 border-emerald-200"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase">Lulus</p><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{passed}</p></CardContent></Card>
                      <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/40 dark:to-red-900/20 border-red-200"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase">Tidak Lulus</p><p className="text-2xl font-bold text-red-700 dark:text-red-300">{failed}</p></CardContent></Card>
                      <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/40 dark:to-purple-900/20 border-purple-200"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase">Rata-rata</p><p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{avgScore.toFixed(1)}</p></CardContent></Card>
                      <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase">Tertinggi</p><p className="text-2xl font-bold text-emerald-600">{maxScore.toFixed(1)}</p></CardContent></Card>
                      <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase">Terendah</p><p className="text-2xl font-bold text-destructive">{minScore.toFixed(1)}</p></CardContent></Card>
                    </div>

                    {/* Score distribution bar chart (CSS) */}
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Distribusi Nilai</CardTitle></CardHeader>
                      <CardContent>
                        <div className="space-y-1.5">
                          {bucketLabels.map((label, i) => (
                            <div key={label} className="flex items-center gap-2">
                              <span className="text-xs w-12 text-muted-foreground">{label}</span>
                              <div className="flex-1 bg-muted rounded h-6 overflow-hidden">
                                <div className={`h-full flex items-center justify-end px-2 text-xs text-white font-medium ${i >= 3 ? 'bg-emerald-500' : i === 2 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${(buckets[i] / maxBucket) * 100}%`, minWidth: buckets[i] > 0 ? '2rem' : 0 }}>
                                  {buckets[i] > 0 && buckets[i]}
                                </div>
                              </div>
                              <span className="text-xs w-10 text-right tabular-nums">{buckets[i]} siswa</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Per-question analysis */}
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Analisis Per Soal</CardTitle></CardHeader>
                      <CardContent className="space-y-2">
                        {perQuestion.map((p: any, i: number) => (
                          <div key={p.q.id} className="border rounded-lg p-2.5 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="font-bold text-xs">#{i + 1}</span>
                                  <Badge variant={p.type === 'essay' ? 'secondary' : 'outline'} className="text-[10px]">{p.type === 'essay' ? 'Essay' : 'PG'}</Badge>
                                  {p.type === 'pg' && (
                                    <Badge variant={p.correctPct >= 70 ? 'default' : p.correctPct >= 40 ? 'secondary' : 'destructive'} className="text-[10px]">
                                      {p.correctPct}% benar
                                    </Badge>
                                  )}
                                </div>
                                <RichTextDisplay html={p.q.question_text} className="text-xs" />
                              </div>
                            </div>
                            {p.type === 'pg' && (
                              <div className="grid grid-cols-6 gap-1 text-[10px]">
                                {Object.entries(p.distribution).map(([opt, cnt]: any) => {
                                  const isCorrect = opt === p.q.correct_answer;
                                  const pct = p.total ? Math.round((cnt / p.total) * 100) : 0;
                                  return (
                                    <div key={opt} className={`p-1.5 rounded text-center ${isCorrect ? 'bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300' : 'bg-muted'}`}>
                                      <div className={`font-bold ${isCorrect ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{opt}</div>
                                      <div className="tabular-nums">{cnt} ({pct}%)</div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {p.type === 'essay' && (
                              <div className="text-xs text-muted-foreground">Sudah dikoreksi: {p.graded}/{p.total} • Rata-rata nilai: <strong>{p.avg.toFixed(2)}</strong> / {p.q.points}</div>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    {/* Violations */}
                    {violations.length > 0 && (
                      <Card className="border-red-200 dark:border-red-900">
                        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5 text-red-700 dark:text-red-300"><ShieldAlert className="h-4 w-4" /> Pelanggaran ({violations.length})</CardTitle></CardHeader>
                        <CardContent>
                          <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                            {violations.slice(0, 50).map((v: any) => {
                              const sess = sessions.find((s: any) => s.id === v.session_id);
                              return (
                                <div key={v.id} className="flex items-center justify-between py-1 border-b last:border-0">
                                  <span>{sess?.students?.full_name || 'Tidak diketahui'}</span>
                                  <span className="flex items-center gap-2">
                                    <Badge variant="destructive" className="text-[10px]">{v.violation_type}</Badge>
                                    <span className="text-muted-foreground">{format(new Date(v.created_at), 'dd/MM HH:mm')}</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                );
              })()}
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
