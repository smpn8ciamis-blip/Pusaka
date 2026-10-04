import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

interface StudentViolationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStudent: any;
  violationDetails: any[];
  getPeriodLabel: () => string;
}

export const StudentViolationModal = ({
  isOpen,
  onClose,
  selectedStudent,
  violationDetails,
  getPeriodLabel
}: StudentViolationModalProps) => {
  if (!selectedStudent) return null;

  const chartData = violationDetails && violationDetails.length > 0 ? (() => {
    const dateGroups = new Map();
    violationDetails.forEach((v: any) => {
      const date = v.violation_date;
      if (!dateGroups.has(date)) {
        dateGroups.set(date, { count: 0, points: 0 });
      }
      const group = dateGroups.get(date);
      group.count += 1;
      group.points += v.points;
    });

    return Array.from(dateGroups.entries())
      .map(([date, data]) => ({
        date: format(parseISO(date), 'dd MMM', { locale: localeId }),
        fullDate: date,
        count: data.count,
        points: data.points
      }))
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  })() : [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Detail Riwayat Keterlambatan - {selectedStudent?.full_name}
          </DialogTitle>
          <div className="text-sm text-muted-foreground mt-2">
            NIS: {selectedStudent?.nis} • Kelas: {selectedStudent?.classes?.name || '-'}
          </div>
          <div className="flex gap-2 mt-2">
            <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
              {getPeriodLabel()}
            </Badge>
            <Badge variant="outline">
              Total: {selectedStudent?.latePoints} poin
            </Badge>
            <Badge variant="outline">
              {selectedStudent?.lateCount}x terlambat
            </Badge>
          </div>
        </DialogHeader>
        
        <div className="mt-4 space-y-6">
          {/* Timeline Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Grafik Timeline Keterlambatan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                              <p className="font-medium">{payload[0].payload.date}</p>
                              <p className="text-sm text-orange-600">
                                {payload[0].value}x terlambat
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Total: {payload[0].payload.points} poin
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" fill="#ea580c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">
                      {violationDetails.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Pelanggaran</div>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">
                      {selectedStudent?.latePoints}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Poin</div>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">
                      {Math.round(selectedStudent?.latePoints / selectedStudent?.lateCount)}
                    </div>
                    <div className="text-xs text-muted-foreground">Rata-rata Poin</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table Details */}
          {violationDetails && violationDetails.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Riwayat Detail</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Jenis Pelanggaran</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-center">Poin</TableHead>
                        <TableHead>Catatan</TableHead>
                        <TableHead>Pelapor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {violationDetails.map((violation: any, idx: number) => (
                        <TableRow key={violation.id}>
                          <TableCell className="font-medium">{idx + 1}</TableCell>
                          <TableCell>
                            {format(parseISO(violation.violation_date), 'dd MMM yyyy', { locale: localeId })}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(parseISO(violation.created_at), 'HH:mm', { locale: localeId })} WIB
                          </TableCell>
                          <TableCell>{violation.violation_types?.name || '-'}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                violation.violation_types?.category === 'berat' ? 'destructive' : 
                                violation.violation_types?.category === 'sedang' ? 'default' : 
                                'secondary'
                              }
                            >
                              {violation.violation_types?.category || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-bold text-orange-600">
                            {violation.points}
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="text-sm text-muted-foreground truncate" title={violation.notes}>
                              {violation.notes || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {violation.reporter?.full_name || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Tidak ada data pelanggaran pada periode ini
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
