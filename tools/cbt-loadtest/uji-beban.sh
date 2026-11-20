#!/usr/bin/env bash
# =============================================================================
# Uji beban CBT PUSAKA dalam SATU perintah. Dijalankan DI SERVER (lewat SSH).
#
#   cd /srv/app/app/tools/cbt-loadtest
#   bash uji-beban.sh --cek                    # periksa kesiapan saja (tidak membuat data)
#   bash uji-beban.sh 50                       # tahap 1: 50 siswa
#   bash uji-beban.sh 200                      # tahap 2: 200 siswa
#   bash uji-beban.sh 650 --serentak --hemat   # tahap 3: skenario terburuk
#   bash uji-beban.sh 650 --jeda-aplikasi --hemat  # paling mirip ujian nyata: memakai jeda acak aplikasi
#
# Skrip ini otomatis: mengambil kunci API dari .env Supabase di server, menolak jalan bila ada
# ujian sungguhan berlangsung, membuat siswa uji (seed), menjalankan uji, merekam CPU/RAM/swap/
# koneksi database/container selama uji, lalu MENGHAPUS data uji dan mencetak ringkasan.
# Hasil lengkap disimpan di folder hasil-uji/<tanggal-jam>/.
#
# Catatan jujur: uji dijalankan di server yang sama, lewat jaringan lokal (tanpa Cloudflare/TLS),
# dan skrip ujinya sendiri ikut memakai sebagian CPU. Jadi angka CPU sedikit lebih tinggi dari
# kenyataan, sedangkan jaringan internet sekolah tidak ikut teruji. Pakai --url untuk lewat alamat publik.
# =============================================================================
set -uo pipefail
cd "$(dirname "$(readlink -f "$0")")" || exit 1

usage() {
  cat <<'EOF'
Pemakaian: bash uji-beban.sh [JUMLAH_SISWA] [opsi]

  JUMLAH_SISWA      jumlah siswa uji (default 50)
  --serentak        semua siswa mulai dan kumpul di detik yang sama (skenario terburuk)
  --jeda-aplikasi   meniru jeda acak aplikasi siswa (nilai dibaca dari src/lib/cbtJitter.ts): daftar ujian, unduh soal,
                    denyut, dan kumpul saat waktu habis serentak. Skenario paling mirip ujian nyata; durasi default 300 dtk
  --durasi N        lama uji dalam detik (default 180; 300 bila --jeda-aplikasi)
  --hemat           hentikan sementara supabase-studio/meta/vector selama uji (dinyalakan lagi otomatis)
  --login-rate N    login per detik (default 5; turunkan bila banyak login gagal)
  --url ALAMAT      alamat API (default: http://127.0.0.1:<port Kong> di server ini)
  --cek             hanya periksa kesiapan, tidak membuat data uji
  --simpan-data     jangan hapus data uji di akhir (default: dihapus otomatis)
  --paksa           tetap jalan walau terdeteksi ujian sungguhan (HATI-HATI). Tulis di perintah yang sama:
                    bash uji-beban.sh 50 --paksa
EOF
}

SISWA=50; DURASI=180; DURASI_SET=0; JEDA=0; SERENTAK=0; HEMAT=0; PAKSA=0; SIMPAN=0; CEK=0; LOGIN_RATE=5; URL_OPT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --serentak) SERENTAK=1 ;;
    --jeda-aplikasi) JEDA=1 ;;
    --hemat) HEMAT=1 ;;
    --paksa) PAKSA=1 ;;
    --simpan-data) SIMPAN=1 ;;
    --cek) CEK=1 ;;
    --durasi) DURASI="${2:-}"; DURASI_SET=1; shift ;;
    --login-rate) LOGIN_RATE="${2:-}"; shift ;;
    --url) URL_OPT="${2:-}"; shift ;;
    -h|--help) usage; exit 0 ;;
    --*) echo "Opsi tidak dikenal: $1"; usage; exit 1 ;;
    *) SISWA="$1" ;;
  esac
  shift
done

