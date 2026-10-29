#!/usr/bin/env bash
# Push force ke GitHub (aman: memakai --force-with-lease).
# Pemakaian:  ./push-force.sh [nama-branch] ["pesan commit"]
# Contoh:     ./push-force.sh fitur-agenda "Galeri otomatis, agenda, dan beranda baru"

set -euo pipefail

# Harus dijalankan di dalam repo git
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Bukan folder git. Jalankan dari root proyek."; exit 1; }

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
MSG="${2:-Update website: galeri otomatis, agenda, dan tampilan baru}"
REMOTE="origin"

echo "Repo    : $(git remote get-url "$REMOTE")"
echo "Branch  : $BRANCH"
echo "Pesan   : $MSG"
echo

# Pindah/buat branch bila berbeda dari yang sedang aktif
CURRENT="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT" != "$BRANCH" ]; then
  git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH"
fi

# Peringatan khusus untuk main (alur proyek: branch + PR)
if [ "$BRANCH" = "main" ]; then
  echo "PERINGATAN: Anda akan MENIMPA branch main di GitHub."
  echo "Riwayat commit di GitHub yang tidak ada di komputer ini akan hilang."
  read -r -p "Ketik 'main' untuk melanjutkan: " OK
  [ "$OK" = "main" ] || { echo "Dibatalkan."; exit 1; }
fi

git add -A
if git diff --cached --quiet; then
  echo "Tidak ada perubahan baru untuk di-commit."
else
  git commit -m "$MSG"
fi

# Ambil info terbaru agar --force-with-lease tahu kondisi remote
git fetch "$REMOTE" "$BRANCH" 2>/dev/null || true

echo
echo "Mendorong ke $REMOTE/$BRANCH ..."
if git push --force-with-lease -u "$REMOTE" "$BRANCH"; then
  echo "Berhasil."
else
  echo
  echo "Ditolak: ada commit baru di GitHub yang belum Anda tarik."
  echo "Cek dulu dengan:  git log HEAD..$REMOTE/$BRANCH --oneline"
  echo "Jika yakin ingin menimpa tanpa pengaman, jalankan manual:"
  echo "  git push --force $REMOTE $BRANCH"
  exit 1
fi
