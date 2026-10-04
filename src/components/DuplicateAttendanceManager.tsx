import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Trash2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DuplicateGroup {
  student_id: string;
  date: string;
  schedule_id: string;
  student_name: string;
  student_nis: string;
  class_name: string;
  subject: string;
  count: number;
  records: Array<{
    id: string;
    status: string;
    notes: string | null;
    created_at: string;
  }>;
}

export function DuplicateAttendanceManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Query to find duplicate attendance records
  const { data: duplicates, isLoading } = useQuery({
    queryKey: ['duplicate-attendance'],
    queryFn: async () => {
      // Get all attendance records with student and schedule info
      const { data: allAttendance, error } = await supabase
        .from('attendance')
        .select(`
          id,
          student_id,
          date,
          schedule_id,
          status,
          notes,
          created_at,
          students!inner (
            id,
            nis,
            full_name,
            classes!inner (
              name
            )
          ),
          schedules!inner (
            subject
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by student_id, date, and schedule_id to find duplicates
      const groupedMap = new Map<string, any[]>();
      
      allAttendance?.forEach((record: any) => {
        const key = `${record.student_id}-${record.date}-${record.schedule_id}`;
        if (!groupedMap.has(key)) {
          groupedMap.set(key, []);
        }
        groupedMap.get(key)!.push(record);
      });

      // Filter only groups with more than 1 record (duplicates)
      const duplicateGroups: DuplicateGroup[] = [];
      groupedMap.forEach((records, key) => {
        if (records.length > 1) {
          const firstRecord = records[0];
          duplicateGroups.push({
            student_id: firstRecord.student_id,
            date: firstRecord.date,
            schedule_id: firstRecord.schedule_id,
            student_name: firstRecord.students.full_name,
            student_nis: firstRecord.students.nis,
            class_name: firstRecord.students.classes.name,
            subject: firstRecord.schedules.subject,
            count: records.length,
            records: records.map((r: any) => ({
              id: r.id,
              status: r.status,
              notes: r.notes,
              created_at: r.created_at,
            })),
          });
        }
      });

      return duplicateGroups;
    },
    enabled: isDialogOpen,
  });

  // Mutation to delete duplicate records
  const deleteDuplicatesMutation = useMutation({
    mutationFn: async (group: DuplicateGroup) => {
      // Keep only the most recent record (first in the sorted array)
      const toDelete = group.records.slice(1).map(r => r.id);
      
      const { error } = await supabase
        .from('attendance')
        .delete()
        .in('id', toDelete);

      if (error) throw error;
      return toDelete.length;
    },
    onSuccess: (deletedCount) => {
      toast.success(`${deletedCount} data duplikat berhasil dihapus`);
      queryClient.invalidateQueries({ queryKey: ['duplicate-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
    },
    onError: (error: any) => {
      toast.error(`Gagal menghapus duplikat: ${error.message}`);
    },
  });

  // Mutation to delete all duplicates at once
  const deleteAllDuplicatesMutation = useMutation({
    mutationFn: async (groups: DuplicateGroup[]) => {
      let totalDeleted = 0;
      
      for (const group of groups) {
        // Keep only the most recent record
        const toDelete = group.records.slice(1).map(r => r.id);
        
        const { error } = await supabase
          .from('attendance')
          .delete()
          .in('id', toDelete);

        if (error) throw error;
        totalDeleted += toDelete.length;
      }

      return totalDeleted;
    },
    onSuccess: (totalDeleted) => {
      toast.success(`Total ${totalDeleted} data duplikat berhasil dihapus`);
      queryClient.invalidateQueries({ queryKey: ['duplicate-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
    },
    onError: (error: any) => {
      toast.error(`Gagal menghapus duplikat: ${error.message}`);
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      hadir: 'default',
      sakit: 'secondary',
      izin: 'outline',
      alpa: 'destructive',
    };
    return (
      <Badge variant={variants[status] || 'default'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <AlertTriangle className="w-4 h-4 mr-2" />
          Kelola Duplikat
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kelola Data Absensi Duplikat</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Mencari data duplikat...
          </div>
        ) : !duplicates || duplicates.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Tidak Ada Duplikat</AlertTitle>
            <AlertDescription>
              Tidak ada data absensi duplikat ditemukan dalam database.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Perhatian</AlertTitle>
              <AlertDescription>
                Ditemukan {duplicates.length} grup data duplikat. Sistem akan menyimpan data terbaru dan menghapus data lainnya.
              </AlertDescription>
            </Alert>

            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Total {duplicates.reduce((acc, g) => acc + g.count - 1, 0)} data duplikat akan dihapus
              </p>
              <Button
                variant="destructive"
                onClick={() => deleteAllDuplicatesMutation.mutate(duplicates)}
                disabled={deleteAllDuplicatesMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Hapus Semua Duplikat
              </Button>
            </div>

            <div className="space-y-4">
              {duplicates.map((group, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base">
                          {group.student_name} ({group.student_nis})
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {group.class_name} • {group.subject} • {group.date}
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteDuplicatesMutation.mutate(group)}
                        disabled={deleteDuplicatesMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Hapus Duplikat
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Keterangan</TableHead>
                          <TableHead>Waktu Input</TableHead>
                          <TableHead>Tindakan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.records.map((record, idx) => (
                          <TableRow key={record.id} className={idx === 0 ? 'bg-green-50 dark:bg-green-950/20' : ''}>
                            <TableCell>{getStatusBadge(record.status)}</TableCell>
                            <TableCell>{record.notes || '-'}</TableCell>
                            <TableCell className="text-xs">
                              {new Date(record.created_at).toLocaleString('id-ID')}
                            </TableCell>
                            <TableCell>
                              {idx === 0 ? (
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  Akan Disimpan
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  Akan Dihapus
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
