import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

interface IncomingData {
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: any;
  id?: string;
}

// Allowed tables for Zapier sync - whitelist approach
const ALLOWED_TABLES = ['students', 'teachers', 'classes', 'schedules', 'grades', 'attendance'];

// Helper function to verify authentication (JWT or API key)
async function verifyAuth(req: Request, supabaseClient: any): Promise<{ authenticated: boolean; method: string; error: string | null }> {
  // Option 1: Check for API key (for Zapier webhooks)
  const apiKey = req.headers.get('X-API-Key');
  const expectedApiKey = Deno.env.get('ZAPIER_API_KEY');
  
  if (apiKey && expectedApiKey && apiKey === expectedApiKey) {
    return { authenticated: true, method: 'api_key', error: null };
  }
  
  // Option 2: Check for JWT token (for authenticated users)
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
    
    if (user && !error) {
      // Check if user has admin role
      const { data: roleData } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      if (roleData?.role === 'admin') {
        return { authenticated: true, method: 'jwt', error: null };
      }
    }
  }
  
  return { authenticated: false, method: 'none', error: 'Authentication required. Provide X-API-Key header or valid JWT token with admin role.' };
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

    // Verify authentication
    const { authenticated, method, error: authError } = await verifyAuth(req, supabaseClient);
    if (!authenticated) {
      console.log('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: authError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sync from Zapier authenticated via:', method);

    const payload: IncomingData = await req.json();
    console.log('Received from Zapier:', payload);

    const { table, operation, data, id } = payload;

    if (!table || !operation || !data) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: table, operation, data' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate table name against whitelist
    if (!ALLOWED_TABLES.includes(table)) {
      console.log('Rejected operation on non-whitelisted table:', table);
      return new Response(
        JSON.stringify({ error: `Table '${table}' is not allowed for Zapier sync. Allowed tables: ${ALLOWED_TABLES.join(', ')}` }),
        { 
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let result;

    switch (operation) {
      case 'insert':
        result = await supabaseClient
          .from(table)
          .insert(data)
          .select();
        break;

      case 'update':
        if (!id) {
          return new Response(
            JSON.stringify({ error: 'ID required for update operation' }),
            { 
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        result = await supabaseClient
          .from(table)
          .update(data)
          .eq('id', id)
          .select();
        break;

      case 'delete':
        if (!id) {
          return new Response(
            JSON.stringify({ error: 'ID required for delete operation' }),
            { 
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        result = await supabaseClient
          .from(table)
          .delete()
          .eq('id', id);
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid operation. Must be insert, update, or delete' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
    }

    if (result.error) {
      console.error('Database error:', result.error);
      return new Response(
        JSON.stringify({ error: result.error.message }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Successfully synced from Zapier');
    return new Response(
      JSON.stringify({ success: true, data: result.data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in sync-from-zapier:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
