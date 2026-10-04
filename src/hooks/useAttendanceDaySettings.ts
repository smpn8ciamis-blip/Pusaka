import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AttendanceDaySetting {
  id: string;
  day_of_week: number;
  day_name: string;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
}

export const useAttendanceDaySettings = () => {
  return useQuery({
    queryKey: ['attendance-day-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_day_settings')
        .select('*')
        .order('day_of_week');
      
      if (error) throw error;
      return data as AttendanceDaySetting[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const isAttendanceAllowedForDate = (
  date: string,
  settings: AttendanceDaySetting[] | undefined
): boolean => {
  if (!settings || settings.length === 0) return true; // Allow all if no settings
  const dayOfWeek = new Date(date).getDay();
  const daySetting = settings.find(s => s.day_of_week === dayOfWeek);
  return daySetting?.is_active ?? true;
};

export const getActiveDayNames = (settings: AttendanceDaySetting[] | undefined): string[] => {
  if (!settings) return [];
  return settings.filter(s => s.is_active).map(s => s.day_name);
};
