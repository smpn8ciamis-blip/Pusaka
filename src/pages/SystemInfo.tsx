import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Boxes, Cpu, Database, HardDrive, MemoryStick, Network, Server, Table2, Timer } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { waAdminFetch } from '@/lib/waBot';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ProcRow { pid: number; name: string; cmd: string; cpu: number; rss: number; memPercent: number }
interface ServerMetrics {
  t: number;
  intervalSec: number;
  host: { hostname: string; os: string; arch: string; uptime: number; cpuModel: string; cores: number; node: string };
  cpu: { percent: number; perCore: number[]; load: number[] };
  memory: { total: number; used: number; available: number; free: number; cached: number; buffers: number; percent: number; swapTotal: number; swapUsed: number };
  disk: { fs: string; mount: string; total: number; used: number; free: number; percent: number }[];
  network: { rxBps: number; txBps: number; rxTotal: number; txTotal: number; interfaces: string[] };
  processes: { total: number; byCpu: ProcRow[]; byMem: ProcRow[] };
  docker: null | { available: boolean; error?: string; containers?: { name: string; cpu: number; memPercent: number; memUsage: string; netIO: string; pids: number }[] };
}
interface Point { t: number; label: string; cpu: number; ram: number; rx: number; tx: number }

const HISTORY = 90;

const formatBytes = (bytes?: number | null) => {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0))} ${sizes[i]}`;
};
const formatRate = (bps: number) => `${formatBytes(bps)}/s`;
const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} hari ${h} jam`;
  if (h > 0) return `${h} jam ${m} menit`;
  return `${m} menit`;
};
const clock = (t: number) => new Date(t).toLocaleTimeString('id-ID', { hour12: false, timeZone: 'Asia/Jakarta' });
const tone = (p: number) => (p >= 90 ? 'bg-red-500' : p >= 70 ? 'bg-amber-500' : 'bg-emerald-500');

