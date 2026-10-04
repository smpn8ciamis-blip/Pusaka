import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const studentId = typeof body?.student_id === 'string' ? body.student_id : ''
    const type = body?.type === 'check_out' ? 'check_out' : 'check_in'
    const status = typeof body?.status === 'string' ? body.status : 'hadir'
    const testChatId = typeof body?.test_chat_id === 'string' ? body.test_chat_id.trim() : ''

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

    if (!settings?.bot_token) return json({ ok: false, message: 'Bot Telegram belum dikonfigurasi.' }, 400)
    if (!settings.enabled && !testChatId) return json({ ok: false, message: 'Notifikasi Telegram nonaktif.' })

    const send = async (chatId: string, text: string) => {
      const res = await fetch(`https://api.telegram.org/bot${settings.bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || out?.ok === false) {
        console.error('telegram sendMessage failed', res.status, JSON.stringify(out))
        return { ok: false, error: out?.description ?? `HTTP ${res.status}` }
      }
      return { ok: true }
    }

    if (testChatId) {
      const r = await send(testChatId, '✅ Tes koneksi bot Telegram berhasil.')
      return json(r, r.ok ? 200 : 400)
    }

    if (type === 'check_in' && settings.notify_check_in === false) return json({ ok: false, message: 'Notifikasi masuk nonaktif.' })
    if (type === 'check_out' && settings.notify_check_out === false) return json({ ok: false, message: 'Notifikasi pulang nonaktif.' })

    if (!studentId) return json({ ok: false, message: 'student_id wajib diisi.' }, 400)

    const { data: student } = await supabase
      .from('students')
      .select('full_name, nis, telegram_chat_id, classes(name)')
      .eq('id', studentId)
      .maybeSingle()

    if (!student?.telegram_chat_id) return json({ ok: false, message: 'Siswa belum memiliki ID chat Telegram.' })

    const now = new Date(Date.now() + 7 * 3600 * 1000)
    const waktu = now.toISOString().slice(11, 19)
    const tanggal = now.toISOString().slice(0, 10)

    const text = String(settings.message_template ?? '')
      .replaceAll('{nama}', student.full_name ?? '-')
      .replaceAll('{nis}', student.nis ?? '-')
      .replaceAll('{kelas}', (student as any)?.classes?.name ?? '-')
      .replaceAll('{tipe}', type === 'check_in' ? 'ABSEN MASUK' : 'ABSEN PULANG')
      .replaceAll('{waktu}', waktu)
      .replaceAll('{tanggal}', tanggal)
      .replaceAll('{status}', status)

    const r = await send(student.telegram_chat_id, text)
    return json(r, r.ok ? 200 : 400)
  } catch (e) {
    console.error('telegram-notify error', e)
    return json({ ok: false, message: 'Terjadi kesalahan pada server.' }, 500)
  }
})
