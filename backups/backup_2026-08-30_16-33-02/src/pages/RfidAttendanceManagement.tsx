import { useEffect, useMemo, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  CreditCard, Clock, Save, Search, ScanLine, Loader2, FileSpreadsheet, FileText,
  ChevronLeft, ChevronRight, ShieldCheck, Send, Link2, Phone,
  BarChart3, TrendingUp, Trophy, AlertCircle, Calendar, Users,
  ArrowLeft, ArrowRight, Keyboard, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";


const STATUSES = ["hadir", "terlambat", "izin", "sakit", "alpa"] as const;

const todayStr = () => {
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.toISOString().slice(0, 10);
};
const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }) : "";
const stampOf = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false, timeZone: "Asia/Jakarta",
      })
    : "-";

const toIso = (date: string, hhmm: string) =>
  hhmm ? new Date(`${date}T${hhmm}:00+07:00`).toISOString() : null;

const statusColor: Record<string, string> = {
  hadir: "bg-emerald-500 text-white",
  terlambat: "bg-amber-500 text-white",
  izin: "bg-sky-500 text-white",
  sakit: "bg-violet-500 text-white",
  alpa: "bg-destructive text-destructive-foreground",
};

const CHART_COLORS = {
  hadir: "#10b981",
  terlambat: "#f59e0b",
  izin: "#0ea5e9",
  sakit: "#8b5cf6",
  alpa: "#ef4444",
  belum: "#94a3b8",
};

// ============================================
// CUSTOM HOOK: KEYBOARD SHORTCUT
// ============================================
const useKeyboardShortcut = (
  key: string,
  callback: () => void,
  options: { modifier?: "ctrl" | "none"; enabled?: boolean } = {}
) => {
  const { modifier = "none", enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Untuk shortcut tanpa modifier (arrow keys, dll), skip jika user sedang mengetik
      if (modifier === "none" && isInput) return;

      const keyMatch = e.key.toLowerCase() === key.toLowerCase();
      const modifierMatch =
        modifier === "none" ? true : (e.ctrlKey || e.metaKey);

      if (keyMatch && modifierMatch) {
        e.preventDefault();
        callback();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [key, callback, modifier, enabled]);
};

// ============================================
// KOMPONEN: SHORTCUT KEY HINT
// ============================================
const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
    {children}
  </kbd>
);

const ShortcutHint = ({ keys, label }: { keys: string; label: string }) => (
  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
    <Kbd>{keys}</Kbd>
    <span>{label}</span>
  </span>
);


