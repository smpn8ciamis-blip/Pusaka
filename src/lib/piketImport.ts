// Impor kehadiran piket dari Excel/CSV. Semua pembacaan, pencocokan nama, dan penentuan
// tambah/perbarui ada di sini (murni, tanpa browser) agar bisa diuji.
import { PiketShift, isWeekendDate, parseISODate, toISODate } from "@/lib/piket";

export type ImportStatus = "dijadwalkan" | "hadir" | "tidak_hadir" | "izin";

export interface ImportPerson {
  key: string; // staff:<id> | teacher:<id>
  type: "staff" | "teacher";
  id: string;
  name: string;
  position: string;
  pin: string | null;
}

export interface PlannedDuty {
  /** nomor baris pada berkas (1 = baris pertama) */
  line: number;
  date: string; // yyyy-MM-dd
  person: ImportPerson | null; // null = petugas manual (tidak ada di data staf/guru)
  name: string;
  position: string | null;
  status: ImportStatus;
  checkIn: string | null; // ISO (UTC)
  checkOut: string | null;
  notes: string | null;
  errors: string[];
  warnings: string[];
}

export interface PlanResult {
  fatal?: string;
  rows: PlannedDuty[];
  ignoredHeaders: string[];
  okCount: number;
  errorCount: number;
}

type Cell = string | number | boolean | Date | null | undefined;

const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Gelar yang sering ada/tidak ada pada penulisan nama (dihapus saat mencocokkan)
const TITLES = new Set([
  "drs", "dra", "dr", "ir", "hj", "h", "kh", "s", "pd", "i", "m", "kom", "ag", "si", "se", "sos", "sy", "ei", "hum", "sn", "kes", "psi", "ak", "mm", "mpd", "spd", "skom", "ssi", "sag", "ssos", "mkom", "msi", "mag", "mh", "sh", "str", "amd", "a", "md", "pak", "bu", "bapak", "ibu",
]);
const stripTitles = (s: string) => norm(s).split(" ").filter((t) => t && !TITLES.has(t)).join(" ");

const HEADERS: Record<string, string[]> = {
  date: ["tanggal", "tgl", "date"],
  name: ["nama", "nama petugas", "nama lengkap"],
  pin: ["pin", "pin fingerprint"],
  position: ["jabatan", "posisi"],
  in: ["jam datang", "jam masuk", "datang", "masuk"],
  out: ["jam pulang", "jam keluar", "pulang", "keluar"],
  status: ["status", "kehadiran"],
  notes: ["keterangan", "catatan"],
};

/** Tanggal dari yyyy-MM-dd, dd/MM/yyyy, dd-MM-yyyy, nomor seri Excel, atau objek Date. null = tidak valid. */
export function parseDateCell(v: Cell): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : toISODate(v);
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null;
    const d = new Date(Math.round((Math.floor(v) - 25569) * 86400000)); // UTC
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const t = String(v).trim();
  let y: number, m: number, d: number, mt: RegExpMatchArray | null;
  if ((mt = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/))) { d = +mt[1]; m = +mt[2]; y = +mt[3]; if (y < 100) y += 2000; }
  else return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return toISODate(dt);
}

