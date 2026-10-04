import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, BookOpen, Trophy, AlertTriangle, CheckCircle, XCircle, Star, Sparkles, Clock, Bell, FileText, TrendingUp, ChevronRight, AlertCircle, BadgeCheck, Hash, Users, GraduationCap, CreditCard, IdCard, UserCircle, MapPin, CalendarDays, User, Phone } from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { AcademicYearSelector } from "@/components/AcademicYearSelector";
import StudentUploadTab from "./StudentUploadTab";

export default function StudentRenderTabs({ 
  activeTab, 
  student, 
  classInfo, 
  todaySchedules, 
  schedulesLoading,
  attendanceSummary, 
  attendanceLoading,
  violations, 
  achievements, 
  grades, 
  gradesLoading, 
  attendanceLogs, 
  logsLoading,
  announcements, 
  dispensations,
  showData, 
  averageGrade, 
  totalViolationPoints,
  attendancePercentage,
  dayNames,
  handleTabChange,
  studentId,
  classId
}: any) {

  const renderOverview = () => (
    <div className="space-y-3 p-4">
      <div className="mb-4"><AcademicYearSelector /></div>
      <div>
        <div className="flex items-center justify-between mb-3"><h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Statistik Saya</h3></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-100 p-3 rounded-2xl shadow-lg relative border border-blue-200">
            <div className="flex items-start justify-between">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-blue-600"><BookOpen className="h-4 w-4" /></div>
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <p className="text-2xl font-extrabold text-gray-800 mt-2">{showData ? (averageGrade || '-') : '•••'}</p>
            <p className="text-xs text-blue-600 font-medium">Rata-rata Nilai</p>
            <p className="text-xs text-blue-400 mt-0.5">{showData ? `${grades?.length || 0} Mapel` : '•••'}</p>
          </div>
          <div className="bg-amber-100 p-3 rounded-2xl shadow-lg relative border border-amber-200">
            <div className="flex items-start justify-between">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-amber-600"><AlertTriangle className="h-4 w-4" /></div>
              <AlertCircle className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-2xl font-extrabold text-gray-800 mt-2">{showData ? totalViolationPoints : '•••'}</p>
            <p className="text-xs text-amber-600 font-medium">Poin Pelanggaran</p>
            <p className="text-xs text-amber-400 mt-0.5">{showData ? `${violations?.length || 0} Catatan` : '•••'}</p>
          </div>
          <div className="bg-green-100 p-3 rounded-2xl shadow-lg relative border border-green-200">
            <div className="flex items-start justify-between">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-green-600"><Trophy className="h-4 w-4" /></div>
              <BadgeCheck className="h-4 w-4 text-green-400" />
            </div>
            <p className="text-2xl font-extrabold text-gray-800 mt-2">{showData ? achievements?.length || 0 : '•••'}</p>
            <p className="text-xs text-green-600 font-medium">Total Prestasi</p>
            <p className="text-xs text-green-400 mt-0.5">{showData ? 'Penghargaan' : '•••'}</p>
          </div>
          <div className="bg-purple-100 p-3 rounded-2xl shadow-lg relative border border-purple-200">
            <div className="flex items-start justify-between">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-purple-600"><Calendar className="h-4 w-4" /></div>
              <ChevronRight className="h-4 w-4 text-purple-400" />
            </div>
            <p className="text-2xl font-extrabold text-gray-800 mt-2">{showData ? todaySchedules?.length || 0 : '•••'}</p>
            <p className="text-xs text-purple-600 font-medium">Mapel Hari Ini</p>
            <p className="text-xs text-purple-400 mt-0.5">{showData ? dayNames[new Date().getDay()] : '•••'}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAttendanceTab = () => (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">Detail Kehadiran</h2>
      <div className="bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200">
        <div className="flex items-center justify-between">
          <div><p className="text-emerald-100 text-xs">Persentase Kehadiran</p><h2 className="text-4xl font-extrabold mt-1">{attendancePercentage}%</h2><p className="text-emerald-100 text-sm mt-1">{attendanceSummary?.hadir || 0} dari {attendanceSummary?.total || 0} hari</p></div>
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center"><CheckCircle className="h-7 w-7" /></div>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
        <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 mb-4">
          <div className="bg-emerald-500 h-full" style={{ width: `${(attendanceSummary?.hadir / attendanceSummary?.total) * 100}%` }} />
          <div className="bg-blue-500 h-full" style={{ width: `${(attendanceSummary?.izin / attendanceSummary?.total) * 100}%` }} />
          <div className="bg-amber-500 h-full" style={{ width: `${(attendanceSummary?.sakit / attendanceSummary?.total) * 100}%` }} />
          <div className="bg-red-500 h-full" style={{ width: `${(attendanceSummary?.alpa / attendanceSummary?.total) * 100}%` }} />
        </div>
        <div className="grid grid-cols-5 gap-2 text-center">
          <div><div className="w-3 h-3 rounded-full bg-emerald-500 mx-auto mb-1"></div><p className="text-xs text-gray-500">Hadir</p><p className="font-bold text-gray-800 dark:text-gray-100">{attendanceSummary?.hadir || 0}</p></div>
          <div><div className="w-3 h-3 rounded-full bg-blue-500 mx-auto mb-1"></div><p className="text-xs text-gray-500">Izin</p><p className="font-bold text-gray-800 dark:text-gray-100">{attendanceSummary?.izin || 0}</p></div>
          <div><div className="w-3 h-3 rounded-full bg-amber-500 mx-auto mb-1"></div><p className="text-xs text-gray-500">Sakit</p><p className="font-bold text-gray-800 dark:text-gray-100">{attendanceSummary?.sakit || 0}</p></div>
          <div><div className="w-3 h-3 rounded-full bg-red-500 mx-auto mb-1"></div><p className="text-xs text-gray-500">Alpa</p><p className="font-bold text-gray-800 dark:text-gray-100">{attendanceSummary?.alpa || 0}</p></div>
          <div><div className="w-3 h-3 rounded-full bg-orange-500 mx-auto mb-1"></div><p className="text-xs text-gray-500">Telat</p><p className="font-bold text-gray-800 dark:text-gray-100">{attendanceSummary?.terlambat || 0}</p></div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Log Absensi Siswa</h3>
        {logsLoading ? <div className="text-center py-6 text-gray-400">Memuat log absensi...</div> : attendanceLogs && attendanceLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700"><th className="text-left py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">No</th><th className="text-left py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">Hari/Tanggal</th><th className="text-center py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">Jam Masuk</th><th className="text-center py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">Jam Pulang</th><th className="text-center py-2 px-2 font-semibold text-gray-500 dark:text-gray-400">Keterangan</th></tr></thead>
              <tbody>
                {attendanceLogs.map((log: any, idx: number) => {
                  const dateObj = new Date(log.date); const dayName = dayNames[dateObj.getDay()]; const dateStr = format(dateObj, 'dd MMM yyyy', { locale: localeId }); const isLate = log.status?.toLowerCase() === 'terlambat'; const checkInTime = log.check_in_at ? format(new Date(log.check_in_at), 'HH:mm', { locale: localeId }) : '-'; const checkOutTime = log.check_out_at ? format(new Date(log.check_out_at), 'HH:mm', { locale: localeId }) : '-';
                  return (
                    <tr key={log.id} className="border-b border-gray-50 dark:border-gray-800 last:border-b-0">
                      <td className="py-3 px-2">{idx + 1}</td><td className="py-3 px-2"><p className="font-medium text-gray-800 dark:text-gray-100">{dayName}</p><p className="text-xs text-gray-500">{dateStr}</p></td><td className="py-3 px-2 text-center font-mono text-gray-700 dark:text-gray-300">{checkInTime}</td><td className="py-3 px-2 text-center font-mono text-gray-700 dark:text-gray-300">{checkOutTime}</td><td className="py-3 px-2 text-center">{isLate ? <Badge className="bg-red-100 text-red-700 text-[10px]">Terlambat</Badge> : <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Tepat Waktu</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="text-center py-6 text-gray-400 text-sm">Belum ada data absensi</div>}
      </div>
    </div>
  );

  const renderScheduleTab = () => (
    <div className="p-4 space-y-4">
      <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-200"><h2 className="text-lg font-bold">Jadwal Hari Ini</h2><p className="text-blue-100 text-sm">{dayNames[new Date().getDay()]}, {format(new Date(), 'dd MMMM yyyy', { locale: localeId })}</p><Badge className="bg-white/20 text-xs mt-2">{todaySchedules?.length || 0} Mapel</Badge></div>
      <div className="space-y-2">
        {schedulesLoading ? <div className="text-center py-12 text-gray-400">Memuat jadwal...</div> : todaySchedules && todaySchedules.length > 0 ? todaySchedules.map((schedule: any) => (
          <div key={schedule.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-gray-100 dark:border-gray-800 flex items-center gap-4">
            <div className="bg-blue-50 dark:bg-gray-800 rounded-lg p-2 text-center w-14 shrink-0"><p className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">{schedule.start_time?.slice(0, 5)}</p><p className="font-mono text-xs text-gray-400">{schedule.end_time?.slice(0, 5)}</p></div>
            <div className="flex-1 min-w-0"><p className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate">{schedule.subject}</p><p className="text-xs text-gray-500 truncate">{schedule.teachers?.profiles?.full_name}</p></div>
          </div>
        )) : <div className="text-center py-12 text-gray-400"><Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" /><p className="text-base font-medium">Tidak ada jadwal hari ini</p></div>}
      </div>
    </div>
  );

  const renderGradesTab = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Nilai Akademik</h2><Badge className="bg-blue-100 text-blue-700 text-xs">{grades?.length || 0} Mapel</Badge></div>
      <div className="grid grid-cols-2 gap-3"><div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-200"><p className="text-blue-100 text-xs">Rata-rata</p><p className="text-3xl font-extrabold">{averageGrade || '-'}</p></div><div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-800"><p className="text-xs text-gray-400">Jumlah Nilai</p><p className="text-3xl font-extrabold text-gray-800 dark:text-gray-100">{grades?.length || 0}</p></div></div>
      <div className="space-y-2">
        {gradesLoading ? <div className="text-center py-12 text-gray-400">Memuat nilai...</div> : grades && grades.length > 0 ? grades.map((grade: any) => {
          const score = grade.final_grade || 0; const scoreColor = score >= 80 ? "text-emerald-600" : score >= 70 ? "text-blue-600" : "text-red-600";
          return (
            <div key={grade.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-2"><p className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate flex-1">{grade.schedules?.subject}</p><span className={`text-lg font-bold ${scoreColor}`}>{grade.final_grade?.toFixed(1) || '-'}</span></div>
              <div className="grid grid-cols-5 gap-1 text-center">{[{ label: 'Tugas', value: grade.tugas },{ label: 'Kuis', value: grade.kuis },{ label: 'UTS', value: grade.uts },{ label: 'UAS', value: grade.uas },{ label: 'Praktik', value: grade.praktik }].map((item) => <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg py-1"><p className="text-[10px] text-gray-400">{item.label}</p><p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.value || '-'}</p></div>)}</div>
            </div>
          );
        }) : <div className="text-center py-12 text-gray-400"><BookOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" /><p className="text-base font-medium">Belum ada nilai</p></div>}
      </div>
    </div>
  );

  const renderViolationsTab = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Pelanggaran</h2><Badge className={`text-xs ${totalViolationPoints === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{totalViolationPoints} Poin</Badge></div>
      {violations ? violations.length > 0 ? violations.map((violation: any) => (
        <div key={violation.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-red-100 dark:border-red-900/30 flex items-start gap-3"><div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0"><XCircle className="h-5 w-5 text-red-500" /></div><div className="flex-1 min-w-0"><p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{violation.violation_types?.name}</p><p className="text-xs text-gray-500 mt-1">{format(new Date(violation.violation_date), 'dd MMMM yyyy', { locale: localeId })}</p>{violation.notes && <p className="text-xs text-gray-400 mt-1 italic">"{violation.notes}"</p>}</div><Badge variant="destructive" className="text-xs shrink-0">{violation.points} Poin</Badge></div>
      )) : <div className="text-center py-12"><div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><Sparkles className="h-8 w-8 text-emerald-500" /></div><p className="text-base font-medium text-gray-800 dark:text-gray-100">Bersih!</p><p className="text-sm text-gray-400 mt-1">Tidak ada pelanggaran</p></div> : <div className="text-center py-12 text-gray-400">Memuat...</div>}
    </div>
  );

  const renderAchievementsTab = () => (
    <div className="p-4 space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Prestasi</h2><Badge className="bg-amber-100 text-amber-700 text-xs">{achievements?.length || 0} Penghargaan</Badge></div>
      {achievements ? achievements.length > 0 ? achievements.map((achievement: any) => (
        <div key={achievement.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-amber-100 dark:border-amber-900/30 flex items-start gap-3"><div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shrink-0"><Medal className="h-5 w-5 text-amber-500" /></div><div className="flex-1 min-w-0"><p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{achievement.title}</p><p className="text-xs text-gray-500 mt-1">{format(new Date(achievement.achievement_date), 'dd MMMM yyyy', { locale: localeId })}</p>{achievement.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{achievement.description}</p>}</div><span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-700 shrink-0">{achievement.level || 'Sekolah'}</span></div>
      )) : <div className="text-center py-12"><div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3"><Star className="h-8 w-8 text-amber-400" /></div><p className="text-base font-medium text-gray-800 dark:text-gray-100">Belum ada prestasi</p><p className="text-sm text-gray-400 mt-1">Terus semangat!</p></div> : <div className="text-center py-12 text-gray-400">Memuat...</div>}
    </div>
  );

  const renderAnnouncementsTab = () => (
    <div className="p-4 space-y-4"><h2 className="text-lg font-bold">Pengumuman</h2>
      {announcements ? announcements.length > 0 ? announcements.map((announcement: any) => (
        <div key={announcement.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-gray-100 dark:border-gray-800"><div className="flex items-start gap-3"><div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center shrink-0"><Bell className="h-5 w-5 text-blue-500" /></div><div className="flex-1 min-w-0"><p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{announcement.title}</p><p className="text-xs text-gray-500 mt-1 line-clamp-3">{announcement.content}</p><p className="text-xs text-gray-400 mt-2">{format(new Date(announcement.created_at), 'dd MMMM yyyy', { locale: localeId })}</p></div></div></div>
      )) : <div className="text-center py-12 text-gray-400"><Bell className="h-12 w-12 mx-auto mb-3 text-gray-300" /><p className="text-base font-medium">Tidak ada pengumuman</p></div> : <div className="text-center py-12 text-gray-400">Memuat...</div>}
    </div>
  );

  const renderDispensasiTab = () => (
    <div className="p-4 space-y-4"><h2 className="text-lg font-bold">Riwayat Dispensasi</h2>
      {dispensations ? dispensations.length > 0 ? dispensations.map((d: any) => (
        <div key={d.id} className="bg-white dark:bg-gray-900 rounded-xl p-4 shadow-lg border border-gray-100 dark:border-gray-800 flex items-start gap-3"><div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shrink-0"><Clock className="h-5 w-5 text-amber-500" /></div><div className="flex-1 min-w-0"><p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{format(new Date(d.dispensation_date), 'dd MMMM yyyy', { locale: localeId })}</p><p className="text-xs text-gray-500 mt-1 line-clamp-2">{d.reason}</p><Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs mt-2 capitalize">{d.reason_category}</Badge></div></div>
      )) : <div className="text-center py-12 text-gray-400"><CheckCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" /><p className="text-base font-medium">Tidak ada dispensasi</p></div> : <div className="text-center py-12 text-gray-400">Memuat...</div>}
    </div>
  );

  const renderProfileTab = () => {
    const biodataItems = [
      { icon: Hash, label: 'NIS', value: student?.nis || '-', color: 'bg-blue-100 text-blue-600' },
      { icon: Hash, label: 'NISN', value: student?.nisn || '-', color: 'bg-purple-100 text-purple-600' },
      { icon: GraduationCap, label: 'Kelas', value: classInfo?.name || '-', color: 'bg-green-100 text-green-600' },
      { icon: Users, label: 'Wali Kelas', value: classInfo?.teachers?.profiles?.full_name || '-', color: 'bg-yellow-100 text-yellow-600' },
      { icon: User, label: 'Jenis Kelamin', value: student?.gender ? (student.gender === 'L' ? 'Laki-laki' : 'Perempuan') : '-', color: 'bg-blue-100 text-blue-600' },
      { icon: CalendarDays, label: 'Tanggal Lahir', value: student?.birth_date ? format(new Date(student.birth_date), 'dd MMMM yyyy', { locale: localeId }) : '-', color: 'bg-purple-100 text-purple-600' },
      { icon: MapPin, label: 'Tempat Lahir', value: student?.birth_place || '-', color: 'bg-green-100 text-green-600' },
      { icon: MapPin, label: 'Alamat', value: student?.address || '-', color: 'bg-yellow-100 text-yellow-600', multiline: true },
      { icon: UserCircle, label: 'Orang Tua', value: student?.parent_name || '-', color: 'bg-blue-100 text-blue-600' },
      { icon: Phone, label: 'No. HP', value: student?.parent_phone ? `+${student.parent_phone}` : '-', color: 'bg-green-100 text-green-600' },
      { icon: IdCard, label: 'Status', value: student?.status ? (student.status === 'active' ? 'Aktif' : student.status) : 'Aktif', color: 'bg-purple-100 text-purple-600' },
      { icon: CreditCard, label: 'RFID UID', value: student?.rfid_uid || 'Belum terdaftar', color: 'bg-yellow-100 text-yellow-600' }
    ];

    return (
      <div className="space-y-4 p-4">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-200">
          <div className="flex items-center gap-4">
            <div className="relative">
              {student?.photo_url ? <img src={student.photo_url} alt="Foto" className="w-16 h-16 rounded-full object-cover border-4 border-white/30" /> : <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold border-4 border-white/30">{student?.full_name?.charAt(0) || 'S'}</div>}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold truncate">{student?.full_name || 'Siswa'}</h2>
              <p className="text-blue-100 text-sm">{classInfo?.name || 'Kelas belum diatur'}</p>
              <div className="flex gap-2 mt-2"><Badge className="bg-white/20 text-xs">Aktif</Badge></div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">{biodataItems.map((item) => <div key={item.label} className={`bg-white dark:bg-gray-900 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-800 ${item.multiline ? 'col-span-2' : ''}`}><div className={`w-8 h-8 rounded-full ${item.color} flex items-center justify-center mb-2`}><item.icon className="h-4 w-4" /></div><p className="text-xs text-gray-400">{item.label}</p><p className="text-sm font-semibold text-gray-800 dark:text-gray-100 line-clamp-2">{item.value}</p></div>)}</div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'profile': return renderProfileTab();
      case 'schedule': return renderScheduleTab();
      case 'grades': return renderGradesTab();
      case 'attendance': return renderAttendanceTab();
      case 'violations': return renderViolationsTab();
      case 'achievements': return renderAchievementsTab();
      case 'announcements': return renderAnnouncementsTab();
      case 'dispensasi': return renderDispensasiTab();
      case 'uploads': return <StudentUploadTab studentId={studentId} classId={classId} />;
      default: return renderOverview();
    }
  };

  return renderContent();
}