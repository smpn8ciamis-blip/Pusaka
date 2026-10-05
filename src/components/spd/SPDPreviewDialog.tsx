import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn, toTitleCase } from "@/lib/utils";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import {
  Download, Save, RotateCcw, Eye, EyeOff, FileText,
  Type, Settings2, Menu, ChevronUp, ChevronDown, X,
} from "lucide-react";

interface SPDPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  travel: any;
}

const numberToWords = (num: number): string => {
  const words = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh',
    'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas', 'dua puluh',
    'dua puluh satu', 'dua puluh dua', 'dua puluh tiga', 'dua puluh empat', 'dua puluh lima', 'dua puluh enam', 'dua puluh tujuh', 'dua puluh delapan', 'dua puluh sembilan', 'tiga puluh'];
  return words[num] || num.toString();
};

// ============================================================
// Default settings
// ============================================================
const DEFAULT_SETTINGS = {
  marginTop: 5,
  marginLeft: 13,
  marginRight: 13,
  marginBottom: 10,

  fontSizeTitle: 12,
  fontSizeBody: 10,
  fontSizeTable: 9,
  fontSizeSignature: 10,

  lineHeightLog: 39,
  paddingBoxLog: 4,
  sectionGapLog: 0,

  lineHeightLPT: 8,
  paddingBoxLPT: 4,
  sectionGapLPT: 0,
};

type SettingsKey = keyof typeof DEFAULT_SETTINGS;

const STORAGE_KEY = "spd_preview_settings_v1";

