import { useState } from 'react';
import { Check, Copy, Landmark } from 'lucide-react';
import type { KomiteRekening } from '@/lib/komite';

/** Kartu informasi rekening komite dengan tombol salin nomor. */
export function KomiteRekeningList({ rekening }: { rekening: KomiteRekening[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (r: KomiteRekening) => {
    const text = r.nomor.replace(/\s+/g, '');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(r.id);
      setTimeout(() => setCopied((c) => (c === r.id ? null : c)), 2000);
    } catch {
      // clipboard tidak tersedia (mis. http biasa): pengguna masih bisa menyalin teks nomor secara manual
    }
  };

  if (rekening.length === 0) {
    return <p className="text-sm text-slate-500">Informasi rekening belum tersedia.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rekening.map((r) => (
        <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1E40AF]">
            <Landmark className="h-4 w-4" aria-hidden /> {r.bank}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="select-all font-mono text-xl font-bold tracking-wide text-slate-900">{r.nomor}</span>
            <button
              type="button"
              onClick={() => copy(r)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              aria-label={`Salin nomor rekening ${r.bank}`}
            >
              {copied === r.id ? <><Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> Tersalin</> : <><Copy className="h-3.5 w-3.5" aria-hidden /> Salin</>}
            </button>
          </div>
          <div className="mt-1 text-sm text-slate-600">a.n. <span className="font-medium text-slate-800">{r.atas_nama}</span></div>
          {r.catatan && <p className="mt-2 text-xs text-slate-500">{r.catatan}</p>}
        </div>
      ))}
    </div>
  );
}
