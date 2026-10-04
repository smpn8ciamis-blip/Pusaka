import React, { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Plus, Edit, Trash2, Vote, Users, Award, BarChart3, Play, Square, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface PollingPosition {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  max_candidates: number;
  created_at: string;
}

interface PollingCandidate {
  id: string;
  position_id: string;
  teacher_id: string;
  vote_count: number;
  is_active: boolean;
  teacher?: {
    id: string;
    user_id: string;
    nip: string | null;
    jabatan: string | null;
    profile?: {
      full_name: string;
    };
  };
}

interface PollingSession {
  id: string;
  position_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  status: string;
  position?: PollingPosition;
}

interface Teacher {
  id: string;
  user_id: string;
  nip: string | null;
  jabatan: string | null;
  profile?: {
    full_name: string;
  };
}

const PollingDashboard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('positions');
  
  // Position dialog state
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PollingPosition | null>(null);
  const [positionForm, setPositionForm] = useState({ name: '', description: '', max_candidates: 5 });
  
  // Candidate dialog state
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [selectedPositionForCandidate, setSelectedPositionForCandidate] = useState<string>('');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');
  
  // Session dialog state
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    name: '',
    position_id: '',
    start_date: '',
    end_date: ''
  });
  
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string } | null>(null);

  // Fetch positions
  const { data: positions = [], isLoading: loadingPositions } = useQuery({
    queryKey: ['polling-positions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('polling_positions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as PollingPosition[];
    }
  });

  // Fetch candidates
  const { data: candidates = [] } = useQuery({
    queryKey: ['polling-candidates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('polling_candidates')
        .select(`
          *,
          teacher:teachers(
            id,
            user_id,
            nip,
            jabatan,
            profile:profiles(full_name)
          )
        `)
        .order('vote_count', { ascending: false });
      if (error) throw error;
      return data.map((c: any) => ({
        ...c,
        teacher: c.teacher ? {
          ...c.teacher,
          profile: c.teacher.profile
        } : undefined
      })) as PollingCandidate[];
    }
  });

  // Fetch sessions
  const { data: sessions = [] } = useQuery({
    queryKey: ['polling-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('polling_sessions')
        .select(`
          *,
          position:polling_positions(*)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as PollingSession[];
    }
  });

  // Fetch all teachers
  const { data: teachers = [] } = useQuery({
    queryKey: ['all-teachers-for-polling'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teachers')
        .select(`
          id,
          user_id,
          nip,
          jabatan,
          profile:profiles(full_name)
        `)
        .order('nip');
      if (error) throw error;
      return data.map((t: any) => ({
        ...t,
        profile: t.profile
      })) as Teacher[];
    }
  });

  // Fetch votes for results
  const { data: votes = [] } = useQuery({
    queryKey: ['polling-votes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('polling_votes')
        .select('*');
      if (error) throw error;
      return data;
    }
  });

  // Mutations
  const createPositionMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; max_candidates: number }) => {
      const { error } = await supabase.from('polling_positions').insert({
        ...data,
        created_by: user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polling-positions'] });
      toast.success('Jabatan polling berhasil ditambahkan');
      setPositionDialogOpen(false);
      setPositionForm({ name: '', description: '', max_candidates: 5 });
    },
    onError: (error: any) => toast.error(error.message)
  });

  const updatePositionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PollingPosition> }) => {
      const { error } = await supabase.from('polling_positions').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polling-positions'] });
      toast.success('Jabatan polling berhasil diperbarui');
      setPositionDialogOpen(false);
      setEditingPosition(null);
      setPositionForm({ name: '', description: '', max_candidates: 5 });
    },
    onError: (error: any) => toast.error(error.message)
  });

  const deletePositionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('polling_positions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polling-positions'] });
      toast.success('Jabatan polling berhasil dihapus');
      setDeleteConfirm(null);
    },
    onError: (error: any) => toast.error(error.message)
  });

  const createCandidateMutation = useMutation({
    mutationFn: async (data: { position_id: string; teacher_id: string }) => {
      const { error } = await supabase.from('polling_candidates').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polling-candidates'] });
      toast.success('Kandidat berhasil ditambahkan');
      setCandidateDialogOpen(false);
      setSelectedPositionForCandidate('');
      setSelectedTeacher('');
    },
    onError: (error: any) => {
      if (error.message.includes('duplicate')) {
        toast.error('Guru ini sudah menjadi kandidat untuk jabatan tersebut');
      } else {
        toast.error(error.message);
      }
    }
  });

  const deleteCandidateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('polling_candidates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polling-candidates'] });
      toast.success('Kandidat berhasil dihapus');
      setDeleteConfirm(null);
    },
    onError: (error: any) => toast.error(error.message)
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: typeof sessionForm) => {
      const { error } = await supabase.from('polling_sessions').insert({
        ...data,
        created_by: user?.id,
        status: 'draft'
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polling-sessions'] });
      toast.success('Sesi polling berhasil dibuat');
      setSessionDialogOpen(false);
      setSessionForm({ name: '', position_id: '', start_date: '', end_date: '' });
    },
    onError: (error: any) => toast.error(error.message)
  });

  const updateSessionStatusMutation = useMutation({
    mutationFn: async ({ id, status, is_active }: { id: string; status: string; is_active: boolean }) => {
      const { error } = await supabase.from('polling_sessions').update({ status, is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polling-sessions'] });
      toast.success('Status sesi berhasil diperbarui');
    },
    onError: (error: any) => toast.error(error.message)
  });

  const handleEditPosition = (position: PollingPosition) => {
    setEditingPosition(position);
    setPositionForm({
      name: position.name,
      description: position.description || '',
      max_candidates: position.max_candidates
    });
    setPositionDialogOpen(true);
  };

  const handleSavePosition = () => {
    if (editingPosition) {
      updatePositionMutation.mutate({
        id: editingPosition.id,
        data: positionForm
      });
    } else {
      createPositionMutation.mutate(positionForm);
    }
  };

  const getSessionStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <Badge variant="secondary">Draft</Badge>;
      case 'active': return <Badge className="bg-green-500">Aktif</Badge>;
      case 'completed': return <Badge className="bg-blue-500">Selesai</Badge>;
      case 'cancelled': return <Badge variant="destructive">Dibatalkan</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getCandidatesForPosition = (positionId: string) => {
    return candidates.filter(c => c.position_id === positionId);
  };

  const getTotalVotesForSession = (sessionId: string) => {
    return votes.filter(v => v.session_id === sessionId).length;
  };

  // Stats
  const totalPositions = positions.length;
  const activePositions = positions.filter(p => p.is_active).length;
  const totalCandidates = candidates.length;
  const activeSessions = sessions.filter(s => s.status === 'active').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Manajemen Polling</h1>
          <p className="text-muted-foreground">Kelola polling pemilihan jabatan</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Jabatan</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPositions}</div>
              <p className="text-xs text-muted-foreground">{activePositions} aktif</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Kandidat</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCandidates}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sesi Aktif</CardTitle>
              <Vote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeSessions}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Suara</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{votes.length}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="positions">Jabatan</TabsTrigger>
            <TabsTrigger value="candidates">Kandidat</TabsTrigger>
            <TabsTrigger value="sessions">Sesi Polling</TabsTrigger>
            <TabsTrigger value="results">Hasil</TabsTrigger>
          </TabsList>

          {/* Positions Tab */}
          <TabsContent value="positions">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Jabatan Polling</CardTitle>
                  <CardDescription>Kelola jenis jabatan yang akan dipolling</CardDescription>
                </div>
                <Dialog open={positionDialogOpen} onOpenChange={(open) => {
                  setPositionDialogOpen(open);
                  if (!open) {
                    setEditingPosition(null);
                    setPositionForm({ name: '', description: '', max_candidates: 5 });
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 mr-2" />Tambah Jabatan</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingPosition ? 'Edit Jabatan' : 'Tambah Jabatan Baru'}</DialogTitle>
                      <DialogDescription>Masukkan detail jabatan yang akan dipolling</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Nama Jabatan</Label>
                        <Input
                          value={positionForm.name}
                          onChange={(e) => setPositionForm({ ...positionForm, name: e.target.value })}
                          placeholder="Contoh: Wakil Kepala Sekolah Kurikulum"
                        />
                      </div>
                      <div>
                        <Label>Deskripsi</Label>
                        <Textarea
                          value={positionForm.description}
                          onChange={(e) => setPositionForm({ ...positionForm, description: e.target.value })}
                          placeholder="Deskripsi jabatan..."
                        />
                      </div>
                      <div>
                        <Label>Maksimal Kandidat</Label>
                        <Input
                          type="number"
                          min={1}
                          value={positionForm.max_candidates}
                          onChange={(e) => setPositionForm({ ...positionForm, max_candidates: parseInt(e.target.value) || 5 })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleSavePosition} disabled={!positionForm.name}>
                        {editingPosition ? 'Simpan Perubahan' : 'Tambah'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Jabatan</TableHead>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead>Maks. Kandidat</TableHead>
                      <TableHead>Kandidat Terdaftar</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((position) => (
                      <TableRow key={position.id}>
                        <TableCell className="font-medium">{position.name}</TableCell>
                        <TableCell>{position.description || '-'}</TableCell>
                        <TableCell>{position.max_candidates}</TableCell>
                        <TableCell>{getCandidatesForPosition(position.id).length}</TableCell>
                        <TableCell>
                          <Badge variant={position.is_active ? 'default' : 'secondary'}>
                            {position.is_active ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleEditPosition(position)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteConfirm({ type: 'position', id: position.id })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {positions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Belum ada jabatan. Klik tombol "Tambah Jabatan" untuk menambahkan.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Candidates Tab */}
          <TabsContent value="candidates">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Kandidat</CardTitle>
                  <CardDescription>Kelola kandidat untuk setiap jabatan</CardDescription>
                </div>
                <Dialog open={candidateDialogOpen} onOpenChange={setCandidateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 mr-2" />Tambah Kandidat</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Tambah Kandidat</DialogTitle>
                      <DialogDescription>Pilih jabatan dan guru yang akan menjadi kandidat</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Jabatan</Label>
                        <Select value={selectedPositionForCandidate} onValueChange={setSelectedPositionForCandidate}>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih jabatan" />
                          </SelectTrigger>
                          <SelectContent>
                            {positions.filter(p => p.is_active).map((pos) => (
                              <SelectItem key={pos.id} value={pos.id}>{pos.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Guru</Label>
                        <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih guru" />
                          </SelectTrigger>
                          <SelectContent>
                            {teachers.map((teacher) => (
                              <SelectItem key={teacher.id} value={teacher.id}>
                                {teacher.profile?.full_name || 'Unknown'} {teacher.nip ? `(${teacher.nip})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => createCandidateMutation.mutate({
                          position_id: selectedPositionForCandidate,
                          teacher_id: selectedTeacher
                        })}
                        disabled={!selectedPositionForCandidate || !selectedTeacher}
                      >
                        Tambah Kandidat
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {positions.filter(p => p.is_active).map((position) => (
                  <div key={position.id} className="mb-6">
                    <h3 className="font-semibold text-lg mb-3">{position.name}</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nama Guru</TableHead>
                          <TableHead>NIP</TableHead>
                          <TableHead>Jabatan</TableHead>
                          <TableHead>Jumlah Suara</TableHead>
                          <TableHead>Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getCandidatesForPosition(position.id).map((candidate) => (
                          <TableRow key={candidate.id}>
                            <TableCell className="font-medium">{candidate.teacher?.profile?.full_name || '-'}</TableCell>
                            <TableCell>{candidate.teacher?.nip || '-'}</TableCell>
                            <TableCell>{candidate.teacher?.jabatan || '-'}</TableCell>
                            <TableCell>{candidate.vote_count}</TableCell>
                            <TableCell>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setDeleteConfirm({ type: 'candidate', id: candidate.id })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {getCandidatesForPosition(position.id).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                              Belum ada kandidat untuk jabatan ini
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sessions Tab */}
          <TabsContent value="sessions">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Sesi Polling</CardTitle>
                  <CardDescription>Kelola sesi pemungutan suara</CardDescription>
                </div>
                <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 mr-2" />Buat Sesi</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Buat Sesi Polling Baru</DialogTitle>
                      <DialogDescription>Buat sesi pemungutan suara baru</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Nama Sesi</Label>
                        <Input
                          value={sessionForm.name}
                          onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                          placeholder="Contoh: Pemilihan Wakasek Kurikulum 2025"
                        />
                      </div>
                      <div>
                        <Label>Jabatan</Label>
                        <Select
                          value={sessionForm.position_id}
                          onValueChange={(v) => setSessionForm({ ...sessionForm, position_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih jabatan" />
                          </SelectTrigger>
                          <SelectContent>
                            {positions.filter(p => p.is_active).map((pos) => (
                              <SelectItem key={pos.id} value={pos.id}>{pos.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Tanggal Mulai</Label>
                        <Input
                          type="datetime-local"
                          value={sessionForm.start_date}
                          onChange={(e) => setSessionForm({ ...sessionForm, start_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Tanggal Selesai</Label>
                        <Input
                          type="datetime-local"
                          value={sessionForm.end_date}
                          onChange={(e) => setSessionForm({ ...sessionForm, end_date: e.target.value })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => createSessionMutation.mutate(sessionForm)}
                        disabled={!sessionForm.name || !sessionForm.position_id || !sessionForm.start_date || !sessionForm.end_date}
                      >
                        Buat Sesi
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Sesi</TableHead>
                      <TableHead>Jabatan</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead>Total Suara</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell className="font-medium">{session.name}</TableCell>
                        <TableCell>{session.position?.name || '-'}</TableCell>
                        <TableCell>
                          {format(new Date(session.start_date), 'dd MMM yyyy HH:mm', { locale: id })} -{' '}
                          {format(new Date(session.end_date), 'dd MMM yyyy HH:mm', { locale: id })}
                        </TableCell>
                        <TableCell>{getTotalVotesForSession(session.id)}</TableCell>
                        <TableCell>{getSessionStatusBadge(session.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {session.status === 'draft' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateSessionStatusMutation.mutate({
                                  id: session.id,
                                  status: 'active',
                                  is_active: true
                                })}
                              >
                                <Play className="h-4 w-4 mr-1" />
                                Mulai
                              </Button>
                            )}
                            {session.status === 'active' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateSessionStatusMutation.mutate({
                                  id: session.id,
                                  status: 'completed',
                                  is_active: false
                                })}
                              >
                                <Square className="h-4 w-4 mr-1" />
                                Selesaikan
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {sessions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Belum ada sesi polling
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results">
            <div className="space-y-6">
              {sessions.filter(s => s.status === 'completed' || s.status === 'active').map((session) => {
                const sessionCandidates = getCandidatesForPosition(session.position_id);
                const totalVotes = getTotalVotesForSession(session.id);
                const maxVotes = Math.max(...sessionCandidates.map(c => c.vote_count), 1);
                
                return (
                  <Card key={session.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>{session.name}</CardTitle>
                          <CardDescription>{session.position?.name}</CardDescription>
                        </div>
                        {getSessionStatusBadge(session.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Total suara masuk: {totalVotes}</p>
                        {sessionCandidates.map((candidate, index) => {
                          const percentage = totalVotes > 0 ? (candidate.vote_count / totalVotes) * 100 : 0;
                          return (
                            <div key={candidate.id} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {index === 0 && candidate.vote_count > 0 && (
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                  )}
                                  <span className="font-medium">{candidate.teacher?.profile?.full_name}</span>
                                  <span className="text-muted-foreground text-sm">({candidate.teacher?.nip || '-'})</span>
                                </div>
                                <span className="font-bold">{candidate.vote_count} suara ({percentage.toFixed(1)}%)</span>
                              </div>
                              <Progress value={percentage} className="h-3" />
                            </div>
                          );
                        })}
                        {sessionCandidates.length === 0 && (
                          <p className="text-center text-muted-foreground py-4">Tidak ada kandidat untuk sesi ini</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {sessions.filter(s => s.status === 'completed' || s.status === 'active').length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Belum ada hasil polling. Mulai sesi polling untuk melihat hasil.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Konfirmasi Hapus</AlertDialogTitle>
              <AlertDialogDescription>
                Apakah Anda yakin ingin menghapus {deleteConfirm?.type === 'position' ? 'jabatan' : 'kandidat'} ini?
                Tindakan ini tidak dapat dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteConfirm?.type === 'position') {
                    deletePositionMutation.mutate(deleteConfirm.id);
                  } else if (deleteConfirm?.type === 'candidate') {
                    deleteCandidateMutation.mutate(deleteConfirm.id);
                  }
                }}
              >
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default PollingDashboard;
