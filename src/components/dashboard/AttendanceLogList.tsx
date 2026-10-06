// src/components/dashboard/AttendanceLogList.tsx
//
// Daftar riwayat absensi siswa. Setiap baris menampilkan tanggal (hari + tanggal lengkap),
// status, jam masuk/pulang, dan sumber data (RFID atau manual).
// Dipakai di tab Kehadiran (lengkap, dengan "tampilkan lebih banyak")
// dan di Ringkasan (ringkas, dengan tombol "Lihat semua").

import { Fragment, memo, useEffect, useMemo, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { CalendarCheck, ChevronRight, Loader2, User, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────

export interface AttendanceLogItem {
  id: string;
  date: string;
  status: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  source: string;
  notes: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  hadir: { label: "Hadir", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  terlambat: { label: "Terlambat", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  sakit: { label: "Sakit", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  izin: { label: "Izin", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  alpa: { label: "Alpa", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
};

const formatTime = (value: string | null): string | null => {
  if (!value) return null;
  const d = new Date(value);
  return isValid(d) ? format(d, "HH:mm") : null;
};

// ─── Row ──────────────────────────────────────────────────────────────────

const LogRow = memo(({ log }: { log: AttendanceLogItem }) => {
  const date = parseDate(log.date);
  const status = (log.status || "").toLowerCase().trim();
  const style = STATUS_STYLE[status];
  const checkIn = formatTime(log.check_in_at);
  const checkOut = formatTime(log.check_out_at);
  const isManual = log.source === "manual";

  return (
    <li className="flex items-center gap-3 py-3">
      {/* Tile tanggal */}
      <div className="w-12 shrink-0 rounded-xl bg-gray-100 dark:bg-gray-800 py-1.5 text-center">
        <p className="text-lg font-extrabold leading-none text-gray-800 dark:text-gray-100">
          {date ? format(date, "dd") : "–"}
        </p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">
          {date ? format(date, "MMM", { locale: localeId }) : ""}
        </p>
      </div>

      {/* Tanggal lengkap + jam */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
          {date ? format(date, "EEEE, dd MMMM yyyy", { locale: localeId }) : log.date || "-"}
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 font-mono">
          {checkIn || checkOut ? (
            <>Masuk {checkIn ?? "-"} · Pulang {checkOut ?? "-"}</>
          ) : (
            <span className="font-sans">Tidak ada jam tercatat</span>
          )}
        </p>
        {log.notes && (
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 truncate">{log.notes}</p>
        )}
      </div>

      {/* Status + sumber */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {style ? (
          <Badge className={`${style.className} text-[10px] hover:bg-transparent`}>
            {style.label}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] capitalize">
            {log.status || "-"}
          </Badge>
        )}
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
          {isManual ? <User className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
          {isManual ? "Manual" : "RFID"}
        </span>
      </div>
    </li>
  );
});
LogRow.displayName = "LogRow";

// ─── List ─────────────────────────────────────────────────────────────────

interface AttendanceLogListProps {
  logs: AttendanceLogItem[] | undefined;
  loading?: boolean;
  /** Jumlah baris per halaman pada mode lengkap. */
  pageSize?: number;
  /** Mode ringkas: tampilkan hanya N log terbaru, tanpa pengelompokan bulan. */
  limit?: number;
  /** Mode ringkas: dipanggil saat tombol "Lihat semua" ditekan. */
  onSeeAll?: () => void;
}

const AttendanceLogList = memo(({ logs, loading = false, pageSize = 15, limit, onSeeAll }: AttendanceLogListProps) => {
  const [visible, setVisible] = useState(pageSize);

  // Jika data berganti (mis. ganti tahun ajaran), mulai lagi dari halaman pertama.
  useEffect(() => setVisible(pageSize), [logs, pageSize]);

  // Terbaru di atas, apa pun urutan dari server.
  const sorted = useMemo(
    () => [...(logs || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [logs]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-xs text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat log absensi...
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <CalendarCheck className="h-7 w-7 text-gray-400" />
        </div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Belum ada data absensi</p>
        <p className="text-xs text-gray-400 mt-1">Data RFID & manual akan muncul di sini</p>
      </div>
    );
  }

  // ── Mode ringkas ──
  if (limit) {
    const shown = sorted.slice(0, limit);
    return (
      <div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {shown.map((log) => <LogRow key={log.id} log={log} />)}
        </ul>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
          >
            Lihat semua riwayat <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  // ── Mode lengkap: dikelompokkan per bulan ──
  const shown = sorted.slice(0, visible);
  const remaining = sorted.length - shown.length;
  const monthKey = (d: string) => (d || "").slice(0, 7);

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        Menampilkan {shown.length} dari {sorted.length} catatan, terbaru di atas
      </p>
      <ul>
        {shown.map((log, i) => {
          const newMonth = i === 0 || monthKey(log.date) !== monthKey(shown[i - 1].date);
          const d = parseDate(log.date);
          return (
            <Fragment key={log.id}>
              {newMonth && (
                <li
                  className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 list-none"
                  aria-hidden="true"
                >
                  {d ? format(d, "MMMM yyyy", { locale: localeId }) : "Tanggal tidak valid"}
                </li>
              )}
              <LogRow log={log} />
            </Fragment>
          );
        })}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + pageSize)}
          className="mt-3 w-full rounded-xl border border-gray-200 dark:border-gray-700 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Tampilkan {Math.min(pageSize, remaining)} lagi ({remaining} tersisa)
        </button>
      )}
    </div>
  );
});
AttendanceLogList.displayName = "AttendanceLogList";

export default AttendanceLogList;
