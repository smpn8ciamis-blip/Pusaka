import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Key, Users, Search, GraduationCap } from 'lucide-react';

interface UserAccount {
  user_id: string;
  role: string;
  school_id: string | null;
  school_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  class_id?: string | null;
  class_name?: string | null;
}

interface UserManagementTabProps {
  schoolId?: string;
  filterKelas?: string;
  filterRole?: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin Sekolah',
  teacher: 'Guru',
  bendahara: 'Bendahara',
  tata_usaha: 'Tata Usaha',
  kesiswaan: 'Kesiswaan',
  polling: 'Polling',
  billing: 'Billing',
  siswa: 'Siswa',
  pembina_ekskul: 'Pembina Ekskul',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-500',
  admin: 'bg-blue-500',
  teacher: 'bg-emerald-500',
  bendahara: 'bg-amber-500',
  tata_usaha: 'bg-purple-500',
  kesiswaan: 'bg-pink-500',
  polling: 'bg-cyan-500',
  billing: 'bg-orange-500',
  siswa: 'bg-teal-500',
  pembina_ekskul: 'bg-lime-600',
};

const ALL_ROLES = ['super_admin', 'admin', 'teacher', 'bendahara', 'tata_usaha', 'kesiswaan', 'polling', 'billing', 'siswa', 'pembina_ekskul'];

async function callManageUsers(action: string, params: any) {
  const res = await supabase.functions.invoke('manage-users', {
    body: { action, ...params },
  });
  if (res.error) throw new Error(res.error.message);
  if (res.data?.error) throw new Error(res.data.error);
  return res.data;
}

