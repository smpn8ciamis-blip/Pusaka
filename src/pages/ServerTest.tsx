import { useRef, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Activity, Copy, Play, Square, Trash2, Gauge } from 'lucide-react';
import { toast } from 'sonner';

type Op = 'ping' | 'read' | 'write';
interface Sample { op: Op; ms: number; ok: boolean }
interface StageResult {
  users: number; seconds: number; total: number; errors: number; rps: number;
  p50: number; p95: number; p99: number; max: number;
}

const STAGES = [5, 10, 20, 40, 80];
const STAGE_SECONDS = 8;

const pct = (arr: number[], p: number) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};

// Campuran trafik meniru siswa CBT: sebagian besar simpan jawaban, sebagian ping, sesekali muat soal.
const pickOp = (): Op => {
  const r = Math.random();
  if (r < 0.6) return 'write';
  if (r < 0.9) return 'ping';
  return 'read';
};

const callOp = async (op: Op): Promise<Sample> => {
  const t0 = performance.now();
  let error: unknown = null;
  try {
    if (op === 'ping') ({ error } = await supabase.rpc('server_probe_ping' as never));
    else if (op === 'read') ({ error } = await supabase.rpc('server_probe_read' as never, { p_kb: 40 } as never));
    else ({ error } = await supabase.rpc('server_probe_write' as never, { p_rows: 10 } as never));
  } catch (e) {
    error = e;
  }
  return { op, ms: performance.now() - t0, ok: !error };
};

const verdict = (r: StageResult) => {
  const errPct = r.total ? (r.errors / r.total) * 100 : 0;
  if (errPct > 2 || r.p95 > 3000) return { label: 'Kewalahan', cls: 'bg-red-600' };
  if (errPct > 0.5 || r.p95 > 1200) return { label: 'Mulai berat', cls: 'bg-amber-500' };
  return { label: 'Lancar', cls: 'bg-green-600' };
};

