import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  RefreshCw, 
  CloudUpload, 
  CloudDownload, 
  Settings, 
  AlertCircle, 
  CheckCircle,
  Clock,
  Database,
  Wifi,
  Copy,
  ExternalLink,
  ArrowUpDown,
  Download,
  FileCode
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

interface SyncConfig {
  id: string;
  name: string;
  local_supabase_url: string | null;
  sync_direction: string;
  last_sync_at: string | null;
  is_active: boolean;
  sync_interval_minutes: number;
  tables_to_sync: string[];
  created_at: string;
}

interface SyncLog {
  id: string;
  table_name: string;
  sync_type: string;
  status: string;
  records_count: number;
  error_message: string | null;
  created_at: string;
}

// Comprehensive list of all syncable tables
const AVAILABLE_TABLES = [
  // Core data
  { name: 'students', label: 'Siswa', category: 'core' },
  { name: 'teachers', label: 'Guru', category: 'core' },
  { name: 'classes', label: 'Kelas', category: 'core' },
  { name: 'profiles', label: 'Profil User', category: 'core' },
  { name: 'academic_years', label: 'Tahun Ajaran', category: 'core' },
  
  // Academic
  { name: 'schedules', label: 'Jadwal', category: 'academic' },
  { name: 'attendance', label: 'Kehadiran', category: 'academic' },
  { name: 'grades', label: 'Nilai', category: 'academic' },
  { name: 'teaching_journals', label: 'Jurnal Mengajar', category: 'academic' },
  
  // Student related
  { name: 'student_violations', label: 'Pelanggaran Siswa', category: 'student' },
  { name: 'student_achievements', label: 'Prestasi Siswa', category: 'student' },
  { name: 'violation_types', label: 'Jenis Pelanggaran', category: 'student' },
  { name: 'student_accounts', label: 'Akun Siswa', category: 'student' },
  { name: 'habit_journals', label: 'Jurnal Kebiasaan', category: 'student' },
  
  // Administrative
  { name: 'announcements', label: 'Pengumuman', category: 'admin' },
  { name: 'complaints', label: 'Pengaduan', category: 'admin' },
  { name: 'repository', label: 'Repository', category: 'admin' },
  
  // Letters & Documents
  { name: 'assignment_letters', label: 'Surat Tugas', category: 'letters' },
  { name: 'assignment_letter_teachers', label: 'Guru Surat Tugas', category: 'letters' },
  { name: 'official_travel_letters', label: 'Surat Perjalanan Dinas', category: 'letters' },
  { name: 'official_travel_teachers', label: 'Guru Perjalanan Dinas', category: 'letters' },
  { name: 'payment_receipts', label: 'Kwitansi', category: 'letters' },
  { name: 'surat_masuk', label: 'Surat Masuk', category: 'letters' },
  { name: 'surat_keluar', label: 'Surat Keluar', category: 'letters' },
  { name: 'disposisi_surat', label: 'Disposisi Surat', category: 'letters' },
  
  // Finance
  { name: 'rkas_documents', label: 'Dokumen RKAS', category: 'finance' },
  { name: 'rkas_items', label: 'Item RKAS', category: 'finance' },
  { name: 'spj_documents', label: 'Dokumen SPJ', category: 'finance' },
  { name: 'spj_items', label: 'Item SPJ', category: 'finance' },
  { name: 'cash_audits', label: 'Pemeriksaan Kas', category: 'finance' },
  { name: 'extracurricular_types', label: 'Jenis Ekskul', category: 'finance' },
  { name: 'extracurricular_instructors', label: 'Instruktur Ekskul', category: 'finance' },
  { name: 'extracurricular_honorariums', label: 'Honor Ekskul', category: 'finance' },
  { name: 'gtt_ptt_honorariums', label: 'Honor GTT/PTT', category: 'finance' },
  
  // Settings
  { name: 'school_settings', label: 'Pengaturan Sekolah', category: 'settings' },
  { name: 'kode_kegiatan_labels', label: 'Label Kode Kegiatan', category: 'settings' },
  { name: 'kode_rekening_labels', label: 'Label Kode Rekening', category: 'settings' },
  { name: 'activities', label: 'Kegiatan', category: 'settings' },
  { name: 'activity_permissions', label: 'Izin Kegiatan', category: 'settings' },
];

