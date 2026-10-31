import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { parseDelimited } from "@/lib/gradeImport";
import { PiketShift, SHIFT_LABEL, weekendDates } from "@/lib/piket";
import {
  buildTemplate, classify, planImport, toInsertRow, toUpdatePatch,
  type ExistingDuty, type ImportPerson, type PlanResult,
} from "@/lib/piketImport";

interface Props {
  open: boolean;
  onClose: () => void;
  shift: PiketShift;
  ym: string;
  people: ImportPerson[];
  userId: string | null;
  /** dipanggil setelah data tersimpan (tarik ulang fingerprint + muat ulang daftar) */
  onDone: () => void | Promise<void>;
}

const MAX_BYTES = 5 * 1024 * 1024;
type Mode = "update" | "skip";

export function PiketImportDialog({ open, onClose, shift, ym, people, userId, onDone }: Props) {
  const qc = useQueryClient();
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<Mode>("update");
  const [existing, setExisting] = useState<ExistingDuty[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPlan(null); setFileName(""); setExisting([]); setMode("update");
    if (inputRef.current) inputRef.current.value = "";
  };
  const close = () => { reset(); onClose(); };

  const sampleDate = useMemo(() => (shift === "sabtu_minggu" ? weekendDates(ym)[0] : `${ym}-01`) ?? `${ym}-01`, [shift, ym]);

  const downloadTemplate = (kind: "xlsx" | "csv") => {
    const rows = buildTemplate(shift, people, sampleDate);
    const name = `templat-piket-${shift}.${kind}`;
    if (kind === "csv") {
      const csv = rows.map((r) => r.map((c) => (/[",;\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      a.download = name; a.click(); URL.revokeObjectURL(a.href);
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Piket");
    XLSX.writeFile(wb, name);
  };

  const loadExisting = async (dates: string[]): Promise<ExistingDuty[]> => {
    if (dates.length === 0) return [];
    const sorted = [...dates].sort();
    const out: ExistingDuty[] = [];
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase.from("piket_duties" as any)
        .select("id, duty_date, staff_id, teacher_id, person_name")
        .eq("shift_type", shift).gte("duty_date", sorted[0]).lte("duty_date", sorted[sorted.length - 1])
        .range(off, off + 999);
      if (error) throw error;
      out.push(...((data as any[]) ?? []));
      if (!data || (data as any[]).length < 1000) break;
    }
    return out;
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { toast.error("Berkas terlalu besar (maks. 5 MB)"); return; }
    setFileName(file.name);
    try {
      let table: any[][];
      if (/\.csv$|\.txt$/i.test(file.name)) {
        table = parseDelimited(await file.text());
      } else {
        const wb = XLSX.read(await file.arrayBuffer());
        // raw:true agar tanggal/jam Excel terbaca sebagai angka seri (tidak ambigu bulan/hari)
        table = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "", blankrows: false });
      }
      const result = planImport(table, { shift, people });
      setPlan(result);
      setExisting(result.fatal ? [] : await loadExisting(result.rows.filter((r) => !r.errors.length).map((r) => r.date)));
    } catch (e: any) {
      console.error(e);
      toast.error("Berkas tidak dapat dibaca. Gunakan templat dari tombol di atas.");
      setPlan(null);
    }
  };

  const actions = useMemo(() => (plan && !plan.fatal ? classify(plan.rows, existing, mode) : []), [plan, existing, mode]);
  const nIns = actions.filter((a) => a.action === "insert").length;
  const nUpd = actions.filter((a) => a.action === "update").length;
  const nSkip = actions.filter((a) => a.action === "skip").length;
  const warnRows = plan?.rows.filter((r) => !r.errors.length && r.warnings.length) ?? [];
  const errorRows = plan?.rows.filter((r) => r.errors.length) ?? [];

  const apply = async () => {
    if (nIns + nUpd === 0) { toast.error("Tidak ada baris yang perlu disimpan"); return; }
    setBusy(true);
    try {
      let ins = 0, dup = 0, upd = 0;
      const toInsert = actions.filter((a) => a.action === "insert").map((a) => toInsertRow(a.row, shift, userId));
      for (let i = 0; i < toInsert.length; i += 200) {
        const chunk = toInsert.slice(i, i + 200);
        const { error } = await supabase.from("piket_duties" as any).insert(chunk);
        if (!error) { ins += chunk.length; continue; }
        if ((error as any).code !== "23505") throw error;
        // ada yang sudah ada (mis. ditambah orang lain saat unggah): ulangi satu per satu
        for (const r of chunk) {
          const { error: e2 } = await supabase.from("piket_duties" as any).insert(r);
          if (!e2) ins++;
          else if ((e2 as any).code === "23505") dup++;
          else throw e2;
        }
      }
      for (const a of actions.filter((x) => x.action === "update" && x.existingId)) {
        const { error } = await supabase.from("piket_duties" as any).update(toUpdatePatch(a.row) as never).eq("id", a.existingId!);
        if (error) throw error;
        upd++;
      }
      toast.success(
        `Impor selesai: ${ins} ditambahkan, ${upd} diperbarui${nSkip ? `, ${nSkip} dilewati` : ""}${dup ? `, ${dup} sudah ada` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["piket-duties"] });
      await onDone();
      close();
    } catch (e: any) {
      toast.error(`Impor berhenti: ${e.message}. Sebagian baris mungkin sudah tersimpan; unggah ulang berkas yang sama untuk melengkapi.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Impor Kehadiran {SHIFT_LABEL[shift]}</DialogTitle>
          <DialogDescription>
            Isi jadwal dan kehadiran dari Excel/CSV. Format sama dengan hasil ekspor Excel, jadi berkas bisa diedit lalu diunggah lagi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border p-3 space-y-2">
            <p className="font-medium">1. Unduh templat</p>
            <p className="text-xs text-muted-foreground">
              Kolom: Tanggal, Nama, Jabatan, Jam Datang, Jam Pulang, Status (Hadir / Tidak Hadir / Izin / Dijadwalkan), Keterangan. Kolom PIN boleh ditambahkan bila ada nama kembar.
              {shift === "malam" && " Piket malam: jam sebelum 12:00 dianggap hari berikutnya (mis. 05:30)."}
              {shift === "sabtu_minggu" && " Tanggal harus hari Sabtu atau Minggu."}
              {" "}Status Hadir/Tidak Hadir/Izin disimpan sebagai input manual (tidak ditimpa fingerprint); status Dijadwalkan atau kosong tanpa jam hanya membuat jadwal, lalu diisi dari fingerprint.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => downloadTemplate("xlsx")}><Download className="h-4 w-4" />Excel (.xlsx)</Button>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => downloadTemplate("csv")}><Download className="h-4 w-4" />CSV</Button>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <p className="font-medium">2. Unggah berkas yang sudah diisi</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {fileName && <p className="text-xs text-muted-foreground flex items-center gap-1"><Upload className="h-3 w-3" />{fileName}</p>}
          </div>

          {plan?.fatal && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{plan.fatal}</p>}

          {plan && !plan.fatal && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-green-50 px-3 py-1 font-semibold text-green-700">{nIns} baru</span>
                {nUpd > 0 && <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">{nUpd} diperbarui</span>}
                {nSkip > 0 && <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{nSkip} dilewati (sudah ada)</span>}
                {plan.errorCount > 0 && <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700">{plan.errorCount} baris bermasalah (dilewati)</span>}
              </div>

              {(nUpd > 0 || nSkip > 0) && (
                <div className="rounded-lg border p-3 space-y-1.5">
                  <p className="text-xs font-medium">Jika petugas dan tanggal sudah ada di daftar:</p>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="radio" name="piket-import-mode" checked={mode === "update"} onChange={() => setMode("update")} />
                    Perbarui dengan isi berkas (status dan jam diganti)
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="radio" name="piket-import-mode" checked={mode === "skip"} onChange={() => setMode("skip")} />
                    Lewati, biarkan data yang ada
                  </label>
                </div>
              )}

              {plan.ignoredHeaders.length > 0 && <p className="text-xs text-muted-foreground">Kolom diabaikan: {plan.ignoredHeaders.join(", ")}</p>}

              {errorRows.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left"><tr><th className="p-2 w-14">Baris</th><th className="p-2">Petugas</th><th className="p-2">Masalah</th></tr></thead>
                    <tbody>
                      {errorRows.map((r) => (
                        <tr key={r.line} className="border-t align-top">
                          <td className="p-2">{r.line}</td><td className="p-2">{r.name || "-"}</td>
                          <td className="p-2 text-red-700">{r.errors.join("; ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {warnRows.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/50">
                  <p className="px-2 pt-2 text-xs font-medium text-amber-800">Perhatian (tetap diimpor)</p>
                  <table className="w-full text-xs">
                    <tbody>
                      {warnRows.map((r) => (
                        <tr key={r.line} className="border-t border-amber-100 align-top">
                          <td className="p-2 w-14">{r.line}</td><td className="p-2">{r.name}</td>
                          <td className="p-2 text-amber-800">{r.warnings.join("; ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={close} disabled={busy}>Batal</Button>
          <Button type="button" className="bg-gradient-primary" disabled={busy || !plan || !!plan.fatal || nIns + nUpd === 0} onClick={apply}>
            {busy ? "Menyimpan…" : `Simpan ${nIns + nUpd} baris`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
