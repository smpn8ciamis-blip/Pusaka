import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface BulkStudentAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BulkResult {
  studentName: string;
  email: string;
  status: string;
  error?: string;
}

export const BulkStudentAccountDialog = ({ open, onOpenChange }: BulkStudentAccountDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [emailDomain, setEmailDomain] = useState('siswa.sekolah.id');
  const [results, setResults] = useState<BulkResult[] | null>(null);

  const { data: classes } = useQuery({
    queryKey: ['bulk-classes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('classes').select('id, name, grade').order('grade').order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['bulk-students-without-accounts', selectedClass],
    queryFn: async () => {
      let query = supabase.from('students').select('id, full_name, nis, nisn, class_id').eq('is_alumni', false).order('full_name');
      if (selectedClass !== 'all') {
        query = query.eq('class_id', selectedClass);
      }
      const { data: allStudents, error } = await query;
      if (error) throw error;

      const { data: existingAccounts } = await supabase.from('student_accounts').select('student_id');
      const existingSet = new Set(existingAccounts?.map(a => a.student_id) || []);

      return allStudents?.filter(s => !existingSet.has(s.id)) || [];
    },
    enabled: open,
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedStudents);
      if (ids.length === 0) throw new Error('Pilih minimal 1 siswa');

      const { data, error } = await supabase.functions.invoke('bulk-create-student-accounts', {
        body: { studentIds: ids, emailDomain }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setResults(data.results);
      queryClient.invalidateQueries({ queryKey: ['student-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bulk-students-without-accounts'] });
      toast({
        title: 'Selesai',
        description: `${data.summary.success} akun berhasil, ${data.summary.failed} gagal, ${data.summary.skipped} dilewati`,
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const toggleAll = () => {
    if (!students) return;
    if (selectedStudents.size === students.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(students.map(s => s.id)));
    }
  };

  const toggleStudent = (id: string) => {
    const next = new Set(selectedStudents);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStudents(next);
  };

  const handleClose = () => {
    setResults(null);
    setSelectedStudents(new Set());
    onOpenChange(false);
  };

  const getClassName = (classId: string | null) => {
    if (!classId || !classes) return '-';
    const cls = classes.find(c => c.id === classId);
    return cls ? `${cls.grade} - ${cls.name}` : '-';
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Generate Akun Massal
          </DialogTitle>
          <DialogDescription>
            Buat akun siswa secara massal. Password default = NISN siswa. Email = NIS@domain.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="default">{results.filter(r => r.status === 'success').length} Berhasil</Badge>
              <Badge variant="destructive">{results.filter(r => r.status === 'failed').length} Gagal</Badge>
              <Badge variant="secondary">{results.filter(r => r.status === 'skipped').length} Dilewati</Badge>
            </div>
            <ScrollArea className="flex-1 max-h-[400px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.studentName}</TableCell>
                      <TableCell className="text-sm">{r.email || '-'}</TableCell>
                      <TableCell>
                        {r.status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {r.status === 'failed' && (
                          <span className="flex items-center gap-1 text-destructive text-xs">
                            <XCircle className="h-4 w-4" /> {r.error}
                          </span>
                        )}
                        {r.status === 'skipped' && (
                          <span className="flex items-center gap-1 text-muted-foreground text-xs">
                            <AlertTriangle className="h-4 w-4" /> {r.error}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <DialogFooter>
              <Button onClick={handleClose}>Tutup</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Filter Kelas</Label>
                <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); setSelectedStudents(new Set()); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kelas</SelectItem>
                    {classes?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.grade} - {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Domain Email</Label>
                <Input value={emailDomain} onChange={(e) => setEmailDomain(e.target.value)} placeholder="siswa.sekolah.id" />
              </div>
            </div>

            <div className="text-sm text-muted-foreground flex items-center justify-between">
              <span>{selectedStudents.size} dari {students?.length || 0} siswa dipilih</span>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {selectedStudents.size === (students?.length || 0) ? 'Batal Semua' : 'Pilih Semua'}
              </Button>
            </div>

            <ScrollArea className="flex-1 max-h-[300px] rounded-md border">
              {studentsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : students && students.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>NIS</TableHead>
                      <TableHead>NISN</TableHead>
                      <TableHead>Kelas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map(s => (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => toggleStudent(s.id)}>
                        <TableCell>
                          <Checkbox checked={selectedStudents.has(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                        </TableCell>
                        <TableCell className="font-medium">{s.full_name}</TableCell>
                        <TableCell>{s.nis}</TableCell>
                        <TableCell>
                          {s.nisn ? (
                            <Badge variant="outline">{s.nisn}</Badge>
                          ) : (
                            <span className="text-xs text-destructive">Kosong</span>
                          )}
                        </TableCell>
                        <TableCell>{getClassName(s.class_id)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Semua siswa sudah memiliki akun
                </div>
              )}
            </ScrollArea>

            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <p><strong>Format:</strong> Email = NIS@{emailDomain} | Password = NISN</p>
              <p className="text-muted-foreground">Jika NISN kosong, NIS akan digunakan sebagai password (min 6 karakter)</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Batal</Button>
              <Button
                onClick={() => bulkMutation.mutate()}
                disabled={selectedStudents.size === 0 || bulkMutation.isPending}
              >
                {bulkMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Memproses...</>
                ) : (
                  <>Generate {selectedStudents.size} Akun</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
