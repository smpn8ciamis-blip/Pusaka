import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function verifyAdminAuth(req: Request, supabaseClient: any): Promise<{ user: any; error: string | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { user: null, error: 'No authorization header provided' };

  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseClient.auth.getUser(jwt);
  if (error || !user) return { user: null, error: 'Invalid or expired token' };

  const { data: roleData, error: roleError } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleError || roleData?.role !== 'super_admin') return { user: null, error: 'Super admin access required' };
  return { user, error: null };
}

function escapeValue(value: any): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${value.toString().replace(/'/g, "''")}'`;
}

function generateUpsertStatement(tableName: string, record: any): string {
  const columns = Object.keys(record);
  const values = columns.map(col => escapeValue(record[col]));
  const updateCols = columns.filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
  const quotedCols = columns.map(c => `"${c}"`).join(', ');
  if (updateCols) {
    return `INSERT INTO public."${tableName}" (${quotedCols}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${updateCols};`;
  }
  return `INSERT INTO public."${tableName}" (${quotedCols}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;`;
}

async function runSQL(supabaseClient: any, sql: string): Promise<any[]> {
  const { data, error } = await supabaseClient.rpc('exec_sql_readonly', { sql_query: sql });
  if (error) {
    console.error('SQL error:', error.message, 'Query:', sql.substring(0, 100));
    return [];
  }
  return data || [];
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

    const { user, error: authError } = await verifyAdminAuth(req, supabaseClient);
    if (authError) {
      return new Response(
        JSON.stringify({ error: authError }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Full database export initiated by admin:', user.email);

    const parts: string[] = [];

    parts.push(`-- =============================================
-- FULL DATABASE MIGRATION EXPORT (IDEMPOTENT)
-- Generated: ${new Date().toISOString()}
-- Exported by: ${user.email}
-- 
-- CATATAN: File ini AMAN dijalankan berulang kali.
-- Semua DDL di-wrap dengan exception handler sehingga
-- tidak akan error meskipun objek sudah ada.
-- =============================================

-- INSTRUCTIONS:
-- 1. Upload file ini ke VPS
-- 2. Jalankan: docker cp migration.sql DB_CONTAINER:/tmp/migration.sql
-- 3. Jalankan: docker exec DB_CONTAINER psql -U postgres -d postgres -f /tmp/migration.sql
-- 4. Atau gunakan ~/deploy.sh yang sudah otomatis menjalankan migrasi

-- Disable foreign key checks during import
SET session_replication_role = 'replica';

-- Ensure search_path
SET search_path TO public, auth, storage, extensions;

`);

    // ========== 1. EXTENSIONS ==========
    parts.push(`-- =============================================\n-- SECTION 1: EXTENSIONS\n-- =============================================\n\n`);
    const extensions = await runSQL(supabaseClient, `SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql','pg_stat_statements','pgcrypto','pgjwt','uuid-ossp','supabase_vault','pgsodium')`);
    for (const ext of extensions) {
      parts.push(`CREATE EXTENSION IF NOT EXISTS "${ext.extname}";\n`);
    }
    parts.push('\n');

    // ========== 2. ENUMS ==========
    parts.push(`-- =============================================\n-- SECTION 2: CUSTOM TYPES / ENUMS\n-- =============================================\n\n`);
    const enums = await runSQL(supabaseClient, `SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) as labels FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' GROUP BY t.typname`);
    for (const en of enums) {
      const labels = en.labels.split(',').map((l: string) => `'${l}'`).join(', ');
      parts.push(`DO $$ BEGIN CREATE TYPE public.${en.typname} AS ENUM (${labels}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;\n`);
      // Also add any missing enum values
      for (const label of en.labels.split(',')) {
        parts.push(`DO $$ BEGIN ALTER TYPE public.${en.typname} ADD VALUE IF NOT EXISTS '${label}'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;\n`);
      }
    }
    parts.push('\n');

    // ========== 3. TABLE SCHEMAS ==========
    parts.push(`-- =============================================\n-- SECTION 3: TABLE SCHEMAS\n-- =============================================\n\n`);

    const tables = await runSQL(supabaseClient, `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
    const tableNames = tables.map((t: any) => t.table_name).filter((n: string) => n !== 'processing_jobs');

    for (const tableName of tableNames) {
      const columns = await runSQL(supabaseClient, `SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale, is_generated, generation_expression FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' ORDER BY ordinal_position`);
      if (columns.length === 0) continue;

      parts.push(`-- Table: ${tableName}\n`);
      parts.push(`CREATE TABLE IF NOT EXISTS public."${tableName}" (\n`);

      const colDefs: string[] = [];
      for (const col of columns) {
        let colType = col.data_type;
        if (col.data_type === 'USER-DEFINED') colType = col.udt_name;
        else if (col.data_type === 'character varying') colType = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'text';
        else if (col.data_type === 'ARRAY') colType = col.udt_name.replace(/^_/, '') + '[]';
        else if (col.data_type === 'numeric' && col.numeric_precision) colType = `numeric(${col.numeric_precision},${col.numeric_scale || 0})`;
        else if (col.data_type === 'timestamp with time zone') colType = 'timestamptz';
        else if (col.data_type === 'timestamp without time zone') colType = 'timestamp';

        let def = `  "${col.column_name}" ${colType}`;
        if (col.is_nullable === 'NO') def += ' NOT NULL';
        if (col.is_generated === 'ALWAYS' && col.generation_expression) {
          def += ` GENERATED ALWAYS AS (${col.generation_expression}) STORED`;
        } else if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }
        colDefs.push(def);
      }

      parts.push(colDefs.join(',\n'));
      parts.push('\n);\n\n');

      // Primary keys - wrapped in exception handler
      const pks = await runSQL(supabaseClient, `SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_schema = 'public' AND tc.table_name = '${tableName}' AND tc.constraint_type = 'PRIMARY KEY'`);
      if (pks.length > 0) {
        const pkCols = pks.map((p: any) => `"${p.column_name}"`).join(', ');
        parts.push(`DO $$ BEGIN ALTER TABLE public."${tableName}" ADD PRIMARY KEY (${pkCols}); EXCEPTION WHEN invalid_table_definition OR duplicate_table THEN NULL; END $$;\n\n`);
      }

      // Unique constraints - wrapped in exception handler
      const uniques = await runSQL(supabaseClient, `SELECT tc.constraint_name, string_agg(kcu.column_name, ', ') as cols FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_schema = 'public' AND tc.table_name = '${tableName}' AND tc.constraint_type = 'UNIQUE' GROUP BY tc.constraint_name`);
      for (const u of uniques) {
        const quotedCols = u.cols.split(', ').map((c: string) => `"${c.trim()}"`).join(', ');
        parts.push(`DO $$ BEGIN ALTER TABLE public."${tableName}" ADD CONSTRAINT "${u.constraint_name}" UNIQUE (${quotedCols}); EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;\n`);
      }
      if (uniques.length > 0) parts.push('\n');

      // Add missing columns (for tables that already exist but might be outdated)
      for (const col of columns) {
        let colType = col.data_type;
        if (col.data_type === 'USER-DEFINED') colType = col.udt_name;
        else if (col.data_type === 'character varying') colType = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'text';
        else if (col.data_type === 'ARRAY') colType = col.udt_name.replace(/^_/, '') + '[]';
        else if (col.data_type === 'numeric' && col.numeric_precision) colType = `numeric(${col.numeric_precision},${col.numeric_scale || 0})`;
        else if (col.data_type === 'timestamp with time zone') colType = 'timestamptz';
        else if (col.data_type === 'timestamp without time zone') colType = 'timestamp';

        let defaultClause = '';
        if (col.column_default && col.is_generated !== 'ALWAYS') {
          defaultClause = ` DEFAULT ${col.column_default}`;
        }
        parts.push(`DO $$ BEGIN ALTER TABLE public."${tableName}" ADD COLUMN IF NOT EXISTS "${col.column_name}" ${colType}${defaultClause}; EXCEPTION WHEN duplicate_column OR others THEN NULL; END $$;\n`);
      }
      parts.push('\n');
    }

    // ========== 4. FOREIGN KEYS ==========
    parts.push(`-- =============================================\n-- SECTION 4: FOREIGN KEYS\n-- =============================================\n\n`);

    const fks = await runSQL(supabaseClient, `SELECT tc.constraint_name, tc.table_name, kcu.column_name, ccu.table_schema AS foreign_table_schema, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name, rc.delete_rule, rc.update_rule FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY' ORDER BY tc.table_name`);

    for (const fk of fks) {
      const foreignRef = fk.foreign_table_schema === 'public'
        ? `public."${fk.foreign_table_name}"`
        : `${fk.foreign_table_schema}."${fk.foreign_table_name}"`;
      let stmt = `ALTER TABLE public."${fk.table_name}" ADD CONSTRAINT "${fk.constraint_name}" FOREIGN KEY ("${fk.column_name}") REFERENCES ${foreignRef}("${fk.foreign_column_name}")`;
      if (fk.delete_rule && fk.delete_rule !== 'NO ACTION') stmt += ` ON DELETE ${fk.delete_rule}`;
      if (fk.update_rule && fk.update_rule !== 'NO ACTION') stmt += ` ON UPDATE ${fk.update_rule}`;
      parts.push(`DO $$ BEGIN ${stmt}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;\n`);
    }
    parts.push('\n');

    // ========== 5. INDEXES ==========
    parts.push(`-- =============================================\n-- SECTION 5: INDEXES\n-- =============================================\n\n`);

    const indexes = await runSQL(supabaseClient, `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey' AND indexname NOT LIKE 'pg_%' ORDER BY tablename, indexname`);
    for (const idx of indexes) {
      // Replace CREATE INDEX with CREATE INDEX IF NOT EXISTS
      const idxDef = idx.indexdef.replace(/^CREATE INDEX/, 'CREATE INDEX IF NOT EXISTS').replace(/^CREATE UNIQUE INDEX/, 'CREATE UNIQUE INDEX IF NOT EXISTS');
      parts.push(`${idxDef};\n`);
    }
    parts.push('\n');

    // ========== 6. FUNCTIONS (before RLS, triggers need functions) ==========
    parts.push(`-- =============================================\n-- SECTION 6: DATABASE FUNCTIONS\n-- =============================================\n\n`);

    const functions = await runSQL(supabaseClient, `SELECT p.proname, pg_get_functiondef(p.oid) as funcdef FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY p.proname`);
    for (const fn of functions) {
      parts.push(`-- Function: ${fn.proname}\n`);
      parts.push(`${fn.funcdef};\n\n`);
    }

    // ========== 7. RLS POLICIES ==========
    parts.push(`-- =============================================\n-- SECTION 7: ROW LEVEL SECURITY\n-- =============================================\n\n`);

    const rlsTables = await runSQL(supabaseClient, `SELECT relname FROM pg_class JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND relrowsecurity = true`);
    for (const t of rlsTables) {
      parts.push(`ALTER TABLE public."${t.relname}" ENABLE ROW LEVEL SECURITY;\n`);
    }
    parts.push('\n');

    const policies = await runSQL(supabaseClient, `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`);
    for (const p of policies) {
      // DROP first, then CREATE — fully idempotent
      parts.push(`DROP POLICY IF EXISTS "${p.policyname}" ON public."${p.tablename}";\n`);
      const permissive = p.permissive === 'PERMISSIVE' ? 'PERMISSIVE' : 'RESTRICTIVE';
      const roles = p.roles ? `TO ${p.roles}` : '';
      let stmt = `CREATE POLICY "${p.policyname}" ON public."${p.tablename}" AS ${permissive} FOR ${p.cmd} ${roles}`;
      if (p.qual) stmt += ` USING (${p.qual})`;
      if (p.with_check) stmt += ` WITH CHECK (${p.with_check})`;
      parts.push(`${stmt};\n\n`);
    }

    // ========== 8. TRIGGERS ==========
    parts.push(`-- =============================================\n-- SECTION 8: TRIGGERS\n-- =============================================\n\n`);

    const triggers = await runSQL(supabaseClient, `SELECT trigger_name, event_manipulation, event_object_table, action_statement, action_timing, action_orientation FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY event_object_table, trigger_name`);
    
    // Deduplicate triggers (same trigger can appear multiple times for different events)
    const triggerMap = new Map<string, any>();
    for (const tr of triggers) {
      const key = `${tr.trigger_name}_${tr.event_object_table}`;
      if (triggerMap.has(key)) {
        // Combine events (INSERT OR UPDATE OR DELETE)
        const existing = triggerMap.get(key);
        if (!existing.event_manipulation.includes(tr.event_manipulation)) {
          existing.event_manipulation += ` OR ${tr.event_manipulation}`;
        }
      } else {
        triggerMap.set(key, { ...tr });
      }
    }

    for (const [, tr] of triggerMap) {
      parts.push(`DROP TRIGGER IF EXISTS "${tr.trigger_name}" ON public."${tr.event_object_table}";\n`);
      parts.push(`CREATE TRIGGER "${tr.trigger_name}" ${tr.action_timing} ${tr.event_manipulation} ON public."${tr.event_object_table}" FOR EACH ${tr.action_orientation} ${tr.action_statement};\n\n`);
    }

    // ========== 9. SEQUENCES (reset sequences after data import) ==========
    parts.push(`-- =============================================\n-- SECTION 9: SEQUENCES\n-- =============================================\n\n`);

    const sequences = await runSQL(supabaseClient, `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`);
    for (const seq of sequences) {
      parts.push(`DO $$ BEGIN CREATE SEQUENCE IF NOT EXISTS public."${seq.sequence_name}"; EXCEPTION WHEN duplicate_table THEN NULL; END $$;\n`);
    }
    parts.push('\n');

    // ========== 10. REALTIME ==========
    parts.push(`-- =============================================\n-- SECTION 10: REALTIME PUBLICATIONS\n-- =============================================\n\n`);

    const realtimeTables = await runSQL(supabaseClient, `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`);
    for (const rt of realtimeTables) {
      parts.push(`DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."${rt.tablename}"; EXCEPTION WHEN duplicate_object THEN NULL; END $$;\n`);
    }
    parts.push('\n');

    // ========== 11. DATA ==========
    parts.push(`-- =============================================\n-- SECTION 11: TABLE DATA\n-- =============================================\n\n`);
    parts.push(`-- Data akan di-upsert (insert atau update yang sudah ada) - tidak ada data yang dihapus\n\n`);

    console.log(`Exporting data for ${tableNames.length} tables...`);

    async function fetchAllTableData(client: any, table: string, excludeCols: Set<string>): Promise<any[]> {
      const colsResult = await runSQL(client, `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' AND (is_generated IS NULL OR is_generated = 'NEVER') ORDER BY ordinal_position`);
      const cols = colsResult.map((c: any) => c.column_name).filter((c: string) => !excludeCols.has(c));
      if (cols.length === 0) return [];

      const selectCols = cols.map((c: string) => `"${c}"`).join(', ');
      let allRows: any[] = [];
      let offset = 0;
      const batchSize = 2000;

      while (true) {
        const rows = await runSQL(client, `SELECT ${selectCols} FROM public."${table}" ORDER BY 1 LIMIT ${batchSize} OFFSET ${offset}`);
        if (!rows || rows.length === 0) break;
        allRows = allRows.concat(rows);
        if (rows.length < batchSize) break;
        offset += batchSize;
      }
      return allRows;
    }

    for (let i = 0; i < tableNames.length; i++) {
      const tableName = tableNames[i];
      const generatedCols = await runSQL(supabaseClient, `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' AND is_generated = 'ALWAYS'`);
      const generatedColNames = new Set(generatedCols.map((c: any) => c.column_name));
      const allData = await fetchAllTableData(supabaseClient, tableName, generatedColNames);

      if (allData.length === 0) {
        parts.push(`-- No data in ${tableName}\n\n`);
        continue;
      }

      parts.push(`-- Data: ${tableName} (${allData.length} records)\n`);
      for (const record of allData) {
        parts.push(generateUpsertStatement(tableName, record) + '\n');
      }
      parts.push('\n');
      console.log(`  ${tableName}: ${allData.length} records exported`);
    }

    // ========== 12. AUTH USERS ==========
    parts.push(`-- =============================================\n-- SECTION 12: AUTH USERS\n-- =============================================\n\n`);
    parts.push(`-- Password di-export sebagai bcrypt hash. User tetap bisa login dengan password lama.\n\n`);

    try {
      let allUsers: any[] = [];
      let page = 1;
      const perPage = 1000;

      while (true) {
        const { data: { users }, error: usersError } = await supabaseClient.auth.admin.listUsers({ page, perPage });
        if (usersError) {
          parts.push(`-- Error fetching auth users: ${usersError.message}\n\n`);
          break;
        }
        if (!users || users.length === 0) break;
        allUsers = allUsers.concat(users);
        if (users.length < perPage) break;
        page++;
      }

      if (allUsers.length > 0) {
        parts.push(`-- Auth Users (${allUsers.length} accounts)\n`);
        for (const u of allUsers) {
          const id = escapeValue(u.id);
          const email = escapeValue(u.email || null);
          const phone = escapeValue(u.phone || null);
          const encryptedPassword = escapeValue(u.encrypted_password || null);
          const emailConfirmedAt = escapeValue(u.email_confirmed_at || null);
          const phoneConfirmedAt = escapeValue(u.phone_confirmed_at || null);
          const rawAppMeta = escapeValue(u.app_metadata || null);
          const rawUserMeta = escapeValue(u.user_metadata || null);
          const role = escapeValue(u.role || 'authenticated');
          const createdAt = escapeValue(u.created_at || null);
          const updatedAt = escapeValue(u.updated_at || null);

          // Use DO UPDATE so re-running updates existing users
          parts.push(`INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) VALUES ('00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', ${role}, ${email}, ${encryptedPassword}, ${emailConfirmedAt}, ${phone}, ${phoneConfirmedAt}, ${rawAppMeta}, ${rawUserMeta}, ${createdAt}, ${updatedAt}, '', '', '', '') ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, email_confirmed_at = EXCLUDED.email_confirmed_at, raw_app_meta_data = EXCLUDED.raw_app_meta_data, raw_user_meta_data = EXCLUDED.raw_user_meta_data, updated_at = EXCLUDED.updated_at;\n`);
        }

        parts.push(`\n-- Auth Identities\n`);
        for (const u of allUsers) {
          if (u.email) {
            const id = escapeValue(u.id);
            const email = escapeValue(u.email);
            const createdAt = escapeValue(u.created_at || null);
            const updatedAt = escapeValue(u.updated_at || null);
            const identityData = escapeValue({ sub: u.id, email: u.email });
            parts.push(`INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) VALUES (gen_random_uuid(), ${id}, ${identityData}, 'email', ${id}, ${createdAt}, ${createdAt}, ${updatedAt}) ON CONFLICT (provider, provider_id) DO NOTHING;\n`);
          }
        }
      } else {
        parts.push(`-- No auth users found\n`);
      }
    } catch (authExportError) {
      parts.push(`-- Error exporting auth users: ${(authExportError as Error).message}\n`);
    }
    parts.push('\n');

    // ========== 13. STORAGE BUCKETS ==========
    parts.push(`-- =============================================\n-- SECTION 13: STORAGE BUCKETS & POLICIES\n-- =============================================\n\n`);

    const { data: buckets } = await supabaseClient.storage.listBuckets();
    if (buckets && buckets.length > 0) {
      for (const bucket of buckets) {
        parts.push(`INSERT INTO storage.buckets (id, name, public) VALUES ('${bucket.id}', '${bucket.name}', ${bucket.public}) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;\n`);
      }
    }
    parts.push('\n');

    const storagePolicies = await runSQL(supabaseClient, `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'storage' ORDER BY tablename, policyname`);
    if (storagePolicies.length > 0) {
      parts.push(`-- Storage Policies\n`);
      for (const p of storagePolicies) {
        parts.push(`DROP POLICY IF EXISTS "${p.policyname}" ON storage."${p.tablename}";\n`);
        const roles = p.roles ? `TO ${p.roles}` : '';
        let stmt = `CREATE POLICY "${p.policyname}" ON storage."${p.tablename}" FOR ${p.cmd} ${roles}`;
        if (p.qual) stmt += ` USING (${p.qual})`;
        if (p.with_check) stmt += ` WITH CHECK (${p.with_check})`;
        parts.push(`${stmt};\n\n`);
      }
    }

    // ========== 14. RESET SEQUENCES ==========
    parts.push(`-- =============================================\n-- SECTION 14: RESET SEQUENCES TO MAX VALUES\n-- =============================================\n\n`);
    parts.push(`-- Reset semua sequence agar tidak konflik saat insert data baru\n`);

    // Get columns with sequences (serial/bigserial columns)
    const seqCols = await runSQL(supabaseClient, `SELECT table_name, column_name, replace(replace(column_default, 'nextval(''', ''), '''::regclass)', '') as seq_name FROM information_schema.columns WHERE table_schema = 'public' AND column_default LIKE 'nextval%' ORDER BY table_name`);
    for (const sc of seqCols) {
      parts.push(`DO $$ BEGIN PERFORM setval('${sc.seq_name}', COALESCE((SELECT MAX("${sc.column_name}") FROM public."${sc.table_name}"), 1)); EXCEPTION WHEN others THEN NULL; END $$;\n`);
    }
    parts.push('\n');

    // ========== FINALIZE ==========
    parts.push(`\n-- Re-enable foreign key checks\nSET session_replication_role = 'origin';\n\n`);
    parts.push(`-- =============================================\n-- MIGRATION COMPLETE\n-- File ini bisa dijalankan berulang kali tanpa error.\n-- =============================================\n`);

    const sqlContent = parts.join('');
    console.log(`Export completed. Total SQL size: ${sqlContent.length} characters`);

    const filename = `full-migration-${new Date().toISOString().split('T')[0]}.sql`;
    return new Response(sqlContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Error in export-database:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
