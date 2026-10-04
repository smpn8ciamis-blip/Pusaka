#!/usr/bin/env bash
# =============================================================================
# patch-dashboard.sh
# Auto-patch Dashboard PUSAKA NEDELCIS → versi modern
# =============================================================================
set -euo pipefail

# ------------------------------- Config -------------------------------------
PROJECT_ROOT="$(pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".patch-backup/${TIMESTAMP}"

# Warna
C_RED=$'\033[0;31m'; C_GRN=$'\033[0;32m'; C_YLW=$'\033[0;33m'
C_BLU=$'\033[0;34m'; C_CYN=$'\033[0;36m'; C_RST=$'\033[0m'; C_BLD=$'\033[1m'

log()  { echo "${C_BLU}ℹ${C_RST}  $*"; }
ok()   { echo "${C_GRN}✓${C_RST}  $*"; }
warn() { echo "${C_YLW}⚠${C_RST}  $*"; }
err()  { echo "${C_RED}✗${C_RST}  $*" >&2; }
head() { echo; echo "${C_BLD}${C_CYN}▸ $*${C_RST}"; }

# ------------------------------- Preflight ----------------------------------
head "Preflight check"

[[ -f "package.json" ]] || { err "package.json tidak ditemukan. Jalankan dari root project."; exit 1; }
[[ -d "src" ]] || { err "Folder src/ tidak ditemukan."; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  err "Node.js tidak terinstall."
  exit 1
fi

PKG_MANAGER="npm"
[[ -f "pnpm-lock.yaml" ]] && PKG_MANAGER="pnpm"
[[ -f "yarn.lock" ]]      && PKG_MANAGER="yarn"
[[ -f "bun.lockb" ]]      && PKG_MANAGER="bun"

ok "Project root: $PROJECT_ROOT"
ok "Package manager: $PKG_MANAGER"

# ------------------------------- Backup -------------------------------------
head "Backup file lama"

FILES_TO_BACKUP=(
  "src/pages/Dashboard.tsx"
  "src/contexts/AuthContext.tsx"
  "src/index.css"
)

mkdir -p "$BACKUP_DIR"

for f in "${FILES_TO_BACKUP[@]}"; do
  if [[ -f "$f" ]]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$f")"
    cp "$f" "$BACKUP_DIR/$f"
    ok "Backed up: $f"
  else
    warn "Skip (tidak ada): $f"
  fi
done

echo "${C_YLW}Backup tersimpan di: ${C_BLD}${BACKUP_DIR}${C_RST}"

# ------------------------------- Detect paths -------------------------------
head "Deteksi struktur folder"

# Cari lokasi AuthContext (bisa @/contexts atau @contexts)
AUTH_FILE=""
for candidate in "src/contexts/AuthContext.tsx" "src/context/AuthContext.tsx"; do
  [[ -f "$candidate" ]] && AUTH_FILE="$candidate" && break
done
[[ -z "$AUTH_FILE" ]] && { err "AuthContext.tsx tidak ditemukan"; exit 1; }
ok "AuthContext: $AUTH_FILE"

# Path dashboard components
DASHBOARD_DIR="src/components/dashboard"
[[ -d "$DASHBOARD_DIR" ]] || { warn "Folder $DASHBOARD_DIR tidak ada — akan dibuat"; mkdir -p "$DASHBOARD_DIR"; }

# Path pages
PAGES_DIR="src/pages"
[[ -d "$PAGES_DIR" ]] || { warn "Folder $PAGES_DIR tidak ada — akan dibuat"; mkdir -p "$PAGES_DIR"; }

# CSS global
CSS_FILE=""
for candidate in "src/index.css" "src/App.css" "src/globals.css" "src/styles/index.css"; do
  [[ -f "$candidate" ]] && CSS_FILE="$candidate" && break
done
[[ -z "$CSS_FILE" ]] && { warn "CSS global tidak ditemukan — dilewati"; CSS_FILE=""; }

# ------------------------------- Install deps -------------------------------
head "Cek dependency"

NEED_LUCIDE=false
grep -q '"lucide-react"' package.json || NEED_LUCIDE=true

if [[ "$NEED_LUCIDE" == "true" ]]; then
  log "lucide-react belum terpasang — installing..."
  case "$PKG_MANAGER" in
    npm)  npm install lucide-react ;;
    pnpm) pnpm add lucide-react ;;
    yarn) yarn add lucide-react ;;
    bun)  bun add lucide-react ;;
  esac
  ok "lucide-react terpasang"
