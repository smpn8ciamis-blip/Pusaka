import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, RefreshCw, Clock, FileCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { id } from "date-fns/locale";

interface ZapierWebhook {
  id: string;
  table_name: string;
  webhook_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SyncLog {
  id: string;
  table_name: string;
  sync_type: string;
  records_count: number;
  status: string;
  error_message?: string;
  created_at: string;
}

const TABLES = [
  { name: 'students', label: 'Siswa (Students)' },
  { name: 'teachers', label: 'Guru (Teachers)' },
  { name: 'classes', label: 'Kelas (Classes)' },
  { name: 'schedules', label: 'Jadwal (Schedules)' },
  { name: 'attendance', label: 'Kehadiran (Attendance)' },
  { name: 'grades', label: 'Nilai (Grades)' },
  { name: 'teaching_journals', label: 'Jurnal Mengajar (Teaching Journals)' },
];

export const ZapierWebhookManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [webhookUrls, setWebhookUrls] = useState<Record<string, string>>({});
  const [showInstructions, setShowInstructions] = useState(true);

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['zapier-webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zapier_webhooks' as any)
        .select('*')
        .order('table_name');
      
      if (error) throw error;
      
      // Initialize webhook URLs state
      const urls: Record<string, string> = {};
      (data as unknown as ZapierWebhook[])?.forEach(webhook => {
        urls[webhook.table_name] = webhook.webhook_url;
      });
      setWebhookUrls(urls);
      