const CATEGORY_LABELS: Record<string, string> = {
  core: 'Data Inti',
  academic: 'Akademik',
  student: 'Kesiswaan',
  admin: 'Administrasi',
  letters: 'Surat & Dokumen',
  finance: 'Keuangan',
  settings: 'Pengaturan'
};

export const DatabaseSync = () => {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [localUrl, setLocalUrl] = useState('http://127.0.0.1:54321');
  const [selectedTables, setSelectedTables] = useState<string[]>(AVAILABLE_TABLES.map(t => t.name));

  // Get cloud Supabase URL for display
  const cloudUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || '';
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

  // Fetch sync configuration
  const { data: syncConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['sync-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_configurations')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as SyncConfig | null;
    }
  });

  // Fetch sync logs
  const { data: syncLogs } = useQuery({
    queryKey: ['sync-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as SyncLog[];
    }
  });

  // Save sync configuration
  const saveConfigMutation = useMutation({
    mutationFn: async (config: Partial<SyncConfig>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (syncConfig?.id) {
        const { error } = await supabase
          .from('sync_configurations')
          .update({
            local_supabase_url: config.local_supabase_url,
            tables_to_sync: config.tables_to_sync,
            sync_direction: config.sync_direction,
            is_active: config.is_active
          })
          .eq('id', syncConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sync_configurations')
          .insert({
            local_supabase_url: config.local_supabase_url,
            tables_to_sync: config.tables_to_sync,
            sync_direction: config.sync_direction || 'two_way',
            is_active: true,
            created_by: user.id
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-config'] });
      toast.success('Konfigurasi sync berhasil disimpan');
    },
    onError: (error) => {
      console.error('Save config error:', error);
      toast.error('Gagal menyimpan konfigurasi');
    }
  });

  // Initialize from config
  useEffect(() => {
    if (syncConfig) {
      setLocalUrl(syncConfig.local_supabase_url || 'http://127.0.0.1:54321');
      setSelectedTables(syncConfig.tables_to_sync || AVAILABLE_TABLES.map(t => t.name));
    }
  }, [syncConfig]);

  // Pull data from cloud
  const handlePullFromCloud = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-database', {
        body: {
          action: 'pull',
          tables: selectedTables
        }
      });

      if (error) throw error;

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cloud-data-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      const totalRecords = Object.values(data.data || {}).flat().length;
      toast.success(`Data dari cloud berhasil didownload (${totalRecords} records)`);
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
    } catch (error) {
      console.error('Pull error:', error);
      toast.error('Gagal mengambil data dari cloud');
    } finally {
      setIsSyncing(false);
    }
  };

  // Copy sync endpoint
  const handleCopyEndpoint = () => {
    const endpoint = `${cloudUrl}/functions/v1/sync-database`;
    navigator.clipboard.writeText(endpoint);
    toast.success('Endpoint berhasil disalin');
  };

  // Generate script for pushing LOCAL -> CLOUD
  const generatePushToCloudScript = () => {
    const script = `// =====================================================
// Script untuk PUSH data dari Supabase LOKAL ke CLOUD
// Jalankan di komputer lokal: node push-to-cloud.js
// =====================================================

const { createClient } = require('@supabase/supabase-js');

// ========== KONFIGURASI - SESUAIKAN! ==========
const LOCAL_SUPABASE_URL = '${localUrl}';
const LOCAL_SUPABASE_ANON_KEY = 'YOUR_LOCAL_ANON_KEY'; // Ganti dengan anon key lokal

const CLOUD_SYNC_ENDPOINT = '${cloudUrl}/functions/v1/sync-database';
const CLOUD_ANON_KEY = '${anonKey}';

const TABLES_TO_SYNC = ${JSON.stringify(selectedTables, null, 2)};
// ==============================================

const localSupabase = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON_KEY);

async function pushToCloud() {
  console.log('🚀 Memulai PUSH data dari Lokal ke Cloud...');
  console.log('📋 Tabel yang akan di-sync:', TABLES_TO_SYNC.join(', '));
  
  const allData = {};
  let totalRecords = 0;
  
  for (const table of TABLES_TO_SYNC) {
    try {
      const { data, error } = await localSupabase.from(table).select('*');
      if (error) {
        console.error(\`❌ Error fetching \${table}:\`, error.message);
        continue;
      }
      allData[table] = data || [];
      totalRecords += (data?.length || 0);
      console.log(\`✅ Fetched \${data?.length || 0} records from \${table}\`);
    } catch (err) {
      console.error(\`❌ Error processing \${table}:\`, err.message);
    }
  }

  console.log(\`\\n📤 Pushing \${totalRecords} total records to cloud...\`);

  const response = await fetch(CLOUD_SYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${CLOUD_ANON_KEY}\`,
      'apikey': CLOUD_ANON_KEY
    },
    body: JSON.stringify({
      action: 'push',
      data: allData
    })
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('\\n✅ PUSH BERHASIL!');
    console.log('📊 Hasil:');
    result.results?.forEach(r => {
      const status = r.success ? '✅' : '❌';
      console.log(\`   \${status} \${r.table}: \${r.inserted} records\`);
    });
  } else {
    console.error('❌ PUSH GAGAL:', result.error);
  }
}

pushToCloud().catch(console.error);
`;

    downloadScript(script, 'push-to-cloud.js');
    toast.success('Script Push ke Cloud berhasil didownload');
  };

  // Generate script for pulling CLOUD -> LOCAL
  const generatePullFromCloudScript = () => {
    const script = `// =====================================================
// Script untuk PULL data dari CLOUD ke Supabase LOKAL
// Jalankan di komputer lokal: node pull-from-cloud.js
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// ========== KONFIGURASI - SESUAIKAN! ==========
const LOCAL_SUPABASE_URL = '${localUrl}';
const LOCAL_SUPABASE_SERVICE_KEY = 'YOUR_LOCAL_SERVICE_ROLE_KEY'; // Ganti dengan service role key lokal

const CLOUD_SYNC_ENDPOINT = '${cloudUrl}/functions/v1/sync-database';
const CLOUD_ANON_KEY = '${anonKey}';

const TABLES_TO_SYNC = ${JSON.stringify(selectedTables, null, 2)};
// ==============================================

const localSupabase = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_KEY);

async function pullFromCloud() {
  console.log('🚀 Memulai PULL data dari Cloud ke Lokal...');
  console.log('📋 Tabel yang akan di-sync:', TABLES_TO_SYNC.join(', '));

  // Step 1: Fetch data from cloud
  console.log('\\n📥 Mengambil data dari cloud...');
  
  const response = await fetch(CLOUD_SYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${CLOUD_ANON_KEY}\`,
      'apikey': CLOUD_ANON_KEY
    },
    body: JSON.stringify({
      action: 'pull',
      tables: TABLES_TO_SYNC
    })
  });

  const result = await response.json();
  
  if (!result.success) {
    console.error('❌ Gagal mengambil data dari cloud:', result.error);
    return;
  }

  const cloudData = result.data;
  let totalRecords = 0;
  
  console.log('\\n📊 Data dari cloud:');
  for (const [table, records] of Object.entries(cloudData)) {
    console.log(\`   📁 \${table}: \${records.length} records\`);
    totalRecords += records.length;
  }

  // Step 2: Upsert to local database
  console.log(\`\\n📤 Menyimpan \${totalRecords} records ke database lokal...\`);
  
  for (const [table, records] of Object.entries(cloudData)) {
    if (!records || records.length === 0) continue;
    
    try {
      const { error } = await localSupabase
        .from(table)
        .upsert(records, { onConflict: 'id', ignoreDuplicates: false });
      
      if (error) {
        console.error(\`❌ Error upserting \${table}:\`, error.message);
      } else {
        console.log(\`✅ Synced \${records.length} records to \${table}\`);
      }
    } catch (err) {
      console.error(\`❌ Error processing \${table}:\`, err.message);
    }
  }

  console.log('\\n✅ PULL SELESAI!');
}

pullFromCloud().catch(console.error);
`;

    downloadScript(script, 'pull-from-cloud.js');
    toast.success('Script Pull dari Cloud berhasil didownload');
  };

  // Generate script for TWO-WAY sync
  const generateTwoWaySyncScript = () => {
    const script = `// =====================================================
// Script untuk SINKRONISASI DUA ARAH (Two-Way Sync)
// Lokal <-> Cloud
// Jalankan di komputer lokal: node two-way-sync.js
// =====================================================

const { createClient } = require('@supabase/supabase-js');

// ========== KONFIGURASI - SESUAIKAN! ==========
const LOCAL_SUPABASE_URL = '${localUrl}';
const LOCAL_SUPABASE_SERVICE_KEY = 'YOUR_LOCAL_SERVICE_ROLE_KEY'; // Ganti dengan service role key lokal

const CLOUD_SYNC_ENDPOINT = '${cloudUrl}/functions/v1/sync-database';
const CLOUD_ANON_KEY = '${anonKey}';

const TABLES_TO_SYNC = ${JSON.stringify(selectedTables, null, 2)};

// Timestamp terakhir sync (opsional, set null untuk full sync)
const LAST_SYNC_TIMESTAMP = null; // atau '2024-01-01T00:00:00Z'
// ==============================================

const localSupabase = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_KEY);

async function twoWaySync() {
  console.log('🔄 Memulai SINKRONISASI DUA ARAH...');
  console.log('📋 Tabel yang akan di-sync:', TABLES_TO_SYNC.join(', '));
  
  // Step 1: Fetch local data
  console.log('\\n📤 Mengambil data dari database lokal...');
  const localData = {};
  
  for (const table of TABLES_TO_SYNC) {
    try {
      let query = localSupabase.from(table).select('*');
      if (LAST_SYNC_TIMESTAMP) {
        query = query.gte('updated_at', LAST_SYNC_TIMESTAMP);
      }
      
      const { data, error } = await query;
      if (error) {
        console.error(\`❌ Error fetching local \${table}:\`, error.message);
        continue;
      }
      localData[table] = data || [];
      console.log(\`   📁 \${table}: \${data?.length || 0} records\`);
    } catch (err) {
      console.error(\`❌ Error processing \${table}:\`, err.message);
    }
  }

  // Step 2: Send to cloud and receive cloud data
  console.log('\\n🔄 Melakukan sinkronisasi dengan cloud...');
  
  const response = await fetch(CLOUD_SYNC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${CLOUD_ANON_KEY}\`,
      'apikey': CLOUD_ANON_KEY
    },
    body: JSON.stringify({
      action: 'two_way_sync',
      tables: TABLES_TO_SYNC,
      localChanges: localData,
      since: LAST_SYNC_TIMESTAMP
    })
  });

  const result = await response.json();
  
  if (!result.success) {
    console.error('❌ Sync gagal:', result.error);
    return;
  }

  // Step 3: Show push results
  console.log('\\n📤 Hasil PUSH ke Cloud:');
  result.pushResults?.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(\`   \${status} \${r.table}: \${r.inserted} records\`);
  });

  // Step 4: Upsert cloud data to local
  const cloudData = result.cloudData;
  console.log('\\n📥 Data dari Cloud:');
  
  for (const [table, records] of Object.entries(cloudData)) {
    console.log(\`   📁 \${table}: \${records.length} records\`);
  }

  console.log('\\n📥 Menyimpan data cloud ke database lokal...');
  
  for (const [table, records] of Object.entries(cloudData)) {
    if (!records || records.length === 0) continue;
    
    try {
      const { error } = await localSupabase
        .from(table)
        .upsert(records, { onConflict: 'id', ignoreDuplicates: false });
      
      if (error) {
        console.error(\`❌ Error upserting \${table}:\`, error.message);
      } else {
        console.log(\`✅ Synced \${records.length} records to local \${table}\`);
      }
    } catch (err) {
      console.error(\`❌ Error processing \${table}:\`, err.message);
    }
  }

  console.log('\\n✅ SINKRONISASI DUA ARAH SELESAI!');
  console.log(\`⏱️ Timestamp: \${result.timestamp}\`);
  console.log('💡 Simpan timestamp ini untuk incremental sync berikutnya.');
}

twoWaySync().catch(console.error);
`;

    downloadScript(script, 'two-way-sync.js');
    toast.success('Script Two-Way Sync berhasil didownload');
  };

  const downloadScript = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/javascript' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleSaveConfig = () => {
    saveConfigMutation.mutate({
      local_supabase_url: localUrl,
      tables_to_sync: selectedTables,
      sync_direction: 'two_way',
      is_active: true
    });
  };

  const toggleTable = (tableName: string) => {
    setSelectedTables(prev => 
      prev.includes(tableName)
        ? prev.filter(t => t !== tableName)
        : [...prev, tableName]
    );
  };

  const toggleCategory = (category: string) => {
    const categoryTables = AVAILABLE_TABLES.filter(t => t.category === category).map(t => t.name);
    const allSelected = categoryTables.every(t => selectedTables.includes(t));
    
    if (allSelected) {
      setSelectedTables(prev => prev.filter(t => !categoryTables.includes(t)));
    } else {
      setSelectedTables(prev => [...new Set([...prev, ...categoryTables])]);
    }
  };

  const selectAllTables = () => {
    setSelectedTables(AVAILABLE_TABLES.map(t => t.name));
  };

  const deselectAllTables = () => {
    setSelectedTables([]);
  };

  const getSyncTypeLabel = (syncType: string) => {
    switch (syncType) {
      case 'push_from_local': return 'Push ke Cloud';
      case 'pull_to_local': return 'Pull dari Cloud';
      case 'two_way': return 'Two-Way Sync';
      default: return syncType;
    }
  };

  const getSyncTypeBadge = (syncType: string) => {
    switch (syncType) {
      case 'push_from_local': return <Badge variant="default"><CloudUpload className="h-3 w-3 mr-1" /> Push</Badge>;
      case 'pull_to_local': return <Badge variant="secondary"><CloudDownload className="h-3 w-3 mr-1" /> Pull</Badge>;
      case 'two_way': return <Badge variant="outline"><ArrowUpDown className="h-3 w-3 mr-1" /> Two-Way</Badge>;
      default: return <Badge>{syncType}</Badge>;
    }
  };

  // Group tables by category
  const tablesByCategory = AVAILABLE_TABLES.reduce((acc, table) => {
    if (!acc[table.category]) {
      acc[table.category] = [];
    }
    acc[table.category].push(table);
    return acc;
  }, {} as Record<string, typeof AVAILABLE_TABLES>);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="sync" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sync">Sinkronisasi</TabsTrigger>
          <TabsTrigger value="config">Konfigurasi</TabsTrigger>
          <TabsTrigger value="logs">Riwayat</TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpDown className="h-5 w-5" />
                Sinkronisasi Database Dua Arah
              </CardTitle>
              <CardDescription>
                Sinkronisasi data antara Supabase lokal dan cloud secara bidirectional
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Cara Kerja Sync Dua Arah:</strong> 
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li><strong>Push ke Cloud:</strong> Data lokal dikirim ke cloud</li>
                    <li><strong>Pull dari Cloud:</strong> Data cloud diambil ke lokal</li>
                    <li><strong>Two-Way:</strong> Push + Pull dalam satu proses</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Cloud Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-green-500" />
                      Cloud Database
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      Project ID: <code className="bg-muted px-1 rounded text-xs">{projectId}</code>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleCopyEndpoint}
                      className="w-full"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Salin Sync Endpoint
                    </Button>
                  </CardContent>
                </Card>

                {/* Local Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Database className="h-4 w-4 text-blue-500" />
                      Database Lokal
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      URL: <code className="bg-muted px-1 rounded text-xs">{localUrl}</code>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Tabel dipilih: <Badge variant="outline">{selectedTables.length}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Download Scripts */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileCode className="h-4 w-4" />
                    Download Script Sync
                  </CardTitle>
                  <CardDescription>
                    Pilih script sesuai kebutuhan sync Anda
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 md:grid-cols-3">
                    <Button 
                      variant="outline" 
                      onClick={generatePushToCloudScript}
                      className="w-full"
                    >
                      <CloudUpload className="h-4 w-4 mr-2" />
                      Push ke Cloud
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={generatePullFromCloudScript}
                      className="w-full"
                    >
                      <CloudDownload className="h-4 w-4 mr-2" />
                      Pull dari Cloud
                    </Button>
                    <Button 
                      variant="default" 
                      onClick={generateTwoWaySyncScript}
                      className="w-full"
                    >
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      Two-Way Sync
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Pull from Cloud */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Quick Download
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={handlePullFromCloud}
                    disabled={isSyncing}
                    variant="secondary"
                    className="w-full"
                  >
                    <CloudDownload className="h-4 w-4 mr-2" />
                    {isSyncing ? 'Mengambil...' : 'Download Data Cloud (JSON)'}
                  </Button>
                </CardContent>
              </Card>

              {syncConfig?.last_sync_at && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Terakhir sync: {format(new Date(syncConfig.last_sync_at), 'dd MMMM yyyy HH:mm', { locale: localeId })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Panduan */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Panduan Penggunaan Script
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Pastikan Supabase lokal berjalan: <code className="bg-muted px-1 rounded">supabase start</code></li>
                <li>Download script yang diinginkan</li>
                <li>Edit file, ganti <code className="bg-muted px-1 rounded">YOUR_LOCAL_*_KEY</code> dengan key lokal</li>
                <li>Install dependencies: <code className="bg-muted px-1 rounded">npm install @supabase/supabase-js</code></li>
                <li>Jalankan script: <code className="bg-muted px-1 rounded">node [nama-script].js</code></li>
              </ol>
              <Alert className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Tips:</strong> Untuk two-way sync, simpan timestamp dari hasil sync untuk incremental sync berikutnya.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Konfigurasi Sync
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>URL Supabase Lokal</Label>
                <Input
                  placeholder="http://127.0.0.1:54321"
                  value={localUrl}
                  onChange={(e) => setLocalUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Tabel yang Disinkronkan ({selectedTables.length}/{AVAILABLE_TABLES.length})</Label>
                  <div className="space-x-2">
                    <Button variant="outline" size="sm" onClick={selectAllTables}>
                      Pilih Semua
                    </Button>
                    <Button variant="outline" size="sm" onClick={deselectAllTables}>
                      Hapus Semua
                    </Button>
                  </div>
                </div>
                
                <ScrollArea className="h-[400px] border rounded-lg p-4">
                  <div className="space-y-4">
                    {Object.entries(tablesByCategory).map(([category, tables]) => {
                      const allSelected = tables.every(t => selectedTables.includes(t.name));
                      const someSelected = tables.some(t => selectedTables.includes(t.name));
                      
                      return (
                        <div key={category} className="space-y-2">
                          <div 
                            className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                            onClick={() => toggleCategory(category)}
                          >
                            <Switch 
                              checked={allSelected}
                              onCheckedChange={() => toggleCategory(category)}
                            />
                            <span className="font-medium">{CATEGORY_LABELS[category]}</span>
                            <Badge variant="outline" className="ml-auto">
                              {tables.filter(t => selectedTables.includes(t.name)).length}/{tables.length}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 ml-6">
                            {tables.map((table) => (
                              <div 
                                key={table.name}
                                className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors text-sm ${
                                  selectedTables.includes(table.name) 
                                    ? 'bg-primary/10 border-primary' 
                                    : 'hover:bg-muted'
                                }`}
                                onClick={() => toggleTable(table.name)}
                              >
                                <Switch 
                                  checked={selectedTables.includes(table.name)}
                                  onCheckedChange={() => toggleTable(table.name)}
                                />
                                <span>{table.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              <Button 
                onClick={handleSaveConfig}
                disabled={saveConfigMutation.isPending}
              >
                {saveConfigMutation.isPending ? 'Menyimpan...' : 'Simpan Konfigurasi'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Riwayat Sinkronisasi
              </CardTitle>
            </CardHeader>
            <CardContent>
              {syncLogs && syncLogs.length > 0 ? (
                <div className="space-y-2">
                  {syncLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {log.status === 'success' ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-yellow-500" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            {getSyncTypeBadge(log.sync_type)}
                            <span className="text-sm font-medium">{log.table_name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(log.created_at), 'dd MMM yyyy HH:mm', { locale: localeId })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={log.status === 'success' ? 'default' : 'secondary'}>
                          {log.records_count} records
                        </Badge>
                        {log.error_message && (
                          <div className="text-xs text-destructive mt-1">{log.error_message}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Belum ada riwayat sinkronisasi
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
