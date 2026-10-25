-- Guru/staf membalas WA notifikasi SPPD dengan foto -> otomatis jadi foto bukti kunjungan di akun Pusaka.
-- Tabel ini mencatat pesan notifikasi yang dikirim bot agar balasan bisa dikaitkan ke surat tugas dan orangnya.
CREATE TABLE IF NOT EXISTS public.wa_notice_messages (
  wa_message_id text PRIMARY KEY,                    -- id pesan WhatsApp yang dikirim bot
  jid text NOT NULL,
  phone text NOT NULL,
  official_travel_id uuid REFERENCES public.official_travel_letters(id) ON DELETE CASCADE,
  assignment_letter_id uuid REFERENCES public.assignment_letters(id) ON DELETE CASCADE,
  teacher_id uuid,
  staff_id uuid,
  user_id uuid,                                      -- akun Pusaka pemilik (pengunggah)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_notice_messages_created ON public.wa_notice_messages(created_at);
-- Hanya dipakai bot (service role); tanpa policy = tidak bisa diakses dari aplikasi.
ALTER TABLE public.wa_notice_messages ENABLE ROW LEVEL SECURITY;
