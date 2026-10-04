import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Trash2, Users, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface StaffAccount {
  user_id: string;
  role: 'bendahara' | 'tata_usaha';
  profile: {
    full_name: string;
    email: string;
    phone: string | null;
  } | null;
}

const StaffAccounts = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<StaffAccount | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    role: '' as 'bendahara' | 'tata_usaha'
  });

  const { data: staffAccounts, isLoading } = useQuery({
    queryKey: ['staff-accounts'],
    queryFn: async () => {
      // Get all bendahara and tata_usaha roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['bendahara', 'tata_usaha']);

      if (rolesError) throw rolesError;

      // Get profiles for these users
      const userIds = roles?.map(r => r.user_id) || [];
      
      if (userIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Combine data
      const accounts: StaffAccount[] = roles?.map(role => ({
        user_id: role.user_id,
        role: role.role as 'bendahara' | 'tata_usaha',
        profile: profiles?.find(p => p.id === role.user_id) ? {
          full_name: profiles.find(p => p.id === role.user_id)!.full_name,
          email: profiles.find(p => p.id === role.user_id)!.email,
          phone: profiles.find(p => p.id === role.user_id)!.phone
        } : null
      })) || [];

      return accounts;
    }
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ userId, fullName, phone }: { userId: string; fullName: string; phone: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, phone: phone || null })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-accounts'] });
      toast({ title: 'Berhasil', description: 'Data akun berhasil diperbarui' });
      setEditDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'Gagal memperbarui data akun', variant: 'destructive' });
      console.error('Update error:', error);
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'bendahara' | 'tata_usaha' }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId)
        .in('role', ['bendahara', 'tata_usaha']);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-accounts'] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'Gagal memperbarui role', variant: 'destructive' });
      console.error('Role update error:', error);
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Call edge function to delete user
      const { error } = await supabase.functions.invoke('delete-user', {
        body: { userId }
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-accounts'] });
      toast({ title: 'Berhasil', description: 'Akun berhasil dihapus' });
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Error', description: 'Gagal menghapus akun', variant: 'destructive' });
      console.error('Delete error:', error);
    }
  });

  const handleEdit = (account: StaffAccount) => {
    setSelectedAccount(account);
    setEditForm({
      full_name: account.profile?.full_name || '',
      phone: account.profile?.phone || '',
      role: account.role
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (account: StaffAccount) => {
    setSelectedAccount(account);
    setDeleteDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedAccount) return;

    // Update profile
    await updateProfileMutation.mutateAsync({
      userId: selectedAccount.user_id,
      fullName: editForm.full_name,
      phone: editForm.phone
    });

    // Update role if changed
    if (editForm.role !== selectedAccount.role) {
      await updateRoleMutation.mutateAsync({
        userId: selectedAccount.user_id,
        newRole: editForm.role
      });
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'bendahara':
        return <Badge variant="default">Bendahara</Badge>;
      case 'tata_usaha':
        return <Badge variant="secondary">Tata Usaha</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const bendaharaCount = staffAccounts?.filter(a => a.role === 'bendahara').length || 0;
  const tataUsahaCount = staffAccounts?.filter(a => a.role === 'tata_usaha').length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Daftar Akun Staff</h1>
          <p className="text-muted-foreground">Kelola akun Bendahara dan Tata Usaha</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Bendahara</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{bendaharaCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Tata Usaha</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tataUsahaCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Daftar Akun
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : staffAccounts && staffAccounts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telepon</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffAccounts.map((account, index) => (
                    <TableRow key={account.user_id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{account.profile?.full_name || '-'}</TableCell>
                      <TableCell>{account.profile?.email || '-'}</TableCell>
                      <TableCell>{account.profile?.phone || '-'}</TableCell>
                      <TableCell>{getRoleBadge(account.role)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEdit(account)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => handleDelete(account)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Belum ada akun Bendahara atau Tata Usaha terdaftar
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Akun</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Lengkap</Label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={selectedAccount?.profile?.email || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">Email tidak dapat diubah</p>
            </div>
            <div className="space-y-2">
              <Label>Telepon</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="Nomor telepon"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(value: 'bendahara' | 'tata_usaha') => setEditForm({ ...editForm, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bendahara">Bendahara</SelectItem>
                  <SelectItem value="tata_usaha">Tata Usaha</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Batal
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={updateProfileMutation.isPending || updateRoleMutation.isPending}
            >
              {(updateProfileMutation.isPending || updateRoleMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Akun</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus akun <strong>{selectedAccount?.profile?.full_name}</strong>? 
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedAccount && deleteAccountMutation.mutate(selectedAccount.user_id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAccountMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default StaffAccounts;
