#!/bin/bash
# =====================================================================
# ADD COPY FEATURE — Weekend Shift (Piket Sabtu Minggu)
# Fitur: Salin kwitansi ke bulan lain
# Jalankan: bash add-copy-feature-weekend-shift.sh
# =====================================================================

set -e

FILE="src/pages/WeekendShiftPayments.tsx"
BACKUP="src/pages/WeekendShiftPayments.tsx.bak-copy-$(date +%Y%m%d%H%M%S)"

echo "╔════════════════════════════════════════════╗"
echo "║  ADD COPY FEATURE — Piket Sabtu Minggu     ║"
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
# PATCH 1: Tambah import Copy + Sheet
# ============================================
echo "🔧 Patch 1/4: Tambah imports..."

# Tambah icon Copy setelah Pencil
if ! grep -q "Copy," "$FILE"; then
  sed -i 's/  Plus, Trash2, CalendarIcon, Settings, FileDown, Pencil,/  Plus, Trash2, CalendarIcon, Settings, FileDown, Pencil, Copy, CopyPlus,/' "$FILE"
  echo "  ✅ Icon Copy + CopyPlus ditambahkan"
fi

# Tambah import Select untuk bulan/tahun (sudah ada, skip)
echo ""

# ============================================
# PATCH 2: Tambah state & mutation untuk copy
# ============================================
echo "🔧 Patch 2/4: Tambah state copyDialog..."

# Cek apakah sudah pernah dipatch
if grep -q "copyDialogBatch" "$FILE"; then
  echo "  ⏭️  Sudah ada, skip."
else
  # Tambah state setelah deleteRateId
  perl -i -0pe 's/(\s+const \[deleteRateId, setDeleteRateId\] = useState<string \| null>\(null\);)/$1\n\n  \/\/ Copy dialog state\n  const [copyDialogBatch, setCopyDialogBatch] = useState<WeekendShiftBatch | null>(null);\n  const [copyTargetMonth, setCopyTargetMonth] = useState<number>(new Date().getMonth() + 1);\n  const [copyTargetYear, setCopyTargetYear] = useState<number>(new Date().getFullYear());/' "$FILE"
  echo "  ✅ State copyDialog ditambahkan"
fi

echo ""

# ============================================
# PATCH 3: Tambah mutation copyBatchMutation
# ============================================
echo "🔧 Patch 3/4: Tambah copyBatchMutation..."

if grep -q "copyBatchMutation" "$FILE"; then
  echo "  ⏭️  Sudah ada, skip."
else
  # Sisipkan mutation setelah deleteBatchMutation
  # Kita pakai python untuk insert karena lebih aman dari perl multi-line
  python3 << 'PYEOF'
import re
with open('src/pages/WeekendShiftPayments.tsx', 'r') as f:
    content = f.read()

# Cari akhir deleteBatchMutation dan sisipkan setelahnya
marker = "  const deleteBatchMutation = useMutation({"
if marker in content and "copyBatchMutation" not in content:
    # Cari posisi akhir deleteBatchMutation
    idx = content.find(marker)
    # Cari `});` yang menutup deleteBatchMutation (setelah marker)
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

      const originalWorkers = copyDialogBatch.weekend_shift_payments || [];
      if (originalWorkers.length === 0) throw new Error("Kwitansi asal tidak memiliki petugas");

      // Tanggal baru berdasarkan bulan & tahun yang dipilih
      const targetDate = new Date(copyTargetYear, copyTargetMonth - 1, 1);
      const monthNames = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
      ];
      const monthName = monthNames[copyTargetMonth - 1];

      // Generate new batch_number
      const batch_number = `KPSM-${format(new Date(), "yyyyMMdd")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      // Judul baru: replace bulan & tahun dalam judul asal
      // Contoh: "Piket Sabtu Minggu Bulan Agustus 2026" -> "Piket Sabtu Minggu Bulan Januari 2026"
      let newTitle = copyDialogBatch.job_title;
      const monthRegex = /(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\\s+\\d{4}/i;
      if (monthRegex.test(newTitle)) {
        newTitle = newTitle.replace(monthRegex, `${monthName} ${copyTargetYear}`);
      } else {
        // Kalau tidak ada bulan/tahun di judul, append
        newTitle = `${newTitle} - ${monthName} ${copyTargetYear}`;
      }

      // Insert batch baru
      const { data: newBatch, error: batchError } = await supabase
        .from("weekend_shift_batches")
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
        daily_rate: w.daily_rate,
        gross_amount: w.gross_amount,
        tax_amount: w.tax_amount,
        net_amount: w.net_amount,
        notes: w.notes || null,
      }));

      const { error: workersError } = await supabase
        .from("weekend_shift_payments")
        .insert(workersToInsert);

      if (workersError) {
        await supabase.from("weekend_shift_batches").delete().eq("id", newBatch.id);
        throw workersError;
      }

      return { newBatchNumber: batch_number, newTitle };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["weekend-shift-batches"] });
      toast.success(`Kwitansi berhasil disalin menjadi "${data.newTitle}"`);
      setCopyDialogBatch(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });
'''
        content = content[:insert_pos] + copy_mutation + content[insert_pos:]
        with open('src/pages/WeekendShiftPayments.tsx', 'w') as f:
            f.write(content)
        print("  ✅ copyBatchMutation ditambahkan")
    else:
        print("  ⚠️  Tidak menemukan penutup deleteBatchMutation")
else:
    print("  ⏭️  Sudah ada, skip.")
PYEOF
fi

echo ""

# ============================================
# PATCH 4: Tambah tombol Copy di tabel & Dialog
# ============================================
echo "🔧 Patch 4/4: Tambah tombol Copy & Dialog..."

# Cari baris tombol Edit di tabel kwitansi dan tambahkan Copy setelahnya
if grep -q "openEditDialog(batch)" "$FILE" && ! grep -q "setCopyDialogBatch(batch)" "$FILE"; then
  # Sisipkan tombol Copy setelah tombol Edit
  perl -i -0pe 's|(<Button variant="outline" size="icon" onClick=\{\(\) => openEditDialog\(batch\)\} title="Edit Kwitansi">\s*<Pencil className="h-4 w-4 text-blue-500" />\s*</Button>)|$1\n                                <Button variant="outline" size="icon" onClick={() => setCopyDialogBatch(batch)} title="Salin Kwitansi ke Bulan Lain">\n                                  <CopyPlus className="h-4 w-4 text-emerald-600" />\n                                </Button>|g' "$FILE"
  echo "  ✅ Tombol Copy ditambahkan di tabel kwitansi"
fi

# Tambahkan Dialog Copy sebelum AlertDialog deleteBatchId
if ! grep -q 'open={!!copyDialogBatch}' "$FILE"; then
  python3 << 'PYEOF'
with open('src/pages/WeekendShiftPayments.tsx', 'r') as f:
    content = f.read()

# Cari marker <AlertDialog open={!!deleteBatchId}
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
                        <span className="font-medium">{copyDialogBatch.weekend_shift_payments?.length || 0} orang</span>
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
                      <li>{copyDialogBatch.weekend_shift_payments?.length || 0} petugas + data lengkap</li>
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
    content = content.replace(marker, copy_dialog + marker)
    with open('src/pages/WeekendShiftPayments.tsx', 'w') as f:
        f.write(content)
    print("  ✅ Dialog Copy ditambahkan")
else:
    print("  ⚠️  Marker deleteBatchId tidak ditemukan")
PYEOF
fi

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
  echo "🌐 Buka: https://pusaka.smpn8ciamis.sch.id/weekend-shift-payments"
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