const Meter = ({ value, className = '' }: { value: number; className?: string }) => (
  <div className={`h-2 w-full overflow-hidden rounded-full bg-secondary ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
    <div className={`h-full transition-all duration-500 ${tone(value)}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

const StatCard = ({ icon: Icon, title, value, subtitle, percent }: { icon: any; title: string; value: string; subtitle?: string; percent?: number }) => (
  <Card>
    <CardContent className="space-y-3 p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5"><Icon className="h-5 w-5 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        </div>
      </div>
      {percent !== undefined && <Meter value={percent} />}
      {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
    </CardContent>
  </Card>
);

const Chart = ({ data, series, percent, format }: { data: Point[]; series: { key: keyof Point; name: string; color: string }[]; percent?: boolean; format: (v: number) => string }) => (
  <div className="h-48 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={40} stroke="hsl(var(--muted-foreground))" />
        <YAxis tick={{ fontSize: 10 }} width={52} domain={percent ? [0, 100] : [0, 'auto']} tickFormatter={(v) => (percent ? `${v}%` : formatBytes(v as number))} stroke="hsl(var(--muted-foreground))" />
        <Tooltip
          formatter={(v: any, name: any) => [format(Number(v)), name]}
          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
        />
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key as string} name={s.name} stroke={s.color} fill={`url(#g-${s.key})`} strokeWidth={2} isAnimationActive={false} dot={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

const ProcTable = ({ rows, sortBy }: { rows: ProcRow[]; sortBy: 'cpu' | 'mem' }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          <th className="px-2 py-2 text-left font-medium">Proses</th>
          <th className="px-2 py-2 text-right font-medium">PID</th>
          <th className={`px-2 py-2 text-right font-medium ${sortBy === 'cpu' ? 'text-foreground' : ''}`}>CPU</th>
          <th className={`px-2 py-2 text-right font-medium ${sortBy === 'mem' ? 'text-foreground' : ''}`}>RAM</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.pid} className="border-b last:border-0">
            <td className="max-w-[16rem] truncate px-2 py-1.5" title={p.cmd}><code className="text-xs">{p.cmd}</code></td>
            <td className="px-2 py-1.5 text-right font-mono text-xs text-muted-foreground">{p.pid}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{p.cpu.toFixed(1)}%</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{formatBytes(p.rss)} <span className="text-xs text-muted-foreground">({p.memPercent}%)</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

interface DbInfo {
  database: {
    size: number; size_pretty: string; active_connections: number; max_connections: number;
    tables: { table_name: string; row_count: number; table_size: string }[];
  };
}

const DatabaseTab = () => {
  const { data, isLoading, error } = useQuery<DbInfo>({
    queryKey: ['system-info-db'],
    queryFn: async () => {
      const response = await supabase.functions.invoke('system-info');
      if (response.error) throw response.error;
      return response.data;
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error || !data) return <p className="text-sm text-destructive">Gagal memuat statistik database: {(error as Error)?.message}</p>;
  const db = data.database;
  const connPct = Math.round((db.active_connections / Math.max(1, db.max_connections)) * 100);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg"><Database className="h-5 w-5 text-primary" /> Statistik Database</CardTitle>
          <CardDescription>Koneksi dan ukuran database</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Koneksi aktif / maks</span>
              <span className="font-medium">{db.active_connections} / {db.max_connections}</span>
            </div>
            <Meter value={connPct} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Ukuran DB</div><div className="font-medium">{db.size_pretty || formatBytes(db.size)}</div></div>
            <div><div className="text-xs text-muted-foreground">Total tabel</div><div className="font-medium">{db.tables.length}</div></div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg"><Table2 className="h-5 w-5 text-primary" /> Statistik Tabel</CardTitle>
          <CardDescription>Ukuran dan jumlah baris per tabel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nama Tabel</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Jumlah Baris</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Ukuran</th>
                </tr>
              </thead>
              <tbody>
                {db.tables.map((tb) => (
                  <tr key={tb.table_name} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-3 py-2"><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{tb.table_name}</code></td>
                    <td className="px-3 py-2 text-right"><Badge variant="secondary" className="font-mono">{tb.row_count.toLocaleString('id-ID')}</Badge></td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{tb.table_size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/** Monitoring server real-time: data dibaca bot dari VPS (/proc, df, docker stats) tiap beberapa detik selama halaman terbuka. */
const SystemInfoPage = () => {
  const [live, setLive] = useState(true);
  const [intervalMs, setIntervalMs] = useState(3000);
  const [tab, setTab] = useState('server');
  const [history, setHistory] = useState<Point[]>([]);

  const { data, error, isLoading, isError } = useQuery<ServerMetrics>({
    queryKey: ['server-metrics'],
    queryFn: () => waAdminFetch<ServerMetrics>('/admin/server-metrics'),
    enabled: tab === 'server',
    refetchInterval: live ? intervalMs : false, // berhenti sendiri saat tab browser tersembunyi
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!data) return;
    setHistory((h) => {
      if (h.length && h[h.length - 1].t === data.t) return h;
      return [...h, { t: data.t, label: clock(data.t), cpu: data.cpu.percent, ram: data.memory.percent, rx: data.network.rxBps, tx: data.network.txBps }].slice(-HISTORY);
    });
  }, [data]);

  const warnings: string[] = [];
  if (data) {
    if (data.cpu.percent >= 90) warnings.push(`CPU sangat tinggi (${data.cpu.percent}%).`);
    if (data.memory.percent >= 90) warnings.push(`RAM hampir habis (${data.memory.percent}%).`);
    if (data.memory.swapTotal > 0 && data.memory.swapUsed / data.memory.swapTotal >= 0.5) warnings.push(`Swap terpakai ${formatBytes(data.memory.swapUsed)}: server kekurangan RAM.`);
    data.disk.filter((d) => d.percent >= 85 && !/^\/(opt|mnt)\//.test(d.mount)).forEach((d) => warnings.push(`Disk ${d.mount} hampir penuh (${d.percent}%, sisa ${formatBytes(d.free)}).`));
    if (data.cpu.load[0] > data.host.cores * 1.5) warnings.push(`Beban rata-rata tinggi (${data.cpu.load[0].toFixed(2)} pada ${data.host.cores} inti).`);
  }
  const rootDisk = data?.disk[0];
  const stale = data ? Date.now() - data.t > Math.max(15000, intervalMs * 4) : false;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Server className="h-6 w-6 text-primary" /> Monitoring Server
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Penggunaan CPU, RAM, disk, jaringan, proses, dan container server secara real-time</p>
          </div>
          {tab === 'server' && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5" aria-hidden>
                  {live && !isError && !stale && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live && !isError && !stale ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                </span>
                <Label htmlFor="live-switch" className="text-sm">Langsung</Label>
                <Switch id="live-switch" checked={live} onCheckedChange={setLive} />
              </div>
              <Select value={String(intervalMs)} onValueChange={(v) => setIntervalMs(Number(v))} disabled={!live}>
                <SelectTrigger className="h-9 w-[130px]" aria-label="Interval pembaruan"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2000">Tiap 2 detik</SelectItem>
                  <SelectItem value="3000">Tiap 3 detik</SelectItem>
                  <SelectItem value="5000">Tiap 5 detik</SelectItem>
                  <SelectItem value="10000">Tiap 10 detik</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="server" className="gap-2"><Activity className="h-4 w-4" /> Resource Server</TabsTrigger>
            <TabsTrigger value="database" className="gap-2"><Database className="h-4 w-4" /> Database</TabsTrigger>
          </TabsList>

          <TabsContent value="server" className="mt-6 space-y-6">
            {isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Gagal memuat data server</AlertTitle>
                <AlertDescription>{(error as Error)?.message}{data ? ' Menampilkan data terakhir yang berhasil dimuat.' : ''}</AlertDescription>
              </Alert>
            )}

            {warnings.length > 0 && (
              <Alert className="border-amber-500/50">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertTitle>Perhatian</AlertTitle>
                <AlertDescription><ul className="list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul></AlertDescription>
              </Alert>
            )}

            {isLoading && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => <Card key={i}><CardContent className="p-5"><Skeleton className="h-24 w-full" /></CardContent></Card>)}
              </div>
            )}

            {data && (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard icon={Cpu} title="CPU" value={`${data.cpu.percent}%`} percent={data.cpu.percent} subtitle={`${data.host.cores} inti | Load ${data.cpu.load.map((l) => l.toFixed(2)).join(' / ')}`} />
                  <StatCard icon={MemoryStick} title="RAM" value={`${data.memory.percent}%`} percent={data.memory.percent} subtitle={`${formatBytes(data.memory.used)} dari ${formatBytes(data.memory.total)}`} />
                  <StatCard icon={HardDrive} title={`Disk ${rootDisk?.mount ?? ''}`} value={rootDisk ? `${rootDisk.percent}%` : '-'} percent={rootDisk?.percent} subtitle={rootDisk ? `${formatBytes(rootDisk.used)} dari ${formatBytes(rootDisk.total)} (sisa ${formatBytes(rootDisk.free)})` : 'Data disk tidak tersedia'} />
                  <StatCard icon={Timer} title="Uptime" value={formatUptime(data.host.uptime)} subtitle={`${data.host.hostname} | ${data.host.os}`} />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base"><Cpu className="h-4 w-4 text-primary" /> CPU & RAM</CardTitle>
                      <CardDescription>{history.length} cuplikan terakhir (±{Math.round((history.length * intervalMs) / 1000)} detik)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Chart data={history} percent format={(v) => `${v}%`} series={[{ key: 'cpu', name: 'CPU', color: 'hsl(var(--primary))' }, { key: 'ram', name: 'RAM', color: 'hsl(var(--chart-2))' }]} />
                      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> CPU</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: 'hsl(var(--chart-2))' }} /> RAM</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base"><Network className="h-4 w-4 text-primary" /> Jaringan</CardTitle>
                      <CardDescription>
                        <span className="inline-flex items-center gap-1"><ArrowDown className="h-3 w-3" /> {formatRate(data.network.rxBps)}</span>
                        {' · '}
                        <span className="inline-flex items-center gap-1"><ArrowUp className="h-3 w-3" /> {formatRate(data.network.txBps)}</span>
                        {data.network.interfaces.length > 0 && <span> · {data.network.interfaces.join(', ')}</span>}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Chart data={history} format={formatRate} series={[{ key: 'rx', name: 'Masuk', color: 'hsl(var(--chart-3))' }, { key: 'tx', name: 'Keluar', color: 'hsl(var(--chart-4))' }]} />
                      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                        <span>Total diterima {formatBytes(data.network.rxTotal)}</span>
                        <span>Total terkirim {formatBytes(data.network.txTotal)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base"><Cpu className="h-4 w-4 text-primary" /> Per Inti CPU</CardTitle>
                      <CardDescription className="truncate">{data.host.cpuModel}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      {data.cpu.perCore.map((c, i) => (
                        <div key={i}>
                          <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Inti {i}</span><span className="font-medium tabular-nums">{c}%</span></div>
                          <Meter value={c} />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base"><MemoryStick className="h-4 w-4 text-primary" /> Memori</CardTitle>
                      <CardDescription>RAM terpakai tidak menghitung cache yang bisa dibebaskan</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <Meter value={data.memory.percent} />
                      <div className="grid grid-cols-2 gap-3">
                        <div><div className="text-xs text-muted-foreground">Terpakai</div><div className="font-medium">{formatBytes(data.memory.used)}</div></div>
                        <div><div className="text-xs text-muted-foreground">Tersedia</div><div className="font-medium">{formatBytes(data.memory.available)}</div></div>
                        <div><div className="text-xs text-muted-foreground">Cache + buffer</div><div className="font-medium">{formatBytes(data.memory.cached + data.memory.buffers)}</div></div>
                        <div><div className="text-xs text-muted-foreground">Swap</div><div className="font-medium">{data.memory.swapTotal ? `${formatBytes(data.memory.swapUsed)} / ${formatBytes(data.memory.swapTotal)}` : 'Tidak ada'}</div></div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base"><HardDrive className="h-4 w-4 text-primary" /> Penyimpanan</CardTitle>
                    <CardDescription>Semua disk yang terpasang di server</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {data.disk.length === 0 && <p className="text-sm text-muted-foreground">Data disk tidak tersedia.</p>}
                    {data.disk.map((d) => (
                      <div key={d.fs + d.mount}>
                        <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
                          <span><code className="text-xs">{d.mount}</code> <span className="text-xs text-muted-foreground">{d.fs}</span></span>
                          <span className="tabular-nums text-muted-foreground">{formatBytes(d.used)} / {formatBytes(d.total)} · sisa {formatBytes(d.free)} · <b className="text-foreground">{d.percent}%</b></span>
                        </div>
                        <Meter value={d.percent} />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> Proses Teratas (CPU)</CardTitle>
                      <CardDescription>100% = satu inti penuh · {data.processes.total} proses berjalan</CardDescription>
                    </CardHeader>
                    <CardContent><ProcTable rows={data.processes.byCpu} sortBy="cpu" /></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base"><MemoryStick className="h-4 w-4 text-primary" /> Proses Teratas (RAM)</CardTitle>
                      <CardDescription>Memori fisik yang dipakai per proses</CardDescription>
                    </CardHeader>
                    <CardContent><ProcTable rows={data.processes.byMem} sortBy="mem" /></CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base"><Boxes className="h-4 w-4 text-primary" /> Container Docker</CardTitle>
                    <CardDescription>Layanan Supabase (database, storage, auth, dll.)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.docker === null && <p className="text-sm text-muted-foreground">Memuat data container…</p>}
                    {data.docker && data.docker.available === false && (
                      <p className="text-sm text-muted-foreground">Docker tidak dapat dibaca oleh bot: {data.docker.error}. Pastikan pengguna yang menjalankan bot boleh memakai perintah <code>docker</code>.</p>
                    )}
                    {data.docker?.available && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-xs text-muted-foreground">
                              <th className="px-2 py-2 text-left font-medium">Container</th>
                              <th className="px-2 py-2 text-right font-medium">CPU</th>
                              <th className="px-2 py-2 text-right font-medium">RAM</th>
                              <th className="px-2 py-2 text-right font-medium">Jaringan (masuk / keluar)</th>
                              <th className="px-2 py-2 text-right font-medium">PID</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(data.docker.containers ?? []).map((c) => (
                              <tr key={c.name} className="border-b last:border-0">
                                <td className="px-2 py-1.5"><code className="text-xs">{c.name}</code></td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{c.cpu.toFixed(1)}%</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{c.memUsage.split(' / ')[0]} <span className="text-xs text-muted-foreground">({c.memPercent}%)</span></td>
                                <td className="px-2 py-1.5 text-right text-xs text-muted-foreground">{c.netIO || '-'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{c.pids}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground">
                  Diperbarui {clock(data.t)} WIB · {data.host.cpuModel} · Node {data.host.node} · selisih pengukuran {data.intervalSec} detik
                </p>
              </>
            )}
          </TabsContent>

          <TabsContent value="database" className="mt-6">
            {tab === 'database' && <DatabaseTab />}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SystemInfoPage;
