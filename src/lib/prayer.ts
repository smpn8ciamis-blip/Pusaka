import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import { formatTanggalPanjang } from "@/lib/journalReport";
import { jamWIB, hariLabel, parseISODate, toISODate } from "@/lib/piket";

export interface PrayerType {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  late_after: string | null;
  source: "fingerprint" | "rfid";
  device_sn: string | null;
  days_of_week: number[];
  sort_order: number;
  is_active: boolean;
}

export interface PrayerLog {
  id: string;
  student_id: string;
  prayer_type_id: string;
  date: string;
  punched_at: string;
  status: "hadir" | "terlambat";
  source: "fingerprint" | "rfid" | "manual";
  device_sn: string | null;
  note: string | null;
  students?: { full_name: string; nis: string | null; class_id: string | null; classes?: { name: string } | null } | null;
  prayer_types?: { name: string } | null;
}

export const SOURCE_LABEL: Record<string, string> = { fingerprint: "Mesin Fingerprint", rfid: "Kartu RFID", manual: "Manual" };
export const STATUS_LABEL: Record<string, string> = { hadir: "Tepat waktu", terlambat: "Terlambat" };
export const DAYS = [
  { n: 1, label: "Sen" }, { n: 2, label: "Sel" }, { n: 3, label: "Rab" }, { n: 4, label: "Kam" },
  { n: 5, label: "Jum" }, { n: 6, label: "Sab" }, { n: 7, label: "Min" },
];

export const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "-");
export const daysText = (d: number[]) =>
  d.length === 7 ? "Setiap hari" : DAYS.filter((x) => d.includes(x.n)).map((x) => x.label).join(", ") || "-";

export const tanggalPendek = (iso: string) => `${hariLabel(iso)}, ${formatTanggalPanjang(parseISODate(iso))}`;
export const logTime = (l: PrayerLog) => jamWIB(l.punched_at);

/** Banyak hari terjadwal salat ini dalam rentang tanggal (tanpa memperhitungkan hari libur). */
export function scheduledDays(t: PrayerType, from: string, to: string): number {
  const a = parseISODate(from), b = parseISODate(to);
  let n = 0;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const iso = d.getDay() === 0 ? 7 : d.getDay();
    if (t.days_of_week.includes(iso)) n++;
  }
  return n;
}

export interface SummaryRow {
  student_id: string; full_name: string; nis: string | null; class_name: string | null;
  prayer_type_id: string; hadir: number; terlambat: number;
}
export interface RecapRow {
  student_id: string; full_name: string; nis: string; class_name: string;
  per: Record<string, { hadir: number; terlambat: number }>;
  hadir: number; terlambat: number; total: number; expected: number; pct: number;
}

export interface BaseStudent { id: string; full_name: string; nis: string | null; class_name: string | null }

/** `base` = semua siswa aktif yang ditampilkan (siswa tanpa catatan tetap muncul dengan nilai 0). */
export function buildRecap(rows: SummaryRow[], types: PrayerType[], from: string, to: string, base: BaseStudent[] = []): RecapRow[] {
  const expected = types.reduce((s, t) => s + scheduledDays(t, from, to), 0);
  const ids = new Set(types.map((t) => t.id));
  const map = new Map<string, RecapRow>();
  for (const b of base) {
    map.set(b.id, { student_id: b.id, full_name: b.full_name, nis: b.nis ?? "-", class_name: b.class_name ?? "-", per: {}, hadir: 0, terlambat: 0, total: 0, expected, pct: 0 });
  }
  for (const r of rows) {
    if (!ids.has(r.prayer_type_id)) continue;
    let x = map.get(r.student_id);
    if (!x && base.length > 0) continue;   // bukan siswa aktif (alumni/mutasi) atau di luar filter
    if (!x) {
      x = { student_id: r.student_id, full_name: r.full_name, nis: r.nis ?? "-", class_name: r.class_name ?? "-", per: {}, hadir: 0, terlambat: 0, total: 0, expected, pct: 0 };
      map.set(r.student_id, x);
    }
    x.per[r.prayer_type_id] = { hadir: Number(r.hadir), terlambat: Number(r.terlambat) };
    x.hadir += Number(r.hadir); x.terlambat += Number(r.terlambat);
  }
  for (const x of map.values()) {
    x.total = x.hadir + x.terlambat;
    x.pct = expected > 0 ? Math.min(100, Math.round((x.total / expected) * 100)) : 0;
  }
  return [...map.values()];
}

const rangeText = (from: string, to: string) =>
  from === to ? formatTanggalPanjang(parseISODate(from)) : `${formatTanggalPanjang(parseISODate(from))} s.d. ${formatTanggalPanjang(parseISODate(to))}`;

