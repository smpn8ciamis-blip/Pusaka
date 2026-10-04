import { GraduationCap, Clock, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface DashboardWelcomeBannerProps {
  profile: any;
  userRole: string | null;
  teacherData?: any;
}

export const DashboardWelcomeBanner = ({ profile, userRole, teacherData }: DashboardWelcomeBannerProps) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const hour = currentTime.getHours();
    if (hour < 12) setGreeting(`Selamat pagi! Semangat mengajar hari ini!`);
    else if (hour < 15) setGreeting(`Selamat siang! Tetap semangat!`);
    else if (hour < 18) setGreeting(`Selamat sore! Hari yang produktif!`);
    else setGreeting(`Selamat malam! Istirahat yang cukup!`);
  }, [currentTime]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('id-ID', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const displayName = profile?.full_name || (userRole === 'admin' ? 'Admin' : 'Guru');
  const photoUrl = teacherData?.photo_url;
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="relative overflow-hidden rounded-2xl p-8 text-white shadow-2xl bg-gradient-primary">
      <div className="relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <div className="flex items-center mb-4">
              {photoUrl ? (
                <Avatar className="w-16 h-16 mr-4 border-2 border-white/30 shadow-xl">
                  <AvatarImage src={photoUrl} alt={displayName} className="object-cover" />
                  <AvatarFallback className="bg-white/20 text-white text-lg font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mr-4">
                  <GraduationCap className="w-8 h-8" />
                </div>
              )}
              <div>
                <h1 className="text-4xl font-bold mb-2">
                  {displayName} 👋
                </h1>
                <div className="space-y-1">
                  <p className="text-blue-100 text-lg opacity-90">
                    {userRole === 'admin' ? 'Administrator' : 'Guru'}
                    {teacherData?.subject && ` • ${teacherData.subject}`}
                    {' '}• {greeting}
                  </p>
                  {teacherData?.is_homeroom_teacher && teacherData?.homeroomClass && (
                    <p className="text-yellow-200 text-sm font-medium">
                      🏫 Wali Kelas {teacherData.homeroomClass.name}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-6 mt-6">
              <div className="flex items-center bg-white/20 px-4 py-2 rounded-xl backdrop-blur-sm">
                <Clock className="mr-3 text-yellow-300" />
                <div>
                  <div className="text-2xl font-mono font-bold">{formatTime(currentTime)}</div>
                  <div className="text-blue-100 text-sm opacity-80">{formatDate(currentTime)}</div>
                </div>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                <span className="text-sm text-green-200">Sistem Online</span>
              </div>
            </div>
          </div>
          
          <div className="hidden lg:block">
            <div className="w-32 h-32 bg-white/20 rounded-full flex items-center justify-center relative backdrop-blur-sm">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full opacity-20 animate-ping"></div>
              <Activity className="w-16 h-16 opacity-80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
