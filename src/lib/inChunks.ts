/**
 * Query Supabase dengan filter `.in(kolom, daftarId)` yang aman untuk daftar id panjang.
 *
 * PostgREST mengirim daftar id lewat URL. Ratusan UUID membuat URL puluhan KB sehingga gerbang/nginx menjawab
 * "502 Bad Gateway" (di browser tampak sebagai error CORS). Di sini id dipecah per `size` dan dijalankan beberapa sekaligus.
 * Satu id selalu berada di satu potongan, jadi urutan `.order()` per id tetap terjaga.
 */
export async function selectInChunks<T = any>(
  ids: readonly string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  size = 40,
  concurrency = 4,
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  const results: T[][] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= chunks.length) return;
      const { data, error } = await run(chunks[i]);
      if (error) throw error;
      results[i] = data || [];
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  return results.flat();
}
