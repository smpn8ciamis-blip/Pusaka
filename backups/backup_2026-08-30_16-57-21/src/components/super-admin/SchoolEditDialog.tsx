import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface SchoolEditDialogProps {
  school: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SchoolEditDialog({ school, open, onOpenChange }: SchoolEditDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', address: '', phone: '', email: '', npsn: '' });

  useEffect(() => {
    if (school) {
      setForm({
        name: school.name || '',
        address: school.address || '',
        phone: school.phone || '',
        email: school.email || '',
        npsn: school.npsn || '',
      });
    }
  }, [school]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('manage-users', {
        body: { action: 'update_school', schoolId: school.id, ...form },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast.success('Sekolah berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['all-schools'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Sekolah</DialogTitle>
          <DialogDescription>Ubah data sekolah</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label>Nama Sekolah *</Label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><Label>NPSN</Label><Input value={form.npsn} onChange={(e) => setForm(f => ({ ...f, npsn: e.target.value }))} /></div>
          <div><Label>Alamat</Label><Input value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div><Label>Telepon</Label><Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} type="email" /></div>
          <Button className="w-full" disabled={!form.name || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
