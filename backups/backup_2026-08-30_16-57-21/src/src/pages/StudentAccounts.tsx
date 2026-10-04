import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Key, Trash2, Users, Loader2, Search, UserPlus, UsersRound } from 'lucide-react';
import { BulkStudentAccountDialog } from '@/components/BulkStudentAccountDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface StudentAccount {
  id: string;
  user_id: string;
  student_id: string;
  created_at: string;
  student: {
    full_name: string;
    nis: string;
    nisn: string | null;
    class: {
      name: string;
      grade: number;
    } | null;
  } | null;
  profile: {
    email: string;
    full_name: string;
  } | null;
}

const StudentAccounts = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<StudentAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const { data: studentAccounts, isLoading } = useQuery({
    queryKey: ['student-accounts'],
    queryFn: async () => {
      // Get all student accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('student_accounts')
        .select(`
          id,
          user_id,
          student_id,
          created_at,
          student:students(
            full_name,
            nis,
            nisn,
            class:classes(name, grade)
          )
        `)
        .order('created_at', { ascending: false });

      if (accountsError) throw accountsError;

      // Get profiles for these users
      const userIds = accounts?.map(a => a.user_id) || [];
      
      if (userIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Combine data
      const result: StudentAccount[] = accounts?.map(account => ({
        ...account,
        profile: profiles?.find(p => p.id === account.user_id) || null
      })) || [];

      return result;
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await supabase.functions.invoke('manage-users', {
        body: { action: 'reset_single_password', userId, newPassword: password }
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast({ title: 'Berhasil', description: 'Password berhasil direset' });
      setResetPasswordDialog(false);
      setNewPassword('');
      setConfirmPassword('');
      setSelectedAccount(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Gagal mereset password', 
        variant: 'destructive' 
      });
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async ({ accountId, userId }: { accountId: string; userId: string }) => {
      // Delete from student_accounts first
      const { error: accountError } = await supabase
        .from('student_accounts')
        .delete()
        .eq('id', accountId);

      if (accountError) throw accountError;

      // Delete the auth user via edge function
      const { error: deleteError } = await supabase.functions.invoke('delete-user', {
        body: { userId }
      });

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-accounts'] });
      toast({ title: 'Berhasil', description: 'Akun siswa berhasil dihapus' });
      setDeleteDialogOpen(false);
      setSelectedAccount(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Gagal menghapus akun', 
        variant: 'destructive' 
      });
    }
  });

  const handleResetPassword = () => {
    if (!selectedAccount) return;
    
    if (newPassword.length < 6) {
      toast({
        title: 'Error',
        description: 'Password minimal 6 karakter',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Password tidak cocok',
        variant: 'destructive',
      });
      return;
    }

    resetPasswordMutation.mutate({
      userId: selectedAccount.user_id,
      password: newPassword
    });
  };

  const handleDelete = (account: StudentAccount) => {
    setSelectedAccount(account);
    setDeleteDialogOpen(true);
  };

  const handleOpenResetPassword = (account: StudentAccount) => {
    setSelectedAccount(account);
    setNewPassword('');
    setConfirmPassword('');
    setResetPasswordDialog(true);
  };

  const filteredAccounts = studentAccounts?.filter(account => {
    const searchLower = searchQuery.toLowerCase();
    return (
      account.student?.full_name?.toLowerCase().includes(searchLower) ||
      account.student?.nis?.toLowerCase().includes(searchLower) ||
      account.student?.nisn?.toLowerCase().includes(searchLower) ||
      account.profile?.email?.toLowerCase().includes(searchLower)
    );
  }) || [];

  const totalAccounts = studentAccounts?.length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Daftar Akun Siswa</h1>
            <p className="text-muted-foreground">Kelola akun siswa yang sudah terdaftar</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkDialogOpen(true)}>
              <UsersRound className="h-4 w-4 mr-2" />
              Generate Massal
            </Button>
            <Button onClick={() => navigate('/student-registration')}>
              <UserPlus className="h-4 w-4 mr-2" />
              Registrasi Siswa Baru
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Akun Siswa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAccounts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Daftar Akun
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, NIS, NISN, atau email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAccounts.length > 0 ? (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Nama Siswa</TableHead>
                      <TableHead>NIS</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Terdaftar</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account, index) => (
                      <TableRow key={account.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{account.student?.full_name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{account.student?.nis || '-'}</Badge>
                        </TableCell>
                        <TableCell>
                          {account.student?.class 
                            ? `${account.student.class.grade} - ${account.student.class.name}`
                            : '-'}
                        </TableCell>
                        <TableCell>{account.profile?.email || '-'}</TableCell>
                        <TableCell>
                          {new Date(account.created_at).toLocaleDateString('id-ID')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleOpenResetPassword(account)}
                              title="Reset Password"
                            >
                              <Key className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => handleDelete(account)}
                              title="Hapus Akun"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? 'Tidak ada akun yang cocok dengan pencarian' : 'Belum ada akun siswa terdaftar'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordDialog} onOpenChange={setResetPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Reset password untuk akun: <strong>{selectedAccount?.student?.full_name}</strong>
            </p>
            <div className="space-y-2">
              <Label>Password Baru</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
              />
            </div>
            <div className="space-y-2">
              <Label>Konfirmasi Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordDialog(false)}>
              Batal
            </Button>
            <Button 
              onClick={handleResetPassword}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Akun Siswa</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus akun untuk siswa <strong>{selectedAccount?.student?.full_name}</strong>? 
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedAccount && deleteAccountMutation.mutate({
                accountId: selectedAccount.id,
                userId: selectedAccount.user_id
              })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAccountMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <BulkStudentAccountDialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen} />
    </DashboardLayout>
  );
};

export default StudentAccounts;
