import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Schedule {
  id: string;
  subject: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  classes?: { name: string; grade: number };
  teachers?: { user_id: string };
}

interface WeeklyScheduleCalendarProps {
  schedules: Schedule[];
  profiles?: Array<{ id: string; full_name: string }>;
  selectedClass?: string;
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const TIME_SLOTS = [
  '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00'
];

const COLORS = [
  'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20',
  'bg-secondary/10 border-secondary/30 text-secondary-foreground hover:bg-secondary/20',
  'bg-accent/10 border-accent/30 text-accent-foreground hover:bg-accent/20',
  'bg-muted/30 border-muted-foreground/30 text-foreground hover:bg-muted/40',
  'bg-success/10 border-success/30 text-success hover:bg-success/20',
  'bg-warning/10 border-warning/30 text-warning hover:bg-warning/20',
];

export const WeeklyScheduleCalendar = ({ schedules, profiles, selectedClass }: WeeklyScheduleCalendarProps) => {
  const getTeacherName = (schedule: Schedule) => {
    if (schedule.teachers) {
      const profile = profiles?.find((p) => p.id === schedule.teachers?.user_id);
      return profile?.full_name || '-';
    }
    return '-';
  };

  const getColorForSubject = (subject: string) => {
    const hash = subject.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return COLORS[hash % COLORS.length];
  };

  const timeToMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const getSchedulePosition = (startTime: string, endTime: string) => {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const firstSlotMinutes = timeToMinutes(TIME_SLOTS[0]);
    
    const topPosition = ((startMinutes - firstSlotMinutes) / 30) * 3.5; // 3.5rem per 30min slot
    const height = ((endMinutes - startMinutes) / 30) * 3.5;
    
    return { top: `${topPosition}rem`, height: `${height}rem` };
  };

  const getSchedulesForDay = (dayOfWeek: number) => {
    return schedules.filter(s => s.day_of_week === dayOfWeek);
  };

  const getSchedulesForDayAndClass = (dayOfWeek: number, classId: string) => {
    return schedules.filter(s => s.day_of_week === dayOfWeek && s.classes?.name === classId);
  };

  // Get unique classes from schedules
  const uniqueClasses = Array.from(
    new Set(
      schedules
        .filter(s => s.classes?.name)
        .map(s => s.classes!.name)
    )
  ).sort((a, b) => {
    // Sort by grade then by class name
    const gradeA = parseInt(a.match(/\d+/)?.[0] || '0');
    const gradeB = parseInt(b.match(/\d+/)?.[0] || '0');
    if (gradeA !== gradeB) return gradeA - gradeB;
    return a.localeCompare(b);
  });

  // Get unique teachers from displayed schedules
  const uniqueTeachers = Array.from(
    new Set(
      schedules
        .map(s => s.teachers?.user_id)
        .filter(Boolean)
    )
  ).map(userId => {
    const profile = profiles?.find(p => p.id === userId);
    return profile?.full_name || '-';
  }).sort();

  // Calculate responsive column width based on number of classes
  const getGridColumns = () => {
    const classCount = uniqueClasses.length;
    if (classCount <= 3) {
      return `minmax(80px, 100px) repeat(${classCount}, minmax(150px, 1fr))`;
    } else if (classCount <= 5) {
      return `minmax(80px, 100px) repeat(${classCount}, minmax(120px, 1fr))`;
    } else {
      return `minmax(70px, 90px) repeat(${classCount}, minmax(100px, 1fr))`;
    }
  };

  return (
    <Card className="overflow-hidden border-border/50 shadow-sm">
      <div className="p-3 md:p-6 border-b border-border/50 bg-muted/30">
        <h3 className="text-base md:text-lg font-semibold text-foreground">Jadwal Mingguan</h3>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">Tampilan kalender jadwal pelajaran</p>
      </div>
      
      <ScrollArea className="h-[500px] md:h-[600px]">
        <div className="p-3 md:p-6">
          {/* Header Row */}
          <div className="grid gap-0 border border-border/30 w-full" style={{ gridTemplateColumns: getGridColumns() }}>
            {/* Header - Day/Class label */}
            <div className="font-bold text-[10px] md:text-xs text-center text-foreground border-r border-b border-border/30 py-2 px-1 bg-muted/50 sticky top-0 z-20">
              Hari/Kelas
            </div>
            
            {/* Header - Class columns */}
            {uniqueClasses.map((className, index) => (
              <div 
                key={className} 
                className={`font-bold text-[10px] md:text-xs text-center text-foreground border-b border-border/30 py-2 px-1 bg-muted/50 sticky top-0 z-20 hover:bg-muted/70 transition-colors ${index < uniqueClasses.length - 1 ? 'border-r border-border/30' : ''}`}
              >
                {className}
              </div>
            ))}
          </div>

          {/* Day rows */}
          <div className="grid gap-0 border-l border-r border-b border-border/30 w-full" style={{ gridTemplateColumns: getGridColumns() }}>
            {DAYS.map((day, dayIndex) => (
              <>
                {/* Day label */}
                <div className="text-[10px] md:text-xs font-bold text-center text-foreground py-2 px-1 border-r border-t border-border/20 bg-muted/30 flex items-center justify-center">
                  {day}
                </div>
                
                {/* Class cells for this day */}
                {uniqueClasses.map((className, classIndex) => (
                  <div 
                    key={`cell-${dayIndex}-${classIndex}`} 
                    className={`border-t border-border/20 relative min-h-[100px] md:min-h-[120px] bg-card hover:bg-muted/10 transition-colors p-1 md:p-2 ${classIndex < uniqueClasses.length - 1 ? 'border-r border-border/20' : ''}`}
                  >
                    <div className="flex flex-col gap-1">
                      {getSchedulesForDayAndClass(dayIndex + 1, className)
                        .sort((a, b) => a.start_time.localeCompare(b.start_time))
                        .map((schedule) => {
                          const colorClass = getColorForSubject(schedule.subject);
                          
                          return (
                            <div
                              key={schedule.id}
                              className={`rounded border backdrop-blur-sm p-1 md:p-1.5 overflow-hidden shadow-sm hover:shadow transition-all duration-200 cursor-pointer ${colorClass}`}
                            >
                              <div className="text-[9px] md:text-[10px] font-bold truncate mb-0.5 leading-tight">
                                {schedule.subject}
                              </div>
                              <div className="text-[8px] md:text-[9px] truncate opacity-80 leading-tight">
                                {schedule.start_time}-{schedule.end_time}
                              </div>
                              <div className="text-[8px] md:text-[9px] truncate opacity-70 font-medium leading-tight hidden md:block">
                                👨‍🏫 {getTeacherName(schedule)}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </>
            ))}
          </div>
        </div>
      </ScrollArea>
      
      {/* Legend */}
      <div className="p-4 md:p-6 border-t border-border/50 space-y-4 bg-muted/20">
        <div>
          <div className="text-xs md:text-sm font-semibold text-foreground mb-2 md:mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-primary rounded-full"></span>
            Keterangan
          </div>
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {selectedClass && (
              <Badge variant="outline" className="text-[10px] md:text-xs border-primary/30">
                Menampilkan kelas yang dipilih saja
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] md:text-xs">
              Setiap warna mewakili mata pelajaran berbeda
            </Badge>
          </div>
        </div>
        
        {/* Teacher Legend */}
        {uniqueTeachers.length > 0 && (
          <div>
            <div className="text-xs md:text-sm font-semibold text-foreground mb-2 md:mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-primary rounded-full"></span>
              Daftar Guru
            </div>
            <div className="flex flex-wrap gap-1.5 md:gap-2">
              {uniqueTeachers.map((teacher, index) => (
                <Badge 
                  key={index} 
                  variant="secondary" 
                  className="text-[10px] md:text-xs font-medium hover:bg-secondary/80 transition-colors"
                >
                  👨‍🏫 {teacher}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
