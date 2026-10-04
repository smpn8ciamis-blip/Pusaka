import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Shield, Loader2, QrCode, Copy, Check, Trash2, Key, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { generateBackupCodes, hashBackupCode, formatBackupCode } from '@/lib/backupCodes';

interface TwoFactorSetupProps {
  onComplete?: () => void;
}

export function TwoFactorSetup({ onComplete }: TwoFactorSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [existingFactorId, setExistingFactorId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  
  // Backup codes state
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [hasBackupCodes, setHasBackupCodes] = useState(false);
  const [isRegeneratingCodes, setIsRegeneratingCodes] = useState(false);

  useEffect(() => {
    checkExistingFactors();
  }, []);

  const checkExistingFactors = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const verifiedFactor = data.totp.find((f) => f.status === 'verified');
      if (verifiedFactor) {
        setIsEnabled(true);
        setExistingFactorId(verifiedFactor.id);
        
        // Check if user has backup codes
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { count } = await supabase
            .from('mfa_backup_codes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .is('used_at', null);
          
          setHasBackupCodes((count || 0) > 0);
        }
      }
    } catch (err) {
      console.error('Error checking MFA factors:', err);
    }
  };

  const startEnrollment = async () => {
    setIsEnrolling(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App',
      });

      if (error) throw error;

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
    } catch (err: any) {
      console.error('Enrollment error:', err);
      setError(err.message || 'Gagal memulai pendaftaran 2FA');
      toast.error('Gagal memulai pendaftaran 2FA');
    } finally {
      setIsEnrolling(false);
    }
  };

  const generateAndSaveBackupCodes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not found');

    // Generate 10 backup codes
    const codes = generateBackupCodes(10);
    setBackupCodes(codes);

    // Delete existing backup codes
    await supabase
      .from('mfa_backup_codes')
      .delete()
      .eq('user_id', user.id);

    // Hash and save new backup codes
    for (const code of codes) {
      const codeHash = await hashBackupCode(code);
      await supabase
        .from('mfa_backup_codes')
        .insert({
          user_id: user.id,
          code_hash: codeHash,
        });
    }

    setHasBackupCodes(true);
  };

  const verifyAndEnable = async () => {
    if (verifyCode.length !== 6 || !factorId) {
      setError('Masukkan 6 digit kode OTP');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Create challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError) throw challengeError;

      // Verify the code
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });

      if (verifyError) throw verifyError;

      // Generate and save backup codes
      await generateAndSaveBackupCodes();

      setIsEnabled(true);
      setExistingFactorId(factorId);
      setQrCode(null);
      setSecret(null);
      setFactorId(null);
      setVerifyCode('');
      
      // Show backup codes dialog
      setShowBackupCodes(true);
      
      toast.success('2FA berhasil diaktifkan!');
    } catch (err: any) {
      console.error('Verification error:', err);
      setError(err.message || 'Kode OTP tidak valid');
      setVerifyCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const disable2FA = async () => {
    if (!existingFactorId) return;

    setIsDisabling(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: existingFactorId,
      });

      if (error) throw error;

      // Delete backup codes
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('mfa_backup_codes')
          .delete()
          .eq('user_id', user.id);
      }

      setIsEnabled(false);
      setExistingFactorId(null);
      setHasBackupCodes(false);
      toast.success('2FA berhasil dinonaktifkan');
    } catch (err: any) {
      console.error('Disable 2FA error:', err);
      toast.error(err.message || 'Gagal menonaktifkan 2FA');
    } finally {
      setIsDisabling(false);
    }
  };

  const regenerateBackupCodes = async () => {
    setIsRegeneratingCodes(true);
    try {
      await generateAndSaveBackupCodes();
      setShowBackupCodes(true);
      toast.success('Backup codes berhasil dibuat ulang!');
    } catch (err: any) {
      console.error('Error regenerating backup codes:', err);
      toast.error('Gagal membuat ulang backup codes');
    } finally {
      setIsRegeneratingCodes(false);
    }
  };

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success('Secret key disalin ke clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyAllBackupCodes = () => {
    const codesText = backupCodes.map(formatBackupCode).join('\n');
    navigator.clipboard.writeText(codesText);
    toast.success('Semua backup codes disalin ke clipboard');
  };

  const downloadBackupCodes = () => {
    const codesText = `Backup Codes untuk 2FA\n` +
      `===========================\n\n` +
      `Simpan codes ini di tempat yang aman.\n` +
      `Setiap code hanya bisa digunakan sekali.\n\n` +
      backupCodes.map((code, i) => `${i + 1}. ${formatBackupCode(code)}`).join('\n') +
      `\n\n===========================\n` +
      `Dibuat: ${new Date().toLocaleString('id-ID')}`;

    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-codes-2fa.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Backup codes berhasil diunduh');
  };

  const cancelEnrollment = async () => {
    if (factorId) {
      try {
        await supabase.auth.mfa.unenroll({ factorId });
      } catch (err) {
        console.error('Error canceling enrollment:', err);
      }
    }
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setVerifyCode('');
    setError('');
  };

  const handleBackupCodesDialogClose = () => {
    setShowBackupCodes(false);
    setBackupCodes([]);
    onComplete?.();
  };

  // Backup Codes Dialog
  const BackupCodesDialog = () => (
    <Dialog open={showBackupCodes} onOpenChange={handleBackupCodesDialogClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Backup Codes
          </DialogTitle>
          <DialogDescription>
            Simpan kode-kode ini di tempat yang aman. Gunakan jika Anda kehilangan akses ke aplikasi authenticator.
          </DialogDescription>
        </DialogHeader>
        
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertDescription className="text-amber-600 dark:text-amber-400 text-sm">
            ⚠️ Kode ini hanya ditampilkan sekali! Simpan sekarang.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg font-mono text-sm">
          {backupCodes.map((code, index) => (
            <div key={index} className="p-2 bg-background rounded text-center">
              {formatBackupCode(code)}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={copyAllBackupCodes} className="flex-1">
            <Copy className="mr-2 h-4 w-4" />
            Salin Semua
          </Button>
          <Button variant="outline" onClick={downloadBackupCodes} className="flex-1">
            <Download className="mr-2 h-4 w-4" />
            Unduh
          </Button>
        </div>

        <Button onClick={handleBackupCodesDialogClose} className="w-full">
          Saya Sudah Menyimpan Kode-kode Ini
        </Button>
      </DialogContent>
    </Dialog>
  );

  if (isEnabled) {
    return (
      <>
        <BackupCodesDialog />
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Shield className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Autentikasi Dua Faktor (2FA)</CardTitle>
                <CardDescription>2FA sudah aktif untuk akun Anda</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-green-500/30 bg-green-500/5">
              <Shield className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-600 dark:text-green-400">
                Akun Anda dilindungi dengan autentikasi dua faktor
              </AlertDescription>
            </Alert>

            {/* Backup codes section */}
            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Backup Codes</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${hasBackupCodes ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'}`}>
                  {hasBackupCodes ? 'Tersedia' : 'Tidak tersedia'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Gunakan backup codes jika Anda kehilangan akses ke aplikasi authenticator.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={regenerateBackupCodes}
                disabled={isRegeneratingCodes}
                className="w-full"
              >
                {isRegeneratingCodes ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Membuat...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {hasBackupCodes ? 'Buat Ulang Backup Codes' : 'Buat Backup Codes'}
                  </>
                )}
              </Button>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full" disabled={isDisabling}>
                  {isDisabling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Menonaktifkan...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Nonaktifkan 2FA
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Nonaktifkan 2FA?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Menonaktifkan 2FA akan mengurangi keamanan akun Anda. 
                    Anda perlu mengatur ulang 2FA jika ingin mengaktifkannya kembali.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={disable2FA} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Nonaktifkan
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </>
    );
  }

  if (qrCode && secret) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <QrCode className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Atur 2FA</CardTitle>
              <CardDescription>Scan QR code dengan aplikasi authenticator</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center">
            <div className="p-4 bg-white rounded-xl shadow-inner">
              <img src={qrCode} alt="QR Code" className="w-48 h-48" />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground text-center">
              Atau masukkan kode manual:
            </p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <code className="flex-1 text-sm font-mono break-all">{secret}</code>
              <Button variant="ghost" size="icon" onClick={copySecret}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-center">
              Masukkan kode 6 digit dari aplikasi:
            </p>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={verifyCode}
                onChange={(value) => {
                  setVerifyCode(value);
                  setError('');
                }}
                onComplete={verifyAndEnable}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={cancelEnrollment}
              disabled={isLoading}
              className="flex-1"
            >
              Batal
            </Button>
            <Button
              onClick={verifyAndEnable}
              disabled={isLoading || verifyCode.length !== 6}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memverifikasi...
                </>
              ) : (
                'Aktifkan 2FA'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Autentikasi Dua Faktor (2FA)</CardTitle>
            <CardDescription>Tambahkan lapisan keamanan ekstra ke akun Anda</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            2FA melindungi akun Anda dengan memerlukan kode verifikasi dari aplikasi authenticator saat login.
          </AlertDescription>
        </Alert>

        <Button onClick={startEnrollment} disabled={isEnrolling} className="w-full">
          {isEnrolling ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Mempersiapkan...
            </>
          ) : (
            <>
              <Shield className="mr-2 h-4 w-4" />
              Aktifkan 2FA
            </>
          )}
        </Button>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
