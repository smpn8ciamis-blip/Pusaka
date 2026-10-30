import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, RotateCcw, Scale, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  DEFAULT_COMPONENTS,
  LEGACY_KEYS,
  LEGACY_LABEL,
  MAX_COMPONENTS,
  totalWeight,
  validateComponents,
  type GradeCategory,
  type GradeComponent,
  type LegacyKey,
} from '@/lib/gradeComponents';
import { fetchComponentsOf, useSaveGradeComponents } from '@/hooks/useGradeComponents';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  scheduleLabel: string;
  /** jenis penilaian yang sedang berlaku (bawaan atau buatan guru) */
  current: GradeComponent[];
  isDefault: boolean;
  /** jadwal lain milik guru yang sama, untuk fitur salin */
  otherSchedules: { id: string; label: string }[];
  /** berapa kelas paralel (mapel sama) yang akan ikut berubah bila opsi dicentang */
  parallelCount: number;
}

const NONE = '__none__';

export function GradeComponentsDialog({
  open, onOpenChange, scheduleId, scheduleLabel, current, isDefault, otherSchedules, parallelCount,
}: Props) {
  const [items, setItems] = useState<GradeComponent[]>(current);
  const [applyParallel, setApplyParallel] = useState(false);
  const save = useSaveGradeComponents();

  useEffect(() => {
    if (open) {
      setItems(current.map((c) => ({ ...c })));
      setApplyParallel(false);
    }
    // hanya saat dialog dibuka / jadwal berganti
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scheduleId]);

  const total = useMemo(() => totalWeight(items), [items]);
  const error = validateComponents(items);
  const totalOk = Math.abs(total - 100) <= 0.005;

  const update = (i: number, patch: Partial<GradeComponent>) =>
    setItems((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const setKey = (i: number, key: LegacyKey | null) =>
    setItems((prev) =>
      prev.map((c, idx) => {
        if (idx === i) return { ...c, legacy_key: key };
        // satu penerima CBT hanya boleh dipakai satu jenis
        return key && c.legacy_key === key ? { ...c, legacy_key: null } : c;
      }),
    );

  const addItem = () =>
    setItems((prev) => [...prev, { id: null, name: '', weight: 0, legacy_key: null, category: 'pengetahuan' }]);

  const splitEvenly = () =>
    setItems((prev) => {
      const n = prev.length;
      if (!n) return prev;
      const base = Math.floor((100 / n) * 100) / 100;
      const rest = Math.round((100 - base * n) * 100) / 100;
      return prev.map((c, i) => ({ ...c, weight: i === n - 1 ? Math.round((base + rest) * 100) / 100 : base }));
    });

  const copyFrom = async (id: string) => {
    try {
      const rows = await fetchComponentsOf(id);
      setItems(rows);
      toast.success('Disalin. Periksa bobot lalu simpan.');
    } catch (e: any) {
      toast.error(`Gagal menyalin: ${e.message}`);
    }
  };

  const handleSave = async (list: GradeComponent[]) => {
    const msg = validateComponents(list);
    if (msg) { toast.error(msg); return; }
    try {
      const res = await save.mutateAsync({ scheduleId, items: list, applyParallel });
      toast.success(
        list.length === 0
          ? 'Dikembalikan ke rumus bawaan'
          : res.schedules > 1
            ? `Tersimpan untuk ${res.schedules} kelas`
            : 'Jenis penilaian & bobot tersimpan',
      );
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Gagal menyimpan: ${e.message}`);
    }
  };

  // komponen bawaan yang akan hilang dari rumus (nilainya di kolom lama tetap tersimpan)
  const removedCustom = current.filter((c) => c.id && !c.legacy_key && !items.some((x) => x.id === c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Scale className="h-5 w-5" />Jenis Penilaian & Bobot</DialogTitle>
          <DialogDescription>
            {scheduleLabel}. Nilai akhir = rata-rata berbobot dari semua jenis di bawah. Total bobot harus 100%.
            {isDefault && ' Saat ini memakai rumus bawaan sekolah.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="hidden sm:grid grid-cols-[1fr_96px_150px_170px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
            <span>Nama jenis penilaian</span>
            <span>Bobot (%)</span>
            <span title="Kategori dirata-ratakan terpisah; nilai akhir tetap satu angka">Kategori</span>
            <span title="Nilai ujian CBT yang dipilih guru akan masuk ke jenis ini">Terima nilai CBT sebagai</span>
            <span />
          </div>

          {items.map((c, i) => (
            <div key={c.id ?? `n${i}`} className="grid grid-cols-[1fr_96px] sm:grid-cols-[1fr_96px_150px_170px_40px] gap-2 items-end sm:items-center rounded-lg border p-3 sm:border-0 sm:p-0">
              <div className="space-y-1">
                <span className="sm:hidden text-xs text-muted-foreground">Nama jenis penilaian</span>
                <Input
                  value={c.name}
                  maxLength={40}
                  placeholder="mis. Portofolio, Proyek, PH 1"
                  onChange={(e) => update(i, { name: e.target.value })}
                  aria-label="Nama jenis penilaian"
                />
              </div>
              <div className="space-y-1">
                <span className="sm:hidden text-xs text-muted-foreground">Bobot (%)</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={Number.isFinite(c.weight) ? c.weight : ''}
                  onChange={(e) => update(i, { weight: e.target.value === '' ? NaN : Number(e.target.value) })}
                  aria-label="Bobot"
                />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1 order-3 sm:order-none">
                <span className="sm:hidden text-xs text-muted-foreground">Kategori</span>
                <Select value={c.category} onValueChange={(v) => update(i, { category: v as GradeCategory })}>
                  <SelectTrigger aria-label="Kategori"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((k) => (
                      <SelectItem key={k} value={k}>{CATEGORY_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1 order-3 sm:order-none">
                <span className="sm:hidden text-xs text-muted-foreground">Terima nilai CBT sebagai</span>
                <Select value={c.legacy_key ?? NONE} onValueChange={(v) => setKey(i, v === NONE ? null : (v as LegacyKey))}>
                  <SelectTrigger aria-label="Penerima nilai CBT"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— (isi manual)</SelectItem>
                    {LEGACY_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>{LEGACY_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="ghost" size="icon" className="col-span-2 sm:col-span-1 order-4 sm:order-none justify-self-end" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} aria-label="Hapus">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={items.length >= MAX_COMPONENTS} className="gap-1">
              <Plus className="h-4 w-4" />Tambah jenis
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={splitEvenly} disabled={items.length === 0}>
              Bagi rata
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setItems(DEFAULT_COMPONENTS.map((c) => ({ ...c })))} className="gap-1">
              <RotateCcw className="h-4 w-4" />Rumus bawaan
            </Button>
            {otherSchedules.length > 0 && (
              <Select onValueChange={copyFrom}>
                <SelectTrigger className="h-9 w-[210px]"><Copy className="h-4 w-4 mr-1" /><SelectValue placeholder="Salin dari mapel lain" /></SelectTrigger>
                <SelectContent>
                  {otherSchedules.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className={`ml-auto rounded-full px-3 py-1 text-sm font-semibold ${totalOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              Total: {Number.isFinite(total) ? total : 0}%
            </div>
          </div>

          {error && items.length > 0 && <p className="text-sm text-destructive">{error}</p>}

          <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1 text-muted-foreground">
            <p><b>Kategori</b>: kelompokkan jenis ke Pengetahuan, Keterampilan, atau Sikap. Setiap kategori ditampilkan dengan rata-rata berbobot sendiri; <b>nilai akhir</b> tetap satu angka dari semua jenis sesuai bobot di atas.</p>
            <p><b>Terima nilai CBT sebagai</b>: bila ujian CBT diatur masuk ke komponen (Tugas/Kuis/UTS/UAS/Praktik), pilih jenis penilaian yang menerimanya. Ujian CBT yang komponennya tidak dipilih di sini tidak ikut dihitung.</p>
            <p>Nilai siswa yang sudah ada tidak hilang. Menghapus jenis buatan sendiri akan menghapus nilai siswa pada jenis itu; nilai Tugas/Kuis/UTS/UAS/Praktik tetap tersimpan walau tidak dipakai di rumus.</p>
            {removedCustom.length > 0 && (
              <p className="text-destructive font-medium">Akan dihapus beserta nilainya: {removedCustom.map((c) => c.name).join(', ')}</p>
            )}
          </div>

          {parallelCount > 0 && (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={applyParallel} onCheckedChange={(v) => setApplyParallel(v === true)} className="mt-0.5" />
              <span>Terapkan juga ke {parallelCount} kelas lain untuk mapel ini (semester & tahun ajaran sama)</span>
            </label>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            disabled={isDefault || save.isPending}
            onClick={() => handleSave([])}
          >
            Kembalikan ke bawaan sekolah
          </Button>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="button" className="bg-gradient-primary" disabled={!!error || items.length === 0 || save.isPending} onClick={() => handleSave(items)}>
              {save.isPending ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
