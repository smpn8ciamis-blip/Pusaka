import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

interface Props {
  id?: string;
  value: number;
  onCommit: (n: number) => void;
  min: number;
  max: number;
  /** Jumlah digit tepat (mis. 5 untuk nomor awal); bila diisi, hanya angka dengan digit itu yang dianggap valid. */
  digits?: number;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Isian angka yang nyaman diketik: boleh dikosongkan dan diketik ulang (nilai sementara berupa teks),
 * nilai baru diteruskan hanya bila valid; saat ditinggalkan dalam keadaan tidak valid, kembali ke nilai terakhir yang sah.
 */
export function DraftNumberInput({ id, value, onCommit, min, max, digits, invalid, placeholder, className }: Props) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const parse = (s: string): number | null => {
    const t = s.trim();
    if (!/^\d+$/.test(t)) return null;
    if (digits && t.length !== digits) return null;
    const n = Number(t);
    return n >= min && n <= max ? n : null;
  };
  const bad = invalid || (draft !== '' && parse(draft) === null) || draft === '';

  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      value={draft}
      placeholder={placeholder}
      aria-invalid={bad || undefined}
      className={`${bad ? 'border-destructive focus-visible:ring-destructive' : ''} ${className || ''}`}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d]/g, '');
        setDraft(v);
        const n = parse(v);
        if (n !== null) onCommit(n);
      }}
      onBlur={() => { if (parse(draft) === null) setDraft(String(value)); }}
    />
  );
}
