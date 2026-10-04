import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: settings } = await supabase
      .from('website_settings')
      .select('id, instagram_access_token, instagram_user_id, instagram_cache, instagram_cache_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!settings?.instagram_access_token) {
      return new Response(
        JSON.stringify({ posts: [], error: 'Instagram access token belum dikonfigurasi' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // Serve cache if under 30 minutes old
    const cachedAt = settings.instagram_cache_at ? new Date(settings.instagram_cache_at).getTime() : 0;
    const fresh = Date.now() - cachedAt < 30 * 60 * 1000;
    if (fresh && Array.isArray(settings.instagram_cache) && settings.instagram_cache.length) {
      return new Response(
        JSON.stringify({ posts: settings.instagram_cache, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = settings.instagram_user_id || 'me';
    const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
    const url = `https://graph.instagram.com/${userId}/media?fields=${fields}&limit=5&access_token=${settings.instagram_access_token}`;
    const resp = await fetch(url);
    const body = await resp.text();
    if (!resp.ok) {
      console.error('Instagram API error', resp.status, body);
      // Fallback to cache if available
      if (Array.isArray(settings.instagram_cache) && settings.instagram_cache.length) {
        return new Response(
          JSON.stringify({ posts: settings.instagram_cache, cached: true, warning: 'menggunakan cache lama' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ posts: [], error: 'Instagram API error', status: resp.status, details: body }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    const json = JSON.parse(body);
    const posts = (json.data ?? []).slice(0, 5);

    await supabase
      .from('website_settings')
      .update({ instagram_cache: posts, instagram_cache_at: new Date().toISOString() })
      .eq('id', settings.id);

    return new Response(
      JSON.stringify({ posts, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ posts: [], error: String(e) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  }
});
