import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, CheckCircle, FileText, Play, KeyRound, RotateCcw, AlertTriangle, Shield, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { RichTextDisplay } from '@/components/cbt/RichTextEditor';

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export default function CbtStudentExam() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeSession, setActiveSession] = useState<any>(null);
  const [activeExam, setActiveExam] = useState<any>(null);
  const [orderedQuestions, setOrderedQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [essayAnswers, setEssayAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [tokenInputOpen, setTokenInputOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [pendingExam, setPendingExam] = useState<any>(null);
  const [violations, setViolations] = useState(0);
  const [exitTokenOpen, setExitTokenOpen] = useState(false);
  const [exitTokenInput, setExitTokenInput] = useState('');
  const [warningOpen, setWarningOpen] = useState<string | null>(null);
  const lastSaveRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const examRef = useRef<any>(null);

  useEffect(() => { sessionRef.current = activeSession; examRef.current = activeExam; }, [activeSession, activeExam]);

  const { data: studentAccount } = useQuery({
    queryKey: ['student-account-cbt', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('student_accounts').select('student_id, students(class_id)').eq('user_id', user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: availableExams } = useQuery({
    queryKey: ['cbt-available-exams', studentAccount?.students?.class_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('cbt_exams').select('*').eq('is_active', true);
      if (error) throw error;
      const myClass = studentAccount?.students?.class_id || null;
      return (data || []).filter((e: any) => {
        if (e.start_datetime && new Date(e.start_datetime) > new Date()) return false;
        if (e.end_datetime && new Date(e.end_datetime) < new Date()) return false;
        const cIds: string[] = Array.isArray(e.class_ids) ? e.class_ids : [];
        if (cIds.length === 0 && !e.class_id) return true;
        if (myClass && cIds.includes(myClass)) return true;
        if (myClass && e.class_id === myClass) return true;
        return false;
      });
    },
    enabled: !!studentAccount,
  });

  const { data: existingSessions } = useQuery({
    queryKey: ['cbt-sessions', studentAccount?.student_id],
    queryFn: async () => {
      const { data } = await supabase.from('cbt_exam_sessions').select('*').eq('student_id', studentAccount!.student_id).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!studentAccount?.student_id,
  });

  // Load questions + saved answers
  useEffect(() => {
    if (!activeExam) return;
    (async () => {
      const { data } = await supabase.from('cbt_questions').select('*').eq('exam_id', activeExam.id).order('question_number');
      let qs = data || [];
      if (activeExam.shuffle_questions) qs = shuffle(qs);
      setOrderedQuestions(qs);
      if (activeSession?.id) {
        const { data: existAns } = await supabase.from('cbt_student_answers').select('*').eq('session_id', activeSession.id);
        const ansMap: Record<string, string> = {};
        const essayMap: Record<string, string> = {};
        (existAns || []).forEach((a: any) => {
          if (a.selected_answer) ansMap[a.question_id] = a.selected_answer;
          if (a.essay_answer) essayMap[a.question_id] = a.essay_answer;
        });
        setAnswers(ansMap);
        setEssayAnswers(essayMap);
      }
    })();
  }, [activeExam, activeSession?.id]);

  // Timer + persist
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'in_progress' || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(prev => {
      const n = prev - 1;
      if (n > 0 && n % 15 === 0) {
        supabase.from('cbt_exam_sessions').update({
          time_remaining_seconds: n, last_activity_at: new Date().toISOString(),
        }).eq('id', activeSession.id).then(() => {});
      }
      if (n <= 0) { clearInterval(t); handleSubmitExam(); return 0; }
      return n;
    }), 1000);
    return () => clearInterval(t);
  }, [activeSession?.id, activeSession?.status]);

  // Autosave
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'in_progress') return;
    const intv = setInterval(() => saveAnswersDraft(), 10000);
    return () => clearInterval(intv);
  }, [activeSession?.id, answers, essayAnswers]);

  // ANTI-CHEAT: detect tab/window blur, fullscreen exit
  useEffect(() => {
    if (!activeExam?.anti_cheat_enabled || !activeSession || activeSession.status !== 'in_progress') return;

    const logViolation = async (type: string, detail?: string) => {
      try {
        await supabase.from('cbt_session_violations').insert({
          session_id: activeSession.id, exam_id: activeExam.id,
          student_id: activeSession.student_id, violation_type: type, detail: detail || null,
        });
      } catch {}
      setViolations(v => {
        const nv = v + 1;
        const max = activeExam.max_violations || 3;
        if (nv >= max) {
          setWarningOpen(`Anda telah ${nv} kali melakukan pelanggaran. Ujian akan diakhiri otomatis.`);
          setTimeout(() => handleSubmitExam(), 2000);
        } else {
          setWarningOpen(`⚠ Pelanggaran terdeteksi (${type}). ${nv}/${max} kesempatan.`);
        }
        return nv;
      });
    };

    const onVis = () => { if (document.hidden) logViolation('tab_switch', 'Pindah tab/window'); };
    const onBlur = () => logViolation('blur', 'Window kehilangan fokus');
    const onFsChange = () => { if (!document.fullscreenElement) logViolation('fullscreen_exit', 'Keluar dari fullscreen'); };
    const onCtxMenu = (e: MouseEvent) => e.preventDefault();
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); logViolation('copy', 'Mencoba copy'); };
    const onKey = (e: KeyboardEvent) => {
      // Block common shortcuts
      if ((e.ctrlKey || e.metaKey) && ['c','x','p','s','u'].includes(e.key.toLowerCase())) { e.preventDefault(); }
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key))) e.preventDefault();
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('contextmenu', onCtxMenu);
    document.addEventListener('copy', onCopy);
    document.addEventListener('keydown', onKey);

    // Try enter fullscreen
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('contextmenu', onCtxMenu);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('keydown', onKey);
    };
  }, [activeExam?.anti_cheat_enabled, activeSession?.id, activeSession?.status]);

  const saveAnswersDraft = async () => {
    if (!activeSession || !orderedQuestions.length) return;
    if (Date.now() - lastSaveRef.current < 5000) return;
    lastSaveRef.current = Date.now();
    const upserts = orderedQuestions.map((q: any) => ({
      session_id: activeSession.id, question_id: q.id,
      selected_answer: q.question_type === 'essay' ? null : (answers[q.id] || null),
      essay_answer: q.question_type === 'essay' ? (essayAnswers[q.id] || null) : null,
      is_correct: q.question_type === 'essay' ? null : (answers[q.id] === q.correct_answer),
    })).filter(u => u.selected_answer || u.essay_answer);
    for (const u of upserts) await supabase.from('cbt_student_answers').upsert(u, { onConflict: 'session_id,question_id' });
  };

  const startOrResumeExam = useMutation({
    mutationFn: async ({ exam, resume }: { exam: any; resume?: any }) => {
      if (resume) return { session: resume, exam };
      if (exam.require_token) {
        if (!tokenInput) throw new Error('Token diperlukan');
        if (tokenInput.trim().toUpperCase() !== (exam.exam_token || '').toUpperCase()) throw new Error('Token salah');
      }
      const myAttempts = (existingSessions || []).filter((s: any) => s.exam_id === exam.id).length;
      if (myAttempts >= (exam.max_attempts || 1)) throw new Error('Anda sudah mencapai batas percobaan');

      // Pick next attempt number that doesn't collide (defensive against race)
      const usedAttempts = new Set((existingSessions || []).filter((s: any) => s.exam_id === exam.id).map((s: any) => s.attempt_number || 1));
      let nextAttempt = 1;
      while (usedAttempts.has(nextAttempt)) nextAttempt++;

      const { data, error } = await supabase.from('cbt_exam_sessions').insert({
        exam_id: exam.id, student_id: studentAccount!.student_id, user_id: user!.id,
        status: 'in_progress', attempt_number: nextAttempt,
        time_remaining_seconds: exam.duration_minutes * 60,
      }).select().single();
      if (error) throw error;
      return { session: data, exam };
    },
    onSuccess: ({ session, exam }) => {
      setActiveSession(session); setActiveExam(exam);
      setTimeLeft(session.time_remaining_seconds || exam.duration_minutes * 60);
      setCurrentIdx(0); setTokenInputOpen(false); setTokenInput(''); setViolations(0);
      queryClient.invalidateQueries({ queryKey: ['cbt-sessions'] });
      toast.success('Ujian dimulai!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const exitFullscreen = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };

  const handleSubmitExam = useCallback(async () => {
    const sess = sessionRef.current; const ex = examRef.current;
    if (!sess || !orderedQuestions.length) return;
    try {
      const inserts = orderedQuestions.map((q: any) => ({
        session_id: sess.id, question_id: q.id,
        selected_answer: q.question_type === 'essay' ? null : (answers[q.id] || null),
        essay_answer: q.question_type === 'essay' ? (essayAnswers[q.id] || null) : null,
        is_correct: q.question_type === 'essay' ? null : (answers[q.id] === q.correct_answer),
      }));
      for (const a of inserts) await supabase.from('cbt_student_answers').upsert(a, { onConflict: 'session_id,question_id' });

      const pgQ = orderedQuestions.filter((q: any) => q.question_type !== 'essay');
      const essayQ = orderedQuestions.filter((q: any) => q.question_type === 'essay');
      const totalPts = orderedQuestions.reduce((s, q: any) => s + (q.points || 1), 0);
      const correctPg = pgQ.filter((q: any) => answers[q.id] === q.correct_answer);
      const pgScore = correctPg.reduce((s, q: any) => s + (q.points || 1), 0);
      const hasEssay = essayQ.length > 0;
      const finalScore = totalPts > 0 ? (pgScore / totalPts) * 100 : 0;

      await supabase.from('cbt_exam_sessions').update({
        status: 'completed', end_time: new Date().toISOString(),
        score: finalScore, pg_score: pgScore, essay_score: 0,
        correct_count: correctPg.length, wrong_count: pgQ.length - correctPg.length,
        grading_status: hasEssay ? 'pending_essay' : 'auto_graded',
        time_remaining_seconds: 0,
      }).eq('id', sess.id);

      exitFullscreen();
      setActiveSession(null); setActiveExam(null); setAnswers({}); setEssayAnswers({}); setOrderedQuestions([]); setViolations(0);
      queryClient.invalidateQueries({ queryKey: ['cbt-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['cbt-available-exams'] });
      toast.success(hasEssay ? 'Ujian selesai! Menunggu koreksi essay.' : `Ujian selesai! Nilai: ${finalScore.toFixed(1)}`);
    } catch (e: any) { toast.error(e.message); }
  }, [orderedQuestions, answers, essayAnswers, queryClient]);

  const formatTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const sessionsForExam = (id: string) => (existingSessions || []).filter((s: any) => s.exam_id === id);

  // ===== ACTIVE EXAM VIEW =====
  if (activeSession && orderedQuestions.length > 0) {
    const currentQ = orderedQuestions[currentIdx];
    const isEssay = currentQ?.question_type === 'essay';
    const answeredCount = orderedQuestions.filter((q: any) => q.question_type === 'essay' ? !!essayAnswers[q.id] : !!answers[q.id]).length;
    const progress = (answeredCount / orderedQuestions.length) * 100;
    const allAnswered = answeredCount === orderedQuestions.length;
    const timeWarn = timeLeft < 300;

    return (
      <DashboardLayout>
        <div className="space-y-3 max-w-3xl mx-auto px-2">
          {/* Modern sticky header */}
          <Card className="sticky top-2 z-20 shadow-md border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5 backdrop-blur">
            <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${timeWarn ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  <Clock className={`h-4 w-4 ${timeWarn ? 'animate-pulse' : ''}`} />
                  <span className="font-mono font-bold text-sm">{formatTime(timeLeft)}</span>
                </div>
                {activeExam?.anti_cheat_enabled && (
                  <Badge variant={violations > 0 ? 'destructive' : 'outline'} className="gap-1">
                    <Shield className="h-3 w-3" /> {violations}/{activeExam.max_violations || 3}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                <Progress value={progress} className="h-2" />
                <span className="text-xs font-medium tabular-nums whitespace-nowrap">{answeredCount}/{orderedQuestions.length}</span>
              </div>
              {allAnswered ? (
                <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => { if (confirm('Semua soal sudah dijawab. Selesaikan ujian?')) handleSubmitExam(); }}>
                  <CheckCircle className="h-4 w-4 mr-1" /> Selesai
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled title={`Jawab semua soal (${orderedQuestions.length - answeredCount} lagi)`}>
                  Sisa {orderedQuestions.length - answeredCount}
                </Button>
              )}
            </CardContent>
          </Card>

          {activeExam?.anti_cheat_enabled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p>Mode Anti Curang aktif. Jangan pindah tab, keluar fullscreen, atau klik kanan. Pelanggaran tercatat otomatis.</p>
            </div>
          )}

          {activeExam?.instructions && currentIdx === 0 && (
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30">
              <CardContent className="p-3 text-sm">
                <p className="font-medium mb-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Petunjuk:</p>
                <p className="whitespace-pre-wrap">{activeExam.instructions}</p>
              </CardContent>
            </Card>
          )}

          {/* Question card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">{currentIdx + 1}</span>
                  <span>Soal {currentIdx + 1} / {orderedQuestions.length}</span>
                </CardTitle>
                <Badge variant={isEssay ? 'secondary' : 'outline'}>{isEssay ? 'Essay' : 'PG'} • {currentQ.points} poin</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <RichTextDisplay html={currentQ.question_text} className="text-base" />
              {isEssay ? (
                <Textarea rows={8} placeholder="Tulis jawaban Anda..." value={essayAnswers[currentQ.id] || ''}
                  onChange={e => setEssayAnswers(p => ({ ...p, [currentQ.id]: e.target.value }))} />
              ) : (
                <RadioGroup value={answers[currentQ.id] || ''} onValueChange={v => setAnswers(p => ({ ...p, [currentQ.id]: v }))} className="space-y-2">
                  {['A','B','C','D','E'].map(opt => {
                    const val = currentQ[`option_${opt.toLowerCase()}`];
                    if (!val) return null;
                    const selected = answers[currentQ.id] === opt;
                    return (
                      <label key={opt} htmlFor={`opt-${opt}`}
                        className={`flex items-start space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-accent/30'}`}>
                        <RadioGroupItem value={opt} id={`opt-${opt}`} className="mt-0.5" />
                        <span className="flex-1 text-sm"><strong className="mr-1">{opt}.</strong> {val}</span>
                      </label>
                    );
                  })}
                </RadioGroup>
              )}
            </CardContent>
          </Card>

          {/* Navigator */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} disabled={currentIdx === 0}>‹ Sebelumnya</Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentIdx(i => Math.min(orderedQuestions.length - 1, i + 1))} disabled={currentIdx === orderedQuestions.length - 1}>Selanjutnya ›</Button>
            </div>
            <Card className="p-2">
              <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1.5">
                {orderedQuestions.map((q: any, i: number) => {
                  const a = q.question_type === 'essay' ? !!essayAnswers[q.id] : !!answers[q.id];
                  return (
                    <button key={i} onClick={() => setCurrentIdx(i)}
                      className={`h-8 text-xs font-medium rounded transition-all ${
                        currentIdx === i ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                        a ? 'bg-emerald-500 text-white hover:bg-emerald-600' :
                        'bg-muted hover:bg-accent border border-border'
                      }`}>{i + 1}</button>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>

        {/* Violation warning */}
        <Dialog open={!!warningOpen} onOpenChange={() => setWarningOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Peringatan Anti Curang</DialogTitle>
              <DialogDescription className="pt-2">{warningOpen}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => {
                setWarningOpen(null);
                if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
              }}>Saya Mengerti</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Exit token dialog */}
        <Dialog open={exitTokenOpen} onOpenChange={setExitTokenOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Keluar Mode Anti Curang</DialogTitle>
              <DialogDescription>Masukkan token keluar (dari pengawas) untuk menonaktifkan mode anti curang sementara.</DialogDescription>
            </DialogHeader>
            <Input value={exitTokenInput} onChange={e => setExitTokenInput(e.target.value.toUpperCase())} placeholder="Token keluar" className="font-mono text-center" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setExitTokenOpen(false)}>Batal</Button>
              <Button onClick={() => {
                if (exitTokenInput.trim().toUpperCase() === (activeExam?.exit_token || '').toUpperCase() && activeExam?.exit_token) {
                  setActiveExam((p: any) => ({ ...p, anti_cheat_enabled: false }));
                  exitFullscreen();
                  toast.success('Mode anti curang dinonaktifkan');
                  setExitTokenOpen(false); setExitTokenInput('');
                } else toast.error('Token salah');
              }}>Konfirmasi</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Floating exit button if anti-cheat */}
        {activeExam?.anti_cheat_enabled && activeExam?.exit_token && (
          <Button variant="outline" size="sm" className="fixed bottom-4 right-4 shadow-lg" onClick={() => setExitTokenOpen(true)}>
            <KeyRound className="h-4 w-4 mr-1" /> Token Keluar
          </Button>
        )}
      </DashboardLayout>
    );
  }

  // ===== EXAM LIST VIEW =====
  return (
    <ProtectedRoute allowedRoles={['siswa']}>
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 border">
            <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Ujian CBT</h1>
            <p className="text-muted-foreground text-sm mt-1">Kerjakan ujian online dengan tenang dan jujur</p>
          </div>

          {(!availableExams || availableExams.length === 0) ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>Tidak ada ujian saat ini</p></CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {availableExams.map((exam: any) => {
                const sessions = sessionsForExam(exam.id);
                const completed = sessions.filter((s: any) => s.status === 'completed');
                const inProgress = sessions.find((s: any) => s.status === 'in_progress' || s.status === 'paused');
                const attemptsUsed = sessions.length;
                const canStart = attemptsUsed < (exam.max_attempts || 1) && !inProgress;
                const lastCompleted = completed[0];
                return (
                  <Card key={exam.id} className="hover:shadow-lg transition-all border-l-4 border-l-primary/40 hover:border-l-primary">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-base leading-tight">{exam.title}</CardTitle>
                          <CardDescription className="text-xs">{exam.subject}</CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {inProgress && <Badge variant="secondary" className="text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" /> Berlangsung</Badge>}
                          {completed.length > 0 && <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px]"><CheckCircle className="h-2.5 w-2.5 mr-0.5" /> {completed.length}x</Badge>}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2.5 pt-1">
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded-full bg-muted">{exam.total_questions} soal</span>
                        <span className="px-2 py-0.5 rounded-full bg-muted">{exam.duration_minutes} menit</span>
                        <span className="px-2 py-0.5 rounded-full bg-muted">KKM {exam.pass_score}</span>
                        <span className="px-2 py-0.5 rounded-full bg-muted">{attemptsUsed}/{exam.max_attempts || 1}</span>
                        {exam.require_token && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center gap-1"><KeyRound className="h-2.5 w-2.5" />Token</span>}
                        {exam.anti_cheat_enabled && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 flex items-center gap-1"><Shield className="h-2.5 w-2.5" />Anti-cheat</span>}
                      </div>
                      {lastCompleted && exam.show_result_to_student && lastCompleted.grading_status !== 'pending_essay' && (
                        <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                          <span className="text-xs text-muted-foreground">Nilai Terbaik</span>
                          <span className={`font-bold ${(lastCompleted.score || 0) >= exam.pass_score ? 'text-emerald-600' : 'text-destructive'}`}>{lastCompleted.score?.toFixed(1)}</span>
                        </div>
                      )}
                      {lastCompleted?.grading_status === 'pending_essay' && (
                        <div className="p-1.5 rounded bg-amber-50 dark:bg-amber-950/30 text-[11px] text-center">Menunggu koreksi essay</div>
                      )}
                      {inProgress && exam.allow_resume !== false && (
                        <Button className="w-full gap-1" size="sm" variant="secondary" onClick={() => startOrResumeExam.mutate({ exam, resume: inProgress })}>
                          <RotateCcw className="h-3.5 w-3.5" /> Lanjutkan
                        </Button>
                      )}
                      {canStart && (
                        <Button className="w-full gap-1" size="sm" onClick={() => {
                          if (exam.require_token) { setPendingExam(exam); setTokenInputOpen(true); }
                          else if (confirm('Mulai ujian? Timer akan berjalan.')) startOrResumeExam.mutate({ exam });
                        }}>
                          <Play className="h-3.5 w-3.5" /> {attemptsUsed > 0 ? `Coba Lagi (${attemptsUsed + 1}/${exam.max_attempts})` : 'Mulai Ujian'}
                        </Button>
                      )}
                      {!canStart && !inProgress && <p className="text-[11px] text-center text-muted-foreground">Batas percobaan tercapai</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {existingSessions && existingSessions.filter((s: any) => s.status === 'completed').length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Riwayat Ujian</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {existingSessions.filter((s: any) => s.status === 'completed').slice(0, 10).map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">Percobaan #{s.attempt_number || 1}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(s.created_at), 'dd MMM yyyy HH:mm', { locale: idLocale })}</p>
                      </div>
                      {s.grading_status === 'pending_essay' ? <Badge variant="outline">Menunggu Koreksi</Badge> :
                        <Badge variant={(s.score || 0) >= 70 ? 'default' : 'destructive'}>{s.score?.toFixed(1)}</Badge>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Dialog open={tokenInputOpen} onOpenChange={setTokenInputOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Masukkan Token Ujian</DialogTitle>
              <DialogDescription>Token diberikan oleh guru pengawas</DialogDescription>
            </DialogHeader>
            <Input value={tokenInput} onChange={e => setTokenInput(e.target.value.toUpperCase())} placeholder="Token (6 karakter)" className="font-mono text-center text-lg" maxLength={12} autoFocus />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setTokenInputOpen(false); setTokenInput(''); }}>Batal</Button>
              <Button onClick={() => startOrResumeExam.mutate({ exam: pendingExam })} disabled={!tokenInput || startOrResumeExam.isPending}>Mulai</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
