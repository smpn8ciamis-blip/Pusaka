import { useEffect, useRef } from 'react';
import { createEpisodeCounter, createViolationDeduper, evaluateKey, evaluateSplitScreen } from '@/lib/cbtAntiCheat';

interface Options {
  enabled: boolean;
  /** Dipanggil untuk tiap pelanggaran yang SUDAH lolos penyaringan ganda. */
  onViolation: (type: string, detail: string) => void;
}

const isEditable = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable === true;
};

/**
 * Mode anti curang CBT: pindah tab/aplikasi, keluar layar penuh, layar belah, banyak layar, copy/paste/cut,
 * cetak, tangkapan layar (PrintScreen), alat pengembang, tombol kembali, seret-lepas.
 * Layar belah, banyak layar, dan alat pengembang bersifat heuristik: harus terbukti 3 kali berturut-turut.
 */
export function useCbtAntiCheat({ enabled, onViolation }: Options) {
  const cb = useRef(onViolation);
  cb.current = onViolation;

  useEffect(() => {
    if (!enabled) return;
    const armedAt = Date.now() + 2500; // abaikan kejadian akibat masuk layar penuh di awal
    const dedupe = createViolationDeduper();
    const report = (type: string, detail: string) => {
      const now = Date.now();
      if (now < armedAt) return;
      if (!dedupe(type, now)) return;
      cb.current(type, detail);
    };

    const onVis = () => { if (document.hidden) report('tab_switch', 'Pindah tab/aplikasi'); };
    const onBlur = () => report('blur', 'Jendela kehilangan fokus');
    const fsSupported = !!document.fullscreenEnabled;
    const onFs = () => { if (fsSupported && !document.fullscreenElement) report('fullscreen_exit', 'Keluar dari layar penuh'); };
    const stop = (e: Event) => e.preventDefault();
    const onSelect = (e: Event) => { if (!isEditable(e.target)) e.preventDefault(); };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); report('copy', 'Mencoba menyalin'); };
    const onCut = (e: ClipboardEvent) => { e.preventDefault(); report('cut', 'Mencoba memotong'); };
    const onPaste = (e: ClipboardEvent) => { e.preventDefault(); report('paste', 'Mencoba menempel'); };
    const onBeforePrint = () => report('print', 'Mencoba mencetak');
    const onKey = (e: KeyboardEvent) => {
      const v = evaluateKey({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey, inEditable: isEditable(e.target) });
      if (v.block) e.preventDefault();
      if (v.clearClipboard) { try { navigator.clipboard?.writeText(''); } catch { /* abaikan */ } }
      if (v.violation) report(v.violation, v.detail || v.violation);
    };

    // Tombol kembali browser: tahan di halaman ujian
    const pushGuard = () => { try { history.pushState({ cbt: true }, '', location.href); } catch { /* abaikan */ } };
    const onPop = () => pushGuard();
    pushGuard();

    // Fokus hilang tanpa kejadian blur (mis. jendela mengambang/overlay): periksa tiap detik
    let hadFocus = document.hasFocus();
    // Layar belah / banyak layar / alat pengembang: harus terbukti berturut-turut
    const splitCounter = createEpisodeCounter(3);
    const multiCounter = createEpisodeCounter(3);
    const devCounter = createEpisodeCounter(3);
    const devProbe = new Image();
    let devOpen = false;
    Object.defineProperty(devProbe, 'id', { get() { devOpen = true; return ''; } });

    const tick = setInterval(() => {
      if (document.hidden) return;
      const hasFocus = document.hasFocus();
      if (hadFocus && !hasFocus) report('focus_lost', 'Fokus pindah ke aplikasi/jendela lain');
      hadFocus = hasFocus;

      const r = evaluateSplitScreen({
        outerW: window.outerWidth, outerH: window.outerHeight, innerW: window.innerWidth, innerH: window.innerHeight,
        screenW: window.screen.width, screenH: window.screen.height, fullscreen: !!document.fullscreenElement,
      });
      if (splitCounter(r.split)) report('split_screen', `Layar belah/jendela mengecil: ${r.detail}`);

      const ext = (window.screen as unknown as { isExtended?: boolean }).isExtended === true;
      if (multiCounter(ext)) report('multi_screen', 'Terdeteksi lebih dari satu layar (extended)');

      devOpen = false;
      try { console.log(devProbe); } catch { /* abaikan */ }
      if (devCounter(devOpen)) report('devtools', 'Alat pengembang terbuka');
    }, 1000);

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('contextmenu', stop);
    document.addEventListener('dragstart', stop);
    document.addEventListener('drop', stop);
    document.addEventListener('selectstart', onSelect);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKey);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('popstate', onPop);

    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('contextmenu', stop);
      document.removeEventListener('dragstart', stop);
      document.removeEventListener('drop', stop);
      document.removeEventListener('selectstart', onSelect);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('popstate', onPop);
    };
  }, [enabled]);
}