export default function UserManagementTab({
  schoolId = 'all',
  filterKelas = 'all',
  filterRole = 'all',
}: UserManagementTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [internalRoleFilter, setInternalRoleFilter] = useState('all');
  const [internalSchoolFilter, setInternalSchoolFilter] = useState('all');
  const [internalClassFilter, setInternalClassFilter] = useState('all');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);

  const [createForm, setCreateForm] = useState({ email: '', password: '', fullName: '', role: 'admin', schoolId: '' });
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', role: '', schoolId: '' });
  const [newPassword, setNewPassword] = useState('');

  const { data: users, isLoading } = useQuery({
    queryKey: ['super-admin-users'],
    queryFn: () => callManageUsers('list', {}),
    select: (data) => (data.users || []) as UserAccount[],
  });

  const { data: schools } = useQuery({
    queryKey: ['all-schools'],
    queryFn: async () => {
      const { data } = await supabase.from('schools').select('id, name').order('name');
      return data || [];
    },
  });

  const { data: classes } = useQuery({
    queryKey: ['all-classes-for-filter', internalSchoolFilter, schoolId],
    queryFn: async () => {
      let q = supabase.from('classes').select('id, name, grade, school_id').order('grade').order('name');
      const effSchool = schoolId !== 'all' ? schoolId : internalSchoolFilter;
      if (effSchool !== 'all') q = q.eq('school_id', effSchool);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: studentClassMap } = useQuery({
    queryKey: ['user-student-class-map'],
    queryFn: async () => {
      const map = new Map<string, { class_id: string | null; class_name: string | null }>();
      try {
        const { data: sa } = await supabase.from('student_accounts').select('user_id, student_id');
        if (!sa?.length) return map;

        const studentIds = sa.map((r: any) => r.student_id);
        const { data: stu } = await supabase.from('students').select('id, class_id').in('id', studentIds);
        const classIds = (stu || []).map((s: any) => s.class_id).filter(Boolean);
        const { data: cls } = await supabase.from('classes').select('id, name').in('id', classIds);

        const classById = new Map((cls || []).map((c: any) => [c.id, c.name]));
        const classByStudent = new Map((stu || []).map((s: any) => [s.id, s.class_id]));

        for (const r of sa) {
          const cid = classByStudent.get(r.student_id) || null;
          map.set(r.user_id, {
            class_id: cid,
            class_name: cid ? classById.get(cid) || null : null,
          });
        }
      } catch (e) {
        console.error('studentClassMap error:', e);
      }
      return map;
    },
  });

  const usersWithClass = useMemo<UserAccount[]>(() => {
    if (!users) return [];
    return users.map((u) => {
      const info = studentClassMap?.get(u.user_id);
      return { ...u, class_id: info?.class_id || null, class_name: info?.class_name || null };
    });
  }, [users, studentClassMap]);

  const effectiveRole = filterRole !== 'all' ? filterRole : internalRoleFilter;
  const effectiveSchool = schoolId !== 'all' ? schoolId : internalSchoolFilter;
  const effectiveClass = filterKelas !== 'all' ? filterKelas : internalClassFilter;

  const filteredUsers = useMemo(() => {
    return usersWithClass.filter((u) => {
      const s = search.toLowerCase();
      const matchSearch = !search ||
        u.full_name?.toLowerCase().includes(s) ||
        u.email?.toLowerCase().includes(s) ||
        u.school_name?.toLowerCase().includes(s) ||
        u.class_name?.toLowerCase().includes(s);
      const matchRole = effectiveRole === 'all' || u.role === effectiveRole;
      const matchSchool = effectiveSchool === 'all' || u.school_id === effectiveSchool;
      const matchClass = effectiveClass === 'all' || u.class_id === effectiveClass;
      return matchSearch && matchRole && matchSchool && matchClass;
    });
  }, [usersWithClass, search, effectiveRole, effectiveSchool, effectiveClass]);

  const createMutation = useMutation({
    mutationFn: (form: typeof createForm) =>
      callManageUsers('create', {
        email: form.email, password: form.password,
        fullName: form.fullName, role: form.role,
        schoolId: form.schoolId || null,
      }),
    onSuccess: () => {
      toast.success('Akun berhasil dibuat');
      queryClient.invalidateQueries({ queryKey: ['super-admin-users'] });
      setIsCreateOpen(false);
      setCreateForm({ email: '', password: '', fullName: '', role: 'admin', schoolId: '' });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      callManageUsers('update_profile', {
        userId: selectedUser?.user_id,
        fullName: editForm.fullName, phone: editForm.phone,
      }),
    onSuccess: () => {
      if (editForm.role !== selectedUser?.role || editForm.schoolId !== (selectedUser?.school_id || '')) {
        updateRoleMutation.mutate();
      } else {
        toast.success('Profil berhasil diperbarui');
        queryClient.invalidateQueries({ queryKey: ['super-admin-users'] });
        setIsEditOpen(false);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateRoleMutation = useMutation({
    mutationFn: () =>
      callManageUsers('update_role', {
        userId: selectedUser?.user_id,
        role: editForm.role, schoolId: editForm.schoolId || null,
      }),
    onSuccess: () => {
      toast.success('Akun berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['super-admin-users'] });
      setIsEditOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      callManageUsers('change_password', { userId: selectedUser?.user_id, newPassword }),
    onSuccess: () => {
      toast.success('Password berhasil diubah');
      setIsPasswordOpen(false);
      setNewPassword('');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => callManageUsers('delete', { userId: selectedUser?.user_id }),
    onSuccess: () => {
      toast.success('Akun berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['super-admin-users'] });
      setIsDeleteOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (user: UserAccount) => {
    setSelectedUser(user);
    setEditForm({
      fullName: user.full_name || '',
      phone: user.phone || '',
      role: user.role,
      schoolId: user.school_id || '',
    });
    setIsEditOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Manajemen Akun</CardTitle>
            <CardDescription>
              Kelola semua akun pengguna ({filteredUsers.length} dari {users?.length ?? 0} akun)
            </CardDescription>
          </div>
          <Button className="gap-2" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" />Tambah Akun
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-2">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari nama, email, sekolah, kelas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          {schoolId === 'all' && (
            <Select value={internalSchoolFilter} onValueChange={(v) => { setInternalSchoolFilter(v); setInternalClassFilter('all'); }}>
              <SelectTrigger><SelectValue placeholder="Sekolah" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Sekolah</SelectItem>
                {schools?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {filterKelas === 'all' && (
            <Select value={internalClassFilter} onValueChange={setInternalClassFilter}>
              <SelectTrigger><SelectValue placeholder="Kelas / Rombel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kelas/Rombel</SelectItem>
                {classes?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {filterRole === 'all' && (
            <Select value={internalRoleFilter} onValueChange={setInternalRoleFilter}>
              <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Role</SelectItem>
                {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Memuat data akun...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Tidak ada akun ditemukan</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Nama</th>
                  <th className="text-left p-2 font-medium">Email</th>
                  <th className="text-left p-2 font-medium">Role</th>
                  <th className="text-left p-2 font-medium">Kelas / Rombel</th>
                  <th className="text-left p-2 font-medium">Sekolah</th>
                  <th className="text-left p-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.user_id} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{user.full_name || '-'}</td>
                    <td className="p-2 text-muted-foreground">{user.email || '-'}</td>
                    <td className="p-2">
                      <Badge className={`${ROLE_COLORS[user.role] || 'bg-gray-500'} text-white`}>
                        {ROLE_LABELS[user.role] || user.role}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {user.class_name ? (
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                          {user.class_name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">{user.school_name || '-'}</td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" title="Edit" onClick={() => openEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Ubah Password" onClick={() => { setSelectedUser(user); setNewPassword(''); setIsPasswordOpen(true); }}>
                          <Key className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Hapus" className="text-destructive hover:text-destructive" onClick={() => { setSelectedUser(user); setIsDeleteOpen(true); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Akun Baru</DialogTitle>
            <DialogDescription>Buat akun pengguna baru dalam sistem</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Nama Lengkap *</Label><Input value={createForm.fullName} onChange={(e) => setCreateForm(f => ({ ...f, fullName: e.target.value }))} /></div>
            <div><Label>Email *</Label><Input type="email" value={createForm.email} onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Password *</Label><Input type="password" value={createForm.password} onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 6 karakter" /></div>
            <div>
              <Label>Role *</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sekolah</Label>
              <Select value={createForm.schoolId} onValueChange={(v) => setCreateForm(f => ({ ...f, schoolId: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih sekolah (opsional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa sekolah</SelectItem>
                  {schools?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={!createForm.email || !createForm.password || !createForm.fullName || createMutation.isPending}
              onClick={() => createMutation.mutate({ ...createForm, schoolId: createForm.schoolId === 'none' ? '' : createForm.schoolId })}>
              {createMutation.isPending ? 'Membuat...' : 'Buat Akun'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Akun</DialogTitle>
            <DialogDescription>{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Nama Lengkap</Label><Input value={editForm.fullName} onChange={(e) => setEditForm(f => ({ ...f, fullName: e.target.value }))} /></div>
            <div><Label>Telepon</Label><Input value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div>
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sekolah</Label>
              <Select value={editForm.schoolId || 'none'} onValueChange={(v) => setEditForm(f => ({ ...f, schoolId: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa sekolah</SelectItem>
                  {schools?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={updateProfileMutation.isPending || updateRoleMutation.isPending}
              onClick={() => updateProfileMutation.mutate()}>
              {updateProfileMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah Password</DialogTitle>
            <DialogDescription>{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Password Baru</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 6 karakter" /></div>
            <Button className="w-full" disabled={!newPassword || newPassword.length < 6 || changePasswordMutation.isPending}
              onClick={() => changePasswordMutation.mutate()}>
              {changePasswordMutation.isPending ? 'Mengubah...' : 'Ubah Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm — HARUS DI SINI, BUKAN DI DALAM TABEL */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Akun?</AlertDialogTitle>
            <AlertDialogDescription>
              Akun <strong>{selectedUser?.full_name}</strong> ({selectedUser?.email}) akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? 'Menghapus...' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