export async function buildPrayerRecapPdf(opts: {
  rows: RecapRow[]; types: PrayerType[]; from: string; to: string; className?: string; school?: any;
}): Promise<jsPDF> {
  const { rows, types, from, to, className, school } = opts;
  const doc = new jsPDF({ orientation: types.length > 3 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const startY = await addLetterheadToPDF(doc, school);
  const w = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("REKAP ABSENSI SALAT SISWA", w / 2, startY + 8, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`${className ? `Kelas ${className} · ` : ""}${rangeText(from, to)}`, w / 2, startY + 14, { align: "center" });

  autoTable(doc, {
    startY: startY + 19,
    head: [["No", "Nama", "Kelas", ...types.map((t) => t.name), "Hadir", "Terlambat", "%"]],
    body: rows.map((r, i) => [
      i + 1, r.full_name, r.class_name,
      ...types.map((t) => { const p = r.per[t.id]; return p ? String(p.hadir + p.terlambat) : "0"; }),
      r.total, r.terlambat, `${r.pct}%`,
    ]),
    styles: { fontSize: 8.5, cellPadding: 1.6, valign: "middle" },
    headStyles: { fillColor: [230, 230, 230], textColor: 0, halign: "center" },
    columnStyles: { 0: { halign: "center", cellWidth: 9 } },
    didParseCell: (d) => { if (d.section === "body" && d.column.index >= 3) d.cell.styles.halign = "center"; },
  });

  let y = (doc as any).lastAutoTable.finalY + 5;
  doc.setFontSize(8.5);
  const exp = rows[0]?.expected ?? 0;
  doc.text(`Persentase = jumlah salat tercatat dibagi ${exp} kesempatan salat terjadwal pada rentang ini (hari libur belum dikecualikan).`, 14, y);
  y += 8;
  const cx = w - 50;
  if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 25; }
  doc.setFontSize(9);
  doc.text(`${school?.city || "Ciamis"}, ${formatTanggalPanjang(new Date())}`, cx, y, { align: "center" });
  doc.text("Mengetahui,", cx, y + 5, { align: "center" });
  doc.text(school?.headmaster_position || "Kepala Sekolah", cx, y + 10, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.text(school?.headmaster_name ?? "(.....................)", cx, y + 35, { align: "center" });
  doc.setFont("helvetica", "normal");
  if (school?.headmaster_nip) doc.text(`NIP. ${school.headmaster_nip}`, cx, y + 40, { align: "center" });
  return doc;
}

export async function buildPrayerLogPdf(opts: { rows: PrayerLog[]; from: string; to: string; school?: any }): Promise<jsPDF> {
  const { rows, from, to, school } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const startY = await addLetterheadToPDF(doc, school);
  const w = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("DAFTAR HADIR SALAT SISWA", w / 2, startY + 8, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(rangeText(from, to), w / 2, startY + 14, { align: "center" });
  autoTable(doc, {
    startY: startY + 19,
    head: [["No", "Tanggal", "Nama", "Kelas", "Salat", "Jam", "Keterangan"]],
    body: rows.map((r, i) => [
      i + 1, tanggalPendek(r.date), r.students?.full_name ?? "-", r.students?.classes?.name ?? "-",
      r.prayer_types?.name ?? "-", logTime(r), `${STATUS_LABEL[r.status]} · ${SOURCE_LABEL[r.source]}`,
    ]),
    styles: { fontSize: 8, cellPadding: 1.5, valign: "middle" },
    headStyles: { fillColor: [230, 230, 230], textColor: 0, halign: "center" },
    columnStyles: { 0: { halign: "center", cellWidth: 9 }, 5: { halign: "center", cellWidth: 14 } },
  });
  return doc;
}

export function exportPrayerRecapExcel(rows: RecapRow[], types: PrayerType[], from: string, to: string) {
  const data = rows.map((r, i) => {
    const o: Record<string, any> = { No: i + 1, Nama: r.full_name, NIS: r.nis, Kelas: r.class_name };
    types.forEach((t) => { const p = r.per[t.id]; o[t.name] = p ? p.hadir + p.terlambat : 0; });
    o["Total Hadir"] = r.total; o["Terlambat"] = r.terlambat; o["Kesempatan"] = r.expected; o["Persen"] = `${r.pct}%`;
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rekap Salat");
  XLSX.writeFile(wb, `rekap-salat-${from}_${to}.xlsx`);
}

export function exportPrayerLogExcel(rows: PrayerLog[], from: string, to: string) {
  const data = rows.map((r, i) => ({
    No: i + 1, Tanggal: r.date, Hari: hariLabel(r.date), Nama: r.students?.full_name ?? "-", NIS: r.students?.nis ?? "-",
    Kelas: r.students?.classes?.name ?? "-", Salat: r.prayer_types?.name ?? "-", Jam: logTime(r),
    Status: STATUS_LABEL[r.status], Sumber: SOURCE_LABEL[r.source], Catatan: r.note ?? "",
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Log Salat");
  XLSX.writeFile(wb, `log-salat-${from}_${to}.xlsx`);
}

export { toISODate };
