import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Fingerprint } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PiketDuty, PiketShift, SHIFT_LABEL, bulanLabel, monthRange, toISODate, validForShift } from "@/lib/piket";

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
      ((data as any[]) as PiketDuty[]).filter(validForShift).forEach((d) => {
        map.set(d.person_name, [...(map.get(d.person_name) ?? []), d]);
      });
      return map;
    },
  });
}

const personKey = (d: PiketDuty) => d.staff_id ?? d.teacher_id ?? `manual:${d.person_name}`;

/** Nama yang sama dipakai oleh lebih dari satu orang (staf/guru berbeda): perlu konfirmasi digabung atau dipisah. */
export function ambiguousNames(map: Map<string, PiketDuty[]> | undefined): string[] {
  return Array.from((map ?? new Map<string, PiketDuty[]>()).entries())
    .filter(([, ds]) => new Set(ds.map(personKey)).size > 1)
    .map(([name]) => name);
}

/** Uraikan per nama menjadi daftar entri hitungan. choice[name]: 'gabung' (satu petugas) | 'pisah' (per orang). */
export function buildEntries(map: Map<string, PiketDuty[]> | undefined, choice: Record<string, "gabung" | "pisah">) {
  const out: { label: string; ds: PiketDuty[]; position: string }[] = [];
  Array.from((map ?? new Map<string, PiketDuty[]>()).entries()).forEach(([name, ds]) => {
    const people = new Map<string, PiketDuty[]>();
    ds.forEach((d) => people.set(personKey(d), [...(people.get(personKey(d)) ?? []), d]));
    if (people.size <= 1 || choice[name] !== "pisah") {
      // digabung: satu hari dihitung sekali walau tercatat pada dua orang
      const seen = new Set<string>();
      const merged = [...ds].sort((x, y) => x.duty_date.localeCompare(y.duty_date)).filter((d) => !seen.has(d.duty_date) && !!seen.add(d.duty_date));
      out.push({ label: name, ds: merged, position: merged[0]?.position ?? "" });
      return;
    }
    const kinds = Array.from(people.values()).map((x) => x[0].person_type);
    Array.from(people.values()).forEach((x, i) => {
      const kind = x[0].person_type;
      const sameKind = kinds.filter((k) => k === kind).length > 1;
      const suffix = sameKind ? String(i + 1) : kind === "teacher" ? "Guru" : kind === "staff" ? "Staf" : String(i + 1);
      out.push({ label: `${name} (${suffix})`, ds: x, position: x[0].position ?? "" });
    });
  });
  return out;
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

  const [choice, setChoice] = useState<Record<string, "gabung" | "pisah">>({});
  const ambiguous = useMemo(() => ambiguousNames(data), [data]);
  const list = useMemo(
    () => buildEntries(data, choice).map((e) => [e.label, e.ds, e.position] as [string, PiketDuty[], string]),
    [data, choice],
  );

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
  useEffect(() => { if (open) setChoice({}); }, [open, ym]);

  const chosen = list.filter(([n]) => !skip[n]);
  const ready = chosen.length > 0 && chosen.every(([n]) => rateByName[n]) && ambiguous.every((n) => choice[n]);

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

        {ambiguous.length > 0 && (
          <div className="space-y-2 rounded-md border border-amber-400 p-3 text-sm">
            <div className="font-medium">Ada nama yang sama pada lebih dari satu orang</div>
            <p className="text-xs text-muted-foreground">Pilih apakah kehadirannya dihitung sebagai satu petugas (digabung) atau masing-masing sendiri (dipisah).</p>
            {ambiguous.map((n) => {
              const ds = data?.get(n) ?? [];
              const kinds = Array.from(new Set(ds.map((d) => (d.person_type === "teacher" ? "Guru" : d.person_type === "staff" ? "Staf" : "Manual"))));
              return (
                <div key={n} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                  <div>
                    <div className="font-medium">{n}</div>
                    <div className="text-xs text-muted-foreground">{ds.length} hari hadir · tercatat sebagai {kinds.join(" + ")}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant={choice[n] === "gabung" ? "default" : "outline"} onClick={() => setChoice((c) => ({ ...c, [n]: "gabung" }))}>Gabung</Button>
                    <Button size="sm" variant={choice[n] === "pisah" ? "default" : "outline"} onClick={() => setChoice((c) => ({ ...c, [n]: "pisah" }))}>Pisah</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
