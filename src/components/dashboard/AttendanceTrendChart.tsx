// src/components/dashboard/AttendanceTrendChart.tsx
//
// Grafik tren kehadiran siswa (garis, satu seri) yang dihitung dari log absensi.
// Kehadiran = (hadir + terlambat) / (hadir + terlambat + izin + sakit + alpa).
// Dapat dilihat per bulan atau per minggu, dan punya tampilan tabel sebagai alternatif.

import { memo, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { addDays, format, isValid, parseISO, startOfWeek } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Loader2, Table2, TrendingUp } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

export interface TrendLog {
  date: string;
  status: string | null;
}

type Granularity = "month" | "week";

interface Bucket {
  key: string;
  label: string;
  fullLabel: string;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  total: number;
  percent: number;
}

type CountKey = "hadir" | "terlambat" | "izin" | "sakit" | "alpa";
const COUNT_KEYS: CountKey[] = ["hadir", "terlambat", "izin", "sakit", "alpa"];
const MAX_BUCKETS = 12;

// ─── Data ─────────────────────────────────────────────────────────────────

function parseLogDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

function buildBuckets(logs: TrendLog[], granularity: Granularity): Bucket[] {
  const map = new Map<string, Bucket>();

  for (const log of logs) {
    const status = (log.status || "").toLowerCase().trim() as CountKey;
    if (!COUNT_KEYS.includes(status)) continue; // abaikan status lain (mis. libur)
    const date = parseLogDate(log.date);
    if (!date) continue;

    let key: string;
    let label: string;
    let fullLabel: string;
    if (granularity === "month") {
      key = format(date, "yyyy-MM");
      label = format(date, "MMM yy", { locale: localeId });
      fullLabel = format(date, "MMMM yyyy", { locale: localeId });
    } else {
      const start = startOfWeek(date, { weekStartsOn: 1 });
      key = format(start, "yyyy-MM-dd");
      label = format(start, "dd MMM", { locale: localeId });
      fullLabel = `Minggu ${format(start, "dd MMM", { locale: localeId })} – ${format(
        addDays(start, 6),
        "dd MMM yyyy",
        { locale: localeId }
      )}`;
    }

    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        key, label, fullLabel,
        hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpa: 0,
        total: 0, percent: 0,
      };
      map.set(key, bucket);
    }
    bucket[status] += 1;
    bucket.total += 1;
  }

  return Array.from(map.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-MAX_BUCKETS)
    .map((b) => ({
      ...b,
      percent: b.total > 0 ? Math.round(((b.hadir + b.terlambat) / b.total) * 100) : 0,
    }));
}

// ─── Sub-components ───────────────────────────────────────────────────────

const TrendTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const b: Bucket = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 shadow-md text-xs max-w-[240px]">
      <p className="text-gray-500 dark:text-gray-400">{b.fullLabel}</p>
      <p className="mt-1 flex items-center gap-2">
        <span className="inline-block h-0.5 w-3 rounded" style={{ background: "var(--trend)" }} />
        <span className="text-base font-bold text-gray-900 dark:text-gray-50">{b.percent}%</span>
        <span className="text-gray-500 dark:text-gray-400">kehadiran</span>
      </p>
      <p className="mt-1 text-gray-600 dark:text-gray-300">
        Hadir {b.hadir} · Terlambat {b.terlambat} · Izin {b.izin} · Sakit {b.sakit} · Alpa {b.alpa}
      </p>
    </div>
  );
};

const makeDotRenderer = (lastIndex: number) => (props: any) => {
  const { cx, cy, index, payload } = props;
  if (cx == null || cy == null) return <g key={`dot-${index}`} />;
  return (
    <g key={`dot-${index}`}>
      {/* titik 8px dengan cincin 2px warna permukaan */}
      <circle cx={cx} cy={cy} r={4} fill="var(--trend)" stroke="var(--surface)" strokeWidth={2} />
      {/* label hanya di titik terakhir */}
      {index === lastIndex && (
        <text
          x={cx}
          y={cy - 12}
          textAnchor="middle"
          className="fill-gray-800 dark:fill-gray-100"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          {payload.percent}%
        </text>
      )}
    </g>
  );
};

// ─── Component ────────────────────────────────────────────────────────────

interface AttendanceTrendChartProps {
  logs: TrendLog[] | undefined;
  loading?: boolean;
  /** Tinggi area grafik (px). */
  height?: number;
}

