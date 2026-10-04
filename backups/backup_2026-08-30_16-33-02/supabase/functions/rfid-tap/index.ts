import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const body = await req.json().catch(() => ({}))
    const uid = typeof body?.uid === 'string' ? body.uid.trim() : ''
    if (!uid || uid.length > 128) {
      return json({ ok: false, message: 'UID kartu tidak valid' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // All matching + attendance logic lives in the database so it stays
    // consistent between cloud and self-hosted (VPS) deployments.
    const { data, error } = await supabase.rpc('rfid_process_tap', {
      p_uid: uid,
      p_face_verified: body?.face_verified === true,
    })
    if (error) throw error

    return json(data)
  } catch (e) {
    console.error('rfid-tap error', e)
    return json({ ok: false, message: 'Terjadi kesalahan pada server.' }, 500)
  }
})
