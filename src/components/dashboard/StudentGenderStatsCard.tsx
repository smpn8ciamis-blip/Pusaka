import { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Users,
  UserRound,
  UsersRound,
  Crown,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// =====================================================================
// TYPES
// =====================================================================
interface ClassRow {
  className?: string;
  class_name?: string;
  nama_kelas?: string;
  name?: string;
  kelas?: string;
  nama?: string;
  male?: number;
  female?: number;
  total?: number;
  maleCount?: number;
  femaleCount?: number;
  lakiLaki?: number;
  perempuan?: number;
  [key: string]: any;
}

interface GradeRow {
  grade?: string;
  tingkat?: string;
  male?: number;
  female?: number;
  total?: number;
  [key: string]: any;
}

interface Props {
  totalMale: number;
  totalFemale: number;
  totalStudents: number;
  byClass?: ClassRow[];
  byGrade?: GradeRow[];
}

// =====================================================================
// HELPERS
// =====================================================================
function _getClassLabel(c: ClassRow): string {
  return String(
    c?.className || c?.class_name || c?.nama_kelas ||
    c?.name || c?.kelas || c?.nama || "-"
  );
}

function _getGradeLabel(g: GradeRow): string {
  return String(g?.grade || g?.tingkat || "-");
}

function _getMale(row: any): number {
  return Number(row?.male ?? row?.maleCount ?? row?.lakiLaki ?? row?.L ?? 0);
}

function _getFemale(row: any): number {
  return Number(row?.female ?? row?.femaleCount ?? row?.perempuan ?? row?.P ?? 0);
}

function _getTotal(row: any): number {
  const t = row?.total;
  if (typeof t === "number") return t;
  return _getMale(row) + _getFemale(row);
}

function _normName(n: any): string {
  return String(n || "")
    .replace(/[_\s]*\d{4}\/\d{4}\s*$/, "")
    .trim();
}

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export const StudentGenderStatsCard = memo(function StudentGenderStatsCard({
  totalMale,
  totalFemale,
  totalStudents,
  byClass = [],
  byGrade = [],
}: Props) {
  const [tab, setTab] = useState<"rombel" | "tingkat">("rombel");

  const malePercent = totalStudents > 0
    ? Math.round((totalMale / totalStudents) * 1000) / 10
    : 0;
  const femalePercent = totalStudents > 0
    ? Math.round((totalFemale / totalStudents) * 1000) / 10
    : 0;

  // Sort data
  const sortedClasses = useMemo(() => {
    return [...byClass].sort((a, b) =>
      _getClassLabel(a).localeCompare(_getClassLabel(b), "id", { numeric: true })
    );
  }, [byClass]);

  const sortedGrades = useMemo(() => {
    return [...byGrade].sort((a, b) =>
      _getGradeLabel(a).localeCompare(_getGradeLabel(b), "id", { numeric: true })
    );
  }, [byGrade]);

  return (
    <Card className="relative overflow-hidden border-border/60 backdrop-blur-sm">
      {/* Decorative gradient background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]">
        <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-blue-500 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-pink-500 blur-3xl" />
      </div>

      <CardHeader className="relative pb-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-base sm:text-lg font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">
              Rekap Siswa L/P
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Distribusi gender siswa berdasarkan tahun pelajaran aktif
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative space-y-5">
        {/* ============ TOP STATS ============ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Male */}
          <ModernStatCard
            label="Laki-laki"
            value={totalMale}
            percent={malePercent}
            icon={UserRound}
            gradient="from-blue-500 to-cyan-500"
            bgGradient="from-blue-500/10 via-blue-500/5 to-transparent"
            borderColor="border-blue-500/20"
            textColor="text-blue-600 dark:text-blue-400"
            glow="shadow-blue-500/20"
          />

          {/* Female */}
          <ModernStatCard
            label="Perempuan"
            value={totalFemale}
            percent={femalePercent}
            icon={UsersRound}
            gradient="from-pink-500 to-rose-500"
            bgGradient="from-pink-500/10 via-pink-500/5 to-transparent"
            borderColor="border-pink-500/20"
            textColor="text-pink-600 dark:text-pink-400"
            glow="shadow-pink-500/20"
          />

          {/* Total */}
          <ModernStatCard
            label="Total Siswa"
            value={totalStudents}
            percent={100}
            icon={Crown}
            gradient="from-amber-500 to-orange-500"
            bgGradient="from-amber-500/10 via-amber-500/5 to-transparent"
            borderColor="border-amber-500/20"
            textColor="text-amber-600 dark:text-amber-400"
            glow="shadow-amber-500/20"
            isTotal
          />
        </div>

        {/* ============ PROGRESS BAR ============ */}
        <div className="space-y-3">
          <div className="relative h-4 w-full rounded-full bg-muted/50 overflow-hidden shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${malePercent}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-blue-500 to-cyan-500 rounded-l-full shadow-lg"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shine" />
            </motion.div>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${femalePercent}%` }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.15 }}
              className="absolute top-0 h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-r-full shadow-lg"
              style={{ left: `${malePercent}%` }}
            />
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 shadow-sm" />
                <span className="font-medium">{malePercent}% L</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 shadow-sm" />
                <span className="font-medium">{femalePercent}% P</span>
              </div>
            </div>
            <span className="text-muted-foreground">
              {totalStudents.toLocaleString("id-ID")} siswa
            </span>
          </div>
        </div>

        {/* ============ TABS ============ */}
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as any)}
          className="w-full"
        >
          <TabsList className="w-full h-11 p-1 bg-muted/40 backdrop-blur-sm rounded-xl">
            <TabsTrigger
              value="rombel"
              className="flex-1 h-9 rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-primary transition-all"
            >
              Per Rombel
            </TabsTrigger>
            <TabsTrigger
              value="tingkat"
              className="flex-1 h-9 rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-primary transition-all"
            >
              Per Tingkat
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mt-4"
            >
              <TabsContent value="rombel" className="mt-0">
                <DataTable
                  rows={sortedClasses}
                  labelKey="class"
                  getLabel={_getClassLabel}
                  emptyMessage="Belum ada data kelas"
                />
              </TabsContent>

              <TabsContent value="tingkat" className="mt-0">
                <DataTable
                  rows={sortedGrades}
                  labelKey="grade"
                  getLabel={_getGradeLabel}
                  emptyMessage="Belum ada data tingkat"
                />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </CardContent>
    </Card>
  );
});

StudentGenderStatsCard.displayName = "StudentGenderStatsCard";

// =====================================================================
// SUB-COMPONENT: Modern Stat Card
// =====================================================================
interface StatCardProps {
  label: string;
  value: number;
  percent: number;
  icon: any;
  gradient: string;
  bgGradient: string;
  borderColor: string;
  textColor: string;
  glow: string;
  isTotal?: boolean;
}

const ModernStatCard = memo(function ModernStatCard({
  label,
  value,
  percent,
  icon: Icon,
  gradient,
  bgGradient,
  borderColor,
  textColor,
  glow,
  isTotal,
}: StatCardProps) {
  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-3 sm:p-4",
        "bg-gradient-to-br backdrop-blur-sm",
        bgGradient,
        borderColor,
        "hover:shadow-xl transition-all duration-300",
        glow
      )}
    >
      {/* Decorative gradient blob */}
      <div
        className={cn(
          "absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl bg-gradient-to-br transition-opacity group-hover:opacity-40",
          gradient
        )}
      />

      <div className="relative flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
            {label}
          </p>
          <p
            className={cn(
              "mt-1 font-bold tabular-nums text-2xl sm:text-3xl bg-gradient-to-br bg-clip-text text-transparent",
              gradient
            )}
          >
            {value.toLocaleString("id-ID")}
          </p>
          {!isTotal && (
            <div className="flex items-center gap-1 mt-0.5">
              <TrendingUp className={cn("h-3 w-3", textColor)} />
              <span className={cn("text-[10px] sm:text-xs font-semibold", textColor)}>
                {percent}%
              </span>
            </div>
          )}
          {isTotal && (
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
              siswa terdaftar
            </p>
          )}
        </div>

        <div
          className={cn(
            "h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center shadow-md",
            "bg-gradient-to-br text-white",
            "transition-transform group-hover:scale-110 group-hover:rotate-3",
            gradient
          )}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
    </motion.div>
  );
});

// =====================================================================
// SUB-COMPONENT: Data Table
// =====================================================================
interface DataTableProps {
  rows: any[];
  labelKey: string;
  getLabel: (r: any) => string;
  emptyMessage: string;
}

const DataTable = memo(function DataTable({
  rows,
  labelKey,
  getLabel,
  emptyMessage,
}: DataTableProps) {
  if (!rows || rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center mb-2">
          <Users className="h-6 w-6 text-muted-foreground/50" />
        </div>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden bg-background/50 backdrop-blur-sm">
      {/* Header */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2.5 bg-muted/40 border-b border-border/60 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <div className="col-span-5 sm:col-span-6">{labelKey === "class" ? "Kelas" : "Tingkat"}</div>
        <div className="col-span-2 text-center">L</div>
        <div className="col-span-2 text-center">P</div>
        <div className="col-span-3 sm:col-span-2 text-right">Total</div>
      </div>

      {/* Body */}
      <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {rows.map((row, idx) => {
            const male = _getMale(row);
            const female = _getFemale(row);
            const total = _getTotal(row);
            const malePct = total > 0 ? (male / total) * 100 : 0;
            const femalePct = total > 0 ? (female / total) * 100 : 0;

            return (
              <motion.div
                key={getLabel(row) + idx}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
                className={cn(
                  "group grid grid-cols-12 gap-2 items-center px-3 py-3 border-b border-border/40 last:border-b-0",
                  "hover:bg-primary/5 transition-colors",
                  idx % 2 === 1 && "bg-muted/10"
                )}
              >
                {/* Label */}
                <div className="col-span-5 sm:col-span-6 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold truncate">
                    {_normName(getLabel(row))}
                  </p>
                  {/* Mini bar */}
                  <div className="mt-1.5 h-1 w-full rounded-full bg-muted/60 overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                      style={{ width: `${malePct}%` }}
                    />
                    <div
                      className="h-full bg-gradient-to-r from-rose-500 to-pink-500"
                      style={{ width: `${femalePct}%` }}
                    />
                  </div>
                </div>

                {/* Male */}
                <div className="col-span-2 text-center">
                  <span className="inline-flex items-center justify-center min-w-[32px] h-7 px-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold tabular-nums border border-blue-500/20 group-hover:bg-blue-500/15 transition-colors">
                    {male}
                  </span>
                </div>

                {/* Female */}
                <div className="col-span-2 text-center">
                  <span className="inline-flex items-center justify-center min-w-[32px] h-7 px-2 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400 text-xs font-bold tabular-nums border border-pink-500/20 group-hover:bg-pink-500/15 transition-colors">
                    {female}
                  </span>
                </div>

                {/* Total */}
                <div className="col-span-3 sm:col-span-2 text-right">
                  <span className="text-xs sm:text-sm font-bold tabular-nums">
                    {total}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
});

export default StudentGenderStatsCard;
