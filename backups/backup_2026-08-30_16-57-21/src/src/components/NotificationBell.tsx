import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { id } from "date-fns/locale";

export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch notifications
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (!teacher) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          students (
            full_name,
            nis
          )
        `)
        .eq('teacher_id', teacher.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          console.log('New notification received:', payload);
          queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
          
          // Show toast notification based on type
          const notification = payload.new as any;
          if (notification.type === 'attendance_ready') {
            toast.info('📢 Absensi Tersedia', {
              description: notification.message,
              duration: 8000,
            });
          } else {
            toast.error('⚠️ Peringatan Ketidakhadiran', {
              description: notification.message,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Mark notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (!notifications || notifications.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-destructive"
              variant="destructive"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="px-4 py-2 border-b">
          <h3 className="font-semibold">Notifikasi</h3>
          <p className="text-xs text-muted-foreground">
            {unreadCount} notifikasi belum dibaca
          </p>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.map((notification: any) => (
            <DropdownMenuItem
              key={notification.id}
              className={`flex flex-col items-start gap-1 p-4 cursor-pointer ${
                !notification.is_read ? 'bg-accent/50' : ''
              }`}
              onClick={() => {
                if (!notification.is_read) {
                  markAsReadMutation.mutate(notification.id);
                }
              }}
            >
              <div className="flex items-start justify-between w-full">
                <div className="flex-1">
                  {notification.type === 'attendance_ready' ? (
                    <p className="font-medium text-sm flex items-center gap-2">
                      <span className="text-blue-600">📢</span>
                      Absensi Tersedia
                    </p>
                  ) : (
                    <>
                      <p className="font-medium text-sm">
                        {notification.students?.full_name || 'Siswa'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {notification.students?.nis || ''}
                      </p>
                    </>
                  )}
                </div>
                {!notification.is_read && (
                  <Badge 
                    variant={notification.type === 'attendance_ready' ? 'default' : 'destructive'} 
                    className="text-xs"
                  >
                    Baru
                  </Badge>
                )}
              </div>
              <p className="text-sm">{notification.message}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(notification.created_at), {
                  addSuffix: true,
                  locale: id,
                })}
              </p>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
