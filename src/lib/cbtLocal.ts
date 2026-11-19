/**
 * CBT mode ringan: soal diunduh SEKALI ke perangkat siswa (IndexedDB), jawaban disimpan di perangkat
 * (localStorage) dan baru dikirim ke server saat siswa mengumpulkan ujian.
 *
 * - Soal + gambar soal  -> IndexedDB (kunci: id sesi). Gambar disimpan sebagai Blob agar tidak diunduh ulang.
 * - Jawaban, sisa waktu, antrean pelanggaran -> localStorage (kunci: id pengguna + id sesi).
 * Bila IndexedDB/localStorage tidak tersedia (mode privat, dll.) memakai memori; ujian tetap jalan,
 * hanya saja tidak bertahan setelah halaman dimuat ulang.
 */

export interface PaperQuestion {
  id: string;
  question_number?: number;
  question_text: string;
  question_type: string;
  option_a?: string | null; option_b?: string | null; option_c?: string | null; option_d?: string | null; option_e?: string | null;
  points: number;
  image_url?: string | null;
  [k: string]: unknown;
}

export interface StoredPaper {
  sessionId: string;
  questions: PaperQuestion[];
  /** url gambar asli -> Blob */
  images: Record<string, Blob>;
  /** url gambar yang gagal diunduh (tetap dimuat dari tautan asli) */
  failedImages: string[];
  savedAt: number;
}

export interface LocalProgress {
  answers: Record<string, string>;
  essays: Record<string, string>;
  /** Sisa waktu terakhir yang diketahui perangkat (detik) dan kapan dicatat (epoch ms) */
  timeLeft?: number;
  timeAt?: number;
  /** Pelanggaran yang belum terkirim ke server */
  pendingViolations: { type: string; detail: string | null; at: number }[];
  violations: number;
  updatedAt: number;
}

export interface PrefetchProgress {
  phase: 'paper' | 'images' | 'save' | 'done';
  percent: number; // 0..100
  label: string;
  imagesDone: number;
  imagesTotal: number;
}

// ------------------------------------------------------------------ gambar dalam soal
const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** Semua URL gambar (http/https/relatif) pada HTML soal; data: dan blob: dilewati. */
export function extractImageUrls(html: string | null | undefined): string[] {
  const out: string[] = [];
  if (!html) return out;
  IMG_SRC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_SRC_RE.exec(html))) {
    const u = (m[1] ?? m[2] ?? '').trim();
    if (u && !/^(data|blob):/i.test(u)) out.push(u);
  }
  return out;
}

export function collectImageUrls(questions: PaperQuestion[]): string[] {
  const set = new Set<string>();
  questions.forEach((q) => {
    extractImageUrls(q.question_text).forEach((u) => set.add(u));
    ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'].forEach((k) => extractImageUrls(q[k] as string).forEach((u) => set.add(u)));
    if (q.image_url && !/^(data|blob):/i.test(q.image_url)) set.add(q.image_url);
  });
  return [...set];
}

