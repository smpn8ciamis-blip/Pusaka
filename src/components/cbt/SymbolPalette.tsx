import { useState } from 'react';
import { cn } from '@/lib/utils';

const GROUPS: { key: string; label: string; items: string[] }[] = [
  { key: 'mat', label: 'Matematika', items: ['²', '³', 'ⁿ', '√', '∛', 'π', '±', '×', '÷', '≠', '≈', '≤', '≥', '<', '>', '∞', '°', '′', '″', '½', '¼', '¾', '‰', '∠', '⊥', '∥', '△', '≡', '∝', '∴', '∵', '→', '⇒', '⇔', '↔'] },
  { key: 'aljabar', label: 'Himpunan & aljabar', items: ['∈', '∉', '⊂', '⊆', '∪', '∩', '∅', '∀', '∃', '∑', '∫', 'Δ', '∂', '∇', '|x|', '⁰', '¹', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', '⁺', '⁻', '₊', '₋'] },
  { key: 'yunani', label: 'Huruf Yunani', items: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'ρ', 'σ', 'τ', 'φ', 'ω', 'Σ', 'Ω', 'Φ', 'Θ', 'Λ', 'Π'] },
  { key: 'arab', label: 'Huruf Arab', items: ['ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي', 'ء', 'ة', 'ى', 'أ', 'إ', 'آ', 'ؤ', 'ئ', 'لا', 'ﷲ', '،', '؟', '؛'] },
  { key: 'harakat', label: 'Harakat', items: ['َ', 'ُ', 'ِ', 'ً', 'ٌ', 'ٍ', 'ّ', 'ْ', 'ٰ', 'ٓ'] },
];

interface Props {
  onInsert: (text: string) => void;
  className?: string;
}

/**
 * Papan simbol: sisipkan simbol matematika dan huruf Arab tanpa papan ketik khusus dan tanpa clipboard
 * (aman dipakai saat mode anti-curang memblokir tempel). Tombol tidak mengambil fokus agar kursor tetap di kolom jawaban.
 */
export function SymbolPalette({ onInsert, className }: Props) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(GROUPS[0].key);
  const g = GROUPS.find((x) => x.key === group) || GROUPS[0];
  const keep = (e: React.SyntheticEvent) => e.preventDefault();
  return (
    <div className={cn('text-xs', className)}>
      <button type="button" onMouseDown={keep} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-accent">
        <span aria-hidden>Σ</span> Simbol &amp; huruf Arab {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="mt-1 rounded border bg-muted/30 p-1.5 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {GROUPS.map((x) => (
              <button key={x.key} type="button" onMouseDown={keep} onClick={() => setGroup(x.key)}
                className={cn('rounded px-2 py-0.5 border', x.key === group ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent')}>{x.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" dir="ltr">
            {g.items.map((s) => (
              <button key={s} type="button" onMouseDown={keep} onClick={() => onInsert(s)} aria-label={`Sisipkan ${s}`}
                className="h-8 min-w-8 px-1.5 rounded border bg-background text-base leading-none hover:bg-accent active:bg-primary/10">
                {s.length === 1 && /[ً-ٰٓ]/.test(s) ? '◌' + s : s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
