/**
 * Fungsi murni untuk mode anti curang CBT (mudah diuji).
 * Peringatan jujur: browser tidak bisa mendeteksi layar belah/aplikasi lain secara pasti. Semua deteksi di sini
 * bersifat heuristik; karena itu deteksi "baru" (layar belah, multi-layar, devtools) harus terbukti beberapa kali
 * berturut-turut sebelum dihitung, dan dihitung satu kali per kejadian.
 */

export interface ScreenMetrics {
  outerW: number; outerH: number;
  innerW: number; innerH: number;
  screenW: number; screenH: number;
  fullscreen: boolean;
}

export interface SplitResult { split: boolean; wRatio: number; hRatio: number; detail: string }

/**
 * Layar belah / jendela mengecil: ukuran jendela (outer, tidak terpengaruh zoom) dibandingkan dengan ukuran layar.
 * Saat layar penuh jendela harus memenuhi layar; di luar layar penuh (mis. iPhone) batasnya lebih longgar.
 */
export function evaluateSplitScreen(m: ScreenMetrics): SplitResult {
  const ow = m.outerW > 0 ? m.outerW : m.innerW;
  const oh = m.outerH > 0 ? m.outerH : m.innerH;
  let sw = m.screenW, sh = m.screenH;
  if (!(sw > 0 && sh > 0 && ow > 0 && oh > 0)) return { split: false, wRatio: 1, hRatio: 1, detail: 'ukuran tidak tersedia' };
  // layar diputar (lanskap/potret): samakan orientasi sebelum dibandingkan
  if ((ow >= oh) !== (sw >= sh)) { const t = sw; sw = sh; sh = t; }
  const wRatio = ow / sw;
  const hRatio = oh / sh;
  const limitW = m.fullscreen ? 0.93 : 0.75;
  const limitH = m.fullscreen ? 0.9 : 0.45;
  const split = wRatio < limitW || hRatio < limitH;
  return { split, wRatio, hRatio, detail: `jendela ${Math.round(ow)}x${Math.round(oh)} dari layar ${Math.round(sw)}x${Math.round(sh)}${m.fullscreen ? ' (layar penuh)' : ''}` };
}

/** Penghitung "terbukti berturut-turut": kondisi harus benar `need` kali beruntun, lalu dihitung sekali per episode. */
export function createEpisodeCounter(need: number) {
  let streak = 0;
  let fired = false;
  return (condition: boolean): boolean => {
    if (!condition) { streak = 0; fired = false; return false; }
    streak++;
    if (streak >= need && !fired) { fired = true; return true; }
    return false;
  };
}

export type ViolationGroup = 'focus' | string;
const FOCUS_TYPES = new Set(['tab_switch', 'blur', 'focus_lost']);

/**
 * Satu aksi pindah tab memicu beberapa kejadian sekaligus (visibilitychange + blur). Kejadian yang sama
 * dalam jendela waktu pendek dihitung satu kali.
 */
export function createViolationDeduper(focusWindowMs = 2000, sameTypeWindowMs = 800) {
  const last: Record<string, number> = {};
  return (type: string, now: number): boolean => {
    const group: ViolationGroup = FOCUS_TYPES.has(type) ? 'focus' : type;
    const win = group === 'focus' ? focusWindowMs : sameTypeWindowMs;
    if (last[group] != null && now - last[group] < win) return false;
    last[group] = now;
    return true;
  };
}

export interface KeyInfo { key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean; inEditable: boolean }
export interface KeyVerdict { block: boolean; violation?: string; detail?: string; clearClipboard?: boolean }

/** Menilai satu penekanan tombol selama ujian. */
export function evaluateKey(k: KeyInfo): KeyVerdict {
  const key = (k.key || '').toLowerCase();
  const mod = k.ctrl || k.meta;
  if (key === 'printscreen') return { block: false, violation: 'screenshot', detail: 'Menekan tombol PrintScreen', clearClipboard: true };
  if (key === 'f12' || (mod && k.shift && ['i', 'j', 'c'].includes(key))) return { block: true, violation: 'devtools', detail: 'Mencoba membuka alat pengembang' };
  if (mod && ['c', 'x', 'v'].includes(key)) return { block: true, violation: key === 'v' ? 'paste' : key === 'x' ? 'cut' : 'copy', detail: `Pintasan ${k.ctrl ? 'Ctrl' : 'Cmd'}+${key.toUpperCase()}` };
  if (mod && ['p', 's', 'u'].includes(key)) return { block: true, violation: 'shortcut', detail: `Pintasan ${k.ctrl ? 'Ctrl' : 'Cmd'}+${key.toUpperCase()}` };
  if (mod && key === 'a' && !k.inEditable) return { block: true };
  if (k.alt && (key === 'arrowleft' || key === 'arrowright')) return { block: true };
  return { block: false };
}

// ------------------------------------------------------------------ penghitung waktu tahan manipulasi jam
export interface Clocks { wall: () => number; mono: () => number }
export const realClocks = (): Clocks => ({ wall: () => Date.now(), mono: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) });

/**
 * Sisa waktu = yang terkecil antara jam monoton (tidak bisa diubah pengguna) dan jam dinding (tetap berjalan saat
 * perangkat tidur). Memundurkan jam perangkat tidak menambah waktu ujian.
 */
export function createDeadline(leftSeconds: number, clocks: Clocks = realClocks()) {
  const wall0 = clocks.wall();
  const mono0 = clocks.mono();
  const total = Math.max(0, leftSeconds);
  return {
    left: (): number => {
      const monoLeft = total - (clocks.mono() - mono0) / 1000;
      const wallLeft = total - (clocks.wall() - wall0) / 1000;
      return Math.max(0, Math.round(Math.min(monoLeft, wallLeft)));
    },
  };
}

/** Label pelanggaran untuk pesan peringatan siswa dan tampilan pengawas. */
export const VIOLATION_LABEL: Record<string, string> = {
  tab_switch: 'pindah tab/aplikasi',
  blur: 'jendela kehilangan fokus',
  focus_lost: 'fokus pindah ke aplikasi lain',
  fullscreen_exit: 'keluar dari layar penuh',
  split_screen: 'layar belah / jendela mengecil',
  multi_screen: 'lebih dari satu layar',
  copy: 'menyalin',
  cut: 'memotong',
  paste: 'menempel',
  print: 'mencetak',
  screenshot: 'tangkapan layar (PrintScreen)',
  os_key: 'tombol Windows/Cmd',
  devtools: 'alat pengembang',
  shortcut: 'pintasan terlarang',
};
export const violationLabel = (type: string): string => VIOLATION_LABEL[type] ?? type;
