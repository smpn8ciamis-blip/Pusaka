import { formatWibDateTime } from '@/lib/wib';
import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import CalmWait, { AdviceLine } from '@/components/cbt/CalmWait';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, CheckCircle, FileText, Play, KeyRound, RotateCcw, AlertTriangle, Shield, ShieldAlert, HardDriveDownload, Maximize, Send, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { RichTextDisplay } from '@/components/cbt/RichTextEditor';
import { OptionDisplay } from '@/components/cbt/OptionDisplay';
import { SymbolPalette } from '@/components/cbt/SymbolPalette';
import { useCbtAntiCheat } from '@/hooks/useCbtAntiCheat';
import { createDeadline, violationLabel } from '@/lib/cbtAntiCheat';
import { fireAlarm, stopAlarm, primeAlarm } from '@/lib/cbtAlarm';
import {
  clearProgress, deletePaper, emptyProgress, loadPaper, loadProgress, makeImageUrlMap, prefetchPaper, purgeOldPapers, purgeOldProgress,
  releaseTabLock, resumeTimeLeft, rewriteImages, saveProgress, tryAcquireTabLock,
  type LocalProgress, type PrefetchProgress, type StoredPaper,
} from '@/lib/cbtLocal';
import {
  CBT_DOWNLOAD_DELAY, CBT_DOWNLOAD_RETRY_DELAY, CBT_SUBMIT_DELAY_MANUAL, CBT_SUBMIT_DELAY_TIMEOUT,
  CBT_DASHBOARD_DELAY, CBT_HEARTBEAT_MS, CBT_HEARTBEAT_JITTER_MS, CBT_HEARTBEAT_PAUSED_MS,
  randomDelaySeconds, retryDelayMs, waitWithCountdown,
} from '@/lib/cbtJitter';
import { setExamFocus } from '@/lib/examFocus';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';
import { CBT_PLEDGE_HONEST, CBT_PLEDGE_SUBMIT, matchesPhrase, typedOnlyInputProps } from '@/lib/cbtPledge';

// Jeda acak hanya pada pemuatan PERTAMA daftar ujian sejak halaman dibuka (bukan tiap refetch).
let dashboardJitterDone = false;
// Tombol Selesai baru muncul pada sisa waktu ini (detik).
const FINISH_VISIBLE_SECONDS = 300;

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
const isFinished = (st: string) => st === 'completed' || st === 'timeout';
const isMissingRpc = (e: any) => e?.code === 'PGRST202' || e?.code === '42883' || /could not find the function/i.test(e?.message || '');

// Mode ringan: semua soal diunduh sekali ke perangkat, jawaban disimpan di perangkat (localStorage) dan
// HANYA dikirim ke server saat siswa menekan Selesai / waktu habis. Selama ujian server hanya menerima
// denyut kecil (jumlah soal terjawab + sisa waktu, tanpa isi jawaban) yang juga membawa status jeda/akhiri dari pengawas.
// Interval denyut ada di cbtJitter.ts (CBT_HEARTBEAT_*): batas "tidak aktif 3 menit" di cbt_finish_or_request bergantung padanya.
const LOCAL_SAVE_DEBOUNCE_MS = 300;

// waitLeft/waitTotal: hitung mundur acak sebelum soal diunduh (agar ratusan siswa tidak mengunduh serentak)
interface PrepState { open: boolean; percent: number; label: string; imagesDone: number; imagesTotal: number; error: string | null; examTitle: string; canRetry: boolean; waitLeft: number; waitTotal: number }
const PREP_CLOSED: PrepState = { open: false, percent: 0, label: '', imagesDone: 0, imagesTotal: 0, error: null, examTitle: '', canRetry: false, waitLeft: 0, waitTotal: 0 };

// Progres pengumpulan jawaban: antre (jeda acak) -> kirim -> (coba lagi) -> selesai
interface SubmitState { open: boolean; phase: 'wait' | 'send' | 'retry' | 'error'; waitLeft: number; waitTotal: number; attempt: number; maxAttempts: number; retryLeft: number; error: string | null; timeout: boolean }
const SUBMIT_CLOSED: SubmitState = { open: false, phase: 'wait', waitLeft: 0, waitTotal: 0, attempt: 0, maxAttempts: 0, retryLeft: 0, error: null, timeout: false };