      return data as unknown as ZapierWebhook[];
    },
  });

  const { data: syncLogs } = useQuery({
    queryKey: ['sync-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_logs' as any)
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as SyncLog[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ tableName, webhookUrl, isActive }: { 
      tableName: string; 
      webhookUrl: string;
      isActive: boolean;
    }) => {
      const { data, error } = await supabase
        .from('zapier_webhooks' as any)
        .upsert({
          table_name: tableName,
          webhook_url: webhookUrl,
          is_active: isActive,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zapier-webhooks'] });
      toast({
        title: "Berhasil",
        description: "Webhook berhasil disimpan",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (tableName: string) => {
      const { error } = await supabase
        .from('zapier_webhooks' as any)
        .delete()
        .eq('table_name', tableName);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zapier-webhooks'] });
      toast({
        title: "Berhasil",
        description: "Webhook berhasil dihapus",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (tableName: string) => {
      const config = getWebhookConfig(tableName);
      if (!config || !config.is_active) {
        throw new Error("Webhook belum dikonfigurasi atau tidak aktif");
      }

      // Fetch all data from the table
      const { data, error } = await supabase
        .from(tableName as any)
        .select('*');

      if (error) throw error;

      // Send to webhook
      const response = await fetch(config.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "no-cors", // Untuk Google Apps Script
        body: JSON.stringify({
          table: tableName,
          type: "MANUAL_SYNC",
          records: data,
          timestamp: new Date().toISOString(),
        }),
      });

      // mode: no-cors tidak memberikan response yang bisa dibaca
      // Jadi kita anggap sukses jika tidak ada error
      console.log("Webhook request sent successfully");

      // Log the sync
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('sync_logs' as any).insert({
          table_name: tableName,
          sync_type: 'MANUAL_SYNC',
          records_count: data?.length || 0,
          status: 'success',
          created_by: user.id,
        } as any);
      }

      return data;
    },
    onSuccess: (data, tableName) => {
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
      toast({
        title: "Berhasil",
        description: `${data?.length || 0} data dari tabel ${tableName} berhasil disinkronkan`,
      });
    },
    onError: async (error, tableName) => {
      // Log the failed sync
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('sync_logs' as any).insert({
          table_name: tableName,
          sync_type: 'MANUAL_SYNC',
          records_count: 0,
          status: 'failed',
          error_message: error.message,
          created_by: user.id,
        } as any);
      }
      
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getWebhookConfig = (tableName: string) => {
    return webhooks?.find(w => w.table_name === tableName);
  };

  const getLastSync = (tableName: string) => {
    return syncLogs?.find(log => log.table_name === tableName);
  };

  const handleSave = (tableName: string) => {
    const url = webhookUrls[tableName];
    if (!url) {
      toast({
        title: "Error",
        description: "Masukkan URL webhook",
        variant: "destructive",
      });
      return;
    }

    const config = getWebhookConfig(tableName);
    saveMutation.mutate({
      tableName,
      webhookUrl: url,
      isActive: config?.is_active ?? true,
    });
  };

  const handleToggle = (tableName: string, isActive: boolean) => {
    const config = getWebhookConfig(tableName);
    if (!config) return;

    saveMutation.mutate({
      tableName,
      webhookUrl: config.webhook_url,
      isActive,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>📚 Panduan Setup Webhook</CardTitle>
              <CardDescription>
                Pilih salah satu platform gratis di bawah untuk menerima data dari sistem ini
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInstructions(!showInstructions)}
            >
              {showInstructions ? 'Sembunyikan' : 'Tampilkan'}
            </Button>
          </div>
        </CardHeader>
        {showInstructions && (
        <CardContent className="space-y-6">
          {/* Google Apps Script */}
          <div className="border border-primary/20 rounded-lg p-5 bg-primary/5">
            <div className="flex items-start gap-3 mb-3">
              <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">1</div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground text-base mb-1">
                  Google Apps Script ⭐ (Rekomendasi)
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  100% Gratis • Langsung ke Google Sheets • Tidak perlu platform pihak ketiga
                </p>
              </div>
            </div>
            <div className="ml-11 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  Buka Google Sheets dan buat spreadsheet baru
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  Klik menu <strong>Extensions → Apps Script</strong>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  Hapus kode yang ada, lalu <strong>copy-paste kode berikut</strong>:
                </p>
              </div>
              <div className="bg-muted/70 rounded p-3 font-mono text-xs overflow-x-auto">
                <pre>{`function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tableName = data.table;
  
  // Gunakan nama tabel sebagai nama sheet
  var sheet = ss.getSheetByName(tableName);
  
  // Jika sheet belum ada, buat sheet baru
  if (!sheet) {
    sheet = ss.insertSheet(tableName);
  }
  
  // Proses setiap record
  data.records.forEach(function(record) {
    var keys = Object.keys(record);
    
    // Cek apakah sheet kosong (belum ada header)
    if (sheet.getLastRow() === 0) {
      // Tambahkan timestamp sebagai kolom pertama
      var headers = ["timestamp"].concat(keys);
      sheet.appendRow(headers);
      
      // Format header (bold, background)
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#f3f4f6");
    }
    
    // Ambil header yang ada
    var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Tambahkan kolom baru jika ada key yang belum ada
    keys.forEach(function(key) {
      if (existingHeaders.indexOf(key) === -1) {
        var newCol = existingHeaders.length + 1;
        sheet.getRange(1, newCol).setValue(key);
        sheet.getRange(1, newCol).setFontWeight("bold");
        sheet.getRange(1, newCol).setBackground("#f3f4f6");
        existingHeaders.push(key);
      }
    });
    
    // Buat array nilai sesuai urutan header
    var values = [];
    for (var i = 0; i < existingHeaders.length; i++) {
      if (existingHeaders[i] === "timestamp") {
        values.push(new Date());
      } else {
        values.push(record[existingHeaders[i]] || "");
      }
    }
    
    // Tambahkan data baru
    sheet.appendRow(values);
  });
  
  // Auto-resize kolom
  sheet.autoResizeColumns(1, sheet.getLastColumn());
  
  return ContentService
    .createTextOutput(JSON.stringify({success: true}))
    .setMimeType(ContentService.MimeType.JSON);
}`}</pre>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-3 mt-3">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">⚠️ Jika Masih Error "Failed to fetch":</p>
                <div className="space-y-2 text-xs text-amber-800 dark:text-amber-200">
                  <p>1. Pastikan deployment setting: <strong>Who has access = Anyone</strong></p>
                  <p>2. Setelah deploy, <strong>copy URL yang baru</strong> (bukan yang lama)</p>
                  <p>3. Klik <strong>Test deployment</strong> di Apps Script untuk memastikan berjalan</p>
                  <p>4. Jika masih gagal, coba <strong>New deployment</strong> dengan version baru</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  Klik <strong>Deploy → New deployment</strong>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  Type: <strong>Web app</strong> • Execute as: <strong>Me</strong> • Who has access: <strong>Anyone</strong>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  <strong>Copy URL web app</strong> yang muncul (contoh: https://script.google.com/macros/s/xxx/exec)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  <strong>Paste URL tersebut</strong> ke kolom input pada tabel yang ingin Anda sinkronkan (lihat form di bawah ⬇️)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  Klik tombol <strong>"Simpan"</strong> lalu <strong>"Sinkron Manual"</strong> untuk test. Data akan tersusun rapi di sheet sesuai nama tabel (contoh: sheet "students", "teachers", dll) dengan kolom otomatis
                </p>
              </div>
            </div>
          </div>

          {/* Make.com */}
          <div className="border rounded-lg p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="bg-muted text-foreground rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">2</div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground text-base mb-1">
                  Make.com
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Gratis 1,000 operasi/bulan • Mudah digunakan • Visual workflow builder
                </p>
              </div>
            </div>
            <div className="ml-11 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  Buat akun gratis di <a href="https://www.make.com" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">make.com</a>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  Klik "Create a new scenario" → Pilih "Webhooks" → "Custom webhook"
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  <strong>Copy URL webhook</strong> yang muncul (contoh: https://hook.eu1.make.com/xxx)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  <strong>Paste URL tersebut</strong> ke form di bawah pada tabel yang ingin Anda sinkronkan
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  Klik tombol <strong>"Sinkron Manual"</strong> untuk test kirim data
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-primary font-semibold">►</span>
                <p className="text-sm">
                  Di Make.com, tambahkan module "Google Sheets" → "Add a row" dan mapping field data
                </p>
              </div>
            </div>
          </div>

          {/* Pipedream */}
          <div className="border rounded-lg p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="bg-muted text-foreground rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">3</div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground text-base mb-1">
                  Pipedream
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Gratis tanpa batas • Cocok untuk developer • Banyak integrasi
                </p>
              </div>
            </div>
            <div className="ml-11 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-muted-foreground">►</span>
                <p className="text-sm">
                  Daftar gratis di <a href="https://pipedream.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">pipedream.com</a>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-muted-foreground">►</span>
                <p className="text-sm">
                  Buat "New Workflow" → Pilih trigger "HTTP / Webhook"
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-muted-foreground">►</span>
                <p className="text-sm">
                  Copy URL endpoint yang diberikan dan paste ke form di bawah
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-muted-foreground">►</span>
                <p className="text-sm">
                  Test dengan "Sinkron Manual", lalu tambahkan action "Google Sheets"
                </p>
              </div>
            </div>
          </div>

          {/* n8n */}
          <div className="border rounded-lg p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="bg-muted text-foreground rounded-full w-8 h-8 flex items-center justify-center font-bold shrink-0">4</div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground text-base mb-1">
                  n8n
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Open source • Self-hosted • Kontrol penuh
                </p>
              </div>
            </div>
            <div className="ml-11 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-muted-foreground">►</span>
                <p className="text-sm">
                  Install n8n: <code className="bg-muted px-2 py-1 rounded text-xs">npx n8n</code>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-muted-foreground">►</span>
                <p className="text-sm">
                  Buat workflow baru dengan node "Webhook"
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-muted-foreground">►</span>
                <p className="text-sm">
                  Copy URL webhook dan paste ke form, lalu tambahkan node Google Sheets
                </p>
              </div>
            </div>
          </div>

          {/* Format Data Info */}
          <div className="border-t pt-5 mt-5">
            <h4 className="font-semibold text-foreground mb-3">📦 Format Data yang Dikirim</h4>
            <div className="bg-muted/50 rounded p-4 font-mono text-xs">
              <pre>{`{
  "table": "students",
  "type": "MANUAL_SYNC",
  "records": [
    { "id": "...", "name": "...", ... }
  ],
  "timestamp": "2025-01-07T12:00:00Z"
}`}</pre>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Field <code className="bg-muted px-1 rounded">records</code> berisi array data dari tabel yang dipilih
            </p>
          </div>
        </CardContent>
        )}
      </Card>

      {TABLES.map((table) => {
        const config = getWebhookConfig(table.name);
        const lastSync = getLastSync(table.name);
        
        return (
          <Card key={table.name}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>{table.label}</CardTitle>
                  <CardDescription>Tabel: {table.name}</CardDescription>
                  {lastSync && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          {formatDistanceToNow(new Date(lastSync.created_at), { 
                            addSuffix: true,
                            locale: id 
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <FileCheck className="h-3 w-3" />
                        <span>{lastSync.records_count} data</span>
                      </div>
                      <span className={lastSync.status === 'success' ? 'text-green-600' : 'text-red-600'}>
                        {lastSync.status === 'success' ? '✓ Berhasil' : '✗ Gagal'}
                      </span>
                    </div>
                  )}
                </div>
                {config && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={config.is_active}
                        onCheckedChange={(checked) => handleToggle(table.name, checked)}
                      />
                      <Label>Aktif</Label>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncMutation.mutate(table.name)}
                      disabled={syncMutation.isPending || !config.is_active}
                    >
                      {syncMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Sinkron Manual
                        </>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => deleteMutation.mutate(table.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Paste URL webhook di sini (Google Apps Script / Make / Pipedream / n8n)"
                  value={webhookUrls[table.name] || ''}
                  onChange={(e) => setWebhookUrls(prev => ({
                    ...prev,
                    [table.name]: e.target.value
                  }))}
                />
                <Button
                  onClick={() => handleSave(table.name)}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Simpan'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
