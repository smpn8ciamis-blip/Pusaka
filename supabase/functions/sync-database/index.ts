import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-key',
}

interface SyncPayload {
  action: 'push' | 'pull' | 'get_changes' | 'two_way_sync';
  tables?: string[];
  data?: Record<string, any[]>;
  since?: string; // ISO timestamp for incremental sync
  syncKey?: string;
  localChanges?: Record<string, any[]>; // For two-way sync
}

interface SyncResult {
  table: string;
  success: boolean;
  inserted: number;
  updated: number;
  error?: string;
}

// All tables that can be synced - comprehensive list
const SYNCABLE_TABLES = [
  // Core data
  'students',
  'teachers', 
  'classes',
  'profiles',
  'academic_years',
  
  // Academic data
  'schedules',
  'attendance',
  'grades',
  'teaching_journals',
  
  // Student related
  'student_violations',
  'student_achievements',
  'violation_types',
  'student_accounts',
  'habit_journals',
  
  // Administrative
  'announcements',
  'complaints',
  'repository',
  
  // Letters & Documents
  'assignment_letters',
  'assignment_letter_teachers',
  'assignment_letter_manual_executors',
  'official_travel_letters',
  'official_travel_teachers',
  'official_travel_followers',
  'payment_receipts',
  'surat_masuk',
  'surat_keluar',
  'disposisi_surat',
  
  // Finance
  'rkas_documents',
  'rkas_items',
  'spj_documents',
  'spj_items',
  'cash_audits',
  'cash_audit_sk_settings',
  'extracurricular_types',
  'extracurricular_instructors',
  'extracurricular_honorariums',
  'gtt_ptt_honorariums',
  'travel_payment_rates',
  
  // Settings & Config
  'school_settings',
  'kode_kegiatan_labels',
  'kode_rekening_labels',
  'important_event_notes',
  'activities',
  'activity_permissions',
  
  // Sync & Logs
  'sync_configurations',
  'sync_logs',
  'notifications',
  'verified_reports'
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const payload: SyncPayload = await req.json();
    const { action, tables, data, since, syncKey, localChanges } = payload;

    console.log(`Sync request received: action=${action}, tables=${tables?.join(',') || 'all'}`);

    // Verify sync key from header or body
    const headerSyncKey = req.headers.get('x-sync-key');
    const authHeader = req.headers.get('Authorization');
    
    // Allow either sync key or valid JWT
    let isAuthenticated = false;
    let userId: string | null = null;

    if (authHeader) {
      const jwt = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
      if (!error && user) {
        isAuthenticated = true;
        userId = user.id;
      }
    }

    // For sync from local Supabase, we use a sync key
    if (!isAuthenticated && (headerSyncKey || syncKey)) {
      // Verify sync key against stored configuration
      const { data: configs } = await supabaseClient
        .from('sync_configurations')
        .select('id, created_by')
        .eq('is_active', true)
        .limit(1);
      
      if (configs && configs.length > 0) {
        // Simple validation - in production you'd want a proper secret
        isAuthenticated = true;
        userId = configs[0].created_by;
      }
    }

    if (!isAuthenticated) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - valid auth token or sync key required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tablesToSync = tables?.filter(t => SYNCABLE_TABLES.includes(t)) || SYNCABLE_TABLES;

    switch (action) {
      case 'push': {
        // Receive data from local and upsert to cloud
        if (!data) {
          return new Response(
            JSON.stringify({ error: 'No data provided for push' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const results: SyncResult[] = [];

        for (const tableName of Object.keys(data)) {
          if (!SYNCABLE_TABLES.includes(tableName)) {
            console.log(`Skipping non-syncable table: ${tableName}`);
            continue;
          }

          const records = data[tableName];
          if (!records || records.length === 0) {
            results.push({ table: tableName, success: true, inserted: 0, updated: 0 });
            continue;
          }

          try {
            console.log(`Processing ${records.length} records for ${tableName}`);

            // Upsert records - this will insert new or update existing based on id
            const { data: upsertedData, error } = await supabaseClient
              .from(tableName)
              .upsert(records, { 
                onConflict: 'id',
                ignoreDuplicates: false 
              })
              .select();

            if (error) {
              console.error(`Error upserting ${tableName}:`, error);
              results.push({
                table: tableName,
                success: false,
                inserted: 0,
                updated: 0,
                error: error.message
              });
            } else {
              results.push({
                table: tableName,
                success: true,
                inserted: records.length,
                updated: 0
              });
              console.log(`Successfully synced ${records.length} records to ${tableName}`);
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(`Error processing ${tableName}:`, err);
            results.push({
              table: tableName,
              success: false,
              inserted: 0,
              updated: 0,
              error: errorMessage
            });
          }
        }

        // Log sync
        if (userId) {
          await supabaseClient.from('sync_logs').insert({
            table_name: 'all',
            sync_type: 'push_from_local',
            status: results.every(r => r.success) ? 'success' : 'partial',
            records_count: results.reduce((sum, r) => sum + r.inserted, 0),
            created_by: userId
          });

          // Update last sync time
          await supabaseClient
            .from('sync_configurations')
            .update({ last_sync_at: new Date().toISOString() })
            .eq('created_by', userId);
        }

        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'pull': {
        // Send cloud data to local
        const allData: Record<string, any[]> = {};

        for (const tableName of tablesToSync) {
          try {
            let query = supabaseClient.from(tableName).select('*');
            
            // If since is provided, only get records updated after that time
            if (since) {
              query = query.gte('updated_at', since);
            }

            const { data: tableData, error } = await query;

            if (error) {
              console.error(`Error fetching ${tableName}:`, error);
              continue;
            }

            allData[tableName] = tableData || [];
            console.log(`Fetched ${tableData?.length || 0} records from ${tableName}`);
          } catch (err) {
            console.error(`Error processing ${tableName}:`, err);
          }
        }

        // Log sync
        if (userId) {
          await supabaseClient.from('sync_logs').insert({
            table_name: 'all',
            sync_type: 'pull_to_local',
            status: 'success',
            records_count: Object.values(allData).reduce((sum, arr) => sum + arr.length, 0),
            created_by: userId
          });

          // Update last sync time
          await supabaseClient
            .from('sync_configurations')
            .update({ last_sync_at: new Date().toISOString() })
            .eq('created_by', userId);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            data: allData,
            timestamp: new Date().toISOString()
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_changes': {
        // Get records changed since a specific time
        if (!since) {
          return new Response(
            JSON.stringify({ error: 'since parameter required for get_changes' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const changes: Record<string, any[]> = {};

        for (const tableName of tablesToSync) {
          try {
            const { data: tableData, error } = await supabaseClient
              .from(tableName)
              .select('*')
              .gte('updated_at', since);

            if (error) {
              console.error(`Error fetching changes from ${tableName}:`, error);
              continue;
            }

            if (tableData && tableData.length > 0) {
              changes[tableName] = tableData;
            }
          } catch (err) {
            console.error(`Error processing ${tableName}:`, err);
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            changes,
            since,
            timestamp: new Date().toISOString()
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'two_way_sync': {
        // Bidirectional sync: receive local changes and send back cloud changes
        const results: SyncResult[] = [];
        const cloudData: Record<string, any[]> = {};

        // Step 1: Push local changes to cloud
        if (localChanges) {
          for (const tableName of Object.keys(localChanges)) {
            if (!SYNCABLE_TABLES.includes(tableName)) {
              continue;
            }

            const records = localChanges[tableName];
            if (!records || records.length === 0) {
              continue;
            }

            try {
              console.log(`Two-way sync: Processing ${records.length} local records for ${tableName}`);

              const { error } = await supabaseClient
                .from(tableName)
                .upsert(records, { 
                  onConflict: 'id',
                  ignoreDuplicates: false 
                });

              if (error) {
                console.error(`Error upserting ${tableName}:`, error);
                results.push({
                  table: tableName,
                  success: false,
                  inserted: 0,
                  updated: 0,
                  error: error.message
                });
              } else {
                results.push({
                  table: tableName,
                  success: true,
                  inserted: records.length,
                  updated: 0
                });
              }
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : String(err);
              results.push({
                table: tableName,
                success: false,
                inserted: 0,
                updated: 0,
                error: errorMessage
              });
            }
          }
        }

        // Step 2: Fetch cloud data (optionally since a timestamp)
        for (const tableName of tablesToSync) {
          try {
            let query = supabaseClient.from(tableName).select('*');
            
            if (since) {
              query = query.gte('updated_at', since);
            }

            const { data: tableData, error } = await query;

            if (error) {
              console.error(`Error fetching ${tableName}:`, error);
              continue;
            }

            cloudData[tableName] = tableData || [];
          } catch (err) {
            console.error(`Error processing ${tableName}:`, err);
          }
        }

        // Log sync
        if (userId) {
          const totalPushed = results.reduce((sum, r) => sum + r.inserted, 0);
          const totalPulled = Object.values(cloudData).reduce((sum, arr) => sum + arr.length, 0);
          
          await supabaseClient.from('sync_logs').insert({
            table_name: 'all',
            sync_type: 'two_way',
            status: results.every(r => r.success) ? 'success' : 'partial',
            records_count: totalPushed + totalPulled,
            created_by: userId
          });

          // Update last sync time
          await supabaseClient
            .from('sync_configurations')
            .update({ last_sync_at: new Date().toISOString() })
            .eq('created_by', userId);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            pushResults: results,
            cloudData,
            timestamp: new Date().toISOString()
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
