import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtPct, type HabitStat } from '@/lib/kaih';

interface Props {
  stats: HabitStat[];
  /** Jumlah jurnal yang dihitung; 0 = belum ada data */
  total: number;
  height?: number;
}

/** Grafik batang persentase tiap kebiasaan: hari terlaksana ÷ jumlah jurnal yang terisi. */
export function KaihPercentChart({ stats, total, height = 300 }: Props) {
  if (total === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground" style={{ height }}>
        Belum ada jurnal pada periode ini.
      </div>
    );
  }
  const data = stats.map((s, i) => ({ name: `${i + 1}. ${s.label}`, percent: s.percent, done: s.done, total: s.total, color: s.color }));
  return (
    <div style={{ height }} className="w-full" role="img" aria-label="Grafik persentase tujuh kebiasaan">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
            formatter={(_v: any, _n: any, item: any) => [`${fmtPct(item.payload.percent)} (${item.payload.done} dari ${item.payload.total} jurnal)`, 'Terlaksana']}
            contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="percent" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={22}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            <LabelList dataKey="percent" position="right" formatter={(v: any) => fmtPct(Number(v))} style={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
