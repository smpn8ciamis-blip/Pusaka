import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import { formatTanggalPanjang } from "@/lib/journalReport";

export type PiketShift = "malam" | "sabtu_minggu";
export type PiketStatus = "dijadwalkan" | "hadir" | "tidak_hadir" | "izin" | "konfirmasi" | "ditolak";

export interface PiketDuty {
  id: string;
  shift_type: PiketShift;
  duty_date: string; // yyyy-MM-dd
  person_type: "staff" | "teacher" | "manual";
  staff_id: string | null;
  teacher_id: string | null;
  person_name: string;
  position: string | null;
  fingerprint_pin: string | null;
  status: PiketStatus;
  check_in_at: string | null;
  check_out_at: string | null;
  source: "fingerprint" | "manual";
  notes: string | null;
}

export interface PiketCfg {
  night_checkin_deadline: string;
  weekend_checkin_deadline: string;
  [k: string]: any;
}

export const DEFAULT_CFG: PiketCfg = {
  night_window_start: "16:00", night_window_end: "09:00", night_detect_start: "18:00",
  weekend_window_start: "05:00", weekend_window_end: "20:00",
  night_checkin_deadline: "20:00", night_checkout_start: "05:00", night_candidate_from: "18:00",
  weekend_checkin_deadline: "08:00", weekend_checkout_start: "14:00",
  min_gap_minutes: 60,
};

const hhmmWIB = (ts: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(new Date(ts));

/**
 * Keterangan otomatis dari ketukan fingerprint (baris yang diubah manual tidak diberi keterangan otomatis):
 * - hanya absen pulang                        -> Terlambat
 * - absen masuk melewati batas masuk           -> Terlambat
 * - hanya absen masuk, tanpa absen pulang      -> Pulang Sebelum Waktunya
 */
export function autoRemark(d: PiketDuty, cfg: PiketCfg = DEFAULT_CFG): string {
  if (d.source === "manual" || d.status !== "hadir") return "";
  const deadline = String(d.shift_type === "malam" ? cfg.night_checkin_deadline : cfg.weekend_checkin_deadline).slice(0, 5);
  const out: string[] = [];
  if (!d.check_in_at && d.check_out_at) out.push("Terlambat");
  else if (d.check_in_at && hhmmWIB(d.check_in_at) > deadline) out.push("Terlambat");
  if (d.check_in_at && !d.check_out_at) {
    // baru dinilai setelah jam mulai absen pulang lewat (shift yang masih berjalan tidak ditandai)
    const t = String(d.shift_type === "malam" ? cfg.night_checkout_start : cfg.weekend_checkout_start).slice(0, 5);
    const base = parseISODate(d.duty_date);
    if (d.shift_type === "malam") base.setDate(base.getDate() + 1);
    if (Date.now() >= new Date(`${toISODate(base)}T${t}:00+07:00`).getTime()) out.push("Pulang Sebelum Waktunya");
  }
  return out.join(", ");
}

/** Hanya ketukan yang tercatat (masuk pertama & pulang pertama); ketukan lain tidak ditampilkan. */
export function recordedPunches(d: PiketDuty, ps: PiketPunch[] | undefined) {
  const list = ps ?? [];
  const at = (ts: string | null) => (ts ? list.find((p) => new Date(p.punched_at).getTime() === new Date(ts).getTime()) : undefined);
  return [
    { label: "Masuk", punch: at(d.check_in_at) },
    { label: "Pulang", punch: at(d.check_out_at) },
  ].filter((x): x is { label: string; punch: PiketPunch } => !!x.punch);
}

export const SHIFT_LABEL: Record<PiketShift, string> = {
  malam: "Piket Malam",
  sabtu_minggu: "Piket Sabtu & Minggu",
};

export const STATUS_LABEL: Record<PiketStatus, string> = {
  dijadwalkan: "Dijadwalkan",
  hadir: "Hadir",
  tidak_hadir: "Tidak Hadir",
  izin: "Izin",
  konfirmasi: "Menunggu Konfirmasi",
  ditolak: "Tidak Dihitung",
};

export interface PiketUnscheduled {
  id: string; shift_type: PiketShift; duty_date: string; person_type: "staff" | "teacher";
  person_name: string; position: string | null; fingerprint_pin: string | null;
  check_in_at: string | null; check_out_at: string | null; status: "menunggu" | "dihitung" | "diabaikan";
}

export interface PiketPunch { duty_id: string; punched_at: string; verify_type: number | null; device_sn: string }

/** Kode verifikasi ZKTeco (ADMS) -> label. */
export const VERIFY_LABEL: Record<number, string> = {
  0: "Password", 1: "Sidik Jari", 2: "Kartu", 3: "Password", 4: "Kartu", 15: "Wajah", 25: "Telapak Tangan",
};
export const verifyLabel = (v: number | null | undefined) =>
  v == null ? "-" : VERIFY_LABEL[v] ?? `Lainnya (${v})`;

export const pad = (n: number) => String(n).padStart(2, "0");
export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISODate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return { from: toISODate(new Date(y, m - 1, 1)), to: toISODate(new Date(y, m, 0)) };
};

/** Semua Sabtu & Minggu dalam bulan (yyyy-MM). */
export const weekendDates = (ym: string): string[] => {
  const [y, m] = ym.split("-").map(Number);
  const out: string[] = [];
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const dt = new Date(y, m - 1, d);
    if (dt.getDay() === 0 || dt.getDay() === 6) out.push(toISODate(dt));
  }
  return out;
};

