import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle2, Clock, ScanLine, User, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AppFooter } from "@/components/AppFooter";

interface TapResult {
  ok: boolean;
  status?: "hadir" | "terlambat" | "already";
  prayer?: string;
  time?: string;
  message: string;
  student?: { id: string; full_name: string; nis: string | null; class_name: string | null; photo_url: string | null };
}

let audioCtx: AudioContext | null = null;
const beep = (ctx: AudioContext, freq: number, start: number, dur: number, gain = 0.14) => {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.type = "sine"; osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(g).connect(ctx.destination); osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur + 0.02);
};
const playTone = (ok: boolean) => {
  try {
    audioCtx = audioCtx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (ok) { beep(audioCtx, 880, 0, 0.14); beep(audioCtx, 1175, 0.16, 0.2); }
    else { beep(audioCtx, 300, 0, 0.2, 0.18); beep(audioCtx, 200, 0.22, 0.34, 0.18); }
  } catch { /* audio tidak didukung */ }
};

const fmtTime = (d: Date) => d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const fmtDate = (d: Date) => d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Halaman tap kartu RFID untuk absensi salat (publik, dipasang di dekat tempat salat). */
export default function PrayerTap() {
  const [now, setNow] = useState(new Date());
  const [buffer, setBuffer] = useState("");
  const [result, setResult] = useState<TapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimer = useRef<number | null>(null);

  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(t); }, []);

  const { data: branding } = useQuery({
    queryKey: ["prayer-tap-branding"],
    queryFn: async () => (await supabase.rpc("get_school_settings_for_letterhead")).data as any,
    staleTime: 10 * 60 * 1000,
  });
  const { data: schedule = [] } = useQuery({
    queryKey: ["prayer-rfid-schedule"],
    queryFn: async () => ((await (supabase as any).rpc("prayer_rfid_schedule")).data ?? []) as { name: string; start_time: string; end_time: string }[],
    refetchInterval: 5 * 60 * 1000,
  });

  const submit = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value || loading) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("prayer_rfid_tap", { p_uid: value });
      const res: TapResult = !error && data ? data : { ok: false, message: "Gagal terhubung ke server. Coba tap ulang kartu." };
      playTone(res.ok && res.status !== "already");
      setResult(res);
    } catch {
      setResult({ ok: false, message: "Terjadi kesalahan. Coba tap ulang kartu." });
      playTone(false);
    } finally {
      setLoading(false); setBuffer("");
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(() => setResult(null), 6000);
      inputRef.current?.focus();
    }
  }, [loading]);

  useEffect(() => {
    if (!buffer.trim() || loading) return;
    const t = window.setTimeout(() => submit(buffer), 400);
    return () => window.clearTimeout(t);
  }, [buffer, loading, submit]);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    const t = window.setInterval(focus, 1500);
    window.addEventListener("click", focus);
    return () => { window.clearInterval(t); window.removeEventListener("click", focus); };
  }, []);

  const schoolName = branding?.school_name || "Sekolah";
  const logo = branding?.logo_url || branding?.school_logo_url;
  const tone = !result ? "idle" : !result.ok ? "error" : result.status === "terlambat" || result.status === "already" ? "warn" : "success";
  const ring: Record<string, string> = { idle: "border-primary/20", success: "border-emerald-500/50", warn: "border-amber-500/50", error: "border-destructive/50" };

  return (
    <div className="h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>
      <input ref={inputRef} value={buffer} onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(buffer); } }}
        className="absolute opacity-0 h-px w-px -z-10" autoComplete="off" aria-label="Input kartu RFID" />

      <main className="relative flex-1 min-h-0 container mx-auto px-4 py-3 flex flex-col justify-center gap-3 overflow-hidden">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="flex items-center justify-center gap-4">
            {logo && <img src={logo} alt={`Logo ${schoolName}`} className="h-12 w-12 md:h-20 md:w-20 object-contain drop-shadow" />}
            <div>
              <h1 className="text-xl md:text-3xl font-bold bg-gradient-to-r from-primary to-emerald-500 bg-clip-text text-transparent">Absensi Salat</h1>
              <p className="text-sm md:text-base text-muted-foreground mt-1">{schoolName}</p>
            </div>
          </div>
          <div className="mt-1 rounded-3xl border border-border/60 bg-card/70 backdrop-blur px-6 md:px-12 py-2.5 md:py-4 shadow-lg">
            <p className="text-4xl md:text-7xl font-mono font-bold tracking-tight tabular-nums leading-none">{fmtTime(now)}</p>
            <p className="text-sm md:text-xl font-medium text-muted-foreground mt-1">{fmtDate(now)}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-1">
            {schedule.length === 0
              ? <Badge variant="outline">Tidak ada jadwal salat hari ini</Badge>
              : schedule.map((s) => <Badge key={s.name} variant="outline" className="gap-1"><Clock className="h-3 w-3" />{s.name} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</Badge>)}
          </div>
        </div>

        <div className="mt-2 max-w-2xl mx-auto w-full">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card className="border-2 border-primary/30 bg-card/80"><CardContent className="py-8 flex flex-col items-center gap-3">
                  <ScanLine className="h-14 w-14 text-primary animate-pulse" /><p className="font-medium">Memproses kartu…</p>
                </CardContent></Card>
              </motion.div>
            ) : result ? (
              <motion.div key={`${result.student?.id ?? "err"}-${result.time ?? ""}`} initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className={`border-2 ${ring[tone]} bg-card/85 shadow-xl`}>
                  <CardContent className="p-4 md:p-6 flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative">
                      <div className={`h-24 w-24 md:h-32 md:w-32 rounded-2xl overflow-hidden border-2 ${ring[tone]} bg-muted flex items-center justify-center`}>
                        {result.student?.photo_url ? <img src={result.student.photo_url} alt={result.student.full_name} className="h-full w-full object-cover" /> : <User className="h-14 w-14 text-muted-foreground/50" />}
                      </div>
                      <div className="absolute -bottom-3 -right-3 rounded-full bg-card p-1 shadow">
                        {tone === "success" ? <CheckCircle2 className="h-8 w-8 text-emerald-500" /> : tone === "warn" ? <AlertTriangle className="h-8 w-8 text-amber-500" /> : <XCircle className="h-8 w-8 text-destructive" />}
                      </div>
                    </div>
                    <div className="flex-1 text-center sm:text-left min-w-0">
                      <h2 className="text-xl md:text-2xl font-bold truncate">{result.student?.full_name ?? "Kartu Tidak Dikenali"}</h2>
                      {result.student && <p className="text-sm text-muted-foreground mt-0.5">{result.student.class_name ? `Kelas ${result.student.class_name} · ` : ""}NIS {result.student.nis ?? "-"}</p>}
                      <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                        {result.prayer && <Badge className="bg-emerald-600 text-white">Salat {result.prayer}</Badge>}
                        {result.status === "terlambat" && <Badge className="bg-amber-500 text-white">Terlambat</Badge>}
                        {result.time && <Badge variant="outline" className="gap-1 font-mono"><Clock className="h-3 w-3" />{result.time}</Badge>}
                      </div>
                      <p className={`mt-3 text-sm font-medium ${tone === "error" ? "text-destructive" : tone === "warn" ? "text-amber-600" : "text-emerald-600"}`}>{result.message}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card className="border-2 border-dashed border-primary/30 bg-card/60"><CardContent className="py-6 md:py-8 flex flex-col items-center gap-3 text-center">
                  <div className="relative">
                    <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                    <div className="relative h-16 w-16 md:h-20 md:w-20 rounded-full bg-primary/10 flex items-center justify-center"><ScanLine className="h-8 w-8 md:h-10 md:w-10 text-primary" /></div>
                  </div>
                  <div><p className="text-lg font-semibold">Tempelkan Kartu pada Sensor</p><p className="text-sm text-muted-foreground mt-1">Kehadiran salat akan tercatat otomatis</p></div>
                </CardContent></Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
