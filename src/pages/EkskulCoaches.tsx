import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ekskulDb, useAccessibleEkskulTypes } from '@/hooks/useEkskul';

interface Coach {
  id: string;
  user_id: string;
  extracurricular_type_id: string;
  full_name: string;
  email: string;
}

interface PembinaUser {
  user_id: string;
  full_name: string;
  email: string;
}

export default function EkskulCoaches() {
  const queryClient = useQueryClient();
  const { data: types = [], isLoading: typesLoading } = useAccessibleEkskulTypes();

  const [userId, setUserId] = useState('');
  const [typeId, setTypeId] = useState('');

  const { data: coaches = [], isLoading: coachesLoading } = useQuery({
    queryKey: ['ekskul-coaches'],
    queryFn: async (): Promise<Coach[]> => {
      const { data, error } = await ekskulDb.rpc('get_ekskul_coaches');
      if (error) throw error;
      return (data ?? []) as Coach[];
    },
  });

  const { data: pembinaUsers = [] } = useQuery({
    queryKey: ['ekskul-pembina-users'],
    queryFn: async (): Promise<PembinaUser[]> => {
      const { data, error } = await ekskulDb.rpc('list_pembina_ekskul_users');
      if (error) throw error;
      return (data ?? []) as PembinaUser[];
    },
  });

  const coachesByType = useMemo(() => {
    const map = new Map<string, Coach[]>();
    coaches.forEach((c) => map.set(c.extracurricular_type_id, [...(map.get(c.extracurricular_type_id) ?? []), c]));
    return map;
  }, [coaches]);

  const assign = useMutation({
    mutationFn: async () => {
      const { error } = await ekskulDb
        .from('extracurricular_coaches')
        .insert({ user_id: userId, extracurricular_type_id: typeId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ekskul-coaches'] });
      toast.success('Pembina ditugaskan');
      setUserId('');
      setTypeId('');
    },
    onError: (err: { code?: string }) =>
      toast.error(err?.code === '23505' ? 'Pembina sudah ditugaskan ke ekskul ini' : 'Gagal menugaskan pembina'),
  });

  const unassign = useMutation({
    mutationFn: async (coach: Coach) => {
      const { error } = await ekskulDb.from('extracurricular_coaches').delete().eq('id', coach.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ekskul-coaches'] });
      toast.success('Penugasan dicabut');
    },
    onError: () => toast.error('Gagal mencabut penugasan'),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <UserCheck className="h-6 w-6 text-primary" /> Pembina Ekstrakurikuler
          </h1>
          <p className="text-sm text-muted-foreground">
            Tugaskan akun pembina ke ekskul yang dibinanya. Pembina hanya dapat mengelola ekskul yang ditugaskan.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tugaskan pembina</CardTitle>
            <CardDescription>
              Belum punya akun pembina? Buat di{' '}
              <Link to="/staff-registration" className="text-primary underline">Registrasi Staff</Link>{' '}
              dengan role “Pembina Ekstrakurikuler”.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label>Akun pembina</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder={pembinaUsers.length ? 'Pilih pembina' : 'Belum ada akun pembina'} /></SelectTrigger>
                <SelectContent>
                  {pembinaUsers.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.full_name} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ekstrakurikuler</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger><SelectValue placeholder="Pilih ekskul" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => assign.mutate()} disabled={!userId || !typeId || assign.isPending}>
              {assign.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Tugaskan
            </Button>
          </CardContent>
        </Card>

        {typesLoading || coachesLoading ? (
          <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : types.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Belum ada ekstrakurikuler aktif.</CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {types.map((t) => {
              const list = coachesByType.get(t.id) ?? [];
              return (
                <Card key={t.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      {t.name}
                      <Badge variant={list.length ? 'default' : 'outline'}>{list.length} pembina</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {list.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Belum ada pembina.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {list.map((c) => (
                          <li key={c.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                            <span>
                              {c.full_name}
                              <span className="ml-2 text-xs text-muted-foreground">{c.email}</span>
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => unassign.mutate(c)}
                              disabled={unassign.isPending}
                              aria-label="Cabut penugasan"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
