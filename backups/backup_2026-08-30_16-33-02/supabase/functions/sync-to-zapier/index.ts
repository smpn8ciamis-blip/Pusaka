import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  table: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record: any;
  old_record?: any;
}

// Helper function to verify authentication
async function verifyAuth(req: Request, supabaseClient: any): Promise<{ user: any; error: string | null }> {
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

    // Verify admin authentication
    const { user, error: authError } = await verifyAuth(req, supabaseClient);
    if (authError) {
      console.log('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: authError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sync to Zapier initiated by:', user.email);

    const payload: WebhookPayload = await req.json();
    console.log('Received payload:', payload);

    // Get webhook URL for this table
    const { data: webhook, error: webhookError } = await supabaseClient
      .from('zapier_webhooks')
      .select('webhook_url, is_active')
      .eq('table_name', payload.table)
      .eq('is_active', true)
      .single();

    if (webhookError || !webhook) {
      console.log('No active webhook found for table:', payload.table);
      return new Response(
        JSON.stringify({ message: 'No active webhook configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send data to Zapier
    const zapierResponse = await fetch(webhook.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: payload.table,
        type: payload.type,
        record: payload.record,
        old_record: payload.old_record,
        timestamp: new Date().toISOString(),
      }),
    });

    console.log('Zapier response status:', zapierResponse.status);

    return new Response(
      JSON.stringify({ success: true, status: zapierResponse.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in sync-to-zapier:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
