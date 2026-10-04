import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

export default function DebugSchedules() {
  const { user, userRole } = useAuth();
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    const fetchDebugInfo = async () => {
      if (!user) return;

      // Get teacher info
      const { data: teacher } = await supabase
        .from('teachers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // Get all schedules
      const { data: allSchedules } = await supabase
        .from('schedules')
        .select('*')
        .order('day_of_week');

      // Get teacher's schedules
      let teacherSchedules = null;
      if (teacher) {
        const result = await supabase
          .from('schedules')
          .select('*')
          .eq('teacher_id', teacher.id)
          .order('day_of_week');
        teacherSchedules = result.data;
      }

      // Get profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setDebugInfo({
        user: { id: user.id, email: user.email },
        userRole,
        profile,
        teacher,
        allSchedulesCount: allSchedules?.length || 0,
        teacherSchedulesCount: teacherSchedules?.length || 0,
        allSchedules: allSchedules?.slice(0, 3),
        teacherSchedules: teacherSchedules?.slice(0, 3),
      });
    };

    fetchDebugInfo();
  }, [user, userRole]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Debug Info - Schedules</h1>
          <p className="text-muted-foreground">Informasi debugging untuk jadwal</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>User & Auth Info</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded overflow-auto">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
