#!/bin/bash
# =====================================================================
# ADD COPY FEATURE — Night Shift (Piket Malam)
# Fitur: Salin kwitansi ke bulan lain
# Jalankan: bash add-copy-feature-night-shift.sh
# =====================================================================

set -e

FILE="src/pages/NightShiftPayments.tsx"
BACKUP="src/pages/NightShiftPayments.tsx.bak-copy-$(date +%Y%m%d%H%M%S)"

echo "╔════════════════════════════════════════════╗"
echo "║  ADD COPY FEATURE — Piket Malam            ║"
echo "╚════════════════════════════════════════════╝"
echo ""

if [ ! -f "$FILE" ]; then
  echo "❌ ERROR: $FILE tidak ditemukan!"
  exit 1
fi

cp "$FILE" "$BACKUP"
echo "✅ Backup: $BACKUP"
echo ""

# ============================================
# CEK: Apakah sudah dipatch?
# ============================================
if grep -q "copyBatchMutation" "$FILE"; then
  echo "⚠️  Fitur Copy sudah ada di file ini."
  echo "   Melewati patch untuk menghindari duplikasi."
  echo ""
  echo "   Kalau ingin patch ulang, restore dari backup dulu:"
  echo "   cp $BACKUP $FILE"
  echo "   lalu jalankan ulang script ini."
  exit 0
fi

# ============================================
# PATCH 1: Tambah import CopyPlus
# ============================================
echo "🔧 Patch 1/4: Tambah imports..."

if ! grep -q "CopyPlus" "$FILE"; then
  # Cari baris import lucide-react, tambah CopyPlus setelah Pencil
  sed -i 's/  Plus, Trash2, CalendarIcon, Settings, FileDown, Pencil,/  Plus, Trash2, CalendarIcon, Settings, FileDown, Pencil, CopyPlus,/' "$FILE"
  echo "  ✅ Icon CopyPlus ditambahkan"
else
  echo "  ⏭️  Icon CopyPlus sudah ada"
fi

echo ""

# ============================================
# PATCH 2: Tambah state copyDialog
# ============================================
echo "🔧 Patch 2/4: Tambah state copyDialog..."

python3 << 'PYEOF'
import re

with open('src/pages/NightShiftPayments.tsx', 'r') as f:
    content = f.read()

# Cek apakah sudah ada state
if 'copyDialogBatch' in content:
    print("  ⏭️  State copyDialogBatch sudah ada")
else:
    # Cari baris deleteRateId state
    marker = "const [deleteRateId, setDeleteRateId] = useState<string | null>(null);"
    if marker in content:
        # Tambah state baru setelah marker
        new_states = marker + """

  // Copy dialog state
  const [copyDialogBatch, setCopyDialogBatch] = useState<NightShiftBatch | null>(null);
  const [copyTargetMonth, setCopyTargetMonth] = useState<number>(new Date().getMonth() + 1);
  const [copyTargetYear, setCopyTargetYear] = useState<number>(new Date().getFullYear());"""
        content = content.replace(marker, new_states, 1)
        with open('src/pages/NightShiftPayments.tsx', 'w') as f:
            f.write(content)
        print("  ✅ State copyDialogBatch ditambahkan")
    else:
        print("  ❌ Marker deleteRateId tidak ditemukan")
        exit(1)
PYEOF

echo ""

# ============================================
# PATCH 3: Tambah copyBatchMutation
# ============================================
echo "🔧 Patch 3/4: Tambah copyBatchMutation..."

python3 << 'PYEOF'
with open('src/pages/NightShiftPayments.tsx', 'r') as f:
    content = f.read()

if 'copyBatchMutation' in content:
    print("  ⏭️  copyBatchMutation sudah ada")
