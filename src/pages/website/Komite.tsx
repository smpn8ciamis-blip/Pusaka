import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronLeft, ChevronRight, Banknote, Landmark, ShieldCheck } from "lucide-react";
import { PageHero } from "./Profil";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { KomiteBar, KomiteMainProgress } from "@/components/komite/KomiteBars";
import { KomiteSummary } from "@/components/komite/KomiteSummary";
import { KomiteRekeningList } from "@/components/komite/KomiteRekeningList";
import { useKomitePublik } from "@/hooks/useKomite";
import { KATEGORI_LABEL, SUMBER_LABEL, formatRupiah, formatTanggal, sisaHari, type KomiteRincianPublik } from "@/lib/komite";

const PAGE_SIZE = 20;

function Rincian({ rows, namaMode }: { rows: KomiteRincianPublik[]; namaMode?: string }) {
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "lain") return rows.filter((r) => r.kategori === "donatur_lain");
    return rows.filter((r) => r.kategori === "siswa" && String(r.grade) === filter);
  }, [rows, filter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const view = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {namaMode === "lengkap" ? "Menampilkan 300 catatan terbaru." : "Nama disamarkan untuk menjaga privasi. Menampilkan 300 catatan terbaru."}
        </p>
        <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[190px]" aria-label="Filter rincian"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            <SelectItem value="7">Siswa kelas 7</SelectItem>
            <SelectItem value="8">Siswa kelas 8</SelectItem>
            <SelectItem value="9">Siswa kelas 9</SelectItem>
            <SelectItem value="lain">Donatur lainnya</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Tanggal</th>
              <th className="px-4 py-3 font-semibold">Penyumbang</th>
              <th className="px-4 py-3 font-semibold">Asal</th>
              <th className="px-4 py-3 font-semibold">Sumber</th>
              <th className="px-4 py-3 text-right font-semibold">Jumlah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Belum ada catatan.</td></tr>
            )}
            {view.map((r, i) => (
              <tr key={`${r.tanggal}-${i}-${cur}`} className="hover:bg-slate-50/60">
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatTanggal(r.tanggal)}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.nama}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.kategori === "siswa" ? `Siswa kelas ${r.grade}` : KATEGORI_LABEL.donatur_lain}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.sumber === "rekening" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {SUMBER_LABEL[r.sumber]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatRupiah(r.jumlah)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <span>Halaman {cur} dari {pages} · {filtered.length} catatan</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label="Halaman sebelumnya"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={cur >= pages} onClick={() => setPage(cur + 1)} aria-label="Halaman berikutnya"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

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
                </TabsContent>
                {data.tampilkan_rincian && (
                  <TabsContent value="rincian">
                    <Rincian rows={data.rincian ?? []} namaMode={data.nama_publik} />
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
