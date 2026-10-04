import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Lock, Unlock, AlertTriangle, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

interface AccountLockSettings {
  id: string;
  is_locked: boolean;
  lock_message: string | null;
  locked_by: string | null;
  locked_at: string | null;
}

export function AccountLockManager() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [lockMessage, setLockMessage] = useState('');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['account-lock-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_lock_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      return data as AccountLockSettings;
    },
  });

  const toggleLockMutation = useMutation({
    mutationFn: async ({ isLocked, message }: { isLocked: boolean; message?: string }) => {
      const updateData: any = {
        is_locked: isLocked,
        locked_by: isLocked ? user?.id : null,
        locked_at: isLocked ? new Date().toISOString() : null,
      };

      if (message !== undefined) {
        updateData.lock_message = message;
      }

      const { error } = await supabase
        .from('account_lock_settings')
        .update(updateData)
        .eq('id', settings?.id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['account-lock-settings'] });
      toast({
        title: variables.isLocked ? 'Sistem Dikunci' : 'Sistem Dibuka',
        description: variables.isLocked
          ? 'Semua akun sekarang tidak dapat login'
          : 'Semua akun sekarang dapat login kembali',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const { error } = await supabase
        .from('account_lock_settings')
        .update({ lock_message: message })
        .eq('id', settings?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-lock-settings'] });
      toast({ title: 'Berhasil', description: 'Pesan penguncian berhasil diperbarui' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleToggleLock = () => {
    const newLockState = !settings?.is_locked;
    toggleLockMutation.mutate({
      isLocked: newLockState,
      message: newLockState ? lockMessage || settings?.lock_message || undefined : undefined,
    });
  };

  const handleUpdateMessage = () => {
    if (lockMessage.trim()) {
      updateMessageMutation.mutate(lockMessage);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {settings?.is_locked && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Sistem Sedang Dikunci!</AlertTitle>
          <AlertDescription>
            Semua akun tidak dapat login saat ini. Hanya role billing dan admin yang dapat membuka kunci.
            {settings.locked_at && (
              <p className="mt-1 text-sm">
                Dikunci pada: {format(new Date(settings.locked_at), "dd MMMM yyyy 'pukul' HH:mm", { locale: localeId })}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {settings?.is_locked ? (
              <Lock className="h-5 w-5 text-destructive" />
            ) : (
              <Unlock className="h-5 w-5 text-green-500" />
            )}
            Penguncian Akun Global
          </CardTitle>
          <CardDescription>
            Kunci semua akun untuk mencegah login ke sistem. Berguna saat maintenance atau keadaan darurat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <p className="font-medium">Status Penguncian</p>
              <p className="text-sm text-muted-foreground">
                {settings?.is_locked
                  ? 'Sistem dikunci - pengguna tidak dapat login'
                  : 'Sistem terbuka - pengguna dapat login normal'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-sm font-medium ${settings?.is_locked ? 'text-destructive' : 'text-green-500'}`}>
                {settings?.is_locked ? 'TERKUNCI' : 'TERBUKA'}
              </span>
              <Switch
                checked={settings?.is_locked || false}
                onCheckedChange={handleToggleLock}
                disabled={toggleLockMutation.isPending}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lock_message">Pesan Penguncian</Label>
              <Textarea
                id="lock_message"
                placeholder="Masukkan pesan yang akan ditampilkan saat sistem dikunci..."
                value={lockMessage || settings?.lock_message || ''}
                onChange={(e) => setLockMessage(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Pesan ini akan ditampilkan kepada pengguna yang mencoba login saat sistem dikunci
              </p>
            </div>
            <Button
              onClick={handleUpdateMessage}
              disabled={updateMessageMutation.isPending || !lockMessage.trim()}
              variant="outline"
            >
              {updateMessageMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Simpan Pesan
            </Button>
          </div>

          <div className="pt-4 border-t">
            <Button
              onClick={handleToggleLock}
              disabled={toggleLockMutation.isPending}
              variant={settings?.is_locked ? 'default' : 'destructive'}
              className="w-full"
              size="lg"
            >
              {toggleLockMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : settings?.is_locked ? (
                <Unlock className="h-4 w-4 mr-2" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              {settings?.is_locked ? 'Buka Kunci Sistem' : 'Kunci Semua Akun'}
            </Button>
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Perhatian</AlertTitle>
            <AlertDescription>
              Mengunci sistem akan mencegah semua pengguna (kecuali billing dan admin) untuk login.
              Pastikan Anda memiliki akses untuk membuka kunci kembali.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
