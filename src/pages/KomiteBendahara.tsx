import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { KomiteDashboardSummary } from '@/components/komite/KomiteDashboardSummary';
import { BendaharaPendapatan } from '@/components/komite/BendaharaPendapatan';
import { BendaharaRekening } from '@/components/komite/BendaharaRekening';
import { BendaharaPengaturan } from '@/components/komite/BendaharaPengaturan';
import { BendaharaKorlas } from '@/components/komite/BendaharaKorlas';
import { BendaharaRab } from '@/components/komite/BendaharaRab';
import { BendaharaPenggunaan } from '@/components/komite/BendaharaPenggunaan';
import { useAuth } from '@/contexts/AuthContext';

const TABS = ['ringkasan', 'pendapatan', 'rekening', 'pengaturan', 'korlas', 'rab', 'penggunaan'] as const;
type Tab = (typeof TABS)[number];

export default function KomiteBendahara() {
  const [params, setParams] = useSearchParams();
  const { schoolId, userRole } = useAuth();
  // RAB dan Penggunaan hanya dapat diisi bendahara komite (admin/super admin hanya membaca di halaman publik).
  const bolehAnggaran = userRole === 'bendahara_komite';
  const raw = params.get('tab');
  const valid = (TABS as readonly string[]).includes(raw ?? '') && (bolehAnggaran || (raw !== 'rab' && raw !== 'penggunaan'));
  const tab: Tab = valid ? (raw as Tab) : 'ringkasan';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard Bendahara Komite</h1>
            <p className="text-muted-foreground">Kelola target, rekening, pendapatan, koordinator kelas, RAB, dan penggunaan dana.</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/website/komite" target="_blank"><ExternalLink className="mr-1.5 h-4 w-4" /> Lihat halaman publik</Link>
          </Button>
        </div>

        {!schoolId && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Akun ini belum terhubung ke sekolah, sehingga data belum dapat dikelola. Minta Super Admin memilihkan sekolah pada akun Anda.</p>
        )}

        <Tabs value={tab} onValueChange={(v) => setParams(v === 'ringkasan' ? {} : { tab: v }, { replace: true })}>
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
            <TabsTrigger value="pendapatan">Pendapatan</TabsTrigger>
            <TabsTrigger value="rekening">Rekening</TabsTrigger>
            <TabsTrigger value="pengaturan">Pengaturan</TabsTrigger>
            <TabsTrigger value="korlas">Korlas</TabsTrigger>
            {bolehAnggaran && <TabsTrigger value="rab">RAB</TabsTrigger>}
            {bolehAnggaran && <TabsTrigger value="penggunaan">Penggunaan</TabsTrigger>}
          </TabsList>
          <TabsContent value="ringkasan" className="mt-4"><KomiteDashboardSummary /></TabsContent>
          <TabsContent value="pendapatan" className="mt-4"><BendaharaPendapatan /></TabsContent>
          <TabsContent value="rekening" className="mt-4"><BendaharaRekening /></TabsContent>
          <TabsContent value="pengaturan" className="mt-4"><BendaharaPengaturan /></TabsContent>
          <TabsContent value="korlas" className="mt-4"><BendaharaKorlas /></TabsContent>
          {bolehAnggaran && <TabsContent value="rab" className="mt-4"><BendaharaRab /></TabsContent>}
          {bolehAnggaran && <TabsContent value="penggunaan" className="mt-4"><BendaharaPenggunaan /></TabsContent>}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
