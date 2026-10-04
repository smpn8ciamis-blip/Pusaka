import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION, REVISION } from '@/config/version';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';

export const AppFooter = () => {
  const navigate = useNavigate();
  
  const { data: appName } = useQuery({
    queryKey: ['app-name-footer'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_app_name');
      
      if (error) throw error;
      return data as string;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch current version from database
  const { data: currentVersion } = useQuery({
    queryKey: ['current-version-footer'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_versions')
        .select('version, revision')
        .eq('is_current', true)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const displayAppName = appName || 'Sistem Manajemen Sekolah';
  const currentYear = new Date().getFullYear();
  
  // Use database version if available, fallback to static
  const displayVersion = currentVersion?.version || APP_VERSION;
  const displayRevision = currentVersion?.revision || REVISION;

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-card/95 backdrop-blur-sm py-2.5 print:block">
      <div className="container mx-auto px-3">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          <p className="text-[11px] text-muted-foreground">
            © {currentYear} {displayAppName}
          </p>
          <span className="text-muted-foreground/30 hidden sm:inline">•</span>
          <p className="text-[11px] text-muted-foreground">
            Dikembangkan oleh: <span className="font-medium text-foreground/80">Yusup Jati Gumilar</span>
          </p>
          <span className="text-muted-foreground/30 hidden sm:inline">•</span>
          <button 
            onClick={() => navigate('/changelog')}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors cursor-pointer group"
          >
            <Sparkles className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 font-mono border-border/50">
              v{displayVersion}
            </Badge>
            <span className="font-mono text-muted-foreground/40">r{displayRevision}</span>
          </button>
        </div>
      </div>
    </footer>
  );
};
