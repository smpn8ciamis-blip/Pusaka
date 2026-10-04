import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAttendanceDaySettings, AttendanceDaySetting } from '@/hooks/useAttendanceDaySettings';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';

export const AttendanceDaySettings = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useAttendanceDaySettings();
  const [localSettings, setLocalSettings] = useState<Record<number, boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      const mapped: Record<number, boolean> = {};
      settings.forEach(s => {
        mapped[s.day_of_week] = s.is_active;
      });
      setLocalSettings(mapped);
      setHasChanges(false);
    }
  }, [settings]);

  const toggleDay = (dayOfWeek: number, checked: boolean) => {
    setLocalSettings(prev => ({ ...prev, [dayOfWeek]: checked }));
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(localSettings).map(([day, isActive]) => 
        supabase
          .from('attendance_day_settings')
          .update({ is_active: isActive, updated_by: user?.id })
          .eq('day_of_week', parseInt(day))
      );
      const results = await Promise.all(updates);
      const error = results.find(r => r.error);
      if (error?.error) throw error.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-day-settings'] });
      toast.success('Pengaturan hari absensi berhasil disimpan');
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast.error(`Gagal menyimpan: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeDays = Object.values(localSettings).filter(Boolean).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Pengaturan Hari Absensi</CardTitle>
          </div>
          <Badge variant={activeDays > 0 ? 'default' : 'destructive'}>
            {activeDays} hari aktif
          </Badge>
        </div>
        <CardDescription>
          Tentukan hari apa saja guru dapat mengisi absensi siswa
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings?.map((day) => (
          <div
            key={day.day_of_week}
            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${localSettings[day.day_of_week] ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
              <Label htmlFor={`day-${day.day_of_week}`} className="text-sm font-medium cursor-pointer">
                {day.day_name}
              </Label>
            </div>
            <Switch
              id={`day-${day.day_of_week}`}
              checked={localSettings[day.day_of_week] ?? day.is_active}
              onCheckedChange={(checked) => toggleDay(day.day_of_week, checked)}
            />
          </div>
        ))}

        {hasChanges && (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full gap-2"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
