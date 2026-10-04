import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock, School, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import { formatRupiah } from '@/config/subscriptionPlans';

export default function SchoolApprovalTab() {
  const queryClient = useQueryClient();
  const { planPresetsMap } = useSubscriptionPlans();

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ['pending-schools'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateApproval = useMutation({
    mutationFn: async ({ schoolId, status }: { schoolId: string; status: string }) => {
      const { error } = await supabase
        .from('schools')
        .update({ approval_status: status })
        .eq('id', schoolId);
      if (error) throw error;

      // If approved and has selected_plan_key, create subscription
      if (status === 'approved') {
        const school = schools.find(s => s.id === schoolId);
        const planKey = school?.selected_plan_key;
        if (planKey && planPresetsMap[planKey]) {
          const plan = planPresetsMap[planKey];
          await supabase.from('school_subscriptions').upsert({
            school_id: schoolId,
            plan_name: planKey,
            status: 'active',
            max_students: plan.max_students,
            max_teachers: plan.max_teachers,
            monthly_price: plan.monthly_price,
            allowed_features: plan.features,
          }, { onConflict: 'school_id' });
        }
      }
    },
    onSuccess: () => {
      toast.success('Status sekolah diperbarui');
      queryClient.invalidateQueries({ queryKey: ['pending-schools'] });
      queryClient.invalidateQueries({ queryKey: ['all-schools'] });
      queryClient.invalidateQueries({ queryKey: ['school-stats-global'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pendingSchools = schools.filter(s => s.approval_status === 'pending');
  const otherSchools = schools.filter(s => s.approval_status !== 'pending');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-500"><CheckCircle className="h-3 w-3 mr-1" />Disetujui</Badge>;
      case 'rejected': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Ditolak</Badge>;
      default: return <Badge variant="outline" className="text-amber-600 border-amber-300"><Clock className="h-3 w-3 mr-1" />Menunggu</Badge>;
    }
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Memuat...</div>;

  return (
    <div className="space-y-6">
      {pendingSchools.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Clock className="h-5 w-5" />
              Menunggu Persetujuan ({pendingSchools.length})
            </CardTitle>
            <CardDescription>Sekolah baru yang perlu disetujui sebelum bisa digunakan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {pendingSchools.map(school => (
                <Card key={school.id}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold flex items-center gap-2"><School className="h-4 w-4" />{school.name}</h4>
                        {school.npsn && <p className="text-xs text-muted-foreground">NPSN: {school.npsn}</p>}
                      </div>
                      {getStatusBadge(school.approval_status)}
                    </div>
                    {school.address && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{school.address}</p>
                    )}
                    {school.selected_plan_key && planPresetsMap[school.selected_plan_key] && (
                      <p className="text-sm">Paket dipilih: <strong className="capitalize">{planPresetsMap[school.selected_plan_key].label}</strong> ({formatRupiah(planPresetsMap[school.selected_plan_key].monthly_price)}/bln)</p>
                    )}
                    <p className="text-xs text-muted-foreground">Didaftarkan: {format(new Date(school.created_at), 'dd MMM yyyy HH:mm', { locale: localeId })}</p>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-1" 
                        onClick={() => updateApproval.mutate({ schoolId: school.id, status: 'approved' })}
                        disabled={updateApproval.isPending}>
                        <CheckCircle className="h-3.5 w-3.5" />Setujui
                      </Button>
                      <Button size="sm" variant="destructive" className="flex-1 gap-1"
                        onClick={() => updateApproval.mutate({ schoolId: school.id, status: 'rejected' })}
                        disabled={updateApproval.isPending}>
                        <XCircle className="h-3.5 w-3.5" />Tolak
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Semua Sekolah</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Sekolah</th>
                  <th className="text-left p-2 font-medium">NPSN</th>
                  <th className="text-left p-2 font-medium">Paket Dipilih</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-left p-2 font-medium">Tanggal Daftar</th>
                  <th className="text-left p-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {schools.map(school => (
                  <tr key={school.id} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{school.name}</td>
                    <td className="p-2">{school.npsn || '-'}</td>
                    <td className="p-2 capitalize">{school.selected_plan_key ? planPresetsMap[school.selected_plan_key]?.label || school.selected_plan_key : '-'}</td>
                    <td className="p-2">{getStatusBadge(school.approval_status)}</td>
                    <td className="p-2">{format(new Date(school.created_at), 'dd MMM yyyy', { locale: localeId })}</td>
                    <td className="p-2">
                      {school.approval_status === 'pending' && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-emerald-600" onClick={() => updateApproval.mutate({ schoolId: school.id, status: 'approved' })}>
                            <CheckCircle className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => updateApproval.mutate({ schoolId: school.id, status: 'rejected' })}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      {school.approval_status === 'rejected' && (
                        <Button size="sm" variant="ghost" className="h-7 text-emerald-600" onClick={() => updateApproval.mutate({ schoolId: school.id, status: 'approved' })}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />Setujui
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
