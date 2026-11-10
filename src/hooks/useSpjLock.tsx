import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SpjUnlockDialog, type SpjTargetKind } from '@/components/spj/SpjUnlockDialog';

export interface SpjLockState {
  locked_travels: string[];
  locked_letters: string[];
  code_set: boolean;
  code_updated_at: string | null;
}

export const SPJ_LOCK_QUERY_KEY = ['spj-lock-state'];

const EMPTY: SpjLockState = { locked_travels: [], locked_letters: [], code_set: false, code_updated_at: null };

/**
 * Status kunci SPJ dari database (RPC get_spj_lock_state).
 * Penegakan sebenarnya ada di trigger database; hook ini hanya agar tampilan tahu kapan harus meminta kode hapus.
 * Bila migrasi belum dijalankan, RPC gagal dan tidak ada yang dianggap terkunci (tampilan tidak berubah).
 */
export function useSpjLockState() {
  const query = useQuery({
    queryKey: SPJ_LOCK_QUERY_KEY,
    queryFn: async (): Promise<SpjLockState> => {
      const { data, error } = await (supabase as any).rpc('get_spj_lock_state');
      if (error) throw error;
      return { ...EMPTY, ...(data || {}) } as SpjLockState;
    },
    staleTime: 15_000,
    retry: false,
  });
  const state = query.data ?? EMPTY;
  const travels = useMemo(() => new Set(state.locked_travels), [state.locked_travels]);
  const letters = useMemo(() => new Set(state.locked_letters), [state.locked_letters]);
  return {
    state,
    isTravelLocked: (id?: string | null) => !!id && travels.has(id),
    isLetterLocked: (id?: string | null) => !!id && letters.has(id),
    refetch: query.refetch,
  };
}

interface Pending {
  kind: SpjTargetKind;
  id: string;
  action: () => void;
}

/**
 * Pembungkus aksi ubah/hapus: bila data terkunci, tampilkan dialog kode hapus dulu, lalu jalankan aksi setelah kode benar.
 * Pakai: const { guard, dialog, isTravelLocked } = useSpjGuard();  ...  {dialog}
 */
export function useSpjGuard(): {
  guard: (kind: SpjTargetKind, id: string, locked: boolean, action: () => void) => void;
  dialog: ReactNode;
  isTravelLocked: (id?: string | null) => boolean;
  isLetterLocked: (id?: string | null) => boolean;
} {
  const { isTravelLocked, isLetterLocked } = useSpjLockState();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending | null>(null);

  const guard = useCallback((kind: SpjTargetKind, id: string, locked: boolean, action: () => void) => {
    if (!locked) {
      action();
      return;
    }
    setPending({ kind, id, action });
  }, []);

  const dialog = (
    <SpjUnlockDialog
      open={!!pending}
      kind={pending?.kind ?? 'travel'}
      targetId={pending?.id ?? ''}
      onOpenChange={(o) => { if (!o) setPending(null); }}
      onUnlocked={() => {
        const run = pending?.action;
        setPending(null);
        queryClient.invalidateQueries({ queryKey: SPJ_LOCK_QUERY_KEY });
        if (run) run();
      }}
    />
  );

  return { guard, dialog, isTravelLocked, isLetterLocked };
}
