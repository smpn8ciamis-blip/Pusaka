-- Antrean perintah ke mesin fingerprint (ADMS). Admin mengisi dari aplikasi; bot mengirimkannya ke mesin
-- saat mesin menghubungi /iclock/getrequest, dan menandai hasilnya dari /iclock/devicecmd.
CREATE TABLE IF NOT EXISTS public.fingerprint_commands (
  id bigserial PRIMARY KEY,
  device_sn text NOT NULL,
  command text NOT NULL,                         -- mis. DATA UPDATE USERINFO PIN=1<TAB>Name=Budi ...
  label text,                                    -- nama orang (untuk tampilan)
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','done','failed')),
  return_code integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  done_at timestamptz
);
CREATE INDEX IF NOT EXISTS fingerprint_commands_queue_idx ON public.fingerprint_commands(device_sn, status, id);

GRANT ALL ON public.fingerprint_commands TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fingerprint_commands_id_seq TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fingerprint_commands TO authenticated;
ALTER TABLE public.fingerprint_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin kelola fingerprint_commands" ON public.fingerprint_commands;
CREATE POLICY "Admin kelola fingerprint_commands" ON public.fingerprint_commands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());
