import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, QrCode, AlertCircle, Shield, Calendar, Building2, FileText, Camera, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface VerificationData {
  verification?: string;
  type: string;
  school: string;
  period: string;
  stats?: {
    hadir: number;
    sakit: number;
    izin: number;
    alpa: number;
  };
  summary?: {
    totalAbsent: number;
    izin: number;
    sakit: number;
    alpa: number;
  };
  students: Array<{
    nis: string;
    nama: string;
    kelas: string;
    status: string;
    tanggal: string;
    catatan?: string;
  }>;
  printDate: string;
  totalRecords: number;
}

const Verify = () => {
  const [qrInput, setQrInput] = useState('');
  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qrReaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      // Cleanup scanner on unmount
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleVerify = async () => {
    try {
      setError('');
      const serialNumber = qrInput.trim();
      
      // Query database for report
      const { data, error } = await supabase
        .from('verified_reports')
        .select('*')
        .eq('serial_number', serialNumber)
        .single();

      if (error || !data) {
        setError('Nomor seri tidak ditemukan atau dokumen sudah kadaluarsa');
        setVerificationData(null);
        return;
      }

            setVerificationData(data.report_data as unknown as VerificationData);
    } catch (err) {
      setError('Terjadi kesalahan saat memverifikasi dokumen');
      setVerificationData(null);
    }
  };

  const startScanning = async () => {
    try {
      setCameraError('');
      setError('');

      // Check if camera permissions are available
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Stop the test stream immediately
        stream.getTracks().forEach(track => track.stop());
      } catch (permErr: any) {
        console.error('Permission error:', permErr);
        let errorMsg = 'Tidak dapat mengakses kamera. ';
        
        if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
          errorMsg += 'Izin kamera ditolak. Klik ikon kamera di address bar browser Anda dan izinkan akses kamera.';
        } else if (permErr.name === 'NotFoundError' || permErr.name === 'DevicesNotFoundError') {
          errorMsg += 'Tidak ada kamera yang ditemukan pada perangkat ini.';
        } else if (permErr.name === 'NotReadableError' || permErr.name === 'TrackStartError') {
          errorMsg += 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi tersebut dan coba lagi.';
        } else if (permErr.name === 'OverconstrainedError') {
          errorMsg += 'Kamera tidak mendukung pengaturan yang diminta.';
        } else if (permErr.name === 'NotSupportedError') {
          errorMsg += 'Browser tidak mendukung akses kamera. Gunakan browser modern seperti Chrome atau Firefox.';
        } else {
          errorMsg += 'Pastikan Anda menggunakan HTTPS atau localhost dan telah memberikan izin kamera.';
        }
        
        setCameraError(errorMsg);
        toast.error('Gagal mengakses kamera');
        return;
      }

      setIsScanning(true);

      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          // Successfully scanned
          setQrInput(decodedText);
          stopScanning();
          toast.success('QR Code berhasil dipindai!');
          
          // Auto verify
          try {
            const serialNumber = decodedText.trim();
            
            // Query database for report
            const { data, error } = await supabase
              .from('verified_reports')
              .select('*')
              .eq('serial_number', serialNumber)
              .single();

            if (error || !data) {
              setError('Nomor seri tidak ditemukan atau dokumen sudah kadaluarsa');
              setVerificationData(null);
              return;
            }

            setVerificationData(data.report_data as unknown as VerificationData);
          } catch (err) {
            setError('Terjadi kesalahan saat memverifikasi dokumen');
            setVerificationData(null);
          }
        },
        () => {
          // Scan error (ignored, happens frequently)
        }
      );
    } catch (err: any) {
      console.error('Error starting scanner:', err);
      setCameraError('Tidak dapat memulai scanner. Coba refresh halaman dan izinkan akses kamera.');
      setIsScanning(false);
      toast.error('Gagal memulai scanner');
    }
  };

  const stopScanning = () => {
    if (scannerRef.current) {
      scannerRef.current
        .stop()
        .then(() => {
          setIsScanning(false);
          scannerRef.current = null;
        })
        .catch((err) => {
          console.error('Error stopping scanner:', err);
          setIsScanning(false);
        });
    } else {
      setIsScanning(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'hadir':
        return <Badge className="bg-green-500">{status}</Badge>;
      case 'sakit':
        return <Badge className="bg-yellow-500">{status}</Badge>;
      case 'izin':
        return <Badge className="bg-blue-500">{status}</Badge>;
      case 'alpa':
        return <Badge className="bg-red-500">{status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const isValid = verificationData?.verification === 'DOKUMEN VALID';

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/10 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Verifikasi Dokumen
            </h1>
          </div>
          <p className="text-muted-foreground">
            Verifikasi keaslian dokumen laporan dengan memindai atau memasukkan data QR code
          </p>
        </div>

        {/* Input Section */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Masukkan Data QR Code
            </CardTitle>
            <CardDescription>
              Pindai QR code dari dokumen menggunakan kamera atau salin teks data QR dan tempel di bawah ini
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Scanner Section */}
            {isScanning ? (
              <div className="space-y-4">
                <div 
                  id="qr-reader" 
                  ref={qrReaderRef}
                  className="rounded-lg overflow-hidden border-4 border-primary"
                />
                <Button 
                  onClick={stopScanning} 
                  variant="destructive" 
                  className="w-full"
                  size="lg"
                >
                  <X className="mr-2 h-5 w-5" />
                  Berhenti Scan
                </Button>
              </div>
            ) : (
              <>
                <Button 
                  onClick={startScanning} 
                  variant="outline" 
                  className="w-full border-2 border-primary hover:bg-primary hover:text-primary-foreground"
                  size="lg"
                >
                  <Camera className="mr-2 h-5 w-5" />
                  Scan QR Code dengan Kamera
                </Button>

                {cameraError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="space-y-2">
                        <p>{cameraError}</p>
                        <p className="text-xs">
                          Tip: Pastikan Anda menggunakan browser modern (Chrome/Firefox) dan halaman diakses melalui HTTPS atau localhost.
                        </p>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      Atau masukkan manual
                    </span>
                  </div>
                </div>

                <Textarea
                  placeholder='Masukkan nomor seri laporan (contoh: 2025-01-12345)'
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  rows={3}
                  className="font-mono text-sm"
                />
                <Button onClick={handleVerify} className="w-full bg-gradient-primary" size="lg">
                  <Shield className="mr-2 h-5 w-5" />
                  Verifikasi Dokumen
                </Button>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Verification Result */}
        {verificationData && (
          <div className="space-y-6 animate-fade-in">
            {/* Status Card */}
            <Card className={`border-4 ${isValid ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-red-500 bg-red-50 dark:bg-red-950/20'}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-center gap-4">
                  {isValid ? (
                    <>
                      <CheckCircle2 className="h-16 w-16 text-green-500" />
                      <div>
                        <h2 className="text-3xl font-bold text-green-700 dark:text-green-400">
                          DOKUMEN VALID
                        </h2>
                        <p className="text-green-600 dark:text-green-500">
                          Dokumen ini telah terverifikasi dan sah
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-16 w-16 text-red-500" />
                      <div>
                        <h2 className="text-3xl font-bold text-red-700 dark:text-red-400">
                          DOKUMEN TIDAK VALID
                        </h2>
                        <p className="text-red-600 dark:text-red-500">
                          Dokumen ini tidak dapat diverifikasi
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Document Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Informasi Dokumen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Sekolah</p>
                      <p className="font-semibold">{verificationData.school}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Jenis Laporan</p>
                      <p className="font-semibold">{verificationData.type}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Periode</p>
                      <p className="font-semibold">{verificationData.period}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Tanggal Cetak</p>
                      <p className="font-semibold">
                        {new Date(verificationData.printDate).toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Statistics */}
                {verificationData.stats && (
                  <div className="pt-4 border-t">
                    <h3 className="font-semibold mb-3">Statistik Kehadiran</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Card className="bg-green-50 dark:bg-green-950/20">
                        <CardContent className="pt-4 text-center">
                          <p className="text-2xl font-bold text-green-600">{verificationData.stats.hadir}</p>
                          <p className="text-xs text-green-700 dark:text-green-400">Hadir</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-yellow-50 dark:bg-yellow-950/20">
                        <CardContent className="pt-4 text-center">
                          <p className="text-2xl font-bold text-yellow-600">{verificationData.stats.sakit}</p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-400">Sakit</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-blue-50 dark:bg-blue-950/20">
                        <CardContent className="pt-4 text-center">
                          <p className="text-2xl font-bold text-blue-600">{verificationData.stats.izin}</p>
                          <p className="text-xs text-blue-700 dark:text-blue-400">Izin</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-red-50 dark:bg-red-950/20">
                        <CardContent className="pt-4 text-center">
                          <p className="text-2xl font-bold text-red-600">{verificationData.stats.alpa}</p>
                          <p className="text-xs text-red-700 dark:text-red-400">Alpa</p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}

                {/* Summary for Absent Report */}
                {verificationData.summary && (
                  <div className="pt-4 border-t">
                    <h3 className="font-semibold mb-3">Ringkasan Ketidakhadiran</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Card className="bg-red-50 dark:bg-red-950/20">
                        <CardContent className="pt-4 text-center">
                          <p className="text-2xl font-bold text-red-600">{verificationData.summary.totalAbsent}</p>
                          <p className="text-xs text-red-700 dark:text-red-400">Total Tidak Hadir</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-blue-50 dark:bg-blue-950/20">
                        <CardContent className="pt-4 text-center">
                          <p className="text-2xl font-bold text-blue-600">{verificationData.summary.izin}</p>
                          <p className="text-xs text-blue-700 dark:text-blue-400">Izin</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-yellow-50 dark:bg-yellow-950/20">
                        <CardContent className="pt-4 text-center">
                          <p className="text-2xl font-bold text-yellow-600">{verificationData.summary.sakit}</p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-400">Sakit</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-red-50 dark:bg-red-950/20">
                        <CardContent className="pt-4 text-center">
                          <p className="text-2xl font-bold text-red-600">{verificationData.summary.alpa}</p>
                          <p className="text-xs text-red-700 dark:text-red-400">Alpa</p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Students Data */}
            <Card>
              <CardHeader>
                <CardTitle>Data Siswa ({verificationData.totalRecords} Siswa)</CardTitle>
                <CardDescription>
                  Daftar lengkap siswa yang tercantum dalam dokumen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">No</TableHead>
                        <TableHead>NIS</TableHead>
                        <TableHead>Nama Siswa</TableHead>
                        <TableHead>Kelas</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Catatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {verificationData.students.map((student, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell>{student.nis}</TableCell>
                          <TableCell className="font-medium">{student.nama}</TableCell>
                          <TableCell>{student.kelas}</TableCell>
                          <TableCell>{student.tanggal}</TableCell>
                          <TableCell>{getStatusBadge(student.status)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {student.catatan || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Verify;
