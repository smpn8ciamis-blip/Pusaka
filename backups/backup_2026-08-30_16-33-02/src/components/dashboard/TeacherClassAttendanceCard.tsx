import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardCheck, UserCheck, ThermometerSun, FileText, UserX } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface StudentAttendanceItem {
  studentId: string;
  studentName: string;
  status: string;
}

interface TeacherClassAttendanceCardProps {
  data: {
    totalStudents: number;
    hadir: number;
    sakit: number;
    izin: number;
    alpa: number;
    belumAbsen: number;
    studentsByStatus: {
      hadir: StudentAttendanceItem[];
      sakit: StudentAttendanceItem[];
      izin: StudentAttendanceItem[];
      alpa: StudentAttendanceItem[];
    };
  };
}

const StatusList = ({ items, emptyText }: { items: StudentAttendanceItem[]; emptyText: string }) => (
  <div className="space-y-1 max-h-[200px] overflow-auto">
    {items.length === 0 ? (
      <p className="text-sm text-muted-foreground italic py-2">{emptyText}</p>
    ) : (
      items.map((s, i) => (
        <div key={s.studentId} className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-muted/50 text-sm">
          <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
          <span>{s.studentName}</span>
        </div>
      ))
    )}
  </div>
);

export const TeacherClassAttendanceCard = ({ data }: TeacherClassAttendanceCardProps) => {
  const today = format(new Date(), 'EEEE, d MMMM yyyy', { locale: idLocale });
  const attendanceRate = data.totalStudents > 0
    ? Math.round((data.hadir / data.totalStudents) * 100)
    : 0;

  return (
    <Card className="border-none shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Kehadiran Siswa Hari Ini</CardTitle>
            <CardDescription>{today}</CardDescription>
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ClipboardCheck className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-5 gap-2">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-center">
            <UserCheck className="h-4 w-4 mx-auto text-emerald-600 mb-1" />
            <p className="text-xl font-bold text-emerald-600">{data.hadir}</p>
            <p className="text-[10px] text-muted-foreground">Hadir</p>
          </div>
          <div className="rounded-lg bg-amber-500/10 p-2 text-center">
            <ThermometerSun className="h-4 w-4 mx-auto text-amber-600 mb-1" />
            <p className="text-xl font-bold text-amber-600">{data.sakit}</p>
            <p className="text-[10px] text-muted-foreground">Sakit</p>
          </div>
          <div className="rounded-lg bg-blue-500/10 p-2 text-center">
            <FileText className="h-4 w-4 mx-auto text-blue-600 mb-1" />
            <p className="text-xl font-bold text-blue-600">{data.izin}</p>
            <p className="text-[10px] text-muted-foreground">Izin</p>
          </div>
          <div className="rounded-lg bg-red-500/10 p-2 text-center">
            <UserX className="h-4 w-4 mx-auto text-red-600 mb-1" />
            <p className="text-xl font-bold text-red-600">{data.alpa}</p>
            <p className="text-[10px] text-muted-foreground">Alpa</p>
          </div>
          <div className="rounded-lg bg-muted p-2 text-center">
            <p className="text-xl font-bold text-foreground mt-5">{data.totalStudents}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
        </div>

        {/* Attendance bar */}
        {data.totalStudents > 0 && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Tingkat kehadiran</span>
              <span className="font-medium">{attendanceRate}%</span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
              {data.hadir > 0 && (
                <div className="bg-emerald-500 transition-all" style={{ width: `${(data.hadir / data.totalStudents) * 100}%` }} />
              )}
              {data.sakit > 0 && (
                <div className="bg-amber-500 transition-all" style={{ width: `${(data.sakit / data.totalStudents) * 100}%` }} />
              )}
              {data.izin > 0 && (
                <div className="bg-blue-500 transition-all" style={{ width: `${(data.izin / data.totalStudents) * 100}%` }} />
              )}
              {data.alpa > 0 && (
                <div className="bg-red-500 transition-all" style={{ width: `${(data.alpa / data.totalStudents) * 100}%` }} />
              )}
            </div>
          </div>
        )}

        {data.belumAbsen > 0 && (
          <p className="text-xs text-muted-foreground">
            <Badge variant="outline" className="mr-1">{data.belumAbsen}</Badge>
            siswa belum diabsen hari ini
          </p>
        )}

        {/* Student lists by status */}
        <Tabs defaultValue="hadir" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="hadir" className="text-xs">Hadir ({data.hadir})</TabsTrigger>
            <TabsTrigger value="sakit" className="text-xs">Sakit ({data.sakit})</TabsTrigger>
            <TabsTrigger value="izin" className="text-xs">Izin ({data.izin})</TabsTrigger>
            <TabsTrigger value="alpa" className="text-xs">Alpa ({data.alpa})</TabsTrigger>
          </TabsList>
          <TabsContent value="hadir">
            <StatusList items={data.studentsByStatus.hadir} emptyText="Belum ada siswa hadir" />
          </TabsContent>
          <TabsContent value="sakit">
            <StatusList items={data.studentsByStatus.sakit} emptyText="Tidak ada siswa sakit" />
          </TabsContent>
          <TabsContent value="izin">
            <StatusList items={data.studentsByStatus.izin} emptyText="Tidak ada siswa izin" />
          </TabsContent>
          <TabsContent value="alpa">
            <StatusList items={data.studentsByStatus.alpa} emptyText="Tidak ada siswa alpa" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