else
  ok "lucide-react sudah ada"
fi

# ------------------------------- Write components ---------------------------
head "Menulis komponen modern"

# ---------- 1. DashboardWelcomeBanner.tsx ----------
cat > "$DASHBOARD_DIR/DashboardWelcomeBanner.tsx" <<'EOF'
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  profile?: { full_name?: string; role?: string; subject?: string; avatar_url?: string };
  userRole: string;
  teacherData?: { full_name?: string; subject?: string } | null;
}

export function DashboardWelcomeBanner({ profile, userRole, teacherData }: Props) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const greeting =
    time.getHours() < 11 ? 'Selamat pagi'
    : time.getHours() < 15 ? 'Selamat siang'
    : time.getHours() < 18 ? 'Selamat sore'
    : 'Selamat malam';

  const name = profile?.full_name ?? teacherData?.full_name ?? 'Pengguna';
  const subject = teacherData?.subject ?? profile?.subject ?? userRole;

  return (
    <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 text-white shadow-lg shadow-indigo-500/10">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500" />
      <div aria-hidden className="absolute inset-0">
        <div className="absolute -top-16 -left-16 h-56 w-56 rounded-full bg-fuchsia-500/30 blur-3xl" />
        <div className="absolute -bottom-20 right-1/4 h-56 w-56 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute top-1/4 -right-16 h-48 w-48 rounded-full bg-violet-400/30 blur-3xl" />
      </div>
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-white/60 to-white/10 blur-sm" />
            <img
              src={profile?.avatar_url ?? '/default-avatar.png'}
              alt={name}
              className="relative h-16 w-16 rounded-full border-2 border-white/80 object-cover shadow-lg"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white bg-emerald-400 shadow" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
              {name} <span className="inline-block animate-wave">👋</span>
            </h1>
            <p className="mt-0.5 text-sm text-white/85">
              {subject} • {greeting}! Semangat hari ini!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-md">
            <Clock className="h-5 w-5 text-white/90" />
            <div className="leading-tight">
              <div className="font-mono text-lg font-bold tabular-nums">
                {time.toLocaleTimeString('id-ID', { hour12: false })}
              </div>
              <div className="text-[11px] text-white/80">
                {time.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1.5 text-xs font-medium backdrop-blur-md sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Sistem Online
          </div>
        </div>
      </div>
    </div>
  );
}
EOF
ok "DashboardWelcomeBanner.tsx"

# ---------- 2. PendingTasksCards.tsx ----------
cat > "$DASHBOARD_DIR/PendingTasksCards.tsx" <<'EOF'
import { ClipboardList, BookOpen, ArrowRight, type LucideIcon } from 'lucide-react';

interface TaskCardProps {
  title: string;
  count: number;
  unit?: string;
  tone: 'blue' | 'emerald';
  icon: LucideIcon;
  onClick?: () => void;
}