const RfidAttendanceManagementPage = () => {
  const { toast } = useToast();
  const { userRole, user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const seesAllClasses = isAdmin || userRole === "kesiswaan" || userRole === "guru_piket";

  // === ACTIVE TAB ===
  const [activeTab, setActiveTab] = useState<string>("rekap");

  // === STATE REKAP TAB ===
  const [date, setDate] = useState(todayStr());
  const [classFilter, setClassFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // === STATE REGISTRASI KARTU TAB ===
  const [regPage, setRegPage] = useState(1);
  const [regPageSize, setRegPageSize] = useState(25);
  const [regClassFilter, setRegClassFilter] = useState<string>("all");
  const [regSearch, setRegSearch] = useState("");

  // === STATE ANALYTICS TAB ===
  const [analyticsRange, setAnalyticsRange] = useState<"7d" | "14d" | "30d">("14d");

  // Wali kelas hanya boleh mengelola kelas perwaliannya
  const { data: homeroomClassIds } = useQuery({
    queryKey: ["rfid-homeroom-classes", user?.id],
    enabled: !!user && !seesAllClasses,
    queryFn: async () => {
      const { data: teacher } = await supabase
        .from("teachers").select("id").eq("user_id", user!.id).maybeSingle();
      if (!teacher?.id) return [] as string[];
      const { data } = await supabase
        .from("classes").select("id").eq("homeroom_teacher_id", teacher.id);
      return (data ?? []).map((c: any) => c.id as string);
    },
  });

  const restrictedIds = seesAllClasses ? null : homeroomClassIds ?? [];

  const { data: classes } = useQuery({
    queryKey: ["rfid-classes", restrictedIds?.join(",") ?? "all"],
    queryFn: async () => {
      let q = supabase.from("classes").select("id, name").order("name");
      if (restrictedIds) q = q.in("id", restrictedIds.length ? restrictedIds : ["00000000-0000-0000-0000-000000000000"]);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: seesAllClasses || !!homeroomClassIds,
  });

  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ["rfid-students", restrictedIds?.join(",") ?? "all"],
    enabled: seesAllClasses || !!homeroomClassIds,
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id, full_name, nis, nisn, rfid_uid, telegram_chat_id, parent_phone, class_id, status, is_alumni, classes(name)")
        .eq("status", "aktif")
        .or("is_alumni.is.null,is_alumni.eq.false")
        .order("full_name");
      if (restrictedIds) q = q.in("class_id", restrictedIds.length ? restrictedIds : ["00000000-0000-0000-0000-000000000000"]);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: records } = useQuery({
    queryKey: ["rfid-records", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("rfid_attendance").select("*").eq("date", date);
      if (error) throw error;
      return data as any[];
    },
  });

  // === QUERY ANALYTICS: Rekap 30 hari terakhir ===
  const { data: analyticsRecords } = useQuery({
    queryKey: ["rfid-analytics-30d"],
    queryFn: async () => {
      const d = new Date(Date.now() + 7 * 3600_000);
      d.setDate(d.getDate() - 30);
      const since = d.toISOString().slice(0, 10);
      let q = supabase
        .from("rfid_attendance")
        .select("id, date, status, student_id, check_in_at, students(full_name, nis, classes(name))")
        .gte("date", since);
      if (restrictedIds) {
        q = q.in("student_id.class_id", restrictedIds.length ? restrictedIds : ["00000000-0000-0000-0000-000000000000"]);
      }
      const { data, error } = await q.order("date", { ascending: true });
      if (error) {
        // Fallback: jika relasi tidak tersedia, query terpisah
        const { data: raw } = await supabase
          .from("rfid_attendance")
          .select("id, date, status, student_id, check_in_at")
          .gte("date", since)
          .order("date", { ascending: true });
        return (raw ?? []) as any[];
      }
      return data as any[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["rfid-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfid_attendance_settings").select("*").order("created_at").limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: tg } = useQuery({
    queryKey: ["telegram-settings"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("telegram_settings").select("*").order("created_at").limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [tgForm, setTgForm] = useState<any>(null);
  const [tgBusy, setTgBusy] = useState<string | null>(null);
  const [testChatId, setTestChatId] = useState("");
  const tgSettings = tgForm ?? tg ?? {
    enabled: false, bot_token: "", bot_username: "", notify_check_in: true, notify_check_out: true,
    message_template: "Yth. Orang Tua/Wali {nama}, ananda tercatat {tipe} pada {waktu} ({tanggal}) dengan status {status}. Terima kasih.",
  };

  const [form, setForm] = useState<any>(null);
  const settingsForm = form ?? settings;

  const saveTelegram = async () => {
    setTgBusy("save");
    try {
      const payload = {
        enabled: !!tgSettings.enabled,
        bot_token: tgSettings.bot_token || null,
        bot_username: (tgSettings.bot_username || "").replace(/^@/, "") || null,
        notify_check_in: tgSettings.notify_check_in !== false,
        notify_check_out: tgSettings.notify_check_out !== false,
        message_template: tgSettings.message_template,
      };
      const q: any = supabase.from("telegram_settings" as any);
      const { error } = tg?.id ? await q.update(payload).eq("id", tg.id) : await q.insert(payload);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["telegram-settings"] });
      toast({ title: "Pengaturan Telegram disimpan" });
    } catch (e: any) {
      toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" });
    } finally {
      setTgBusy(null);
    }
  };

  const testTelegram = async () => {
    if (!testChatId.trim()) {
      toast({ title: "Isi ID chat untuk uji coba", variant: "destructive" });
      return;
    }
    setTgBusy("test");
    try {
      const { data, error } = await supabase.functions.invoke("telegram-notify", {
        body: { test_chat_id: testChatId.trim() },
      });
      if (error) throw error;
      if ((data as any)?.ok) toast({ title: "Pesan uji terkirim" });
      else toast({ title: "Gagal mengirim", description: (data as any)?.error ?? (data as any)?.message, variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Gagal mengirim", description: e.message, variant: "destructive" });
    } finally {
      setTgBusy(null);
    }
  };

  const setupWebhook = async () => {
    setTgBusy("hook");
    try {
      const { data, error } = await supabase.functions.invoke("telegram-webhook", { body: { action: "setup" } });
      if (error) throw error;
      if ((data as any)?.ok) toast({ title: "Webhook terpasang", description: "Deteksi ID chat otomatis aktif." });
      else toast({ title: "Gagal memasang webhook", description: (data as any)?.message, variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Gagal memasang webhook", description: e.message, variant: "destructive" });
    } finally {
      setTgBusy(null);
    }
  };

  const saveChatId = async (studentId: string, chatId: string) => {
    setSavingId(studentId);
    try {
      const { error } = await supabase
        .from("students")
        .update({ telegram_chat_id: chatId.trim() || null } as any)
        .eq("id", studentId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["rfid-students"] });
      toast({ title: "ID chat Telegram tersimpan" });
    } catch (e: any) {
      toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  // === FILTERED ROWS REKAP ===
  const rows = useMemo(() => {
    const byStudent = new Map((records ?? []).map((r) => [r.student_id, r]));
    return (students ?? [])
      .filter((s) => classFilter === "all" || s.class_id === classFilter)
      .filter((s) =>
        !search ||
        s.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (s.nis ?? "").includes(search))
      .map((s) => ({ student: s, record: byStudent.get(s.id) }))
      .filter(({ record }) =>
        statusFilter === "all" ||
        (statusFilter === "belum" ? !record?.status : record?.status === statusFilter));
  }, [students, records, classFilter, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize]
  );

  useEffect(() => { setPage(1); }, [date, classFilter, search, statusFilter, pageSize]);

  // === FILTERED ROWS REGISTRASI ===
  const regRows = useMemo(() => {
    return (students ?? [])
      .filter((s) => regClassFilter === "all" || s.class_id === regClassFilter)
      .filter((s) =>
        !regSearch ||
        s.full_name.toLowerCase().includes(regSearch.toLowerCase()) ||
        (s.nis ?? "").includes(regSearch) ||
        (s.nisn ?? "").includes(regSearch) ||
        (s.parent_phone ?? "").includes(regSearch) ||
        (s.rfid_uid ?? "").toLowerCase().includes(regSearch.toLowerCase())
      )
      .map((s) => ({ student: s }));
  }, [students, regClassFilter, regSearch]);

  const regTotalPages = Math.max(1, Math.ceil(regRows.length / regPageSize));
  const regPagedRows = useMemo(
    () => regRows.slice((regPage - 1) * regPageSize, regPage * regPageSize),
    [regRows, regPage, regPageSize]
  );

  useEffect(() => { setRegPage(1); }, [regClassFilter, regSearch, regPageSize]);

  const regStats = useMemo(() => {
    const total = regRows.length;
    const registered = regRows.filter(({ student }) => student.rfid_uid).length;
    const withWhatsApp = regRows.filter(({ student }) => student.parent_phone).length;
    const withTelegram = regRows.filter(({ student }) => student.telegram_chat_id).length;
    return { total, registered, withWhatsApp, withTelegram };
  }, [regRows]);

  // ============================================
  // ANALYTICS COMPUTED DATA
  // ============================================
  const analyticsData = useMemo(() => {
    const recs = analyticsRecords ?? [];
    const days = analyticsRange === "7d" ? 7 : analyticsRange === "14d" ? 14 : 30;

    // Filter berdasarkan range
    const today = new Date(todayStr());
    const since = new Date(today);
    since.setDate(since.getDate() - (days - 1));
    const sinceStr = since.toISOString().slice(0, 10);
    const filtered = recs.filter((r) => r.date >= sinceStr);

    // 1. Summary stats
    const summary = {
      hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, total: filtered.length,
    };
    filtered.forEach((r) => {
      if (r.status && r.status in summary) (summary as any)[r.status]++;
    });

    // 2. Trend per hari
    const byDate: Record<string, { date: string; hadir: number; terlambat: number; izin: number; sakit: number; alpa: number; total: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDate[key] = {
        date: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
        hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0, total: 0,
      };
    }
    filtered.forEach((r) => {
      if (byDate[r.date]) {
        byDate[r.date].total++;
        if (r.status && r.status in byDate[r.date]) {
          (byDate[r.date] as any)[r.status]++;
        }
      }
    });
    const trend = Object.values(byDate);

    // 3. Per kelas
    const byClass: Record<string, { class: string; hadir: number; terlambat: number; total: number }> = {};
    filtered.forEach((r) => {
      const className = r.students?.classes?.name ?? "Tanpa Kelas";
      if (!byClass[className]) {
        byClass[className] = { class: className, hadir: 0, terlambat: 0, total: 0 };
      }
      byClass[className].total++;
      if (r.status === "hadir") byClass[className].hadir++;
      if (r.status === "terlambat") byClass[className].terlambat++;
    });
    const perClass = Object.values(byClass).sort((a, b) => b.total - a.total);

    // 4. Top students
    const byStudent: Record<string, { id: string; name: string; nis: string; class: string; hadir: number; terlambat: number; total: number }> = {};
    filtered.forEach((r) => {
      const s = r.students;
      if (!s) return;
      if (!byStudent[r.student_id]) {
        byStudent[r.student_id] = {
          id: r.student_id,
          name: s.full_name ?? "-",
          nis: s.nis ?? "-",
          class: s.classes?.name ?? "-",
          hadir: 0, terlambat: 0, total: 0,
        };
      }
      byStudent[r.student_id].total++;
      if (r.status === "hadir") byStudent[r.student_id].hadir++;
      if (r.status === "terlambat") byStudent[r.student_id].terlambat++;
    });
    const topRajin = Object.values(byStudent)
      .sort((a, b) => b.hadir - a.hadir || a.terlambat - b.terlambat)
      .slice(0, 5);
    const topTerlambat = Object.values(byStudent)
      .filter((s) => s.terlambat > 0)
      .sort((a, b) => b.terlambat - a.terlambat)
      .slice(0, 5);

    // 5. Pie chart data
    const pie = [
      { name: "Hadir", value: summary.hadir, fill: CHART_COLORS.hadir },
      { name: "Terlambat", value: summary.terlambat, fill: CHART_COLORS.terlambat },
      { name: "Izin", value: summary.izin, fill: CHART_COLORS.izin },
      { name: "Sakit", value: summary.sakit, fill: CHART_COLORS.sakit },
      { name: "Alpa", value: summary.alpa, fill: CHART_COLORS.alpa },
    ].filter((p) => p.value > 0);

    // Attendance rate
    const rate = summary.total > 0 ? Math.round(((summary.hadir + summary.terlambat) / summary.total) * 100) : 0;

    return { summary, trend, perClass, topRajin, topTerlambat, pie, rate, days };
  }, [analyticsRecords, analyticsRange]);

  // ============================================
  // EXPORT FUNCTIONS
  // ============================================
  const exportRows = () =>
    rows.map(({ student, record }, i) => ({
      No: i + 1,
      Nama: student.full_name,
      NIS: student.nis ?? "-",
      Kelas: student.classes?.name ?? "-",
      Masuk: timeOf(record?.check_in_at) || "-",
      Pulang: timeOf(record?.check_out_at) || "-",
      Status: record?.status ?? "Belum absen",
      Catatan: record?.notes ?? "",
    }));

  const exportExcel = useCallback(() => {
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi RFID");
    XLSX.writeFile(wb, `absensi-rfid-${date}.xlsx`);
    toast({ title: "Excel diunduh", description: `${rows.length} baris diekspor.` });
  }, [rows, date, toast]);

  const exportPdf = useCallback(() => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Rekap Absensi RFID", 14, 15);
    doc.setFontSize(10);
    doc.text(`Tanggal: ${date}  •  Total: ${rows.length} siswa`, 14, 22);
    autoTable(doc, {
      startY: 27,
      head: [["No", "Nama", "NIS", "Kelas", "Masuk", "Pulang", "Status", "Catatan"]],
      body: exportRows().map((r) => Object.values(r).map(String)),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`absensi-rfid-${date}.pdf`);
    toast({ title: "PDF diunduh", description: `${rows.length} baris diekspor.` });
  }, [rows, date, toast]);

  const refreshAnalytics = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["rfid-analytics-30d"] });
    qc.invalidateQueries({ queryKey: ["rfid-records", date] });
    toast({ title: "Data diperbarui" });
  }, [qc, date, toast]);

  const saveRecord = async (studentId: string, patch: { check_in?: string; check_out?: string; status?: string; notes?: string }, existing: any) => {
    setSavingId(studentId);
    try {
      const payload: any = {};
      if (patch.check_in !== undefined) payload.check_in_at = toIso(date, patch.check_in);
      if (patch.check_out !== undefined) payload.check_out_at = toIso(date, patch.check_out);
      if (patch.status !== undefined) payload.status = patch.status;
      if (patch.notes !== undefined) payload.notes = patch.notes;

      if (existing) {
        const { error } = await supabase.from("rfid_attendance").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("rfid_attendance")
          .insert({ student_id: studentId, date, status: payload.status ?? "hadir", ...payload });
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["rfid-records", date] });
      await qc.invalidateQueries({ queryKey: ["rfid-analytics-30d"] });
      toast({ title: "Tersimpan", description: "Data absensi diperbarui." });
    } catch (e: any) {
      toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const saveUid = async (studentId: string, uid: string) => {
    setSavingId(studentId);
    try {
      const { error } = await supabase
        .from("students")
        .update({ rfid_uid: uid.trim() || null })
        .eq("id", studentId);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["rfid-students"] });
      toast({ title: "Kartu tersimpan", description: uid ? `UID: ${uid}` : "Kartu dilepas dari siswa." });
    } catch (e: any) {
      toast({
        title: "Gagal menyimpan kartu",
        description: e.message?.includes("duplicate") ? "UID kartu sudah dipakai siswa lain." : e.message,
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const saveSettings = async () => {
    if (!settingsForm) return;
    try {
      const payload = {
        check_in_start: settingsForm.check_in_start,
        check_in_end: settingsForm.check_in_end,
        late_after: settingsForm.late_after,
        check_out_start: settingsForm.check_out_start,
        check_out_end: settingsForm.check_out_end,
        is_active: settingsForm.is_active,
        late_violation_enabled: settingsForm.late_violation_enabled ?? false,
        late_violation_points: Number(settingsForm.late_violation_points ?? 5),
        face_verification_enabled: settingsForm.face_verification_enabled ?? false,
      };
      const { error } = settings?.id
        ? await supabase.from("rfid_attendance_settings").update(payload).eq("id", settings.id)
        : await supabase.from("rfid_attendance_settings").insert(payload);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["rfid-settings"] });
      toast({ title: "Pengaturan disimpan" });
    } catch (e: any) {
      toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" });
    }
  };

  const registered = (students ?? []).filter((s) => s.rfid_uid).length;

  // ============================================
  // KEYBOARD SHORTCUTS
  // ============================================
  // Tab Rekap
  useKeyboardShortcut("e", exportExcel, { modifier: "ctrl", enabled: activeTab === "rekap" });
  useKeyboardShortcut("p", exportPdf, { modifier: "ctrl", enabled: activeTab === "rekap" });
  useKeyboardShortcut("ArrowLeft", () => setPage((p) => Math.max(1, p - 1)), { enabled: activeTab === "rekap" && page > 1 });
  useKeyboardShortcut("ArrowRight", () => setPage((p) => Math.min(totalPages, p + 1)), { enabled: activeTab === "rekap" && page < totalPages });

  // Tab Registrasi
  useKeyboardShortcut("ArrowLeft", () => setRegPage((p) => Math.max(1, p - 1)), { enabled: activeTab === "kartu" && regPage > 1 });
  useKeyboardShortcut("ArrowRight", () => setRegPage((p) => Math.min(regTotalPages, p + 1)), { enabled: activeTab === "kartu" && regPage < regTotalPages });

  // Tab Analytics
  useKeyboardShortcut("r", refreshAnalytics, { modifier: "ctrl", enabled: activeTab === "analytics" });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScanLine className="h-6 w-6 text-primary" /> Absensi RFID
          </h1>
          <p className="text-sm text-muted-foreground">
            Kelola kehadiran kartu RFID, registrasi kartu siswa, dan analitik kehadiran.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="rekap" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Rekap & Edit
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="kartu" className="gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Registrasi Kartu
              </TabsTrigger>
            )}
            <TabsTrigger value="analytics" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Analitik
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="jadwal" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Jadwal
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="telegram" className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> Telegram
              </TabsTrigger>
            )}
          </TabsList>

          {/* ====================== TAB REKAP ====================== */}
          <TabsContent value="rekap" className="mt-4 space-y-4">
            {/* Shortcut Hints */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
              <span className="font-medium flex items-center gap-1">
                <Keyboard className="h-3.5 w-3.5" /> Shortcut:
              </span>
              <ShortcutHint keys="Ctrl+E" label="Export Excel" />
              <ShortcutHint keys="Ctrl+P" label="Export PDF" />
              <ShortcutHint keys="Ctrl+F" label="Cari" />
              <ShortcutHint keys="← →" label="Halaman" />
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Filter</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
                <div>
                  <Label>Tanggal</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <Label>Kelas</Label>
                  <Select value={classFilter} onValueChange={setClassFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Kelas</SelectItem>
                      {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status</SelectItem>
                      <SelectItem value="belum">Belum absen</SelectItem>
                      {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Baris / Halaman</Label>
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cari Siswa <Kbd>Ctrl+F</Kbd></Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-8" placeholder="Nama atau NIS" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">Daftar Kehadiran ({rows.length})</CardTitle>
                  <CardDescription>Wali kelas, guru piket, dan admin dapat mengubah data.</CardDescription>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1" title="Ctrl+E">
                    <FileSpreadsheet className="h-4 w-4" /> Excel <Kbd>Ctrl+E</Kbd>
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportPdf} className="gap-1" title="Ctrl+P">
                    <FileText className="h-4 w-4" /> PDF <Kbd>Ctrl+P</Kbd>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="overflow-x-auto">
                {studentsLoading ? (
                  <div className="py-10 text-center text-muted-foreground">Memuat data…</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Siswa</TableHead>
                        <TableHead>Kelas</TableHead>
                        <TableHead>Waktu Tap</TableHead>
                        <TableHead>Masuk</TableHead>
                        <TableHead>Pulang</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Catatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedRows.map(({ student, record }) => (
                        <TableRow key={student.id}>
                          <TableCell>
                            <p className="font-medium">{student.full_name}</p>
                            <p className="text-xs text-muted-foreground">{student.nis}</p>
                          </TableCell>
                          <TableCell className="text-sm">{student.classes?.name ?? "-"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            <p className="text-muted-foreground">Masuk: <span className="font-mono text-foreground">{stampOf(record?.check_in_at)}</span></p>
                            <p className="text-muted-foreground">Pulang: <span className="font-mono text-foreground">{stampOf(record?.check_out_at)}</span></p>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              className="w-28"
                              defaultValue={timeOf(record?.check_in_at)}
                              onBlur={(e) => {
                                if (e.target.value !== timeOf(record?.check_in_at))
                                  saveRecord(student.id, { check_in: e.target.value }, record);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              className="w-28"
                              defaultValue={timeOf(record?.check_out_at)}
                              onBlur={(e) => {
                                if (e.target.value !== timeOf(record?.check_out_at))
                                  saveRecord(student.id, { check_out: e.target.value }, record);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={record?.status ?? ""}
                              onValueChange={(v) => saveRecord(student.id, { status: v }, record)}
                            >
                              <SelectTrigger className="w-32">
                                {record?.status
                                  ? <Badge className={statusColor[record.status] ?? ""}>{record.status}</Badge>
                                  : <span className="text-muted-foreground text-sm">Belum absen</span>}
                              </SelectTrigger>
                              <SelectContent>
                                {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Input
                                className="w-44"
                                placeholder="Catatan"
                                defaultValue={record?.notes ?? ""}
                                onBlur={(e) => {
                                  if (e.target.value !== (record?.notes ?? ""))
                                    saveRecord(student.id, { notes: e.target.value }, record);
                                }}
                              />
                              {savingId === student.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {pagedRows.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Tidak ada data siswa.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                  <p className="text-xs text-muted-foreground">
                    Menampilkan {pagedRows.length} dari {rows.length} siswa • Halaman {page}/{totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4" /> Sebelumnya <Kbd>←</Kbd>
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Berikutnya <Kbd>→</Kbd> <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ====================== TAB REGISTRASI KARTU ====================== */}
          {isAdmin && (
            <TabsContent value="kartu" className="mt-4 space-y-4">
              {/* Shortcut Hints */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                <span className="font-medium flex items-center gap-1">
                  <Keyboard className="h-3.5 w-3.5" /> Shortcut:
                </span>
                <ShortcutHint keys="Ctrl+F" label="Cari" />
                <ShortcutHint keys="← →" label="Halaman" />
              </div>

              {/* Statistik */}
              <div className="grid gap-3 md:grid-cols-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Siswa</p>
                        <p className="text-2xl font-bold">{regStats.total}</p>
                      </div>
                      <CreditCard className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Kartu Terdaftar</p>
                        <p className="text-2xl font-bold text-emerald-600">{regStats.registered}</p>
                      </div>
                      <Badge className="bg-emerald-500 text-white">{regStats.total > 0 ? Math.round((regStats.registered / regStats.total) * 100) : 0}%</Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">WA Ortu Tertaut</p>
                        <p className="text-2xl font-bold text-green-600">{regStats.withWhatsApp}</p>
                      </div>
                      <Phone className="h-8 w-8 text-green-600/50" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Telegram Tertaut</p>
                        <p className="text-2xl font-bold text-sky-600">{regStats.withTelegram}</p>
                      </div>
                      <Send className="h-8 w-8 text-sky-600/50" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" /> Registrasi Kartu RFID
                  </CardTitle>
                  <CardDescription>
                    {registered} dari {students?.length ?? 0} siswa sudah memiliki kartu. Klik kolom UID lalu tap kartu pada pembaca.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Filter */}
                  <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                    <div>
                      <Label>Kelas</Label>
                      <Select value={regClassFilter} onValueChange={setRegClassFilter}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Kelas</SelectItem>
                          {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Baris / Halaman</Label>
                      <Select value={String(regPageSize)} onValueChange={(v) => setRegPageSize(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Cari Siswa <Kbd>Ctrl+F</Kbd></Label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-8"
                          placeholder="Nama, NIS, NISN, UID, atau No WA"
                          value={regSearch}
                          onChange={(e) => setRegSearch(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Siswa</TableHead>
                          <TableHead>Kelas</TableHead>
                          <TableHead>UID Kartu</TableHead>
                          <TableHead>No WA Ortu</TableHead>
                          <TableHead>ID Chat Telegram</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {regPagedRows.map(({ student }) => (
                          <TableRow key={student.id}>
                            <TableCell>
                              <p className="font-medium">{student.full_name}</p>
                              <p className="text-xs text-muted-foreground">NIS: {student.nis ?? "-"} • NISN: {student.nisn ?? "-"}</p>
                            </TableCell>
                            <TableCell className="text-sm">{student.classes?.name ?? "-"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Input
                                  className="w-48 font-mono text-sm"
                                  placeholder="Tap kartu di sini…"
                                  defaultValue={student.rfid_uid ?? ""}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                  onBlur={(e) => {
                                    if (e.target.value.trim() !== (student.rfid_uid ?? ""))
                                      saveUid(student.id, e.target.value);
                                  }}
                                />
                                {savingId === student.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                              </div>
                            </TableCell>
                            <TableCell>
                              {student.parent_phone ? (
                                <div className="flex items-center gap-1.5">
                                  <Phone className="h-3.5 w-3.5 text-green-600" />
                                  <span className="font-mono text-sm">{student.parent_phone}</span>
                                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 ml-1">
                                    Aktif
                                  </Badge>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Phone className="h-3.5 w-3.5" />
                                  <span className="text-xs italic">Belum tertaut</span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Input
                                className="w-40 font-mono text-sm"
                                placeholder="mis. 123456789"
                                defaultValue={student.telegram_chat_id ?? ""}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                onBlur={(e) => {
                                  if (e.target.value.trim() !== (student.telegram_chat_id ?? ""))
                                    saveChatId(student.id, e.target.value);
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              {student.rfid_uid
                                ? <Badge className="bg-emerald-500 text-white">Terdaftar</Badge>
                                : <Badge variant="outline">Belum ada kartu</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                        {regPagedRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                              {studentsLoading ? "Memuat data…" : "Tidak ada data siswa."}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      Menampilkan {regPagedRows.length} dari {regRows.length} siswa • Halaman {regPage}/{regTotalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={regPage <= 1} onClick={() => setRegPage((p) => p - 1)}>
                        <ChevronLeft className="h-4 w-4" /> Sebelumnya <Kbd>←</Kbd>
                      </Button>
                      <Button variant="outline" size="sm" disabled={regPage >= regTotalPages} onClick={() => setRegPage((p) => p + 1)}>
                        Berikutnya <Kbd>→</Kbd> <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ====================== TAB ANALYTICS (BARU) ====================== */}
          <TabsContent value="analytics" className="mt-4 space-y-4">
            {/* Shortcut Hints */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
              <span className="font-medium flex items-center gap-1">
                <Keyboard className="h-3.5 w-3.5" /> Shortcut:
              </span>
              <ShortcutHint keys="Ctrl+R" label="Refresh Data" />
            </div>

            {/* Filter Rentang */}
            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Analitik Kehadiran
                  </CardTitle>
                  <CardDescription>Visualisasi tren kehadiran siswa.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={analyticsRange} onValueChange={(v) => setAnalyticsRange(v as any)}>
                    <SelectTrigger className="w-40">
                      <Calendar className="h-4 w-4 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7d">7 Hari Terakhir</SelectItem>
                      <SelectItem value="14d">14 Hari Terakhir</SelectItem>
                      <SelectItem value="30d">30 Hari Terakhir</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={refreshAnalytics} className="gap-1" title="Ctrl+R">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>

            {/* Summary Cards */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Tingkat Kehadiran</p>
                      <p className="text-3xl font-bold text-emerald-600">{analyticsData.rate}%</p>
                      <p className="text-xs text-muted-foreground mt-1">{analyticsData.summary.total} total catatan</p>
                    </div>
                    <TrendingUp className="h-10 w-10 text-emerald-500/40" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Hadir Tepat Waktu</p>
                      <p className="text-3xl font-bold text-emerald-600">{analyticsData.summary.hadir}</p>
                    </div>
                    <Users className="h-10 w-10 text-emerald-500/40" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Terlambat</p>
                      <p className="text-3xl font-bold text-amber-600">{analyticsData.summary.terlambat}</p>
                    </div>
                    <Clock className="h-10 w-10 text-amber-500/40" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Tidak Hadir</p>
                      <p className="text-3xl font-bold text-destructive">
                        {analyticsData.summary.izin + analyticsData.summary.sakit + analyticsData.summary.alpa}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Izin: {analyticsData.summary.izin} • Sakit: {analyticsData.summary.sakit} • Alpa: {analyticsData.summary.alpa}
                      </p>
                    </div>
                    <AlertCircle className="h-10 w-10 text-destructive/40" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Trend Chart */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Tren Kehadiran {analyticsData.days} Hari Terakhir</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analyticsData.trend}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="hadir" name="Hadir" stroke={CHART_COLORS.hadir} strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="terlambat" name="Terlambat" stroke={CHART_COLORS.terlambat} strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="izin" name="Izin" stroke={CHART_COLORS.izin} strokeWidth={1.5} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="sakit" name="Sakit" stroke={CHART_COLORS.sakit} strokeWidth={1.5} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="alpa" name="Alpa" stroke={CHART_COLORS.alpa} strokeWidth={1.5} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Pie Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Distribusi Status</CardTitle>
                </CardHeader>
                <CardContent>
                  {analyticsData.pie.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={analyticsData.pie}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={90}
                          dataKey="value"
                        >
                          {analyticsData.pie.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      Belum ada data
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Per Class Chart */}
            {analyticsData.perClass.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Kehadiran per Kelas</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analyticsData.perClass}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="class" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="hadir" name="Hadir" fill={CHART_COLORS.hadir} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="terlambat" name="Terlambat" fill={CHART_COLORS.terlambat} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Top Students */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Top Rajin */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" /> Siswa Paling Rajin
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analyticsData.topRajin.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Nama</TableHead>
                          <TableHead>Kelas</TableHead>
                          <TableHead className="text-right">Hadir</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analyticsData.topRajin.map((s, i) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-bold text-amber-600">{i + 1}</TableCell>
                            <TableCell>
                              <p className="font-medium">{s.name}</p>
                              <p className="text-xs text-muted-foreground">{s.nis}</p>
                            </TableCell>
                            <TableCell>{s.class}</TableCell>
                            <TableCell className="text-right">
                              <Badge className="bg-emerald-500 text-white">{s.hadir}x</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data</p>
                  )}
                </CardContent>
              </Card>

              {/* Top Terlambat */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" /> Siswa Sering Terlambat
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analyticsData.topTerlambat.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Nama</TableHead>
                          <TableHead>Kelas</TableHead>
                          <TableHead className="text-right">Terlambat</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analyticsData.topTerlambat.map((s, i) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-bold text-amber-600">{i + 1}</TableCell>
                            <TableCell>
                              <p className="font-medium">{s.name}</p>
                              <p className="text-xs text-muted-foreground">{s.nis}</p>
                            </TableCell>
                            <TableCell>{s.class}</TableCell>
                            <TableCell className="text-right">
                              <Badge className="bg-amber-500 text-white">{s.terlambat}x</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">Tidak ada siswa terlambat 🎉</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ====================== TAB JADWAL ====================== */}
          {isAdmin && (
            <TabsContent value="jadwal" className="mt-4">
              <Card className="max-w-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> Jadwal Absensi RFID
                  </CardTitle>
                  <CardDescription>Atur rentang waktu tap masuk, batas terlambat, dan tap pulang.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {settingsForm && (
                    <>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium text-sm">Aktifkan Absensi RFID</p>
                          <p className="text-xs text-muted-foreground">Nonaktifkan untuk menutup layar tap sementara.</p>
                        </div>
                        <Switch
                          checked={!!settingsForm.is_active}
                          onCheckedChange={(v) => setForm({ ...settingsForm, is_active: v })}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          ["check_in_start", "Mulai Tap Masuk"],
                          ["check_in_end", "Akhir Tap Masuk"],
                          ["late_after", "Terlambat Setelah"],
                          ["check_out_start", "Mulai Tap Pulang"],
                          ["check_out_end", "Akhir Tap Pulang"],
                        ].map(([key, label]) => (
                          <div key={key}>
                            <Label>{label}</Label>
                            <Input
                              type="time"
                              value={String(settingsForm[key] ?? "").slice(0, 5)}
                              onChange={(e) => setForm({ ...settingsForm, [key]: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium text-sm">Poin Pelanggaran Otomatis (Terlambat)</p>
                          <p className="text-xs text-muted-foreground">Siswa yang tap terlambat otomatis tercatat sebagai pelanggaran.</p>
                        </div>
                        <Switch
                          checked={!!settingsForm.late_violation_enabled}
                          onCheckedChange={(v) => setForm({ ...settingsForm, late_violation_enabled: v })}
                        />
                      </div>
                      {settingsForm.late_violation_enabled && (
                        <div className="max-w-[200px]">
                          <Label>Jumlah Poin</Label>
                          <Input
                            type="number"
                            min={1}
                            value={settingsForm.late_violation_points ?? 5}
                            onChange={(e) => setForm({ ...settingsForm, late_violation_points: e.target.value })}
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium text-sm flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-primary" /> Verifikasi Wajah
                          </p>
                          <p className="text-xs text-muted-foreground">Wajibkan verifikasi kamera setelah tap kartu.</p>
                        </div>
                        <Switch
                          checked={!!settingsForm.face_verification_enabled}
                          onCheckedChange={(v) => setForm({ ...settingsForm, face_verification_enabled: v })}
                        />
                      </div>

                      <Button onClick={saveSettings} className="gap-2">
                        <Save className="h-4 w-4" /> Simpan Pengaturan
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ====================== TAB TELEGRAM ====================== */}
          {isAdmin && (
            <TabsContent value="telegram" className="mt-4">
              <Card className="max-w-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="h-4 w-4 text-primary" /> Notifikasi Telegram Orang Tua
                  </CardTitle>
                  <CardDescription>
                    Setiap siswa tap kartu, orang tua menerima pesan otomatis di Telegram.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">Aktifkan Notifikasi</p>
                      <p className="text-xs text-muted-foreground">Kirim pesan otomatis setelah tap kartu.</p>
                    </div>
                    <Switch
                      checked={!!tgSettings.enabled}
                      onCheckedChange={(v) => setTgForm({ ...tgSettings, enabled: v })}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Token Bot (dari @BotFather)</Label>
                      <Input
                        type="password"
                        className="font-mono"
                        placeholder="123456789:AA..."
                        value={tgSettings.bot_token ?? ""}
                        onChange={(e) => setTgForm({ ...tgSettings, bot_token: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Username Bot (tanpa @)</Label>
                      <Input
                        placeholder="absensinedelcis_bot"
                        value={tgSettings.bot_username ?? ""}
                        onChange={(e) => setTgForm({ ...tgSettings, bot_username: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button variant="outline" className="gap-2" disabled={tgBusy === "hook"} onClick={setupWebhook}>
                        <Link2 className="h-4 w-4" /> Pasang Webhook
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <p className="text-sm">Notifikasi Absen Masuk</p>
                      <Switch
                        checked={tgSettings.notify_check_in !== false}
                        onCheckedChange={(v) => setTgForm({ ...tgSettings, notify_check_in: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <p className="text-sm">Notifikasi Absen Pulang</p>
                      <Switch
                        checked={tgSettings.notify_check_out !== false}
                        onCheckedChange={(v) => setTgForm({ ...tgSettings, notify_check_out: v })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Template Pesan</Label>
                    <textarea
                      className="w-full min-h-24 rounded-md border border-input bg-background p-3 text-sm"
                      value={tgSettings.message_template ?? ""}
                      onChange={(e) => setTgForm({ ...tgSettings, message_template: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Variabel: {"{nama} {nis} {kelas} {tipe} {waktu} {tanggal} {status}"}
                    </p>
                  </div>

                  <div className="rounded-lg border p-3 space-y-2">
                    <Label>Uji Kirim Pesan</Label>
                    <div className="flex gap-2">
                      <Input
                        className="font-mono"
                        placeholder="ID chat tujuan"
                        value={testChatId}
                        onChange={(e) => setTestChatId(e.target.value)}
                      />
                      <Button variant="outline" className="gap-2 shrink-0" disabled={tgBusy === "test"} onClick={testTelegram}>
                        <Send className="h-4 w-4" /> Kirim
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Simpan token terlebih dahulu sebelum menguji.
                    </p>
                  </div>

                  <Button onClick={saveTelegram} disabled={tgBusy === "save"} className="gap-2">
                    <Save className="h-4 w-4" /> Simpan Pengaturan Telegram
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

        </Tabs>
      </div>
    </DashboardLayout>
  );
};

const RfidAttendanceManagement = () => (
  <ProtectedRoute allowedRoles={["admin", "super_admin", "guru_piket", "kesiswaan", "teacher"]}>
    <RfidAttendanceManagementPage />
  </ProtectedRoute>
);

export default RfidAttendanceManagement;