/** Ganti src gambar dengan URL lokal (blob:) bila gambarnya sudah diunduh. */
export function rewriteImages(html: string | null | undefined, map: Record<string, string>): string {
  if (!html) return '';
  return html.replace(/(<img\b[^>]*?\bsrc\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (full, pre: string, d: string | undefined, s: string | undefined) => {
    const u = (d ?? s ?? '').trim();
    const local = map[u];
    return local ? `${pre}"${local}"` : full;
  });
}

// ------------------------------------------------------------------ IndexedDB (dengan cadangan memori)
const DB_NAME = 'pusaka-cbt';
const STORE = 'papers';
const memPapers = new Map<string, StoredPaper>();

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'sessionId' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

const idbReq = <T,>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function savePaper(p: StoredPaper): Promise<'idb' | 'memory'> {
  memPapers.set(p.sessionId, p);
  const db = await openDb();
  if (!db) return 'memory';
  try {
    await idbReq(db.transaction(STORE, 'readwrite').objectStore(STORE).put(p));
    return 'idb';
  } catch { return 'memory'; } finally { db.close(); }
}

export async function loadPaper(sessionId: string): Promise<StoredPaper | null> {
  const mem = memPapers.get(sessionId);
  if (mem) return mem;
  const db = await openDb();
  if (!db) return null;
  try {
    const p = (await idbReq(db.transaction(STORE, 'readonly').objectStore(STORE).get(sessionId))) as StoredPaper | undefined;
    if (p && Array.isArray(p.questions)) { memPapers.set(sessionId, p); return p; }
    return null;
  } catch { return null; } finally { db.close(); }
}

export async function deletePaper(sessionId: string): Promise<void> {
  memPapers.delete(sessionId);
  const db = await openDb();
  if (!db) return;
  try { await idbReq(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(sessionId)); } catch { /* abaikan */ } finally { db.close(); }
}

/** Hapus soal tersimpan yang sudah lebih dari beberapa hari (sisa ujian yang tidak diselesaikan). */
export async function purgeOldPapers(maxAgeMs = 3 * 86400000): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const all = (await idbReq(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as StoredPaper[];
    const old = all.filter((p) => Date.now() - (p.savedAt || 0) > maxAgeMs);
    for (const p of old) await deletePaper(p.sessionId);
  } catch { /* abaikan */ } finally { db.close(); }
}

// ------------------------------------------------------------------ localStorage (jawaban)
const PREFIX = 'pusaka.cbt.v1.';
const memProgress = new Map<string, string>();
const keyOf = (userId: string, sessionId: string) => `${PREFIX}${userId}.${sessionId}`;

export const emptyProgress = (): LocalProgress => ({ answers: {}, essays: {}, pendingViolations: [], violations: 0, updatedAt: Date.now() });

export function loadProgress(userId: string, sessionId: string): LocalProgress | null {
  const k = keyOf(userId, sessionId);
  let raw: string | null = null;
  try { raw = localStorage.getItem(k); } catch { /* diblokir */ }
  if (raw == null) raw = memProgress.get(k) ?? null;
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<LocalProgress>;
    return {
      answers: p.answers && typeof p.answers === 'object' ? p.answers : {},
      essays: p.essays && typeof p.essays === 'object' ? p.essays : {},
      timeLeft: typeof p.timeLeft === 'number' ? p.timeLeft : undefined,
      timeAt: typeof p.timeAt === 'number' ? p.timeAt : undefined,
      pendingViolations: Array.isArray(p.pendingViolations) ? p.pendingViolations : [],
      violations: typeof p.violations === 'number' ? p.violations : 0,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
    };
  } catch { return null; }
}

export function saveProgress(userId: string, sessionId: string, p: LocalProgress): void {
  const k = keyOf(userId, sessionId);
  const raw = JSON.stringify({ ...p, updatedAt: Date.now() });
  memProgress.set(k, raw);
  try { localStorage.setItem(k, raw); } catch { /* penuh/diblokir: tetap ada di memori */ }
}

export function clearProgress(userId: string, sessionId: string): void {
  const k = keyOf(userId, sessionId);
  memProgress.delete(k);
  try { localStorage.removeItem(k); } catch { /* abaikan */ }
}

/** Bersihkan sisa jawaban lokal yang sudah sangat lama. */
export function purgeOldProgress(maxAgeMs = 3 * 86400000): void {
  try {
    const dead: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try { const p = JSON.parse(localStorage.getItem(k) || '{}'); if (Date.now() - (p.updatedAt || 0) > maxAgeMs) dead.push(k); } catch { dead.push(k); }
    }
    dead.forEach((k) => localStorage.removeItem(k));
  } catch { /* abaikan */ }
}

// ------------------------------------------------------------------ pengunduhan soal
export interface PrefetchDeps {
  /** Mengambil naskah soal dari server (satu panggilan). */
  fetchPaper: () => Promise<{ questions: PaperQuestion[]; [k: string]: unknown }>;
  /** Pengunduh gambar (default: fetch). Boleh diganti saat uji. */
  fetchImage?: (url: string) => Promise<Blob>;
  onProgress?: (p: PrefetchProgress) => void;
  concurrency?: number;
  signal?: AbortSignal;
}

const defaultFetchImage = async (url: string): Promise<Blob> => {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
};

/**
 * Unduh seluruh soal (+ gambar) lalu simpan di perangkat. Kemajuan: 0-30% naskah, 30-95% gambar, 95-100% simpan.
 * Gambar yang gagal tidak menggagalkan ujian: tetap dimuat dari tautan aslinya.
 */
