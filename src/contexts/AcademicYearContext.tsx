import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AcademicYear {
  id: string;
  year: string;
  is_active: boolean;
}

interface AcademicYearContextType {
  selectedYear: string | null;
  setSelectedYear: (year: string) => void;
  selectedSemester: number;
  setSelectedSemester: (semester: number) => void;
  availableYears: AcademicYear[];
  activeYear: AcademicYear | null;
  isLoading: boolean;
}

const AcademicYearContext = createContext<AcademicYearContextType | undefined>(undefined);

export const AcademicYearProvider = ({ children }: { children: ReactNode }) => {
  const [selectedYear, setSelectedYearState] = useState<string | null>(null);
  const [selectedSemester, setSelectedSemesterState] = useState<number>(1);
  const [availableYears, setAvailableYears] = useState<AcademicYear[]>([]);
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAcademicYears();
  }, []);

  const loadAcademicYears = async () => {
    try {
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .order('year', { ascending: false });

      if (error) throw error;

      setAvailableYears(data || []);
      
      // Find active year
      const active = data?.find(y => y.is_active);
      setActiveYear(active || null);

      // Load saved year from localStorage or use active year
      const savedYear = localStorage.getItem('selectedAcademicYear');
      const savedSemester = localStorage.getItem('selectedSemester');
      const savedIsValid = savedYear && (data || []).some((y) => y.year === savedYear);

      if (savedIsValid) {
        setSelectedYearState(savedYear!);
      } else if (active) {
        setSelectedYearState(active.year);
        localStorage.setItem('selectedAcademicYear', active.year);
      } else if (data && data.length > 0) {
        setSelectedYearState(data[0].year);
        localStorage.setItem('selectedAcademicYear', data[0].year);
      }
      
      // Load semester from localStorage or use default from settings
      if (savedSemester) {
        setSelectedSemesterState(parseInt(savedSemester));
      } else {
        // Load default semester from school settings
        const { data: settings } = await supabase
          .from('school_settings')
          .select('active_semester')
          .limit(1)
          .maybeSingle();
        
        const defaultSemester = (settings as any)?.active_semester || 1;
        setSelectedSemesterState(defaultSemester);
        localStorage.setItem('selectedSemester', defaultSemester.toString());
      }
    } catch (error) {
      console.error('Error loading academic years:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setSelectedYear = (year: string) => {
    setSelectedYearState(year);
    localStorage.setItem('selectedAcademicYear', year);
  };

  const setSelectedSemester = (semester: number) => {
    setSelectedSemesterState(semester);
    localStorage.setItem('selectedSemester', semester.toString());
  };

  return (
    <AcademicYearContext.Provider
      value={{
        selectedYear,
        setSelectedYear,
        selectedSemester,
        setSelectedSemester,
        availableYears,
        activeYear,
        isLoading,
      }}
    >
      {children}
    </AcademicYearContext.Provider>
  );
};

export const useAcademicYear = () => {
  const context = useContext(AcademicYearContext);
  if (context === undefined) {
    throw new Error('useAcademicYear must be used within an AcademicYearProvider');
  }
  return context;
};