export const hariLabel = (iso: string) =>
  ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][parseISODate(iso).getDay()];

/** Jam:menit WIB dari timestamp. */
export const jamWIB = (ts: string | null) =>
  ts
    ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" })
        .format(new Date(ts))
        .replace(".", ":")
    : "-";

export const bulanLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
};

export const punchText = (d: PiketDuty, ps: PiketPunch[] | undefined) =>
  recordedPunches(d, ps).map((x) => `${x.label} ${jamWIB(x.punch.punched_at)} (${verifyLabel(x.punch.verify_type)})`).join(", ");

export const keteranganText = (d: PiketDuty, ps: PiketPunch[] | undefined, cfg?: PiketCfg) =>
  [autoRemark(d, cfg), d.notes].filter(Boolean).join(" - ");

/** Daftar hadir cetak/ekspor: jadwal "Dijadwalkan" (belum ada ketukan), "Menunggu Konfirmasi" dan "Tidak Dihitung" tidak ditampilkan dan tidak dihitung. */
export const recordedRows = (rows: PiketDuty[]) =>
  rows.filter((r) => r.status !== "dijadwalkan" && r.status !== "konfirmasi" && r.status !== "ditolak");

const sorted = (rows: PiketDuty[]) =>
  recordedRows(rows).sort((a, b) => a.duty_date.localeCompare(b.duty_date) || a.person_name.localeCompare(b.person_name));

export function exportPiketExcel(rows: PiketDuty[], shift: PiketShift, ym: string, punches?: Map<string, PiketPunch[]>, cfg?: PiketCfg) {
  const data = sorted(rows).map((r, i) => ({
    No: i + 1,
    Hari: hariLabel(r.duty_date),
    Tanggal: r.duty_date,
    Nama: r.person_name,
    Jabatan: r.position ?? "",
    "Jam Datang": jamWIB(r.check_in_at),
    "Jam Pulang": jamWIB(r.check_out_at),
    Status: STATUS_LABEL[r.status],
    "Ketukan (jam & jenis)": punchText(r, punches?.get(r.id)),
    Keterangan: keteranganText(r, punches?.get(r.id), cfg),
    Sumber: r.source === "fingerprint" ? "Fingerprint" : "Manual",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daftar Hadir");
  XLSX.writeFile(wb, `daftar-hadir-${shift}-${ym}.xlsx`);
}

export async function buildPiketPdf(opts: {
  rows: PiketDuty[];
  shift: PiketShift;
  ym: string;
  school?: any;
  punches?: Map<string, PiketPunch[]>;
  cfg?: PiketCfg;
}): Promise<jsPDF> {
  const { rows, shift, ym, school, punches, cfg } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const startY = await addLetterheadToPDF(doc, school);
  const w = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`DAFTAR HADIR ${SHIFT_LABEL[shift].toUpperCase()}`, w / 2, startY + 8, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Bulan ${bulanLabel(ym)}`, w / 2, startY + 14, { align: "center" });

  const list = sorted(rows);
  autoTable(doc, {
    startY: startY + 19,
    head: [["No", "Hari / Tanggal", "Nama", "Datang", "Pulang", "Keterangan"]],
    body: list.map((r, i) => [
      i + 1,
      `${hariLabel(r.duty_date)}, ${formatTanggalPanjang(r.duty_date)}`,
      r.person_name + (r.position ? `\n${r.position}` : ""),
      jamWIB(r.check_in_at),
      jamWIB(r.check_out_at),
      [STATUS_LABEL[r.status], keteranganText(r, punches?.get(r.id), cfg), punchText(r, punches?.get(r.id))].filter(Boolean).join("\n"),
    ]),
    styles: { fontSize: 8.5, cellPadding: 1.8, valign: "middle" },
    headStyles: { fillColor: [230, 230, 230], textColor: 0, halign: "center" },
    columnStyles: { 0: { halign: "center", cellWidth: 9 }, 3: { halign: "center", cellWidth: 16 }, 4: { halign: "center", cellWidth: 16 } },
  });

  const hadir = list.filter((r) => r.status === "hadir").length;
  let y = (doc as any).lastAutoTable.finalY + 6;
  if (y > 240) { doc.addPage(); y = 25; }
  doc.setFontSize(9);
  doc.text(`Total tercatat: ${list.length}   Hadir: ${hadir}   Tidak hadir: ${list.filter((r) => r.status === "tidak_hadir").length}   Izin: ${list.filter((r) => r.status === "izin").length}`, 14, y);
  y += 10;
  const cx = w - 50;
  const city = school?.city || "Ciamis";
  if (y > 235) { doc.addPage(); y = 25; }
  doc.text(`${city}, ${formatTanggalPanjang(new Date())}`, cx, y, { align: "center" });
  doc.text("Mengetahui,", cx, y + 5, { align: "center" });
  doc.text(school?.headmaster_position || "Kepala Sekolah", cx, y + 10, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.text(school?.headmaster_name ?? "(.....................)", cx, y + 35, { align: "center" });
  doc.setFont("helvetica", "normal");
  if (school?.headmaster_nip) doc.text(`NIP. ${school.headmaster_nip}`, cx, y + 40, { align: "center" });
  return doc;
}