export async function prefetchPaper(sessionId: string, deps: PrefetchDeps): Promise<{ paper: StoredPaper; raw: { questions: PaperQuestion[]; [k: string]: unknown } }> {
  const report = (phase: PrefetchProgress['phase'], percent: number, label: string, imagesDone = 0, imagesTotal = 0) =>
    deps.onProgress?.({ phase, percent: Math.max(0, Math.min(100, Math.round(percent))), label, imagesDone, imagesTotal });
  const aborted = () => { if (deps.signal?.aborted) throw new Error('Pengunduhan dibatalkan'); };

  report('paper', 5, 'Mengunduh soal…');
  const raw = await deps.fetchPaper();
  aborted();
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  report('paper', 30, `${questions.length} soal diterima`);

  const urls = collectImageUrls(questions);
  const images: Record<string, Blob> = {};
  const failed: string[] = [];
  let done = 0;
  const total = urls.length;
  if (total > 0) {
    report('images', 30, `Mengunduh gambar soal (0/${total})…`, 0, total);
    const getImg = deps.fetchImage ?? defaultFetchImage;
    let next = 0;
    const worker = async () => {
      while (next < urls.length) {
        aborted();
        const u = urls[next++];
        try { images[u] = await getImg(u); } catch {
          // satu kali percobaan ulang (jeda singkat acak) sebelum dianggap gagal; gagal tetap jatuh ke URL asli
          try {
            await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
            aborted();
            images[u] = await getImg(u);
          } catch (e2) { if (deps.signal?.aborted) throw e2; failed.push(u); }
        }
        done++;
        report('images', 30 + (done / total) * 65, `Mengunduh gambar soal (${done}/${total})…`, done, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(deps.concurrency ?? 3, total) }, worker));
  }
  report('save', 96, 'Menyimpan soal di perangkat…', done, total);
  const paper: StoredPaper = { sessionId, questions, images, failedImages: failed, savedAt: Date.now() };
  await savePaper(paper);
  report('done', 100, 'Soal siap dikerjakan', done, total);
  return { paper, raw };
}

/** Buat URL lokal (blob:) untuk semua gambar yang tersimpan. Panggil revoke saat selesai. */
export function makeImageUrlMap(paper: StoredPaper): { map: Record<string, string>; revoke: () => void } {
  const map: Record<string, string> = {};
  const made: string[] = [];
  try {
    Object.entries(paper.images || {}).forEach(([u, b]) => { const o = URL.createObjectURL(b); map[u] = o; made.push(o); });
  } catch { /* lingkungan tanpa URL.createObjectURL */ }
  return { map, revoke: () => made.forEach((o) => { try { URL.revokeObjectURL(o); } catch { /* abaikan */ } }) };
}

/** Sisa waktu yang dipakai saat melanjutkan: yang terkecil antara server dan catatan perangkat. */
export function resumeTimeLeft(serverLeft: number, local?: Pick<LocalProgress, 'timeLeft'> | null): number {
  const s = Math.max(0, serverLeft);
  return local && typeof local.timeLeft === 'number' ? Math.min(s, Math.max(0, local.timeLeft)) : s;
}

// ------------------------------------------------------------------ kunci satu tab per sesi ujian
const LOCK_PREFIX = 'pusaka.cbt.lock.';
const LOCK_FRESH_MS = 6000;

/**
 * Mencegah ujian yang sama dibuka di dua tab/jendela browser sekaligus.
 * Mengembalikan true bila tab ini boleh memakai sesi (dan menandainya); false bila tab lain masih aktif.
 */
export function tryAcquireTabLock(sessionId: string, tabId: string, now = Date.now()): boolean {
  const k = LOCK_PREFIX + sessionId;
  try {
    const cur = JSON.parse(localStorage.getItem(k) || 'null') as { tab: string; ts: number } | null;
    if (cur && cur.tab !== tabId && now - cur.ts < LOCK_FRESH_MS) return false;
    localStorage.setItem(k, JSON.stringify({ tab: tabId, ts: now }));
  } catch { /* localStorage diblokir: tidak bisa memeriksa */ }
  return true;
}
export function releaseTabLock(sessionId: string, tabId: string): void {
  const k = LOCK_PREFIX + sessionId;
  try {
    const cur = JSON.parse(localStorage.getItem(k) || 'null') as { tab: string } | null;
    if (cur && cur.tab === tabId) localStorage.removeItem(k);
  } catch { /* abaikan */ }
}
