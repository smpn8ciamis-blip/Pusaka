import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Cpu, HardDrive, MemoryStick, Server, Database, RefreshCw, Clock, Globe, FolderOpen, Table2, Activity } from 'lucide-react';
import { toast } from 'sonner';

interface SystemInfo {
  runtime: {
    name: string;
    version: string;
    typescript_version: string;
    v8_version: string;
  };
  memory: {
    rss: number;
    heap_total: number;
    heap_used: number;
    external: number;
  };
  database: {
    size: number;
    size_pretty: string;
    tables: { table_name: string; row_count: number; table_size: string }[];
    active_connections: number;
    max_connections: number;
  };
  storage: {
    total_files: number;
    total_size: number;
    total_size_pretty: string;
    buckets: number;
  };
  server: {
    timestamp: string;
    timezone: string;
    os: string;
    arch: string;
  };
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const StatCard = ({ icon: Icon, title, value, subtitle, color }: {
  icon: any;
  title: string;
  value: string;
  subtitle?: string;
  color: string;
}) => (
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
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
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
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  const handleRefresh = () => {
    refetch();
    toast.info('Memperbarui data sistem...');
  };

  const heapUsedPercent = systemInfo 
    ? Math.round((systemInfo.memory.heap_used / systemInfo.memory.heap_total) * 100) 
    : 0;

  const connectionPercent = systemInfo 
    ? Math.round((systemInfo.database.active_connections / systemInfo.database.max_connections) * 100) 
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Server className="h-6 w-6 text-primary" />
              Sistem Informasi
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Informasi CPU, RAM, Storage dan konfigurasi server
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={handleRefresh} 
            disabled={isFetching}
            className="gap-2"
          >
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
              <Card key={i}>
                <CardContent className="p-5">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : systemInfo && (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={MemoryStick}
                title="Heap Memory Used"
                value={formatBytes(systemInfo.memory.heap_used)}
                subtitle={`dari ${formatBytes(systemInfo.memory.heap_total)} total`}
                color="bg-primary"
              />
              <StatCard
                icon={Database}
                title="Ukuran Database"
                value={systemInfo.database.size_pretty}
                subtitle={`${systemInfo.database.tables.length} tabel`}
                color="bg-chart-2"
              />
              <StatCard
                icon={HardDrive}
                title="File Storage"
                value={systemInfo.storage.total_size_pretty}
                subtitle={`${systemInfo.storage.total_files} file, ${systemInfo.storage.buckets} bucket`}
                color="bg-chart-3"
              />
              <StatCard
                icon={Activity}
                title="Koneksi Aktif"
                value={`${systemInfo.database.active_connections}`}
                subtitle={`Maks: ${systemInfo.database.max_connections}`}
                color="bg-chart-4"
              />
            </div>

            {/* Detailed Info */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Runtime Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-primary" />
                    Runtime & Server
                  </CardTitle>
                  <CardDescription>Informasi engine dan platform</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="Runtime" value={`${systemInfo.runtime.name} v${systemInfo.runtime.version}`} />
                    <InfoRow label="TypeScript" value={`v${systemInfo.runtime.typescript_version}`} />
                    <InfoRow label="V8 Engine" value={`v${systemInfo.runtime.v8_version}`} />
                    <InfoRow label="OS" value={systemInfo.server.os} />
                    <InfoRow label="Arsitektur" value={systemInfo.server.arch} />
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

              {/* Memory Usage */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MemoryStick className="h-5 w-5 text-primary" />
                    Penggunaan Memory
                  </CardTitle>
                  <CardDescription>Detail alokasi memori runtime</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Heap Used / Total</span>
                      <span className="font-medium">{heapUsedPercent}%</span>
                    </div>
                    <Progress value={heapUsedPercent} className="h-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="RSS" value={formatBytes(systemInfo.memory.rss)} />
                    <InfoRow label="Heap Total" value={formatBytes(systemInfo.memory.heap_total)} />
                    <InfoRow label="Heap Used" value={formatBytes(systemInfo.memory.heap_used)} />
                    <InfoRow label="External" value={formatBytes(systemInfo.memory.external)} />
                  </div>
                </CardContent>
              </Card>

              {/* Database Connections */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Koneksi Database
                  </CardTitle>
                  <CardDescription>Status koneksi ke database</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Aktif / Maks</span>
                      <span className="font-medium">{connectionPercent}%</span>
                    </div>
                    <Progress value={connectionPercent} className="h-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="Aktif" value={`${systemInfo.database.active_connections}`} />
                    <InfoRow label="Maks" value={`${systemInfo.database.max_connections}`} />
                    <InfoRow label="Ukuran DB" value={systemInfo.database.size_pretty} />
                    <InfoRow label="Total Tabel" value={`${systemInfo.database.tables.length}`} />
                  </div>
                </CardContent>
              </Card>

              {/* Storage Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FolderOpen className="h-5 w-5 text-primary" />
                    File Storage
                  </CardTitle>
                  <CardDescription>Informasi penyimpanan file</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="Total File" value={`${systemInfo.storage.total_files}`} />
                    <InfoRow label="Total Ukuran" value={systemInfo.storage.total_size_pretty} />
                    <InfoRow label="Jumlah Bucket" value={`${systemInfo.storage.buckets}`} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Table Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Table2 className="h-5 w-5 text-primary" />
                  Statistik Tabel Database
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
                          <td className="py-2 px-3">
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {table.table_name}
                            </code>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            <Badge variant="secondary" className="font-mono">
                              {table.row_count.toLocaleString('id-ID')}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-right text-muted-foreground">
                            {table.table_size}
                          </td>
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
    <span className="text-sm font-medium text-foreground">{value}</span>
  </div>
);

export default SystemInfoPage;
