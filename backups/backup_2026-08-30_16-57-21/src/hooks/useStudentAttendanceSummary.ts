import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/contexts/AcademicYearContext";

export interface AttendancePeriod {
  year: string;
  semester: number;
  start: string;
  end: string;
}

export const semesterRange = (year: string, semester: number) => {
  const [a, b] = year.split("/").map((v) => parseInt(v.trim(), 10));
  const startYear = isNaN(a) ? new Date().getFullYear() : a;
  const endYear = isNaN(b) ? startYear + 1 : b;
  return semester === 2 
    ? { start: `${endYear}-01-01`, end: `${endYear}-06-30` }
    : { start: `${startYear}-07-01`, end: `${startYear}-12-31` };
};

export const useActivePeriod = () => {
  return useQuery({
    queryKey: ["active-academic-period"],
    queryFn: async (): Promise<AttendancePeriod | null> => {
      const [{ data: year }, { data: settings }] = await Promise.all([
        supabase.from("academic_years").select("year").eq("is_active", true).maybeSingle(),
        supabase.from("school_settings").select("active_semester").limit(1).maybeSingle(),
      ]);
      if (!year?.year) return null;
      const semester = Number((settings as any)?.active_semester ?? 1) || 1;
      return { year: year.year, semester, ...semesterRange(year.year, semester) };
    },
    staleTime: 10 * 60 * 1000,
  });
};

export const useSelectedPeriod = (): AttendancePeriod | null => {
  const { selectedYear, selectedSemester, activeYear } = useAcademicYear();
  const year = selectedYear || activeYear?.year || null;
  return useMemo(() => { 
    if (!year) return null; 
    return { year, semester: selectedSemester, ...semesterRange(year, selectedSemester) }; 
  }, [year, selectedSemester]);
};

export interface StudentAttendanceSummary {
  hadir: number;
  terlambat: number;
  sakit: number;
  izin: number;
  alpa: number;
  total: number;
}

export const useStudentAttendanceSummary = (studentId?: string, period?: AttendancePeriod | null) => {
  return useQuery({
    queryKey: ["student-attendance-summary", studentId, period?.year, period?.semester],
    queryFn: async (): Promise<StudentAttendanceSummary> => {
      const empty = { hadir: 0, terlambat: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
      if (!studentId || !period) return empty;
      
      const [{ data: manual }, { data: rfid }] = await Promise.all([
        supabase
          .from("attendance")
          .select("status, date, schedules!inner(academic_year, semester)")
          .eq("student_id", studentId)
          .eq("schedules.academic_year", period.year)
          .eq("schedules.semester", period.semester),
        supabase
          .from("rfid_attendance")
          .select("status, date")
          .eq("student_id", studentId)
          .gte("date", period.start)
          .lte("date", period.end),
      ]);
      
      const byDate = new Map<string, string>();
      (manual ?? []).forEach((r: any) => { 
        if (r?.date && r?.status) byDate.set(r.date, String(r.status).toLowerCase()); 
      });
      (rfid ?? []).forEach((r: any) => { 
        if (r?.date && !byDate.has(r.date)) byDate.set(r.date, String(r.status).toLowerCase()); 
      });
      
      const summary = { ...empty };
      byDate.forEach((status) => {
        if (status === "terlambat") { 
          summary.terlambat++; 
          summary.hadir++; // ✅ Terlambat = Hadir
        } else if (status in summary) { 
          (summary as any)[status]++; 
        }
      });
      summary.total = byDate.size;
      return summary;
    },
    enabled: !!studentId && !!period,
  });
};