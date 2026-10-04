import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Database } from 'lucide-react';

export default function SetupSampleData() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSetup = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-sample-data', {
        body: {}
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Sample data berhasil dibuat!');
      console.log('Sample data:', data);
    } catch (error: any) {
      toast.error('Gagal membuat sample data: ' + error.message);
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Setup Sample Database
          </CardTitle>
          <CardDescription>
            Buat data contoh untuk testing aplikasi (kelas, siswa, jadwal, dll.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleSetup} 
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Membuat Sample Data...
              </>
            ) : (
              'Setup Sample Data'
            )}
          </Button>
          <p className="mt-4 text-sm text-muted-foreground">
            Ini akan membuat:
          </p>
          <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>Akun guru (guru@sekolah.com / Guru123!)</li>
            <li>5 kelas (VII A, VII B, VIII A, VIII B, IX A)</li>
            <li>10 siswa sample</li>
            <li>7 jadwal pelajaran</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
