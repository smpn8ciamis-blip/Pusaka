import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { buildCopyRows, nextPeriod, prevPeriod, recipientKey, type CopySource } from '@/lib/honorariumCopy';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export interface CopyableHonorarium extends CopySource {
  /** Keterangan tambahan di daftar (mis. nama ekskul). */
  sub?: string;
  receipt_number: string;
  net_amount: number;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  honorariums: CopyableHonorarium[];
  userId: string | undefined;
  today: string; // yyyy-MM-dd
  /** Tabel Supabase & kunci cache yang dimuat ulang setelah menyalin. */
  table: string;
  queryKey: string[];
  /** Awalan nomor kwitansi (HON/EKS) dan kolom penerima baris baru (bawaan teacher_id/staff_id). */
  numberPrefix?: string;
  recipientFields?: (s: CopySource) => Record<string, unknown>;
}

const rupiah = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);

/** Salin banyak kwitansi dari satu bulan ke bulan lain sekaligus (mis. kwitansi bulanan rutin). */
export function HonorariumCopyDialog({ open, onOpenChange, honorariums, userId, today, table, queryKey, numberPrefix, recipientFields }: Props) {
  const queryClient = useQueryClient();
  const now = new Date();
  const [tgtMonth, setTgtMonth] = useState(now.getMonth() + 1);
  const [tgtYear, setTgtYear] = useState(now.getFullYear());
  const [srcMonth, setSrcMonth] = useState(prevPeriod(now.getMonth() + 1, now.getFullYear()).month);
  const [srcYear, setSrcYear] = useState(prevPeriod(now.getMonth() + 1, now.getFullYear()).year);
  const [receiptDate, setReceiptDate] = useState(today);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Setiap dibuka: sumber = bulan terakhir yang punya kwitansi sebelum bulan sekarang (bila ada), tujuan = bulan ini.
  useEffect(() => {
    if (!open) return;
    const m = now.getMonth() + 1, y = now.getFullYear();
    setTgtMonth(m); setTgtYear(y); setReceiptDate(today);
    const before = honorariums
      .filter((h) => h.payment_year * 12 + h.payment_month < y * 12 + m)
      .sort((a, b) => (b.payment_year * 12 + b.payment_month) - (a.payment_year * 12 + a.payment_month))[0];
    const p = before ? { month: before.payment_month, year: before.payment_year } : prevPeriod(m, y);
    setSrcMonth(p.month); setSrcYear(p.year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sources = useMemo(
    () => honorariums.filter((h) => h.payment_month === srcMonth && h.payment_year === srcYear)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [honorariums, srcMonth, srcYear],
  );
  const alreadyInTarget = useMemo(
    () => new Set(honorariums.filter((h) => h.payment_month === tgtMonth && h.payment_year === tgtYear).map(recipientKey)),
    [honorariums, tgtMonth, tgtYear],
  );
  const samePeriod = srcMonth === tgtMonth && srcYear === tgtYear;

  // Pilih otomatis semua yang belum punya kwitansi di bulan tujuan.
  useEffect(() => {
    setPicked(new Set(sources.filter((s) => !alreadyInTarget.has(recipientKey(s))).map((s) => s.id)));
  }, [sources, alreadyInTarget]);

  const chosen = sources.filter((s) => picked.has(s.id));
  const totalNet = chosen.reduce((sum, s) => {
    const a = Number(s.honorarium_amount) || 0;
    return sum + a - a * ((Number(s.tax_percentage) || 0) / 100);
  }, 0);

  const copyMutation = useMutation({
    mutationFn: async () => {
      const { rows, skipped } = buildCopyRows({
        sources: chosen, targetMonth: tgtMonth, targetYear: tgtYear, receiptDate,
        existing: honorariums, usedReceiptNumbers: honorariums.map((h) => h.receipt_number), userId, numberPrefix, recipientFields,
      });
      if (!rows.length) throw new Error('Tidak ada kwitansi baru yang bisa dibuat (semua penerima sudah punya kwitansi di bulan tujuan).');
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from(table as never).insert(rows.slice(i, i + 100) as never);
        if (error) throw error;
      }
      return { made: rows.length, skipped: skipped.length };
    },
    onSuccess: ({ made, skipped }) => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Berhasil', description: `${made} kwitansi disalin ke ${MONTHS[tgtMonth - 1]} ${tgtYear}${skipped ? `, ${skipped} dilewati (sudah ada)` : ''}` });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: 'Gagal menyalin', description: e.message, variant: 'destructive' }),
  });

  const years = useMemo(() => {
    const y = now.getFullYear();
    return Array.from(new Set([y - 2, y - 1, y, y + 1, ...honorariums.map((h) => h.payment_year)])).sort((a, b) => b - a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [honorariums]);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectable = sources.filter((s) => !alreadyInTarget.has(recipientKey(s)));

  const monthYear = (month: number, year: number, onMonth: (n: number) => void, onYear: (n: number) => void) => (
    <div className="flex gap-2">
      <Select value={String(month)} onValueChange={(v) => onMonth(Number(v))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(v) => onYear(Number(v))}>
        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
        <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Salin Kwitansi dari Bulan Lain</DialogTitle>
          <DialogDescription>
            Buat kwitansi bulan baru sekaligus dari kwitansi bulan sebelumnya. Nominal, pajak, dan keterangan ikut disalin; nomor kwitansi dibuat baru.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Salin dari (bulan sumber)</Label>
            {monthYear(srcMonth, srcYear, setSrcMonth, setSrcYear)}
          </div>
          <div className="space-y-1.5">
            <Label>Ke (bulan tujuan)</Label>
            {monthYear(tgtMonth, tgtYear, setTgtMonth, setTgtYear)}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tanggal kwitansi</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" value={receiptDate} onChange={(e) => e.target.value && setReceiptDate(e.target.value)} className="w-48" />
              <Button type="button" variant="outline" size="sm" onClick={() => { const n = nextPeriod(srcMonth, srcYear); setTgtMonth(n.month); setTgtYear(n.year); }}>
                Tujuan = bulan setelah sumber
              </Button>
            </div>
          </div>
        </div>

        {samePeriod && <p className="text-sm text-destructive">Bulan sumber dan tujuan sama. Pilih bulan tujuan yang berbeda.</p>}

        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={selectable.length > 0 && chosen.length === selectable.length}
                onCheckedChange={(c) => setPicked(c ? new Set(selectable.map((s) => s.id)) : new Set())}
                disabled={!selectable.length}
              />
              Pilih semua ({chosen.length}/{selectable.length})
            </label>
            <span className="text-muted-foreground">Total bersih: <b className="text-foreground">{rupiah(totalNet)}</b></span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y">
            {sources.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Tidak ada kwitansi pada {MONTHS[srcMonth - 1]} {srcYear}.</p>
            ) : sources.map((s) => {
              const exists = alreadyInTarget.has(recipientKey(s));
              return (
                <label key={s.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${exists ? 'opacity-60' : 'cursor-pointer hover:bg-muted/30'}`}>
                  <Checkbox checked={picked.has(s.id)} disabled={exists} onCheckedChange={() => toggle(s.id)} />
                  <span className="min-w-0 flex-1 truncate">{s.name}{s.sub && <span className="text-muted-foreground"> · {s.sub}</span>}</span>
                  {exists && <Badge variant="secondary">Sudah ada di bulan tujuan</Badge>}
                  <span className="shrink-0 tabular-nums">{rupiah(Number(s.net_amount) || 0)}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={() => copyMutation.mutate()} disabled={copyMutation.isPending || samePeriod || chosen.length === 0}>
            {copyMutation.isPending ? 'Menyalin...' : `Salin ${chosen.length} Kwitansi`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
