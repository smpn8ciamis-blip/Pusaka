import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * Widget Cloudflare Turnstile tanpa paket tambahan. Skrip dimuat satu kali dari challenges.cloudflare.com.
 * Token dikirim lewat `onToken` (null saat kedaluwarsa/gagal/direset). Token hanya berlaku sekali pakai:
 * panggil `ref.current.reset()` setelah percobaan login/daftar yang gagal.
 */
interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile tidak tersedia')));
      s.onerror = () => { scriptPromise = null; s.remove(); reject(new Error('Gagal memuat Turnstile')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export interface TurnstileHandle { reset: () => void }

interface Props {
  siteKey: string;
  onToken: (token: string | null) => void;
}

export const TurnstileWidget = forwardRef<TurnstileHandle, Props>(function TurnstileWidget({ siteKey, onToken }, ref) {
  const boxRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current(null);
      if (idRef.current && window.turnstile) {
        try { window.turnstile.reset(idRef.current); } catch { /* widget sudah dihapus */ }
      }
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !boxRef.current) return;
        idRef.current = ts.render(boxRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          size: 'flexible',
          language: 'id',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'timeout-callback': () => onTokenRef.current(null),
          'error-callback': () => { onTokenRef.current(null); setStatus('failed'); return true; },
        });
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('failed'); });
    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) {
        try { window.turnstile.remove(idRef.current); } catch { /* sudah hilang */ }
      }
      idRef.current = null;
      onTokenRef.current(null);
    };
  }, [siteKey, attempt]);

  return (
    <div className="space-y-2">
      <div ref={boxRef} className="min-h-[65px]" data-testid="turnstile-box" />
      {status === 'loading' && (
        <p className="text-center text-xs text-muted-foreground">Memuat verifikasi keamanan…</p>
      )}
      {status === 'failed' && (
        <div className="space-y-1 text-center text-xs text-destructive" role="alert">
          <p>Verifikasi keamanan gagal dimuat. Periksa koneksi internet Anda.</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="font-medium underline underline-offset-2"
          >
            Coba lagi
          </button>
        </div>
      )}
    </div>
  );
});