const AttendanceTrendChart = memo(({ logs, loading = false, height = 200 }: AttendanceTrendChartProps) => {
  const [mode, setMode] = useState<Granularity | null>(null);
  const [showTable, setShowTable] = useState(false);

  const monthBuckets = useMemo(() => buildBuckets(logs || [], "month"), [logs]);
  const weekBuckets = useMemo(() => buildBuckets(logs || [], "week"), [logs]);

  // Kalau data baru mencakup < 3 bulan, tren mingguan lebih informatif.
  const granularity: Granularity = mode ?? (monthBuckets.length < 3 ? "week" : "month");
  const data = granularity === "month" ? monthBuckets : weekBuckets;

  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const delta = last && prev ? last.percent - prev.percent : null;
  const periodWord = granularity === "month" ? "bulan" : "minggu";

  return (
    <div
      className={
        "bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800 " +
        "text-gray-500 dark:text-gray-400 " +
        "[--trend:#059669] [--surface:#ffffff] [--grid:#e5e7eb] [--grid-strong:#9ca3af] " +
        "dark:[--trend:#0f9f73] dark:[--surface:#111827] dark:[--grid:#1f2937] dark:[--grid-strong:#6b7280]"
      }
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" /> Tren Kehadiran
          </h3>
          <p className="text-xs mt-0.5">
            {last ? (
              <>
                {last.percent}% pada {last.fullLabel.toLowerCase()}
                {delta !== null && (
                  <>
                    {" · "}
                    {delta === 0
                      ? `sama seperti ${periodWord} sebelumnya`
                      : `${delta > 0 ? "naik" : "turun"} ${Math.abs(delta)} poin dari ${periodWord} sebelumnya`}
                  </>
                )}
              </>
            ) : (
              "Persentase hadir (termasuk terlambat) per " + periodWord
            )}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-[11px]">
            {(["month", "week"] as Granularity[]).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={granularity === g}
                onClick={() => setMode(g)}
                className={
                  "px-2 py-1 font-medium transition-colors " +
                  (granularity === g
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800")
                }
              >
                {g === "month" ? "Bulan" : "Minggu"}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={showTable}
            aria-label={showTable ? "Tampilkan grafik" : "Tampilkan tabel"}
            title={showTable ? "Tampilkan grafik" : "Tampilkan tabel"}
            onClick={() => setShowTable((v) => !v)}
            className={
              "p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors " +
              (showTable
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800")
            }
          >
            <Table2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat grafik...
        </div>
      ) : data.length === 0 ? (
        <p className="text-center text-xs py-10">Belum ada data absensi untuk dibuatkan grafik.</p>
      ) : showTable ? (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-xs min-w-[420px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                <th className="py-2 pr-2 font-semibold">Periode</th>
                <th className="py-2 px-2 font-semibold text-right">Hadir</th>
                <th className="py-2 px-2 font-semibold text-right">Telat</th>
                <th className="py-2 px-2 font-semibold text-right">Izin</th>
                <th className="py-2 px-2 font-semibold text-right">Sakit</th>
                <th className="py-2 px-2 font-semibold text-right">Alpa</th>
                <th className="py-2 pl-2 font-semibold text-right">Kehadiran</th>
              </tr>
            </thead>
            <tbody className="text-gray-800 dark:text-gray-100">
              {[...data].reverse().map((b) => (
                <tr key={b.key} className="border-b border-gray-50 dark:border-gray-800 last:border-b-0">
                  <td className="py-2 pr-2">{b.fullLabel}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{b.hadir}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{b.terlambat}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{b.izin}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{b.sakit}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{b.alpa}</td>
                  <td className="py-2 pl-2 text-right tabular-nums font-semibold">{b.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          role="img"
          aria-label={`Grafik garis tren kehadiran per ${periodWord}. Terakhir ${last.percent} persen. Tersedia juga dalam bentuk tabel.`}
          style={{ width: "100%", height }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 22, right: 20, bottom: 0, left: 0 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: "var(--grid)" }}
                tick={{ fontSize: 11, fill: "currentColor" }}
                interval="preserveStartEnd"
                tickMargin={8}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => `${v}%`}
                tickLine={false}
                axisLine={false}
                width={40}
                tick={{ fontSize: 11, fill: "currentColor" }}
              />
              <Tooltip
                content={<TrendTooltip />}
                cursor={{ stroke: "var(--grid-strong)", strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="percent"
                name="Kehadiran"
                stroke="var(--trend)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={makeDotRenderer(data.length - 1)}
                activeDot={{ r: 5, fill: "var(--trend)", stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
});
AttendanceTrendChart.displayName = "AttendanceTrendChart";

export default AttendanceTrendChart;
