import { Banknote, Landmark } from 'lucide-react';
import { KomiteBar, KomiteMainProgress } from '@/components/komite/KomiteBars';
import { KomiteSummary } from '@/components/komite/KomiteSummary';
import { useKomiteRingkasan } from '@/hooks/useKomite';
import { useAuth } from '@/contexts/AuthContext';

/** Ringkasan progres untuk dashboard (bendahara komite: semua; korlas: kartu tingkat kelasnya). */
export function KomiteDashboardSummary({ onlyGrade }: { onlyGrade?: number | null }) {
  const { schoolId } = useAuth();
  const { data, isLoading, isError } = useKomiteRingkasan();

  if (!schoolId) {
    return <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Akun ini belum terhubung ke sekolah. Minta Super Admin memilihkan sekolah pada akun Anda.</p>;
  }
  if (isLoading) return <div className="h-48 animate-pulse rounded-2xl bg-muted" />;
  if (isError || !data) return <p className="text-sm text-destructive">Ringkasan belum dapat dimuat.</p>;
  if (!data.configured) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Penggalangan dana belum dibuka oleh bendahara komite (target belum diatur).</p>;
  }

  const target = Number(data.target ?? 0);
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-5 md:p-6">
        <h2 className="mb-4 font-semibold">{data.judul}</h2>
        <KomiteMainProgress total={Number(data.total ?? 0)} target={target} />
        <div className="mt-6 grid gap-5 border-t pt-5 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"><Landmark className="h-4 w-4" aria-hidden /> Rekening</div>
            <KomiteBar label="Masuk lewat rekening" value={Number(data.rekening_total ?? 0)} total={target} color="bg-blue-600" />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"><Banknote className="h-4 w-4" aria-hidden /> Tunai</div>
            <KomiteBar label="Diterima tunai" value={Number(data.tunai_total ?? 0)} total={target} color="bg-emerald-600" />
          </div>
        </div>
      </div>
      <KomiteSummary data={data} onlyGrade={onlyGrade} />
    </div>
  );
}
