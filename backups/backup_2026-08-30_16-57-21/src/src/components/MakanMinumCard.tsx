import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UtensilsCrossed, AlertTriangle, ChevronRight, Receipt, Percent } from 'lucide-react';

// Kode rekening untuk makan minum kegiatan
const MAKAN_MINUM_CODES = [
  '5.1.02.01.01.0052',
  '5.1.02.01.01.0053',
  '5.1.02.01.01.0055',
];

interface MakanMinumCardProps {
  items: any[];
  formatCurrency: (value: number) => string;
  getKodeRekeningLabel: (code: string) => string;
  type: 'rkas' | 'spj';
}

export const MakanMinumCard = ({ items, formatCurrency, getKodeRekeningLabel, type }: MakanMinumCardProps) => {
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Calculate makan minum statistics
  const makanMinumStats = useMemo(() => {
    const filtered = items.filter(item => {
      const code = (item.kode_rekening || '').trim().replace(/\s+/g, '');
      return MAKAN_MINUM_CODES.some(mkCode => code === mkCode || code.startsWith(mkCode));
    });

    const byCode: Record<string, { code: string; total: number; count: number; activities: string[] }> = {};
    let totalAmount = 0;

    filtered.forEach(item => {
      const code = (item.kode_rekening || '').trim().replace(/\s+/g, '');
      const amount = type === 'rkas' 
        ? Number(item.total_amount) || 0 
        : Number(item.amount) || 0;
      const activityName = item.activity_name || '-';

      totalAmount += amount;

      if (!byCode[code]) {
        byCode[code] = { code, total: 0, count: 0, activities: [] };
      }
      byCode[code].total += amount;
      byCode[code].count += 1;
      if (activityName !== '-' && !byCode[code].activities.includes(activityName)) {
        byCode[code].activities.push(activityName);
      }
    });

    // Calculate potential regional tax (10%)
    const potensiPajakDaerah = totalAmount * 0.1;

    return {
      totalAmount,
      potensiPajakDaerah,
      byCode: Object.values(byCode).sort((a, b) => a.code.localeCompare(b.code)),
      itemCount: filtered.length,
      items: filtered,
    };
  }, [items, type]);

  if (makanMinumStats.totalAmount === 0) {
    return null;
  }

  return (
    <>
      <Card 
        className="border border-orange-200 dark:border-orange-900/50 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 cursor-pointer hover:shadow-md transition-all group"
        onClick={() => setIsDetailOpen(true)}
      >
        <CardContent className="p-3 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 md:p-2 rounded-lg bg-orange-500/10 dark:bg-orange-500/20">
                <UtensilsCrossed className="h-4 w-4 md:h-5 md:w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h4 className="text-xs md:text-sm font-semibold text-foreground">Makan Minum Kegiatan</h4>
                <p className="text-[10px] md:text-xs text-muted-foreground">{makanMinumStats.itemCount} item belanja</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>

          <div className="space-y-2">
            {/* Total Amount */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total Anggaran:</span>
              <span className="text-sm md:text-base font-bold text-orange-600 dark:text-orange-400">
                {formatCurrency(makanMinumStats.totalAmount)}
              </span>
            </div>

            {/* Tax Info */}
            <div className="p-2 bg-yellow-100/50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800/50">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Percent className="h-3 w-3 text-yellow-600 dark:text-yellow-500" />
                    <span className="text-[10px] md:text-xs font-medium text-yellow-700 dark:text-yellow-400">Potensi Pajak Daerah (10%)</span>
                  </div>
                  <span className="text-xs md:text-sm font-bold text-yellow-700 dark:text-yellow-400">
                    {formatCurrency(makanMinumStats.potensiPajakDaerah)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drill-down Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-orange-600" />
              Rincian Makan Minum Kegiatan
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-orange-200 dark:border-orange-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                      <Receipt className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Anggaran</p>
                      <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                        {formatCurrency(makanMinumStats.totalAmount)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-yellow-200 dark:border-yellow-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                      <Percent className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Potensi Pajak Daerah (10%)</p>
                      <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                        {formatCurrency(makanMinumStats.potensiPajakDaerah)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 dark:border-blue-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <UtensilsCrossed className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Anggaran Setelah Pajak</p>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {formatCurrency(makanMinumStats.totalAmount - makanMinumStats.potensiPajakDaerah)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Info Banner */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Keterangan Potensi Pajak Daerah</p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    Pajak daerah sebesar 10% dikenakan untuk belanja makan minum kegiatan sesuai dengan peraturan perpajakan daerah. 
                    Nilai ini adalah estimasi dan perlu disesuaikan dengan peraturan daerah yang berlaku.
                  </p>
                </div>
              </div>
            </div>

            {/* Breakdown by Kode Rekening */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Rincian per Kode Rekening</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Kode Rekening</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="text-right">Jumlah Item</TableHead>
                    <TableHead className="text-right">Total Anggaran</TableHead>
                    <TableHead className="text-right">Potensi Pajak (10%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {makanMinumStats.byCode.map((item, index) => (
                    <TableRow key={item.code}>
                      <TableCell className="font-mono text-xs">{index + 1}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {item.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {getKodeRekeningLabel(item.code)}
                      </TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                      <TableCell className="text-right font-medium text-orange-600 dark:text-orange-400">
                        {formatCurrency(item.total)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-yellow-600 dark:text-yellow-400">
                        {formatCurrency(item.total * 0.1)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{makanMinumStats.itemCount}</TableCell>
                    <TableCell className="text-right text-orange-600 dark:text-orange-400">
                      {formatCurrency(makanMinumStats.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right text-yellow-600 dark:text-yellow-400">
                      {formatCurrency(makanMinumStats.potensiPajakDaerah)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Detail Items */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Detail Belanja ({makanMinumStats.items.length} item)</h4>
              <div className="max-h-[300px] overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Nama Kegiatan</TableHead>
                      <TableHead>Kode Rekening</TableHead>
                      <TableHead className="text-right">{type === 'rkas' ? 'Anggaran' : 'Realisasi'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {makanMinumStats.items.map((item, index) => (
                      <TableRow key={item.id || index}>
                        <TableCell className="text-xs">{index + 1}</TableCell>
                        <TableCell className="text-sm max-w-[250px] truncate">
                          {item.activity_name || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {item.kode_rekening || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(type === 'rkas' ? (item.total_amount || 0) : (item.amount || 0))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