else:
    # Cari akhir deleteBatchMutation
    marker = "  const deleteBatchMutation = useMutation({"
    if marker in content:
        idx = content.find(marker)
        # Cari penutup "  });" setelah marker
        end_idx = content.find("\n  });", idx)
        if end_idx != -1:
            insert_pos = end_idx + len("\n  });")

            copy_mutation = '''

  // ============================================
  // MUTATIONS — COPY BATCH
  // ============================================
  const copyBatchMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not found");
      if (!copyDialogBatch) throw new Error("Tidak ada kwitansi untuk disalin");

      const originalWorkers = copyDialogBatch.night_shift_payments || [];
      if (originalWorkers.length === 0) throw new Error("Kwitansi asal tidak memiliki petugas");

      // Tanggal baru berdasarkan bulan & tahun yang dipilih
      const targetDate = new Date(copyTargetYear, copyTargetMonth - 1, 1);
      const monthNames = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
      ];
      const monthName = monthNames[copyTargetMonth - 1];

      // Generate new batch_number
      const batch_number = `KPM-${format(new Date(), "yyyyMMdd")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      // Judul baru: replace bulan & tahun dalam judul asal
      let newTitle = copyDialogBatch.job_title;
      const monthRegex = /(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\\s+\\d{4}/i;
      if (monthRegex.test(newTitle)) {
        newTitle = newTitle.replace(monthRegex, `${monthName} ${copyTargetYear}`);
      } else {
        newTitle = `${newTitle} - ${monthName} ${copyTargetYear}`;
      }

      // Insert batch baru
      const { data: newBatch, error: batchError } = await supabase
        .from("night_shift_batches")
        .insert({
          batch_number,
          job_title: newTitle,
          description: copyDialogBatch.description,
          receipt_date: format(targetDate, "yyyy-MM-dd"),
          tax_rate: copyDialogBatch.tax_rate,
          tax_type: copyDialogBatch.tax_type,
          shift_type: copyDialogBatch.shift_type,
          total_gross: copyDialogBatch.total_gross,
          total_tax: copyDialogBatch.total_tax,
          total_net: copyDialogBatch.total_net,
          created_by: user.id,
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Insert semua worker
      const today = format(new Date(), "yyyy-MM-dd");
      const workersToInsert = originalWorkers.map((w) => ({
        batch_id: newBatch.id,
        worker_name: w.worker_name,
        position_type: w.position_type,
        start_date: today,
        end_date: today,
        shift_count: w.shift_count,
        nightly_rate: w.nightly_rate,
        gross_amount: w.gross_amount,
        tax_amount: w.tax_amount,
        net_amount: w.net_amount,
        notes: w.notes || null,
      }));

      const { error: workersError } = await supabase
        .from("night_shift_payments")
        .insert(workersToInsert);

      if (workersError) {
        await supabase.from("night_shift_batches").delete().eq("id", newBatch.id);
        throw workersError;
      }

      return { newBatchNumber: batch_number, newTitle };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["night-shift-batches"] });
      toast.success(`Kwitansi berhasil disalin menjadi "${data.newTitle}"`);
      setCopyDialogBatch(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });
'''
            content = content[:insert_pos] + copy_mutation + content[insert_pos:]
            with open('src/pages/NightShiftPayments.tsx', 'w') as f:
                f.write(content)
            print("  ✅ copyBatchMutation ditambahkan")
        else:
            print("  ❌ Tidak menemukan penutup deleteBatchMutation")
            exit(1)
    else:
        print("  ❌ Marker deleteBatchMutation tidak ditemukan")
        exit(1)
PYEOF

echo ""

# ============================================
# PATCH 4: Tambah tombol Copy di tabel
# ============================================
echo "🔧 Patch 4/4: Tambah tombol Copy & Dialog..."

python3 << 'PYEOF'
with open('src/pages/NightShiftPayments.tsx', 'r') as f:
    content = f.read()

# 1. Tambah tombol Copy setelah tombol Edit
if 'setCopyDialogBatch(batch)' not in content:
    # Pattern tombol Edit
    old_button = '''<Button variant="outline" size="icon" onClick={() => openEditDialog(batch)} title="Edit Kwitansi">
                                  <Pencil className="h-4 w-4 text-blue-500" />
                                </Button>'''
    
    new_button = old_button + '''
                                <Button variant="outline" size="icon" onClick={() => setCopyDialogBatch(batch)} title="Salin Kwitansi ke Bulan Lain">
                                  <CopyPlus className="h-4 w-4 text-emerald-600" />
                                </Button>'''
    
    if old_button in content:
        content = content.replace(old_button, new_button, 1)
        print("  ✅ Tombol Copy ditambahkan di tabel")
    else:
        # Coba pattern yang lebih umum
        import re
        pattern = r'(<Button variant="outline" size="icon" onClick=\{\(\) => openEditDialog\(batch\)\} title="Edit Kwitansi">\s*<Pencil className="h-4 w-4 text-blue-500" />\s*</Button>)'
        if re.search(pattern, content):
            def repl(m):
                return m.group(1) + '''
                                <Button variant="outline" size="icon" onClick={() => setCopyDialogBatch(batch)} title="Salin Kwitansi ke Bulan Lain">
                                  <CopyPlus className="h-4 w-4 text-emerald-600" />
                                </Button>'''
            content = re.sub(pattern, repl, content, count=1)
            print("  ✅ Tombol Copy ditambahkan di tabel (via regex)")
        else:
            print("  ⚠️  Pattern tombol Edit tidak ditemukan")
else:
    print("  ⏭️  Tombol Copy sudah ada")

