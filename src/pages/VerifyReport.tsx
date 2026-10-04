import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { sha256Hex } from '@/lib/reportVerification';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle2, XCircle, Loader2, ShieldCheck, Calendar, Building2, Hash, Archive,
  AlertTriangle, Users,
} from 'lucide-react';

/* ============================================================
   TIPE DATA
============================================================ */
interface StudentRow {
  nis: string;
  nama: string;
  kelas: string;
  status: 'Izin' | 'Sakit' | 'Alpa' | string;
  tanggal: string;
  catatan: string;
}

interface ViolationRow {
  nis: string;
  nama: string;
  kelas: string;
  jenis: string;
  kategori: string;
  poin: number;
  tanggal: string;
  pelapor: string;
  catatan: string;
}

interface AbsentSummary {
  totalAbsent: number;
  izin: number;
  sakit: number;
  alpa: number;
}

interface ViolationSummary {
  totalViolations: number;
  totalPoints: number;
  ringan: number;
  sedang: number;
  berat: number;
}

interface VerifyResult {
  valid: boolean;
  reason?: string;
  type?: string;              // 'absent' | 'violations'
  serial_number?: string;
  school?: string;
  period?: string;
  summary?: AbsentSummary | ViolationSummary | any;
  students?: StudentRow[];
  violations?: ViolationRow[];
  print_date?: string;
  verified_at?: string;
  expires_at?: string | null;
}

/* ============================================================
   HELPER WARNA
============================================================ */
const statusColor = (status: string) => {
  switch (status) {
    case 'Izin':  return 'bg-blue-50 text-blue-700 border-blue-300';
    case 'Sakit': return 'bg-amber-50 text-amber-700 border-amber-300';
    case 'Alpa':  return 'bg-red-50 text-red-700 border-red-300';
    default:      return 'bg-gray-50 text-gray-700 border-gray-300';
  }
};

const categoryColor = (category: string) => {
  switch ((category || '').toLowerCase()) {
    case 'ringan': return 'bg-yellow-50 text-yellow-700 border-yellow-300';
    case 'sedang': return 'bg-orange-50 text-orange-700 border-orange-300';
    case 'berat':  return 'bg-red-50 text-red-700 border-red-300';
    default:       return 'bg-gray-50 text-gray-700 border-gray-300';
  }
};

const pointsColor = (points: number) => {
  if (points >= 100) return 'text-red-700';
  if (points >= 50)  return 'text-orange-700';
  return 'text-green-700';
};