die() { echo "✖ $*" >&2; exit 1; }
case "$SISWA$DURASI$LOGIN_RATE" in *[!0-9]*|'') die "Jumlah siswa, --durasi, dan --login-rate harus berupa angka." ;; esac
[ "$SISWA" -ge 1 ] && [ "$SISWA" -le 2000 ] || die "Jumlah siswa harus 1-2000."
[ "$LOGIN_RATE" -ge 1 ] || die "--login-rate minimal 1."
[ "$JEDA" -eq 1 ] && [ "$SERENTAK" -eq 1 ] && die "--jeda-aplikasi tidak bisa digabung dengan --serentak (pilih salah satu)."
[ "$JEDA" -eq 1 ] && [ "$DURASI_SET" -eq 0 ] && DURASI=300

# ---------- 1. Pemeriksaan awal ----------
echo "▶ Pemeriksaan awal…"
command -v node >/dev/null || die "Node.js belum terpasang."
node -e 'process.exit(+process.versions.node.split(".")[0]>=18?0:1)' || die "Node.js harus versi 18 atau lebih baru (cek: node -v)."
command -v docker >/dev/null || die "Docker tidak ditemukan. Jalankan skrip ini di server Pusaka."
command -v curl >/dev/null || die "curl belum terpasang."

# Kunci API dibaca dari .env Supabase (lokasinya dicari lewat container Kong), tidak pernah dicetak.
COMPOSE_DIR=$(docker inspect supabase-kong --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' 2>/dev/null || true)
ENVF=""; if [ -n "$COMPOSE_DIR" ] && [ -r "$COMPOSE_DIR/.env" ]; then ENVF="$COMPOSE_DIR/.env"; fi
envval() { [ -n "$ENVF" ] || return 0; grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
: "${ANON_KEY:=$(envval ANON_KEY)}"
: "${SERVICE_ROLE_KEY:=$(envval SERVICE_ROLE_KEY)}"
KONG_PORT=$(envval KONG_HTTP_PORT); KONG_PORT=${KONG_PORT:-8000}
[ -n "$ANON_KEY" ] && [ -n "$SERVICE_ROLE_KEY" ] || die "Kunci API tidak ditemukan. Isi manual dulu:
   export ANON_KEY='...'; export SERVICE_ROLE_KEY='...'   (ada di file .env Supabase di server)"
export ANON_KEY SERVICE_ROLE_KEY
export SUPABASE_URL="${URL_OPT:-http://127.0.0.1:${KONG_PORT}}"

code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/" 2>/dev/null || true)
[ "$code" = "200" ] || die "API tidak menjawab dengan benar di $SUPABASE_URL (kode: ${code:-tidak ada}). Bila Kong memakai port lain, ulangi dengan --url http://127.0.0.1:PORT"
echo "  ✔ API di $SUPABASE_URL menjawab"

psqlq() { docker exec -i supabase-db psql -U postgres -d postgres -tAX -c "$1" 2>/dev/null | tr -d '[:space:]'; }
# "Ujian sungguhan berlangsung" = sesi in_progress yang masih aktif dalam 15 menit terakhir (heartbeat ~45-60 dtk).
# Sesi lama yang menggantung (siswa menutup browser tanpa mengumpulkan) tidak memblokir uji.
BASE_SQL="from cbt_exam_sessions s join cbt_exams e on e.id=s.exam_id where s.status='in_progress' and e.title not like 'LOADTEST%'"
AKTIF=$(psqlq "select count(*) $BASE_SQL and coalesce(s.last_activity_at, s.created_at) > now() - interval '15 minutes'")
case "$AKTIF" in
  ''|*[!0-9]*)
    [ "$PAKSA" -eq 1 ] || die "Tidak bisa memeriksa ujian yang sedang berlangsung (container supabase-db tidak terbaca). Pastikan tidak ada ujian sungguhan, lalu ulangi dengan --paksa." ;;
  *)
    if [ "$AKTIF" -gt 0 ] && [ "$PAKSA" -eq 0 ]; then
      echo "✖ Ada $AKTIF sesi ujian sungguhan yang aktif dalam 15 menit terakhir (kemungkinan ujian sedang berlangsung):" >&2
      docker exec -i supabase-db psql -U postgres -d postgres -tAX -F ' | ' -c "select '   - ' || e.title || ' | aktif terakhir ' || to_char(coalesce(s.last_activity_at, s.created_at) at time zone 'Asia/Jakarta', 'DD/MM HH24:MI') $BASE_SQL and coalesce(s.last_activity_at, s.created_at) > now() - interval '15 minutes' order by 1 limit 5" >&2 2>/dev/null
      die "Uji beban DIBATALKAN supaya tidak mengganggu siswa. Bila ternyata bukan ujian yang sedang berjalan, ulangi dengan --paksa."
    fi
    LAMA=$(psqlq "select count(*) $BASE_SQL and coalesce(s.last_activity_at, s.created_at) <= now() - interval '15 minutes'")
    echo "  ✔ Tidak ada ujian sungguhan yang sedang aktif"
    case "$LAMA" in ''|0|*[!0-9]*) ;; *) echo "    (ada $LAMA sesi lama berstatus in_progress yang tidak aktif >15 menit; diabaikan, tidak mengganggu uji)" ;; esac ;;
