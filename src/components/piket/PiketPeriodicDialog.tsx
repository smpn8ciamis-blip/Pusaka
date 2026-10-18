import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PiketShift, SHIFT_LABEL, parseISODate, toISODate } from "@/lib/piket";

export type PeriodicPerson = { key: string; type: "staff" | "teacher"; id: string; name: string; position: string };

const DAYS = [
  { d: 1, l: "Sen" }, { d: 2, l: "Sel" }, { d: 3, l: "Rab" }, { d: 4, l: "Kam" }, { d: 5, l: "Jum" }, { d: 6, l: "Sab" }, { d: 0, l: "Min" },
];

type Mode = "rotasi" | "tetap";
type Unit = "hari" | "minggu";

interface Props {
  open: boolean;
  onClose: () => void;
  shift: PiketShift;
  people: PeriodicPerson[];
  userId: string | null;
  onDone: () => void;
}

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** Kunci minggu (Senin–Minggu) untuk mengelompokkan Sabtu & Minggu ke satu giliran. */
const weekKey = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return toISODate(x); };

export function PiketPeriodicDialog({ open, onClose, shift, people, userId, onDone }: Props) {
  const qc = useQueryClient();
  const weekend = shift === "sabtu_minggu";
  const allowedDays = weekend ? [6, 0] : [1, 2, 3, 4, 5, 6, 0];

  const today = new Date();
  const [from, setFrom] = useState(toISODate(today));
  const [to, setTo] = useState(toISODate(addDays(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()), -1)));
  const [mode, setMode] = useState<Mode>("rotasi");
  const [days, setDays] = useState<number[]>(allowedDays);
  const [perSlot, setPerSlot] = useState(weekend ? 2 : 1);
  const [unit, setUnit] = useState<Unit>(weekend ? "minggu" : "hari");
  const [order, setOrder] = useState<string[]>([]);               // urutan rotasi (klik = tambah ke urutan)
  const [fixedDays, setFixedDays] = useState<Record<string, number[]>>({}); // pola tetap per orang
  const [busy, setBusy] = useState(false);

  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people]);

  // Bangun daftar (tanggal, orang) sesuai pengaturan
  const plan = useMemo(() => {
    const out: { date: string; p: PeriodicPerson }[] = [];
    if (!from || !to || from > to) return out;
    const dates: Date[] = [];
    for (let d = parseISODate(from); d <= parseISODate(to); d = addDays(d, 1)) dates.push(d);

    if (mode === "rotasi") {
      const list = order.map((k) => byKey.get(k)).filter((x): x is PeriodicPerson => !!x);
      if (!list.length) return out;
      const n = Math.min(Math.max(1, perSlot), list.length);
      const eligible = dates.filter((d) => days.includes(d.getDay()));
      const unitIndex = new Map<string, number>();
      let next = 0;
      for (const d of eligible) {
        const u = unit === "minggu" ? weekKey(d) : toISODate(d);
        if (!unitIndex.has(u)) unitIndex.set(u, next++);
        const idx = unitIndex.get(u)!;
        for (let k = 0; k < n; k++) out.push({ date: toISODate(d), p: list[(idx * n + k) % list.length] });
      }
    } else {
      for (const d of dates) {
        for (const [key, ds] of Object.entries(fixedDays)) {
          const p = byKey.get(key);
          if (p && ds.includes(d.getDay())) out.push({ date: toISODate(d), p });
        }
      }
    }
    return out;
  }, [from, to, mode, days, perSlot, unit, order, fixedDays, byKey]);

  const setYear = (start: Date, end: Date) => { setFrom(toISODate(start)); setTo(toISODate(end)); };
  const y = today.getFullYear();
  const toggleDay = (d: number) => setDays((x) => (x.includes(d) ? x.filter((v) => v !== d) : [...x, d]));
  const toggleOrder = (k: string) => setOrder((x) => (x.includes(k) ? x.filter((v) => v !== k) : [...x, k]));
  const toggleFixed = (k: string, d: number) =>
    setFixedDays((m) => {
      const cur = m[k] ?? [];
      const next = cur.includes(d) ? cur.filter((v) => v !== d) : [...cur, d];
      const copy = { ...m };
      if (next.length) copy[k] = next; else delete copy[k];
      return copy;
    });

  const generate = async () => {
    if (!plan.length) return toast.error("Belum ada jadwal yang terbentuk. Pilih petugas dan hari.");
    setBusy(true);
    try {
      // Lewati jadwal yang sudah ada (indeks unik per tanggal & orang)
      const existing = new Set<string>();
      for (let off = 0; ; off += 1000) {
        const { data, error } = await supabase.from("piket_duties" as any)
          .select("duty_date, staff_id, teacher_id").eq("shift_type", shift).gte("duty_date", from).lte("duty_date", to).range(off, off + 999);
        if (error) throw error;
        (data as any[]).forEach((r) => existing.add(`${r.duty_date}|${r.staff_id ?? r.teacher_id}`));
        if (!data || (data as any[]).length < 1000) break;
      }
      const rows = plan
        .filter((x) => !existing.has(`${x.date}|${x.p.id}`))
        .map((x) => ({
          shift_type: shift, duty_date: x.date, person_type: x.p.type,
          staff_id: x.p.type === "staff" ? x.p.id : null, teacher_id: x.p.type === "teacher" ? x.p.id : null,
          person_name: x.p.name, position: x.p.position, created_by: userId,
        }));
      for (let i = 0; i < rows.length; i += 300) {
        const { error } = await supabase.from("piket_duties" as any).insert(rows.slice(i, i + 300));
        if (error) throw error;
      }
      toast.success(`${rows.length} jadwal dibuat${plan.length - rows.length ? `, ${plan.length - rows.length} sudah ada` : ""}`);
      qc.invalidateQueries({ queryKey: ["piket-duties"] });
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat jadwal");
    } finally {
      setBusy(false);
    }
  };

  const clearPlanned = async () => {
    if (!confirm(`Hapus semua jadwal berstatus "Dijadwalkan" (belum ada ketukan) ${SHIFT_LABEL[shift]} dari ${from} sampai ${to}? Data yang sudah hadir/izin/tidak hadir tidak disentuh.`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("piket_duties" as any).delete()
        .eq("shift_type", shift).eq("status", "dijadwalkan").gte("duty_date", from).lte("duty_date", to);
      if (error) throw error;
      toast.success("Jadwal yang belum berjalan pada rentang itu dihapus");
      qc.invalidateQueries({ queryKey: ["piket-duties"] });
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const dayChips = (value: number[], onToggle: (d: number) => void) => (
    <div className="flex flex-wrap gap-1">
      {DAYS.filter((x) => allowedDays.includes(x.d)).map((x) => (
        <button key={x.d} type="button" onClick={() => onToggle(x.d)}
          className={`rounded border px-2 py-0.5 text-xs ${value.includes(x.d) ? "bg-primary text-primary-foreground" : "bg-background"}`}>{x.l}</button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Jadwal Periodik {SHIFT_LABEL[shift]}</DialogTitle>
          <DialogDescription>Buat penugasan untuk rentang panjang (mis. 1 tahun) secara berulang. Jadwal yang sudah ada dilewati.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <Label>Periode</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setYear(today, addDays(new Date(y + 1, today.getMonth(), today.getDate()), -1))}>12 bulan dari hari ini</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setYear(new Date(y, 0, 1), new Date(y, 11, 31))}>Tahun {y}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { const s = today.getMonth() >= 6 ? y : y - 1; setYear(new Date(s, 6, 1), new Date(s + 1, 5, 30)); }}>Tahun ajaran (Jul–Jun)</Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pola</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === "rotasi" ? "default" : "outline"} onClick={() => setMode("rotasi")}>Rotasi bergantian</Button>
              <Button type="button" size="sm" variant={mode === "tetap" ? "default" : "outline"} onClick={() => setMode("tetap")}>Hari tetap per orang</Button>
            </div>
          </div>

          {mode === "rotasi" ? (
            <>
              <div className="space-y-2">
                <Label>Hari piket</Label>
                {dayChips(days, toggleDay)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Petugas tiap giliran</Label>
                  <Input type="number" min={1} value={perSlot} onChange={(e) => setPerSlot(Math.max(1, Number(e.target.value) || 1))} /></div>
                <div><Label className="text-xs">Pergantian</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-2" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                    <option value="hari">Setiap hari piket</option>
                    <option value="minggu">Setiap minggu{weekend ? " (Sabtu & Minggu satu tim)" : ""}</option>
                  </select></div>
              </div>
              <div className="space-y-1">
                <Label>Petugas (klik berurutan = urutan rotasi)</Label>
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                  {people.map((p) => {
                    const idx = order.indexOf(p.key);
                    return (
                      <button key={p.key} type="button" onClick={() => toggleOrder(p.key)}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${idx >= 0 ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                        <span className="w-6 text-center text-xs font-bold">{idx >= 0 ? idx + 1 : ""}</span>
                        <span className="font-medium">{p.name}</span><span className="text-xs text-muted-foreground">{p.position}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Label>Hari piket tiap orang (berulang setiap minggu)</Label>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {people.map((p) => (
                  <div key={p.key} className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1">
                    <span><span className="font-medium">{p.name}</span> <span className="text-xs text-muted-foreground">{p.position}</span></span>
                    {dayChips(fixedDays[p.key] ?? [], (d) => toggleFixed(p.key, d))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="rounded-md bg-muted/40 p-2 text-xs">
            Akan terbentuk <b>{plan.length}</b> jadwal{plan.length ? ` (${plan[0].date} s/d ${plan[plan.length - 1].date})` : ""}.
            Jadwal berstatus "Dijadwalkan" tidak tampil di daftar hadir cetak sampai ada ketukan.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={clearPlanned} disabled={busy}>Hapus jadwal belum berjalan di periode ini</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button onClick={generate} disabled={busy || plan.length === 0}>{busy ? "Membuat…" : `Buat ${plan.length} Jadwal`}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
