import { useEffect, useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { adviceAt, waitPercent } from '@/lib/cbtAdvice';

/** Kalimat nasihat yang berganti tiap 6 detik (mulai dari kalimat acak). */
export function AdviceLine({ className = '' }: { className?: string }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * 1000));
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 6000);
    return () => clearInterval(t);
  }, []);
  return (
    <p key={i} aria-live="polite" className={`flex items-start justify-center gap-2 text-sm text-muted-foreground animate-fade-in min-h-[2.75rem] ${className}`}>
      <HeartHandshake className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
      <span className="max-w-sm">{adviceAt(i)}</span>
    </p>
  );
}

interface Props {
  /** Sisa detik menunggu; abaikan (undefined/0 dengan total 0) untuk bar yang bergerak terus. */
  left?: number;
  total?: number;
  title?: string;
  className?: string;
}

/**
 * Tampilan menunggu yang menenangkan: bar progres beranimasi + kalimat nasihat yang bergantian.
 * Sengaja tanpa penjelasan teknis (server, antrean, hitung mundur angka) supaya siswa tidak panik.
 */
export default function CalmWait({ left = 0, total = 0, title, className = '' }: Props) {
  const determinate = total > 0;
  const pct = waitPercent(left, total);
  return (
    <div className={`space-y-4 text-center ${className}`}>
      {title && <p className="font-medium">{title}</p>}
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar" aria-label="Sedang menyiapkan" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={determinate ? pct : undefined}
      >
        {determinate ? (
          <div className="h-full rounded-full bg-primary calm-wait-fill" style={{ width: `${pct}%` }} />
        ) : (
          <div className="absolute inset-y-0 w-2/5 rounded-full bg-primary calm-wait-slide" />
        )}
      </div>
      <AdviceLine />
    </div>
  );
}
