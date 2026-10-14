import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { RkaTab } from '@/components/penjab/RkaTab';
import { snpDb, useSnpStandards, type SnpAssignment } from '@/hooks/usePenjabSnp';

/** Kelola anggaran (RKA) satu penjab/standar — untuk admin & bendahara. */
export default function AnggaranPenjabDetail() {
  const { code } = useParams<{ code: string }>();
  const { data: standards = [], isLoading } = useSnpStandards();
  const standard = useMemo(() => standards.find((s) => s.code === code), [standards, code]);

  const { data: assignments = [] } = useQuery({
    queryKey: ['snp-assignments', standard?.id, 'finance'],
    enabled: !!standard,
    queryFn: async (): Promise<SnpAssignment[]> => {
      const { data, error } = await snpDb.rpc('snp_get_assignments');
      if (error) throw error;
      return ((data ?? []) as SnpAssignment[]).filter((a) => a.standard_id === standard!.id);
    },
  });

  if (isLoading) return <DashboardLayout><div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div></DashboardLayout>;
  if (!standard) return <Navigate to="/anggaran-penjab" replace />;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <Link to="/anggaran-penjab" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Dashboard Anggaran Penjab
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Anggaran — {standard.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1">
            {assignments.length === 0
              ? <span className="text-sm text-muted-foreground">Belum ada penjab</span>
              : assignments.map((a) => <Badge key={a.id} variant="secondary" className="font-normal">{a.full_name}</Badge>)}
          </div>
        </div>
        <RkaTab standardId={standard.id} standardName={standard.name} />
      </div>
    </DashboardLayout>
  );
}
