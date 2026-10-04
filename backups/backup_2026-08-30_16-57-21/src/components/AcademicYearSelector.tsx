import { useAcademicYear } from '@/contexts/AcademicYearContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from 'lucide-react';

export const AcademicYearSelector = () => {
  const { 
    selectedYear, 
    setSelectedYear, 
    selectedSemester, 
    setSelectedSemester, 
    availableYears, 
    isLoading 
  } = useAcademicYear();

  if (isLoading || availableYears.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <Select value={selectedYear || undefined} onValueChange={setSelectedYear}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Pilih tahun pelajaran" />
        </SelectTrigger>
        <SelectContent>
          {availableYears.map((year) => (
            <SelectItem key={year.id} value={year.year}>
              {year.year} {year.is_active && '(Aktif)'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <Select 
        value={selectedSemester.toString()} 
        onValueChange={(value) => setSelectedSemester(parseInt(value))}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Pilih semester" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Semester Ganjil</SelectItem>
          <SelectItem value="2">Semester Genap</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};