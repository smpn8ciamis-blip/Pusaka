import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-id',
}

interface SyncResult {
  table: string;
  success: boolean;
  count: number;
  error?: string;
}

// Helper function to verify admin authentication
async function verifyAdminAuth(req: Request, supabaseClient: any): Promise<{ user: any; error: string | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { user: null, error: 'No authorization header provided' };
  }

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
  
  if (error || !user) {
    return { user: null, error: 'Invalid or expired token' };
  }

  // Check if user has admin role
  const { data: roleData, error: roleError } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleError || roleData?.role !== 'admin') {
    return { user: null, error: 'Admin access required' };
  }

  return { user, error: null };
}

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
    )

    // Verify admin authentication
    const { user, error: authError } = await verifyAdminAuth(req, supabaseClient);
    if (authError) {
      console.log('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: authError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting sync-all-data process, initiated by:', user.email);
    
    const results: SyncResult[] = [];
    const userId = user.id;
    const syncType = 'manual';
    
    console.log(`Sync triggered by: ${user.email}, type: ${syncType}`);

    // Get active webhooks
    const { data: webhooks, error: webhookError } = await supabaseClient
      .from('zapier_webhooks')
      .select('*')
      .eq('is_active', true);

    if (webhookError) {
      throw new Error(`Failed to fetch webhooks: ${webhookError.message}`);
    }

    console.log(`Found ${webhooks?.length || 0} active webhooks`);

    // Tables to sync
    const tablesToSync = ['students', 'teachers', 'classes', 'schedules', 'grades', 'attendance'];

    for (const tableName of tablesToSync) {
      try {
        console.log(`Syncing ${tableName}...`);
        
        // Fetch all data from table
        const { data, error } = await supabaseClient
          .from(tableName)
          .select('*');

        if (error) {
          console.error(`Error fetching ${tableName}:`, error);
          results.push({
            table: tableName,
            success: false,
            count: 0,
            error: error.message
          });
          
          // Log failed sync
          await supabaseClient.from('sync_logs').insert({
            table_name: tableName,
            sync_type: syncType,
            status: 'failed',
            records_count: 0,
            error_message: error.message,
            created_by: userId
          });
          
          continue;
        }

        const recordCount = data?.length || 0;
        console.log(`Found ${recordCount} records in ${tableName}`);

        // Send to all relevant webhooks
        const webhook = webhooks?.find(w => w.table_name === tableName);
        
        if (webhook && recordCount > 0) {
          try {
            console.log(`Sending ${recordCount} records to webhook for ${tableName}`);
            
            // Extract column headers from first record
            const headers = data && data.length > 0 ? Object.keys(data[0]) : [];
            
            // Convert data to rows format for easier sheet processing
            const rows = data.map(record => 
              headers.map(header => {
                const value = record[header];
                // Format dates and timestamps to readable strings
                if (value instanceof Date || (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))) {
                  return new Date(value).toLocaleString('id-ID');
                }
                // Convert null to empty string
                if (value === null || value === undefined) {
                  return '';
                }
                // Convert objects to JSON string
                if (typeof value === 'object') {
                  return JSON.stringify(value);
                }
                return value;
              })
            );
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            // Send structured data with table name, headers, and rows
            const payload = {
              table: tableName,
              headers: headers,
              rows: rows,
              timestamp: new Date().toISOString(),
              sync_type: syncType,
              record_count: recordCount
            };
            
            console.log(`Payload structure for ${tableName}:`, {
              table: tableName,
              headers_count: headers.length,
              rows_count: rows.length
            });
            
            const response = await fetch(webhook.webhook_url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            // Log response for debugging
            const responseText = await response.text();
            console.log(`Webhook response for ${tableName}:`, response.status, responseText);

            if (!response.ok) {
              throw new Error(`Webhook responded with status ${response.status}: ${responseText}`);
            }

            console.log(`Successfully synced ${recordCount} records from ${tableName}`);
            results.push({
              table: tableName,
              success: true,
              count: recordCount
            });

            // Log successful sync
            await supabaseClient.from('sync_logs').insert({
              table_name: tableName,
              sync_type: syncType,
              status: 'success',
              records_count: recordCount,
              created_by: userId
            });
          } catch (webhookError) {
            const errorMessage = webhookError instanceof Error ? webhookError.message : String(webhookError);
            console.error(`Webhook error for ${tableName}:`, webhookError);
            results.push({
              table: tableName,
              success: false,
              count: recordCount,
              error: errorMessage
            });

            // Log webhook failure
            await supabaseClient.from('sync_logs').insert({
              table_name: tableName,
              sync_type: syncType,
              status: 'failed',
              records_count: recordCount,
              error_message: `Webhook error: ${errorMessage}`,
              created_by: userId
            });
          }
        } else {
          console.log(`No webhook configured for ${tableName} or no records to sync`);
          results.push({
            table: tableName,
            success: true,
            count: recordCount
          });

          // Log as success even without webhook (no error)
          await supabaseClient.from('sync_logs').insert({
            table_name: tableName,
            sync_type: syncType,
            status: 'success',
            records_count: recordCount,
            error_message: webhook ? null : 'No webhook configured',
            created_by: userId
          });
        }
      } catch (tableError) {
        const errorMessage = tableError instanceof Error ? tableError.message : String(tableError);
        console.error(`Error processing ${tableName}:`, tableError);
        results.push({
          table: tableName,
          success: false,
          count: 0,
          error: errorMessage
        });

        // Log error
        await supabaseClient.from('sync_logs').insert({
          table_name: tableName,
          sync_type: syncType,
          status: 'failed',
          records_count: 0,
          error_message: errorMessage,
          created_by: userId
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalRecords = results.reduce((sum, r) => sum + r.count, 0);

    console.log(`Sync completed: ${successCount}/${results.length} tables synced, ${totalRecords} total records`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${successCount}/${results.length} tables successfully`,
        totalRecords,
        results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Fatal error in sync-all-data:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
