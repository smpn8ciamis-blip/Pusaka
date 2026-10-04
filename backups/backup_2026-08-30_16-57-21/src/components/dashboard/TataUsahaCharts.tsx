import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from "recharts";
import { cn } from "@/lib/utils";
import { TrendingUp, PieChartIcon, BarChart3 } from "lucide-react";

interface TataUsahaChartsProps {
  monthlyData: Array<{
    month: string;
    masuk: number;
    keluar: number;
    disposisi: number;
  }>;
  categoryData: Array<{
    kategori: string;
    masuk: number;
    keluar: number;
    total: number;
  }>;
  disposisiPending: number;
  disposisiInReview: number;
  disposisiResolved: number;
  isLoading?: boolean;
}

const COLORS = {
  masuk: "hsl(221, 83%, 53%)",
  keluar: "hsl(160, 84%, 39%)",
  disposisi: "hsl(263, 70%, 50%)",
  pending: "hsl(45, 93%, 47%)",
  inReview: "hsl(217, 91%, 60%)",
  resolved: "hsl(142, 71%, 45%)",
};

const PIE_COLORS = [
  "hsl(45, 93%, 47%)",
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 45%)",
];

export function TataUsahaCharts({
  monthlyData,
  categoryData,
  disposisiPending,
  disposisiInReview,
  disposisiResolved,
  isLoading
}: TataUsahaChartsProps) {
  const disposisiStatusData = [
    { name: "Pending", value: disposisiPending, color: COLORS.pending },
    { name: "Dalam Proses", value: disposisiInReview, color: COLORS.inReview },
    { name: "Selesai", value: disposisiResolved, color: COLORS.resolved },
  ].filter(d => d.value > 0);

  const totalDisposisi = disposisiPending + disposisiInReview + disposisiResolved;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="border-border/50">
            <CardHeader>
              <div className="h-5 w-32 bg-muted rounded animate-pulse" />
              <div className="h-4 w-48 bg-muted rounded animate-pulse mt-1" />
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Monthly Trend Chart */}
      <Card className="lg:col-span-2 border-border/50 hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50">
              <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Tren Surat per Bulan</CardTitle>
              <CardDescription className="text-xs">Perbandingan surat masuk, keluar, dan disposisi</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12 }} 
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 12 }} 
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="masuk" 
                name="Surat Masuk"
                stroke={COLORS.masuk} 
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey="keluar" 
                name="Surat Keluar"
                stroke={COLORS.keluar} 
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey="disposisi" 
                name="Disposisi"
                stroke={COLORS.disposisi} 
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Disposisi Status Pie Chart */}
      <Card className="border-border/50 hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-950/50">
              <PieChartIcon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-base">Status Disposisi</CardTitle>
              <CardDescription className="text-xs">Distribusi status disposisi surat</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {totalDisposisi === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Belum ada data disposisi
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={disposisiStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {disposisiStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  formatter={(value: number) => [`${value} disposisi`, '']}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-4 mt-2">
            {disposisiStatusData.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-muted-foreground">
                  {entry.name}: {entry.value}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Category Bar Chart */}
      <Card className="lg:col-span-3 border-border/50 hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50">
              <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-base">Surat per Kategori</CardTitle>
              <CardDescription className="text-xs">Perbandingan surat masuk dan keluar berdasarkan kategori</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {categoryData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Belum ada data kategori
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categoryData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis 
                  dataKey="kategori" 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="masuk" 
                  name="Surat Masuk" 
                  fill={COLORS.masuk} 
                  radius={[4, 4, 0, 0]}
                />
                <Bar 
                  dataKey="keluar" 
                  name="Surat Keluar" 
                  fill={COLORS.keluar} 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}