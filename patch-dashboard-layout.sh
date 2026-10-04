#!/bin/bash
# =====================================================================
# PATCH DASHBOARD LAYOUT — Tambah Menu "Piket Malam"
# Otomatis memodifikasi: import, adminMenuGroups, bendaharaMenuItems
# Jalankan dari root project: bash patch-dashboard-layout.sh
# =====================================================================

set -e

FILE="src/components/DashboardLayout.tsx"
BACKUP="src/components/DashboardLayout.tsx.bak"

echo "🔧 Patching DashboardLayout.tsx untuk menu Piket Malam..."
echo ""

# ============================================
# VALIDASI
# ============================================
if [ ! -f "$FILE" ]; then
  echo "❌ ERROR: File tidak ditemukan: $FILE"
  echo "   Pastikan Anda menjalankan script dari root project."
  exit 1
fi

# Cek apakah sudah pernah di-patch
if grep -q "night-shift-payments" "$FILE"; then
  echo "⚠️  WARNING: Menu 'Piket Malam' sudah ada di DashboardLayout.tsx"
  echo "   Melewati patch untuk menghindari duplikasi."
  echo ""
  echo "   Jika ingin patch ulang, hapus dulu baris yang mengandung:"
  echo "   'night-shift-payments'"
  exit 0
fi

# Backup
cp "$FILE" "$BACKUP"
echo "✅ Backup dibuat: $BACKUP"
echo ""

# ============================================
# 1. TAMBAH IMPORT MOON
# ============================================
# Cari pattern "LayoutDashboard, Search, Star" di akhir import, tambahkan ", Moon"
if grep -q "LayoutDashboard, Search, Star" "$FILE"; then
  sed -i "s/LayoutDashboard, Search, Star$/LayoutDashboard, Search, Star, Moon/" "$FILE"
  echo "✅ 1/3 — Import Moon ditambahkan"
else
  echo "⚠️  1/3 — Pattern import tidak ditemukan, cek manual."
  echo "     Pastikan ada: 'LayoutDashboard, Search, Star' di akhir import lucide-react"
fi

# ============================================
# 2. TAMBAH MENU DI adminMenuGroups (grup Keuangan)
# ============================================
# Cari baris dengan "Upah Tukang" di adminMenuGroups, tambahkan setelahnya
# Pattern unik: "label: 'Upah Tukang', href: '/worker-payments' },"

if grep -q "label: 'Upah Tukang', href: '/worker-payments' }," "$FILE"; then
  # Gunakan awk untuk insert setelah baris pertama yang cocok
  # (karena pattern muncul 2x — adminMenuGroups dan bendaharaMenuItems)
  awk '
    /label: '"'"'Upah Tukang'"'"', href: '"'"'\/worker-payments'"'"' },/ {
      print
      match($0, /^[ \t]*/)
      indent = substr($0, 1, RLENGTH)
      print indent "{ icon: Moon, label: '"'"'Piket Malam'"'"', href: '"'"'/night-shift-payments'"'"' },"
      next
    }
    { print }
  ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"

  # Hitung berapa kali "Piket Malam" muncul
  COUNT=$(grep -c "label: 'Piket Malam'" "$FILE")
  echo "✅ 2/3 — Menu 'Piket Malam' ditambahkan di $COUNT lokasi (admin + bendahara)"
else
  echo "⚠️  2/3 — Pattern 'Upah Tukang' tidak ditemukan, cek manual."
fi

# ============================================
# 3. VERIFIKASI HASIL
# ============================================
echo ""
echo "🔍 Verifikasi hasil patch:"
echo ""

# Cek import Moon
if grep -q "LayoutDashboard, Search, Star, Moon" "$FILE"; then
  echo "  ✅ Import Moon         : OK"
else
  echo "  ❌ Import Moon         : FAILED"
fi

# Cek menu di adminMenuGroups (indentasi 4 spasi)
if grep -q "    { icon: Moon, label: 'Piket Malam', href: '/night-shift-payments' }," "$FILE"; then
  echo "  ✅ Menu admin (grouped): OK"
else
  echo "  ❌ Menu admin (grouped): FAILED"
fi

# Cek di bendaharaMenuItems (indentasi 2 spasi)
if grep -q "  { icon: Moon, label: 'Piket Malam', href: '/night-shift-payments' }," "$FILE"; then
  echo "  ✅ Menu bendahara      : OK"
else
  echo "  ❌ Menu bendahara      : FAILED"
fi

echo ""
echo "=========================================="
echo "🎉 PATCH SELESAI!"
echo "=========================================="
echo ""
echo "📋 Yang berubah:"
echo "  1. Import: Moon icon ditambahkan"
echo "  2. adminMenuGroups → grup 'Keuangan' → menu 'Piket Malam'"
echo "  3. bendaharaMenuItems → menu 'Piket Malam'"
echo ""
echo "📝 Langkah selanjutnya:"
echo "  1. Update src/App.tsx:"
echo "     • Tambah lazy import:"
echo "       const NightShiftPayments = lazy(() => import(\"./pages/NightShiftPayments\"));"
echo ""
echo "     • Tambah route:"
echo "       <Route path=\"/night-shift-payments\" element={"
echo "         <ProtectedRoute allowedRoles={['bendahara', 'admin']}>"
echo "           <NightShiftPayments />"
echo "         </ProtectedRoute>"
echo "       } />"
echo ""
echo "  2. Jalankan: npm run dev"
echo "  3. Buka: /night-shift-payments"
echo ""
echo "↩️  Rollback jika perlu:"
echo "  cp $BACKUP $FILE"
echo ""
echo "🔍 Cek hasil patch:"
echo "  grep -n 'night-shift-payments' $FILE"
echo ""