esac
MAXCONN=$(psqlq "show max_connections"); case "$MAXCONN" in ''|*[!0-9]*) MAXCONN=100 ;; esac

if [ "$CEK" -eq 1 ]; then echo "✔ Semua pemeriksaan awal lolos. Tidak ada data yang dibuat (--cek)."; exit 0; fi

# ---------- 2. Persiapan ----------
OUT="hasil-uji/$(date +%Y%m%d-%H%M%S)"; mkdir -p "$OUT"
STOPPED=(); SAMP1=""; SAMP2=""; DONE_CLEAN=0

cleanup() {
  [ "$DONE_CLEAN" -eq 1 ] && return; DONE_CLEAN=1
  [ -n "$SAMP1" ] && kill "$SAMP1" 2>/dev/null
  [ -n "$SAMP2" ] && kill "$SAMP2" 2>/dev/null
  if [ "$SIMPAN" -eq 0 ] && [ -f .state.json ]; then
    echo "▶ Menghapus data uji (cleanup)…"; node loadtest.mjs cleanup 2>&1 | tail -3
  fi
  for c in ${STOPPED[@]+"${STOPPED[@]}"}; do echo "▶ Menyalakan kembali $c"; docker start "$c" >/dev/null 2>&1; done
}
trap cleanup EXIT
trap 'echo; echo "Dihentikan."; exit 130' INT
trap 'exit 143' TERM

if [ -f .state.json ]; then echo "▶ Data uji lama ditemukan, dihapus dulu…"; node loadtest.mjs cleanup 2>&1 | tail -3; fi

if [ "$HEMAT" -eq 1 ]; then
  for c in supabase-studio supabase-meta supabase-vector; do
    if [ -n "$(docker ps -q -f "name=^${c}$" 2>/dev/null)" ]; then docker stop "$c" >/dev/null 2>&1 && STOPPED+=("$c") && echo "  ⏸ $c dihentikan sementara"; fi
  done
fi

# ---------- 3. Perekam beban server ----------
sampler() { # epoch,cpu%,load1,mem_tersedia_MB,mem_terpakai_MB,swap_terpakai_MB,koneksi_db tiap 2 detik
  local out="$1" u n s id io irq sq st rest pt pi t i dt di cpu load ma mt sx sf conn="" k=0
  read -r _ u n s id io irq sq st rest < /proc/stat
  pt=$((u+n+s+id+io+irq+sq+st)); pi=$((id+io))
  echo "epoch,cpu,load1,mem_avail_mb,mem_used_mb,swap_used_mb,db_conn" > "$out"
  while :; do
    sleep 2
    read -r _ u n s id io irq sq st rest < /proc/stat
    t=$((u+n+s+id+io+irq+sq+st)); i=$((id+io)); dt=$((t-pt)); di=$((i-pi)); pt=$t; pi=$i
    cpu=$(( dt > 0 ? 100*(dt-di)/dt : 0 ))
    load=$(cut -d' ' -f1 /proc/loadavg)
    read -r ma mt sx sf < <(awk '/^MemAvailable/{a=$2}/^MemTotal/{t=$2}/^SwapTotal/{x=$2}/^SwapFree/{f=$2}END{print a+0,t+0,x+0,f+0}' /proc/meminfo)
    k=$((k+1)); if [ $((k % 5)) -eq 1 ]; then conn=$(psqlq "select count(*) from pg_stat_activity"); fi
    echo "$(date +%s),$cpu,$load,$((ma/1024)),$(((mt-ma)/1024)),$(((sx-sf)/1024)),$conn" >> "$out"
  done
}
docker_sampler() { # epoch,container,cpu% (100% = 1 core),RAM MB tiap 15 detik (docker stats cukup berat, jadi jarang)
  local out="$1"; echo "epoch,name,cpu,mem_mb" > "$out"
  while :; do
    docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' 2>/dev/null | awk -F'|' -v e="$(date +%s)" '{gsub(/%/,"",$2); split($3,m," "); v=m[1]; mb=v+0; if (v ~ /GiB|GB/) mb=v*1024; else if (v ~ /KiB|kB|KB/) mb=v/1024; printf "%s,%s,%s,%.0f\n", e,$1,$2,mb}' >> "$out"
    sleep 15
  done
}

