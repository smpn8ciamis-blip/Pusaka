-- Opsi pengingat guru: cakupan jam, item yang dicek, rekap jadwal harian
ALTER TABLE public.wa_bot_settings
  ADD COLUMN IF NOT EXISTS reminder_scope text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS followup_journal boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS followup_attendance boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS daily_recap_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_recap_time text NOT NULL DEFAULT '06:00';

ALTER TABLE public.wa_bot_settings DROP CONSTRAINT IF EXISTS wa_bot_settings_reminder_scope_check;
ALTER TABLE public.wa_bot_settings
  ADD CONSTRAINT wa_bot_settings_reminder_scope_check CHECK (reminder_scope IN ('first', 'all'));
