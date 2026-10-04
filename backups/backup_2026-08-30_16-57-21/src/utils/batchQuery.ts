import { supabase } from "@/integrations/supabase/client";

/**
 * Batch query untuk menghindari error 414 URI Too Long.
 * Memecah array ID menjadi batch kecil (maks 50 per request).
 *
 * Contoh penggunaan:
 *   const profiles = await batchQueryByIds('profiles', userIds, 'id', 'id, full_name, email, avatar_url');
 */
export async function batchQueryByIds<T = any>(
  table: string,
  ids: string[],
  column: string = "id",
  selectColumns: string = "*",
  batchSize: number = 50
): Promise<T[]> {
  if (!ids || ids.length === 0) return [];

  // Hapus duplikat
  const uniqueIds = [...new Set(ids)];
  const results: T[] = [];

  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    const { data, error } = await (supabase as any)
      .from(table)
      .select(selectColumns)
      .in(column, batch);

    if (error) {
      console.error(`[batchQuery] Error fetching ${table} batch ${i}:`, error);
      continue;
    }

    if (data) {
      results.push(...(data as T[]));
    }
  }

  return results;
}

/**
 * Batch query profiles berdasarkan user IDs.
 * Drop-in replacement untuk:
 *   supabase.from('profiles').select('...').in('id', userIds)
 */
export async function batchFetchProfiles(
  userIds: string[],
  selectColumns: string = "id, full_name, email, avatar_url, nis, nisn"
) {
  return batchQueryByIds("profiles", userIds, "id", selectColumns);
}
