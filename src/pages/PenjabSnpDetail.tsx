import { useMemo } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import {
  canManageSnp, snpDb, STATUS_LABEL, useMySnpStandardIds, useSnpStandards,
  type SnpAssignment, type SnpSubtask,
} from '@/hooks/usePenjabSnp';
import { RkaTab } from '@/components/penjab/RkaTab';
import { DocumentsPanel } from '@/components/penjab/DocumentsPanel';
import { ManageTab } from '@/components/penjab/ManageTab';
import { SubtaskTab, statusClass } from '@/components/penjab/SubtaskTab';

export default function PenjabSnpDetail() {
  const { code } = useParams<{ code: string }>();
  const [params, setParams] = useSearchParams();
  const { userRole } = useAuth();
  const isAdmin = canManageSnp(userRole);
  const { data: standards = [], isLoading: stdLoading } = useSnpStandards();
  const { standardIds } = useMySnpStandardIds();

  const standard = standards.find((s) => s.code === code);

  const { data: assignments = [] } = useQuery({
    queryKey: ['snp-assignments', standard?.id],
    enabled: !!standard,
    queryFn: async (): Promise<SnpAssignment[]> => {
      const { data, error } = await snpDb.rpc('snp_get_assignments');
      if (error) throw error;
      return ((data ?? []) as SnpAssignment[]).filter((a) => a.standard_id === standard!.id);
    },
  });

  const { data: subtasks = [], isLoading: subLoading } = useQuery({
    queryKey: ['snp-subtasks', standard?.id],
    enabled: !!standard,
    queryFn: async (): Promise<SnpSubtask[]> => {
      const { data, error } = await snpDb.from('snp_subtasks').select('*').eq('standard_id', standard!.id).order('sort_order').order('created_at');
      if (error) throw error;
      return (data ?? []) as SnpSubtask[];
    },
  });

  const { data: recentDocs = [] } = useQuery({
    queryKey: ['snp-documents', standard?.id, 'recent'],
    enabled: !!standard,
    queryFn: async () => {
      const { data, error } = await snpDb.from('snp_documents').select('id, title, uploader_name, from_admin, created_at').eq('standard_id', standard!.id).order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; title: string; uploader_name: string | null; from_admin: boolean; created_at: string }>;
    },
  });

  const tab = params.get('tab') || 'ringkasan';
  const setTab = (t: string) => setParams({ tab: t }, { replace: true });

  const done = subtasks.filter((s) => s.status === 'selesai').length;
  const pct = subtasks.length ? Math.round((done / subtasks.length) * 100) : 0;
  const validTab = useMemo(
    () => ['ringkasan', 'rka', 'dokumen'].includes(tab) || (tab === 'kelola' && isAdmin) || subtasks.some((s) => `sub-${s.id}` === tab),
    [tab, isAdmin, subtasks],
  );

  if (stdLoading) {
    return <DashboardLayout><div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div></DashboardLayout>;
  }
  if (!standard || (!isAdmin && !standardIds.includes(standard.id))) return <Navigate to="/penjab-snp" replace />;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <Link to="/penjab-snp" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Semua standar
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">{standard.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1">
            {assignments.length === 0
              ? <span className="text-sm text-muted-foreground">Belum ada penjab</span>
              : assignments.map((a) => <Badge key={a.id} variant="secondary" className="font-normal">{a.full_name}</Badge>)}
          </div>
        </div>

        <Tabs value={validTab ? tab : 'ringkasan'} onValueChange={setTab} className="space-y-4">
          <TabsList className="h-auto w-full justify-start">
            <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
            <TabsTrigger value="rka">RKA</TabsTrigger>
            <TabsTrigger value="dokumen">Dokumen</TabsTrigger>
            {subtasks.map((s) => (
              <TabsTrigger key={s.id} value={`sub-${s.id}`} className="max-w-[180px]">
                <span className="truncate">{s.title}</span>
              </TabsTrigger>
            ))}
            {isAdmin && <TabsTrigger value="kelola">Kelola</TabsTrigger>}
          </TabsList>

          <TabsContent value="ringkasan" className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Progres Sub Tugas</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {subLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : subtasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isAdmin ? 'Belum ada sub tugas. Tambahkan di tab Kelola.' : 'Belum ada sub tugas dari admin.'}</p>
                ) : (
                  <>
                    <div>
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{done} dari {subtasks.length} selesai</span><span>{pct}%</span></div>
                      <Progress value={pct} />
                    </div>
                    <div className="divide-y rounded-lg border">
                      {subtasks.map((s) => (
                        <button key={s.id} type="button" onClick={() => setTab(`sub-${s.id}`)} className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-muted/50">
                          <span className="min-w-0 text-sm break-words">{s.title}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(s.status)}`}>{STATUS_LABEL[s.status]}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Dokumen Terbaru</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {recentDocs.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada dokumen.</p> : recentDocs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{d.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {d.from_admin ? 'Admin' : d.uploader_name ?? '-'} · {new Date(d.created_at).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                ))}
                {recentDocs.length > 0 && <button type="button" className="text-xs text-primary hover:underline" onClick={() => setTab('dokumen')}>Lihat semua dokumen →</button>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rka"><RkaTab standardId={standard.id} standardName={standard.name} /></TabsContent>
          <TabsContent value="dokumen"><DocumentsPanel standardId={standard.id} /></TabsContent>
          {subtasks.map((s) => (
            <TabsContent key={s.id} value={`sub-${s.id}`}><SubtaskTab subtask={s} /></TabsContent>
          ))}
          {isAdmin && (
            <TabsContent value="kelola"><ManageTab standardId={standard.id} assignments={assignments} subtasks={subtasks} /></TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
