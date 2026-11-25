import { Link } from "react-router-dom";
import { CalendarClock, Banknote, Landmark, ShieldCheck } from "lucide-react";
import { PageHero } from "./Profil";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KomiteBar, KomiteMainProgress } from "@/components/komite/KomiteBars";
import { KomiteSummary } from "@/components/komite/KomiteSummary";
import { KomitePerRombel } from "@/components/komite/KomitePerRombel";
import { KomiteRincianTable } from "@/components/komite/KomiteRincianTable";
import { KomiteRekeningList } from "@/components/komite/KomiteRekeningList";
import { useKomitePublik } from "@/hooks/useKomite";
import { formatTanggal, sisaHari } from "@/lib/komite";

export default function Komite() {
  const { data, isLoading, isError, refetch } = useKomitePublik();

  const target = Number(data?.target ?? 0);
  const total = Number(data?.total ?? 0);
  const sisa = sisaHari(data?.batas_waktu);

  return (
    <div>
      <PageHero
        title="Komite Sekolah"
        subtitle={data?.configured ? (data.deskripsi || data.judul || "Penggalangan dana Komite Sekolah") : "Penggalangan dana Komite Sekolah"}
      />

      <div className="container mx-auto space-y-8 px-4 py-10 md:py-14">
        {isLoading && <div className="h-64 animate-pulse rounded-3xl bg-slate-100" aria-busy="true" aria-label="Memuat data" />}

        {isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            Data penggalangan dana belum dapat dimuat.{" "}
            <button className="font-semibold underline" onClick={() => refetch()}>Coba lagi</button>
          </div>
        )}

        {data && !data.configured && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-600">
            Penggalangan dana belum dibuka. Silakan kembali lagi nanti.
          </div>
        )}

        {data?.configured && (
          <>
            <section aria-labelledby="judul-komite" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <h2 id="judul-komite" className="mb-5 text-lg font-bold text-slate-900 md:text-xl">{data.judul}</h2>
              <KomiteMainProgress total={total} target={target} />

              <div className="mt-8 grid gap-6 border-t border-slate-100 pt-6 md:grid-cols-2">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600"><Landmark className="h-4 w-4 text-blue-600" aria-hidden /> Sumber dana: Rekening</div>
                  <KomiteBar label="Masuk lewat rekening" value={Number(data.rekening_total ?? 0)} total={target} color="bg-blue-600" />
                </div>
                <div>
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600"><Banknote className="h-4 w-4 text-emerald-600" aria-hidden /> Sumber dana: Tunai</div>
                  <KomiteBar label="Diterima tunai" value={Number(data.tunai_total ?? 0)} total={target} color="bg-emerald-600" />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
                {data.batas_waktu && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                    Batas waktu {formatTanggal(data.batas_waktu)}
                    {sisa !== null && (sisa >= 0 ? ` (${sisa} hari lagi)` : " (telah berakhir)")}
                  </span>
                )}
                {data.diperbarui && <span>Diperbarui {formatTanggal(data.diperbarui)}</span>}
              </div>
            </section>

            <section aria-labelledby="rekening-komite">
              <h2 id="rekening-komite" className="mb-3 text-lg font-bold text-slate-900">Informasi Rekening Komite</h2>
              <KomiteRekeningList rekening={data.rekening ?? []} />
              <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                Pastikan nama pemilik rekening sesuai sebelum mentransfer. Sumbangan tunai diserahkan melalui koordinator kelas (korlas) atau bendahara komite.
              </p>
            </section>

            <section aria-label="Rincian dan ringkasan pendapatan">
              <Tabs defaultValue="ringkasan">
                <TabsList className="mb-4">
                  <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
                  {data.tampilkan_rincian && <TabsTrigger value="rincian">Rincian</TabsTrigger>}
                </TabsList>
                <TabsContent value="ringkasan">
                  <KomiteSummary data={data} />
                  <KomitePerRombel rows={data.per_rombel ?? []} />
                </TabsContent>
                {data.tampilkan_rincian && (
                  <TabsContent value="rincian">
                    <KomiteRincianTable rows={data.rincian ?? []} namaMode={data.nama_publik} />
                  </TabsContent>
                )}
              </Tabs>
            </section>

            <p className="text-center text-xs text-slate-400">
              Pengurus komite: <Link to="/auth" className="underline hover:text-slate-600">masuk ke dashboard</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