/** Jam "HH:mm" dari "19:30", "19.30", "7:05:00", angka pecahan hari Excel. '' = kosong, null = tidak valid. */
export function parseTimeCell(v: Cell): string | "" | null {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return `${String(v.getHours()).padStart(2, "0")}:${String(v.getMinutes()).padStart(2, "0")}`;
  if (typeof v === "number") {
    const frac = v - Math.floor(v);
    if (v < 0) return null;
    const mins = Math.round(frac * 24 * 60) % (24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  const t = String(v).trim().toLowerCase().replace(/\s*wib$/, "");
  if (t === "" || t === "-") return "";
  const m = t.match(/^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

export function parseStatusCell(v: Cell): ImportStatus | "" | null {
  const t = norm(v);
  if (!t) return "";
  if (["hadir", "h", "masuk", "ya"].includes(t)) return "hadir";
  if (["tidak hadir", "tidak", "alpa", "alfa", "a", "absen", "tanpa keterangan"].includes(t)) return "tidak_hadir";
  if (["izin", "i", "sakit", "s", "cuti"].includes(t)) return "izin";
  if (["dijadwalkan", "jadwal", "terjadwal", "belum"].includes(t)) return "dijadwalkan";
  return null;
}

const wib = (date: string, hhmm: string, addDays = 0) => {
  const d = parseISODate(date);
  d.setDate(d.getDate() + addDays);
  return new Date(`${toISODate(d)}T${hhmm}:00+07:00`).toISOString();
};

/**
 * Jam datang/pulang -> waktu lengkap.
 * Piket malam melewati tengah malam: jam sebelum 12:00 dianggap hari berikutnya.
 */
export function buildTimes(shift: PiketShift, date: string, inT: string, outT: string): { checkIn: string | null; checkOut: string | null; error?: string } {
  const isNext = (t: string) => shift === "malam" && Number(t.slice(0, 2)) < 12;
  const checkIn = inT ? wib(date, inT, isNext(inT) ? 1 : 0) : null;
  let checkOut: string | null = null;
  if (outT) {
    checkOut = wib(date, outT, isNext(outT) ? 1 : 0);
    if (checkIn && new Date(checkOut) <= new Date(checkIn)) return { checkIn, checkOut: null, error: "Jam pulang harus setelah jam datang" };
  }
  return { checkIn, checkOut };
}

export function planImport(table: Cell[][], opts: { shift: PiketShift; people: ImportPerson[] }): PlanResult {
  const fail = (fatal: string): PlanResult => ({ fatal, rows: [], ignoredHeaders: [], okCount: 0, errorCount: 0 });
  if (table.length === 0) return fail("Berkas kosong");

  const hIdx = table.findIndex((r) => {
    const names = r.map(norm);
    return names.some((n) => HEADERS.date.includes(n)) && names.some((n) => HEADERS.name.includes(n));
  });
  if (hIdx < 0) return fail("Baris judul tidak ditemukan. Berkas harus memiliki kolom Tanggal dan Nama (unduh templat).");
  const header = table[hIdx].map(norm);
  const col = (k: keyof typeof HEADERS) => header.findIndex((h) => HEADERS[k].includes(h));
  const c = { date: col("date"), name: col("name"), pin: col("pin"), position: col("position"), in: col("in"), out: col("out"), status: col("status"), notes: col("notes") };
  const known = new Set(Object.values(c).filter((i) => i >= 0));
  const ignoredHeaders = table[hIdx].map((h, i) => (known.has(i) || !norm(h) ? "" : String(h).trim())).filter(Boolean);

  const byPin = new Map<string, ImportPerson[]>();
  const byName = new Map<string, ImportPerson[]>();
  const byStripped = new Map<string, ImportPerson[]>();
  const push = (m: Map<string, ImportPerson[]>, k: string, p: ImportPerson) => { if (k) m.set(k, [...(m.get(k) ?? []), p]); };
  for (const p of opts.people) {
    if (p.pin) push(byPin, String(p.pin).trim(), p);
    push(byName, norm(p.name), p);
    push(byStripped, stripTitles(p.name), p);
  }

  const seen = new Set<string>();
  const rows: PlannedDuty[] = [];
  for (let r = hIdx + 1; r < table.length; r++) {
    const line = table[r];
    const get = (i: number): Cell => (i >= 0 ? line[i] : undefined);
    const rawName = String(get(c.name) ?? "").trim();
    const rawDate = get(c.date);
    if (!rawName && (rawDate === "" || rawDate == null)) continue; // baris kosong

    const errors: string[] = [];
    const warnings: string[] = [];

    const date = parseDateCell(rawDate);
    if (!date) errors.push(`Tanggal "${String(rawDate ?? "").trim()}" tidak valid (pakai dd/mm/yyyy atau yyyy-mm-dd)`);
    else if (opts.shift === "sabtu_minggu" && !isWeekendDate(date)) errors.push("Piket Sabtu & Minggu hanya untuk hari Sabtu atau Minggu");

    // pencocokan petugas: PIN, lalu nama persis, lalu nama tanpa gelar
    let person: ImportPerson | null = null;
    const pinVal = String(get(c.pin) ?? "").trim();
    let cands: ImportPerson[] = [];
    if (pinVal) cands = byPin.get(pinVal) ?? [];
    if (cands.length === 0 && rawName) cands = byName.get(norm(rawName)) ?? [];
    if (cands.length === 0 && rawName) cands = byStripped.get(stripTitles(rawName)) ?? [];
    if (!rawName && cands.length === 0) errors.push("Nama petugas kosong");
    else if (cands.length > 1) errors.push(`Nama "${rawName}" cocok dengan ${cands.length} orang; isi kolom PIN`);
    else if (cands.length === 1) person = cands[0];
    else warnings.push("Tidak ada di data staf/guru: dicatat sebagai petugas manual");

    const name = person?.name ?? rawName;
    const position = String(get(c.position) ?? "").trim() || person?.position || null;

    const inT = parseTimeCell(get(c.in));
    const outT = parseTimeCell(get(c.out));
    if (inT === null) errors.push(`Jam datang "${String(get(c.in)).trim()}" tidak valid (contoh 19:30)`);
    if (outT === null) errors.push(`Jam pulang "${String(get(c.out)).trim()}" tidak valid (contoh 05:30)`);

    let status: ImportStatus;
    const st = parseStatusCell(get(c.status));
    if (st === null) { errors.push(`Status "${String(get(c.status)).trim()}" tidak dikenal (Hadir / Tidak Hadir / Izin / Dijadwalkan)`); status = "hadir"; }
    else if (st === "") status = inT || outT ? "hadir" : "dijadwalkan";
    else status = st;

    let checkIn: string | null = null;
    let checkOut: string | null = null;
    if (date && inT !== null && outT !== null) {
      if (status === "hadir") {
        const t = buildTimes(opts.shift, date, inT, outT);
        if (t.error) errors.push(t.error);
        checkIn = t.checkIn; checkOut = t.checkOut;
      } else if (inT || outT) warnings.push("Jam diabaikan karena status bukan Hadir");
    }

    const key = date ? `${date}|${person ? person.key : "manual:" + name.trim().toLowerCase()}` : "";
    if (key) {
      if (seen.has(key)) errors.push("Petugas dan tanggal yang sama muncul lebih dari sekali di berkas");
      seen.add(key);
    }

    rows.push({
      line: r + 1, date: date ?? "", person, name, position, status, checkIn, checkOut,
      notes: String(get(c.notes) ?? "").trim() || null, errors, warnings,
    });
  }

  const errorCount = rows.filter((x) => x.errors.length > 0).length;
  return { rows, ignoredHeaders, okCount: rows.length - errorCount, errorCount };
}

export interface ExistingDuty {
  id: string;
  duty_date: string;
  staff_id: string | null;
  teacher_id: string | null;
  person_name: string;
}

const existingKey = (d: ExistingDuty) => `${d.duty_date}|${d.staff_id ? "staff:" + d.staff_id : d.teacher_id ? "teacher:" + d.teacher_id : "manual:" + d.person_name.trim().toLowerCase()}`;

export type Action = "insert" | "update" | "skip";

/** Tentukan tambah / perbarui / lewati untuk baris yang valid. */
export function classify(rows: PlannedDuty[], existing: ExistingDuty[], mode: "update" | "skip") {
  const map = new Map(existing.map((e) => [existingKey(e), e]));
  return rows
    .filter((r) => r.errors.length === 0)
    .map((r) => {
      const e = map.get(`${r.date}|${r.person ? r.person.key : "manual:" + r.name.trim().toLowerCase()}`);
      const action: Action = !e ? "insert" : mode === "update" ? "update" : "skip";
      return { row: r, existingId: e?.id ?? null, action };
    });
}

/** Isi baris database untuk tambah baru. Status Dijadwalkan = jadwal saja (sumber fingerprint, boleh terisi ketukan). */
export function toInsertRow(r: PlannedDuty, shift: PiketShift, userId: string | null) {
  const scheduleOnly = r.status === "dijadwalkan";
  return {
    shift_type: shift,
    duty_date: r.date,
    person_type: r.person ? r.person.type : "manual",
    staff_id: r.person?.type === "staff" ? r.person.id : null,
    teacher_id: r.person?.type === "teacher" ? r.person.id : null,
    person_name: r.name,
    position: r.position,
    status: r.status,
    source: scheduleOnly ? "fingerprint" : "manual",
    check_in_at: r.status === "hadir" ? r.checkIn : null,
    check_out_at: r.status === "hadir" ? r.checkOut : null,
    notes: r.notes,
    created_by: userId,
  };
}

/** Perubahan untuk baris yang sudah ada. Keterangan/jabatan kosong tidak menghapus isi lama. */
export function toUpdatePatch(r: PlannedDuty) {
  const scheduleOnly = r.status === "dijadwalkan";
  const patch: Record<string, unknown> = {
    status: r.status,
    source: scheduleOnly ? "fingerprint" : "manual",
    check_in_at: r.status === "hadir" ? r.checkIn : null,
    check_out_at: r.status === "hadir" ? r.checkOut : null,
  };
  if (r.notes) patch.notes = r.notes;
  if (r.position) patch.position = r.position;
  return patch;
}

/** Baris contoh + petunjuk untuk templat. */
export function buildTemplate(shift: PiketShift, people: ImportPerson[], sampleDate: string): (string | number)[][] {
  const head = ["Tanggal", "Nama", "Jabatan", "Jam Datang", "Jam Pulang", "Status", "Keterangan"];
  const sample = people.slice(0, 2);
  const outJam = shift === "malam" ? "05:30" : "14:00";
  const inJam = shift === "malam" ? "19:00" : "07:30";
  const rows: (string | number)[][] = sample.map((p, i) => [sampleDate, p.name, p.position, i === 0 ? inJam : "", i === 0 ? outJam : "", i === 0 ? "Hadir" : "Izin", i === 0 ? "" : "Sakit"]);
  if (rows.length === 0) rows.push([sampleDate, "Nama Petugas", "Jabatan", inJam, outJam, "Hadir", ""]);
  return [head, ...rows];
}
