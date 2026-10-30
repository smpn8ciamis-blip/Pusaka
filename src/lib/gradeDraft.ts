// Draf input nilai di browser guru: bila tab tertutup / koneksi putus sebelum "Simpan Nilai",
// ketikan terakhir dipulihkan. Hanya kemudahan per-perangkat; sumber kebenaran tetap database.

export interface DraftPayload<T> {
  savedAt: number;
  students: Record<string, T>;
}

const key = (userId: string, scheduleId: string) => `pusaka:grade-draft:${userId}:${scheduleId}`;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 hari

export function saveDraft<T>(userId: string, scheduleId: string, students: Record<string, T>) {
  try {
    if (Object.keys(students).length === 0) {
      localStorage.removeItem(key(userId, scheduleId));
      return;
    }
    const payload: DraftPayload<T> = { savedAt: Date.now(), students };
    localStorage.setItem(key(userId, scheduleId), JSON.stringify(payload));
  } catch {
    /* penyimpanan penuh / diblokir: abaikan */
  }
}

export function loadDraft<T>(userId: string, scheduleId: string): DraftPayload<T> | null {
  try {
    const raw = localStorage.getItem(key(userId, scheduleId));
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftPayload<T>;
    if (!d || typeof d.savedAt !== 'number' || !d.students) return null;
    if (Date.now() - d.savedAt > MAX_AGE_MS) { clearDraft(userId, scheduleId); return null; }
    return d;
  } catch {
    return null;
  }
}

export function clearDraft(userId: string, scheduleId: string) {
  try {
    localStorage.removeItem(key(userId, scheduleId));
  } catch {
    /* abaikan */
  }
}