function SubmitStep({ state, label, detail }: { state: 'done' | 'active' | 'todo' | 'error'; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">
        {state === 'done' ? <CheckCircle className="h-4 w-4 text-emerald-600" />
          : state === 'active' ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
          : state === 'error' ? <AlertTriangle className="h-4 w-4 text-destructive" />
          : <span className="block h-4 w-4 rounded-full border border-muted-foreground/40" />}
      </span>
      <span className={state === 'todo' ? 'text-muted-foreground' : state === 'error' ? 'text-destructive' : ''}>
        {label}
        {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
      </span>
    </li>
  );
}

export default function CbtStudentExam() {
  const { user } = useAuth();
  const userId = user?.id || 'anon';
  const queryClient = useQueryClient();
  const [activeSession, setActiveSession] = useState<any>(null);
  const [activeExam, setActiveExam] = useState<any>(null);
  const [orderedQuestions, setOrderedQuestions] = useState<any[]>([]);
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [prep, setPrep] = useState<PrepState>(PREP_CLOSED);
  const [submitState, setSubmitState] = useState<SubmitState>(SUBMIT_CLOSED);
  const [paused, setPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [essayAnswers, setEssayAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [tokenInputOpen, setTokenInputOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [honestyText, setHonestyText] = useState('');
  const [pledgeGate, setPledgeGate] = useState(false); // pernyataan kejujuran: tampil SETELAH layar penuh/anti curang aktif, sebelum soal & timer dimulai
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishText, setFinishText] = useState('');
  const [overviewWait, setOverviewWait] = useState(0);
  const [overviewWaitTotal, setOverviewWaitTotal] = useState(0);
  const [pendingExam, setPendingExam] = useState<any>(null);
  const [violations, setViolations] = useState(0);
  const [exitTokenOpen, setExitTokenOpen] = useState(false);
  const [exitTokenInput, setExitTokenInput] = useState('');
  const [warningOpen, setWarningOpen] = useState<string | null>(null);
  const [needFullscreen, setNeedFullscreen] = useState(false);

  const sessionRef = useRef<any>(null);
  const examRef = useRef<any>(null);
  const questionsRef = useRef<any[]>([]);
  const answersRef = useRef<Record<string, string>>({});
  const essaysRef = useRef<Record<string, string>>({});
  const localRef = useRef<LocalProgress>(emptyProgress());
  const localTimerRef = useRef<any>(null);
  const deadlineRef = useRef<ReturnType<typeof createDeadline> | null>(null);
  const timeLeftRef = useRef<number>(0);
  const pausedRef = useRef(false);
  const submittingRef = useRef(false);
  const beatingRef = useRef(false);
  const beginningRef = useRef(false);
  const violationsRef = useRef(0);
  const alarmPendingRef = useRef(false); // pelanggaran terjadi saat layar tidak terlihat: getar diulang ketika siswa kembali
  const revokeImagesRef = useRef<(() => void) | null>(null);
  const prepCtxRef = useRef<{ exam: any; token: string | null; session: any; pubExam: any } | null>(null);
  // Percobaan mulai terakhir (untuk "Coba Lagi" bila panggilan mulai gagal karena jaringan) + penanda putaran agar "Batal" saat antre bisa dibatalkan
  const startArgsRef = useRef<{ exam: any; token: string | null } | null>(null);
  const beginRunRef = useRef(0);
  const needPledgeRef = useRef(false);
  const tabIdRef = useRef(Math.random().toString(36).slice(2));

  useEffect(() => { sessionRef.current = activeSession; examRef.current = activeExam; }, [activeSession, activeExam]);
  useEffect(() => { questionsRef.current = orderedQuestions; }, [orderedQuestions]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  // Waktu habis / diminta pengawas / pelanggaran: dialog konfirmasi ketik ditutup, dialog pengumpulan yang tampil
  useEffect(() => { if (submitting) { setFinishOpen(false); setFinishText(''); } }, [submitting]);
  useEffect(() => { purgeOldPapers(); purgeOldProgress(); }, []);

  // Satu panggilan: ujian yang boleh diikuti + riwayat sesi siswa (kunci jawaban & token tidak ikut terkirim)
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['cbt-student-overview'],
    queryFn: async () => {
      // jeda acak sebelum pemuatan pertama agar ratusan siswa yang membuka halaman bersamaan tidak menembak server serentak
      if (!dashboardJitterDone) {
        dashboardJitterDone = true;
        const sec = randomDelaySeconds(CBT_DASHBOARD_DELAY);
        setOverviewWaitTotal(sec);
        if (sec > 0) await waitWithCountdown(sec * 1000, (left) => setOverviewWait(left));
        setOverviewWait(0); setOverviewWaitTotal(0);
      }
      const { data, error } = await (supabase as any).rpc('cbt_student_exams');
      if (error) throw error;
      return data as { student_id: string | null; exams: any[]; sessions: any[] };
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
  const availableExams: any[] = overview?.exams || [];
  const existingSessions: any[] = overview?.sessions || [];

  // ---------- penyimpanan lokal (di perangkat) ----------
  const persistLocalNow = useCallback(() => {
    const sess = sessionRef.current;
    if (!sess) return;
    if (localTimerRef.current) { clearTimeout(localTimerRef.current); localTimerRef.current = null; }
    localRef.current.answers = answersRef.current;
    localRef.current.essays = essaysRef.current;
    localRef.current.violations = violationsRef.current;
    localRef.current.timeLeft = timeLeftRef.current;
    localRef.current.timeAt = Date.now();
    saveProgress(userId, sess.id, localRef.current);
  }, [userId]);
  const persistLocalSoon = useCallback(() => {
    if (localTimerRef.current) return;
    localTimerRef.current = setTimeout(() => { localTimerRef.current = null; persistLocalNow(); }, LOCAL_SAVE_DEBOUNCE_MS);
  }, [persistLocalNow]);

  const countAnswered = () => questionsRef.current.filter((q: any) => (q.question_type === 'essay' ? !!essaysRef.current[q.id] : !!answersRef.current[q.id])).length;

  const exitFullscreen = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };

  const resetExamState = () => {
    const sess = sessionRef.current;
    if (sess) releaseTabLock(sess.id, tabIdRef.current);
    revokeImagesRef.current?.(); revokeImagesRef.current = null;
    stopAlarm(); alarmPendingRef.current = false;
    setActiveSession(null); setActiveExam(null); setAnswers({}); setEssayAnswers({}); setOrderedQuestions([]); setImageMap({});
    setViolations(0); setPaused(false); setTimeLeft(0); setCurrentIdx(0); setNeedFullscreen(false); setWarningOpen(null);
    answersRef.current = {}; essaysRef.current = {}; violationsRef.current = 0; localRef.current = emptyProgress();
    if (localTimerRef.current) { clearTimeout(localTimerRef.current); localTimerRef.current = null; }
    sessionRef.current = null; examRef.current = null;
    setSubmitState(SUBMIT_CLOSED);
  };

  /** Ujian selesai / diakhiri: hapus soal dan jawaban dari perangkat. */
  const finishLocally = (message: string, sessionId?: string) => {
    const sid = sessionId || sessionRef.current?.id;
    if (sid) { clearProgress(userId, sid); deletePaper(sid); }
    exitFullscreen();
    resetExamState();
    queryClient.invalidateQueries({ queryKey: ['cbt-student-overview'] });
    toast.success(message);
  };

  // ---------- pelanggaran (anti curang) ----------
  const sendViolation = async (rec: { type: string; detail: string | null }) => {
    const sess = sessionRef.current; const exam = examRef.current;
    if (!sess || !exam) return false;
    try {
      const { error } = await supabase.from('cbt_session_violations').insert({
        session_id: sess.id, exam_id: exam.id, student_id: sess.student_id, violation_type: rec.type, detail: rec.detail,
      });
      return !error;
    } catch { return false; }
  };
  const flushViolations = async () => {
    const list = [...localRef.current.pendingViolations].slice(0, 20);
    for (const rec of list) {
      if (await sendViolation(rec)) {
        localRef.current.pendingViolations = localRef.current.pendingViolations.filter((r) => r !== rec);
      } else break;
    }
    if (list.length) persistLocalNow();
  };

  // Kumpulkan: kirim SEMUA jawaban sekaligus (idempotent), nilai dihitung di server.
  // Urutan: jeda acak (antre) -> kirim -> bila gagal, coba lagi dengan jeda acak. Progres tampil di dialog "Mengumpulkan jawaban".
  // Jeda acak mencegah ratusan siswa mengirim di detik yang sama (terutama saat waktu habis); jawaban sudah aman di perangkat.
  const handleSubmitExam = useCallback(async (timeout = false, opts?: { noDelay?: boolean }) => {
    const sess = sessionRef.current;
    if (!sess || submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true);
    persistLocalNow();
    const maxAttempts = timeout ? 12 : 5;
    const delay = opts?.noDelay ? 0 : randomDelaySeconds(timeout ? CBT_SUBMIT_DELAY_TIMEOUT : CBT_SUBMIT_DELAY_MANUAL);
    setSubmitState({ ...SUBMIT_CLOSED, open: true, phase: delay > 0 ? 'wait' : 'send', waitLeft: delay, waitTotal: delay, maxAttempts, timeout });
    if (delay > 0) await waitWithCountdown(delay * 1000, (left) => setSubmitState((st) => ({ ...st, waitLeft: left })));
    persistLocalNow();
    let lastErr: any = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      setSubmitState((st) => ({ ...st, phase: 'send', attempt: attempt + 1, error: null }));
      try {
        const { data, error } = await (supabase as any).rpc('cbt_submit_session', {
          p_session_id: sess.id, p_answers: answersRef.current, p_essays: essaysRef.current, p_timeout: timeout,
        });
        if (error) throw error;
        const showScore = examRef.current?.show_result_to_student !== false && data?.grading_status !== 'pending_essay';
        await flushViolations().catch(() => {});
        submittingRef.current = false; setSubmitting(false);
        finishLocally(data?.late ? 'Ujian diakhiri pengawas. Jawaban susulan Anda sudah diterima.'
          : data?.grading_status === 'pending_essay' ? 'Ujian selesai! Menunggu koreksi essay.'
          : showScore ? `Ujian selesai! Nilai: ${Number(data?.score ?? 0).toFixed(1)}` : 'Ujian selesai!', sess.id);
        return;
      } catch (e: any) {
        lastErr = e;
        if (attempt + 1 >= maxAttempts) break;
        const wait = retryDelayMs(attempt);
        setSubmitState((st) => ({ ...st, phase: 'retry', retryLeft: Math.ceil(wait / 1000), error: e?.message || 'koneksi bermasalah' }));
        await waitWithCountdown(wait, (left) => setSubmitState((st) => ({ ...st, retryLeft: left })));
      }
    }
    // Gagal setelah semua percobaan: dialog tetap terbuka (submitting tetap true agar timer tidak memulai ulang sendiri);
    // siswa menekan "Kirim Lagi". Jawaban tetap aman di perangkat.
    submittingRef.current = false;
    setSubmitState((st) => ({ ...st, phase: 'error', error: lastErr?.message || 'koneksi bermasalah' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistLocalNow, userId]);

  // Cadangan bila internet putus: unduh jawaban dari perangkat sebagai berkas JSON untuk diserahkan ke pengawas/guru.
  const downloadAnswersFile = useCallback(() => {
    const sess = sessionRef.current;
    const payload = {
      sessionId: sess?.id ?? null,
      examId: examRef.current?.id ?? sess?.exam_id ?? null,
      savedAt: new Date().toISOString(),
      answers: answersRef.current,
      essays: essaysRef.current,
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `jawaban-${String(payload.sessionId || 'ujian').slice(0, 8)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { toast.error('Gagal membuat berkas jawaban.'); }
  }, []);

  // Denyut ringan ke server: jumlah soal terjawab + sisa waktu (TANPA isi jawaban). Balasan memuat status sesi.
  const heartbeat = useCallback(async () => {
    const sess = sessionRef.current;
    if (!sess || submittingRef.current || beatingRef.current) return;
    beatingRef.current = true;
    try {
      const args = { p_session_id: sess.id, p_answered: countAnswered(), p_time_remaining: Math.max(0, timeLeftRef.current) };
      let data: any;
      const r = await (supabase as any).rpc('cbt_heartbeat', args);
      if (r.error) {
        if (!isMissingRpc(r.error)) throw r.error;
        // migrasi belum dijalankan: pakai simpan-kemajuan tanpa isi jawaban
        const f = await (supabase as any).rpc('cbt_save_progress', { p_session_id: sess.id, p_answers: {}, p_essays: {}, p_time_remaining: args.p_time_remaining });
        if (f.error) throw f.error;
        data = f.data;
      } else data = r.data;
      await flushViolations();
      // pengawas meminta jawaban dikumpulkan -> kirim jawaban dari perangkat ini
      if (data?.finish_requested && !submittingRef.current) { beatingRef.current = false; toast.info('Pengawas meminta ujian dikumpulkan.'); handleSubmitExam(false); return; }
      if (data && data.ok === false) {
        if (data.status === 'paused') setPaused(true);
        else if (isFinished(data.status)) {
          // Diakhiri paksa pengawas: bila masih ada jawaban di perangkat, kirim sebagai jawaban susulan
          // (server menerimanya sekali, dalam 30 menit). Tanpa jawaban lokal, cukup tutup ujian.
          if (countAnswered() > 0) { beatingRef.current = false; handleSubmitExam(false, { noDelay: true }); }
          else finishLocally('Ujian telah diakhiri oleh pengawas.');
        }
        return;
      }
      if (pausedRef.current) { setPaused(false); deadlineRef.current = createDeadline(timeLeftRef.current); }
    } catch { /* jaringan putus: jawaban aman di perangkat, dicoba lagi pada denyut berikutnya */ }
    finally { beatingRef.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSubmitExam, persistLocalNow]);

  const setAnswer = (qid: string, value: string) => {
    answersRef.current = { ...answersRef.current, [qid]: value };
    setAnswers(answersRef.current);
    persistLocalSoon();
  };
  const essayRef = useRef<HTMLTextAreaElement>(null);
  /** Sisipkan simbol/huruf Arab di posisi kursor kolom jawaban essay. */
  const insertIntoEssay = (text: string) => {
    const q = questionsRef.current[currentIdx];
    if (!q) return;
    const ta = essayRef.current;
    const cur: string = essaysRef.current[q.id] || '';
    const s0 = ta ? Math.min(ta.selectionStart ?? cur.length, cur.length) : cur.length;
    const e0 = ta ? Math.min(ta.selectionEnd ?? cur.length, cur.length) : cur.length;
    setEssay(q.id, cur.slice(0, s0) + text + cur.slice(e0));
    const pos = s0 + text.length;
    requestAnimationFrame(() => { ta?.focus(); try { ta?.setSelectionRange(pos, pos); } catch { /* abaikan */ } });
  };
  const setEssay = (qid: string, value: string) => {
    essaysRef.current = { ...essaysRef.current, [qid]: value };
    setEssayAnswers(essaysRef.current);
    persistLocalSoon();
  };

  // Timer: jam monoton + jam dinding (memundurkan jam perangkat tidak menambah waktu) – hanya berjalan saat tidak dijeda
  useEffect(() => {
    if (!activeSession || paused || submitting || pledgeGate) return;
    if (!deadlineRef.current) deadlineRef.current = createDeadline(timeLeftRef.current);
    let n = 0;
    const t = setInterval(() => {
      const left = deadlineRef.current ? deadlineRef.current.left() : 0;
      timeLeftRef.current = left;
      setTimeLeft(left);
      if (++n % 5 === 0) persistLocalNow();
      if (left <= 0) { clearInterval(t); handleSubmitExam(true); }
    }, 1000);
    return () => clearInterval(t);
  }, [activeSession?.id, paused, submitting, pledgeGate, handleSubmitExam, persistLocalNow]);

  // Denyut berkala (jeda acak agar ratusan siswa tidak serentak); saat dijeda: cek status tiap ~15 dtk.
  // Juga simpan lokal saat halaman disembunyikan / ditutup.
  useEffect(() => {
    if (!activeSession) return;
    let stop = false; let timer: any;
    const loop = async () => {
      if (stop) return;
      await heartbeat();
      timer = setTimeout(loop, (pausedRef.current ? CBT_HEARTBEAT_PAUSED_MS : CBT_HEARTBEAT_MS) + Math.random() * CBT_HEARTBEAT_JITTER_MS);
    };
    timer = setTimeout(loop, 3000 + Math.random() * 5000);
    const onHide = () => { persistLocalNow(); if (document.hidden) heartbeat(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', persistLocalNow);
    const onUnload = (e: BeforeUnloadEvent) => { persistLocalNow(); e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    // tanda "tab ini yang aktif" agar ujian tidak dibuka ganda di tab lain
    const lockTimer = setInterval(() => tryAcquireTabLock(activeSession.id, tabIdRef.current), 2000);
    return () => {
      stop = true; clearTimeout(timer); clearInterval(lockTimer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', persistLocalNow);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [activeSession?.id, heartbeat, persistLocalNow]);

  // ---------- ANTI CURANG ----------
  const handleViolation = useCallback((type: string, detail: string) => {
    const exam = examRef.current; const sess = sessionRef.current;
    if (!exam?.anti_cheat_enabled || !sess || submittingRef.current) return;
    const rec = { type, detail: detail || null, at: Date.now() };
    localRef.current.pendingViolations.push(rec);
    sendViolation(rec).then((ok) => {
      if (ok) localRef.current.pendingViolations = localRef.current.pendingViolations.filter((r) => r !== rec);
      persistLocalNow();
    });
    const nv = violationsRef.current + 1;
    violationsRef.current = nv; setViolations(nv);
    persistLocalNow();
    const max = exam.max_violations || 3;
    fireAlarm(nv >= max); // getar + alarm di perangkat siswa
    if (document.hidden) alarmPendingRef.current = true; // getar tidak jalan saat aplikasi di latar belakang
    if (nv >= max) {
      setWarningOpen(`Pelanggaran terdeteksi (${violationLabel(type)}). Anda telah ${nv} kali melanggar; tercatat dan terlihat oleh pengawas. Ujian diakhiri otomatis dan jawaban dikirim.`);
      setTimeout(() => handleSubmitExam(), 2000);
    } else {
      setWarningOpen(
        `⚠ Pelanggaran terdeteksi: ${violationLabel(type)}. Tercatat dan terlihat oleh pengawas. ${nv} dari ${max} kesempatan sudah terpakai. `
        + (nv === max - 1
          ? 'Ini peringatan terakhir: satu pelanggaran lagi, ujian Anda langsung diakhiri.'
          : `Pada pelanggaran ke-${max}, ujian otomatis diakhiri.`),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSubmitExam, persistLocalNow]);

  // Siswa kembali ke halaman setelah melanggar saat di luar: getar/alarm diulang agar peringatan tidak terlewat
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && alarmPendingRef.current) { alarmPendingRef.current = false; fireAlarm(false); }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); stopAlarm(); };
  }, []);

  // Mode fokus selama mengerjakan soal: tanpa menu samping/logout/kembali/popup umum, layar tetap menyala, tombol kembali browser diredam
  const inExam = !!activeSession;
  useEffect(() => {
    if (!inExam) return;
    setExamFocus(true);
    const url = window.location.href;
    try { window.history.pushState({ cbtLock: true }, '', url); } catch { /* abaikan */ }
    const onPop = () => { try { window.history.pushState({ cbtLock: true }, '', url); } catch { /* abaikan */ } };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); setExamFocus(false); };
  }, [inExam]);
  useScreenWakeLock(inExam);

  const antiCheatOn = !!activeExam?.anti_cheat_enabled && !!activeSession && !paused && !submitting;
  useCbtAntiCheat({ enabled: antiCheatOn, onViolation: handleViolation });

  // Masuk layar penuh: perlu klik pengguna. Jika belum layar penuh saat ujian mulai, minta lewat tombol.
  useEffect(() => {
    if (!activeExam?.anti_cheat_enabled || !activeSession) { setNeedFullscreen(false); return; }
    setNeedFullscreen(!!document.fullscreenEnabled && !document.fullscreenElement);
  }, [activeExam?.anti_cheat_enabled, activeSession?.id]);

  /** Dipanggil langsung dari klik tombol Mulai/Lanjutkan (agar browser mengizinkan layar penuh). */
  const enterFullscreenFor = (exam: any) => {
    if (exam?.anti_cheat_enabled && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  // ---------- mulai / lanjutkan: token -> unduh semua soal ke perangkat -> ujian dimulai ----------
  const loadAndStart = async (ctx: { exam: any; token: string | null; session: any; pubExam: any }) => {
    const { session, pubExam } = ctx;
    const onProgress = (p: PrefetchProgress) => setPrep((s) => ({ ...s, open: true, error: null, percent: p.percent, label: p.label, imagesDone: p.imagesDone, imagesTotal: p.imagesTotal }));
    if (!tryAcquireTabLock(session.id, tabIdRef.current)) {
      throw new Error('Ujian ini sedang terbuka di tab/jendela lain pada perangkat ini. Tutup tab lainnya lalu coba lagi.');
    }
    // soal yang sudah ada di perangkat (melanjutkan ujian) tidak diunduh ulang
    let paper: StoredPaper | null = await loadPaper(session.id);
    let serverAnswers: Record<string, string> = {}; let serverEssays: Record<string, string> = {};
    let serverStatus: string = session.status; let serverLeft: number = session.time_remaining_seconds ?? pubExam.duration_minutes * 60;
    if (paper) {
      onProgress({ phase: 'done', percent: 100, label: 'Soal ditemukan di perangkat', imagesDone: 0, imagesTotal: 0 });
    } else {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Perangkat sedang offline. Sambungkan internet untuk mengunduh soal.');
      const res = await prefetchPaper(session.id, {
        onProgress,
        fetchPaper: async () => {
          const { data, error } = await (supabase as any).rpc('cbt_exam_paper', { p_session_id: session.id });
          if (error) throw error;
          return data;
        },
      });
      paper = res.paper;
      serverAnswers = (res.raw as any).answers || {}; serverEssays = (res.raw as any).essays || {};
      serverStatus = (res.raw as any).status ?? serverStatus;
      serverLeft = (res.raw as any).time_remaining_seconds ?? serverLeft;
    }
    // jawaban yang tersimpan di perangkat lebih baru daripada di server
    const local = loadProgress(userId, session.id);
    const mergedA = { ...serverAnswers, ...(local?.answers || {}) };
    const mergedE = { ...serverEssays, ...(local?.essays || {}) };
    let vCount = local?.violations || 0;
    if (pubExam.anti_cheat_enabled) {
      try {
        const { count } = await supabase.from('cbt_session_violations').select('id', { count: 'exact', head: true }).eq('session_id', session.id);
        vCount = Math.max(vCount, count || 0);
      } catch { /* pakai hitungan lokal */ }
    }
    let qs: any[] = paper.questions || [];
    if (pubExam.shuffle_questions) qs = seededShuffle(qs, session.id);
    const left = resumeTimeLeft(serverLeft, local);

    const { map, revoke } = makeImageUrlMap(paper);
    revokeImagesRef.current?.(); revokeImagesRef.current = revoke;
    sessionRef.current = session; examRef.current = pubExam;
    localRef.current = { ...(local || emptyProgress()), answers: mergedA, essays: mergedE, violations: vCount };
    answersRef.current = mergedA; essaysRef.current = mergedE; violationsRef.current = vCount;
    timeLeftRef.current = left; deadlineRef.current = createDeadline(left);
    persistLocalNow();
    setImageMap(map); setOrderedQuestions(qs); questionsRef.current = qs;
    setAnswers(mergedA); setEssayAnswers(mergedE);
    setPaused(serverStatus === 'paused');
    // ujian baru (bukan melanjutkan): timer belum jalan sampai siswa mengetik pernyataan kejujuran
    const gate = needPledgeRef.current && !local;
    setHonestyText(''); setPledgeGate(gate);
    setActiveSession(session); setActiveExam(pubExam);
    setTimeLeft(left); setCurrentIdx(0); setTokenInputOpen(false); setTokenInput(''); setViolations(vCount);
    setPrep(PREP_CLOSED);
    prepCtxRef.current = null;
    queryClient.invalidateQueries({ queryKey: ['cbt-student-overview'] });
    toast.success(paper.failedImages.length ? `Ujian dimulai. ${paper.failedImages.length} gambar dimuat dari tautan asli.` : 'Ujian dimulai!');
  };

  /** Hitung mundur acak sebelum unduh soal; sisa detik tampil di tombol "Unduh Soal" pada dialog. */
  const waitBeforeDownload = async (sec: number) => {
    if (sec <= 0) return;
    setPrep((s) => ({ ...s, open: true, error: null, canRetry: false, percent: 0, label: 'Bersiap memulai', waitLeft: sec, waitTotal: sec }));
    await waitWithCountdown(sec * 1000, (left) => setPrep((s) => ({ ...s, waitLeft: left })));
    setPrep((s) => ({ ...s, waitLeft: 0, waitTotal: 0, percent: 2, label: 'Mulai mengunduh…' }));
  };

  const beginExam = async (exam: any, token: string | null, opts?: { noDelay?: boolean; pledge?: boolean }) => {
    if (beginningRef.current) return;
    beginningRef.current = true;
    primeAlarm(); // dari klik siswa: izinkan alarm pelanggaran berbunyi nanti
    if (opts?.pledge !== undefined) needPledgeRef.current = opts.pledge; // Mulai baru = minta pernyataan; Lanjutkan = tidak
    const run = ++beginRunRef.current;
    startArgsRef.current = { exam, token };
    enterFullscreenFor(exam);
    setPrep({ ...PREP_CLOSED, open: true, percent: 2, label: 'Menyiapkan ujian…', examTitle: exam.title });
    let ctx: { exam: any; token: string | null; session: any; pubExam: any } | null = null;
    try {
      // 1. jeda acak SEBELUM menghubungi server (cbt_start_session, cek token, lalu unduh soal), supaya ratusan siswa
      //    yang menekan Mulai bersamaan tersebar. Dilewati bila ini melanjutkan ujian dan soalnya sudah ada di perangkat.
      if (!opts?.noDelay) {
        const resumable = sessionsForExam(exam.id).find((x: any) => x.status === 'in_progress' || x.status === 'paused');
        const hasLocalPaper = resumable ? !!(await loadPaper(resumable.id).catch(() => null)) : false;
        if (!hasLocalPaper) await waitBeforeDownload(randomDelaySeconds(CBT_DOWNLOAD_DELAY));
        if (beginRunRef.current !== run) return; // dibatalkan siswa saat antre
        setPrep((st) => ({ ...st, open: true, percent: 2, label: token !== null || exam.require_token ? 'Memeriksa token…' : 'Menyiapkan ujian…' }));
      }
      // 2. token & batas percobaan diperiksa di server (satu panggilan)
      const { data, error } = await (supabase as any).rpc('cbt_start_session', { p_exam_id: exam.id, p_token: token });
      if (error) { setPrep(PREP_CLOSED); exitFullscreen(); toast.error(error.message); return; }
      const { session, exam: pubExam } = data as { session: any; exam: any };
      ctx = { exam, token, session, pubExam };
      prepCtxRef.current = ctx;
      // 3. unduh semua soal ke perangkat, lalu mulai (tanpa jeda lagi: jeda sudah dilakukan di langkah 1)
      await loadAndStart(ctx);
    } catch (e: any) {
      if (beginRunRef.current === run) setPrep((s) => ({ ...s, open: true, error: e?.message || 'Gagal mengunduh soal', canRetry: true }));
    } finally { if (beginRunRef.current === run) beginningRef.current = false; }
  };

  const retryPrep = async () => {
    if (beginningRef.current) return;
    const ctx = prepCtxRef.current;
    // gagal sebelum sesi terbentuk (jaringan putus saat memulai): ulangi dari awal tanpa jeda lagi
    if (!ctx) {
      const a = startArgsRef.current;
      if (a) beginExam(a.exam, a.token, { noDelay: true });
      return;
    }
    beginningRef.current = true;
    const run = ++beginRunRef.current;
    setPrep((s) => ({ ...s, error: null, percent: 2, label: 'Mencoba lagi…' }));
    try {
      if (!(await loadPaper(ctx.session.id).catch(() => null))) await waitBeforeDownload(randomDelaySeconds(CBT_DOWNLOAD_RETRY_DELAY));
      if (beginRunRef.current !== run) return;
      await loadAndStart(ctx);
    }
    catch (e: any) { if (beginRunRef.current === run) setPrep((s) => ({ ...s, error: e?.message || 'Gagal mengunduh soal', canRetry: true })); }
    finally { if (beginRunRef.current === run) beginningRef.current = false; }
  };
  /** Siswa menekan Batal saat antre: hentikan putaran ini (belum ada panggilan ke server bila masih di antrean awal). */
  const cancelPrepWait = () => { beginRunRef.current++; beginningRef.current = false; closePrep(); };
  const closePrep = () => { setPrep(PREP_CLOSED); prepCtxRef.current = null; exitFullscreen(); queryClient.invalidateQueries({ queryKey: ['cbt-student-overview'] }); };

  const formatTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const sessionsForExam = (id: string) => existingSessions.filter((s: any) => s.exam_id === id);

  // Dialog progres pengumpulan jawaban (tampil di layar ujian)
  const submitAnswered = orderedQuestions.filter((q: any) => (q.question_type === 'essay' ? !!essayAnswers[q.id] : !!answers[q.id])).length;
  const submitPct = submitState.phase === 'wait'
    ? 5 + (submitState.waitTotal > 0 ? (1 - submitState.waitLeft / submitState.waitTotal) * 25 : 0)
    : 60;
  const submitDialog = (
    <Dialog open={submitState.open}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> {submitState.timeout ? 'Waktu habis, mengumpulkan jawaban' : 'Mengumpulkan jawaban'}</DialogTitle>
          <DialogDescription className="pt-1">{submitAnswered} dari {orderedQuestions.length} soal terjawab. Jawaban Anda tersimpan aman di perangkat ini.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Progress value={submitPct} className="h-3" />
          <ol className="space-y-2.5 text-sm">
            <SubmitStep
              state={submitState.phase === 'wait' ? 'active' : 'done'}
              label="Menyiapkan pengumpulan"
              detail={undefined} />
            <SubmitStep
              state={submitState.phase === 'wait' ? 'todo' : submitState.phase === 'error' ? 'error' : 'active'}
              label={submitState.phase === 'error' ? 'Jawaban belum terkirim' : 'Mengirim jawaban ke server'}
              detail={submitState.phase === 'send' ? `Percobaan ${Math.max(1, submitState.attempt)} dari ${submitState.maxAttempts}`
                : submitState.phase === 'retry' ? `Koneksi bermasalah, mencoba lagi dalam ${submitState.retryLeft} dtk (percobaan ${submitState.attempt} dari ${submitState.maxAttempts})`
                : submitState.phase === 'error' ? 'Periksa koneksi internet, lalu tekan Kirim Lagi.' : undefined} />
            <SubmitStep state="todo" label="Nilai dihitung dan ujian selesai" />
          </ol>
          {submitState.phase === 'wait' && <AdviceLine />}
          {(submitState.phase === 'retry' || submitState.phase === 'error') && submitState.error && (
            <p className="text-[11px] text-destructive break-words">{submitState.error}</p>
          )}
          {submitState.phase === 'error' && (
            <p className="text-xs rounded-md border bg-muted/50 p-2.5 text-muted-foreground">
              Bila internet tetap bermasalah, tekan <b>Unduh file jawaban</b> lalu serahkan berkas tersebut kepada pengawas/guru agar jawaban Anda tidak hilang.
            </p>
          )}
        </div>
        {submitState.phase === 'error' && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={downloadAnswersFile}><Download className="h-4 w-4 mr-1.5" /> Unduh file jawaban</Button>
            {!submitState.timeout && (
              <Button variant="outline" onClick={() => { setSubmitState(SUBMIT_CLOSED); setSubmitting(false); }}>Kembali ke soal</Button>
            )}
            <Button onClick={() => handleSubmitExam(submitState.timeout, { noDelay: true })}>Kirim Lagi</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );

  // ===== ACTIVE EXAM VIEW =====
  if (activeSession && orderedQuestions.length > 0) {
    const currentQ = orderedQuestions[currentIdx];
    const isEssay = currentQ?.question_type === 'essay';
    const answeredCount = orderedQuestions.filter((q: any) => q.question_type === 'essay' ? !!essayAnswers[q.id] : !!answers[q.id]).length;
    const progress = (answeredCount / orderedQuestions.length) * 100;
    const allAnswered = answeredCount === orderedQuestions.length;
    const timeWarn = timeLeft < 300;

    const antiCheat = !!activeExam?.anti_cheat_enabled;
    return (
      <DashboardLayout>
        {antiCheat && <style>{'@media print { body * { display: none !important; } }'}</style>}
        <div className={`space-y-3 max-w-3xl mx-auto px-2 ${antiCheat ? 'select-none' : ''} ${pledgeGate ? 'invisible' : ''}`} style={antiCheat ? ({ WebkitTouchCallout: 'none' } as CSSProperties) : undefined}>
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
              {timeLeft > FINISH_VISIBLE_SECONDS ? (
                <span className="text-[11px] text-muted-foreground max-w-[150px] text-right leading-tight">Tombol Selesai muncul di 5 menit terakhir</span>
              ) : allAnswered ? (
                <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={submitting}
                  onClick={() => { setFinishText(''); setFinishOpen(true); }}>
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
              <p>Mode Anti Curang aktif. Setiap pelanggaran langsung terdeteksi: pindah tab/aplikasi, membuka layar belah atau jendela lain, keluar layar penuh, menyalin/menempel, mencetak, atau menangkap layar. Pelanggaran dicatat, terlihat oleh pengawas, dan membunyikan alarm serta getar di HP. Jika melanggar {activeExam.max_violations || 3} kali, ujian otomatis diakhiri.</p>
            </div>
          )}

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <HardDriveDownload className="h-3 w-3" /> Soal dan jawaban tersimpan di perangkat ini; jawaban dikirim ke server saat Anda menekan Selesai.
          </p>

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
              <RichTextDisplay html={rewriteImages(currentQ.question_text, imageMap)} className="text-base" />
              {isEssay ? (
                <div className="space-y-2">
                  <Textarea ref={essayRef} dir="auto" rows={8} className="select-text" placeholder="Tulis jawaban Anda..." value={essayAnswers[currentQ.id] || ''}
                    onChange={e => setEssay(currentQ.id, e.target.value)} />
                  <SymbolPalette onInsert={insertIntoEssay} />
                </div>
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
                        <span className="flex-1 text-sm min-w-0 flex items-start gap-1"><strong>{opt}.</strong><span className="flex-1 min-w-0"><OptionDisplay value={val} imageMap={imageMap} /></span></span>
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

        {/* Mode anti curang: wajib layar penuh */}
        <Dialog open={needFullscreen && !paused}>
          <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Maximize className="h-5 w-5" /> Masuk layar penuh</DialogTitle>
              <DialogDescription className="pt-2">Ujian ini memakai mode anti curang. Klik tombol di bawah untuk masuk layar penuh, lalu kerjakan ujian tanpa membuka aplikasi lain atau layar belah. Setiap pelanggaran terdeteksi, dicatat, dan membunyikan alarm.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => { document.documentElement.requestFullscreen?.().catch(() => {}); setNeedFullscreen(false); }}>Masuk Layar Penuh</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Pernyataan kejujuran: muncul setelah layar penuh/anti curang aktif; soal disembunyikan dan timer belum berjalan */}
        <Dialog open={pledgeGate && !needFullscreen && !paused}>
          <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Pernyataan Kejujuran</DialogTitle>
              <DialogDescription>Soal sudah siap. Timer ujian berjalan setelah Anda mengetik pernyataan berikut.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
              <label htmlFor="cbt-honesty" className="text-sm font-medium">Ketik pernyataan berikut untuk memulai:</label>
              <p className="text-sm font-semibold select-none">“{CBT_PLEDGE_HONEST}”</p>
              <div className="relative">
                <Input id="cbt-honesty" value={honestyText} onChange={(e) => setHonestyText(e.target.value)}
                  placeholder="Ketik pernyataan di sini" className="pr-9" autoFocus {...typedOnlyInputProps} />
                {matchesPhrase(honestyText, CBT_PLEDGE_HONEST) && <CheckCircle className="h-4 w-4 text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2" />}
              </div>
              <p className="text-[11px] text-muted-foreground">Harus diketik sendiri (tidak bisa ditempel). Huruf besar/kecil tidak berpengaruh.</p>
            </div>
            <DialogFooter>
              <Button disabled={!matchesPhrase(honestyText, CBT_PLEDGE_HONEST)}
                onClick={() => { deadlineRef.current = createDeadline(timeLeftRef.current); setPledgeGate(false); setHonestyText(''); }}>
                Mulai Mengerjakan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
        <Dialog open={!!warningOpen} onOpenChange={() => { stopAlarm(); setWarningOpen(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Peringatan Anti Curang</DialogTitle>
              <DialogDescription className="pt-2">{warningOpen}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => {
                stopAlarm();
                setWarningOpen(null);
                if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
              }}>Saya Mengerti</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {submitDialog}
        {/* Konfirmasi kirim jawaban: siswa mengetik pernyataan (validasi di perangkat saja) */}
        <Dialog open={finishOpen} onOpenChange={(o) => { setFinishOpen(o); if (!o) setFinishText(''); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Kirim jawaban?</DialogTitle>
              <DialogDescription>Semua soal sudah dijawab. Setelah dikirim, ujian selesai dan jawaban tidak bisa diubah.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <label htmlFor="cbt-finish-confirm" className="text-sm font-medium">Ketik pernyataan berikut untuk mengirim:</label>
              <p className="text-sm font-semibold select-none">“{CBT_PLEDGE_SUBMIT}”</p>
              <div className="relative">
                <Input id="cbt-finish-confirm" value={finishText} onChange={(e) => setFinishText(e.target.value)}
                  placeholder="Ketik pernyataan di sini" className="pr-9" {...typedOnlyInputProps} />
                {matchesPhrase(finishText, CBT_PLEDGE_SUBMIT) && <CheckCircle className="h-4 w-4 text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2" />}
              </div>
              <p className="text-[11px] text-muted-foreground">Harus diketik sendiri (tidak bisa ditempel). Huruf besar/kecil tidak berpengaruh.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setFinishOpen(false); setFinishText(''); }}>Kembali ke soal</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!matchesPhrase(finishText, CBT_PLEDGE_SUBMIT) || submitting}
                onClick={() => { setFinishOpen(false); setFinishText(''); handleSubmitExam(); }}>
                Kirim Jawaban
              </Button>
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
            <Card><CardContent className="py-12 flex justify-center">
              <CalmWait className="w-full max-w-md" title="Menyiapkan halaman ujian…" left={overviewWait} total={overviewWaitTotal} />
            </CardContent></Card>
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
                // Nilai remidial dibatasi maksimal KKM (sama seperti yang masuk ke menu Nilai)
                const effScore = (s: any) => (s.is_remedial ? Math.min(Number(s.score), Number(exam.pass_score)) : Number(s.score));
                const lastCompleted = scored.length ? scored.reduce((a: any, b: any) => (effScore(b) > effScore(a) ? b : a)) : completed[0];
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
                        {exam.remedial && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-medium">Remidial s.d. {formatWibDateTime(exam.remedial_until)}</span>}
                        {exam.require_token && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 flex items-center gap-1"><KeyRound className="h-2.5 w-2.5" />Token</span>}
                        {exam.anti_cheat_enabled && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 flex items-center gap-1"><Shield className="h-2.5 w-2.5" />Anti-cheat</span>}
                      </div>
                      {lastCompleted && exam.show_result_to_student && lastCompleted.grading_status !== 'pending_essay' && (
                        <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                          <span className="text-xs text-muted-foreground">Nilai Terbaik</span>
                          <span className={`font-bold ${effScore(lastCompleted) >= exam.pass_score ? 'text-emerald-600' : 'text-destructive'}`}>{effScore(lastCompleted).toFixed(1)}</span>
                        </div>
                      )}
                      {lastCompleted?.grading_status === 'pending_essay' && (
                        <div className="p-1.5 rounded bg-amber-50 dark:bg-amber-950/30 text-[11px] text-center">Menunggu koreksi essay</div>
                      )}
                      {inProgress && exam.allow_resume !== false && (
                        <Button className="w-full gap-1" size="sm" variant="secondary" onClick={() => beginExam(exam, null, { pledge: false })} disabled={prep.open}>
                          <RotateCcw className="h-3.5 w-3.5" /> Lanjutkan
                        </Button>
                      )}
                      {canStart && (
                        <Button className="w-full gap-1" size="sm" onClick={() => {
                          if (exam.require_token) { setPendingExam(exam); setTokenInput(''); setTokenInputOpen(true); }
                          else if (confirm('Mulai ujian? Semua soal akan diunduh ke perangkat ini lebih dulu. Setelah itu Anda diminta mengetik pernyataan kejujuran, lalu timer berjalan.')) beginExam(exam, null, { pledge: true });
                        }}>
                          <Play className="h-3.5 w-3.5" /> {exam.remedial ? `Mulai Remidial (${attemptsUsed + 1}/${exam.max_attempts})` : attemptsUsed > 0 ? `Coba Lagi (${attemptsUsed + 1}/${exam.max_attempts})` : 'Mulai Ujian'}
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
                        <p className="text-sm font-medium">Percobaan #{s.attempt_number || 1}{s.is_remedial && <Badge variant="outline" className="ml-2 text-[10px] border-amber-500 text-amber-600">Remidial</Badge>}</p>
                        <p className="text-xs text-muted-foreground">{formatWibDateTime(s.created_at)}</p>
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
              <DialogDescription>Token diberikan oleh guru pengawas. {pendingExam?.title}</DialogDescription>
            </DialogHeader>
            <Input value={tokenInput} onChange={e => setTokenInput(e.target.value.toUpperCase())} placeholder="Token (6 karakter)" className="font-mono text-center text-lg" maxLength={12} autoFocus />
            <p className="text-[11px] text-muted-foreground">
              Setelah menekan Mulai, soal disiapkan beberapa saat lalu diunduh ke perangkat ini. Selanjutnya kamu diminta mengetik pernyataan kejujuran sebelum timer berjalan. Kerjakan dengan tenang dan jujur.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setTokenInputOpen(false); setTokenInput(''); }}>Batal</Button>
              <Button onClick={() => beginExam(pendingExam, tokenInput.trim() || null, { pledge: true })} disabled={!tokenInput.trim() || prep.open}>Mulai</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Unduh soal ke perangkat sebelum ujian dimulai */}
        <Dialog open={prep.open}>
          <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><HardDriveDownload className="h-5 w-5" /> {prep.error ? 'Soal belum siap' : prep.waitLeft > 0 ? 'Bersiap memulai ujian' : 'Mengunduh soal ke perangkat'}</DialogTitle>
              <DialogDescription className="pt-1">{prep.examTitle}</DialogDescription>
            </DialogHeader>
            {prep.error ? (
              <p className="text-sm text-destructive">{prep.error}</p>
            ) : prep.waitLeft > 0 ? (
              <div className="space-y-4">
                <CalmWait left={prep.waitLeft} total={prep.waitTotal} />
                <Button className="w-full" variant="ghost" size="sm" onClick={cancelPrepWait}>Batal</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Progress value={prep.percent} className="h-3" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{prep.label}</span>
                  <span className="font-mono tabular-nums">{prep.percent}%</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Timer ujian baru berjalan setelah semua soal selesai diunduh. Jangan tutup halaman ini.</p>
              </div>
            )}
            {prep.error && (
              <DialogFooter>
                <Button variant="outline" onClick={closePrep}>Tutup</Button>
                {prep.canRetry && <Button onClick={retryPrep}>Coba Lagi</Button>}
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
