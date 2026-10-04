import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: settings } = await supabase
    .from('telegram_settings')
    .select('*')
    .order('created_at')
    .limit(1)
    .maybeSingle()

  const token = settings?.bot_token
  if (!token) return json({ ok: false, message: 'Bot Telegram belum dikonfigurasi.' }, 400)

  const body = await req.json().catch(() => ({}))

  const send = (chatId: number | string, text: string) =>
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })

  // Admin action: register this function as the bot webhook
  if (body?.action === 'setup') {
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-webhook`
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, allowed_updates: ['message'] }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok || out?.ok === false) {
      return json({ ok: false, message: out?.description ?? `HTTP ${res.status}`, url }, 400)
    }
    return json({ ok: true, url })
  }

  try {
    const message = body?.message ?? body?.edited_message
    const chatId = message?.chat?.id
    const text: string = message?.text ?? ''
    if (!chatId) return json({ ok: true, ignored: true })

    const startMatch = text.match(/^\/start\s+([0-9a-fA-F-]{36})/)
    if (startMatch) {
      const studentId = startMatch[1]
      const { data: student } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('id', studentId)
        .maybeSingle()

      if (!student) {
        await send(chatId, '❌ Data siswa tidak ditemukan. Silakan ulangi dari akun siswa.')
        return json({ ok: true })
      }

      await supabase.from('students').update({ telegram_chat_id: String(chatId) }).eq('id', studentId)
      await send(
        chatId,
        `✅ Berhasil terhubung!\nNotifikasi absensi untuk <b>${student.full_name}</b> akan dikirim ke chat ini.\n\nID Chat Anda: <code>${chatId}</code>`,
      )
      return json({ ok: true })
    }

    await send(
      chatId,
      `👋 Halo! ID Chat Telegram Anda adalah:\n<code>${chatId}</code>\n\nSalin ID ini ke akun siswa untuk menerima notifikasi absensi.`,
    )
    return json({ ok: true })
  } catch (e) {
    console.error('telegram-webhook error', e)
    return json({ ok: false }, 200)
  }
})
