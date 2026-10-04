import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify admin authentication first (before parsing body)
    const { user, error: authError } = await verifyAdminAuth(req, supabaseClient);
    if (authError) {
      console.log('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: authError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Database import initiated by admin:', user.email);

    const contentType = req.headers.get('content-type') || '';
    let backup: any;

    // Handle both JSON and SQL formats
    if (contentType.includes('application/sql') || contentType.includes('text/plain')) {
      // Parse SQL file
      const sqlContent = await req.text();
      backup = parseSqlBackup(sqlContent);
    } else {
      // Parse JSON file
      backup = await req.json();
    }

    if (!backup.tables) {
      throw new Error('Invalid backup file format');
    }

    const results: Record<string, any> = {};

    // Import each table
    for (const [tableName, records] of Object.entries(backup.tables)) {
      if (!Array.isArray(records) || records.length === 0) {
        results[tableName] = { skipped: true, count: 0 };
        continue;
      }

      try {
        // Filter out generated columns (like final_grade)
        const cleanedRecords = records.map((record: any) => {
          const cleaned = { ...record };
          // Remove final_grade if present (it's a generated column)
          if (tableName === 'grades' && 'final_grade' in cleaned) {
            delete cleaned.final_grade;
          }
          return cleaned;
        });

        // Use upsert to handle existing records
        const { data, error } = await supabaseClient
          .from(tableName)
          .upsert(cleanedRecords as any[], { onConflict: 'id' });

        if (error) {
          console.error(`Error importing ${tableName}:`, error);
          results[tableName] = { 
            success: false, 
            error: error.message,
            count: 0 
          };
        } else {
          results[tableName] = { 
            success: true, 
            count: records.length 
          };
        }
      } catch (err) {
        console.error(`Exception importing ${tableName}:`, err);
        results[tableName] = { 
          success: false, 
          error: (err as Error).message,
          count: 0 
        };
      }
    }

    // Helper function to parse SQL INSERT statements
    function parseSqlBackup(sql: string): { tables: Record<string, any[]> } {
      const tables: Record<string, any[]> = {};
      
      // Match INSERT statements
      const insertRegex = /INSERT INTO\s+"?(\w+)"?\s*\((.*?)\)\s*VALUES\s*\((.*?)\);/gs;
      let match;

      while ((match = insertRegex.exec(sql)) !== null) {
        const tableName = match[1];
        const columns = match[2].split(',').map(c => c.trim().replace(/"/g, ''));
        const values = match[3];

        // Parse values - handle strings with quotes
        const parsedValues: any[] = [];
        let currentValue = '';
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < values.length; i++) {
          const char = values[i];

          if (escapeNext) {
            currentValue += char;
            escapeNext = false;
            continue;
          }

          if (char === '\\') {
            escapeNext = true;
            continue;
          }

          if (char === "'" && !escapeNext) {
            inString = !inString;
            if (!inString && currentValue !== '') {
              parsedValues.push(currentValue);
              currentValue = '';
            }
            continue;
          }

          if (char === ',' && !inString) {
            if (currentValue.trim() !== '') {
              parsedValues.push(parseValue(currentValue.trim()));
              currentValue = '';
            }
            continue;
          }

          currentValue += char;
        }

        // Handle last value
        if (currentValue.trim() !== '') {
          parsedValues.push(parseValue(currentValue.trim()));
        }

        // Create record object
        const record: any = {};
        columns.forEach((col, idx) => {
          if (idx < parsedValues.length) {
            record[col] = parsedValues[idx];
          }
        });

        if (!tables[tableName]) {
          tables[tableName] = [];
        }
        tables[tableName].push(record);
      }

      return { tables };
    }

    function parseValue(val: string): any {
      if (val === 'NULL') return null;
      if (val === 'true') return true;
      if (val === 'false') return false;
      if (/^-?\d+$/.test(val)) return parseInt(val, 10);
      if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
      return val;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        importedBy: user.email,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error in import-database:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