# ---------- 4. Seed, uji, ringkasan ----------
echo "▶ 1/3 Membuat $SISWA siswa uji (seed)…"
node loadtest.mjs seed --students "$SISWA" --questions 40 2>&1 | tee "$OUT/seed.log"
[ "${PIPESTATUS[0]}" -eq 0 ] || die "Seed gagal. Lihat $OUT/seed.log (data setengah jadi dibersihkan otomatis)."

ARGS=(run --students "$SISWA" --duration "$DURASI" --login-rate "$LOGIN_RATE")
MODE="bertahap (ramp 20 dtk)"; if [ "$SERENTAK" -eq 1 ]; then ARGS+=(--sync-start --sync-submit); MODE="SERENTAK (mulai dan kumpul bersamaan)"; fi
if [ "$JEDA" -eq 1 ]; then ARGS+=(--app-jitter); MODE="meniru jeda acak aplikasi (waktu habis serentak)"; fi
echo "▶ 2/3 Menjalankan uji: $SISWA siswa, $DURASI dtk, $MODE"
echo "   Perkiraan total ±$(( (SISWA / LOGIN_RATE + DURASI + 90) / 60 + 1 )) menit (login $SISWA siswa saja ±$(( SISWA / LOGIN_RATE )) dtk). Tekan Ctrl+C untuk membatalkan; data uji tetap dibersihkan."

sampler "$OUT/metrics.csv" & SAMP1=$!
docker_sampler "$OUT/docker.csv" & SAMP2=$!
sleep 7                         # beberapa cuplikan 'sebelum uji' sebagai pembanding
T0=$(date +%s)
node loadtest.mjs "${ARGS[@]}" 2>&1 | tee "$OUT/run.log"
sleep 3
kill "$SAMP1" "$SAMP2" 2>/dev/null; SAMP1=""; SAMP2=""

# kolom: 2=cpu 3=load 4=mem_avail 5=mem_used 6=swap 7=db_conn. Keluaran: rata-rata p95 maks min
stat_col() {
  awk -F, -v c="$2" -v t0="$T0" -v mode="$3" 'NR>1 && ((mode=="base" && $1<t0) || (mode=="run" && $1>=t0)) && $c!="" {print $c}' "$1" \
    | sort -n | awk '{a[NR]=$1; s+=$1} END{ if(NR==0){print "0 0 0 0"; exit} i=int(0.95*NR); if(i<1)i=1; printf "%.1f %.1f %.1f %.1f\n", s/NR, a[i], a[NR], a[1] }'
}
read -r cpu_avg cpu_p95 cpu_max _ <<<"$(stat_col "$OUT/metrics.csv" 2 run)"
read -r cpu_b _ _ _ <<<"$(stat_col "$OUT/metrics.csv" 2 base)"
read -r _ _ load_max _ <<<"$(stat_col "$OUT/metrics.csv" 3 run)"
read -r _ _ _ mem_min <<<"$(stat_col "$OUT/metrics.csv" 4 run)"
read -r _ _ mem_used_max _ <<<"$(stat_col "$OUT/metrics.csv" 5 run)"
read -r _ _ swap_max _ <<<"$(stat_col "$OUT/metrics.csv" 6 run)"
read -r _ _ conn_max _ <<<"$(stat_col "$OUT/metrics.csv" 7 run)"
nsamp=$(awk -F, -v t0="$T0" 'NR>1 && $1>=t0' "$OUT/metrics.csv" | wc -l)

