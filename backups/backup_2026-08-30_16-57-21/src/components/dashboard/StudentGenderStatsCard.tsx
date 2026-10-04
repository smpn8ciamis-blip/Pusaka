import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ClassGenderData {
  classId: string;
  className: string;
  grade: number;
  male: number;
  female: number;
  total: number;
  homeroomTeacher?: string;
}

interface GradeGenderData {
  grade: number;
  male: number;
  female: number;
  total: number;
}

interface StudentGenderStatsCardProps {
  totalMale: number;
  totalFemale: number;
  totalStudents: number;
  byClass: ClassGenderData[];
  byGrade: GradeGenderData[];
  isTeacher?: boolean;
}

export const StudentGenderStatsCard = ({
  totalMale,
  totalFemale,
  totalStudents,
  byClass,
  byGrade,
  isTeacher = false,
}: StudentGenderStatsCardProps) => {
  const malePercent = totalStudents > 0 ? Math.round((totalMale / totalStudents) * 100) : 0;
  const femalePercent = totalStudents > 0 ? Math.round((totalFemale / totalStudents) * 100) : 0;

  return (
    <Card className="border-none shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Rekap Siswa L/P</CardTitle>
            <CardDescription>
              {isTeacher ? 'Data siswa kelas Anda' : 'Berdasarkan tahun pelajaran aktif'}
            </CardDescription>
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-blue-500/10 p-3 text-center">
            <p className="text-xs text-muted-foreground">Laki-laki</p>
            <p className="text-2xl font-bold text-blue-600">{totalMale}</p>
            <p className="text-xs text-muted-foreground">{malePercent}%</p>
          </div>
          <div className="rounded-lg bg-pink-500/10 p-3 text-center">
            <p className="text-xs text-muted-foreground">Perempuan</p>
            <p className="text-2xl font-bold text-pink-600">{totalFemale}</p>
            <p className="text-xs text-muted-foreground">{femalePercent}%</p>
          </div>
          <div className="rounded-lg bg-muted p-3 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground">{totalStudents}</p>
            <p className="text-xs text-muted-foreground">siswa</p>
          </div>
        </div>

        {/* Gender bar */}
        {totalStudents > 0 && (
          <div className="flex h-3 rounded-full overflow-hidden">
            <div className="bg-blue-500 transition-all" style={{ width: `${malePercent}%` }} />
            <div className="bg-pink-500 transition-all" style={{ width: `${femalePercent}%` }} />
          </div>
        )}

        {/* Tables */}
        {isTeacher ? (
          <div className="rounded-md border max-h-[300px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kelas</TableHead>
                  <TableHead className="text-center">L</TableHead>
                  <TableHead className="text-center">P</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byClass.map(c => (
                  <TableRow key={c.classId}>
                    <TableCell className="font-medium">{c.className}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">{c.male}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-pink-500/10 text-pink-600 border-pink-500/20">{c.female}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{c.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Tabs defaultValue="byClass" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="byClass">Per Rombel</TabsTrigger>
              <TabsTrigger value="byGrade">Per Tingkat</TabsTrigger>
            </TabsList>
            <TabsContent value="byClass">
              <div className="rounded-md border max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Wali Kelas</TableHead>
                      <TableHead className="text-center">L</TableHead>
                      <TableHead className="text-center">P</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byClass.map(c => (
                      <TableRow key={c.classId}>
                        <TableCell className="font-medium">{c.className}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.homeroomTeacher || <span className="italic">-</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">{c.male}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-pink-500/10 text-pink-600 border-pink-500/20">{c.female}</Badge>
                        </TableCell>
                        <TableCell className="text-center font-semibold">{c.total}</TableCell>
                      </TableRow>
                    ))}
                    {byClass.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                          Belum ada data siswa
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="byGrade">
              <div className="rounded-md border max-h-[300px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tingkat</TableHead>
                      <TableHead className="text-center">L</TableHead>
                      <TableHead className="text-center">P</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byGrade.map(g => (
                      <TableRow key={g.grade}>
                        <TableCell className="font-medium">Kelas {g.grade}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">{g.male}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-pink-500/10 text-pink-600 border-pink-500/20">{g.female}</Badge>
                        </TableCell>
                        <TableCell className="text-center font-semibold">{g.total}</TableCell>
                      </TableRow>
                    ))}
                    {byGrade.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                          Belum ada data siswa
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};
