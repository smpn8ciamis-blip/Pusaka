import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FileText, ListChecks, Loader2, Wallet } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import {
  canManageSnp, snpDb, useMySnpStandardIds, useSnpStandards,
  type SnpAssignment,
} from '@/hooks/usePenjabSnp';
import { formatRupiah } from '@/lib/rkaParser';

interface Overview {
  assignments: SnpAssignment[];
  subtasks: Array<{ standard_id: string; status: string }>;
  docs: Array<{ standard_id: string }>;
  batches: Array<{ standard_id: string; total_amount: number; created_at: string }>;
}

export default function PenjabSnp() {
  const { userRole } = useAuth();
  const isAdmin = canManageSnp(userRole);
  const { data: standards = [], isLoading: stdLoading } = useSnpStandards();
  const { standardIds } = useMySnpStandardIds();

  const { data: ov, isLoading } = useQuery({
    queryKey: ['snp-overview'],
    queryFn: async (): Promise<Overview> => {
      const [a, s, d, b] = await Promise.all([
        snpDb.rpc('snp_get_assignments'),
        snpDb.from('snp_subtasks').select('standard_id, status'),
        snpDb.from('snp_documents').select('standard_id'),
        snpDb.from('snp_rka_batches').select('standard_id, total_amount, created_at').order('created_at', { ascending: false }),
      ]);
      for (const r of [a, s, d, b]) if (r.error) throw r.error;
      return { assignments: a.data ?? [], subtasks: s.data ?? [], docs: d.data ?? [], batches: b.data ?? [] };
    },
  });

  const visible = useMemo(
    () => (isAdmin ? standards : standards.filter((s) => standardIds.includes(s.id))),
    [isAdmin, standards, standardIds],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Penanggung Jawab Standar</h1>
          <p className="text-muted-foreground">
            {isAdmin ? 'Kelola penjab, sub tugas, RKA, dan dokumen 8 Standar Nasional Pendidikan' : 'Standar yang menjadi tugas tambahan Anda'}
          </p>
        </div>

        {stdLoading || isLoading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
        ) : visible.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Belum ada standar yang ditugaskan.</CardContent></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((s) => {
              const pj = (ov?.assignments ?? []).filter((a) => a.standard_id === s.id);
              const subs = (ov?.subtasks ?? []).filter((x) => x.standard_id === s.id);
              const done = subs.filter((x) => x.status === 'selesai').length;
              const docCount = (ov?.docs ?? []).filter((x) => x.standard_id === s.id).length;
              const latest = (ov?.batches ?? []).find((x) => x.standard_id === s.id);
              const pct = subs.length ? Math.round((done / subs.length) * 100) : 0;
              return (
                <Link key={s.id} to={`/penjab-snp/${s.code}`} className="group block focus:outline-none">
                  <Card className="h-full transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-start justify-between gap-2 text-base leading-snug">
                        <span>{s.name}</span>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-1">
                        {pj.length === 0
                          ? <span className="text-xs text-muted-foreground">Belum ada penjab</span>
                          : pj.map((a) => <Badge key={a.id} variant="secondary" className="font-normal">{a.full_name}</Badge>)}
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /> Sub tugas</span>
                          <span>{subs.length ? `${done}/${subs.length} selesai` : 'Belum ada'}</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {docCount} dokumen</span>
                        <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> {latest ? formatRupiah(Number(latest.total_amount)) : 'RKA belum diimport'}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
