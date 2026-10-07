import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, PencilLine, Trash2, UserCheck, UserPlus, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ekskulDb, useAccessibleEkskulTypes } from '@/hooks/useEkskul';

interface Assignment {
  instructor_id: string | null;
  coach_id: string | null;
  extracurricular_type_id: string;
  user_id: string | null;
  full_name: string;
  nip: string | null;
  nuptk: string | null;
  pangkat_golongan: string | null;
  jabatan: string | null;
  email: string | null;
  has_account: boolean;
}

interface TeacherOption {
  teacher_id: string;
  user_id: string | null;
  full_name: string;
  nip: string | null;
}

type Mode = 'teacher' | 'manual';

const emptyManual = { name: '', nip: '', nuptk: '', pangkat_golongan: '', jabatan: '' };

export default function EkskulCoaches() {
  const queryClient = useQueryClient();
  const { data: types = [], isLoading: typesLoading } = useAccessibleEkskulTypes();

  const [mode, setMode] = useState<Mode>('teacher');
  const [teacherId, setTeacherId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [manual, setManual] = useState(emptyManual);

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['ekskul-assignments'],
    queryFn: async (): Promise<Assignment[]> => {
      const { data, error } = await ekskulDb.rpc('get_ekskul_assignments');
      if (error) throw error;
      return (data ?? []) as Assignment[];
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ['ekskul-teacher-options'],
    queryFn: async (): Promise<TeacherOption[]> => {
      const { data, error } = await ekskulDb.rpc('list_teachers_for_ekskul');
      if (error) throw error;
      return (data ?? []) as TeacherOption[];
    },
  });

  const byType = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    assignments.forEach((a) =>
      map.set(a.extracurricular_type_id, [...(map.get(a.extracurricular_type_id) ?? []), a]),
    );
    return map;
  }, [assignments]);

  const selectedTeacher = teachers.find((t) => t.teacher_id === teacherId);
  const manualReady = manual.name.trim().length > 0;
  const canSubmit = !!typeId && (mode === 'teacher' ? !!teacherId : manualReady);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ekskul-assignments'] });
    queryClient.invalidateQueries({ queryKey: ['ekskul-coaches'] });
    queryClient.invalidateQueries({ queryKey: ['ekskul-print-info'] });
  };

  const assign = useMutation({
    mutationFn: async (): Promise<{ has_account: boolean }> => {
      const args =
        mode === 'teacher'
          ? { _type_id: typeId, _teacher_id: teacherId }
          : {
              _type_id: typeId,
              _name: manual.name.trim(),
              _nip: manual.nip.trim() || null,
              _nuptk: manual.nuptk.trim() || null,
              _pangkat_golongan: manual.pangkat_golongan.trim() || null,
              _jabatan: manual.jabatan.trim() || null,
            };
      const { data, error } = await ekskulDb.rpc('assign_ekskul_pembina', args);
      if (error) throw error;
      return data as { has_account: boolean };
    },
    onSuccess: (res) => {
      refresh();
      if (mode === 'teacher') {
        toast.success(
          res?.has_account
            ? 'Guru ditugaskan. Menu Jurnal & Anggota Ekskul kini muncul di akun guru tersebut.'
            : 'Guru ditugaskan sebagai pembina (guru ini belum punya akun, jadi tanpa akses menu).',
        );
        setTeacherId('');
      } else {
        toast.success('Pembina tersimpan (data manual, tanpa akses akun).');
        setManual(emptyManual);
      }
    },
    onError: (err: { message?: string }) => toast.error(err?.message || 'Gagal menugaskan pembina'),
  });

  const unassign = useMutation({
    mutationFn: async (a: Assignment) => {
      const { error } = await ekskulDb.rpc('unassign_ekskul_pembina', {
        _instructor_id: a.instructor_id,
        _coach_id: a.coach_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
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
            Tugaskan guru sebagai pembina ekskul. Guru yang ditugaskan mendapat akses penuh ke Jurnal Ekskul dan
            Anggota Ekskul untuk ekskul binaannya, dan menunya muncul di akun guru tersebut.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tugaskan pembina</CardTitle>
            <CardDescription>
              Pilih guru dari database, atau ketik manual bila pembina belum terdata sebagai guru (mis. pelatih
              luar). Pembina manual tersimpan dan tampil sebagai penanda tangan cetak, tetapi tidak punya akses akun.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList>
                <TabsTrigger value="teacher" className="gap-1.5"><Users className="h-4 w-4" /> Pilih guru</TabsTrigger>
                <TabsTrigger value="manual" className="gap-1.5"><PencilLine className="h-4 w-4" /> Ketik manual</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid gap-3 md:grid-cols-2">
              {mode === 'teacher' ? (
                <div className="space-y-1.5">
                  <Label>Guru *</Label>
                  <Select value={teacherId} onValueChange={setTeacherId}>
                    <SelectTrigger>
                      <SelectValue placeholder={teachers.length ? 'Pilih guru' : 'Data guru belum tersedia'} />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((t) => (
                        <SelectItem key={t.teacher_id} value={t.teacher_id}>
                          {t.full_name}{t.nip ? ` — ${t.nip}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTeacher && !selectedTeacher.user_id && (
                    <p className="text-xs text-amber-600">Guru ini belum punya akun login; hanya tercatat sebagai pembina.</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Nama pembina *</Label>
                    <Input value={manual.name} maxLength={120} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="Nama lengkap beserta gelar" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>NIP</Label>
                    <Input value={manual.nip} maxLength={30} onChange={(e) => setManual({ ...manual, nip: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>NUPTK</Label>
                    <Input value={manual.nuptk} maxLength={30} onChange={(e) => setManual({ ...manual, nuptk: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pangkat / Golongan</Label>
                    <Input value={manual.pangkat_golongan} maxLength={60} onChange={(e) => setManual({ ...manual, pangkat_golongan: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Jabatan</Label>
                    <Input value={manual.jabatan} maxLength={80} onChange={(e) => setManual({ ...manual, jabatan: e.target.value })} placeholder="Contoh: Pembina Pramuka" />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Ekstrakurikuler *</Label>
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger><SelectValue placeholder="Pilih ekskul" /></SelectTrigger>
                  <SelectContent>
                    {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={() => assign.mutate()} disabled={!canSubmit || assign.isPending}>
              {assign.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Tugaskan
            </Button>
          </CardContent>
        </Card>

        {typesLoading || assignmentsLoading ? (
          <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : types.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Belum ada ekstrakurikuler aktif.</CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {types.map((t) => {
              const list = byType.get(t.id) ?? [];
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
                        {list.map((a) => (
                          <li key={`${a.instructor_id ?? ''}-${a.coach_id ?? ''}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                            <span className="min-w-0">
                              <span className="block truncate">{a.full_name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {[a.nip && `NIP ${a.nip}`, a.email].filter(Boolean).join(' • ') || '—'}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <Badge variant={a.has_account ? 'secondary' : 'outline'} className="text-[10px]">
                                {a.has_account ? 'Akses akun' : 'Tanpa akses'}
                              </Badge>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                onClick={() => unassign.mutate(a)}
                                disabled={unassign.isPending}
                                aria-label="Cabut penugasan"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </span>
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
