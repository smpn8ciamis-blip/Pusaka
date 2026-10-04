import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Megaphone } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

interface DashboardAnnouncementsProps {
  announcements: any[];
}

export const DashboardAnnouncements = ({ announcements }: DashboardAnnouncementsProps) => {
  return (
    <Card className="border-none shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          Pengumuman Terbaru
        </CardTitle>
      </CardHeader>
      <CardContent>
        {announcements && announcements.length > 0 ? (
          <div className="space-y-4">
            {announcements.map((announcement: any) => (
              <div
                key={announcement.id}
                className="p-4 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                <h4 className="font-semibold mb-2 text-primary">{announcement.title}</h4>
                <p className="text-sm text-foreground mb-2">{announcement.content}</p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(announcement.created_at), 'dd MMMM yyyy, HH:mm', { locale: localeId })} WIB
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">Belum ada pengumuman</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
