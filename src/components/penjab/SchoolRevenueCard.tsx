import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { snpDb } from '@/hooks/usePenjabSnp';
import { SCHOOL_REVENUES_KEY, type SchoolRevenue } from '@/hooks/useSchoolRevenues';
import { formatRupiah, MONTH_NAMES } from '@/lib/rkaParser';

const SOURCES = ['BOS Reguler', 'BOS Kinerja', 'BOS Afirmasi', 'Komite / Sumbangan', 'APBD / BOP Daerah', 'Sisa Lebih Anggaran (SILPA)', 'Bunga Bank', 'Lainnya'];

interface Form { id?: string; source: string; description: string; amount: string; month: string }
const empty = (): Form => ({ source: '', description: '', amount: '', month: '' });

/** Daftar penerimaan sekolah untuk satu tahun anggaran (kelola: admin, bendahara). */
export function SchoolRevenueCard({ fiscalYear, rows }: { fiscalYear: string | null; rows: SchoolRevenue[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<SchoolRevenue | null>(null);
  const total = rows.reduce((a, r) => a + r.amount, 0);

  const save = useMutation({
    mutationFn: async (f: Form) => {
      if (!fiscalYear) throw new Error('Pilih tahun anggaran terlebih dahulu');
      const source = f.source.trim();
      const amount = Number(f.amount.replace(/[^\d.]/g, ''));
      if (!source) throw new Error('Sumber penerimaan wajib diisi');
      if (!(amount > 0)) throw new Error('Jumlah harus lebih dari 0');
      const row = { fiscal_year: fiscalYear, source, description: f.description.trim() || null, amount, month: f.month ? Number(f.month) : null };
      const { error } = f.id ? await snpDb.from('snp_school_revenues').update(row).eq('id', f.id) : await snpDb.from('snp_school_revenues').insert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Penerimaan disimpan'); setForm(null); qc.invalidateQueries({ queryKey: SCHOOL_REVENUES_KEY }); },
    onError: (e: any) => toast.error(e?.message || 'Gagal menyimpan penerimaan'),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await snpDb.from('snp_school_revenues').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Penerimaan dihapus'); setDel(null); qc.invalidateQueries({ queryKey: SCHOOL_REVENUES_KEY }); },
    onError: (e: any) => toast.error(e?.message || 'Gagal menghapus'),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">Penerimaan Sekolah{fiscalYear ? ` · TA ${fiscalYear}` : ''}</CardTitle>
          <CardDescription>Sumber dana yang diterima sekolah. Total penerimaan dikurangi total anggaran semua penjab = selisih.</CardDescription>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" disabled={!fiscalYear} onClick={() => setForm(empty())}><Plus className="h-4 w-4" />Tambah</Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!fiscalYear && <p className="mb-2 text-sm text-amber-600">Pilih tahun anggaran (bukan "Semua tahun") untuk menambah atau mengubah penerimaan.</p>}
        <Table>
          <TableHeader>
            <TableRow><TableHead>Sumber</TableHead><TableHead>Keterangan</TableHead><TableHead>Bulan</TableHead><TableHead className="text-right">Jumlah</TableHead><TableHead className="w-24" /></TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Belum ada penerimaan. Klik "Tambah" (mis. BOS Reguler).</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.source}{!fiscalYear && <span className="ml-1 text-xs text-muted-foreground">TA {r.fiscal_year}</span>}</TableCell>
                <TableCell className="text-muted-foreground">{r.description || '-'}</TableCell>
                <TableCell>{r.month ? MONTH_NAMES[r.month - 1] : '-'}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatRupiah(r.amount)}</TableCell>
                <TableCell className="space-x-1 whitespace-nowrap text-right">
                  <Button size="icon" variant="ghost" onClick={() => setForm({ id: r.id, source: r.source, description: r.description ?? '', amount: String(r.amount), month: r.month ? String(r.month) : '' })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDel(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length > 0 && (
              <TableRow className="bg-muted/40"><TableCell colSpan={3} className="text-right font-semibold">Total Penerimaan</TableCell><TableCell className="text-right font-bold whitespace-nowrap">{formatRupiah(total)}</TableCell><TableCell /></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form?.id ? 'Ubah Penerimaan' : 'Tambah Penerimaan'}</DialogTitle><DialogDescription>Tahun anggaran {fiscalYear}</DialogDescription></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div>
                <Label>Sumber penerimaan</Label>
                <Input list="sumber-penerimaan" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="BOS Reguler" />
                <datalist id="sumber-penerimaan">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div><Label>Keterangan (opsional)</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tahap 1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Jumlah (Rp)</Label><Input inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" /></div>
                <div>
                  <Label>Bulan diterima</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>
                    <option value="">Belum ditentukan</option>
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Batal</Button><Button disabled={save.isPending} onClick={() => form && save.mutate(form)}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus penerimaan?</AlertDialogTitle><AlertDialogDescription>{del?.source} · {del ? formatRupiah(del.amount) : ''}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => del && remove.mutate(del.id)}>Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