function TaskCard({ title, count, unit = 'kelas', tone, icon: Icon, onClick }: TaskCardProps) {
  const tones = {
    blue: {
      ring: 'from-blue-500 to-indigo-500',
      iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      glow: 'group-hover:shadow-blue-500/20',
      badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    },
    emerald: {
      ring: 'from-emerald-500 to-teal-500',
      iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      glow: 'group-hover:shadow-emerald-500/20',
      badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
  }[tone];

  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-4 text-left backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${tones.glow} dark:border-slate-800 dark:bg-slate-900/70`}
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${tones.ring} opacity-0 transition-opacity group-hover:opacity-100`} />
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tones.iconBg}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{count}</span>
          <span className="text-xs text-slate-500">{unit}</span>
        </div>
        {count > 0 && (
          <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones.badge}`}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            Perlu ditindaklanjuti
          </div>
        )}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
    </button>
  );
}

export function PendingTasksCards({
  absensiPending = 0,
  jurnalPending = 0,
}: {
  absensiPending?: number;
  jurnalPending?: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TaskCard title="Absensi Pending" count={absensiPending} tone="blue" icon={ClipboardList} />
      <TaskCard title="Jurnal Pending" count={jurnalPending} tone="emerald" icon={BookOpen} />
    </div>
  );
}
EOF
ok "PendingTasksCards.tsx"

# ---------- 3. AttendanceTodayCard.tsx ----------
cat > "$DASHBOARD_DIR/AttendanceTodayCard.tsx" <<'EOF'
import { User, Thermometer, FileText, UserX, Users, ClipboardCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

interface AttendanceItem { id: string; name: string }

interface Props {
  date?: Date;
  present?: AttendanceItem[];
  sick?: AttendanceItem[];
  permit?: AttendanceItem[];
  absent?: AttendanceItem[];
}

export function AttendanceTodayCard({
  date = new Date(),
  present = [],
  sick = [],
  permit = [],
  absent = [],
}: Props) {
  const [tab, setTab] = useState<'hadir' | 'sakit' | 'izin' | 'alpa'>('hadir');
  const total = present.length + sick.length + permit.length + absent.length;
  const rate = total ? Math.round((present.length / total) * 100) : 0;

  const tabs = useMemo(
    () => [
      { key: 'hadir' as const, label: 'Hadir', count: present.length },
      { key: 'sakit' as const, label: 'Sakit', count: sick.length },
      { key: 'izin' as const, label: 'Izin', count: permit.length },
      { key: 'alpa' as const, label: 'Alpa', count: absent.length },
    ],
    [present.length, sick.length, permit.length, absent.length],
  );

  const listMap = { hadir: present, sakit: sick, izin: permit, alpa: absent };
  const activeList = listMap[tab];

  const stats = [
    { label: 'Hadir', value: present.length, icon: User, tone: 'emerald' as const },
    { label: 'Sakit', value: sick.length, icon: Thermometer, tone: 'amber' as const },
    { label: 'Izin', value: permit.length, icon: FileText, tone: 'blue' as const },
    { label: 'Alpa', value: absent.length, icon: UserX, tone: 'rose' as const },
    { label: 'Total', value: total, icon: Users, tone: 'slate' as const },
  ];

  const tones = {
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400' },
    rose: { bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400' },
    slate: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300' },
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 backdrop-blur-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
            Kehadiran Siswa Hari Ini
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 transition hover:bg-indigo-500/20 dark:text-indigo-400">
          <ClipboardCheck className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => {
          const t = tones[s.tone];
          return (
            <div key={s.label} className={`rounded-xl ${t.bg} p-3 transition-transform hover:-translate-y-0.5`}>
              <div className={`flex items-center gap-1.5 ${t.text}`}>
                <s.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{s.label}</span>
              </div>
              <div className={`mt-1 text-2xl font-bold tabular-nums ${t.text}`}>{s.value}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-400">Tingkat kehadiran</span>
          <span className="font-semibold text-slate-900 dark:text-white">{rate}%</span>
        </div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 transition-all duration-700"
            style={{ width: `${rate}%` }}
          />
        </div>
      </div>

      {total - present.length > 0 && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500 text-[10px] font-bold text-white">
            {total - present.length}
          </span>
          siswa belum diabsen hari ini
        </div>
      )}

      <div className="mt-5 flex gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-slate-800/60">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
        {activeList.length === 0 ? (
          <li className="py-8 text-center text-sm text-slate-400">Tidak ada data</li>
        ) : (
          activeList.map((item, idx) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {idx + 1}
              </span>
              <span className="text-slate-700 dark:text-slate-200">{item.name}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
EOF
ok "AttendanceTodayCard.tsx"

# ---------- 4. TodayScheduleCard.tsx ----------
cat > "$DASHBOARD_DIR/TodayScheduleCard.tsx" <<'EOF'
import { CalendarDays, Clock, MapPin } from 'lucide-react';

interface ScheduleItem {
  id: string;
  subject: string;
  className: string;
  startTime: string;
  endTime: string;
}

export function TodayScheduleCard({ schedules = [] }: { schedules: ScheduleItem[] }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 backdrop-blur-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <CalendarDays className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          Jadwal Hari Ini
        </h2>
      </div>

      {schedules.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">Tidak ada jadwal hari ini</div>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-dashed border-slate-200 pl-5 dark:border-slate-800">
          {schedules.map((item) => (
            <li key={item.id} className="relative">
              <span className="absolute -left-[27px] top-4 flex h-3 w-3 items-center justify-center">
                <span className="absolute h-3 w-3 animate-ping rounded-full bg-indigo-400 opacity-40" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-slate-900" />
              </span>
              <div className="group rounded-xl border border-slate-200/70 bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-indigo-500/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">{item.subject}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="truncate">{item.className}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Clock className="h-3.5 w-3.5" />
                    {item.startTime} - {item.endTime}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
EOF
ok "TodayScheduleCard.tsx"

# ---------- 5. AnnouncementsCard.tsx ----------
cat > "$DASHBOARD_DIR/AnnouncementsCard.tsx" <<'EOF'
import { Megaphone, ArrowUpRight, Clock } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content?: string;
  createdAt: string;
  url?: string;
}

export function AnnouncementsCard({ announcements = [] }: { announcements: Announcement[] }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 backdrop-blur-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
          <Megaphone className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          Pengumuman Terbaru
        </h2>
      </div>

      {announcements.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">Belum ada pengumuman</div>
      ) : (
        <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {announcements.map((a) => (
            <a
              key={a.id}
              href={a.url ?? '#'}
              className="group block rounded-xl border border-slate-200/70 bg-white p-3.5 transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/5 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-indigo-500/40"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Info
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-indigo-500" />
              </div>
              <h3 className="mt-2 font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                {a.title}
              </h3>
              {a.content && (
                <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{a.content}</p>
              )}
              <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                {a.createdAt}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
EOF
ok "AnnouncementsCard.tsx"

# ------------------------------- Patch CSS ----------------------------------
head "Inject animasi ke CSS"

if [[ -n "$CSS_FILE" ]]; then
  if ! grep -q "animate-wave" "$CSS_FILE"; then
    cat >> "$CSS_FILE" <<'EOF'

/* === PUSAKA NEDELCIS — Dashboard animations === */
@keyframes wave {
  0%, 60%, 100% { transform: rotate(0deg); }
  10%, 30% { transform: rotate(14deg); }
  20% { transform: rotate(-8deg); }
}
.animate-wave { animation: wave 2.5s ease-in-out infinite; transform-origin: 70% 70%; }

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
EOF
    ok "Animasi ditambahkan ke $CSS_FILE"
  else
    warn "Animasi sudah ada di $CSS_FILE — skip"
  fi
else
  warn "Tidak ada file CSS — tambahkan manual"
fi

# ------------------------------- Patch Dashboard ----------------------------
head "Update Dashboard.tsx"

DASHBOARD_FILE="src/pages/Dashboard.tsx"
[[ -f "$DASHBOARD_FILE" ]] || DASHBOARD_FILE="src/Dashboard.tsx"
[[ -f "$DASHBOARD_FILE" ]] || { err "Dashboard.tsx tidak ditemukan"; exit 1; }

# Cek apakah sudah dipatch (marker)
if grep -q "PUSAKA_PATCHED" "$DASHBOARD_FILE"; then
  warn "Dashboard.tsx sudah dipatch sebelumnya — skip"
else
  # Tulis ulang Dashboard.tsx (full replacement)
  cat > "$DASHBOARD_FILE" <<'EOF'
/* PUSAKA_PATCHED_v2 */
import { useAuth } from '@/contexts/AuthContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, lazy, Suspense, useMemo, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useDateRangeFilter } from '@/hooks/useDateRangeFilter';
import { useStudentGenderStats } from '@/hooks/useStudentGenderStats';
import { StudentGenderStatsCard } from '@/components/dashboard/StudentGenderStatsCard';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { useTeacherClassAttendance } from '@/hooks/useTeacherClassAttendance';
import { TeacherClassAttendanceCard } from '@/components/dashboard/TeacherClassAttendanceCard';
import {
  useDashboardStats,
  useTodaySchedules,
  useAttendanceRecap,
  useAttendanceByClass,
  useDailyAttendanceTrend,
  useLateStudents,
  useLateViolationsTrend,
  useAnnouncements,
  useTeacherProfile,
  useTeacherTasks,
  useUserProfile,
  useStudentViolationDetails,
} from '@/hooks/useDashboardData';
import { DashboardWelcomeBanner } from '@/components/dashboard/DashboardWelcomeBanner';
import { DashboardStatsCards } from '@/components/dashboard/DashboardStatsCards';
import { DashboardAttendanceRecap } from '@/components/dashboard/DashboardAttendanceRecap';
import { DashboardTeacherView } from '@/components/dashboard/DashboardTeacherView';
import { WaterLoaderCard } from '@/components/ui/water-progress-loader';

// Modern components
import { PendingTasksCards } from '@/components/dashboard/PendingTasksCards';
import { AttendanceTodayCard } from '@/components/dashboard/AttendanceTodayCard';
import { TodayScheduleCard } from '@/components/dashboard/TodayScheduleCard';
import { AnnouncementsCard } from '@/components/dashboard/AnnouncementsCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ROLE_REDIRECTS: Record<string, string> = {
  super_admin: '/super-admin',
  bendahara: '/bendahara-dashboard',
  tata_usaha: '/tata-usaha-dashboard',
  kesiswaan: '/kesiswaan-dashboard',
  siswa: '/student-dashboard',
  guru_piket: '/guru-piket-dashboard',
  admin_web: '/web-admin',
};

const LOW_ATTENDANCE_THRESHOLD = 80;
const CHART_FALLBACK_HEIGHT = 'min-h-[400px]';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SelectedStudent {
  id: string;
  name: string;
  class: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Lazy components
// ---------------------------------------------------------------------------
const DashboardAttendanceCharts = lazy(() =>
  import('@/components/dashboard/DashboardAttendanceCharts').then((m) => ({ default: m.DashboardAttendanceCharts })),
);
const DashboardLateStudents = lazy(() =>
  import('@/components/dashboard/DashboardLateStudents').then((m) => ({ default: m.DashboardLateStudents })),
);
const PunctualityChart = lazy(() =>
  import('@/components/dashboard/PunctualityChart').then((m) => ({ default: m.PunctualityChart })),
);
const StudentViolationModal = lazy(() =>
  import('@/components/dashboard/StudentViolationModal').then((m) => ({ default: m.StudentViolationModal })),
);

// ---------------------------------------------------------------------------
// Reusable wrappers
// ---------------------------------------------------------------------------
function LazySection({
  children,
  minHeight = CHART_FALLBACK_HEIGHT,
  fallback,
}: {
  children: ReactNode;
  minHeight?: string;
  fallback?: ReactNode;
}) {
  return <Suspense fallback={fallback ?? <WaterLoaderCard className={minHeight} />}>{children}</Suspense>;
}

function Section({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section
      className={`relative rounded-2xl bg-white/70 backdrop-blur-sm dark:bg-slate-900/60 ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </section>
  );
}

