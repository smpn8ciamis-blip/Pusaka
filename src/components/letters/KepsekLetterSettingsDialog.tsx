import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useKepsekLetterSettings, useSaveKepsekLetterSettings } from '@/hooks/useSuratTugasKepsek';
import { DEFAULT_KEPSEK_SETTINGS, type KepsekLetterSettings } from '@/lib/suratTugasKepsek';
import { validateSuratPattern } from '@/lib/suratNumber';

type Field = { key: keyof KepsekLetterSettings; label: string; hint?: string };

const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: 'Nomor dan tempat surat',
    fields: [
      { key: 'pattern', label: 'Pola nomor surat', hint: 'Token: {URUT} atau {URUT:3}, {TAHUN}, {YY}, {BULAN}, {ROMAWI}. Nomor urut berikutnya dihitung otomatis dari nomor surat tugas dan surat keluar yang sudah ada.' },
      { key: 'tempat', label: 'Tempat surat' },
    ],
  },
  {
    title: 'Kop surat Dinas',
    fields: [
      { key: 'kop1', label: 'Baris 1' },
      { key: 'kop2', label: 'Baris 2 (tebal)' },
      { key: 'kop3', label: 'Baris 3 (alamat)' },
    ],
  },
  {
    title: 'Pejabat penandatangan',
    fields: [
      { key: 'penerbit_nama', label: 'Nama' },
      { key: 'penerbit_nip', label: 'NIP' },
      { key: 'penerbit_pangkat', label: 'Pangkat / Gol' },
      { key: 'penerbit_jabatan', label: 'Jabatan' },
    ],
  },
  {
    title: 'Kepala Sekolah / Plt',
    fields: [
      { key: 'kepsek_pangkat', label: 'Pangkat / Gol (dipakai bila tidak ada di data guru)', hint: 'Nama, NIP, dan jabatan diambil otomatis dari Pengaturan Sekolah.' },
    ],
  },
];

/** Tombol + dialog pengaturan format surat tugas Kepala Sekolah/Plt. */
export function KepsekLetterSettingsDialog() {
  const { data } = useKepsekLetterSettings();
  const save = useSaveKepsekLetterSettings();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<KepsekLetterSettings>(DEFAULT_KEPSEK_SETTINGS);

  useEffect(() => { if (open && data) setForm(data); }, [open, data]);

  const simpan = async () => {
    const err = validateSuratPattern(form.pattern);
    if (err) return toast.error(err);
    try {
      await save.mutateAsync(form);
      toast.success('Pengaturan surat kepala sekolah disimpan');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message?.includes('Could not find') ? 'Jalankan migrasi 20261126100000_surat_tugas_kepsek.sql terlebih dulu' : e?.message || 'Gagal menyimpan');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline"><Settings2 className="mr-2 h-4 w-4" /> Format Surat Kepsek</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Format Surat Tugas Kepala Sekolah / Plt</DialogTitle>
          <DialogDescription>Dipakai bila pelaksana tugas adalah kepala sekolah atau Plt. Surat ini terpisah dari surat tugas guru.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {GROUPS.map((g) => (
            <fieldset key={g.title} className="space-y-3">
              <legend className="mb-1 text-sm font-semibold">{g.title}</legend>
              {g.fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`stk-${f.key}`} className="text-xs">{f.label}</Label>
                  <Input id={`stk-${f.key}`} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                  {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                </div>
              ))}
            </fieldset>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
          <Button type="button" onClick={simpan} disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
