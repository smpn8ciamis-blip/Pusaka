import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Fingerprint } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PiketDuty, PiketShift, SHIFT_LABEL, bulanLabel, monthRange, toISODate } from "@/lib/piket";

export interface ImportedWorker {
  worker_name: string;
  position_type: string; // jenis tarif terpilih
  shift_count: number;
  start_date: string;
  end_date: string;
  notes: string;
}

/** Tanggal hadir (status 'hadir') per nama petugas untuk satu bulan. */
export function usePiketAttendance(shift: PiketShift, month: Date | string | null, enabled = true) {
  const ym = month ? toISODate(new Date(month)).slice(0, 7) : null;
  return useQuery({
    queryKey: ["piket-hadir", shift, ym],
    enabled: enabled && !!ym,
    queryFn: async () => {
      const { from, to } = monthRange(ym!);
      const { data, error } = await supabase
        .from("piket_duties" as any).select("*").eq("shift_type", shift).eq("status", "hadir")
        .gte("duty_date", from).lte("duty_date", to).order("duty_date");
      if (error) throw error;
      const map = new Map<string, PiketDuty[]>();
      ((data as any[]) as PiketDuty[]).forEach((d) => {
        map.set(d.person_name, [...(map.get(d.person_name) ?? []), d]);
      });
      return map;
    },
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
  shift: PiketShift;
  month: Date;
  rates: { position_type: string }[];
  existingNames: string[];
  onApply: (rows: ImportedWorker[]) => void;
}

export function PiketAttendanceImport({ open, onClose, shift, month, rates, existingNames, onApply }: Props) {
  const [ym, setYm] = useState(() => toISODate(month).slice(0, 7));
  useEffect(() => { if (open) setYm(toISODate(month).slice(0, 7)); /* eslint-disable-next-line */ }, [open]);
  const { data, isLoading } = usePiketAttendance(shift, ym, open);
  const [rateByName, setRateByName] = useState<Record<string, string>>({});
  const [skip, setSkip] = useState<Record<string, boolean>>({});

  const list = useMemo(() => Array.from((data ?? new Map<string, PiketDuty[]>()).entries()), [data]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    list.forEach(([name, ds]) => {
      const pos = (ds[0]?.position ?? "").toLowerCase();
      const hit = rates.find((r) => r.position_type.toLowerCase() === pos) ?? (rates.length === 1 ? rates[0] : undefined);
      next[name] = hit?.position_type ?? "";
    });
    setRateByName(next);
    setSkip({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list.length, ym]);

  const chosen = list.filter(([n]) => !skip[n]);
  const ready = chosen.length > 0 && chosen.every(([n]) => rateByName[n]);

  const apply = () => {
    onApply(
      chosen.map(([name, ds]) => ({
        worker_name: name,
        position_type: rateByName[name],
        shift_count: ds.length,
        start_date: ds[0].duty_date,
        end_date: ds[ds.length - 1].duty_date,
        notes: `Hadir (fingerprint): ${ds.map((d) => d.duty_date.slice(8)).join(", ")} ${bulanLabel(ym)}`,
      }))
    );
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5" />Ambil dari Daftar Hadir Fingerprint</DialogTitle>
          <DialogDescription>
            {SHIFT_LABEL[shift]} bulan {bulanLabel(ym)} — hanya yang berstatus <b>Hadir</b>. Jumlah piket = jumlah hari hadir.
            Petugas yang namanya sudah ada di daftar akan diperbarui.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <span>Bulan kehadiran</span>
          <Input type="month" className="w-44" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} />
        </div>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Memuat…</p>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Belum ada kehadiran piket pada bulan ini. Buka menu Kelola {SHIFT_LABEL[shift]} lalu tarik data fingerprint.
          </p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {list.map(([name, ds]) => (
              <div key={name} className="grid grid-cols-[auto_1fr_11rem] items-center gap-3 rounded-md border p-2 text-sm">
                <input type="checkbox" checked={!skip[name]} onChange={() => setSkip((s) => ({ ...s, [name]: !s[name] }))} />
                <div>
                  <div className="font-medium">{name}{existingNames.includes(name) && <span className="ml-2 text-xs text-amber-600">(diperbarui)</span>}</div>
                  <div className="text-xs text-muted-foreground">{ds.length} hari hadir: {ds.map((d) => d.duty_date.slice(8)).join(", ")}</div>
                </div>
                <Select value={rateByName[name] ?? ""} onValueChange={(v) => setRateByName((m) => ({ ...m, [name]: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih tarif…" /></SelectTrigger>
                  <SelectContent>{rates.map((r) => <SelectItem key={r.position_type} value={r.position_type}>{r.position_type}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={apply} disabled={!ready}>Masukkan ke Daftar Petugas</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
