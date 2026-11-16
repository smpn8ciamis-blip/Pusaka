import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { compressAvatar } from '@/lib/avatarCompress';

interface Props {
  userId: string;
  name?: string | null;
  photoUrl?: string | null;
  /** Kelas tambahan untuk lingkaran foto (ukuran, bingkai) */
  avatarClassName?: string;
}

const BUCKET = 'student-photos';

interface PhotoStatus { enabled: boolean; once: boolean; uploaded: boolean; can_upload: boolean }

/** Foto profil siswa + tombol ganti/hapus. Tombol hanya muncul bila admin mengizinkan (saklar di Pengaturan). */
export function StudentPhotoUploader({ userId, name, photoUrl, avatarClassName = 'w-16 h-16 border-4 border-white/30' }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['student-photo-upload-status', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('student_photo_upload_status' as never);
      if (error) throw error;
      return data as unknown as PhotoStatus;
    },
    staleTime: 30 * 1000,
    retry: false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['student-account', userId] });
    qc.invalidateQueries({ queryKey: ['student-photo-upload-status', userId] });
  };
  const path = `siswa/${userId}/foto.jpg`;

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const blob = await compressAvatar(file);
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
        upsert: true, contentType: 'image/jpeg', cacheControl: '3600',
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error } = await supabase.rpc('student_set_own_photo' as never, { p_url: `${pub.publicUrl}?v=${Date.now()}` } as never);
      if (error) throw error;
      return blob.size;
    },
    onSuccess: (size) => { toast.success(`Foto profil diperbarui (${Math.max(1, Math.round(size / 1024))} KB).`); refresh(); },
    onError: (e: any) => toast.error(e?.message || 'Gagal mengunggah foto.'),
    onSettled: () => { setBusy(false); if (inputRef.current) inputRef.current.value = ''; },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('student_set_own_photo' as never, { p_url: null } as never);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([path]); // gagal hapus berkas tidak mengganggu
    },
    onSuccess: () => { toast.success('Foto profil dihapus.'); refresh(); },
    onError: (e: any) => toast.error(e?.message || 'Gagal menghapus foto.'),
    onSettled: () => setBusy(false),
  });

  // Status belum terbaca (mis. migrasi belum dijalankan) → tampilkan seperti biasa; server tetap menegakkan aturan.
  const canEdit = status?.enabled !== false && !!userId;
  const onceLocked = !!status?.once && !!status?.uploaded;

  const onCameraClick = () => {
    if (onceLocked) { setLockedOpen(true); return; }
    inputRef.current?.click();
  };
  const onFilePicked = (f: File) => {
    if (status?.once && !window.confirm('Foto profil hanya dapat diunggah 1 kali. Untuk mengubahnya nanti Anda harus menghubungi admin. Lanjutkan?')) {
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setBusy(true);
    upload.mutate(f);
  };

  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <div className="relative">
        {photoUrl ? (
          <img src={photoUrl} alt="Foto" className={`${avatarClassName} rounded-full object-cover`} />
        ) : (
          <div className={`${avatarClassName} rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold`}>
            {name?.charAt(0) || 'S'}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={onCameraClick}
            aria-label="Ganti foto profil"
            className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-white text-[#1E6FE0] shadow flex items-center justify-center disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
          </button>
        )}
      </div>
      {canEdit && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFilePicked(f);
            }}
          />
          {photoUrl && !status?.once && (
            <button
              type="button"
              disabled={busy}
              onClick={() => { if (window.confirm('Hapus foto profil?')) { setBusy(true); remove.mutate(); } }}
              className="text-[11px] text-white/80 hover:text-white inline-flex items-center gap-1 disabled:opacity-60"
            >
              <Trash2 className="h-3 w-3" />Hapus
            </button>
          )}
        </>
      )}
      <AlertDialog open={lockedOpen} onOpenChange={setLockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Foto profil tidak dapat diubah</AlertDialogTitle>
            <AlertDialogDescription>
              Foto profil hanya dapat diunggah 1 kali dan Anda sudah pernah mengunggahnya.
              Untuk mengubah foto, silakan hubungi admin sekolah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Mengerti</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
