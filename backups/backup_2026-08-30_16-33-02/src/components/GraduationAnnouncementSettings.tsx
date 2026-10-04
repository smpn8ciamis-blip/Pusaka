import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CalendarClock, Save } from 'lucide-react';

export const GraduationAnnouncementSettings = () => {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['graduation-settings-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('graduation_announcement_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [formData, setFormData] = useState({
    open_datetime: '',
    close_datetime: '',
    is_active: false,
    message: '',
  });

  // Sync form data when settings load
  const [initialized, setInitialized] = useState(false);
  if (settings && !initialized) {
    setFormData({
      open_datetime: settings.open_datetime ? new Date(settings.open_datetime).toISOString().slice(0, 16) : '',
      close_datetime: settings.close_datetime ? new Date(settings.close_datetime).toISOString().slice(0, 16) : '',
      is_active: settings.is_active || false,
      message: settings.message || '',
    });
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        open_datetime: formData.open_datetime ? new Date(formData.open_datetime).toISOString() : null,
        close_datetime: formData.close_datetime ? new Date(formData.close_datetime).toISOString() : null,
        is_active: formData.is_active,
        message: formData.message || null,
      };

      if (settings?.id) {
        const { error } = await supabase
          .from('graduation_announcement_settings')
          .update(payload)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('graduation_announcement_settings')
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graduation-settings-admin'] });
      toast.success('Pengaturan pengumuman kelulusan berhasil disimpan');
    },
    onError: (e: any) => toast.error('Gagal menyimpan: ' + e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Pengaturan Pengumuman Kelulusan
        </CardTitle>
        <CardDescription>
          Atur waktu pembukaan dan penutupan pengumuman kelulusan. Siswa akan melihat countdown sebelum waktu dibuka.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Switch
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData(p => ({ ...p, is_active: checked }))}
          />
          <Label>Aktifkan Pengaturan Waktu</Label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Waktu Pembukaan</Label>
            <Input
              type="datetime-local"
              value={formData.open_datetime}
              onChange={e => setFormData(p => ({ ...p, open_datetime: e.target.value }))}
            />
          </div>
          <div>
            <Label>Waktu Penutupan</Label>
            <Input
              type="datetime-local"
              value={formData.close_datetime}
              onChange={e => setFormData(p => ({ ...p, close_datetime: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <Label>Pesan (opsional, ditampilkan di halaman countdown)</Label>
          <Textarea
            value={formData.message}
            onChange={e => setFormData(p => ({ ...p, message: e.target.value }))}
            placeholder="Misal: Mohon bersabar, pengumuman akan segera dibuka..."
          />
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </Button>
      </CardContent>
    </Card>
  );
};