function DashboardHeader() {
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 animate-pulse" />
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        Dashboard
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const { userRole, user } = useAuth();
  const { selectedYear, selectedSemester } = useAcademicYear();

  const [selectedStudent, setSelectedStudent] = useState<SelectedStudent | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const { startDate, endDate, setStartDate, setEndDate, setPeriod, getPeriodLabel } = useDateRangeFilter();

  const { data: profile } = useUserProfile(user?.id);
  const { data: stats } = useDashboardStats(userRole, selectedYear, selectedSemester);
  const { data: genderStats } = useStudentGenderStats(selectedYear, userRole, user?.id);
  const { data: todaySchedules } = useTodaySchedules(user?.id, userRole, selectedYear, selectedSemester);
  const { data: attendanceRecap } = useAttendanceRecap(startDate, endDate, selectedYear, selectedSemester);
  const { data: attendanceByClass } = useAttendanceByClass(startDate, endDate, userRole, selectedYear, selectedSemester);
  const { data: dailyAttendanceTrend } = useDailyAttendanceTrend(startDate, endDate, userRole);
  const { data: lateStudents } = useLateStudents(startDate, endDate, userRole);
  const { data: lateViolationsTrend } = useLateViolationsTrend(startDate, endDate, userRole);
  const { data: announcements } = useAnnouncements();
  const { data: teacherData } = useTeacherProfile(user?.id, userRole);
  const { data: teacherTasks } = useTeacherTasks(user?.id, userRole, todaySchedules);
  const { data: studentViolationDetails } = useStudentViolationDetails(selectedStudent, startDate, endDate);
  const { data: teacherClassAttendance } = useTeacherClassAttendance(user?.id, selectedYear, String(selectedSemester));

  const { handleExportPDF, handleExportExcel } = useDashboardExport(startDate, endDate, attendanceRecap);

  const lowAttendanceClasses = useMemo(
    () =>
      attendanceByClass?.filledClasses?.filter(
        (c: { attendanceRate: number; total: number }) => c.attendanceRate < LOW_ATTENDANCE_THRESHOLD && c.total > 0,
      ) ?? [],
    [attendanceByClass],
  );

  const handleStudentClick = (student: SelectedStudent) => {
    setSelectedStudent(student);
    setIsDetailModalOpen(true);
  };
  const handleCloseModal = () => setIsDetailModalOpen(false);

  const redirectTo = userRole ? ROLE_REDIRECTS[userRole] : undefined;
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  // =========================================================================
  // ADMIN
  // =========================================================================
  if (userRole === 'admin') {
    return (
      <DashboardLayout>
        <div className="relative space-y-5 animate-fade-in">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-400/10 blur-3xl" />
            <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-violet-400/10 blur-3xl" />
          </div>

          <DashboardHeader />
          <DashboardWelcomeBanner profile={profile} userRole={userRole} />

          <PendingTasksCards
            absensiPending={(stats as any)?.absensiPending ?? 0}
            jurnalPending={(stats as any)?.jurnalPending ?? 0}
          />

          <AttendanceTodayCard
            present={(stats as any)?.presentList}
            sick={(stats as any)?.sickList}
            permit={(stats as any)?.permitList}
            absent={(stats as any)?.absentList}
          />

          <Section delay={60}>
            <div className="p-4 sm:p-5">
              <DashboardStatsCards stats={stats} />
            </div>
          </Section>

          {genderStats && (
            <Section delay={80}>
              <div className="p-4 sm:p-5">
                <StudentGenderStatsCard
                  totalMale={genderStats.totalMale}
                  totalFemale={genderStats.totalFemale}
                  totalStudents={genderStats.totalStudents}
                  byClass={genderStats.byClass}
                  byGrade={genderStats.byGrade}
                />
              </div>
            </Section>
          )}

          <Section delay={100}>
            <div className="p-4 sm:p-5">
              <DashboardAttendanceRecap
                startDate={startDate}
                endDate={endDate}
                setStartDate={setStartDate}
                setEndDate={setEndDate}
                setPeriod={setPeriod}
                attendanceRecap={attendanceRecap}
                onExportPDF={handleExportPDF}
                onExportExcel={handleExportExcel}
              />
            </div>
          </Section>

          <Section delay={140}>
            <div className="p-4 sm:p-5">
              <LazySection>
                <DashboardAttendanceCharts
                  startDate={startDate}
                  endDate={endDate}
                  dailyAttendanceTrend={dailyAttendanceTrend}
                  attendanceByClass={attendanceByClass}
                  lowAttendanceClasses={lowAttendanceClasses}
                />
              </LazySection>
            </div>
          </Section>

          <Section delay={180}>
            <div className="p-4 sm:p-5">
              <LazySection>
                <PunctualityChart startDate={startDate} endDate={endDate} />
              </LazySection>
            </div>
          </Section>

          <Section delay={220}>
            <div className="p-4 sm:p-5">
              <LazySection>
                <DashboardLateStudents
                  lateStudents={lateStudents || []}
                  lateViolationsTrend={lateViolationsTrend || []}
                  getPeriodLabel={getPeriodLabel}
                  onStudentClick={handleStudentClick}
                />
              </LazySection>
            </div>
          </Section>

          <div className="grid gap-5 md:grid-cols-2">
            <TodayScheduleCard schedules={(todaySchedules as any) || []} />
            <AnnouncementsCard announcements={(announcements as any) || []} />
          </div>
        </div>

        <LazySection fallback={null}>
          <StudentViolationModal
            isOpen={isDetailModalOpen}
            onClose={handleCloseModal}
            selectedStudent={selectedStudent}
            violationDetails={studentViolationDetails || []}
            getPeriodLabel={getPeriodLabel}
          />
        </LazySection>
      </DashboardLayout>
    );
  }

  // =========================================================================
  // TEACHER / fallback
  // =========================================================================
  return (
    <DashboardLayout>
      <div className="relative space-y-5 animate-fade-in">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
        </div>

        <DashboardHeader />
        <DashboardWelcomeBanner profile={profile} userRole={userRole} teacherData={teacherData} />

        <Section delay={40}>
          <div className="p-4 sm:p-5">
            <DashboardTeacherView teacherTasks={teacherTasks} />
          </div>
        </Section>

        {teacherClassAttendance && (
          <Section delay={80}>
            <div className="p-4 sm:p-5">
              <TeacherClassAttendanceCard data={teacherClassAttendance} />
            </div>
          </Section>
        )}

        {teacherClassAttendance?.classId && (
          <Section delay={120}>
            <div className="p-4 sm:p-5">
              <LazySection>
                <PunctualityChart
                  startDate={startDate}
                  endDate={endDate}
                  classId={teacherClassAttendance.classId}
                  title="Ketepatan Waktu Kehadiran Kelas Perwalian"
                />
              </LazySection>
            </div>
          </Section>
        )}

        {genderStats && genderStats.totalStudents > 0 && (
          <Section delay={160}>
            <div className="p-4 sm:p-5">
              <StudentGenderStatsCard
                totalMale={genderStats.totalMale}
                totalFemale={genderStats.totalFemale}
                totalStudents={genderStats.totalStudents}
                byClass={genderStats.byClass}
                byGrade={genderStats.byGrade}
                isTeacher
              />
            </div>
          </Section>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <TodayScheduleCard schedules={(todaySchedules as any) || []} />
          <AnnouncementsCard announcements={(announcements as any) || []} />
        </div>
      </div>
    </DashboardLayout>
  );
}
EOF
  ok "Dashboard.tsx dipatch"
fi

# ------------------------------- Verify build -------------------------------
head "Verifikasi TypeScript"

if command -v npx >/dev/null 2>&1 && [[ -f "tsconfig.json" ]]; then
  if npx --no-install tsc --noEmit 2>/dev/null; then
    ok "TypeScript check lulus"
  else
    warn "TypeScript check menemukan error — cek manual dengan 'npx tsc --noEmit'"
  fi
else
  warn "Skip TypeScript check (tsc/tsconfig tidak tersedia)"
fi

# ------------------------------- Summary ------------------------------------
echo
echo "${C_BLD}${C_GRN}════════════════════════════════════════════${C_RST}"
echo "${C_BLD}${C_GRN}  ✓ PATCH BERHASIL${C_RST}"
echo "${C_BLD}${C_GRN}════════════════════════════════════════════${C_RST}"
echo
echo "  Backup   : ${C_BLD}${BACKUP_DIR}${C_RST}"
echo "  CSS      : ${C_BLD}${CSS_FILE:-'(manual)'}${C_RST}"
echo "  Dashboard: ${C_BLD}${DASHBOARD_FILE}${C_RST}"
echo
echo "${C_YLW}Langkah selanjutnya:${C_RST}"
echo "  1. ${C_BLD}npm run dev${C_RST}  (atau pnpm/yarn/bun dev)"
echo "  2. Cek dashboard di browser"
echo "  3. Kalau ada error, restore dengan:"
echo "     ${C_BLD}cp -r ${BACKUP_DIR}/src/* src/${C_RST}"
echo
echo "${C_CYN}Untuk rollback total:${C_RST}"
echo "  ${C_BLD}bash patch-dashboard.sh --rollback${C_RST}"
echo