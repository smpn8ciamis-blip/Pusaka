import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Database, Download, Eye, EyeOff, Loader2, ShieldCheck, Terminal } from 'lucide-react';

/**
 * Export "Template Database": skema + RLS + bucket + akun super admin + data dummy.
 * Hasilnya satu file .sql yang bisa dijalankan di SQL Editor Supabase (online) maupun self-hosted.
 */
export default function TemplateExportTab() {
  const [accountMode, setAccountMode] = useState<'new' | 'current'>('new');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('Super Admin');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; kb: number } | null>(null);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const formOk = accountMode === 'current' || (emailOk && password.length >= 8);

  const handleExport = async () => {
    if (!formOk || busy) return;
    setBusy(true);
    setDone(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-database`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'template',
          admin: accountMode === 'current'
            ? { useCurrent: true }
            : { email: email.trim(), password, full_name: fullName.trim() || 'Super Admin' },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Gagal membuat template (HTTP ${res.status})`;
        try { msg = JSON.parse(text).error || msg; } catch { /* bukan JSON */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const tail = await blob.slice(Math.max(0, blob.size - 4000)).text();
      if (tail.includes('-- EXPORT ERROR')) {
        throw new Error('Server error saat membuat template: ' + (tail.split('-- EXPORT ERROR:')[1] || '').split('\n')[0].trim());
      }
      if (!tail.includes('MIGRATION COMPLETE')) {
        throw new Error('File tidak lengkap (koneksi terputus atau waktu habis). Coba lagi.');
      }
      const name = `template-database-${new Date().toISOString().split('T')[0]}.sql`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setDone({ name, kb: Math.round(blob.size / 1024) });
      toast.success('Template database berhasil dibuat');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Gagal membuat template database');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Export Template Database</CardTitle>
          <CardDescription>
            Satu file SQL berisi seluruh struktur database, kebijakan keamanan (RLS), bucket storage, akun super admin, dan data dummy.
            Tidak ada data asli sekolah yang ikut terekspor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Akun super admin di template</Label>
            <RadioGroup value={accountMode} onValueChange={(v) => setAccountMode(v as 'new' | 'current')} className="grid gap-2">
              <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${accountMode === 'new' ? 'border-primary bg-primary/5' : ''}`}>
                <RadioGroupItem value="new" className="mt-1" />
                <div>
                  <p className="text-sm font-medium">Buat akun baru (disarankan)</p>
                  <p className="text-xs text-muted-foreground">Cocok untuk template yang akan dibagikan. Password disimpan sebagai hash, bukan teks biasa.</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${accountMode === 'current' ? 'border-primary bg-primary/5' : ''}`}>
                <RadioGroupItem value="current" className="mt-1" />
                <div>
                  <p className="text-sm font-medium">Salin akun saya saat ini</p>
                  <p className="text-xs text-muted-foreground">Memakai email dan password Anda yang sekarang (hash asli ikut tersimpan di file). Hanya untuk pemakaian pribadi.</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {accountMode === 'new' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tpl-name">Nama</Label>
                <Input id="tpl-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Super Admin" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-email">Email</Label>
                <Input id="tpl-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="superadmin@contoh.id" />
                {email && !emailOk && <p className="text-xs text-destructive">Format email tidak valid</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-pw">Password (min. 8 karakter)</Label>
                <div className="relative">
                  <Input id="tpl-pw" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                  <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'} className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password && password.length < 8 && <p className="text-xs text-destructive">Password minimal 8 karakter</p>}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1.5">
            <p className="font-medium">Isi file template</p>
            <ul className="grid gap-1 text-muted-foreground sm:grid-cols-2">
              {['Ekstensi, enum, tabel, kunci, indeks', 'Fungsi & trigger database', 'Seluruh kebijakan RLS', 'Bucket storage + kebijakannya', 'Akun super admin (auth.users)', 'Data dummy (siswa, guru, kelas, jadwal, dll.)'].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />{t}</li>
              ))}
            </ul>
          </div>

          <Button onClick={handleExport} disabled={!formOk || busy} className="w-full sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {busy ? 'Membuat template… (bisa beberapa menit)' : 'Buat & Unduh Template SQL'}
          </Button>

          {done && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Template siap</AlertTitle>
              <AlertDescription>{done.name} ({done.kb.toLocaleString('id-ID')} KB) telah diunduh. Ikuti panduan di samping untuk menjalankannya.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Terminal className="h-4 w-4" />Cara menjalankan</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-medium">Supabase online</p>
              <ol className="list-decimal pl-5 text-muted-foreground space-y-0.5">
                <li>Buat project baru (database kosong).</li>
                <li>Buka <b>SQL Editor</b> → New query.</li>
                <li>Tempel isi file → <b>Run</b>.</li>
              </ol>
              <p className="text-xs text-muted-foreground mt-1">Jika editor menolak karena terlalu besar, tempel per bagian “SECTION” secara berurutan.</p>
            </div>
            <div>
              <p className="font-medium">Self-hosted</p>
              <pre className="mt-1 rounded-md bg-muted p-2 text-xs overflow-x-auto">docker cp template.sql supabase-db:/tmp/t.sql{'\n'}docker exec supabase-db psql -U postgres -d postgres -f /tmp/t.sql</pre>
              <p className="text-xs text-muted-foreground mt-1">Atau tempel di SQL Editor Supabase Studio self-hosted.</p>
            </div>
            <p className="text-xs text-muted-foreground">File aman dijalankan berulang kali. Baris yang gagal akan dilewati dan ditampilkan sebagai pesan NOTICE, tidak menghentikan proses.</p>
          </CardContent>
        </Card>

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Akun yang dibuat</AlertTitle>
          <AlertDescription className="text-xs">
            Selain super admin, template memuat 1 admin dan 8 guru dummy (<code>@dummy.test</code>) dengan password acak sehingga tidak bisa dipakai login.
          </AlertDescription>
        </Alert>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Jaga kerahasiaan file</AlertTitle>
          <AlertDescription className="text-xs">
            File berisi hash password super admin dan seluruh struktur keamanan database. Jangan unggah ke tempat publik.
            Segera ganti password setelah template dipasang di lingkungan baru.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