/* ============================================================
   KOMPONEN UTAMA
============================================================ */
export default function VerifyReport() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [data, setData] = useState<VerifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!token || token.length < 30) {
          setState('invalid');
          setErrorMsg('Token tidak valid');
          return;
        }

        const hash = await sha256Hex(token);
        const { data: res, error } = await supabase.rpc('verify_report_by_hash', {
          p_token_hash: hash,
        });

        if (cancelled) return;

        if (error) {
          setState('invalid');
          setErrorMsg('Gagal memverifikasi dokumen');
          return;
        }

        const result = res as VerifyResult;

        if (!result?.valid) {
          setState('invalid');
          setErrorMsg(
            result?.reason === 'rate_limited'
              ? 'Terlalu banyak akses ke dokumen ini'
              : result?.reason === 'not_found_or_revoked'
                ? 'Dokumen tidak ditemukan atau telah dicabut'
                : 'Dokumen tidak terverifikasi',
          );
          return;
        }

        setData(result);
        setState('valid');
      } catch {
        if (!cancelled) {
          setState('invalid');
          setErrorMsg('Terjadi kesalahan sistem');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ============================================================
  // DETEKSI JENIS LAPORAN
  // Prioritas: cek array data (students vs violations) & type
  // ============================================================
  const isViolation = !!(
    data?.violations ||
    data?.type === 'violations' ||
    (data?.type || '').toLowerCase().includes('pelanggaran')
  );

  const isAbsent = !isViolation && !!(
    data?.students ||
    data?.type === 'absent' ||
    (data?.type || '').toLowerCase().includes('tidak hadir')
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* ===== HEADER ===== */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-semibold text-slate-700">Sistem Verifikasi Dokumen</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Verifikasi Keaslian Laporan</h1>
        </div>

        {/* ===== LOADING ===== */}
        {state === 'loading' && (
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Memverifikasi dokumen...</p>
            </CardContent>
          </Card>
        )}

        {/* ===== INVALID ===== */}
        {state === 'invalid' && (
          <Card className="border-red-200">
            <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-red-700">Dokumen Tidak Terverifikasi</h2>
              <p className="text-slate-600 max-w-md">{errorMsg}</p>
              <Link to="/" className="mt-2 text-sm text-primary hover:underline">
                ← Kembali ke Beranda
              </Link>
            </CardContent>
          </Card>
        )}

        {/* ===== VALID ===== */}
        {state === 'valid' && data && (
          <>
            <Alert className="bg-emerald-50 border-emerald-200">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <AlertDescription className="text-emerald-800">
                <strong>Dokumen Terverifikasi</strong> — Laporan ini resmi dikeluarkan oleh{' '}
                {data.school || 'sekolah'}.
              </AlertDescription>
            </Alert>

            {/* ============================================================
                INFORMASI DOKUMEN (untuk kedua jenis)
            ============================================================ */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="w-5 h-5 text-primary" />
                  Informasi Dokumen
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Jenis Dokumen</p>
                  <p className="font-semibold">
                    {isViolation
                      ? 'Laporan Data Pelanggaran Siswa'
                      : isAbsent
                        ? 'Rekap Siswa Tidak Hadir'
                        : data.type || 'Dokumen Sekolah'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Nomor Seri</p>
                  <p className="font-mono font-semibold flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" />
                    {data.serial_number}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Sekolah</p>
                  <p className="font-semibold">{data.school || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Periode</p>
                  <p className="font-semibold flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {data.period || '-'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Tanggal Cetak</p>
                  <p className="font-semibold">
                    {data.print_date
                      ? new Date(data.print_date).toLocaleDateString('id-ID', { dateStyle: 'long' })
                      : '-'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Masa Berlaku</p>
                  <p className="font-semibold flex items-center gap-1 text-emerald-700">
                    <Archive className="w-3.5 h-3.5" />
                    Selama arsip sekolah aktif
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* ============================================================
                RENDER LAPORAN TIDAK HADIR
            ============================================================ */}
            {isAbsent && data.summary && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="border-slate-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-muted-foreground">Total Tidak Hadir</p>
                      <p className="text-2xl font-bold text-slate-800">
                        {(data.summary as AbsentSummary).totalAbsent ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-blue-200 bg-blue-50/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-blue-700">Izin</p>
                      <p className="text-2xl font-bold text-blue-700">
                        {(data.summary as AbsentSummary).izin ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-amber-200 bg-amber-50/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-amber-700">Sakit</p>
                      <p className="text-2xl font-bold text-amber-700">
                        {(data.summary as AbsentSummary).sakit ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-red-200 bg-red-50/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-red-700">Alpa</p>
                      <p className="text-2xl font-bold text-red-700">
                        {(data.summary as AbsentSummary).alpa ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" />
                      Daftar Siswa Tidak Hadir
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">No</TableHead>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>NIS</TableHead>
                          <TableHead>Nama</TableHead>
                          <TableHead>Kelas</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead>Catatan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.students && data.students.length > 0 ? (
                          data.students.map((s, i) => (
                            <TableRow key={`${s.nis}-${s.tanggal}-${i}`}>
                              <TableCell className="text-center">{i + 1}</TableCell>
                              <TableCell>{new Date(s.tanggal).toLocaleDateString('id-ID')}</TableCell>
                              <TableCell className="font-mono text-xs">{s.nis}</TableCell>
                              <TableCell className="font-medium">{s.nama}</TableCell>
                              <TableCell>{s.kelas}</TableCell>
                              <TableCell className="text-center">
                                <Badge className={`${statusColor(s.status)} border`}>{s.status}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {s.catatan || '-'}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                              Tidak ada data siswa
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}

            {/* ============================================================
                RENDER LAPORAN PELANGGARAN
            ============================================================ */}
            {isViolation && data.summary && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="border-slate-200">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-muted-foreground">Total Pelanggaran</p>
                      <p className="text-2xl font-bold text-slate-800">
                        {(data.summary as ViolationSummary).totalViolations ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-red-200 bg-red-50/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-red-700">Total Poin</p>
                      <p className="text-2xl font-bold text-red-700">
                        {(data.summary as ViolationSummary).totalPoints ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-yellow-200 bg-yellow-50/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-yellow-700">Ringan</p>
                      <p className="text-2xl font-bold text-yellow-700">
                        {(data.summary as ViolationSummary).ringan ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-orange-200 bg-orange-50/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-orange-700">Sedang</p>
                      <p className="text-2xl font-bold text-orange-700">
                        {(data.summary as ViolationSummary).sedang ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Tabel Pelanggaran */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      Daftar Pelanggaran Siswa
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">No</TableHead>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>NIS</TableHead>
                          <TableHead>Nama</TableHead>
                          <TableHead>Kelas</TableHead>
                          <TableHead>Jenis Pelanggaran</TableHead>
                          <TableHead className="text-center">Kategori</TableHead>
                          <TableHead className="text-center">Poin</TableHead>
                          <TableHead>Pelapor</TableHead>
                          <TableHead>Catatan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.violations && data.violations.length > 0 ? (
                          data.violations.map((v, i) => (
                            <TableRow key={`${v.nis}-${v.tanggal}-${i}`}>
                              <TableCell className="text-center">{i + 1}</TableCell>
                              <TableCell>
                                {new Date(v.tanggal).toLocaleDateString('id-ID')}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{v.nis}</TableCell>
                              <TableCell className="font-medium">{v.nama}</TableCell>
                              <TableCell>{v.kelas}</TableCell>
                              <TableCell>{v.jenis}</TableCell>
                              <TableCell className="text-center">
                                <Badge className={`${categoryColor(v.kategori)} border capitalize`}>
                                  {v.kategori}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className={`font-bold ${pointsColor(v.poin)}`}>
                                  {v.poin}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs">{v.pelapor || '-'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                                {v.catatan || '-'}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                              Tidak ada data pelanggaran
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}

            {/* ===== FALLBACK: tipe tidak dikenal ===== */}
            {!isAbsent && !isViolation && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="py-8 text-center">
                  <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto mb-2" />
                  <p className="text-amber-800 font-medium">
                    Dokumen terverifikasi, tetapi jenis laporan tidak dikenali.
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Tipe: {data.type || '(tidak ada)'}
                  </p>
                </CardContent>
              </Card>
            )}

            <p className="text-center text-xs text-slate-500 pt-4">
              Dokumen ini diverifikasi secara otomatis oleh sistem. Token tidak dapat digunakan kembali di luar URL ini.
            </p>
          </>
        )}
      </div>
    </div>
  );
}