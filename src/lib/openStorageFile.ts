import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/** Buka file privat di tab baru lewat signed URL (tab dibuka dulu agar tidak diblokir popup blocker). */
export async function openStorageFile(bucket: string, path: string, downloadName?: string) {
  const tab = window.open('', '_blank');
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600, downloadName ? { download: downloadName } : undefined);
  if (error || !data?.signedUrl) {
    tab?.close();
    toast.error('Gagal membuka file');
    return;
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}