// ============================================================
// Component
// ============================================================
export function SPDPreviewDialog({ open, onOpenChange, travel }: SPDPreviewDialogProps) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<"spd" | "log" | "lpt">("spd");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [schoolSettings, setSchoolSettings] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ===== Load settings dari localStorage =====
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      console.warn("Failed to load settings:", e);
    }
  }, []);

  // ===== Fetch school settings =====
  useEffect(() => {
    if (!open) return;
    const fetchSchool = async () => {
      const { data } = await supabase.from("school_settings").select("*").maybeSingle();
      setSchoolSettings(data);
    };
    fetchSchool();
  }, [open]);

  // ===== Update setting helper =====
  const updateSetting = (key: SettingsKey, value: number) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      toast.success("Pengaturan disimpan");
    } catch (e) {
      toast.error("Gagal menyimpan pengaturan");
    }
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
    toast.success("Pengaturan di-reset ke default");
  };

  // ============================================================
  // PDF GENERATOR
  // ============================================================
  const generatePDF = useMemo(() => {
    return async (): Promise<jsPDF | null> => {
      if (!travel) return null;

      const {
        marginTop, marginLeft, marginRight,
        fontSizeTitle, fontSizeBody, fontSizeTable, fontSizeSignature,
        lineHeightLog, paddingBoxLog, sectionGapLog,
      } = settings;

      // ✅ Konstanta warna
      const BLACK: [number, number, number] = [0, 0, 0];
      const WHITE: [number, number, number] = [255, 255, 255];

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [210, 330], // F4
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // ✅ Set default hitam
      doc.setTextColor(...BLACK);
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.2);

      // ===== Letterhead =====
      let yPos = marginTop;
      if (schoolSettings) {
        yPos = await addLetterheadToPDF(doc, {
          school_name: schoolSettings.school_name,
          district_name: schoolSettings.district_name,
          school_address: schoolSettings.school_address,
          school_phone: schoolSettings.school_phone,
          logo_url: schoolSettings.logo_url,
          right_logo_url: schoolSettings.right_logo_url,
          show_address: schoolSettings.show_address,
          show_phone: schoolSettings.show_phone,
        });
      }

      // ===== Header info kanan atas =====
      yPos += 5;
      doc.setFontSize(fontSizeBody);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BLACK);
      doc.text("Lembar ke", pageWidth - 70, yPos);
      doc.text(": .................................", pageWidth - 50, yPos);
      yPos += 5;
      doc.text("Kode No.", pageWidth - 70, yPos);
      doc.text(": .................................", pageWidth - 50, yPos);
      yPos += 5;
      doc.text("Nomor", pageWidth - 70, yPos);
      doc.text(`: ${travel.letter_number}`, pageWidth - 50, yPos);

      // ===== Judul =====
      yPos += 10;
      doc.setFontSize(fontSizeTitle);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BLACK);
      doc.text("SURAT PERJALANAN DINAS (SPD)", pageWidth / 2, yPos, { align: "center" });
      doc.setLineWidth(0.5);
      doc.setDrawColor(...BLACK);
      doc.line(pageWidth / 2 - 45, yPos + 1, pageWidth / 2 + 45, yPos + 1);

      // ===== Hitung hari =====
      const departureDate = new Date(travel.departure_date);
      const returnDate = new Date(travel.return_date);
      const diffTime = Math.abs(returnDate.getTime() - departureDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      // ===== Guru utama =====
      const sortedTeachers = [...(travel.official_travel_teachers || [])]
        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
      const firstTeacher = sortedTeachers[0]?.teachers;
      const teacherName = toTitleCase(firstTeacher?.profiles?.full_name) || "-";
      const teacherNip = firstTeacher?.nip || "-";
      const teacherPangkat = firstTeacher?.pangkat_golongan || "-";
      const teacherJabatan = firstTeacher?.jabatan || "-";

      // ===== Tabel utama =====
      yPos += 8;
      const tableStartY = yPos;
      const leftCol = marginLeft;
      const rightCol = pageWidth - marginRight;

      const tableData = [
        ["1.", "Pejabat Pembuat Komitmen", `Kepala ${schoolSettings?.school_name || "-"}`],
        ["2.", "Nama/NIP Pegawai yang\nmelaksanakan perjalanan dinas", `${teacherName}\nNIP. ${teacherNip}`],
        ["3.", "a. Pangkat dan Golongan\nb. Jabatan/Instansi\nc. Tingkat Biaya Perjalanan Dinas", `a. ${teacherPangkat}\nb. ${teacherJabatan}\nc. BOS`],
        ["4.", "Maksud Perjalanan Dinas", travel.purpose],
        ["5.", "Alat angkut yang dipergunakan", travel.transportation || "Kendaraan Pribadi"],
        ["6.", "a. Tempat Berangkat\nb. Tempat Tujuan", `a. ${schoolSettings?.school_name || "-"}\nb. ${travel.destination}`],
        ["7.", "a. Lamanya Perjalanan Dinas\nb. Tanggal Berangkat\nc. Tanggal harus kembali/\n    tiba di tempat baru", `a. ${diffDays} (${numberToWords(diffDays)}) hari\nb. ${format(departureDate, "dd MMMM yyyy", { locale: idLocale })}\nc. ${format(returnDate, "dd MMMM yyyy", { locale: idLocale })}`],
      ];

      autoTable(doc, {
        startY: tableStartY,
        head: [],
        body: tableData,
        styles: {
          fontSize: fontSizeTable,
          cellPadding: 3,
          lineColor: BLACK,
          lineWidth: 0.2,
          valign: "top",
          textColor: BLACK,
          fillColor: WHITE,
        },
        headStyles: { textColor: BLACK, fillColor: WHITE },
        bodyStyles: { textColor: BLACK, fillColor: WHITE },
        alternateRowStyles: { fillColor: WHITE },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 55 },
          2: { cellWidth: pageWidth - 93 },
        },
        theme: "grid",
        margin: { left: leftCol, right: marginRight },
      });

      yPos = (doc as any).lastAutoTable.finalY;

      // ===== Pengikut =====
      const followerExecutors = [
        ...sortedTeachers.slice(1).map((t: any) => ({
          name: t.teachers?.profiles?.full_name || "-",
          ket: `Guru - NIP. ${t.teachers?.nip || "-"}`,
          order_index: t.order_index ?? 0,
        })),
        ...(travel.official_travel_followers || [])
          .filter((f: any) => f.follower_type === "manual_executor")
          .map((f: any) => ({
            name: f.manual_executor?.full_name || f.manual_executor_name || "-",
            ket: `${f.manual_executor?.jabatan || "-"} - NIP. ${f.manual_executor?.nip || "-"}`,
            order_index: f.order_index ?? 0,
          })),
        ...(travel.official_travel_followers || [])
          .filter((f: any) => f.follower_type === "student")
          .map((f: any) => ({
            name: f.students?.full_name || "-",
            ket: `Siswa - NIS. ${f.students?.nis || "-"}${f.students?.class_name ? ` (${f.students.class_name})` : ""}`,
            order_index: f.order_index ?? 9999,
          })),
      ].sort((a, b) => a.order_index - b.order_index);

      const followerData = followerExecutors.map((f) => [f.name, "", f.ket]);
      if (followerData.length === 0) followerData.push(["", "", ""]);

      const followerCount = followerData.length;
      let followerFontSize = fontSizeTable;
      let followerCellPadding = 3;
      if (followerCount > 10) { followerFontSize = fontSizeTable - 2; followerCellPadding = 1.5; }
      else if (followerCount > 7) { followerFontSize = fontSizeTable - 1; followerCellPadding = 2; }
      else if (followerCount > 5) { followerFontSize = fontSizeTable - 0.5; followerCellPadding = 2.5; }

      autoTable(doc, {
        startY: yPos,
        head: [],
        body: [
          [{ content: "8.", rowSpan: followerData.length + 1 }, { content: "Pengikut", rowSpan: followerData.length + 1 }, "Nama", "Tgl lahir", "Keterangan"],
          ...followerData,
        ],
        styles: {
          fontSize: followerFontSize,
          cellPadding: followerCellPadding,
          lineColor: BLACK,
          lineWidth: 0.2,
          valign: "middle",
          textColor: BLACK,
          fillColor: WHITE,
        },
        headStyles: { textColor: BLACK, fillColor: WHITE },
        bodyStyles: { textColor: BLACK, fillColor: WHITE },
        alternateRowStyles: { fillColor: WHITE },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 55 },
          2: { cellWidth: 45 },
          3: { cellWidth: 28 },
          4: { cellWidth: pageWidth - 93 - 45 - 28 },
        },
        theme: "grid",
        margin: { left: leftCol, right: marginRight },
      });

      yPos = (doc as any).lastAutoTable.finalY;

      autoTable(doc, {
        startY: yPos,
        head: [],
        body: [
          ["9.", "Pembebanan Anggaran\na. Instansi\nb. Akun", `a. ${schoolSettings?.school_name || "-"}\nb. ..............................`],
          ["10.", "Keterangan lain-lain", travel.notes || "-"],
        ],
        styles: {
          fontSize: fontSizeTable,
          cellPadding: 2,
          lineColor: BLACK,
          lineWidth: 0.2,
          valign: "top",
          textColor: BLACK,
          fillColor: WHITE,
        },
        headStyles: { textColor: BLACK, fillColor: WHITE },
        bodyStyles: { textColor: BLACK, fillColor: WHITE },
        alternateRowStyles: { fillColor: WHITE },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 55 },
          2: { cellWidth: pageWidth - 93 },
        },
        theme: "grid",
        margin: { left: leftCol, right: marginRight },
      });

      yPos = (doc as any).lastAutoTable.finalY + 8;

      // ============================================================
      // ✅ BLOK TANDA TANGAN "PEJABAT PEMBUAT KOMITMEN"
      //    - Label agak naik (dipisah dari body di atas)
      //    - Ruang tanda tangan diperbesar (dari 15mm → 25mm)
      // ============================================================
      const signatureLabelY = yPos;
      doc.setFontSize(fontSizeSignature);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BLACK);

      doc.text(`Dikeluarkan di : Ciamis`, pageWidth - 80, signatureLabelY);
      doc.text(`Tanggal : ${format(new Date(travel.letter_date), "dd MMMM yyyy", { locale: idLocale })}`, pageWidth - 80, signatureLabelY + 4);

      // ✅ Label "Pejabat Pembuat Komitmen" (naik = tepat di atas ruang TTD)
      doc.text("Pejabat Pembuat Komitmen", pageWidth - 80, signatureLabelY + 9);

      // ✅ RUANG TANDA TANGAN DIPERBESAR (25mm)
      const signSpaceY = signatureLabelY + 9 + 25;

      doc.setFont("helvetica", "bold");
      doc.text(toTitleCase(schoolSettings?.headmaster_name) || "", pageWidth - 80, signSpaceY);

      doc.setFont("helvetica", "normal");
      doc.text(`NIP. ${schoolSettings?.headmaster_nip || ""}`, pageWidth - 80, signSpaceY + 4);

      // ============================================================
      // PAGE 2
      // ============================================================
      doc.addPage();
      yPos = marginTop;

      const col1X = marginLeft;
      const col2X = pageWidth / 2;
      const colWidth = (pageWidth - marginLeft - marginRight) / 2;
      const tableWidth = pageWidth - marginLeft - marginRight;
      const numColWidth = 12;

      doc.setLineWidth(0.2);
      doc.setDrawColor(...BLACK);
      doc.setTextColor(...BLACK);
      doc.setFontSize(fontSizeBody);

      // Section I
      const section1Height = 52;
      doc.rect(col1X, yPos, colWidth, section1Height);
      doc.rect(col2X, yPos, colWidth, section1Height);

      const s1LabelX = col2X + 5;
      const s1ValueX = col2X + 40;

      doc.text("I.", col2X + 3, yPos + 6);
      doc.text("Berangkat Dari", s1LabelX + 5, yPos + 6);
      doc.text("(tempat kedudukan)", s1LabelX + 5, yPos + 10);
      doc.text("Ke", s1LabelX + 5, yPos + 15);
      doc.text("Pada Tanggal", s1LabelX + 5, yPos + 20);
      doc.text(`Kepala ${schoolSettings?.school_name || ""}`, s1LabelX + 5, yPos + 26);

      doc.text(`: ${schoolSettings?.school_name || ""}`, s1ValueX, yPos + 6);
      doc.text(`: ${travel.destination}`, s1ValueX, yPos + 15);
      doc.text(`: ${format(departureDate, "dd MMMM yyyy", { locale: idLocale })}`, s1ValueX, yPos + 20);

      // ✅ TTD Section I — label jabatan naik, ruang TTD lebih lega
      doc.setFontSize(fontSizeSignature);
      doc.setFont("helvetica", "bold");
      doc.text(toTitleCase(schoolSettings?.headmaster_name) || "", s1LabelX + 5, yPos + 42);
      doc.setFont("helvetica", "normal");
      doc.text(`NIP. ${schoolSettings?.headmaster_nip || ""}`, s1LabelX + 5, yPos + 47);

      yPos += section1Height;

      // Sections II - VI (log table)
      const rowHeight = lineHeightLog;
      const section6Height = rowHeight + 4;
      const totalTableHeight = (4 * rowHeight) + section6Height;

      doc.rect(col1X, yPos, tableWidth, totalTableHeight);
      doc.line(col2X, yPos, col2X, yPos + totalTableHeight);

      let lineY = yPos;
      for (let i = 0; i < 4; i++) {
        lineY += rowHeight;
        doc.line(col1X, lineY, col1X + tableWidth, lineY);
      }

      const leftLabelX = col1X + numColWidth + 2;
      const leftValueX = col1X + 35;
      const rightLabelX = col2X + 3;
      const rightValueX = col2X + 35;

      doc.setFontSize(fontSizeTable);

      let rowY = yPos;
      doc.text("II.", col1X + 3, rowY + 5);
      doc.text("Tiba di", leftLabelX, rowY + 5);
      doc.text("Pada Tanggal", leftLabelX, rowY + 9);
      doc.text(`Kepala`, leftLabelX, rowY + 13);
      doc.text(`: ${travel.destination}`, leftValueX, rowY + 5);
      doc.text(`: ${format(departureDate, "dd MMMM yyyy", { locale: idLocale })}`, leftValueX, rowY + 9);
      doc.text("(..............................................)", leftLabelX, rowY + 32);
      doc.text("NIP.", leftLabelX, rowY + 37);

      doc.text("Berangkat Dari", rightLabelX, rowY + 5);
      doc.text("Ke", rightLabelX, rowY + 9);
      doc.text("Pada Tanggal", rightLabelX, rowY + 13);
      doc.text("Kepala", rightLabelX, rowY + 17);
      doc.text(`: ${travel.destination}`, rightValueX, rowY + 5);
      doc.text(`: ${schoolSettings?.school_name || ""}`, rightValueX, rowY + 9);
      doc.text(`: ${format(departureDate, "dd MMMM yyyy", { locale: idLocale })}`, rightValueX, rowY + 13);
      doc.text("(..............................................)", rightLabelX, rowY + 32);
      doc.text("NIP.", rightLabelX, rowY + 37);

      rowY += rowHeight;

      const emptyRows = ["III", "IV", "V"];
      emptyRows.forEach((num) => {
        doc.text(`${num}.`, col1X + 3, rowY + 5);
        doc.text("Tiba di", leftLabelX, rowY + 5);
        doc.text("Pada Tanggal", leftLabelX, rowY + 9);
        doc.text("Kepala", leftLabelX, rowY + 13);
        doc.text(": .................................", leftValueX, rowY + 5);
        doc.text(": .................................", leftValueX, rowY + 9);
        doc.text(": .................................", leftValueX, rowY + 13);
        doc.text("(..............................................)", leftLabelX, rowY + 32);
        doc.text("NIP.", leftLabelX, rowY + 37);

        doc.text("Berangkat Dari", rightLabelX, rowY + 5);
        doc.text("Ke", rightLabelX, rowY + 9);
        doc.text("Pada Tanggal", rightLabelX, rowY + 13);
        doc.text("Kepala", rightLabelX, rowY + 17);
        doc.text(": .................................", rightValueX, rowY + 5);
        doc.text(": .................................", rightValueX, rowY + 9);
        doc.text(": .................................", rightValueX, rowY + 13);
        doc.text("(..............................................)", rightLabelX, rowY + 32);
        doc.text("NIP.", rightLabelX, rowY + 37);

        rowY += rowHeight;
      });

      // Section VI — dengan perbaikan TTD
      doc.text("VI.", col1X + 3, rowY + 6);
      doc.text("Tiba di", leftLabelX, rowY + 6);
      doc.text("Pada Tanggal", leftLabelX, rowY + 11);

      // ✅ Label "Kepala Sekolah" naik
      doc.text(`Kepala ${schoolSettings?.school_name || ""}`, leftLabelX, rowY + 16);

      doc.text(`: ${schoolSettings?.school_name || ""}`, leftValueX, rowY + 6);
      doc.text(`: ${format(returnDate, "dd MMMM yyyy", { locale: idLocale })}`, leftValueX, rowY + 11);

      // ✅ Blok TTD: nama turun agar ada ruang tanda tangan
      doc.setFontSize(fontSizeSignature);
      doc.setFont("helvetica", "bold");
      doc.text(toTitleCase(schoolSettings?.headmaster_name) || "", leftLabelX, rowY + 32);

      doc.setFont("helvetica", "normal");
      doc.text(`NIP. ${schoolSettings?.headmaster_nip || ""}`, leftLabelX, rowY + 37);

      // Disclaimer kanan
      const disclaimer = doc.splitTextToSize(
        "Telah diperiksa, dengan keterangan bahwa perjalanan tersebut diatas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan dalam kurun waktu yang sesingkat-singkatnya",
        colWidth - 10
      );
      doc.text(disclaimer, rightLabelX, rowY + 8);

      yPos = rowY + section6Height;

      // Section VII
      doc.setFontSize(fontSizeBody);
      doc.rect(col1X, yPos, tableWidth, 12);
      doc.text("VII. Catatan Lain-lain", col1X + 3, yPos + 8);

      yPos += 12;

      // Section VIII
      doc.rect(col1X, yPos, tableWidth, 24);
      doc.setFontSize(fontSizeTable - 1);
      doc.text("VIII. PERHATIAN:", col1X + 3, yPos + 6);
      const perhatian = doc.splitTextToSize(
        "PPK yang menerbitkan SPD, pegawai yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba, serta bendahara pengeluaran bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara apabila negara menderita rugi akibat kesalahan, kelalaian, dan kealpaannya.",
        tableWidth - 10
      );
      doc.text(perhatian, col1X + 3, yPos + 11);

      yPos += 24 + 12;

      // ✅ Blok TTD akhir Page 2 — ruang TTD diperbesar
      doc.setFontSize(fontSizeSignature);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BLACK);
      doc.text("Pejabat Pembuat Komitmen", pageWidth - 60, yPos, { align: "center" });

      // ✅ Ruang TTD 25mm (dari sebelumnya 15mm)
      yPos += 25;

      doc.setFont("helvetica", "bold");
      doc.text(toTitleCase(schoolSettings?.headmaster_name) || "", pageWidth - 60, yPos, { align: "center" });

      doc.setFont("helvetica", "normal");
      yPos += 4;
      doc.text(`NIP. ${schoolSettings?.headmaster_nip || ""}`, pageWidth - 60, yPos, { align: "center" });

      // ============================================================
      // LPT PAGES
      // ============================================================
      const lptExecutors = [
        ...sortedTeachers.map((tt: any) => ({
          name: tt.teachers?.profiles?.full_name || "-",
          nip: tt.teachers?.nip || "-",
          order_index: tt.order_index ?? 0,
        })),
        ...(travel.official_travel_followers || [])
          .filter((f: any) => f.follower_type === "manual_executor")
          .map((f: any) => ({
            name: f.manual_executor?.full_name || f.manual_executor_name || "-",
            nip: f.manual_executor?.nip || f.manual_executor_nip || "-",
            order_index: f.order_index ?? 0,
          })),
      ].sort((a, b) => a.order_index - b.order_index);

      const generateLPTPage = (name: string, nip: string) => {
        const formattedName = toTitleCase(name);
        doc.addPage();
        let lptYPos = 30;

        doc.setFontSize(fontSizeTitle + 2);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BLACK);
        doc.text("LAPORAN PELAKSANAAN TUGAS", pageWidth / 2, lptYPos, { align: "center" });
        lptYPos += 7;
        doc.text("(LPT)", pageWidth / 2, lptYPos, { align: "center" });

        lptYPos += 20;
        doc.setFontSize(fontSizeBody + 1);
        doc.setFont("helvetica", "normal");

        const labelX = marginLeft;
        const colonX = 60;
        const valueX = 65;
        const lineHeight = settings.lineHeightLPT;

        doc.text("1. Nama", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.setFont("helvetica", "bold");
        doc.text(formattedName, valueX, lptYPos);
        doc.setFont("helvetica", "normal");

        lptYPos += lineHeight;
        doc.text("2. NIP", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.text(nip, valueX, lptYPos);

        lptYPos += lineHeight;
        doc.text("3. Dasar Surat Tugas Nomor", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.text(travel.letter_number, valueX, lptYPos);

        lptYPos += lineHeight;
        doc.text("4. Tujuan", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        const purposeText = doc.splitTextToSize(`Untuk ${travel.purpose}`, pageWidth - valueX - marginRight);
        doc.text(purposeText, valueX, lptYPos);
        lptYPos += purposeText.length > 1 ? lineHeight * purposeText.length : lineHeight;

        doc.text("5. Waktu", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.text("08.30 s.d selesai", valueX, lptYPos);

        lptYPos += lineHeight;
        doc.text("    a. Berangkat", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.text(format(departureDate, "dd MMMM yyyy", { locale: idLocale }), valueX, lptYPos);

        lptYPos += lineHeight;
        doc.text("    b. Kembali", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        doc.text(format(returnDate, "dd MMMM yyyy", { locale: idLocale }), valueX, lptYPos);

        lptYPos += lineHeight + 2;

        doc.text("6. Sasaran", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        for (let i = 0; i < 3; i++) {
          doc.text("..........................................................................................................", valueX, lptYPos + (i * 6));
        }

        lptYPos += 22;

        doc.text("7.Hasil yang dicapai", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        for (let i = 0; i < 6; i++) {
          doc.text("..........................................................................................................", valueX, lptYPos + (i * 6));
        }

        lptYPos += 40;

        doc.text("8. Saran-saran", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        for (let i = 0; i < 3; i++) {
          doc.text("..........................................................................................................", valueX, lptYPos + (i * 6));
        }

        lptYPos += 35;

        const leftSignX = marginLeft;
        const rightSignX = pageWidth / 2 + 20;

        doc.text("Mengetahui,", leftSignX, lptYPos);
        lptYPos += 5;
        doc.text(`Kepala ${schoolSettings?.school_name || ""}`, leftSignX, lptYPos);

        const lptSignDate = `Ciamis, ${format(returnDate, "dd MMMM yyyy", { locale: idLocale })}`;
        doc.text(lptSignDate, rightSignX, lptYPos - 5);
        doc.text("Pelapor,", rightSignX, lptYPos);

        lptYPos += 30;

        doc.setFont("helvetica", "bold");
        doc.text(schoolSettings?.headmaster_name || "", leftSignX, lptYPos);
        doc.text(name, rightSignX, lptYPos);
        doc.setFont("helvetica", "normal");
        lptYPos += 5;
        doc.text(`NIP. ${schoolSettings?.headmaster_nip || ""}`, leftSignX, lptYPos);
        doc.text(`NIP. ${nip}`, rightSignX, lptYPos);
      };

      for (let i = 0; i < lptExecutors.length; i++) {
        generateLPTPage(lptExecutors[i].name, lptExecutors[i].nip);
      }

      return doc;
    };
  }, [travel, settings, schoolSettings]);

  // ============================================================
  // Auto-generate PDF preview
  // ============================================================
  useEffect(() => {
    if (!open || !travel || !schoolSettings) return;

    const generate = async () => {
      setIsGenerating(true);
      try {
        const doc = await generatePDF();
        if (!doc) return;

        const blob = doc.output("blob");
        const url = URL.createObjectURL(blob);

        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (err) {
        console.error("Failed to generate preview:", err);
        toast.error("Gagal membuat preview PDF");
      } finally {
        setIsGenerating(false);
      }
    };

    const timer = setTimeout(generate, 300);
    return () => clearTimeout(timer);
  }, [open, travel, schoolSettings, settings, generatePDF]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // ============================================================
  // Download
  // ============================================================
  const handleDownload = async () => {
    try {
      const doc = await generatePDF();
      if (!doc) return;
      doc.save(`SPD-${travel?.letter_number || "draft"}.pdf`);
      toast.success("PDF berhasil diunduh");
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengunduh PDF");
    }
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] p-0 overflow-hidden">
        <div className="flex flex-col h-[95vh]">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Preview SPD
                </DialogTitle>
                <DialogDescription className="text-xs mt-1">
                  Sesuaikan pengaturan PDF dan lihat hasilnya secara real-time
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSidebarOpen((v) => !v)}
                >
                  {sidebarOpen ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                  {sidebarOpen ? "Sembunyikan Pengaturan" : "Tampilkan Pengaturan"}
                </Button>
                <Button size="sm" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-1" />
                  Download PDF
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: PDF preview */}
            <div className="flex-1 bg-muted/30 overflow-hidden relative">
              {isGenerating && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-background/90 px-4 py-2 rounded-md text-sm shadow">
                  Menghasilkan PDF...
                </div>
              )}
              {pdfUrl ? (
                <iframe
                  ref={iframeRef}
                  src={pdfUrl}
                  className="w-full h-full border-0"
                  title="Preview SPD"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Memuat preview...
                </div>
              )}
            </div>

            {/* Right: Settings sidebar */}
            {sidebarOpen && (
              <div className="w-[340px] border-l bg-background flex flex-col">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    <Label className="font-semibold">Pengaturan PDF</Label>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={saveSettings}>
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Simpan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={resetSettings}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Reset
                    </Button>
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    {/* Tab switcher */}
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                      <TabsList className="w-full grid grid-cols-3">
                        <TabsTrigger value="spd">SPD</TabsTrigger>
                        <TabsTrigger value="log">Log</TabsTrigger>
                        <TabsTrigger value="lpt">LPT</TabsTrigger>
                      </TabsList>
                    </Tabs>

                    {/* ===== FONT SIZE ===== */}
                    <div className="space-y-3 border-t pt-3">
                      <Label className="text-xs font-semibold flex items-center gap-2">
                        <Type className="h-3.5 w-3.5" />
                        Ukuran Font
                      </Label>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Judul SPD</Label>
                          <span className="text-xs text-muted-foreground">{settings.fontSizeTitle}pt</span>
                        </div>
                        <Slider
                          value={[settings.fontSizeTitle]}
                          onValueChange={([v]) => updateSetting("fontSizeTitle", v)}
                          min={8}
                          max={20}
                          step={1}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Body Utama</Label>
                          <span className="text-xs text-muted-foreground">{settings.fontSizeBody}pt</span>
                        </div>
                        <Slider
                          value={[settings.fontSizeBody]}
                          onValueChange={([v]) => updateSetting("fontSizeBody", v)}
                          min={7}
                          max={14}
                          step={1}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Isi Tabel</Label>
                          <span className="text-xs text-muted-foreground">{settings.fontSizeTable}pt</span>
                        </div>
                        <Slider
                          value={[settings.fontSizeTable]}
                          onValueChange={([v]) => updateSetting("fontSizeTable", v)}
                          min={6}
                          max={12}
                          step={1}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Blok Tanda Tangan</Label>
                          <span className="text-xs text-muted-foreground">{settings.fontSizeSignature}pt</span>
                        </div>
                        <Slider
                          value={[settings.fontSizeSignature]}
                          onValueChange={([v]) => updateSetting("fontSizeSignature", v)}
                          min={7}
                          max={14}
                          step={1}
                        />
                      </div>
                    </div>

                    {/* ===== MARGIN ===== */}
                    <div className="space-y-3 border-t pt-3">
                      <Label className="text-xs font-semibold">Margin</Label>

                      {(["marginTop", "marginLeft", "marginRight"] as SettingsKey[]).map((key) => (
                        <div className="space-y-2" key={key}>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs capitalize">
                              {key === "marginTop" ? "Atas" : key === "marginLeft" ? "Kiri" : "Kanan"}
                            </Label>
                            <span className="text-xs text-muted-foreground">{settings[key]} mm</span>
                          </div>
                          <Slider
                            value={[settings[key] as number]}
                            onValueChange={([v]) => updateSetting(key, v)}
                            min={5}
                            max={40}
                            step={1}
                          />
                        </div>
                      ))}
                    </div>

                    {/* ===== LOG LAYOUT ===== */}
                    {activeTab === "log" && (
                      <div className="space-y-3 border-t pt-3">
                        <Label className="text-xs font-semibold">Layout Log Perjalanan</Label>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Tinggi Baris</Label>
                            <span className="text-xs text-muted-foreground">{settings.lineHeightLog} mm</span>
                          </div>
                          <Slider
                            value={[settings.lineHeightLog]}
                            onValueChange={([v]) => updateSetting("lineHeightLog", v)}
                            min={20}
                            max={60}
                            step={1}
                          />
                        </div>
                      </div>
                    )}

                    {/* ===== LPT LAYOUT ===== */}
                    {activeTab === "lpt" && (
                      <div className="space-y-3 border-t pt-3">
                        <Label className="text-xs font-semibold">Layout LPT</Label>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Jarak Baris</Label>
                            <span className="text-xs text-muted-foreground">{settings.lineHeightLPT} mm</span>
                          </div>
                          <Slider
                            value={[settings.lineHeightLPT]}
                            onValueChange={([v]) => updateSetting("lineHeightLPT", v)}
                            min={5}
                            max={15}
                            step={1}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SPDPreviewDialog;
