import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { DocumentsPanel } from '@/components/penjab/DocumentsPanel';
import { useAuth } from '@/contexts/AuthContext';
import { canManageSnp, snpDb, useMySnpStandardIds, useSnpStandards } from '@/hooks/usePenjabSnp';

/** Repositori berkas penjab: pilih standar, unggah / cari / unduh berkas. */
export default function RepositoriPenjab() {
  const { userRole } = useAuth();
  const isAdmin = canManageSnp(userRole);
  const { data: standards = [], isLoading } = useSnpStandards();
  const { standardIds } = useMySnpStandardIds();
  const [params, setParams] = useSearchParams();

  const visible = useMemo(() => (isAdmin ? standards : standards.filter((s) => standardIds.includes(s.id))), [isAdmin, standards, standardIds]);
  const current = visible.find((s) => s.code === params.get('standar')) ?? visible[0];

  useEffect(() => {
    if (current && params.get('standar') !== current.code) setParams({ standar: current.code }, { replace: true });
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: counts = {} } = useQuery({
    queryKey: ['snp-repo-counts'],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await snpDb.from('snp_documents').select('standard_id').eq('ready', true);
      if (error) throw error;
      const m: Record<string, number> = {};
      (data ?? []).forEach((r: { standard_id: string }) => { m[r.standard_id] = (m[r.standard_id] ?? 0) + 1; });
      return m;
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2"><FolderOpen className="h-6 w-6" /> Repositori Penjab</h1>
          <p className="text-muted-foreground">
            {isAdmin ? 'Berkas dari seluruh penjab standar. Admin dapat mengunggah, mengunduh, dan menghapus.' : 'Unggah dan kelola berkas untuk standar yang menjadi tugas tambahan Anda.'}
          </p>
        </div>

        {isLoading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
        ) : visible.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Belum ada standar yang dapat diakses.</CardContent></Card>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {visible.map((s) => {
                const on = s.id === current?.id;
                return (
                  <button
                    key={s.id} type="button" onClick={() => setParams({ standar: s.code }, { replace: true })}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  >
                    {s.name.replace(/^Standar\s+/i, '')}
                    <span className={`ml-1.5 text-xs ${on ? 'opacity-90' : 'text-muted-foreground'}`}>{counts[s.id] ?? 0}</span>
                  </button>
                );
              })}
            </div>
            {current && <DocumentsPanel key={current.id} standardId={current.id} />}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
