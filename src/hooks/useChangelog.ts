import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ChangelogEntry {
  id: string;
  version: string;
  change_type: 'feature' | 'fix' | 'improvement' | 'breaking';
  description: string;
  created_at: string;
  created_by: string | null;
}

export interface AppVersion {
  id: string;
  version: string;
  revision: string;
  release_date: string;
  is_current: boolean;
  created_at: string;
}

export interface GroupedChangelog {
  version: string;
  date: string;
  changes: {
    id: string;
    type: 'feature' | 'fix' | 'improvement' | 'breaking';
    description: string;
  }[];
}

// Helper function to generate revision timestamp
const generateRevisionTimestamp = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}.${hour}${minute}`;
};

export const useChangelog = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch changelog entries
  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['changelog-entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('changelog_entries')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ChangelogEntry[];
    },
  });

  // Fetch current version
  const { data: currentVersion, isLoading: versionLoading } = useQuery({
    queryKey: ['current-version'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_versions')
        .select('*')
        .eq('is_current', true)
        .single();
      
      if (error) throw error;
      return data as AppVersion;
    },
  });

  // Fetch all versions
  const { data: versions = [], isLoading: versionsLoading } = useQuery({
    queryKey: ['app-versions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_versions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as AppVersion[];
    },
  });

  // Group changelog by version
  const groupedChangelog: GroupedChangelog[] = versions.map(ver => {
    const versionEntries = entries.filter(e => e.version === ver.version);
    return {
      version: ver.version,
      date: ver.release_date,
      changes: versionEntries.map(e => ({
        id: e.id,
        type: e.change_type,
        description: e.description,
      })),
    };
  }).filter(g => g.changes.length > 0);

  // Add changelog entry and auto-update revision
  const addEntryMutation = useMutation({
    mutationFn: async (entry: { version: string; change_type: string; description: string }) => {
      // First, insert the changelog entry
      const { data, error } = await supabase
        .from('changelog_entries')
        .insert([entry])
        .select()
        .single();
      
      if (error) throw error;
      
      // Auto-update revision on the current version
      const newRevision = generateRevisionTimestamp();
      const { error: revisionError } = await supabase
        .from('app_versions')
        .update({ revision: newRevision })
        .eq('version', entry.version)
        .eq('is_current', true);
      
      if (revisionError) {
        console.warn('Could not auto-update revision:', revisionError);
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      queryClient.invalidateQueries({ queryKey: ['app-versions'] });
      queryClient.invalidateQueries({ queryKey: ['current-version'] });
      queryClient.invalidateQueries({ queryKey: ['current-version-footer'] });
      queryClient.invalidateQueries({ queryKey: ['current-version-notification'] });
      toast({ title: 'Berhasil', description: 'Changelog berhasil ditambahkan dan revisi diperbarui otomatis' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Delete changelog entry
  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('changelog_entries')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      toast({ title: 'Berhasil', description: 'Changelog berhasil dihapus' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Create new version
  const createVersionMutation = useMutation({
    mutationFn: async (version: { version: string; revision: string }) => {
      const { data, error } = await supabase
        .from('app_versions')
        .insert([{ ...version, is_current: true }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-versions'] });
      queryClient.invalidateQueries({ queryKey: ['current-version'] });
      toast({ title: 'Berhasil', description: 'Versi baru berhasil dibuat' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Update revision
  const updateRevisionMutation = useMutation({
    mutationFn: async ({ id, revision }: { id: string; revision: string }) => {
      const { error } = await supabase
        .from('app_versions')
        .update({ revision })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-versions'] });
      queryClient.invalidateQueries({ queryKey: ['current-version'] });
      toast({ title: 'Berhasil', description: 'Revisi berhasil diupdate' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Generate new revision timestamp (for external use)
  const generateRevision = () => {
    return generateRevisionTimestamp();
  };

  return {
    entries,
    groupedChangelog,
    currentVersion,
    versions,
    isLoading: entriesLoading || versionLoading || versionsLoading,
    addEntry: addEntryMutation.mutate,
    deleteEntry: deleteEntryMutation.mutate,
    createVersion: createVersionMutation.mutate,
    updateRevision: updateRevisionMutation.mutate,
    generateRevision,
    isAdding: addEntryMutation.isPending,
    isDeleting: deleteEntryMutation.isPending,
  };
};
