import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, BookOpen } from 'lucide-react';

interface DashboardTodayScheduleProps {
  todaySchedules: any[];
  userRole: string | null;
}

export const DashboardTodaySchedule = ({ todaySchedules, userRole }: DashboardTodayScheduleProps) => {
  return (
    <Card className="border-none shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Jadwal Hari Ini
        </CardTitle>
      </CardHeader>
      <CardContent>
        {todaySchedules && todaySchedules.length > 0 ? (
          <div className="space-y-3">
            {todaySchedules.map((schedule: any) => (
              <div
                key={schedule.id}
                className="flex items-start gap-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-semibold text-sm truncate">{schedule.subject}</h4>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {schedule.start_time?.substring(0, 5)} - {schedule.end_time?.substring(0, 5)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <BookOpen className="h-3 w-3" />
                    <span>
                      Kelas {schedule.classes?.name || '-'}
                      {schedule.classes?.grade && ` (Grade ${schedule.classes.grade})`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">Tidak ada jadwal hari ini</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
