import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify admin or super_admin authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check role
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || !["admin", "super_admin"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather system information
    const memoryUsage = Deno.memoryUsage();

    // Database stats using service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get database size
    const { data: dbSize } = await supabaseAdmin.rpc("get_database_size").maybeSingle();

    // Get table count and row counts
    const { data: tableStats } = await supabaseAdmin.rpc("get_table_stats");

    // Get active connections
    const { data: connectionStats } = await supabaseAdmin.rpc("get_connection_stats").maybeSingle();

    // Get storage usage
    const { data: storageStats } = await supabaseAdmin.rpc("get_storage_stats").maybeSingle();

    const systemInfo = {
      runtime: {
        name: "Deno",
        version: Deno.version.deno,
        typescript_version: Deno.version.typescript,
        v8_version: Deno.version.v8,
      },
      memory: {
        rss: memoryUsage.rss,
        heap_total: memoryUsage.heapTotal,
        heap_used: memoryUsage.heapUsed,
        external: memoryUsage.external,
      },
      database: {
        size: dbSize?.db_size || "N/A",
        size_pretty: dbSize?.db_size_pretty || "N/A",
        tables: tableStats || [],
        active_connections: connectionStats?.active_connections || 0,
        max_connections: connectionStats?.max_connections || 0,
      },
      storage: {
        total_files: storageStats?.total_files || 0,
        total_size: storageStats?.total_size || 0,
        total_size_pretty: storageStats?.total_size_pretty || "0 Bytes",
        buckets: storageStats?.bucket_count || 0,
      },
      server: {
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        os: Deno.build.os,
        arch: Deno.build.arch,
      },
    };

    return new Response(JSON.stringify(systemInfo), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error getting system info:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
