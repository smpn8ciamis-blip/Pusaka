import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { X, Sparkles, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const LAST_SEEN_VERSION_KEY = 'app_last_seen_version';
const LAST_SEEN_REVISION_KEY = 'app_last_seen_revision';

interface AppVersion {
  id: string;
  version: string;
  revision: string;
  release_date: string;
  is_current: boolean;
}

export const VersionNotification = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data: currentVersion } = useQuery({
    queryKey: ['current-version-notification'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_versions')
        .select('*')
        .eq('is_current', true)
        .maybeSingle();
      
      if (error) throw error;
      return data as AppVersion | null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!currentVersion || dismissed) return;

    const lastSeenVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    const lastSeenRevision = localStorage.getItem(LAST_SEEN_REVISION_KEY);

    // Check if there's a new version or revision
    const isNewVersion = lastSeenVersion !== currentVersion.version;
    const isNewRevision = lastSeenRevision !== currentVersion.revision;

    if (isNewVersion || isNewRevision) {
      setIsVisible(true);
    }
  }, [currentVersion, dismissed]);

  const handleDismiss = () => {
    if (currentVersion) {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion.version);
      localStorage.setItem(LAST_SEEN_REVISION_KEY, currentVersion.revision);
    }
    setIsVisible(false);
    setDismissed(true);
  };

  const handleViewChangelog = () => {
    handleDismiss();
    navigate('/changelog');
  };

  if (!isVisible || !currentVersion) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-gradient-to-r from-primary/90 to-primary rounded-lg shadow-lg border border-primary/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-primary-foreground">
                Versi Baru Tersedia!
              </h4>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                onClick={handleDismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-primary-foreground/80 mt-1">
              Aplikasi telah diperbarui ke versi{' '}
              <span className="font-mono font-semibold">
                {currentVersion.version}
              </span>
              <span className="text-primary-foreground/60 ml-1">
                (rev. {currentVersion.revision})
              </span>
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full gap-2 text-xs h-8"
              onClick={handleViewChangelog}
            >
              <ExternalLink className="h-3 w-3" />
              Lihat Perubahan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
