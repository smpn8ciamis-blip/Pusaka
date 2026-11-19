// Mode fokus ujian: selama siswa mengerjakan soal, menu samping, header (logout, notifikasi), footer, dan popup umum disembunyikan.
// Disimpan di satu tempat (di luar React) agar DashboardLayout, VersionNotification, dan Toaster bisa membacanya tanpa prop.
import { useSyncExternalStore } from 'react';

let focus = false;
const listeners = new Set<() => void>();

export function setExamFocus(on: boolean): void {
  if (focus === on) return;
  focus = on;
  try {
    if (typeof document !== 'undefined') {
      if (on) document.documentElement.dataset.examFocus = '1'; else delete document.documentElement.dataset.examFocus;
    }
  } catch { /* abaikan */ }
  listeners.forEach((l) => l());
}

export const getExamFocus = (): boolean => focus;

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function useExamFocus(): boolean {
  return useSyncExternalStore(subscribe, getExamFocus, () => false);
}