# 2. Tambah Dialog Copy sebelum AlertDialog deleteBatchId
if '<Dialog open={!!copyDialogBatch}' not in content:
    marker = '          <AlertDialog open={!!deleteBatchId}'
    if marker in content:
        copy_dialog = '''          {/* ============================================ */}
          {/* COPY DIALOG                                   */}
          {/* ============================================ */}
          <Dialog open={!!copyDialogBatch} onOpenChange={(open) => !open && setCopyDialogBatch(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CopyPlus className="h-5 w-5 text-emerald-600" />
                  Salin Kwitansi ke Bulan Lain
                </DialogTitle>
              </DialogHeader>

              {copyDialogBatch && (
                <div className="space-y-4">
                  <Card className="bg-muted/50">
                    <CardContent className="p-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Kwitansi Asal:</span>
                        <span className="font-mono text-xs">{copyDialogBatch.batch_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Judul:</span>
                        <span className="font-medium text-right max-w-[200px] truncate">{copyDialogBatch.job_title}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Jumlah Petugas:</span>
                        <span className="font-medium">{copyDialogBatch.night_shift_payments?.length || 0} orang</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Netto:</span>
                        <span className="font-bold text-primary">
                          {formatCurrency(Number(copyDialogBatch.total_net))}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 grid-cols-2">
                    <div className="space-y-2">
                      <Label>Bulan Tujuan *</Label>
                      <Select
                        value={String(copyTargetMonth)}
                        onValueChange={(value) => setCopyTargetMonth(Number(value))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Januari</SelectItem>
                          <SelectItem value="2">Februari</SelectItem>
                          <SelectItem value="3">Maret</SelectItem>
                          <SelectItem value="4">April</SelectItem>
                          <SelectItem value="5">Mei</SelectItem>
                          <SelectItem value="6">Juni</SelectItem>
                          <SelectItem value="7">Juli</SelectItem>
                          <SelectItem value="8">Agustus</SelectItem>
                          <SelectItem value="9">September</SelectItem>
                          <SelectItem value="10">Oktober</SelectItem>
                          <SelectItem value="11">November</SelectItem>
                          <SelectItem value="12">Desember</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tahun Tujuan *</Label>
                      <Input
                        type="number"
                        min={2020}
                        max={2100}
                        value={copyTargetYear}
                        onChange={(e) => setCopyTargetYear(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-900 dark:text-emerald-100">
                    <p className="font-semibold mb-1">📋 Yang akan disalin:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>{copyDialogBatch.night_shift_payments?.length || 0} petugas + data lengkap</li>
                      <li>Jenis pajak & tarif pajak</li>
                      <li>Judul akan otomatis diubah ke bulan tujuan</li>
                    </ul>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setCopyDialogBatch(null)}>
                  Batal
                </Button>
                <Button
                  onClick={() => copyBatchMutation.mutate()}
                  disabled={copyBatchMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {copyBatchMutation.isPending ? "Menyalin..." : "Salin Kwitansi"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

'''
        content = content.replace(marker, copy_dialog + marker, 1)
        print("  ✅ Dialog Copy ditambahkan")
    else:
        print("  ⚠️  Marker deleteBatchId tidak ditemukan")
else:
    print("  ⏭️  Dialog Copy sudah ada")

with open('src/pages/NightShiftPayments.tsx', 'w') as f:
    f.write(content)
PYEOF

echo ""

# ============================================
# VERIFIKASI
# ============================================
echo "🔍 Verifikasi:"
grep -q "copyBatchMutation" "$FILE" && echo "  ✅ copyBatchMutation"
grep -q "copyDialogBatch" "$FILE" && echo "  ✅ copyDialogBatch state"
grep -q "CopyPlus" "$FILE" && echo "  ✅ Icon CopyPlus"
grep -q "setCopyDialogBatch(batch)" "$FILE" && echo "  ✅ Tombol Copy di tabel"
grep -q "Salin Kwitansi ke Bulan Lain" "$FILE" && echo "  ✅ Dialog Copy"
echo ""

# ============================================
# BUILD & DEPLOY
# ============================================
echo "╔════════════════════════════════════════════╗"
echo "║  BUILD & DEPLOY                            ║"
echo "╚════════════════════════════════════════════╝"
echo ""

read -p "Lanjut build & deploy? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🔨 Build..."
  npm run build

  echo ""
  echo "🔄 Reload Nginx..."
  systemctl reload nginx

  echo ""
  echo "✅ SELESAI!"
  echo ""
  echo "🌐 Buka: https://pusaka.smpn8ciamis.sch.id/night-shift-payments"
  echo ""
  echo "📋 Fitur baru:"
  echo "  • Tombol 📋 Copy (hijau) di kolom Aksi setiap kwitansi"
  echo "  • Dialog pilih Bulan + Tahun tujuan"
  echo "  • Preview info kwitansi asal sebelum salin"
  echo "  • Auto-rename judul sesuai bulan tujuan"
  echo "  • Semua petugas + data ikut tersalin"
  echo ""
  echo "🎯 Cara pakai:"
  echo "  1. Klik tombol Copy (📋) di kwitansi yang mau disalin"
  echo "  2. Pilih bulan & tahun tujuan"
  echo "  3. Klik 'Salin Kwitansi'"
  echo "  4. Kwitansi baru muncul di daftar dengan bulan baru"
else
  echo ""
  echo "⏭️  Build dilewatkan. Jalankan manual:"
  echo "   npm run build && systemctl reload nginx"
fi
