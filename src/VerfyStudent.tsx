import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  School, ShieldX, BadgeCheck, User, Hash, GraduationCap,
  MapPin, Phone, Fingerprint, Sparkles, CalendarDays, CreditCard,
} from "lucide-react";

// ===== SAFE HELPERS (tidak akan pernah throw) =====
const safeFormatDate = (value?: string | null) => {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  } catch { return "-"; }
};

const safeFormatNow = () => {
  try { return new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }); }
  catch { try { return new Date().toLocaleString(); } catch { return "-"; } }
};

const toTitleCase = (name?: string | null) => {
  const s = String(name || "");
  return s.toLowerCase().split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
};

// ===== ErrorBoundary: cegah blank putih selamanya =====
class Boundary extends React.Component<any, any> {
  constructor(props: any) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err: any) { return { err }; }
  componentDidCatch(err: any) { console.error("VerifyStudent crash:", err); }
  render() {
    if (this.state.err) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border bg-card p-6 text-center space-y-2 shadow-lg">
            <ShieldX className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="font-bold text-destructive">Terjadi Kesalahan</h1>
            <p className="text-sm text-muted-foreground break-words">
              {String(this.state.err?.message || this.state.err)}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ===== Baris info (defensif terhadap icon undefined) =====
const InfoRow = ({ icon: Icon, label, value }: any) => (
  <div className="flex items-start gap-3 rounded-xl border bg-muted/40 px-3 py-2.5">
    <div className="rounded-lg bg-primary/10 p-2 shrink-0">
      {typeof Icon === "function" ? <Icon className="h-4 w-4 text-primary" /> : <Hash className="h-4 w-4 text-primary" />}
    </div>
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium break-words text-foreground">{value || "-"}</p>
    </div>
  </div>
);

const VerifyStudentInner = () => {
  const [searchParams] = useSearchParams();
  const nis = searchParams.get("nis");
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
  const [error, setError] = useState("");
  const [school, setSchool] = useState<any>(null);
  const [verifiedAt, setVerifiedAt] = useState("");

  useEffect(() => {
    supabase.from("school_settings").select("*").limit(1).maybeSingle()
      .then(({ data }) => setSchool(data || null))
      .catch(() => setSchool(null));
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!nis) { setError("Parameter NIS tidak ditemukan pada URL."); setLoading(false); return; }
      try {
        try {
          const { data, error: fnError } = await supabase.functions.invoke("public-student-lookup", { body: { nis } });
          if (!fnError && data && (data.full_name || data.nis)) {
            setStudent(data); setVerifiedAt(safeFormatNow()); setLoading(false); return;
          }
        } catch (e) { /* fallback */ }
        const { data, error: qError } = await supabase
          .from("students")
          .select("nis, nisn, full_name, photo_url, is_alumni, graduation_date, birth_place, birth_date, classes(name)")
          .eq("nis", nis)
          .maybeSingle();
        if (qError) throw qError;
        if (!data) { setError("Kartu tidak ditemukan atau tidak terdaftar dalam sistem."); setLoading(false); return; }
        setStudent(data); setVerifiedAt(safeFormatNow());
      } catch (e: any) {
        setError("Gagal memverifikasi kartu: " + (e?.message || "kesalahan tidak diketahui"));
      } finally { setLoading(false); }
    };
    load();
  }, [nis]);

  const s = school || {};
  const st = student || {};

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <style>{`
        @keyframes fade-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fade-down { from { opacity: 0; transform: translateY(-18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pop { 0% { transform: scale(.5); opacity: 0; } 80% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes scan { 0% { top: 0%; } 50% { top: 92%; } 100% { top: 0%; } }
        .animate-fade-up { animation: fade-up .6s ease-out both; }
        .animate-fade-down { animation: fade-down .6s ease-out both; }
        .animate-pop { animation: pop .5s cubic-bezier(.22,1.28,.54,.99) both; }
        .scan-line { position: absolute; left: 6%; right: 6%; height: 2px; border-radius: 2px;
          background: linear-gradient(90deg, transparent, hsl(var(--primary)), transparent);
          animation: scan 2.2s ease-in-out infinite; }
      `}</style>

      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-4 py-10">
        {/* Header branding otomatis */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center animate-fade-down">
          {s.logo_url ? (
            <div className="rounded-2xl bg-card border shadow-md p-2">
              <img src={s.logo_url} alt="Logo" className="h-14 w-14 object-contain" />
            </div>
          ) : (
            <div className="rounded-2xl bg-primary/10 p-3.5">
              <School className="h-8 w-8 text-primary" />
            </div>
          )}
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {s.district_name || "Sistem Verifikasi Digital"}
          </p>
          <h1 className="text-2xl font-bold leading-tight">{s.school_name || "Verifikasi Kartu Pelajar"}</h1>
          <Badge variant="secondary" className="gap-1.5 font-normal">
            <Sparkles className="h-3 w-3" />
            Digital Card Verification {s.academic_year ? `• TA ${s.academic_year}` : ""}
          </Badge>
        </div>

        {/* Kartu utama */}
        <div className="w-full rounded-3xl border bg-card/80 backdrop-blur-md shadow-2xl animate-fade-up overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center gap-5 py-16 px-6">
              <div className="relative h-20 w-20">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <Fingerprint className="absolute inset-0 m-auto h-7 w-7 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-medium">Memverifikasi kartu...</p>
                <p className="text-xs text-muted-foreground">Mencocokkan data dengan database sekolah</p>
              </div>
            </div>
          ) : error || !student ? (
            <div className="p-6">
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <div className="rounded-full bg-destructive/10 p-4 animate-pop">
                  <ShieldX className="h-10 w-10 text-destructive" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold text-destructive">Kartu Tidak Valid</h2>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    {error || "Kartu tidak ditemukan atau tidak terdaftar dalam sistem."}
                  </p>
                </div>
                <Badge variant="destructive" className="uppercase tracking-wider">Ditolak</Badge>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 animate-pop">
                <BadgeCheck className="h-6 w-6 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">Kartu Valid & Terdaftar</p>
                  <p className="text-xs text-muted-foreground">Data cocok dengan database resmi sekolah</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative shrink-0 overflow-hidden rounded-2xl border-2 border-primary/40 shadow-lg">
                  {st.photo_url ? (
                    <img src={st.photo_url} alt={st.full_name || "Foto"} className="h-28 w-24 object-cover" />
                  ) : (
                    <div className="flex h-28 w-24 items-center justify-center bg-muted">
                      <User className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                  <div className="scan-line" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <h2 className="text-lg font-bold leading-tight break-words">{toTitleCase(st.full_name)}</h2>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    {st.classes?.name || "Kelas tidak tercatat"}
                  </p>
                  {st.is_alumni ? (
                    <Badge variant="secondary" className="uppercase tracking-wider">Alumni</Badge>
                  ) : (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 uppercase tracking-wider">Siswa Aktif</Badge>
                  )}
                </div>
              </div>

              <div className="grid gap-2.5">
                <InfoRow icon={CreditCard} label="NIS" value={st.nis} />
                {st.nisn && <InfoRow icon={Hash} label="NISN" value={st.nisn} />}
                {(st.birth_place || st.birth_date) && (
                  <InfoRow
                    icon={CalendarDays}
                    label="Tempat, Tanggal Lahir"
                    value={`${st.birth_place || "-"}, ${safeFormatDate(st.birth_date)}`}
                  />
                )}
              </div>

              <div className="rounded-xl bg-muted/60 px-4 py-3 text-[11px] text-muted-foreground space-y-1">
                <p className="flex justify-between gap-2">
                  <span>Kode Verifikasi</span>
                  <span className="font-mono font-medium text-foreground">#{st.nis}</span>
                </p>
                <p className="flex justify-between gap-2">
                  <span>Waktu Verifikasi</span>
                  <span className="font-medium text-foreground">{verifiedAt || safeFormatNow()}</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer otomatis */}
        <div className="mt-6 space-y-1.5 text-center text-xs text-muted-foreground animate-fade-up">
          {s.show_address && s.school_address && (
            <p className="flex items-center justify-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" /> {s.school_address}
            </p>
          )}
          {s.show_phone && s.school_phone && (
            <p className="flex items-center justify-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-primary" /> Telp. {s.school_phone}
            </p>
          )}
          <p className="pt-1 text-[10px] text-muted-foreground/70">
            Jika data tidak sesuai, hubungi Tata Usaha sekolah.
          </p>
        </div>
      </div>
    </div>
  );
};

export default function VerifyStudent() {
  return (
    <Boundary>
      <VerifyStudentInner />
    </Boundary>
  );
}