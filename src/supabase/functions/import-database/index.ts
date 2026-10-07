import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import postgres from 'npm:postgres@3.4.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Hanya super admin yang boleh restore (restore dapat menimpa seluruh data).
// Jangan pakai .single(): user bisa punya lebih dari satu baris role.
async function verifySuperAdmin(req: Request, supabaseClient: any): Promise<{ user: any; error: string | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { user: null, error: 'No authorization header provided' };

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
  if (error || !user) return { user: null, error: 'Invalid or expired token' };

  const { data: roleRows, error: roleError } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  if (roleError || !(roleRows ?? []).some((r: any) => r.role === 'super_admin')) {
    return { user: null, error: 'Super admin access required' };
  }
  return { user, error: null };
}

// Pernyataan yang boleh dijalankan saat restore (sesuai isi file hasil export).
// DELETE / TRUNCATE / DROP TABLE sengaja tidak diizinkan.
const ALLOWED = /^(INSERT\s+INTO|CREATE\s+(OR\s+REPLACE\s+)?(TABLE|TYPE|SEQUENCE|INDEX|UNIQUE\s+INDEX|FUNCTION|TRIGGER|POLICY|VIEW|EXTENSION|SCHEMA)|ALTER\s+(TABLE|TYPE|SEQUENCE|PUBLICATION|FUNCTION)|DROP\s+(POLICY|TRIGGER)|DO\s|SET\s|COMMENT\s+ON|GRANT\s|SELECT\s+(pg_catalog\.)?setval)/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let sql: ReturnType<typeof postgres> | null = null;
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { user, error: authError } = await verifySuperAdmin(req, supabaseClient);
    if (authError) return json({ error: authError }, 401);

    const body = await req.json();

    // ---- Format baru: { statements: string[] } (SQL hasil export, dipecah di browser) ----
    if (Array.isArray(body?.statements)) {
      const dbUrl = Deno.env.get('SUPABASE_DB_URL');
      if (!dbUrl) return json({ error: 'SUPABASE_DB_URL tidak tersedia di Edge Function' }, 500);

      sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 15 });
      const conn = await sql.reserve();

      let ok = 0;
      let skipped = 0;
      const errors: { index: number; statement: string; error: string }[] = [];

      try {
        // FK dimatikan selama restore; sesi ini milik request ini saja
        try { await conn.unsafe(`SET session_replication_role = 'replica'`); } catch (_) { /* tidak fatal */ }

        for (let i = 0; i < body.statements.length; i++) {
          const stmt = String(body.statements[i] ?? '').trim();
          if (!stmt) continue;
          if (!ALLOWED.test(stmt)) {
            skipped++;
            if (errors.length < 50) errors.push({ index: i, statement: stmt.slice(0, 120), error: 'Pernyataan tidak diizinkan (dilewati)' });
            continue;
          }
          try {
            await conn.unsafe(stmt);
            ok++;
          } catch (e) {
            if (errors.length < 50) errors.push({ index: i, statement: stmt.slice(0, 120), error: (e as Error).message });
            else skipped++;
          }
        }
      } finally {
        try { await conn.unsafe(`SET session_replication_role = 'origin'`); } catch (_) { /* ignore */ }
        conn.release();
      }

      return json({
        success: errors.length === 0,
        executed: ok,
        failed: errors.length,
        skipped,
        errors,
        importedBy: user.email,
        timestamp: new Date().toISOString(),
      });
    }

    // ---- Format lama: JSON { tables: { nama: [rows] } } ----
    if (!body?.tables || typeof body.tables !== 'object') {
      return json({ error: 'Format file backup tidak dikenali' }, 400);
    }

    const results: Record<string, any> = {};
    for (const [tableName, records] of Object.entries(body.tables)) {
      if (!Array.isArray(records) || records.length === 0) {
        results[tableName] = { skipped: true, count: 0 };
        continue;
      }
      try {
        const cleaned = records.map((r: any) => {
          const c = { ...r };
          if (tableName === 'grades' && 'final_grade' in c) delete c.final_grade;
          return c;
        });
        // Dipecah per 500 baris agar tidak melewati batas ukuran request PostgREST
        for (let i = 0; i < cleaned.length; i += 500) {
          const { error } = await supabaseClient.from(tableName).upsert(cleaned.slice(i, i + 500) as any[], { onConflict: 'id' });
          if (error) throw error;
        }
        results[tableName] = { success: true, count: records.length };
      } catch (err) {
        results[tableName] = { success: false, error: (err as Error).message, count: 0 };
      }
    }
    return json({ success: true, results, importedBy: user.email, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Error in import-database:', error);
    return json({ error: (error as Error).message }, 500);
  } finally {
    try { await sql?.end({ timeout: 2 }); } catch (_) { /* ignore */ }
  }
});
