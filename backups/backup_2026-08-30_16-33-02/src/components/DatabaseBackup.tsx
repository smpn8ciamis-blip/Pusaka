import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Download, Upload, Database, AlertCircle, CheckCircle, Code2, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DatabaseSync } from "./DatabaseSync";

export const DatabaseBackup = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<any>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setExportStatus("Mengekspor database... (ini bisa memakan waktu beberapa menit)");
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-database`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = 'Failed to export';
        try { errorMsg = JSON.parse(errorText).error || errorMsg; } catch {}
        throw new Error(errorMsg);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `full-migration-${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Database berhasil diekspor dalam format SQL");
    } catch (error) {
      console.error('Export error:', error);
      toast.error("Gagal mengekspor database: " + (error as Error).message);
    } finally {
      setIsExporting(false);
      setExportStatus("");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResults(null);

    try {
      const text = await file.text();
      let body: any;
      let headers: Record<string, string> = {};

      if (file.name.endsWith('.sql')) {
        body = text;
        headers['content-type'] = 'application/sql';
      } else {
        body = JSON.parse(text);
        headers['content-type'] = 'application/json';
      }

      const { data, error } = await supabase.functions.invoke('import-database', {
        body,
        headers
      });

      if (error) throw error;

      setImportResults(data);
      toast.success("Database berhasil diimpor");
    } catch (error) {
      console.error('Import error:', error);
      toast.error("Gagal mengimpor database");
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const handleExportCode = () => {
    toast.info("Untuk export kode aplikasi, gunakan integrasi GitHub di Settings");
    window.open("https://github.com", "_blank");
  };

  return (
    <Tabs defaultValue="backup" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="backup" className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          Backup & Restore
        </TabsTrigger>
        <TabsTrigger value="sync" className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Sinkronisasi
        </TabsTrigger>
        <TabsTrigger value="code" className="flex items-center gap-2">
          <Code2 className="h-4 w-4" />
          Export Kode
        </TabsTrigger>
      </TabsList>

      <TabsContent value="backup">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Backup & Restore Database
            </CardTitle>
            <CardDescription>
              Ekspor dan impor seluruh data database untuk backup atau migrasi
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Peringatan:</strong> Import database akan menimpa data yang sudah ada dengan ID yang sama. 
                Pastikan Anda memiliki backup sebelum melakukan import.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Export Full Migration</CardTitle>
                  <CardDescription className="text-sm">
                    Download schema lengkap + RLS policies + functions + triggers + seluruh data + auth users dalam format SQL
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    onClick={handleExport}
                    disabled={isExporting}
                    className="w-full"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Mengekspor...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Export Database
                      </>
                    )}
                  </Button>
                  {isExporting && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground text-center">
                        {exportStatus}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Import Database</CardTitle>
                  <CardDescription className="text-sm">
                    Upload file backup SQL atau JSON untuk restore
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    asChild
                    disabled={isImporting}
                    className="w-full"
                    variant="secondary"
                  >
                    <label className="cursor-pointer">
                      <Upload className="h-4 w-4 mr-2" />
                      {isImporting ? "Mengimpor..." : "Import Database"}
                      <input
                        type="file"
                        accept=".sql,.json"
                        onChange={handleImport}
                        className="hidden"
                        disabled={isImporting}
                      />
                    </label>
                  </Button>
                </CardContent>
              </Card>
            </div>

            {importResults && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Hasil Import
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {Object.entries(importResults.results).map(([table, result]: [string, any]) => (
                      <div key={table} className="flex justify-between items-center py-1 border-b">
                        <span className="font-medium">{table}</span>
                        <span className={result.success ? "text-green-600" : "text-red-600"}>
                          {result.success 
                            ? `✓ ${result.count} records` 
                            : result.skipped 
                            ? "Skipped (no data)"
                            : `✗ ${result.error}`
                          }
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sync">
        <DatabaseSync />
      </TabsContent>

      <TabsContent value="code">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              Export Kode Aplikasi
            </CardTitle>
            <CardDescription>
              Download seluruh source code aplikasi untuk dijalankan di komputer lokal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Untuk menjalankan aplikasi di komputer lokal, Anda memerlukan Node.js dan Git terinstall.
                Hubungkan project ke GitHub untuk kemudahan export dan version control.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="p-4 border rounded-lg bg-muted/50">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Cara Export Aplikasi:
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Klik tombol Settings di pojok kanan atas</li>
                  <li>Pilih tab "Integrations" atau "GitHub"</li>
                  <li>Hubungkan project dengan GitHub repository Anda</li>
                  <li>Clone repository ke komputer lokal menggunakan Git</li>
                  <li>Jalankan <code className="bg-muted px-1 py-0.5 rounded">npm install</code> untuk install dependencies</li>
                  <li>Jalankan <code className="bg-muted px-1 py-0.5 rounded">npm run dev</code> untuk menjalankan aplikasi</li>
                </ol>
              </div>

              <Button 
                onClick={handleExportCode}
                className="w-full"
                variant="outline"
              >
                <Code2 className="h-4 w-4 mr-2" />
                Panduan Export ke GitHub
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};
