import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, Users, Grid3x3, Hash, FileText, Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JsBarcode from "jsbarcode";
import { addLetterheadToPDF, addQRCodeToPDF } from "@/lib/pdfLetterhead";
import { DashboardLayout } from "@/components/DashboardLayout";

interface Student {
  id: string;
  nis: string;
  nisn?: string;
  full_name: string;
  class_id: string;
  photo_url?: string;
  gender?: string;
  birth_place?: string;
  birth_date?: string;
  classes: {
    name: string;
    grade: number;
  };
}

interface SeatingArrangement {
  tableNumber: number;
  examNumber: number;
  student: Student;
}

interface Room {
  roomNumber: number;
  seats: SeatingArrangement[];
}

const ExamAdministration = () => {
  const [selectedGrades, setSelectedGrades] = useState<string[]>(['7', '8', '9']);
  const [rowsCount, setRowsCount] = useState(8);
  const [columnsCount, setColumnsCount] = useState(4);
  const [startingExamNumberGrade7, setStartingExamNumberGrade7] = useState(25267);
  const [startingExamNumberGrade8, setStartingExamNumberGrade8] = useState(25268);
  const [startingExamNumberGrade9, setStartingExamNumberGrade9] = useState(25269);
  const [previewRooms, setPreviewRooms] = useState<Room[]>([]);
  const [activePreview, setActivePreview] = useState<'seating' | 'cards' | 'numbers'>('seating');
  const [showCardPreview, setShowCardPreview] = useState(false);
  const [cardSize, setCardSize] = useState<'portrait' | 'landscape' | '10x8' | 'custom'>('portrait');
  const [customCardWidth, setCustomCardWidth] = useState<number>(85);
  const [customCardHeight, setCustomCardHeight] = useState<number>(54);
  const [fontScale, setFontScale] = useState<number>(1);
  const [seatingMode, setSeatingMode] = useState<'auto' | 'alternating' | 'by_class'>('auto');
  const [filterType, setFilterType] = useState<'all' | 'class' | 'student'>('all');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Function to convert name to Title Case
  const toTitleCase = (name: string): string => {
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Function to format date with Indonesian month name
  const formatDateWithMonthName = (date: Date): string => {
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const day = String(date.getDate()).padStart(2, '0');
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Fetch all students
  const { data: students = [], isLoading } = useQuery({
    queryKey: ['students-for-exam'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select(`
          id,
          nis,
          nisn,
          full_name,
          class_id,
          photo_url,
          gender,
          birth_place,
          birth_date,
          classes (
            name,
            grade
          )
        `)
        .order('full_name');
      
      if (error) throw error;
      return data as Student[];
    },
  });

  // Fetch school settings
  const { data: settings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('school_settings')
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Load persisted exam card settings
  useEffect(() => {
    const cfg = (settings as any)?.exam_card_settings;
    if (cfg && typeof cfg === 'object') {
      if (cfg.cardSize) setCardSize(cfg.cardSize);
      if (cfg.customCardWidth) setCustomCardWidth(cfg.customCardWidth);
      if (cfg.customCardHeight) setCustomCardHeight(cfg.customCardHeight);
      if (cfg.fontScale) setFontScale(cfg.fontScale);
      if (cfg.seatingMode) setSeatingMode(cfg.seatingMode);
    }
  }, [settings]);

  const saveExamCardSettings = async () => {
    try {
      const payload = { cardSize, customCardWidth, customCardHeight, fontScale, seatingMode };
      const { error } = await supabase
        .from('school_settings')
        .update({ exam_card_settings: payload } as any)
        .eq('id', (settings as any).id);
      if (error) throw error;
      toast.success("Pengaturan kartu ujian disimpan");
    } catch (e) {
      console.error(e);
      toast.error("Gagal menyimpan pengaturan");
    }
  };

  const handleGradeToggle = (grade: string) => {
    setSelectedGrades(prev => {
      if (prev.includes(grade)) {
        return prev.filter(g => g !== grade);
      }
      return [...prev, grade];
    });
  };

  const generateRooms = (): Room[] => {
    let filteredStudents = students.filter(s => 
      selectedGrades.includes(s.classes.grade.toString())
    );

    // Apply additional filters based on filterType
    if (filterType === 'class' && selectedClasses.length > 0) {
      filteredStudents = filteredStudents.filter(s => 
        selectedClasses.includes(s.classes.name)
      );
    } else if (filterType === 'student' && selectedStudentIds.length > 0) {
      filteredStudents = filteredStudents.filter(s => 
        selectedStudentIds.includes(s.id)
      );
    }

    if (filteredStudents.length === 0) {
      toast.error("Tidak ada siswa untuk kelas yang dipilih");
      return [];
    }

    // Group students by class (combining grade + class name)
    const studentsByClass: Record<string, Student[]> = {};
    
    filteredStudents.forEach(student => {
      const classKey = student.classes.name; // e.g., "7A", "8B", etc.
      if (!studentsByClass[classKey]) {
        studentsByClass[classKey] = [];
      }
      studentsByClass[classKey].push(student);
    });

    // Sort students within each class by name
    Object.keys(studentsByClass).forEach(classKey => {
      studentsByClass[classKey].sort((a, b) => 
        a.full_name.localeCompare(b.full_name)
      );
    });

    // Get all class names sorted
    const allClassNames = Object.keys(studentsByClass).sort((a, b) => a.localeCompare(b));
    
    // Group by class suffix (A, B, C, etc.) and by grade
    const classesByGrade: Record<string, string[]> = {};
    allClassNames.forEach(className => {
      const grade = className.charAt(0); // Get first character (grade number)
      if (!classesByGrade[grade]) {
        classesByGrade[grade] = [];
      }
      classesByGrade[grade].push(className);
    });

    // Create groups of 3 classes (one from each grade)
    // e.g., [7A, 8A, 9A], [7B, 8B, 9B], etc.
    // Special handling: merge classes from same grade if they're alone
    const classGroups: string[][] = [];
    const maxGroupCount = Math.max(
      ...Object.values(classesByGrade).map(classes => classes.length)
    );
    
    for (let i = 0; i < maxGroupCount; i++) {
      const group: string[] = [];
      selectedGrades.forEach(grade => {
        if (classesByGrade[grade] && classesByGrade[grade][i]) {
          group.push(classesByGrade[grade][i]);
        }
      });
      if (group.length > 0) {
        classGroups.push(group);
      }
    }
    
    // Merge consecutive single-grade classGroups (e.g., [8F] and [8G] -> [8F, 8G])
    const mergedClassGroups: string[][] = [];
    let i = 0;
    while (i < classGroups.length) {
      const currentGroup = classGroups[i];
      
      // Check if this group has only one class
      if (currentGroup.length === 1) {
        const currentGrade = currentGroup[0].charAt(0);
        const mergedGroup = [...currentGroup];
        
        // Look ahead for more single-class groups of the same grade
        let j = i + 1;
        while (j < classGroups.length && classGroups[j].length === 1) {
          const nextGrade = classGroups[j][0].charAt(0);
          if (nextGrade === currentGrade) {
            mergedGroup.push(classGroups[j][0]);
            j++;
          } else {
            break;
          }
        }
        
        mergedClassGroups.push(mergedGroup);
        i = j;
      } else {
        mergedClassGroups.push(currentGroup);
        i++;
      }
    }

    const seatsPerRoom = rowsCount * columnsCount;
    const rooms: Room[] = [];
    
    // Track exam number counters per grade
    const examNumberCounters: Record<string, number> = {
      '7': 0,
      '8': 0,
      '9': 0
    };

    // Special case: only one grade selected → 1 rombel per ruang (urut sesuai kelas)
    // Seating mode: 'auto' = old behavior (1 rombel/ruang only when 1 grade selected),
    // 'alternating' = always alternate antar kelas, 'by_class' = always 1 rombel per ruang
    const singleGradeMode = seatingMode === 'by_class'
      || (seatingMode === 'auto' && selectedGrades.length === 1);

    // Collect ALL students from all class groups in alternating order
    const allStudentsOrdered: Student[] = [];

    if (singleGradeMode) {
      // One class per room: just append students class-by-class in order
      const onlyGrade = selectedGrades[0];
      const classNamesForGrade = (classesByGrade[onlyGrade] || []).slice().sort((a, b) => a.localeCompare(b));
      classNamesForGrade.forEach(className => {
        (studentsByClass[className] || []).forEach(s => allStudentsOrdered.push(s));
      });
    } else {
      mergedClassGroups.forEach(classGroup => {
        // Create indices for tracking position in each class in this group
        const classIndices: Record<string, number> = {};
        classGroup.forEach(className => {
          classIndices[className] = 0;
        });

        // Calculate total students in this group
        const totalGroupStudents = classGroup.reduce((sum, className) =>
          sum + (studentsByClass[className]?.length || 0), 0
        );

        // Collect all students from this class group in alternating order
        let rotationIndex = 0;
        let studentsCollected = 0;

        while (studentsCollected < totalGroupStudents) {
          const className = classGroup[rotationIndex % classGroup.length];

          if (classIndices[className] < studentsByClass[className].length) {
            allStudentsOrdered.push(studentsByClass[className][classIndices[className]]);
            classIndices[className]++;
            studentsCollected++;
          }

          rotationIndex = (rotationIndex + 1) % classGroup.length;

          // Safety check
          if (rotationIndex > classGroup.length * totalGroupStudents) break;
        }
      });
    }
    
    // Now distribute ALL students into rooms, filling each to EXACTLY capacity (32 students)
    // Only the LAST room is allowed to have fewer than 32 students
    let currentRoomNumber = 1;
    let studentIndex = 0;
    
    while (studentIndex < allStudentsOrdered.length) {
      const roomSeats: SeatingArrangement[] = [];
      const remainingStudents = allStudentsOrdered.length - studentIndex;

      // In single-grade mode, do not mix classes in one room.
      let maxForThisRoom = seatsPerRoom;
      if (singleGradeMode) {
        const startClass = allStudentsOrdered[studentIndex].classes.name;
        let sameClassCount = 0;
        for (let k = studentIndex; k < allStudentsOrdered.length && sameClassCount < seatsPerRoom; k++) {
          if (allStudentsOrdered[k].classes.name === startClass) sameClassCount++;
          else break;
        }
        maxForThisRoom = Math.min(seatsPerRoom, sameClassCount);
      }

      const studentsForThisRoom = Math.min(remainingStudents, maxForThisRoom);
      
      for (let i = 0; i < studentsForThisRoom; i++) {
        const student = allStudentsOrdered[studentIndex + i];
        roomSeats.push({
          tableNumber: i + 1,
          examNumber: 0,
          student
        });
      }
      
      // Apply snake pattern to this room
      roomSeats.forEach((seat, index) => {
        const row = Math.floor(index / columnsCount);
        const col = index % columnsCount;
        
        // Snake pattern: even rows (0,2,4...) left-to-right, odd rows (1,3,5...) right-to-left
        let tableNumber: number;
        if (row % 2 === 0) {
          tableNumber = row * columnsCount + col + 1;
        } else {
          tableNumber = (row + 1) * columnsCount - col;
        }
        
        seat.tableNumber = tableNumber;
      });
      
      // Sort by table number to reassign exam numbers in correct order
      roomSeats.sort((a, b) => a.tableNumber - b.tableNumber);
      
      // Reassign exam numbers based on table number order
      roomSeats.forEach((seat) => {
        const currentGrade = seat.student.classes.grade.toString();
        const gradeStartingNumber = currentGrade === '7' ? startingExamNumberGrade7 
          : currentGrade === '8' ? startingExamNumberGrade8 
          : startingExamNumberGrade9;
        
        const examNumber = (gradeStartingNumber * 1000) + (examNumberCounters[currentGrade] + 1);
        examNumberCounters[currentGrade]++;
        seat.examNumber = examNumber;
      });
      
      // Add this room if it has seats
      if (roomSeats.length > 0) {
        rooms.push({
          roomNumber: currentRoomNumber,
          seats: roomSeats
        });
        currentRoomNumber++;
      }
      
      studentIndex += studentsForThisRoom;
    }

    return rooms;
  };

  // Generate barcode as base64 image
  const generateBarcode = (text: string): string => {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, text, {
      format: "CODE128",
      width: 2,
      height: 40,
      displayValue: false,
      margin: 0
    });
    return canvas.toDataURL('image/png');
  };

  // Get color for class based on grade
  const getClassColor = (className: string): { r: number; g: number; b: number; hex: string } => {
    const colors = [
      { r: 79, g: 195, b: 247, hex: '#4FC3F7' },    // Light Blue
      { r: 129, g: 199, b: 132, hex: '#81C784' },   // Light Green
      { r: 255, g: 183, b: 77, hex: '#FFB74D' },    // Orange
      { r: 240, g: 98, b: 146, hex: '#F06292' },    // Pink
      { r: 171, g: 71, b: 188, hex: '#AB47BC' },    // Purple
      { r: 77, g: 182, b: 172, hex: '#4DB6AC' },    // Teal
      { r: 255, g: 138, b: 101, hex: '#FF8A65' },   // Deep Orange
      { r: 149, g: 117, b: 205, hex: '#9575CD' },   // Deep Purple
    ];
    
    // Use class name hash to consistently assign colors
    const hash = className.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const handlePrintExamCards = async () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const rooms = previewRooms.length > 0 ? previewRooms : generateRooms();
    if (rooms.length === 0) return;

    try {
      // F4 dimensions: 210mm x 330mm in portrait mode
      const doc = new jsPDF('portrait', 'mm', [210, 330]);
      
      // Card layout based on selected size
      let cardsPerPage: number;
      let cardWidth: number;
      let cardHeight: number;
      let marginX: number;
      let marginY: number;
      let gapX: number;
      let gapY: number;
      let cols: number;
      
      const PAGE_W = 210, PAGE_H = 330;
      if (cardSize === 'portrait') {
        cardWidth = 63; cardHeight = 103; cols = 3;
      } else if (cardSize === 'landscape') {
        cardWidth = 85; cardHeight = 54; cols = 2;
      } else if (cardSize === '10x8') {
        // 10cm x 8cm landscape
        cardWidth = 100; cardHeight = 80; cols = 2;
      } else {
        cardWidth = Math.min(customCardWidth || 85, PAGE_W - 10);
        cardHeight = Math.min(customCardHeight || 54, PAGE_H - 10);
        cols = Math.max(1, Math.floor((PAGE_W - 10) / (cardWidth + 5)));
      }
      gapX = 5; gapY = 5;
      const rowsPerPage = Math.max(1, Math.floor((PAGE_H - 10) / (cardHeight + gapY)));
      cardsPerPage = cols * rowsPerPage;
      marginX = Math.max(3, (PAGE_W - (cols * cardWidth + (cols - 1) * gapX)) / 2);
      marginY = 5;
      
      let cardCount = 0;
      let isFirstPage = true;

      // Get exam schedule from settings or use empty array
      const examSchedule = ((settings as any)?.exam_schedule as Array<{
        no: number;
        day: string;
        date: string;
        subject: string;
        time: string;
        duration: string;
      }>) || [];

      for (const room of rooms) {
        for (let i = 0; i < room.seats.length; i++) {
          const seat = room.seats[i];
          const cardIndex = cardCount % cardsPerPage;
          
          if (cardIndex === 0 && !isFirstPage) {
            doc.addPage();
          }
          isFirstPage = false;
          
          // Calculate card position based on columns
          const col = cardIndex % cols;
          const row = Math.floor(cardIndex / cols);
          
          const cardX = marginX + col * (cardWidth + gapX);
          const cardY = marginY + row * (cardHeight + gapY);
          
          // Helper: image loader -> dataUrl
          const loadImg = async (url: string, type: 'png' | 'jpeg' = 'png'): Promise<string | null> => {
            try {
              return await new Promise<string | null>((resolve) => {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  canvas.width = img.width; canvas.height = img.height;
                  const ctx = canvas.getContext('2d');
                  if (!ctx) return resolve(null);
                  ctx.drawImage(img, 0, 0);
                  resolve(canvas.toDataURL(type === 'jpeg' ? 'image/jpeg' : 'image/png', 0.85));
                };
                img.onerror = () => resolve(null);
                img.src = url;
              });
            } catch { return null; }
          };

          // ---------- LAYOUT CONSTANTS (proportional, scaled by fontScale) ----------
          const fs = (n: number) => Math.max(2.5, n * fontScale);
          const pad = 3;
          const innerW = cardWidth - pad * 2;

          // Reserved heights
          const sigReserved = Math.max(16, cardHeight * 0.22); // bottom area for signature
          const usableH = cardHeight - sigReserved - pad;

          // Background + border
          doc.setFillColor(250, 250, 252);
          doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 2, 2, 'F');
          doc.setDrawColor(59, 130, 246);
          doc.setLineWidth(0.6);
          doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 2, 2, 'S');

          let currentY = cardY + pad + 2;

          // ---------- LETTERHEAD ----------
          const miniLogoSize = Math.min(cardHeight * 0.09, 10);
          const headerStartY = currentY;
          const [leftLogo, rightLogo] = await Promise.all([
            settings?.logo_url ? loadImg(settings.logo_url) : Promise.resolve(null),
            settings?.right_logo_url ? loadImg(settings.right_logo_url) : Promise.resolve(null),
          ]);
          if (leftLogo) doc.addImage(leftLogo, 'PNG', cardX + pad, headerStartY, miniLogoSize, miniLogoSize);
          if (rightLogo) doc.addImage(rightLogo, 'PNG', cardX + cardWidth - pad - miniLogoSize, headerStartY, miniLogoSize, miniLogoSize);

          const centerX = cardX + cardWidth / 2;
          const headerTextW = innerW - miniLogoSize * 2 - 4;
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 41, 59);

          if (settings?.district_name) {
            doc.setFontSize(fs(5.5));
            doc.text(settings.district_name, centerX, currentY + 2, { align: "center", maxWidth: headerTextW });
            currentY += fs(2.2);
          }
          if (settings?.school_name) {
            doc.setFontSize(fs(6.5));
            doc.text(settings.school_name, centerX, currentY + 2.5, { align: "center", maxWidth: headerTextW });
            currentY += fs(3);
          }
          if (settings?.school_address) {
            doc.setFontSize(fs(4.5));
            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            const addr = doc.splitTextToSize(settings.school_address, headerTextW);
            doc.text(addr.slice(0, 1), centerX, currentY + 2, { align: "center" });
            currentY += fs(2);
          }
          // Make sure header doesn't overlap logos
          currentY = Math.max(currentY + 1, headerStartY + miniLogoSize + 0.5);
          // Separator
          doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.4);
          doc.line(cardX + pad, currentY, cardX + cardWidth - pad, currentY);
          doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
          doc.line(cardX + pad, currentY + 0.5, cardX + cardWidth - pad, currentY + 0.5);
          currentY += 2.5;

          // ---------- TITLE ----------
          doc.setFontSize(fs(7));
          doc.setFont("helvetica", "bold");
          doc.setTextColor(59, 130, 246);
          doc.text("KARTU PESERTA UJIAN", centerX, currentY + 1, { align: "center" });
          currentY += fs(3);
          if (settings?.exam_name) {
            doc.setFontSize(fs(5));
            doc.setTextColor(30, 41, 59);
            doc.text(settings.exam_name, centerX, currentY, { align: "center", maxWidth: innerW });
            currentY += fs(2.5);
          }
          if (settings?.academic_year) {
            doc.setFontSize(fs(4.5));
            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            doc.text(`Tahun Pelajaran ${settings.academic_year}`, centerX, currentY, { align: "center" });
            currentY += fs(2.5);
          }

          // ---------- INFO BAR (Ruang / Meja) ----------
          const infoBarH = fs(4.5);
          doc.setFillColor(59, 130, 246);
          doc.roundedRect(cardX + pad, currentY, innerW, infoBarH, 1, 1, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(fs(5.5));
          doc.setFont("helvetica", "bold");
          doc.text(`RUANG ${room.roomNumber}`, cardX + pad + 2, currentY + infoBarH * 0.7);
          doc.text(`MEJA: ${seat.tableNumber}`, cardX + cardWidth - pad - 2, currentY + infoBarH * 0.7, { align: "right" });
          currentY += infoBarH + 1.5;

          // ---------- IDENTITY + PHOTO ----------
          // Photo (3x4)
          const photoH = Math.min(cardHeight * 0.28, 26);
          const photoW = photoH * 0.75;
          const photoX = cardX + cardWidth - pad - photoW;
          const photoY = currentY;
          doc.setDrawColor(30, 41, 59); doc.setLineWidth(0.3);
          doc.rect(photoX, photoY, photoW, photoH, 'S');
          if (seat.student.photo_url) {
            const ph = await loadImg(seat.student.photo_url, 'jpeg');
            if (ph) doc.addImage(ph, 'JPEG', photoX + 0.3, photoY + 0.3, photoW - 0.6, photoH - 0.6);
          } else {
            doc.setFontSize(fs(4)); doc.setTextColor(150, 150, 150);
            doc.text("Foto 3x4", photoX + photoW / 2, photoY + photoH / 2, { align: 'center' });
          }

          // Identity rows (left of photo)
          const labelX = cardX + pad;
          const labelW = Math.max(18, innerW * 0.22);
          const valueX = labelX + labelW;
          const valueW = (cardWidth - pad - photoW - 2) - valueX + cardX;
          const rowH = fs(3.2);
          const infoFs = fs(4.8);
          const ttlBirth = [seat.student.birth_place, seat.student.birth_date ? formatDateWithMonthName(new Date(seat.student.birth_date)) : ''].filter(Boolean).join(', ');

          const idRows: Array<[string, string]> = [
            ["No. Peserta", seat.examNumber.toString()],
            ["NIS", seat.student.nis || '-'],
            ["NISN", seat.student.nisn || '-'],
            ["Nama", toTitleCase(seat.student.full_name)],
            ["TTL", ttlBirth || '-'],
            ["Kelas", seat.student.classes.name],
          ];

          doc.setFontSize(infoFs);
          let infoY = currentY + fs(2.2);
          idRows.forEach(([label, value]) => {
            doc.setFont("helvetica", "bold"); doc.setTextColor(71, 85, 105);
            doc.text(label, labelX, infoY);
            doc.setFont("helvetica", "normal"); doc.setTextColor(30, 41, 59);
            doc.text(":", labelX + labelW - 2, infoY);
            const lines = doc.splitTextToSize(value, valueW);
            doc.text(lines.slice(0, 2), valueX, infoY);
            infoY += rowH * Math.max(1, Math.min(2, lines.length));
          });
          currentY = Math.max(infoY, photoY + photoH) + 1.5;

          // ---------- SCHEDULE TABLE (constrained inside usable area) ----------
          if (examSchedule && examSchedule.length > 0 && currentY < cardY + usableH - 4) {
            const remaining = (cardY + usableH) - currentY;
            const rowHeight = Math.max(2.6, fs(3));
            const headerH = rowHeight;
            const maxRows = Math.max(1, Math.floor((remaining - headerH - 4) / rowHeight));
            const showRows = Math.min(examSchedule.length, maxRows);

            doc.setFontSize(fs(4.5));
            doc.setFont("helvetica", "bold");
            doc.setTextColor(59, 130, 246);
            doc.text("JADWAL UJIAN", centerX, currentY, { align: "center" });
            currentY += fs(2.2);

            const tStartX = cardX + pad;
            const tW = innerW;
            // Proportional cols: No 8%, Hari/Tgl 26%, Mapel 38%, Pukul 16%, Durasi 12%
            const colW = [tW * 0.08, tW * 0.26, tW * 0.38, tW * 0.16, tW * 0.12];

            doc.setFillColor(59, 130, 246);
            doc.rect(tStartX, currentY, tW, headerH, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(fs(3.8));
            const headerLabels = ["No", "Hari/Tgl", "Mapel", "Pukul", "Durasi"];
            let cX = tStartX;
            headerLabels.forEach((h, i) => {
              doc.text(h, cX + colW[i] / 2, currentY + headerH * 0.7, { align: "center", maxWidth: colW[i] - 0.5 });
              cX += colW[i];
            });
            currentY += headerH;

            doc.setTextColor(30, 41, 59);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(fs(3.2));
            examSchedule.slice(0, showRows).forEach((schedule, idx) => {
              if (idx % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(tStartX, currentY, tW, rowHeight, 'F');
              }
              cX = tStartX;
              const cellY = currentY + rowHeight * 0.7;
              doc.text(schedule.no.toString(), cX + colW[0] / 2, cellY, { align: "center" });
              cX += colW[0];
              doc.text(`${schedule.day} ${schedule.date}`, cX + 0.5, cellY, { maxWidth: colW[1] - 1 });
              cX += colW[1];
              const subj = doc.splitTextToSize(schedule.subject, colW[2] - 1);
              doc.text(subj.slice(0, 1), cX + 0.5, cellY, { maxWidth: colW[2] - 1 });
              cX += colW[2];
              doc.text(schedule.time, cX + colW[3] / 2, cellY, { align: "center" });
              cX += colW[3];
              const dur = schedule.duration.includes(':')
                ? `${parseInt(schedule.duration.split(':')[0]) * 60 + parseInt(schedule.duration.split(':')[1])}'`
                : schedule.duration;
              doc.text(dur, cX + colW[4] / 2, cellY, { align: "center" });
              currentY += rowHeight;
            });
            doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.4);
            doc.rect(tStartX, currentY - (showRows + 1) * rowHeight, tW, (showRows + 1) * rowHeight);
          }

          // ---------- SIGNATURE (strictly inside reserved area, no overlap) ----------
          const sigTop = cardY + cardHeight - sigReserved + 1;
          const sigCenterX = cardX + cardWidth * 0.72; // right-aligned block
          const sigBlockW = cardWidth * 0.5;
          const today = new Date();
          const dateStr = formatDateWithMonthName(today);
          doc.setFontSize(fs(4.2));
          doc.setFont("helvetica", "normal");
          doc.setTextColor(71, 85, 105);
          doc.text(`${(settings as any)?.city_name || 'Ciamis'}, ${dateStr}`, sigCenterX, sigTop, { align: "center", maxWidth: sigBlockW });
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 41, 59);
          doc.text((settings as any)?.headmaster_position || "Kepala Sekolah", sigCenterX, sigTop + fs(2.2), { align: "center", maxWidth: sigBlockW });

          // Signature image (centered in sig column)
          const sigImgW = Math.min(sigBlockW * 0.55, 18);
          const sigImgH = sigImgW * 0.55;
          const sigImgY = sigTop + fs(3);
          if (settings?.headmaster_signature_url) {
            const sg = await loadImg(settings.headmaster_signature_url);
            if (sg) doc.addImage(sg, 'PNG', sigCenterX - sigImgW / 2, sigImgY, sigImgW, sigImgH);
          }
          // Stamp - placed to the LEFT of name signature, half-overlapping signature only
          if (settings?.school_stamp_url) {
            const st = await loadImg(settings.school_stamp_url);
            if (st) {
              const stampSize = Math.min(sigReserved * 0.7, 14);
              doc.addImage(st, 'PNG', sigCenterX - sigImgW * 0.6 - stampSize * 0.3, sigImgY - stampSize * 0.2, stampSize, stampSize);
            }
          }
          // Headmaster name + NIP
          const nameY = sigTop + sigReserved - fs(3);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(fs(4.2));
          doc.setTextColor(30, 41, 59);
          doc.text(settings?.headmaster_name || "___________________", sigCenterX, nameY, { align: "center", maxWidth: sigBlockW });
          if (settings?.headmaster_nip) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(fs(3.5));
            doc.setTextColor(71, 85, 105);
            doc.text(`NIP. ${settings.headmaster_nip}`, sigCenterX, nameY + fs(2), { align: "center", maxWidth: sigBlockW });
          }

          cardCount++;
        }
      }

      doc.save(`kartu-ujian-${rooms.length}-ruangan-${cardCount}-kartu.pdf`);
      toast.success(`${cardCount} kartu ujian berhasil dicetak (${Math.ceil(cardCount/cardsPerPage)} halaman F4)`);
    } catch (error) {
      console.error("Error printing exam cards:", error);
      toast.error("Gagal mencetak kartu ujian. Silakan coba lagi.");
    }
  };

  const handlePrintSeatingChart = async () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const rooms = previewRooms.length > 0 ? previewRooms : generateRooms();
    if (rooms.length === 0) return;

    const doc = new jsPDF('landscape');
    
    for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
      const room = rooms[roomIndex];
      
      if (roomIndex > 0) {
        doc.addPage();
      }
      
      // Modern compact header
      let yPos = 10;
      const pageCenter = 148.5; // Center of landscape A4
      
      // Add logos if available - optimized size and position
      if (settings?.logo_url) {
        try {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.src = settings.logo_url;
          await new Promise((resolve) => {
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                doc.addImage(canvas.toDataURL('image/png'), 'PNG', 15, yPos - 2, 18, 18);
              }
              resolve(null);
            };
            img.onerror = () => resolve(null);
          });
        } catch (e) {
          console.error("Error loading logo:", e);
        }
      }
      
      // Right logo - properly positioned to avoid overlap
      if (settings?.right_logo_url) {
        try {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.src = settings.right_logo_url;
          await new Promise((resolve) => {
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                doc.addImage(canvas.toDataURL('image/png'), 'PNG', 264, yPos - 2, 18, 18);
              }
              resolve(null);
            };
            img.onerror = () => resolve(null);
          });
        } catch (e) {
          console.error("Error loading right logo:", e);
        }
      }

      // School info - modern layout with proper spacing
      let headerY = yPos + 1;
      
      // District name (if exists)
      if (settings?.district_name) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60, 60, 60);
        doc.text(settings.district_name.toUpperCase(), pageCenter, headerY, { align: "center" });
        headerY += 4.5;
      }
      
      // School name
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text((settings?.school_name || "NAMA SEKOLAH").toUpperCase(), pageCenter, headerY, { align: "center" });
      headerY += 5.5;
      
      // Address and phone in one line if possible
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      if (settings?.school_address) {
        const addressText = settings.school_phone 
          ? `${settings.school_address} | Telp: ${settings.school_phone}`
          : settings.school_address;
        doc.text(addressText, pageCenter, headerY, { align: "center" });
        headerY += 3.5;
      }
      
      // Modern separator lines
      headerY += 0.5;
      doc.setDrawColor(41, 128, 185);
      doc.setLineWidth(0.6);
      doc.line(40, headerY, 257, headerY);
      headerY += 0.5;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(40, headerY, 257, headerY);
      
      headerY += 5;

      // Title section with modern styling
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(41, 128, 185);
      doc.text("DENAH TEMPAT DUDUK PESERTA", pageCenter, headerY, { align: "center" });
      headerY += 5;
      
      // Exam info
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(settings?.exam_name || "PENILAIAN SUMATIF AKHIR TAHUN (PSAT)", pageCenter, headerY, { align: "center" });
      headerY += 3.5;
      doc.text(`Tahun Ajaran ${settings?.academic_year || "2024/2025"}`, pageCenter, headerY, { align: "center" });
      
      // Room number with badge style
      headerY += 5;
      doc.setFillColor(41, 128, 185);
      doc.roundedRect(pageCenter - 25, headerY - 4, 50, 7, 1, 1, 'F');
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      const roomNames = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh'];
      doc.text(`RUANG ${room.roomNumber}`, pageCenter, headerY, { align: "center" });
      
      headerY += 7;

      // Add statistics distribution
      const gradeDistribution: Record<number, number> = {};
      const classDistribution: Record<string, number> = {};
      const genderDistribution: Record<string, number> = { L: 0, P: 0 };
      
      room.seats.forEach(seat => {
        const grade = seat.student.classes.grade;
        const className = seat.student.classes.name;
        const gender = seat.student.gender || 'L';
        
        gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
        classDistribution[className] = (classDistribution[className] || 0) + 1;
        genderDistribution[gender] = (genderDistribution[gender] || 0) + 1;
      });

      // Calculate statistics box height based on content
      const classCount = Object.keys(classDistribution).length;
      const classLines = Math.ceil(classCount / 5); // 5 classes per line
      const boxHeight = 18 + (classLines - 1) * 4; // Base height + extra lines
      
      // Statistics Box - cleaner layout
      doc.setDrawColor(41, 128, 185);
      doc.setLineWidth(0.5);
      doc.rect(40, headerY - 2, 217, boxHeight);
      
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(41, 128, 185);
      
      // Grade distribution
      let statX = 45;
      doc.text("Tingkat:", statX, headerY + 2);
      statX += 18;
      Object.entries(gradeDistribution).sort(([a], [b]) => Number(a) - Number(b)).forEach(([grade, count]) => {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        doc.text(`Kls ${grade}: ${count}`, statX, headerY + 2);
        statX += 18;
      });
      
      // Class distribution
      let classY = headerY + 7;
      statX = 45;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(41, 128, 185);
      doc.text("Kelas:", statX, classY);
      statX += 18;
      Object.entries(classDistribution).sort(([a], [b]) => a.localeCompare(b)).forEach(([className, count], idx) => {
        const color = getClassColor(className);
        doc.setFillColor(color.r, color.g, color.b);
        doc.circle(statX + 1, classY - 1, 1, 'F');
        
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        doc.text(`${className}: ${count}`, statX + 3, classY);
        statX += 20;
        
        if ((idx + 1) % 5 === 0 && idx < Object.keys(classDistribution).length - 1) {
          statX = 63;
          classY += 4;
        }
      });
      
      // Gender distribution - below class distribution
      const genderY = classY + 4;
      statX = 45;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(41, 128, 185);
      doc.text("Jenis Kelamin:", statX, genderY);
      statX += 28;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(41, 128, 185);
      doc.text(`Laki-laki: ${genderDistribution.L || 0}`, statX, genderY);
      statX += 30;
      doc.setTextColor(219, 39, 119);
      doc.text(`Perempuan: ${genderDistribution.P || 0}`, statX, genderY);
      statX += 35;
      doc.setTextColor(60, 60, 60);
      doc.text(`Total: ${room.seats.length} siswa`, statX, genderY);
      
      headerY = genderY + 9; // Add more spacing after statistics box

      // Add legend for class colors - cleaner layout
      const uniqueClasses = Array.from(new Set(room.seats.map(s => s.student.classes.name))).sort();
      if (uniqueClasses.length > 0) {
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(41, 128, 185);
        doc.text("Legenda Kelas:", 40, headerY);
        
        let legendX = 65;
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        uniqueClasses.forEach((className, idx) => {
          const color = getClassColor(className);
          
          // Draw color box
          doc.setFillColor(color.r, color.g, color.b);
          doc.rect(legendX, headerY - 3, 5, 4, 'F');
          doc.setDrawColor(150, 150, 150);
          doc.setLineWidth(0.2);
          doc.rect(legendX, headerY - 3, 5, 4);
          
          // Draw class name
          doc.setTextColor(60, 60, 60);
          doc.text(className, legendX + 6.5, headerY);
          
          legendX += 22;
          
          // Wrap to next line if too many classes
          if ((idx + 1) % 7 === 0 && idx < uniqueClasses.length - 1) {
            headerY += 5;
            legendX = 65;
          }
        });
        
        headerY += 6;
      }

      // Supervisor indicator - modern style
      doc.setFillColor(50, 50, 50);
      doc.rect(pageCenter - 40, headerY - 1, 80, 4, 'F');
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("▼ PENGAWAS ▼", pageCenter, headerY + 1.5, { align: "center" });
      
      yPos = headerY + 5;

      // Optimized for 8 columns - calculate dynamic cell width
      const pageWidth = 297;
      const marginLeft = 15;
      const marginRight = 15;
      const availableWidth = pageWidth - marginLeft - marginRight;
      const cellWidth = availableWidth / columnsCount;
      
      // Calculate optimal cell height
      const availableHeight = 200 - yPos;
      const cellHeight = Math.min(20, availableHeight / rowsCount);
      const startX = marginLeft;
      const startY = yPos;

      for (let row = 0; row < rowsCount; row++) {
        for (let col = 0; col < columnsCount; col++) {
          const x = startX + col * cellWidth;
          const y = startY + row * cellHeight;
          
          // Calculate table number in snake pattern for this position
          let tableNumber: number;
          if (row % 2 === 0) {
            // Even row: left to right
            tableNumber = row * columnsCount + col + 1;
          } else {
            // Odd row: right to left
            tableNumber = (row + 1) * columnsCount - col;
          }
          
          // Find the seat with this table number
          const seat = room.seats.find(s => s.tableNumber === tableNumber);
          
          // Modern cell border with shadow effect
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.4);
          doc.rect(x, y, cellWidth, cellHeight);
          
          if (seat) {
            
            // Add light background color based on class
            const classColor = getClassColor(seat.student.classes.name);
            const lightR = Math.floor(classColor.r + (255 - classColor.r) * 0.8);
            const lightG = Math.floor(classColor.g + (255 - classColor.g) * 0.8);
            const lightB = Math.floor(classColor.b + (255 - classColor.b) * 0.8);
            doc.setFillColor(lightR, lightG, lightB);
            doc.rect(x, y, cellWidth, cellHeight, 'F');
            
            // Exam number badge - modern gradient style
            doc.setFillColor(41, 128, 185);
            doc.rect(x, y, cellWidth, 5, 'F');
            
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(255, 255, 255);
            doc.text(`${seat.tableNumber}`, x + cellWidth/2, y + 3.5, { align: "center" });
            
            // Reset text color for student info
            doc.setTextColor(0, 0, 0);
            
            // Student name - full name with adjusted font size (Title Case)
            const fullName = toTitleCase(seat.student.full_name);
            const nameLength = fullName.length;
            
            // Dynamic font size based on name length
            let nameFontSize;
            if (columnsCount >= 8) {
              nameFontSize = nameLength > 20 ? 5 : nameLength > 15 ? 5.5 : 6;
            } else {
              nameFontSize = nameLength > 20 ? 6 : nameLength > 15 ? 6.5 : 7;
            }
            
            doc.setFontSize(nameFontSize);
            doc.setFont("helvetica", "bold");
            
            // Split long names into multiple lines if needed
            const maxWidth = cellWidth - 2;
            const nameLines = doc.splitTextToSize(fullName, maxWidth);
            const nameStartY = y + 8;
            
            nameLines.forEach((line: string, idx: number) => {
              if (idx < 2) { // Maximum 2 lines for name
                doc.text(line, x + cellWidth/2, nameStartY + (idx * 3), { align: "center" });
              }
            });
            
            const nextY = nameStartY + (Math.min(nameLines.length, 2) * 3) + 0.5;
            
            // Gender indicator without symbols
            doc.setFontSize(columnsCount >= 8 ? 5 : 5.5);
            doc.setFont("helvetica", "normal");
            const gender = seat.student.gender || 'L';
            if (gender === 'L') {
              doc.setTextColor(41, 128, 185);
              doc.text("Laki-laki", x + cellWidth/2, nextY, { align: "center" });
            } else {
              doc.setTextColor(219, 39, 119);
              doc.text("Perempuan", x + cellWidth/2, nextY, { align: "center" });
            }
            
            // Exam number below gender with better spacing
            const examNumberY = nextY + (columnsCount >= 8 ? 2.5 : 3);
            doc.setFontSize(columnsCount >= 8 ? 5.5 : 6);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0, 0, 0);
            doc.text(`No: ${seat.examNumber}`, x + cellWidth/2, examNumberY, { align: "center" });
            
            doc.setTextColor(0, 0, 0);
            
            // Class badge - adjusted position to avoid overlap
            doc.setFillColor(245, 245, 245);
            const classBoxY = y + cellHeight - 5.5;
            doc.rect(x + 1, classBoxY, cellWidth - 2, 4.5, 'F');
            
            doc.setFontSize(columnsCount >= 8 ? 6.5 : 7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(41, 128, 185);
            doc.text(seat.student.classes.name, x + cellWidth/2, classBoxY + 3, { align: "center" });
          }
        }
      }
    }

    doc.save(`denah-duduk-${rooms.length}-ruangan.pdf`);
    toast.success(`Denah duduk untuk ${rooms.length} ruangan berhasil dicetak`);
  };

  const handleGeneratePreview = () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const rooms = generateRooms();
    if (rooms.length === 0) return;

    setPreviewRooms(rooms);
    toast.success(`Preview berhasil dibuat untuk ${rooms.length} ruangan`);
  };

  const handlePrintTableNumbers = async () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const rooms = previewRooms.length > 0 ? previewRooms : generateRooms();
    if (rooms.length === 0) return;

    try {
      // F4 dimensions: 210mm x 330mm in portrait mode
      const doc = new jsPDF('portrait', 'mm', [210, 330]);
      
      // 30 cards per page: 5 columns x 6 rows (adjusted to fit perfectly on F4)
      const cardsPerPage = 30;
      const cols = 5;
      const rows = 6;
      const cardWidth = 39;
      const cardHeight = 52;
      const marginX = 3;
      const marginY = 3;
      const gapX = 1.5;
      const gapY = 1.5;
      
      let cardCount = 0;
      let isFirstPage = true;

      for (const room of rooms) {
        for (let i = 0; i < room.seats.length; i++) {
          const seat = room.seats[i];
          const cardIndex = cardCount % cardsPerPage;
          
          if (cardIndex === 0 && cardCount > 0) {
            doc.addPage();
            isFirstPage = false;
          }

          const row = Math.floor(cardIndex / cols);
          const col = cardIndex % cols;
          
          const x = marginX + col * (cardWidth + gapX);
          const y = marginY + row * (cardHeight + gapY);
          
          // Modern gradient background
          const classColor = getClassColor(seat.student.classes.name);
          
          // Outer border with shadow effect
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.rect(x + 0.5, y + 0.5, cardWidth, cardHeight);
          
          // Main card border
          doc.setDrawColor(classColor.r, classColor.g, classColor.b);
          doc.setLineWidth(0.8);
          doc.rect(x, y, cardWidth, cardHeight);
          
          // Top colored header bar
          doc.setFillColor(classColor.r, classColor.g, classColor.b);
          doc.rect(x, y, cardWidth, 8, 'F');
          
          // Room number in header
          doc.setFontSize(7);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);
          doc.text(`RUANG ${room.roomNumber}`, x + cardWidth/2, y + 5, { 
            align: "center"
          });
          
          // "NOMOR MEJA" label (above the number)
          doc.setFontSize(6);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(120, 120, 120);
          doc.text("NOMOR MEJA", x + cardWidth/2, y + 14, { 
            align: "center"
          });
          
          // Table number (large and prominent)
          doc.setFontSize(28);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(classColor.r, classColor.g, classColor.b);
          doc.text(seat.tableNumber.toString(), x + cardWidth/2, y + 23, { 
            align: "center"
          });
          
          // Divider line
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.2);
          doc.line(x + 3, y + 27, x + cardWidth - 3, y + 27);
          
          // Student name
          doc.setFontSize(7);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          const studentName = toTitleCase(seat.student.full_name);
          const maxNameWidth = cardWidth - 4;
          const nameLines = doc.splitTextToSize(studentName, maxNameWidth);
          const nameY = y + 32;
          doc.text(nameLines.slice(0, 2), x + cardWidth/2, nameY, { 
            align: "center",
            maxWidth: maxNameWidth
          });
          
          // Student info section
          const infoY = nameLines.length > 1 ? y + 39 : y + 36;
          
          // Participant number
          doc.setFontSize(5.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text("No. Peserta:", x + 2, infoY);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          doc.text(seat.examNumber.toString(), x + cardWidth - 2, infoY, { align: "right" });
          
          // Class
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text("Kelas:", x + 2, infoY + 4);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(classColor.r, classColor.g, classColor.b);
          doc.text(seat.student.classes.name, x + cardWidth - 2, infoY + 4, { align: "right" });
          
          // Bottom divider line
          doc.setDrawColor(220, 220, 220);
          doc.setLineWidth(0.2);
          doc.line(x + 3, y + cardHeight - 9, x + cardWidth - 3, y + cardHeight - 9);
          
          // Exam name and academic year at bottom
          doc.setFontSize(4.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(80, 80, 80);
          const examName = settings?.exam_name || "PENILAIAN SUMATIF";
          const examNameLines = doc.splitTextToSize(examName, cardWidth - 4);
          doc.text(examNameLines.slice(0, 1), x + cardWidth/2, y + cardHeight - 6, { 
            align: "center",
            maxWidth: cardWidth - 4
          });
          
          // Academic year
          doc.setFontSize(4.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(classColor.r, classColor.g, classColor.b);
          const academicYear = settings?.academic_year || "2024/2025";
          doc.text(`TP ${academicYear}`, x + cardWidth/2, y + cardHeight - 3, { 
            align: "center"
          });
          
          // Bottom decorative corner
          doc.setFillColor(classColor.r, classColor.g, classColor.b);
          doc.setDrawColor(classColor.r, classColor.g, classColor.b);
          doc.circle(x + cardWidth - 3, y + cardHeight - 3, 1.5, 'F');
          
          cardCount++;
        }
      }

      doc.save(`nomor-meja-${rooms.length}-ruangan-${cardCount}-kartu.pdf`);
      toast.success(`${cardCount} nomor meja berhasil dicetak (${Math.ceil(cardCount/cardsPerPage)} halaman F4)`);
    } catch (error) {
      console.error("Error printing table numbers:", error);
      toast.error("Gagal mencetak nomor meja. Silakan coba lagi.");
    }
  };

  const handlePrintRoomComposition = async () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const rooms = previewRooms.length > 0 ? previewRooms : generateRooms();
    if (rooms.length === 0) return;

    // Collect all students with their room information
    interface StudentRecord {
      className: string;
      grade: number;
      fullName: string;
      examNumber: number;
      gender: string;
      roomNumber: number;
    }

    const studentRecords: StudentRecord[] = [];
    
    rooms.forEach(room => {
      room.seats.forEach(seat => {
        studentRecords.push({
          className: seat.student.classes.name,
          grade: seat.student.classes.grade,
          fullName: seat.student.full_name,
          examNumber: seat.examNumber,
          gender: seat.student.gender || '-',
          roomNumber: room.roomNumber
        });
      });
    });

    // Sort by class name, then by student name
    studentRecords.sort((a, b) => {
      const classCompare = a.className.localeCompare(b.className);
      if (classCompare !== 0) return classCompare;
      return a.fullName.localeCompare(b.fullName);
    });

    const doc = new jsPDF();
    
    // Add letterhead if available
    if (settings) {
      await addLetterheadToPDF(doc, settings);
    }

    let currentY = settings ? 55 : 20;

    // Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("REKAP KOMPOSISI RUANGAN UJIAN", 105, currentY, { align: "center" });
    
    currentY += 7;

    // Add summary statistics in modern card style
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, currentY, 170, 22, 2, 2, 'F');
    doc.setDrawColor(41, 128, 185);
    doc.setLineWidth(0.5);
    doc.roundedRect(20, currentY, 170, 22, 2, 2);

    // Total statistics
    const totalStudents = rooms.reduce((sum, room) => sum + room.seats.length, 0);
    const avgPerRoom = (totalStudents / rooms.length).toFixed(1);
    
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(41, 128, 185);
    doc.text("RINGKASAN", 25, currentY + 5);
    
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(`Total Ruangan: ${rooms.length}`, 25, currentY + 10);
    doc.text(`Total Siswa: ${totalStudents}`, 25, currentY + 14.5);
    doc.text(`Rata-rata per Ruang: ${avgPerRoom} siswa`, 25, currentY + 19);

    // Room details in columns
    doc.setFont("helvetica", "bold");
    doc.setTextColor(41, 128, 185);
    doc.text("JUMLAH SISWA PER RUANG:", 80, currentY + 5);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(7);
    
    let roomStatsX = 80;
    let roomStatsY = currentY + 10;
    const roomsPerRow = 5;
    
    rooms.forEach((room, idx) => {
      if (idx > 0 && idx % roomsPerRow === 0) {
        roomStatsY += 3.5;
        roomStatsX = 80;
      }
      
      doc.text(`R${room.roomNumber}: ${room.seats.length}`, roomStatsX, roomStatsY);
      roomStatsX += 18;
    });
    
    currentY += 27;
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    if (settings?.exam_name) {
      doc.text(settings.exam_name, 105, currentY, { align: "center" });
      currentY += 7;
    }
    doc.text(`Tahun Pelajaran ${settings?.academic_year || '2024/2025'}`, 105, currentY, { align: "center" });
    
    currentY += 12;

    // Prepare table data
    const tableData = studentRecords.map((record, index) => [
      index + 1,
      toTitleCase(record.fullName),
      record.examNumber.toString(),
      record.className,
      record.gender.toUpperCase(),
      record.roomNumber.toString()
    ]);

    // Create table
    autoTable(doc, {
      startY: currentY,
      head: [['No', 'Nama Siswa', 'Nopes', 'Kelas', 'L/P', 'Ruang']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 8
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },  // No
        1: { halign: 'left', cellWidth: 65 },     // Nama
        2: { halign: 'center', cellWidth: 25 },   // Nopes
        3: { halign: 'center', cellWidth: 18 },   // Kelas
        4: { halign: 'center', cellWidth: 12 },   // L/P
        5: { halign: 'center', cellWidth: 15 }    // Ruang
      },
      styles: {
        fontSize: 8,
        cellPadding: 2
      }
    });

    // Add page numbers after table is complete
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Halaman ${i} dari ${totalPages}`,
        105,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    // Add summary at the bottom of the last page
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Siswa: ${studentRecords.length} siswa`, 14, finalY);
    doc.text(`Total Ruangan: ${rooms.length} ruangan`, 14, finalY + 7);

    // Group by class for summary
    const classSummary: Record<string, number> = {};
    studentRecords.forEach(record => {
      classSummary[record.className] = (classSummary[record.className] || 0) + 1;
    });

    let summaryY = finalY + 17;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Rincian per Kelas:", 14, summaryY);
    
    summaryY += 5;
    doc.setFont("helvetica", "normal");
    Object.entries(classSummary).sort().forEach(([className, count]) => {
      doc.text(`${className}: ${count} siswa`, 20, summaryY);
      summaryY += 5;
    });

    doc.save("rekap-komposisi-ruangan.pdf");
    toast.success(`Rekap komposisi ruangan untuk ${studentRecords.length} siswa berhasil dicetak`);
  };

  const handlePrintRoomParticipants = async () => {
    if (selectedGrades.length === 0) {
      toast.error("Pilih minimal 1 kelas");
      return;
    }

    const rooms = previewRooms.length > 0 ? previewRooms : generateRooms();
    if (rooms.length === 0) return;

    try {
      const doc = new jsPDF();
      
      for (let roomIdx = 0; roomIdx < rooms.length; roomIdx++) {
        const room = rooms[roomIdx];
        
        // Add new page for each room except the first
        if (roomIdx > 0) {
          doc.addPage();
        }
        
        // Add letterhead if available (only on first page of each room)
        if (settings) {
          await addLetterheadToPDF(doc, settings);
        }

        let currentY = settings ? 52 : 20;

        // Title
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(`DAFTAR PESERTA UJIAN`, 105, currentY, { align: "center" });
        currentY += 4;
        doc.setFontSize(10);
        doc.text(`RUANG ${room.roomNumber}`, 105, currentY, { align: "center" });
        
        currentY += 5.5;

        // Summary box (more compact)
        doc.setFillColor(245, 247, 250);
        doc.roundedRect(20, currentY, 170, 15, 2, 2, 'F');
        doc.setDrawColor(41, 128, 185);
        doc.setLineWidth(0.5);
        doc.roundedRect(20, currentY, 170, 15, 2, 2);

        // Count by grade
        const gradeCount: Record<number, number> = {};
        const genderCount = { L: 0, P: 0 };
        
        room.seats.forEach(seat => {
          const grade = seat.student.classes.grade;
          gradeCount[grade] = (gradeCount[grade] || 0) + 1;
          
          const gender = seat.student.gender?.toUpperCase();
          if (gender === 'L') genderCount.L++;
          else if (gender === 'P') genderCount.P++;
        });

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(41, 128, 185);
        doc.text("RINGKASAN PESERTA", 25, currentY + 4);
        
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        doc.text(`Total: ${room.seats.length} siswa`, 25, currentY + 7.5);
        doc.text(`L: ${genderCount.L} | P: ${genderCount.P}`, 25, currentY + 11);

        // Grade distribution (compact)
        doc.setFont("helvetica", "bold");
        doc.setTextColor(41, 128, 185);
        doc.text("DISTRIBUSI:", 85, currentY + 3.8);
        
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        let gradeX = 85;
        let gradeY = currentY + 7.5;
        Object.entries(gradeCount).sort().forEach(([grade, count], idx) => {
          doc.text(`Kls ${grade}: ${count}`, gradeX, gradeY);
          if (idx % 2 === 0) {
            gradeX += 28;
          } else {
            gradeX = 85;
            gradeY += 3.5;
          }
        });
        
        currentY += 18;
        
        // Exam info (compact)
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        if (settings?.exam_name) {
          doc.text(settings.exam_name, 105, currentY, { align: "center" });
          currentY += 4;
        }
        doc.text(`TP ${settings?.academic_year || '2024/2025'}`, 105, currentY, { align: "center" });
        
        currentY += 6;

        // Prepare table data for this room
        const tableData = room.seats.map((seat, index) => [
          index + 1,
          toTitleCase(seat.student.full_name),
          seat.examNumber.toString(),
          seat.student.classes.name
        ]);

        // Calculate available space
        const pageHeight = doc.internal.pageSize.height;
        const availableSpace = pageHeight - currentY - 20; // Reserve 20mm for footer
        
        // Adjust font size based on number of rows to fit in one page
        let fontSize = 7.5;
        let cellPadding = 1.8;
        const estimatedRowHeight = fontSize * 0.5 + cellPadding * 2;
        const estimatedTableHeight = (tableData.length + 1) * estimatedRowHeight;
        
        if (estimatedTableHeight > availableSpace) {
          fontSize = 7;
          cellPadding = 1.5;
        }

        // Create table
        autoTable(doc, {
          startY: currentY,
          head: [['No', 'Nama Siswa', 'Nomor Peserta', 'Kelas']],
          body: tableData,
          theme: 'grid',
          headStyles: {
            fillColor: [41, 128, 185],
            textColor: 255,
            fontStyle: 'bold',
            halign: 'center',
            fontSize: fontSize
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 10 },    // No
            1: { halign: 'left', cellWidth: 95 },      // Nama
            2: { halign: 'center', cellWidth: 32 },    // Nopes
            3: { halign: 'center', cellWidth: 20 }     // Kelas
          },
          styles: {
            fontSize: fontSize,
            cellPadding: cellPadding,
            lineWidth: 0.1
          },
          margin: { left: 26.5, right: 26.5 },
          tableWidth: 'auto',
          didDrawPage: (data) => {
            // Ensure we don't overflow to next page
            if (data.pageNumber > 1) {
              console.warn(`Room ${room.roomNumber} overflowed to page ${data.pageNumber}`);
            }
          }
        });

        // Add footer info
        const finalY = (doc as any).lastAutoTable.finalY + 5;
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(`Total Peserta: ${room.seats.length} siswa`, 105, finalY, { align: "center" });
      }

      // Add page numbers
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(
          `Halaman ${i} dari ${totalPages}`,
          105,
          doc.internal.pageSize.height - 6,
          { align: 'center' }
        );
      }

      doc.save(`daftar-peserta-per-ruang-${rooms.length}-ruangan.pdf`);
      toast.success(`Daftar peserta untuk ${rooms.length} ruangan berhasil dicetak`);
    } catch (error) {
      console.error("Error printing room participants:", error);
      toast.error("Gagal mencetak daftar peserta. Silakan coba lagi.");
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Administrasi Ujian</h1>
          <p className="text-muted-foreground">Kelola kartu ujian, denah duduk, dan nomor meja</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pengaturan Ujian</CardTitle>
            <CardDescription>Pilih kelas dan atur denah duduk ujian</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Pilih Kelas</Label>
              <div className="flex gap-2">
                {['7', '8', '9'].map(grade => (
                  <Button
                    key={grade}
                    variant={selectedGrades.includes(grade) ? "default" : "outline"}
                    onClick={() => handleGradeToggle(grade)}
                  >
                    Kelas {grade}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Filter Cetak Kartu Ujian</Label>
              <Select value={filterType} onValueChange={(value: 'all' | 'class' | 'student') => {
                setFilterType(value);
                setSelectedClasses([]);
                setSelectedStudentIds([]);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Siswa</SelectItem>
                  <SelectItem value="class">Kelas Tertentu</SelectItem>
                  <SelectItem value="student">Siswa Tertentu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filterType === 'class' && (
              <div className="space-y-2">
                <Label>Pilih Kelas Spesifik</Label>
                <div className="border rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
                  {Array.from(new Set(
                    students
                      .filter(s => selectedGrades.includes(s.classes.grade.toString()))
                      .map(s => s.classes.name)
                  )).sort().map(className => (
                    <div key={className} className="flex items-center space-x-2">
                      <Checkbox
                        id={`class-${className}`}
                        checked={selectedClasses.includes(className)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedClasses(prev => [...prev, className]);
                          } else {
                            setSelectedClasses(prev => prev.filter(c => c !== className));
                          }
                        }}
                      />
                      <label htmlFor={`class-${className}`} className="text-sm cursor-pointer">
                        Kelas {className}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Dipilih: {selectedClasses.length} kelas
                </p>
              </div>
            )}

            {filterType === 'student' && (
              <div className="space-y-2">
                <Label>Pilih Siswa Spesifik</Label>
                <div className="border rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
                  {students
                    .filter(s => selectedGrades.includes(s.classes.grade.toString()))
                    .sort((a, b) => a.full_name.localeCompare(b.full_name))
                    .map(student => (
                      <div key={student.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`student-${student.id}`}
                          checked={selectedStudentIds.includes(student.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedStudentIds(prev => [...prev, student.id]);
                            } else {
                              setSelectedStudentIds(prev => prev.filter(id => id !== student.id));
                            }
                          }}
                        />
                        <label htmlFor={`student-${student.id}`} className="text-sm cursor-pointer">
                          {toTitleCase(student.full_name)} - {student.classes.name}
                        </label>
                      </div>
                    ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Dipilih: {selectedStudentIds.length} siswa
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Kapasitas Ruangan (Maksimal 32 siswa)</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rows">Jumlah Baris</Label>
                  <Input
                    id="rows"
                    type="number"
                    min="1"
                    max="20"
                    value={rowsCount}
                    onChange={(e) => setRowsCount(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="columns">Jumlah Kolom</Label>
                  <Input
                    id="columns"
                    type="number"
                    min="1"
                    max="10"
                    value={columnsCount}
                    onChange={(e) => setColumnsCount(parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Total kursi per ruangan: {rowsCount * columnsCount} | 
                Siswa terpilih: {students.filter(s => selectedGrades.includes(s.classes.grade.toString())).length} |
                Urutan: Berdasarkan NIS
              </p>
            </div>

            <div className="space-y-2">
              <Label>Mode Penyusunan Denah Duduk</Label>
              <Select value={seatingMode} onValueChange={(v: any) => setSeatingMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Otomatis (lama: per rombel hanya jika 1 kelas dipilih)</SelectItem>
                  <SelectItem value="alternating">Berselang-seling antar kelas</SelectItem>
                  <SelectItem value="by_class">Per Rombel (1 ruang = 1 kelas)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Pilih cara penyusunan: pengaturan lama atau pembaruan terbaru.
              </p>
            </div>

            <div className="space-y-2 border rounded-md p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-base">Pengaturan Kartu Ujian</Label>
                <Button type="button" size="sm" variant="outline" onClick={saveExamCardSettings}>
                  Simpan Pengaturan
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Ukuran Kartu</Label>
                <Select value={cardSize} onValueChange={(value: any) => setCardSize(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">63mm x 103mm (Portrait)</SelectItem>
                    <SelectItem value="landscape">85mm x 54mm (Kartu Kredit)</SelectItem>
                    <SelectItem value="10x8">100mm x 80mm (10cm x 8cm)</SelectItem>
                    <SelectItem value="custom">Kustom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {cardSize === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Lebar (mm)</Label>
                    <Input type="number" min={40} max={200}
                      value={customCardWidth}
                      onChange={(e) => setCustomCardWidth(parseInt(e.target.value) || 85)} />
                  </div>
                  <div>
                    <Label>Tinggi (mm)</Label>
                    <Input type="number" min={30} max={200}
                      value={customCardHeight}
                      onChange={(e) => setCustomCardHeight(parseInt(e.target.value) || 54)} />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Skala Tulisan: {fontScale.toFixed(2)}x</Label>
                <Input type="range" min={0.7} max={1.6} step={0.05}
                  value={fontScale}
                  onChange={(e) => setFontScale(parseFloat(e.target.value))} />
                <p className="text-xs text-muted-foreground">
                  Atur 0.7x – 1.6x. Semua tulisan, tabel jadwal, dan tanda tangan diskalakan otomatis.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <Label>Nomor Peserta Awal (5 digit pertama)</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startingExamNumberGrade7">Kelas 7</Label>
                  <Input
                    id="startingExamNumberGrade7"
                    type="number"
                    min="10000"
                    max="99999"
                    value={startingExamNumberGrade7}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 25267;
                      if (value >= 10000 && value <= 99999) {
                        setStartingExamNumberGrade7(value);
                      }
                    }}
                    placeholder="25267"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startingExamNumberGrade8">Kelas 8</Label>
                  <Input
                    id="startingExamNumberGrade8"
                    type="number"
                    min="10000"
                    max="99999"
                    value={startingExamNumberGrade8}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 25268;
                      if (value >= 10000 && value <= 99999) {
                        setStartingExamNumberGrade8(value);
                      }
                    }}
                    placeholder="25268"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startingExamNumberGrade9">Kelas 9</Label>
                  <Input
                    id="startingExamNumberGrade9"
                    type="number"
                    min="10000"
                    max="99999"
                    value={startingExamNumberGrade9}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 25269;
                      if (value >= 10000 && value <= 99999) {
                        setStartingExamNumberGrade9(value);
                      }
                    }}
                    placeholder="25269"
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Nomor peserta 8 digit: 5 digit awal sesuai kelas + 3 digit urut otomatis (contoh: Kelas 7: 25267001, 25267002... | Kelas 8: 25268001, 25268002...)
              </p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleGeneratePreview}
                disabled={isLoading || selectedGrades.length === 0}
                className="w-full"
                variant="secondary"
              >
                <Users className="mr-2 h-4 w-4" />
                Generate Preview Semua
              </Button>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button
                  onClick={() => setShowCardPreview(true)}
                  disabled={isLoading || selectedGrades.length === 0 || previewRooms.length === 0}
                  className="w-full"
                  variant="outline"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Preview Kartu Ujian
                </Button>
                
                <Button
                  onClick={handlePrintExamCards}
                  disabled={isLoading || selectedGrades.length === 0}
                  className="w-full"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Cetak Semua Kartu Ujian
                </Button>
                
                <Button
                  onClick={handlePrintSeatingChart}
                  disabled={isLoading || selectedGrades.length === 0}
                  className="w-full"
                >
                  <Grid3x3 className="mr-2 h-4 w-4" />
                  Cetak Semua Denah Duduk
                </Button>
                
                <Button
                  onClick={handlePrintTableNumbers}
                  disabled={isLoading || selectedGrades.length === 0}
                  className="w-full"
                >
                  <Hash className="mr-2 h-4 w-4" />
                  Cetak Semua Nomor Meja
                </Button>

                <Button
                  onClick={handlePrintRoomComposition}
                  disabled={isLoading || selectedGrades.length === 0}
                  className="w-full"
                  variant="secondary"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Cetak Rekap Komposisi Ruangan
                </Button>

                <Button
                  onClick={handlePrintRoomParticipants}
                  disabled={isLoading || selectedGrades.length === 0}
                  className="w-full"
                  variant="secondary"
                >
                  <Users className="mr-2 h-4 w-4" />
                  Cetak Daftar Peserta per Ruang
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {previewRooms.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                Total {previewRooms.length} ruangan | {previewRooms.reduce((acc, r) => acc + r.seats.length, 0)} siswa
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activePreview} onValueChange={(v) => setActivePreview(v as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="seating">
                    <Grid3x3 className="mr-2 h-4 w-4" />
                    Denah Duduk
                  </TabsTrigger>
                  <TabsTrigger value="cards">
                    <Printer className="mr-2 h-4 w-4" />
                    Kartu Ujian
                  </TabsTrigger>
                  <TabsTrigger value="numbers">
                    <Hash className="mr-2 h-4 w-4" />
                    Nomor Meja
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="seating" className="space-y-8">
                  {previewRooms.map((room) => (
                    <div key={room.roomNumber} className="border-2 border-border rounded-lg p-8 bg-background shadow-xl">
                      {/* Modern Header Section - Kop Surat */}
                      <div className="mb-6 pb-4">
                        <div className="flex items-center justify-between mb-3">
                          {settings?.logo_url && (
                            <img 
                              src={settings.logo_url} 
                              alt="Logo" 
                              className="w-14 h-14 object-contain"
                            />
                          )}
                          {settings?.right_logo_url && (
                            <img 
                              src={settings.right_logo_url} 
                              alt="Logo Kanan" 
                              className="w-14 h-14 object-contain"
                            />
                          )}
                        </div>
                        
                        <div className="text-center space-y-1">
                          {settings?.district_name && (
                            <div className="text-sm font-bold uppercase text-muted-foreground">{settings.district_name}</div>
                          )}
                          <div className="text-xl font-bold uppercase">{settings?.school_name || "NAMA SEKOLAH"}</div>
                          <div className="text-xs text-muted-foreground">
                            {settings?.school_address && settings?.school_phone 
                              ? `${settings.school_address} | Telp: ${settings.school_phone}`
                              : settings?.school_address || ''
                            }
                          </div>
                        </div>
                        
                        {/* Modern separator lines */}
                        <div className="mt-3 space-y-0.5">
                          <div className="h-0.5 bg-primary/60"></div>
                          <div className="h-px bg-border"></div>
                        </div>
                      </div>

                      {/* Title Section with modern styling */}
                      <div className="text-center space-y-2 mb-6">
                        <h2 className="text-2xl font-bold text-primary">DENAH TEMPAT DUDUK PESERTA</h2>
                        <p className="text-xs text-muted-foreground">{settings?.exam_name || "PENILAIAN SUMATIF AKHIR TAHUN (PSAT)"}</p>
                        <p className="text-xs text-muted-foreground">Tahun Ajaran {settings?.academic_year || "2024/2025"}</p>
                        <div className="inline-flex items-center justify-center px-6 py-1.5 bg-primary text-primary-foreground rounded-md font-bold text-sm mt-3">
                          RUANG {room.roomNumber}
                        </div>
                      </div>
                      
                      {/* Distribution Visualization */}
                      {(() => {
                        const gradeDistribution: Record<number, number> = {};
                        const classDistribution: Record<string, number> = {};
                        const genderDistribution: Record<string, number> = { L: 0, P: 0 };
                        
                        room.seats.forEach(seat => {
                          const grade = seat.student.classes.grade;
                          const className = seat.student.classes.name;
                          const gender = seat.student.gender || 'L';
                          
                          gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
                          classDistribution[className] = (classDistribution[className] || 0) + 1;
                          genderDistribution[gender] = (genderDistribution[gender] || 0) + 1;
                        });
                        
                        return (
                          <div className="mb-4 p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                            <div className="grid md:grid-cols-3 gap-4">
                              {/* Grade Distribution */}
                              <div>
                                <div className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                                  <Users className="h-4 w-4 text-primary" />
                                  Distribusi Per Tingkat
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(gradeDistribution).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, count]) => (
                                    <div 
                                      key={grade}
                                      className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-md border border-border shadow-sm"
                                    >
                                      <span className="text-xs font-bold text-primary">Kelas {grade}</span>
                                      <span className="text-xs font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                                        {count}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Class Distribution */}
                              <div>
                                <div className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                                  <Grid3x3 className="h-4 w-4 text-primary" />
                                  Distribusi Per Kelas
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(classDistribution).sort(([a], [b]) => a.localeCompare(b)).map(([className, count]) => {
                                    const color = getClassColor(className);
                                    return (
                                      <div 
                                        key={className}
                                        className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-md border border-border shadow-sm"
                                      >
                                        <div 
                                          className="w-3 h-3 rounded-full border border-border"
                                          style={{ backgroundColor: color.hex }}
                                        />
                                        <span className="text-xs font-bold">{className}</span>
                                        <span className="text-xs font-semibold bg-muted text-foreground px-2 py-0.5 rounded-full">
                                          {count}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              
                              {/* Gender Distribution */}
                              <div>
                                <div className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                                  <Users className="h-4 w-4 text-primary" />
                                  Jenis Kelamin
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-md border border-border shadow-sm">
                                    <span className="text-xs font-bold text-blue-600">Laki-laki</span>
                                    <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                      {genderDistribution.L || 0}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-md border border-border shadow-sm">
                                    <span className="text-xs font-bold text-pink-600">Perempuan</span>
                                    <span className="text-xs font-semibold bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">
                                      {genderDistribution.P || 0}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Total Summary */}
                            <div className="mt-3 pt-3 border-t border-primary/20">
                              <div className="text-xs text-muted-foreground text-center">
                                Total: <span className="font-bold text-foreground">{room.seats.length} siswa</span> dari 
                                <span className="font-bold text-foreground"> {Object.keys(gradeDistribution).length} tingkat</span> dan 
                                <span className="font-bold text-foreground"> {Object.keys(classDistribution).length} kelas</span>
                                {' • '}
                                <span className="font-bold text-blue-600">{genderDistribution.L || 0} L</span>
                                {' / '}
                                <span className="font-bold text-pink-600">{genderDistribution.P || 0} P</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* Color Legend */}
                      {(() => {
                        const uniqueClasses = Array.from(new Set(room.seats.map(s => s.student.classes.name))).sort();
                        return uniqueClasses.length > 0 && (
                          <div className="mb-4 p-3 bg-muted/30 rounded-md">
                            <div className="text-xs font-bold text-muted-foreground mb-2">Legenda Kelas:</div>
                            <div className="flex flex-wrap gap-3">
                              {uniqueClasses.map((className) => {
                                const color = getClassColor(className);
                                return (
                                  <div key={className} className="flex items-center gap-1.5">
                                    <div 
                                      className="w-4 h-4 rounded border border-border"
                                      style={{ backgroundColor: color.hex, opacity: 0.7 }}
                                    />
                                    <span className="text-xs font-medium">{className}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      
                      {/* Supervisor - modern style */}
                      <div className="mb-5">
                        <div className="bg-foreground/90 text-background p-2 rounded-sm">
                          <div className="text-center font-bold text-xs tracking-wide">▼ PENGAWAS ▼</div>
                        </div>
                      </div>
                      
                      {/* Modern Seating Grid - optimized for 8 columns */}
                      <div 
                        className="grid gap-1.5 mx-auto mb-6"
                        style={{
                          gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))`,
                          maxWidth: `${columnsCount * (columnsCount >= 8 ? 110 : 140)}px`
                        }}
                      >
                        {Array.from({ length: rowsCount * columnsCount }).map((_, index) => {
                          // Calculate row and column from index
                          const row = Math.floor(index / columnsCount);
                          const col = index % columnsCount;
                          
                          // Calculate table number in snake pattern for this position
                          let tableNumber: number;
                          if (row % 2 === 0) {
                            // Even row: left to right
                            tableNumber = row * columnsCount + col + 1;
                          } else {
                            // Odd row: right to left
                            tableNumber = (row + 1) * columnsCount - col;
                          }
                          
                          const seat = room.seats.find(s => s.tableNumber === tableNumber);
                          const classColor = seat ? getClassColor(seat.student.classes.name) : null;
                          
                          return (
                            <div
                              key={index}
                              className={`border rounded-sm overflow-hidden transition-all ${
                                seat 
                                  ? 'border-border hover:shadow-md hover:scale-105' 
                                  : 'border-dashed border-muted-foreground/20 bg-muted/5'
                              }`}
                              style={{
                                minHeight: columnsCount >= 8 ? '90px' : '110px',
                                backgroundColor: classColor ? `${classColor.hex}20` : undefined
                              }}
                            >
                              {/* Exam Number Badge - modern gradient style */}
                              <div className={`px-2 py-1 text-center text-[10px] font-bold ${
                                seat ? 'bg-primary text-primary-foreground' : 'bg-muted/50'
                              }`}>
                                {index + 1}
                              </div>
                              
                              {seat ? (
                                <div className={`p-1.5 space-y-0.5 text-center ${columnsCount >= 8 ? 'text-[10px]' : 'text-xs'}`}>
                                  {/* Student Name - optimized for small cells */}
                                  <div className="font-bold line-clamp-2 leading-tight">
                                    {columnsCount >= 8 
                                      ? toTitleCase(seat.student.full_name).split(' ').length > 2
                                        ? `${toTitleCase(seat.student.full_name).split(' ')[0]} ${toTitleCase(seat.student.full_name).split(' ').slice(-1)[0]}`.substring(0, 12)
                                        : toTitleCase(seat.student.full_name).substring(0, 12)
                                      : toTitleCase(seat.student.full_name)
                                    }
                                  </div>
                                  
                                  {/* Gender - without symbols, matching PDF */}
                                  <div className={`${columnsCount >= 8 ? 'text-[8px]' : 'text-[9px]'} ${
                                    (seat.student.gender || 'L') === 'L' ? 'text-blue-600' : 'text-pink-600'
                                  }`}>
                                    {(seat.student.gender || 'L') === 'L' ? 'Laki-laki' : 'Perempuan'}
                                  </div>
                                  
                                  {/* Exam Number */}
                                  <div className={`font-bold ${columnsCount >= 8 ? 'text-[9px]' : 'text-[10px]'}`}>
                                    No: {seat.examNumber}
                                  </div>
                                  
                                  {/* Class Badge - modern style */}
                                  <div className={`inline-block px-1.5 py-0.5 bg-muted rounded-sm font-semibold text-primary ${columnsCount >= 8 ? 'text-[9px]' : 'text-[10px]'}`}>
                                    {seat.student.classes.name}
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2 h-full flex items-center justify-center">
                                  <span className="text-[10px] text-muted-foreground">•</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="cards" className="space-y-4">
                  {previewRooms.map((room) => (
                    <div key={room.roomNumber} className="space-y-4">
                      <h3 className="text-lg font-semibold">Ruang {room.roomNumber}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {room.seats.map((seat) => (
                          <div 
                            key={seat.tableNumber}
                            className="border-2 border-primary rounded-lg p-4 space-y-2"
                          >
                            <div className="text-lg font-bold">Ruang {room.roomNumber} - Meja {seat.tableNumber}</div>
                            <div className="space-y-1 text-sm">
                              <p><strong>No. Peserta:</strong> {seat.examNumber}</p>
                              <p><strong>NIS:</strong> {seat.student.nis}</p>
                              <p><strong>Nama:</strong> {toTitleCase(seat.student.full_name)}</p>
                              <p><strong>Kelas:</strong> {seat.student.classes.name}</p>
                            </div>
                            <div className="pt-4 border-t">
                              <p className="text-xs text-muted-foreground">Tanda Tangan Peserta:</p>
                              <div className="mt-2 border-b border-dashed border-muted-foreground/50"></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="numbers" className="space-y-4">
                  {previewRooms.map((room) => (
                    <div key={room.roomNumber} className="space-y-4">
                      <h3 className="text-lg font-semibold">Ruang {room.roomNumber}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {room.seats.map((seat) => (
                          <div 
                            key={seat.tableNumber}
                            className="border-2 border-primary rounded-lg p-6 flex flex-col items-center justify-center aspect-square"
                          >
                            <div className="text-sm font-medium text-muted-foreground mb-2">
                              Ruang {room.roomNumber}
                            </div>
                            <div className="text-5xl font-bold">
                              {seat.tableNumber}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>

              <div className="mt-6 flex justify-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary bg-primary/5"></div>
                  <span className="text-sm">Terisi</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-dashed border-muted-foreground/30 bg-muted/20"></div>
                  <span className="text-sm">Kosong</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Informasi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Kartu Ujian:</strong> Mencetak kartu peserta untuk setiap siswa dengan nomor ruangan, nomor meja, NIS, nama, dan kelas.</p>
            <p><strong>Denah Duduk:</strong> Mencetak peta ruangan dengan posisi duduk setiap siswa untuk semua ruangan yang diperlukan.</p>
            <p><strong>Nomor Meja:</strong> Mencetak 30 nomor meja per halaman F4 (5 kolom x 6 baris) dengan desain modern yang menampilkan ruang, nomor meja, nama peserta, nomor peserta, dan kelas. Kartu dapat ditempel di setiap meja ujian.</p>
            <p><strong>Rekap Komposisi Ruangan:</strong> Mencetak rekap lengkap semua peserta ujian yang diurutkan berdasarkan kelas, termasuk statistik distribusi siswa per ruangan.</p>
            <p><strong>Daftar Peserta per Ruang:</strong> Mencetak daftar peserta untuk setiap ruangan secara terpisah, lengkap dengan ringkasan peserta (total, distribusi gender, dan distribusi kelas). Setiap ruangan dicetak dalam halaman tersendiri.</p>
            <p className="text-muted-foreground">
              <strong>Urutan Penyusunan:</strong> Siswa disusun secara berselang-seling antara kelas 7, 8, dan 9 untuk memastikan tidak ada siswa sekelas yang duduk bersebelahan (samping kiri atau atas). 
              Dalam setiap tingkat kelas, siswa diurutkan berdasarkan kelas (A, B, C, dst) dan nama alfabetis.
              Setiap ruangan berkapasitas maksimal {rowsCount * columnsCount} siswa. Jika siswa lebih dari kapasitas satu ruangan, secara otomatis akan dibagi ke ruangan berikutnya.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Exam Card Preview Dialog */}
      <Dialog open={showCardPreview} onOpenChange={setShowCardPreview}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Preview Kartu Ujian
            </DialogTitle>
            <DialogDescription>
              Menampilkan 6 contoh kartu ujian pertama. Kartu ujian akan dicetak dalam format F4 dengan 10 kartu per halaman.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 mt-4">
            {previewRooms.slice(0, 2).flatMap(room => 
              room.seats.slice(0, 3).map(seat => {
                const examSchedule = ((settings as any)?.exam_schedule as Array<{
                  no: number;
                  day: string;
                  date: string;
                  subject: string;
                  time: string;
                  duration: string;
                }>) || [];
                
                return (
                  <div 
                    key={`${room.roomNumber}-${seat.tableNumber}`}
                    className="border-2 border-primary rounded-lg p-4 bg-background shadow-md"
                  >
                    {/* Mini Letterhead */}
                    <div className="flex items-start gap-3 mb-3 pb-3 border-b">
                      {settings?.logo_url && (
                        <img src={settings.logo_url} alt="Logo" className="w-10 h-10 object-contain" />
                      )}
                      <div className="flex-1 text-center">
                        {settings?.district_name && (
                          <div className="text-[10px] font-bold text-muted-foreground">
                            {settings.district_name}
                          </div>
                        )}
                        {settings?.school_name && (
                          <div className="text-xs font-bold">{settings.school_name}</div>
                        )}
                        {settings?.school_address && (
                          <div className="text-[9px] text-muted-foreground">{settings.school_address}</div>
                        )}
                      </div>
                      {settings?.right_logo_url && (
                        <img src={settings.right_logo_url} alt="Logo Kanan" className="w-10 h-10 object-contain" />
                      )}
                    </div>

                    {/* Exam Title */}
                    <div className="text-center mb-3">
                      <div className="text-sm font-bold text-primary">
                        KARTU PESERTA
                      </div>
                      {settings?.exam_name && (
                        <div className="text-xs font-bold text-foreground mt-1">
                          {settings.exam_name}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Tahun Pelajaran {settings?.academic_year || "2024/2025"}
                      </div>
                    </div>

                    {/* Room and Table Info */}
                    <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md mb-3 flex justify-between text-xs font-bold">
                      <span>RUANG {room.roomNumber}</span>
                      <span>MEJA: {seat.tableNumber}</span>
                    </div>

                    {/* Student Info + Photo */}
                    <div className="flex gap-3 mb-3">
                      <div className="flex-1 space-y-1.5 text-xs">
                        <div className="flex">
                          <span className="font-bold w-24">No. Peserta:</span>
                          <span>{seat.examNumber}</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold w-24">NIS:</span>
                          <span>{seat.student.nis}</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold w-24">NISN:</span>
                          <span>{seat.student.nisn || '-'}</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold w-24">Nama:</span>
                          <span className="break-words leading-tight">{toTitleCase(seat.student.full_name)}</span>
                        </div>
                        <div className="flex">
                          <span className="font-bold w-24">TTL:</span>
                          <span className="break-words">
                            {[seat.student.birth_place, seat.student.birth_date ? formatDateWithMonthName(new Date(seat.student.birth_date)) : ''].filter(Boolean).join(', ') || '-'}
                          </span>
                        </div>
                        <div className="flex">
                          <span className="font-bold w-24">Kelas:</span>
                          <span>{seat.student.classes.name}</span>
                        </div>
                      </div>
                      {/* Photo Frame */}
                      <div className="w-[72px] h-[96px] shrink-0 border-2 border-foreground rounded-sm overflow-hidden bg-muted flex items-center justify-center">
                        {seat.student.photo_url ? (
                          <img
                            src={seat.student.photo_url}
                            alt={seat.student.full_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-[8px] text-muted-foreground text-center px-1">
                            Foto<br />3x4
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Exam Schedule */}
                    {examSchedule.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-bold text-primary mb-2 text-center">
                          JADWAL UJIAN
                        </div>
                        <div className="border-2 border-foreground rounded overflow-hidden">
                          <table className="w-full text-[8px] border-collapse">
                            <thead>
                              <tr className="bg-primary/10">
                                <th className="border-r-2 border-b-2 border-foreground p-1 text-center font-bold w-7">No</th>
                                <th className="border-r-2 border-b-2 border-foreground p-1 text-left font-bold">Hari/Tgl</th>
                                <th className="border-r-2 border-b-2 border-foreground p-1 text-left font-bold">Mapel</th>
                                <th className="border-r-2 border-b-2 border-foreground p-1 text-center font-bold w-14">Pukul</th>
                                <th className="border-b-2 border-foreground p-1 text-center font-bold w-16">Durasi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {examSchedule.slice(0, 5).map((schedule, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                                  <td className="border-r-2 border-t border-foreground p-1 text-center font-semibold">{schedule.no}</td>
                                  <td className="border-r-2 border-t border-foreground p-1">{schedule.day}, {schedule.date}</td>
                                  <td className="border-r-2 border-t border-foreground p-1">{schedule.subject}</td>
                                  <td className="border-r-2 border-t border-foreground p-1 text-center text-[7px]">{schedule.time}</td>
                                  <td className="border-t border-foreground p-1 text-center text-[7px]">
                                    {schedule.duration.includes(':') 
                                      ? (parseInt(schedule.duration.split(':')[0]) * 60 + parseInt(schedule.duration.split(':')[1])).toString()
                                      : schedule.duration} Menit
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {examSchedule.length > 5 && (
                            <div className="text-[8px] text-center text-muted-foreground p-1 bg-muted/20 border-t-2 border-foreground">
                              ... dan {examSchedule.length - 5} sesi lainnya
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Signature Section */}
                    <div className="pt-2 border-t mt-auto">
                      <div className="text-right">
                        <div className="text-[9px]">Ciamis, {formatDateWithMonthName(new Date())}</div>
                        <div className="text-[9px] mb-8">{(settings as any)?.headmaster_position || 'Kepala Sekolah'}</div>
                        <div className="text-[9px] font-bold">
                          {settings?.headmaster_name || "___________________"}
                        </div>
                        {settings?.headmaster_nip && (
                          <div className="text-[8px] text-muted-foreground">
                            NIP. {settings.headmaster_nip}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 text-sm text-muted-foreground text-center">
            Ini adalah preview untuk verifikasi tampilan. Klik "Cetak Semua Kartu Ujian" untuk mencetak semua kartu.
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ExamAdministration;
