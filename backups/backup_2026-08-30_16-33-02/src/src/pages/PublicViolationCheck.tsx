import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Search, User, Calendar, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import ReCAPTCHA from 'react-google-recaptcha';
import { toast } from 'sonner';
import { RECAPTCHA_SITE_KEY } from '@/config/recaptcha';

export default function PublicViolationCheck() {
  const [nis, setNis] = useState('');
  const [searchedNis, setSearchedNis] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRef, setCaptchaRef] = useState<ReCAPTCHA | null>(null);

  const { data: studentData, isLoading, error } = useQuery({
    queryKey: ['public-student-check', searchedNis],
    queryFn: async () => {
      if (!searchedNis) return null;

      // Fetch student data
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('*, classes(name)')
        .eq('nis', searchedNis)
        .single();

      if (studentError) throw studentError;

      // Fetch attendance data
      const { data: attendance, error: attendanceError } = await supabase
        .from('attendance')
        .select('*, schedules(subject, classes(name))')
        .eq('student_id', student.id)
        .order('date', { ascending: false })
        .limit(20);

      if (attendanceError) throw attendanceError;

      // Fetch violations
      const { data: violations, error: violationsError } = await supabase
        .from('student_violations')
        .select(`
          *,
          violation_types(name, category, points)
        `)
        .eq('student_id', student.id)
        .order('violation_date', { ascending: false });

      if (violationsError) throw violationsError;

      // Calculate total violation points
      const totalPoints = violations.reduce((sum, v) => sum + v.points, 0);

      // Calculate attendance summary
      const attendanceSummary = attendance.reduce((acc: any, record: any) => {
        acc[record.status] = (acc[record.status] || 0) + 1;
        return acc;
      }, {});

      return {
        student,
        attendance,
        violations,
        totalPoints,
        attendanceSummary,
      };
    },
    enabled: !!searchedNis,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaToken) {
      toast.error("Silakan verifikasi captcha terlebih dahulu");
      return;
    }
    setSearchedNis(nis);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'ringan':
        return 'default';
      case 'sedang':
        return 'secondary';
      case 'berat':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'hadir':
        return 'default';
      case 'sakit':
        return 'secondary';
      case 'izin':
        return 'secondary';
      case 'alpa':
        return 'destructive';
      default:
        return 'default';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4">
      <div className="max-w-6xl mx-auto space-y-6 py-8">
        <Card className="border-2">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Cek Kehadiran & Poin Pelanggaran</CardTitle>
            <CardDescription>Masukkan NIS untuk melihat data kehadiran dan pelanggaran siswa</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nis">Nomor Induk Siswa (NIS)</Label>
                <div className="flex gap-2">
                  <Input
                    id="nis"
                    placeholder="Masukkan NIS..."
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                    required
                  />
                  <Button type="submit" disabled={isLoading || !captchaToken}>
                    <Search className="h-4 w-4 mr-2" />
                    Cari
                  </Button>
                </div>
              </div>
              
              <div className="flex justify-center mt-4">
                <ReCAPTCHA
                  ref={(ref) => setCaptchaRef(ref)}
                  sitekey={RECAPTCHA_SITE_KEY}
                  onChange={(token) => setCaptchaToken(token)}
                />
              </div>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Data tidak ditemukan. Pastikan NIS yang dimasukkan benar.
            </AlertDescription>
          </Alert>
        )}

        {studentData && (
          <div className="space-y-6">
            {/* Student Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Informasi Siswa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  {studentData.student.photo_url ? (
                    <img 
                      src={studentData.student.photo_url} 
                      alt={studentData.student.full_name}
                      className="h-20 w-20 rounded-full object-cover shadow-md border-2 border-muted"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-4 flex-1">
                    <div>
                      <p className="text-sm text-muted-foreground">Nama Lengkap</p>
                      <p className="font-semibold text-lg">{studentData.student.full_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">NIS</p>
                      <p className="font-semibold">{studentData.student.nis}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Kelas</p>
                      <p className="font-semibold">{studentData.student.classes?.name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">NISN</p>
                      <p className="font-semibold">{studentData.student.nisn || '-'}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Violation Points Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Total Poin Pelanggaran
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center p-8">
                  <Badge variant="destructive" className="text-4xl px-8 py-4">
                    {studentData.totalPoints} Poin
                  </Badge>
                </div>
                {studentData.totalPoints > 0 && (
                  <p className="text-center text-sm text-muted-foreground mt-4">
                    Total dari {studentData.violations.length} pelanggaran
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Violations Table */}
            {studentData.violations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Riwayat Pelanggaran</CardTitle>
                  <CardDescription>Daftar pelanggaran yang tercatat</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Jenis Pelanggaran</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-right">Poin</TableHead>
                        <TableHead>Catatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentData.violations.map((violation: any) => (
                        <TableRow key={violation.id}>
                          <TableCell>
                            {format(new Date(violation.violation_date), 'dd MMM yyyy', { locale: idLocale })}
                          </TableCell>
                          <TableCell className="font-medium">
                            {violation.violation_types?.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getCategoryColor(violation.violation_types?.category)}>
                              {violation.violation_types?.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {violation.points}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {violation.notes || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Attendance Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Ringkasan Kehadiran
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">{studentData.attendanceSummary.hadir || 0}</p>
                    <p className="text-sm text-muted-foreground">Hadir</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">{studentData.attendanceSummary.sakit || 0}</p>
                    <p className="text-sm text-muted-foreground">Sakit</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">{studentData.attendanceSummary.izin || 0}</p>
                    <p className="text-sm text-muted-foreground">Izin</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted">
                    <p className="text-2xl font-bold">{studentData.attendanceSummary.alpa || 0}</p>
                    <p className="text-sm text-muted-foreground">Alpa</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Attendance */}
            <Card>
              <CardHeader>
                <CardTitle>Kehadiran Terbaru</CardTitle>
                <CardDescription>20 catatan kehadiran terakhir</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Mata Pelajaran</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Catatan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentData.attendance.map((record: any) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          {format(new Date(record.date), 'dd MMM yyyy', { locale: idLocale })}
                        </TableCell>
                        <TableCell>{record.schedules?.subject || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusColor(record.status)}>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {record.notes || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
