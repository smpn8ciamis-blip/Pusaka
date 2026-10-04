import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Users, CalendarIcon, Download, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface DashboardAttendanceRecapProps {
  startDate: Date;
  endDate: Date;
  setStartDate: (date: Date) => void;
  setEndDate: (date: Date) => void;
  setPeriod: (period: 'today' | 'week' | 'month') => void;
  attendanceRecap: any;
  onExportPDF: () => void;
  onExportExcel: () => void;
}

export const DashboardAttendanceRecap = ({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  setPeriod,
  attendanceRecap,
  onExportPDF,
  onExportExcel
}: DashboardAttendanceRecapProps) => {
  return (
    <Card className="border-none shadow-md">
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Rekap Kehadiran Periode
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Dari Tanggal</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full sm:w-[160px] justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd/MM/yyyy") : <span>Pilih tanggal</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => date && setStartDate(date)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Sampai Tanggal</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full sm:w-[160px] justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd/MM/yyyy") : <span>Pilih tanggal</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={endDate}
                      onSelect={(date) => date && setEndDate(date)}
                      disabled={(date) => date < startDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPeriod('today')}
              className="hover:bg-primary hover:text-primary-foreground"
            >
              Hari Ini
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPeriod('week')}
              className="hover:bg-primary hover:text-primary-foreground"
            >
              Minggu Ini
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPeriod('month')}
              className="hover:bg-primary hover:text-primary-foreground"
            >
              Bulan Ini
            </Button>
            
            <div className="ml-auto flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={onExportPDF}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export PDF
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={onExportExcel}
                className="gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Export Excel
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Hadir</p>
              <p className="text-2xl font-bold">{attendanceRecap?.hadir || 0}</p>
            </div>
            <span className="badge-hadir px-3 py-1 text-sm font-medium rounded-md">H</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Izin</p>
              <p className="text-2xl font-bold">{attendanceRecap?.izin || 0}</p>
            </div>
            <span className="badge-izin px-3 py-1 text-sm font-medium rounded-md">I</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Sakit</p>
              <p className="text-2xl font-bold">{attendanceRecap?.sakit || 0}</p>
            </div>
            <span className="badge-sakit px-3 py-1 text-sm font-medium rounded-md">S</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Alpa</p>
              <p className="text-2xl font-bold">{attendanceRecap?.alpa || 0}</p>
            </div>
            <span className="badge-alpa px-3 py-1 text-sm font-medium rounded-md">A</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
