import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, BookOpen, Coffee, Heart } from 'lucide-react';

interface DashboardTodayScheduleProps {
  todaySchedules: any[];
  userRole: string | null;
  isLoading?: boolean;
}

const REST_MESSAGES = [
  'Terima kasih atas dedikasi Bapak/Ibu. Hari ini tidak ada jadwal mengajar, gunakan waktunya untuk beristirahat dan mengisi ulang energi agar siap mengajar dengan semangat esok hari.',
  'Tidak ada jadwal mengajar hari ini. Istirahat yang cukup adalah bekal terbaik untuk menginspirasi murid-murid esok hari.',
  'Guru yang bahagia melahirkan kelas yang bersemangat. Nikmati hari ini, pulihkan tenaga, dan sampai jumpa di kelas esok hari.',
];

const SATURDAY_MESSAGE = 'Sabtu adalah waktu untuk berhenti sejenak. Nikmati akhir pekan bersama keluarga, karena keluarga adalah sumber kekuatan terbesar seorang pendidik. Siapkan energi dan semangat untuk mengajar kembali di hari Senin.';
const SUNDAY_MESSAGE = 'Selamat berakhir pekan. Luangkan waktu untuk keluarga dan diri sendiri, lalu siapkan energi terbaik untuk mengajar di hari Senin.';

const pickRestMessage = (): { text: string; weekend: boolean } => {
  const now = new Date();
  const day = now.getDay(); // 0 Minggu, 6 Sabtu
  if (day === 6) return { text: SATURDAY_MESSAGE, weekend: true };
  if (day === 0) return { text: SUNDAY_MESSAGE, weekend: true };
  return { text: REST_MESSAGES[now.getDate() % REST_MESSAGES.length], weekend: false };
};

export const DashboardTodaySchedule = ({ todaySchedules, userRole, isLoading }: DashboardTodayScheduleProps) => {
  const isStaff = userRole !== 'student' && userRole !== 'parent';
  const rest = pickRestMessage();
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
        ) : isLoading ? (
          <p className="text-center py-8 text-sm text-muted-foreground">Memuat jadwal...</p>
        ) : isStaff ? (
          <div className="text-center py-8 px-4">
            {rest.weekend ? <Heart className="h-12 w-12 text-primary mx-auto mb-3 opacity-70" /> : <Coffee className="h-12 w-12 text-primary mx-auto mb-3 opacity-70" />}
            <p className="font-medium mb-2">{rest.weekend ? 'Selamat menikmati akhir pekan' : 'Tidak ada jadwal mengajar hari ini'}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{rest.text}</p>
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
