import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList, FileText, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DashboardTeacherViewProps {
  teacherTasks: any;
}

export const DashboardTeacherView = ({ teacherTasks }: DashboardTeacherViewProps) => {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Link to="/attendance">
        <Card className="card-hover border-none shadow-md cursor-pointer transition-all hover:shadow-lg">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center">
                <ClipboardList className="h-7 w-7 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Absensi Pending</h3>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-primary">
                    {teacherTasks?.pendingAttendance || 0}
                  </span>
                  <span className="text-sm text-muted-foreground">kelas</span>
                </div>
                {teacherTasks?.pendingAttendance > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-orange-600">
                    <AlertCircle className="h-3 w-3" />
                    <span className="text-xs">Perlu ditindaklanjuti</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link to="/journals">
        <Card className="card-hover border-none shadow-md cursor-pointer transition-all hover:shadow-lg">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center">
                <FileText className="h-7 w-7 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Jurnal Pending</h3>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-primary">
                    {teacherTasks?.pendingJournals || 0}
                  </span>
                  <span className="text-sm text-muted-foreground">kelas</span>
                </div>
                {teacherTasks?.pendingJournals > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-orange-600">
                    <AlertCircle className="h-3 w-3" />
                    <span className="text-xs">Perlu ditindaklanjuti</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
};
