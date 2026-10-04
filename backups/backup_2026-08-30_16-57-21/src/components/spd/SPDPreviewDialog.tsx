import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SPDPdfSettingsPanel, SPDPdfSettingsType, DEFAULT_SPD_SETTINGS, useSPDPdfSettings } from "./SPDPdfSettings";
import { FileDown, Settings2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addLetterheadToPDF } from "@/lib/pdfLetterhead";
import { toTitleCase } from "@/lib/utils";
import { toast } from "sonner";

// Helper function to convert number to Indonesian words
const numberToWords = (num: number): string => {
  const words = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh',
    'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas', 'dua puluh',
    'dua puluh satu', 'dua puluh dua', 'dua puluh tiga', 'dua puluh empat', 'dua puluh lima', 'dua puluh enam', 'dua puluh tujuh', 'dua puluh delapan', 'dua puluh sembilan', 'tiga puluh'];
  return words[num] || num.toString();
};

interface SPDPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  travel: any;
}

export function SPDPreviewDialog({ open, onOpenChange, travel }: SPDPreviewDialogProps) {
  // Load saved settings from database
  const { settings: savedSettings, isLoading: isLoadingSettings, saveSettings, isSaving } = useSPDPdfSettings();
  
  const [settings, setSettings] = useState<SPDPdfSettingsType>(DEFAULT_SPD_SETTINGS);
  const [showSettings, setShowSettings] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState<any>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [settingsInitialized, setSettingsInitialized] = useState(false);

  // Initialize settings from database when loaded
  useEffect(() => {
    if (!isLoadingSettings && !settingsInitialized) {
      setSettings(savedSettings);
      setSettingsInitialized(true);
    }
  }, [savedSettings, isLoadingSettings, settingsInitialized]);

  // Fetch school settings once when dialog opens
  useEffect(() => {
    if (open && !schoolSettings) {
      supabase
        .from("school_settings")
        .select("*")
        .single()
        .then(({ data }) => {
          setSchoolSettings(data);
        });
    }
  }, [open, schoolSettings]);

  // Generate PDF with current settings
  const generatePDF = useCallback(async (pdfSettings: SPDPdfSettingsType, forDownload = false) => {
    if (!travel || !schoolSettings) return null;

    const { spd, logPerjalanan, lpt } = pdfSettings;

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [210, 330] // F4 paper size
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // === PAGE 1 (SPD) ===
      let yPos = spd.marginTop;
      
      if (spd.showLetterhead && schoolSettings) {
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

      // Header info (right side)
      yPos += spd.lineSpacing;
      doc.setFontSize(spd.headerFontSize);
      doc.setFont("helvetica", "normal");
      doc.text("Lembar ke", pageWidth - 70, yPos);
      doc.text(": .................................", pageWidth - 50, yPos);
      yPos += spd.lineSpacing;
      doc.text("Kode No.", pageWidth - 70, yPos);
      doc.text(": .................................", pageWidth - 50, yPos);
      yPos += spd.lineSpacing;
      doc.text("Nomor", pageWidth - 70, yPos);
      doc.text(`: ${travel.letter_number}`, pageWidth - 50, yPos);

      // Title
      yPos += spd.paragraphSpacing + 2;
      doc.setFontSize(spd.titleFontSize);
      doc.setFont("helvetica", "bold");
      doc.text("SURAT PERJALANAN DINAS (SPD)", pageWidth / 2, yPos, { align: "center" });
      doc.setLineWidth(0.5);
      doc.line(pageWidth / 2 - 45, yPos + 1, pageWidth / 2 + 45, yPos + 1);

      // Calculate days
      const departureDate = new Date(travel.departure_date);
      const returnDate = new Date(travel.return_date);
      const diffTime = Math.abs(returnDate.getTime() - departureDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      // Main table data
      yPos += spd.paragraphSpacing;
      const tableStartY = yPos;
      const leftCol = spd.marginLeft;

      // Get first teacher info
      const firstTeacher = travel.official_travel_teachers?.[0]?.teachers;
      const teacherName = toTitleCase(firstTeacher?.profiles?.full_name) || "-";
      const teacherNip = firstTeacher?.nip || "-";
      const teacherPangkat = firstTeacher?.pangkat_golongan || "-";
      const teacherJabatan = firstTeacher?.jabatan || "-";

      // Table rows data with proper labels
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
          fontSize: spd.tableFontSize, 
          cellPadding: spd.tableCellPadding, 
          lineColor: [0, 0, 0], 
          lineWidth: spd.tableLineWidth,
          valign: 'top'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 55 },
          2: { cellWidth: pageWidth - 93 },
        },
        theme: 'grid',
        margin: { left: leftCol, right: spd.marginRight },
      });

      yPos = (doc as any).lastAutoTable.finalY;

      // Row 8: Pengikut with nested table
      const allTeachers = travel.official_travel_teachers || [];
      const teacherFollowerData = allTeachers.slice(1).map((t: any) => [
        toTitleCase(t.teachers?.profiles?.full_name) || "-",
        "",
        `Guru - NIP. ${t.teachers?.nip || "-"}`
      ]);
      
      const manualExecutorFollowers = travel.official_travel_followers?.filter((f: any) => f.follower_type === 'manual_executor') || [];
      const manualExecutorFollowerData = manualExecutorFollowers.map((f: any) => [
        toTitleCase(f.manual_executor?.full_name || f.manual_executor_name) || "-",
        "",
        `${f.manual_executor?.jabatan || f.manual_executor_jabatan || "-"} - NIP. ${f.manual_executor?.nip || f.manual_executor_nip || "-"}`
      ]);
      
      const studentFollowers = travel.official_travel_followers?.filter((f: any) => f.follower_type === 'student') || [];
      const studentFollowerData = studentFollowers.map((f: any) => [
        toTitleCase(f.students?.full_name) || "-",
        "",
        `Siswa - NIS. ${f.students?.nis || "-"}${f.students?.class_name ? ` (${f.students.class_name})` : ""}`
      ]);
      
      const followerData = [...teacherFollowerData, ...manualExecutorFollowerData, ...studentFollowerData];
      
      if (followerData.length === 0) {
        followerData.push(["", "", ""]);
      }
      
      const followerCount = followerData.length;
      let followerFontSize = spd.tableFontSize;
      let followerCellPadding = spd.tableCellPadding;
      
      if (followerCount > 10) {
        followerFontSize = Math.max(6, spd.tableFontSize - 3);
        followerCellPadding = Math.max(1.5, spd.tableCellPadding - 1.5);
      } else if (followerCount > 7) {
        followerFontSize = Math.max(7, spd.tableFontSize - 2);
        followerCellPadding = Math.max(2, spd.tableCellPadding - 1);
      } else if (followerCount > 5) {
        followerFontSize = Math.max(8, spd.tableFontSize - 1);
        followerCellPadding = Math.max(2.5, spd.tableCellPadding - 0.5);
      }
      
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
          lineColor: [0, 0, 0], 
          lineWidth: spd.tableLineWidth,
          valign: 'middle'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 55 },
          2: { cellWidth: 45 },
          3: { cellWidth: 28 },
          4: { cellWidth: pageWidth - 93 - 45 - 28 },
        },
        theme: 'grid',
        margin: { left: leftCol, right: spd.marginRight },
      });

      yPos = (doc as any).lastAutoTable.finalY;

      // Row 9 & 10
      autoTable(doc, {
        startY: yPos,
        head: [],
        body: [
          ["9.", "Pembebanan Anggaran\na. Instansi\nb. Akun", `a. ${schoolSettings?.school_name || "-"}\nb. ..............................`],
          ["10.", "Keterangan lain-lain", travel.notes || "-"],
        ],
        styles: { 
          fontSize: spd.tableFontSize, 
          cellPadding: Math.max(2, spd.tableCellPadding - 1), 
          lineColor: [0, 0, 0], 
          lineWidth: spd.tableLineWidth,
          valign: 'top'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 55 },
          2: { cellWidth: pageWidth - 93 },
        },
        theme: 'grid',
        margin: { left: leftCol, right: spd.marginRight },
      });

      yPos = (doc as any).lastAutoTable.finalY + spd.paragraphSpacing;

      // Signature section page 1
      doc.setFontSize(spd.bodyFontSize);
      doc.setFont("helvetica", "normal");
      doc.text(`Dikeluarkan di : Ciamis`, pageWidth - 80, yPos);
      yPos += 4;
      doc.text(`Tanggal : ${format(new Date(travel.letter_date), "dd MMMM yyyy", { locale: idLocale })}`, pageWidth - 80, yPos);
      yPos += spd.lineSpacing;
      doc.text("Pejabat Pembuat Komitmen", pageWidth - 80, yPos);
      yPos += spd.signatureSpacing;
      doc.setFont("helvetica", "bold");
      doc.text(schoolSettings?.headmaster_name || "", pageWidth - 80, yPos);
      doc.setFont("helvetica", "normal");
      yPos += 4;
      doc.text(`NIP. ${schoolSettings?.headmaster_nip || ""}`, pageWidth - 80, yPos);

      // === PAGE 2 (Log Perjalanan) ===
      doc.addPage();
      yPos = logPerjalanan.marginTop;

      const col1X = logPerjalanan.marginLeft;
      const col2X = pageWidth / 2;
      const colWidth = (pageWidth - logPerjalanan.marginLeft - logPerjalanan.marginRight) / 2;
      const tableWidth = pageWidth - logPerjalanan.marginLeft - logPerjalanan.marginRight;
      const numColWidth = 12;
      
      doc.setLineWidth(logPerjalanan.tableLineWidth);
      doc.setFontSize(logPerjalanan.sectionFontSize);

      // Section I
      const section1Height = 52;
      doc.rect(col1X, yPos, colWidth, section1Height);
      doc.rect(col2X, yPos, colWidth, section1Height);
      
      const s1LabelX = col2X + 5;
      const s1ValueX = col2X + 40;
      
      doc.setFontSize(logPerjalanan.labelFontSize);
      doc.text("I.", col2X + 3, yPos + 6);
      doc.text("Berangkat Dari", s1LabelX + 5, yPos + 6);
      doc.text("(tempat kedudukan)", s1LabelX + 5, yPos + 10);
      doc.text("Ke", s1LabelX + 5, yPos + 15);
      doc.text("Pada Tanggal", s1LabelX + 5, yPos + 20);
      doc.text(`Kepala ${schoolSettings?.school_name || ""}`, s1LabelX + 5, yPos + 25);
      
      doc.setFontSize(logPerjalanan.valueFontSize);
      doc.text(`: ${schoolSettings?.school_name || ""}`, s1ValueX, yPos + 6);
      doc.text(`: ${travel.destination}`, s1ValueX, yPos + 15);
      doc.text(`: ${format(departureDate, "dd MMMM yyyy", { locale: idLocale })}`, s1ValueX, yPos + 20);
      
      doc.setFont("helvetica", "bold");
      doc.text(schoolSettings?.headmaster_name || "", s1LabelX + 5, yPos + 42);
      doc.setFont("helvetica", "normal");
      doc.text(`NIP. ${schoolSettings?.headmaster_nip || ""}`, s1LabelX + 5, yPos + 47);

      yPos += section1Height;

      // Sections II-VI
      const rowHeight = logPerjalanan.rowHeight;
      const section6Height = 46;
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
      
      doc.setFontSize(logPerjalanan.labelFontSize);
      
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

      // Section VI
      doc.text("VI.", col1X + 3, rowY + 6);
      doc.text("Tiba di", leftLabelX, rowY + 6);
      doc.text("Pada Tanggal", leftLabelX, rowY + 11);
      doc.text(`Kepala ${schoolSettings?.school_name || ""}`, leftLabelX, rowY + 16);
      doc.text(`: ${schoolSettings?.school_name || ""}`, leftValueX, rowY + 6);
      doc.text(`: ${format(returnDate, "dd MMMM yyyy", { locale: idLocale })}`, leftValueX, rowY + 11);
      
      doc.setFont("helvetica", "bold");
      doc.text(toTitleCase(schoolSettings?.headmaster_name) || "", leftLabelX, rowY + 32);
      doc.setFont("helvetica", "normal");
      doc.text(`NIP. ${schoolSettings?.headmaster_nip || ""}`, leftLabelX, rowY + 37);

      const disclaimer = doc.splitTextToSize("Telah diperiksa, dengan keterangan bahwa perjalanan tersebut diatas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan dalam kurun waktu yang sesingkat-singkatnya", colWidth - 10);
      doc.text(disclaimer, rightLabelX, rowY + 8);

      yPos = rowY + section6Height;

      // Section VII
      doc.setFontSize(logPerjalanan.sectionFontSize);
      doc.rect(col1X, yPos, tableWidth, 12);
      doc.text("VII. Catatan Lain-lain", col1X + 3, yPos + 8);

      yPos += 12;

      // Section VIII
      doc.rect(col1X, yPos, tableWidth, 24);
      doc.setFontSize(7);
      doc.text("VIII. PERHATIAN:", col1X + 3, yPos + 6);
      const perhatian = doc.splitTextToSize("PPK yang menerbitkan SPD, pegawai yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba, serta bendahara pengeluaran bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara apabila negara menderita rugi akibat kesalahan, kelalaian, dan kealpaannya.", tableWidth - 10);
      doc.text(perhatian, col1X + 3, yPos + 11);

      yPos += 24 + 12;

      // Final signature
      doc.setFontSize(logPerjalanan.signatureFontSize);
      doc.text("Pejabat Pembuat Komitmen", pageWidth - 60, yPos, { align: "center" });
      yPos += logPerjalanan.signatureSpacing - 5;
      doc.setFont("helvetica", "bold");
      doc.text(toTitleCase(schoolSettings?.headmaster_name) || "", pageWidth - 60, yPos, { align: "center" });
      doc.setFont("helvetica", "normal");
      yPos += 4;
      doc.text(`NIP. ${schoolSettings?.headmaster_nip || ""}`, pageWidth - 60, yPos, { align: "center" });

      // === LPT PAGES ===
      const allTeachersForLPT = travel.official_travel_teachers || [];
      const manualExecutorsForLPT = travel.official_travel_followers?.filter((f: any) => f.follower_type === 'manual_executor') || [];
      
      const generateLPTPage = (name: string, nip: string) => {
        const formattedName = toTitleCase(name);
        doc.addPage();
        let lptYPos = lpt.marginTop;

        doc.setFontSize(lpt.titleFontSize);
        doc.setFont("helvetica", "bold");
        doc.text("LAPORAN PELAKSANAAN TUGAS", pageWidth / 2, lptYPos, { align: "center" });
        lptYPos += 7;
        doc.text("(LPT)", pageWidth / 2, lptYPos, { align: "center" });
        
        lptYPos += 20;
        doc.setFontSize(lpt.bodyFontSize);
        doc.setFont("helvetica", "normal");
        
        const labelX = lpt.marginLeft;
        const colonX = lpt.labelColumnWidth;
        const valueX = lpt.labelColumnWidth + 5;
        const lineHeight = lpt.lineSpacing;

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
        const purposeText = doc.splitTextToSize(`Untuk ${travel.purpose}`, pageWidth - valueX - lpt.marginRight);
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

        // Generate dotted line based on settings
        const dottedLine = ".".repeat(Math.floor(lpt.dottedLineLength));

        doc.text("6. Sasaran", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        for (let i = 0; i < 3; i++) {
          doc.text(dottedLine, valueX, lptYPos + (i * 6));
        }
        
        lptYPos += lpt.sectionSpacing;

        doc.text("7.Hasil yang dicapai", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        for (let i = 0; i < lpt.dottedLineRows; i++) {
          doc.text(dottedLine, valueX, lptYPos + (i * 6));
        }
        
        lptYPos += lpt.sectionSpacing + (lpt.dottedLineRows * 4);

        doc.text("8. Saran-saran", labelX, lptYPos);
        doc.text(":", colonX, lptYPos);
        for (let i = 0; i < 3; i++) {
          doc.text(dottedLine, valueX, lptYPos + (i * 6));
        }
        
        lptYPos += 35;

        const leftSignX = lpt.marginLeft;
        const rightSignX = pageWidth / 2 + 20;
        
        doc.text("Mengetahui,", leftSignX, lptYPos);
        lptYPos += 5;
        doc.text(`Kepala ${schoolSettings?.school_name || ""}`, leftSignX, lptYPos);
        
        const lptSignDate = `Ciamis, ${format(returnDate, "dd MMMM yyyy", { locale: idLocale })}`;
        doc.text(lptSignDate, rightSignX, lptYPos - 5);
        doc.text("Pelapor,", rightSignX, lptYPos);
        
        lptYPos += lpt.signatureSpacing + 10;
        
        doc.setFont("helvetica", "bold");
        doc.text(schoolSettings?.headmaster_name || "", leftSignX, lptYPos);
        doc.text(name, rightSignX, lptYPos);
        doc.setFont("helvetica", "normal");
        lptYPos += 5;
        doc.text(`NIP. ${schoolSettings?.headmaster_nip || ""}`, leftSignX, lptYPos);
        doc.text(`NIP. ${nip}`, rightSignX, lptYPos);
      };

      for (let tIdx = 0; tIdx < allTeachersForLPT.length; tIdx++) {
        const currentTeacher = allTeachersForLPT[tIdx]?.teachers;
        const currentTeacherName = currentTeacher?.profiles?.full_name || "-";
        const currentTeacherNip = currentTeacher?.nip || "-";
        generateLPTPage(currentTeacherName, currentTeacherNip);
      }

      for (let mIdx = 0; mIdx < manualExecutorsForLPT.length; mIdx++) {
        const executor = manualExecutorsForLPT[mIdx];
        const executorName = executor.manual_executor?.full_name || executor.manual_executor_name || "-";
        const executorNip = executor.manual_executor?.nip || executor.manual_executor_nip || "-";
        generateLPTPage(executorName, executorNip);
      }

      if (forDownload) {
        doc.save(`SPD-${travel.letter_number}.pdf`);
        return null;
      }

      const blob = doc.output('blob');
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error("Error generating PDF:", error);
      return null;
    }
  }, [travel, schoolSettings]);

  // Regenerate preview when settings change (debounced)
  useEffect(() => {
    if (!open || !travel || !schoolSettings) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setIsGenerating(true);

    debounceRef.current = setTimeout(async () => {
      const url = await generatePDF(settings);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(url);
      setIsGenerating(false);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [settings, open, travel, schoolSettings, generatePDF]);

  // Cleanup on close
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    onOpenChange(isOpen);
  };

  const handleDownload = async () => {
    await generatePDF(settings, true);
    toast.success("PDF berhasil diunduh");
  };

  const handleReset = () => {
    setSettings(DEFAULT_SPD_SETTINGS);
  };

  const handleSave = () => {
    saveSettings(settings);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle>Preview SPD</DialogTitle>
            <DialogDescription>
              Sesuaikan pengaturan PDF dan lihat hasilnya secara real-time
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              {showSettings ? "Sembunyikan" : "Tampilkan"} Pengaturan
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleDownload}
            >
              <FileDown className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex flex-1 min-h-0">
          {/* PDF Preview */}
          <div className="flex-1 bg-muted/30 p-4 relative">
            {isGenerating && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Memperbarui preview...</span>
                </div>
              </div>
            )}
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full h-full border rounded-md bg-white"
                title="PDF Preview"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Memuat preview...
              </div>
            )}
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="w-80 border-l">
              <SPDPdfSettingsPanel
                settings={settings}
                onChange={setSettings}
                onReset={handleReset}
                onSave={handleSave}
                isSaving={isSaving}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
