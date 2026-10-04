import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AppFooter } from "@/components/AppFooter";
import {
  CheckCircle2, XCircle, Clock, ScanLine, LogIn, LogOut, AlertTriangle, User,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

// ============================================
// KONFIGURASI - Proxy same-origin (HTTPS aman, bebas CORS)
// ============================================
const WA_BOT_URL = "https://pusaka.smpn8ciamis.sch.id/wa-api";

interface TapStudent {
  id: string;
  full_name: string;
  nis: string | null;
  nisn: string | null;
  photo_url: string | null;
  gender: string | null;
  class_name: string | null;
  parent_phone?: string | null;
}

interface TapResult {
  ok: boolean;
  type?: string;
  status?: string;
  time?: string;
  message: string;
  student?: TapStudent;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

let audioCtx: AudioContext | null = null;
const beep = (ctx: AudioContext, freq: number, start: number, dur: number, gain = 0.14) => {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.02);
};
const playTone = (success: boolean) => {
  try {
    audioCtx = audioCtx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (success) {
      beep(audioCtx, 880, 0, 0.14);
      beep(audioCtx, 1318, 0.14, 0.22);
    } else {
      beep(audioCtx, 300, 0, 0.2, 0.18);
      beep(audioCtx, 200, 0.22, 0.34, 0.18);
    }
  } catch {
    /* audio unsupported */
  }
};

const fmtTime = (d: Date) =>
  d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const fmtDate = (d: Date) =>
  d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const RfidTap = () => {
  const [now, setNow] = useState(new Date());
  const [buffer, setBuffer] = useState("");
  const [result, setResult] = useState<TapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimer = useRef<number | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const { data: branding } = useQuery({
    queryKey: ["rfid-branding"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_school_settings_for_letterhead");
      return data as any;
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: settings } = useQuery({
    queryKey: ["rfid-settings-public"],
    queryFn: async () => {
      const { data } = await supabase
        .from("rfid_attendance_settings")
        .select("*")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const faceEnabled = !!(settings as any)?.face_verification_enabled;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camReady, setCamReady] = useState(false);

  useEffect(() => {
    if (!faceEnabled) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        setCamReady(true);
      })
      .catch(() => setCamReady(false));
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [faceEnabled]);

  const captureFace = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = (v.videoHeight / v.videoWidth) * 320;
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }, []);

  // ============================================
  // NOTIFIKASI TELEGRAM (EXISTING)
  // ============================================
  const notifyTelegram = (data: TapResult) => {
    const t = (data as any)?.type;
    const studentId = (data as any)?.student?.id;
    if (!data.ok || !studentId || (t !== "check_in" && t !== "check_out")) return;
    fetch(`${SUPABASE_URL}/functions/v1/telegram-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ student_id: studentId, type: t, status: (data as any)?.status ?? "hadir" }),
    }).catch(() => {});
  };

  // ============================================
  // NOTIFIKASI WHATSAPP (BARU)
  // Bot WA yang mencari nomor ortu (bypass RLS via service role)
  // ============================================
  const notifyWhatsApp = async (data: TapResult) => {
    const t = (data as any)?.type;
    const student = (data as any)?.student;

    if (!data.ok || !student?.id || (t !== "check_in" && t !== "check_out")) return;

    try {
      const res = await fetch(`${WA_BOT_URL}/notify-parent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: student.id,
          type: t,
          status: data.status ?? "hadir",
          time: data.time || fmtTime(new Date()),
          date: fmtDate(new Date()),
        }),
      });
      const result = await res.json().catch(() => null);
      console.log("[WA] Response:", res.status, result);
    } catch (err) {
      console.error("[WA] Gagal mengirim notifikasi:", err);
    }
  };

  const submitUid = useCallback(async (uid: string) => {
    const value = uid.trim();
    if (!value || loading) return;
    setLoading(true);

    const finish = (data: TapResult) => {
      setResult(data);
      playTone(!!data.ok);
      notifyTelegram(data);   // Notifikasi Telegram
      notifyWhatsApp(data);   // Notifikasi WhatsApp ke Orang Tua
    };

    const faceVerified = faceEnabled ? !!captureFace() : false;

    try {
      if (faceEnabled && !faceVerified) {
        finish({ ok: false, message: "Verifikasi wajah gagal. Pastikan wajah terlihat pada kamera lalu tap ulang." });
        return;
      }
      // 1) Primary: database RPC
      const { data: rpcData, error: rpcErr } = await (supabase as any).rpc("rfid_process_tap", {
        p_uid: value,
        p_face_verified: faceVerified,
      });
      if (!rpcErr && rpcData) {
        finish(rpcData as TapResult);
      } else {
        // 2) Fallback: edge function
        const res = await fetch(`${SUPABASE_URL}/functions/v1/rfid-tap`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ uid: value, face_verified: faceVerified }),
        });
        const data = (await res.json().catch(() => null)) as TapResult | null;
        finish(data ?? { ok: false, message: "Gagal terhubung ke server. Coba tap ulang kartu." });
      }
    } catch {
      finish({ ok: false, message: "Terjadi kesalahan. Coba tap ulang kartu." });
    } finally {
      setLoading(false);
      setBuffer("");
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(() => setResult(null), 8000);
      inputRef.current?.focus();
    }
  }, [loading, faceEnabled, captureFace]);

  // Auto-submit for readers that don't send Enter
  useEffect(() => {
    if (!buffer.trim() || loading) return;
    const t = window.setTimeout(() => submitUid(buffer), 400);
    return () => window.clearTimeout(t);
  }, [buffer, loading, submitUid]);

  // Keep the hidden input focused so RFID keyboard-emulation readers always work
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    const t = window.setInterval(focus, 1500);
    window.addEventListener("click", focus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("click", focus);
    };
  }, []);

  const schoolName = branding?.school_name || "Sekolah";
  const logo = branding?.logo_url || branding?.school_logo_url;
  const rightLogo = branding?.right_logo_url;

  const tone = !result
    ? "idle"
    : result.ok
      ? result.status === "terlambat" && result.type === "check_in" ? "warn" : "success"
      : "error";

  const toneRing: Record<string, string> = {
    idle: "border-primary/20",
    success: "border-emerald-500/50",
    warn: "border-amber-500/50",
    error: "border-destructive/50",
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:44px_44px] opacity-[0.15]" />
      </div>

      <input
        ref={inputRef}
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submitUid(buffer);
          }
        }}
        className="absolute opacity-0 h-px w-px -z-10"
        autoComplete="off"
        aria-label="Input kartu RFID"
      />

      <main className="relative flex-1 min-h-0 container mx-auto px-4 py-3 md:py-4 flex flex-col justify-center gap-3 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="flex items-center justify-center gap-4 md:gap-8">
            {logo && (
              <img src={logo} alt={`Logo ${schoolName}`} className="h-12 w-12 md:h-20 md:w-20 object-contain drop-shadow" loading="lazy" />
            )}
            <div>
              <h1 className="text-xl md:text-3xl font-bold bg-gradient-to-r from-primary to-emerald-500 bg-clip-text text-transparent">
                Absensi Digital Nedelcis
              </h1>
              <p className="text-sm md:text-base text-muted-foreground mt-1">{schoolName}</p>
            </div>
            {rightLogo && (
              <img src={rightLogo} alt={`Logo ${schoolName}`} className="h-12 w-12 md:h-20 md:w-20 object-contain drop-shadow" loading="lazy" />
            )}
          </div>
          <div className="mt-1 rounded-3xl border border-border/60 bg-card/70 backdrop-blur px-6 md:px-12 py-2.5 md:py-4 shadow-lg">
            <p className="text-4xl md:text-7xl font-mono font-bold tracking-tight tabular-nums leading-none">{fmtTime(now)}</p>
            <p className="text-sm md:text-xl font-medium text-muted-foreground mt-1">{fmtDate(now)}</p>
          </div>
          {settings && (
            <div className="flex flex-wrap justify-center gap-2 mt-1">
              <Badge variant="outline" className="gap-1">
                <LogIn className="h-3 w-3" /> Masuk {String(settings.check_in_start).slice(0, 5)}–{String(settings.check_in_end).slice(0, 5)}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <LogOut className="h-3 w-3" /> Pulang {String(settings.check_out_start).slice(0, 5)}–{String(settings.check_out_end).slice(0, 5)}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Terlambat &gt; {String(settings.late_after).slice(0, 5)}
              </Badge>
            </div>
          )}
        </div>

        {/* Scanner / Result */}
        <div className="mt-2 max-w-2xl mx-auto w-full">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card className="border-2 border-primary/30 bg-card/80 backdrop-blur">
                  <CardContent className="py-8 flex flex-col items-center gap-3">
                    <ScanLine className="h-14 w-14 text-primary animate-pulse" />
                    <p className="font-medium">Memproses kartu…</p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : result ? (
              <motion.div
                key={`${result.student?.id ?? "err"}-${result.time ?? ""}`}
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25 }}
              >
                <Card className={`border-2 ${toneRing[tone]} bg-card/85 backdrop-blur shadow-xl`}>
                  <CardContent className="p-4 md:p-6">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="relative">
                        <div className={`h-24 w-24 md:h-32 md:w-32 rounded-2xl overflow-hidden border-2 ${toneRing[tone]} bg-muted flex items-center justify-center`}>
                          {result.student?.photo_url ? (
                            <img src={result.student.photo_url} alt={`Foto ${result.student.full_name}`} className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-14 w-14 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="absolute -bottom-3 -right-3 rounded-full bg-card p-1 shadow">
                          {tone === "success" ? (
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                          ) : tone === "warn" ? (
                            <AlertTriangle className="h-8 w-8 text-amber-500" />
                          ) : (
                            <XCircle className="h-8 w-8 text-destructive" />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 text-center sm:text-left min-w-0">
                        {result.student ? (
                          <>
                            <h2 className="text-xl md:text-2xl font-bold truncate">{result.student.full_name}</h2>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {result.student.class_name ? `Kelas ${result.student.class_name} · ` : ""}NIS {result.student.nis ?? "-"}
                            </p>
                          </>
                        ) : (
                          <h2 className="text-xl md:text-2xl font-bold">Kartu Tidak Dikenali</h2>
                        )}

                        <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                          {result.type === "check_in" && <Badge className="bg-emerald-500 text-white">Absen Masuk</Badge>}
                          {result.type === "check_out" && <Badge className="bg-sky-500 text-white">Absen Pulang</Badge>}
                          {result.status === "terlambat" && <Badge className="bg-amber-500 text-white">Terlambat</Badge>}
                          {result.time && (
                            <Badge variant="outline" className="gap-1 font-mono">
                              <Clock className="h-3 w-3" /> {result.time}
                            </Badge>
                          )}
                        </div>

                        <p className={`mt-3 text-sm font-medium ${tone === "error" ? "text-destructive" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {result.message}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card className="border-2 border-dashed border-primary/30 bg-card/60 backdrop-blur">
                  <CardContent className="py-6 md:py-8 flex flex-col items-center gap-3 text-center">
                    <div className="relative">
                      <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                      <div className="relative h-16 w-16 md:h-20 md:w-20 rounded-full bg-primary/10 flex items-center justify-center">
                        <ScanLine className="h-8 w-8 md:h-10 md:w-10 text-primary" />
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">Tempelkan Kartu pada Sensor</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Identitas dan kehadiran akan tercatat otomatis
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {faceEnabled && (
            <Card className="mt-3 border-2 border-primary/20 bg-card/70 backdrop-blur">
              <CardContent className="p-4 flex items-center gap-4">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="h-20 w-28 rounded-xl object-cover bg-muted border border-border/60"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Verifikasi Wajah Aktif</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {camReady
                      ? "Posisikan wajah di depan kamera sebelum menempelkan kartu."
                      : "Kamera belum aktif — izinkan akses kamera pada browser."}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-center text-xs text-muted-foreground mt-2">
            Layar ini otomatis siap menerima tap berikutnya.
          </p>
        </div>
      </main>

      <AppFooter />
    </div>
  );
};

export default RfidTap;