export default function ServerTest() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState('');
  const [results, setResults] = useState<StageResult[]>([]);
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const stopRef = useRef(false);

  const loadInfo = async () => {
    const { data, error } = await supabase.rpc('server_probe_info' as never);
    if (error) {
      toast.error(
        error.message?.includes('server_probe')
          ? 'Fungsi uji belum terpasang. Jalankan migrasi 20261023180000_server_probe.sql.'
          : error.message,
      );
      return false;
    }
    setInfo(data as Record<string, unknown>);
    return true;
  };

  const runStage = async (users: number): Promise<StageResult> => {
    const samples: Sample[] = [];
    const end = performance.now() + STAGE_SECONDS * 1000;
    const worker = async () => {
      while (performance.now() < end && !stopRef.current) {
        samples.push(await callOp(pickOp()));
        await new Promise((r) => setTimeout(r, 150 + Math.random() * 350)); // jeda wajar antar aksi
      }
    };
    await Promise.all(Array.from({ length: users }, worker));
    const ms = samples.filter((s) => s.ok).map((s) => s.ms);
    const errors = samples.filter((s) => !s.ok).length;
    return {
      users, seconds: STAGE_SECONDS, total: samples.length, errors,
      rps: +(samples.length / STAGE_SECONDS).toFixed(1),
      p50: pct(ms, 50), p95: pct(ms, 95), p99: pct(ms, 99), max: Math.round(Math.max(0, ...ms)),
    };
  };

  const start = async () => {
    stopRef.current = false;
    setResults([]);
    setProgress(0);
    if (!(await loadInfo())) return;
    setRunning(true);
    const out: StageResult[] = [];
    for (let i = 0; i < STAGES.length; i++) {
      if (stopRef.current) break;
      setCurrent(`Tahap ${i + 1}/${STAGES.length}: ${STAGES[i]} pengguna serentak`);
      const r = await runStage(STAGES[i]);
      out.push(r);
      setResults([...out]);
      setProgress(Math.round(((i + 1) / STAGES.length) * 100));
      if (verdict(r).label === 'Kewalahan') break; // jangan bebani server lebih jauh
    }
    await supabase.rpc('server_probe_cleanup' as never);
    await loadInfo();
    setRunning(false);
    setCurrent('');
    toast.success(stopRef.current ? 'Uji dihentikan' : 'Uji selesai');
  };

  const stop = () => { stopRef.current = true; };

  const cleanup = async () => {
    const { error } = await supabase.rpc('server_probe_cleanup' as never);
    if (error) toast.error(error.message); else toast.success('Data uji dibersihkan');
  };

  const good = [...results].reverse().find((r) => verdict(r).label === 'Lancar');
  // Perkiraan kasar: tiap siswa CBT ~1 permintaan per 30 detik, dengan ruang aman 50%.
  const estimate = good ? Math.floor(good.rps * 30 * 0.5) : 0;

  const report = () => {
    const lines = [
      'LAPORAN UJI SERVER PUSAKA', new Date().toLocaleString('id-ID'), '',
      info ? `Database: ${JSON.stringify(info)}` : '', '',
      'Pengguna | Req/dtk | p50 | p95 | p99 | max | Error | Status',
      ...results.map((r) => `${r.users} | ${r.rps} | ${r.p50}ms | ${r.p95}ms | ${r.p99}ms | ${r.max}ms | ${r.errors}/${r.total} | ${verdict(r).label}`),
      '', good ? `Perkiraan siswa CBT bersamaan: ± ${estimate}` : 'Belum ada tahap yang lancar.',
      'Catatan: diuji dari satu browser (maks. 6 koneksi paralel per server), jadi hasil adalah batas bawah.',
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => toast.success('Laporan disalin'));
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Gauge className="h-6 w-6" /> Uji Kemampuan Server</h1>
          <p className="text-sm text-muted-foreground">
            Mengirim beban bertahap (5 sampai 80 pengguna virtual) dengan pola mirip siswa CBT: simpan jawaban, ping, dan muat soal. Aman: hanya menulis ke tabel uji khusus dan dibersihkan otomatis.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jalankan</CardTitle>
            <CardDescription>Sebaiknya jalankan saat tidak ada ujian berlangsung. Durasi sekitar {STAGES.length * STAGE_SECONDS} detik.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={start} disabled={running}><Play className="h-4 w-4 mr-1" /> Mulai uji</Button>
              <Button variant="destructive" onClick={stop} disabled={!running}><Square className="h-4 w-4 mr-1" /> Hentikan</Button>
              <Button variant="outline" onClick={loadInfo} disabled={running}><Activity className="h-4 w-4 mr-1" /> Info database</Button>
              <Button variant="outline" onClick={cleanup} disabled={running}><Trash2 className="h-4 w-4 mr-1" /> Bersihkan data uji</Button>
            </div>
            {running && (<div className="space-y-1"><div className="text-sm">{current}</div><Progress value={progress} /></div>)}
          </CardContent>
        </Card>

        {info && (
          <Card>
            <CardHeader><CardTitle className="text-base">Kondisi database</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {Object.entries(info).map(([k, v]) => (
                <div key={k}><div className="text-muted-foreground">{k.replace(/_/g, ' ')}</div><div className="font-medium break-all">{String(v)}</div></div>
              ))}
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Hasil</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground">
                    <th className="py-1">Pengguna</th><th>Req/dtk</th><th>p50</th><th>p95</th><th>p99</th><th>Maks</th><th>Error</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {results.map((r) => { const v = verdict(r); return (
                      <tr key={r.users} className="border-t">
                        <td className="py-1">{r.users}</td><td>{r.rps}</td><td>{r.p50} ms</td><td>{r.p95} ms</td><td>{r.p99} ms</td><td>{r.max} ms</td>
                        <td>{r.errors}/{r.total}</td><td><Badge className={v.cls}>{v.label}</Badge></td>
                      </tr>); })}
                  </tbody>
                </table>
              </div>
              {!running && (
                <div className="rounded-md border p-3 text-sm space-y-1">
                  {good ? (
                    <p>Server masih lancar sampai <b>{good.users} pengguna serentak</b> ({good.rps} permintaan/detik). Perkiraan kasar: <b>± {estimate} siswa</b> bisa mengerjakan CBT bersamaan.</p>
                  ) : (<p>Server sudah berat sejak tahap pertama. Periksa resource server sebelum ujian besar.</p>)}
                  <p className="text-muted-foreground">Catatan: uji dari satu browser dibatasi 6 koneksi paralel, jadi angka ini batas bawah. Untuk simulasi siswa sungguhan gunakan skrip tools/cbt-loadtest.</p>
                </div>
              )}
              <Button variant="outline" onClick={report}><Copy className="h-4 w-4 mr-1" /> Salin laporan</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
