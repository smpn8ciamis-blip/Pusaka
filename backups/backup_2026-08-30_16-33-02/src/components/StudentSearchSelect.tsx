import { useState, useMemo, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Search, X, User } from 'lucide-react';

interface Student {
  id: string;
  full_name: string;
  nis: string;
  nisn?: string | null;
  classes?: {
    name: string;
  } | null;
}

interface StudentSearchSelectProps {
  students: Student[];
  value: string;
  onChange: (studentId: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export function StudentSearchSelect({
  students,
  value,
  onChange,
  placeholder = "Ketik nama atau NIS siswa...",
  label,
  required = false,
  disabled = false,
}: StudentSearchSelectProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get selected student
  const selectedStudent = useMemo(() => {
    return students.find(s => s.id === value);
  }, [students, value]);

  // Filter students based on search
  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students.slice(0, 50); // Limit initial display
    
    const searchLower = search.toLowerCase();
    return students.filter((student) => {
      return (
        student.full_name.toLowerCase().includes(searchLower) ||
        student.nis.toLowerCase().includes(searchLower) ||
        (student.nisn && student.nisn.toLowerCase().includes(searchLower)) ||
        (student.classes?.name && student.classes.name.toLowerCase().includes(searchLower))
      );
    }).slice(0, 50); // Limit results
  }, [students, search]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle selection
  const handleSelect = (student: Student) => {
    onChange(student.id);
    setSearch('');
    setIsOpen(false);
  };

  // Handle clear
  const handleClear = () => {
    onChange('');
    setSearch('');
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      <div ref={containerRef} className="relative">
        {/* Selected Student Display */}
        {selectedStudent && !isOpen ? (
          <div 
            className={cn(
              "flex items-center justify-between gap-2 px-3 py-2 border rounded-md bg-background cursor-pointer",
              "hover:bg-accent/50 transition-colors",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => !disabled && setIsOpen(true)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate font-medium">{selectedStudent.full_name}</span>
              <span className="text-muted-foreground text-sm shrink-0">
                {selectedStudent.nis} • {selectedStudent.classes?.name || 'Tanpa Kelas'}
              </span>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setIsOpen(true)}
                disabled={disabled}
                className="pl-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Dropdown */}
            {isOpen && (
              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                {filteredStudents.length === 0 ? (
                  <div className="px-3 py-6 text-center text-muted-foreground">
                    {search ? (
                      <>
                        <p className="font-medium">Siswa tidak ditemukan</p>
                        <p className="text-sm">Coba kata kunci lain</p>
                      </>
                    ) : (
                      <p>Ketik untuk mencari siswa...</p>
                    )}
                  </div>
                ) : (
                  <>
                    {search === '' && (
                      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 border-b">
                        Menampilkan 50 siswa pertama. Ketik untuk mencari lebih spesifik.
                      </div>
                    )}
                    {filteredStudents.map((student) => (
                      <div
                        key={student.id}
                        className={cn(
                          "px-3 py-2 cursor-pointer hover:bg-accent flex items-center gap-2",
                          value === student.id && "bg-accent"
                        )}
                        onClick={() => handleSelect(student)}
                      >
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{student.full_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {student.nis} • {student.classes?.name || 'Tanpa Kelas'}
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredStudents.length === 50 && search !== '' && (
                      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 border-t text-center">
                        Terlalu banyak hasil. Ketik lebih spesifik untuk mempersempit pencarian.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Hidden input for form validation */}
        <input type="hidden" name="student_id" value={value} required={required} />
      </div>
    </div>
  );
}
