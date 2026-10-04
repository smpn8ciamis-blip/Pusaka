import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Cpu, HardDrive, MemoryStick, Server, Database, RefreshCw, Clock, Table2, Activity, Timer, Network } from 'lucide-react';
import { toast } from 'sonner';

interface SystemInfo {
  server: {
    hostname: string;
    platform: string;
    arch: string;
    os_release: string;
    uptime: number;
    timezone: string;
    timestamp: string;
    cpu: { model: string; cores: number; usage: number; loadavg: number[] };
    memory: { total: number; used: number; free: number; percent: number };
    disk: { total: number; used: number; free: number; percent: number };
    runtime: { name: string; version: string; typescript_version: string; v8_version: string };
  };
  database: {
    size: number;
    size_pretty: string;
    tables: { table_name: string; row_count: number; table_size: string }[];
    active_connections: number;
    max_connections: number;
  };
}

const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
};

const StatCard = ({ icon: Icon, title, value, subtitle, color }: { icon: any; title: string; value: string; subtitle?: string; color: string }) => (
  <Card className="relative overflow-hidden">
    <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
    <CardContent className="p-5">
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl ${color} bg-opacity-10`}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

const SystemInfoPage = () => {
  const { data: systemInfo, isLoading, error, refetch, isFetching } = useQuery<SystemInfo>({
    queryKey: ['system-info'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const response = await supabase.functions.invoke('system-info');
      if (response.error) throw response.error;
      return response.data;
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const handleRefresh = () => {
    refetch();
    toast.info('Memperbarui data sistem VPS...');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Server className="h-6 w-6 text-primary" />
              Sistem Informasi VPS
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitoring CPU, RAM, Storage, dan Database server asli
            </p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4">
              <p className="text-destructive text-sm">Gagal memuat data sistem: {(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-20 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : systemInfo && (
          <>
            {/* Quick Stats VPS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={Cpu}
                title="Penggunaan CPU"
                value={`${systemInfo.server.cpu.usage}%`}
                subtitle={`${systemInfo.server.cpu.cores} Cores | Load: ${systemInfo.server.cpu.loadavg[0].toFixed(2)}`}
                color="bg-primary"
              />
              <StatCard
                icon={MemoryStick}
                title="Penggunaan RAM"
                value={`${systemInfo.server.memory.percent}%`}
                subtitle={`${formatBytes(systemInfo.server.memory.used)} / ${formatBytes(systemInfo.server.memory.total)}`}
                color="bg-chart-2"
              />
              <StatCard
                icon={HardDrive}
                title="Penyimpanan Disk"
                value={`${systemInfo.server.disk.percent}%`}
                subtitle={`${formatBytes(systemInfo.server.disk.used)} / ${formatBytes(systemInfo.server.disk.total)}`}
                color="bg-chart-3"
              />
              <StatCard
                icon={Timer}
                title="Uptime Server"
                value={formatUptime(systemInfo.server.uptime)}
                subtitle={systemInfo.server.hostname}
                color="bg-chart-4"
              />
            </div>

            {/* Detailed Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2"><Server className="h-5 w-5 text-primary" /> Server & Runtime</CardTitle>
                  <CardDescription>Informasi OS dan Platform VPS</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="Hostname" value={systemInfo.server.hostname} />
                    <InfoRow label="OS / Kernel" value={`${systemInfo.server.platform} (${systemInfo.server.os_release})`} />
                    <InfoRow label="Arsitektur" value={systemInfo.server.arch} />
                    <InfoRow label="Model CPU" value={systemInfo.server.cpu.model} />
                    <InfoRow label="Runtime" value={`${systemInfo.server.runtime.name} v${systemInfo.server.runtime.version}`} />
                    <InfoRow label="Timezone" value={systemInfo.server.timezone} />
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Terakhir diperbarui: {new Date(systemInfo.server.timestamp).toLocaleString('id-ID')}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> Penggunaan Resource</CardTitle>
                  <CardDescription>Monitoring penggunaan resource real-time</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">CPU</span>
                      <span className="font-medium">{systemInfo.server.cpu.usage}%</span>
                    </div>
                    <Progress value={systemInfo.server.cpu.usage} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">RAM</span>
                      <span className="font-medium">{systemInfo.server.memory.percent}%</span>
                    </div>
                    <Progress value={systemInfo.server.memory.percent} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Disk</span>
                      <span className="font-medium">{systemInfo.server.disk.percent}%</span>
                    </div>
                    <Progress value={systemInfo.server.disk.percent} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> Statistik Database</CardTitle>
                  <CardDescription>Koneksi dan ukuran database</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Koneksi Aktif / Maks</span>
                      <span className="font-medium">{systemInfo.database.active_connections} / {systemInfo.database.max_connections}</span>
                    </div>
                    <Progress 
                      value={Math.round((systemInfo.database.active_connections / Math.max(1, systemInfo.database.max_connections)) * 100)} 
                      className="h-2" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="Ukuran DB" value={systemInfo.database.size_pretty || formatBytes(systemInfo.database.size)} />
                    <InfoRow label="Total Tabel" value={`${systemInfo.database.tables.length}`} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2"><Network className="h-5 w-5 text-primary" /> Informasi Lingkungan</CardTitle>
                  <CardDescription>Detail runtime engine</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="TypeScript" value={`v${systemInfo.server.runtime.typescript_version}`} />
                    <InfoRow label="V8 Engine" value={`v${systemInfo.server.runtime.v8_version}`} />
                    <InfoRow label="Total CPU Cores" value={`${systemInfo.server.cpu.cores} Cores`} />
                    <InfoRow label="Load Average" value={`1m: ${systemInfo.server.cpu.loadavg[0].toFixed(2)}`} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Table Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Table2 className="h-5 w-5 text-primary" /> Statistik Tabel Database
                </CardTitle>
                <CardDescription>Ukuran dan jumlah baris per tabel</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Nama Tabel</th>
                        <th className="text-right py-2 px-3 text-muted-foreground font-medium">Jumlah Baris</th>
                        <th className="text-right py-2 px-3 text-muted-foreground font-medium">Ukuran</th>
                      </tr>
                    </thead>
                    <tbody>
                      {systemInfo.database.tables.map((table) => (
                        <tr key={table.table_name} className="border-b last:border-0 hover:bg-muted/50">
                          <td className="py-2 px-3"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{table.table_name}</code></td>
                          <td className="py-2 px-3 text-right font-mono"><Badge variant="secondary" className="font-mono">{table.row_count.toLocaleString('id-ID')}</Badge></td>
                          <td className="py-2 px-3 text-right text-muted-foreground">{table.table_size}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground truncate">{value}</span>
  </div>
);

export default SystemInfoPage;