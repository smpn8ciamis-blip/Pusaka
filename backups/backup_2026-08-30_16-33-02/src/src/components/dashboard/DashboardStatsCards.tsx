import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, BookOpen, Calendar } from 'lucide-react';

interface DashboardStatsCardsProps {
  stats: any;
}

export const DashboardStatsCards = ({ stats }: DashboardStatsCardsProps) => {
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
      <Card className="card-hover border-none shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Guru</CardTitle>
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-primary">{stats?.teachers || 0}</div>
          <p className="text-xs text-muted-foreground mt-1">Guru terdaftar</p>
        </CardContent>
      </Card>

      <Card className="card-hover border-none shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Siswa</CardTitle>
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <Users className="h-5 w-5 text-green-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-primary">{stats?.students || 0}</div>
          <p className="text-xs text-muted-foreground mt-1">Siswa aktif</p>
        </CardContent>
      </Card>

      <Card className="card-hover border-none shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Kelas</CardTitle>
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-purple-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-primary">{stats?.classes || 0}</div>
          <p className="text-xs text-muted-foreground mt-1">Kelas aktif</p>
        </CardContent>
      </Card>

      <Card className="card-hover border-none shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Jadwal</CardTitle>
          <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-orange-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-primary">{stats?.schedules || 0}</div>
          <p className="text-xs text-muted-foreground mt-1">Jadwal pelajaran</p>
        </CardContent>
      </Card>
    </div>
  );
};
