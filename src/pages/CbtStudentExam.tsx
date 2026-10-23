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
import { Clock, CheckCircle, FileText, Play, KeyRound, RotateCcw, AlertTriangle, Shield, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { RichTextDisplay } from '@/components/cbt/RichTextEditor';

// Urutan acak yang stabil per sesi (tetap sama saat siswa melanjutkan ujian)
const seededShuffle = <T,>(arr: T[], seedStr: string): T[] => {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let seed = h >>> 0;
  const rand = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isFinished = (st: string) => st === 'completed' || st === 'timeout';

// Beban server dijaga ringan: 1 panggilan daftar ujian, 1 panggilan memuat soal, lalu simpan berkala
// HANYA jawaban yang berubah (sekitar tiap 30 detik, dengan jeda acak agar ratusan siswa tidak serentak).
const SAVE_INTERVAL_MS = 30000;
const SAVE_DEBOUNCE_MS = 8000;

export default function CbtStudentExam() {
  const queryClient = useQueryClient();
  const [activeSession, setActiveSession] = useState<any>(null);
  const [activeExam, setActiveExam] = useState<any>(null);
  const [orderedQuestions, setOrderedQuestions] = useState<any[]>([]);
  const [loadingPaper, setLoadingPaper] = useState(false);
  const [paused, setPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  const sessionRef = useRef<any>(null);
  const examRef = useRef<any>(null);
  const answersRef = useRef<Record<string, string>>({});
  const essaysRef = useRef<Record<string, string>>({});
  const dirtyAnswersRef = useRef<Record<string, string>>({});
  const dirtyEssaysRef = useRef<Record<string, string>>({});
  const deadlineRef = useRef<number>(0);
  const timeLeftRef = useRef<number>(0);
  const pausedRef = useRef(false);
  const submittingRef = useRef(false);
  const savingRef = useRef(false);
  const debounceRef = useRef<any>(null);

  useEffect(() => { sessionRef.current = activeSession; examRef.current = activeExam; }, [activeSession, activeExam]);
  useEffect(() => { answersRef.current = answers; essaysRef.current = essayAnswers; }, [answers, essayAnswers]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Satu panggilan: ujian yang boleh diikuti + riwayat sesi siswa (kunci jawaban & token tidak ikut terkirim)
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['cbt-student-overview'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('cbt_student_exams');
      if (error) throw error;
      return data as { student_id: string | null; exams: any[]; sessions: any[] };
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
  const availableExams: any[] = overview?.exams || [];
  const existingSessions: any[] = overview?.sessions || [];

  const resetExamState = () => {
    setActiveSession(null); setActiveExam(null); setAnswers({}); setEssayAnswers({}); setOrderedQuestions([]);
    setViolations(0); setPaused(false); setTimeLeft(0); setCurrentIdx(0);
    dirtyAnswersRef.current = {}; dirtyEssaysRef.current = {};
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
  };

  const exitFullscreen = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };

  const finishLocally = (message: string) => {
    exitFullscreen();
    resetExamState();
    queryClient.invalidateQueries({ queryKey: ['cbt-student-overview'] });
    toast.success(message);
  };

  // Simpan hanya yang berubah + sisa waktu. Balasan memuat status sesi (dijeda / diakhiri pengawas).
  const flushProgress = useCallback(async (force = false) => {
    const sess = sessionRef.current;
    if (!sess || submittingRef.current || savingRef.current) return;
    const dA = dirtyAnswersRef.current; const dE = dirtyEssaysRef.current;
    const hasDirty = Object.keys(dA).length > 0 || Object.keys(dE).length > 0;
    if (!hasDirty && !force) return;
    savingRef.current = true;
    const sentA = { ...dA }; const sentE = { ...dE };
    try {
      const { data, error } = await (supabase as any).rpc('cbt_save_progress', {
        p_session_id: sess.id, p_answers: sentA, p_essays: sentE,
        p_time_remaining: Math.max(0, timeLeftRef.current),
      });
      if (error) throw error;
      if (data && data.ok === false) {
        if (data.status === 'paused') { setPaused(true); }
        else if (isFinished(data.status)) { finishLocally('Ujian telah diakhiri oleh pengawas.'); }
        return;
      }
      // hapus dari antrean hanya bila nilainya belum berubah sejak dikirim
      Object.keys(sentA).forEach((k) => { if (dirtyAnswersRef.current[k] === sentA[k]) delete dirtyAnswersRef.current[k]; });
      Object.keys(sentE).forEach((k) => { if (dirtyEssaysRef.current[k] === sentE[k]) delete dirtyEssaysRef.current[k]; });
      if (pausedRef.current) { setPaused(false); deadlineRef.current = Date.now() + timeLeftRef.current * 1000; }
    } catch { /* jaringan putus: antrean tetap, dicoba lagi pada siklus berikutnya */ }
    finally { savingRef.current = false; }
  }, []);

  const scheduleDebouncedSave = () => {
    if (debounceRef.current) return;
    debounceRef.current = setTimeout(() => { debounceRef.current = null; flushProgress(); }, SAVE_DEBOUNCE_MS + Math.random() * 4000);
  };
  const setAnswer = (qid: string, value: string) => {
    setAnswers((p) => ({ ...p, [qid]: value }));
    dirtyAnswersRef.current[qid] = value;
    scheduleDebouncedSave();
  };
  const setEssay = (qid: string, value: string) => {
    setEssayAnswers((p) => ({ ...p, [qid]: value }));
    dirtyEssaysRef.current[qid] = value;
    scheduleDebouncedSave();
  };

  // Kumpulkan: kirim SEMUA jawaban (idempotent), nilai dihitung di server; coba ulang bila jaringan bermasalah
  const handleSubmitExam = useCallback(async (timeout = false) => {
    const sess = sessionRef.current;
    if (!sess || submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true);
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    let lastErr: any = null;
    for (let attempt = 0; attempt < (timeout ? 12 : 5); attempt++) {
      try {
        const { data, error } = await (supabase as any).rpc('cbt_submit_session', {
          p_session_id: sess.id, p_answers: answersRef.current, p_essays: essaysRef.current, p_timeout: timeout,
        });
        if (error) throw error;
        const showScore = examRef.current?.show_result_to_student !== false && data?.grading_status !== 'pending_essay';
        submittingRef.current = false; setSubmitting(false);
        finishLocally(data?.grading_status === 'pending_essay' ? 'Ujian selesai! Menunggu koreksi essay.'
          : showScore ? `Ujian selesai! Nilai: ${Number(data?.score ?? 0).toFixed(1)}` : 'Ujian selesai!');
        return;
      } catch (e: any) { lastErr = e; await sleep(Math.min(8000, 1000 * 2 ** attempt)); }
    }
    submittingRef.current = false; setSubmitting(false);
    toast.error('Jawaban belum terkirim: ' + (lastErr?.message || 'koneksi bermasalah') + '. Jawaban tetap aman di layar, tekan Selesai lagi saat koneksi pulih.');
  }, []);

  // Timer berbasis tenggat (tidak melenceng) – hanya berjalan saat tidak dijeda
  useEffect(() => {
    if (!activeSession || paused || submitting) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      timeLeftRef.current = left;
      setTimeLeft(left);
      if (left <= 0) { clearInterval(t); handleSubmitExam(true); }
    }, 1000);
    return () => clearInterval(t);
  }, [activeSession?.id, paused, submitting, handleSubmitExam]);

  // Simpan berkala (jeda acak) + saat tab disembunyikan; saat dijeda: cek status tiap ~15 dtk
  useEffect(() => {
    if (!activeSession) return;
    let stop = false; let timer: any;
    const loop = async () => {
      if (stop) return;
      await flushProgress(true);
      timer = setTimeout(loop, (pausedRef.current ? 15000 : SAVE_INTERVAL_MS) + Math.random() * 10000);
    };
    timer = setTimeout(loop, SAVE_INTERVAL_MS + Math.random() * 10000);
    const onHide = () => { if (document.hidden) flushProgress(); };
    document.addEventListener('visibilitychange', onHide);
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('beforeunload', onUnload); };
  }, [activeSession?.id, flushProgress]);

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

  // Mulai / lanjutkan: token & batas percobaan diperiksa di server; lalu muat soal (tanpa kunci jawaban) sekali saja
  const startOrResumeExam = useMutation({
    mutationFn: async ({ exam }: { exam: any }) => {
      const { data, error } = await (supabase as any).rpc('cbt_start_session', { p_exam_id: exam.id, p_token: tokenInput.trim() || null });
      if (error) throw error;
      const { session, exam: pubExam } = data as { session: any; exam: any };
      const { data: paper, error: pErr } = await (supabase as any).rpc('cbt_exam_paper', { p_session_id: session.id });
      if (pErr) throw pErr;
      return { session, exam: pubExam, paper };
    },
    onMutate: () => setLoadingPaper(true),
    onSettled: () => setLoadingPaper(false),
    onSuccess: ({ session, exam, paper }) => {
      let qs: any[] = paper.questions || [];
      if (exam.shuffle_questions) qs = seededShuffle(qs, session.id);
      const left = Math.max(0, paper.time_remaining_seconds ?? session.time_remaining_seconds ?? exam.duration_minutes * 60);
      dirtyAnswersRef.current = {}; dirtyEssaysRef.current = {};
      timeLeftRef.current = left; deadlineRef.current = Date.now() + left * 1000;
      setOrderedQuestions(qs);
      setAnswers(paper.answers || {}); setEssayAnswers(paper.essays || {});
      setPaused(paper.status === 'paused');
      setActiveSession(session); setActiveExam(exam);
      setTimeLeft(left);
      setCurrentIdx(0); setTokenInputOpen(false); setTokenInput(''); setViolations(0);
      queryClient.invalidateQueries({ queryKey: ['cbt-student-overview'] });
      toast.success('Ujian dimulai!');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const formatTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const sessionsForExam = (id: string) => existingSessions.filter((s: any) => s.exam_id === id);

  if (loadingPaper && !activeSession) {
    return (
      <DashboardLayout>
        <div className="py-24 text-center text-muted-foreground">Menyiapkan soal ujian…</div>
      </DashboardLayout>
    );
  }

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
                  disabled={submitting}
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
                  onChange={e => setEssay(currentQ.id, e.target.value)} />
              ) : (
                <RadioGroup value={answers[currentQ.id] || ''} onValueChange={v => setAnswer(currentQ.id, v)} className="space-y-2">
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

        {/* Ujian dijeda pengawas: timer berhenti, menunggu dilanjutkan */}
        <Dialog open={paused}>
          <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Ujian dijeda pengawas</DialogTitle>
              <DialogDescription className="pt-2">Waktu berhenti dan jawaban Anda aman. Halaman akan lanjut otomatis saat pengawas melanjutkan ujian.</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>

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
              <Button onClick={async () => {
                const { data: ok } = await (supabase as any).rpc('cbt_verify_exit_token', { p_exam_id: activeExam?.id, p_token: exitTokenInput });
                if (ok) {
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
        {activeExam?.anti_cheat_enabled && activeExam?.has_exit_token && (
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

          {overviewLoading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Memuat daftar ujian…</CardContent></Card>
          ) : (!availableExams || availableExams.length === 0) ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground"><FileText className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>Tidak ada ujian saat ini</p></CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {availableExams.map((exam: any) => {
                const sessions = sessionsForExam(exam.id);
                const completed = sessions.filter((s: any) => isFinished(s.status));
                const inProgress = sessions.find((s: any) => s.status === 'in_progress' || s.status === 'paused');
                const attemptsUsed = sessions.length;
                const canStart = attemptsUsed < (exam.max_attempts || 1) && !inProgress;
                const scored = completed.filter((s: any) => s.grading_status !== 'pending_essay' && s.score != null);
                const lastCompleted = scored.length ? scored.reduce((a: any, b: any) => (Number(b.score) > Number(a.score) ? b : a)) : completed[0];
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
                          <span className={`font-bold ${(lastCompleted.score || 0) >= exam.pass_score ? 'text-emerald-600' : 'text-destructive'}`}>{Number(lastCompleted.score ?? 0).toFixed(1)}</span>
                        </div>
                      )}
                      {lastCompleted?.grading_status === 'pending_essay' && (
                        <div className="p-1.5 rounded bg-amber-50 dark:bg-amber-950/30 text-[11px] text-center">Menunggu koreksi essay</div>
                      )}
                      {inProgress && exam.allow_resume !== false && (
                        <Button className="w-full gap-1" size="sm" variant="secondary" onClick={() => startOrResumeExam.mutate({ exam })} disabled={startOrResumeExam.isPending}>
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

          {existingSessions.filter((s: any) => isFinished(s.status)).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Riwayat Ujian</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {existingSessions.filter((s: any) => isFinished(s.status)).slice(0, 10).map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">Percobaan #{s.attempt_number || 1}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(s.created_at), 'dd MMM yyyy HH:mm', { locale: idLocale })}</p>
                      </div>
                      {s.grading_status === 'pending_essay' ? <Badge variant="outline">Menunggu Koreksi</Badge> :
                        <Badge variant={(s.score || 0) >= 70 ? 'default' : 'destructive'}>{Number(s.score ?? 0).toFixed(1)}</Badge>}
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