ge() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a>=b)}'; }
lt() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a<b)}'; }
WARN=()
ge "$cpu_p95" 90 && WARN+=("CPU server hampir penuh (p95 ${cpu_p95}%).")
{ ge "$cpu_p95" 75 && ! ge "$cpu_p95" 90; } && WARN+=("CPU cukup tinggi (p95 ${cpu_p95}%), sisa ruang tipis.")
[ "$nsamp" -gt 0 ] && lt "$mem_min" 800 && WARN+=("RAM tersedia sempat tinggal ${mem_min} MB (<800 MB).")
ge "$swap_max" 256 && WARN+=("Swap terpakai sampai ${swap_max} MB: RAM kurang.")
awk -v c="$conn_max" -v m="$MAXCONN" 'BEGIN{exit !(c>0 && c*100>=80*m)}' && WARN+=("Koneksi database puncak ${conn_max} dari batas ${MAXCONN}.")
[ "$nsamp" -gt 0 ] || WARN+=("Tidak ada cuplikan server selama uji; data CPU/RAM tidak bisa dinilai.")
HASIL_LT=$(grep -E '^HASIL:' "$OUT/run.log" | tail -1)

ringkasan() {
  echo
  echo "================ RINGKASAN UJI BEBAN ================"
  echo "Tanggal      : $(date '+%d/%m/%Y %H:%M')   Siswa: $SISWA   Mode: $MODE   Durasi: ${DURASI} dtk"
  echo "Alamat API   : $SUPABASE_URL   (uji dijalankan di server ini)"
  echo
  echo "-- Server selama uji ($nsamp cuplikan @2 dtk) --"
  echo "CPU 2 core   : rata-rata ${cpu_avg}%  p95 ${cpu_p95}%  puncak ${cpu_max}%   (sebelum uji: ${cpu_b}%)"
  echo "Load average : puncak ${load_max}   (2 core: >2 berarti antre)"
  echo "RAM          : terpakai puncak ${mem_used_max} MB, tersedia terendah ${mem_min} MB"
  echo "Swap         : terpakai puncak ${swap_max} MB"
  echo "Koneksi DB   : puncak ${conn_max} dari batas ${MAXCONN}"
  echo
  echo "-- Container paling sibuk (puncak; CPU 100% = 1 core; cuplikan tiap 15 dtk) --"
  awk -F, -v t0="$T0" 'NR>1 && $1>=t0 { if ($3+0>c[$2]) c[$2]=$3+0; if ($4+0>m[$2]) m[$2]=$4+0 } END { for (k in c) printf "%-28s CPU %6.1f%%   RAM %5d MB\n", k, c[k], m[k] }' "$OUT/docker.csv" | sort -k3 -nr | head -5
  echo
  echo "-- Hasil API (dari loadtest) --"
  echo "${HASIL_LT:-HASIL: tidak ditemukan (uji berhenti sebelum selesai?)}"
  echo "Tabel lengkap: $OUT/run.log"
  echo
  if [ "${#WARN[@]}" -eq 0 ] && echo "$HASIL_LT" | grep -q LOLOS; then
    echo "KESIMPULAN: ✔ AMAN. Tidak ada tanda kelebihan beban pada skenario ini ($SISWA siswa, $MODE)."
  elif echo "$HASIL_LT" | grep -q LOLOS; then
    echo "KESIMPULAN: ⚠ Lolos, tetapi ada catatan:"; for w in "${WARN[@]}"; do echo "  - $w"; done
  else
    echo "KESIMPULAN: ✖ PERLU PERHATIAN."; for w in ${WARN[@]+"${WARN[@]}"}; do echo "  - $w"; done
    echo "  Kirim isi folder $OUT (terutama ringkasan.txt dan run.log) untuk dianalisis."
  fi
  echo
  echo "Catatan: uji berjalan di server yang sama lewat jaringan lokal; skripnya ikut memakai CPU,"
  echo "dan internet/Cloudflare sekolah tidak ikut teruji. Angka CPU cenderung sedikit lebih tinggi dari kenyataan."
  echo "====================================================="
}
echo "▶ 3/3 Ringkasan"
ringkasan | tee "$OUT/ringkasan.txt"
echo "Hasil lengkap tersimpan di: $(pwd)/$OUT"
