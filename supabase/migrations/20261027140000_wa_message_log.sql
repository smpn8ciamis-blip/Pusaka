-- Log pesan WhatsApp yang dikirim bot (berhasil/gagal), ditampilkan di Pengaturan Bot WA > Koneksi.
-- Ditulis dan dibaca oleh bot (service role) lewat endpoint /admin/queue yang hanya untuk admin.
-- RLS aktif TANPA kebijakan: pengguna aplikasi tidak bisa membaca/menulis langsung (isi pratinjau
-- pesan dapat memuat nama siswa/guru). Bot membersihkan baris > 30 hari secara otomatis.
CREATE TABLE IF NOT EXISTS public.wa_message_log (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz,
  to_jid text NOT NULL,
  kind text NOT NULL DEFAULT 'lainnya',
  status text NOT NULL CHECK (status IN ('terkirim', 'gagal')),
  error text,
  preview text,
  wa_message_id text
);

CREATE INDEX IF NOT EXISTS wa_message_log_created_idx ON public.wa_message_log (created_at DESC);
CREATE INDEX IF NOT EXISTS wa_message_log_status_idx ON public.wa_message_log (status, created_at DESC);

ALTER TABLE public.wa_message_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_message_log FROM PUBLIC, anon, authenticated;
