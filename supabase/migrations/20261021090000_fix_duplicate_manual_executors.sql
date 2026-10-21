-- Pelaksana manual tercatat ganda di SPD dan kwitansi.
-- Penyebab: trigger database menyalin pelaksana manual ke official_travel_followers saat SPD dibuat,
-- lalu aplikasi menyalinnya lagi (dengan urutan yang benar). Satu pelaksana jadi 2-3 baris.
-- Perbaikan: hapus trigger (aplikasi satu-satunya yang membuat SPD) dan bersihkan baris ganda.

DROP TRIGGER IF EXISTS trigger_copy_manual_executors ON public.official_travel_letters;
DROP TRIGGER IF EXISTS trigger_sync_manual_executors ON public.official_travel_letters;
DROP FUNCTION IF EXISTS public.copy_manual_executors_to_spd();
DROP FUNCTION IF EXISTS public.sync_manual_executors_on_update();

-- Pembersihan: untuk tiap SPD dan tiap pelaksana (nama+NIP+pangkat+jabatan sama), pertahankan sebanyak yang
-- ada di surat tugasnya (minimal 1; yang punya order_index lebih dulu dipertahankan), hapus sisanya.
WITH ranked AS (
  SELECT f.id,
         row_number() OVER (
           PARTITION BY f.official_travel_id, f.manual_executor_name,
                        COALESCE(f.manual_executor_nip, ''), COALESCE(f.manual_executor_pangkat, ''), COALESCE(f.manual_executor_jabatan, '')
           ORDER BY f.order_index NULLS LAST, f.id) AS rn,
         GREATEST(1, (
           SELECT count(*) FROM public.assignment_letter_manual_executors ame
            WHERE ame.assignment_letter_id = l.assignment_letter_id
              AND ame.full_name = f.manual_executor_name
              AND COALESCE(ame.nip, '') = COALESCE(f.manual_executor_nip, '')
              AND COALESCE(ame.pangkat_golongan, '') = COALESCE(f.manual_executor_pangkat, '')
              AND COALESCE(ame.jabatan, '') = COALESCE(f.manual_executor_jabatan, ''))) AS allowed
    FROM public.official_travel_followers f
    JOIN public.official_travel_letters l ON l.id = f.official_travel_id
   WHERE f.follower_type = 'manual_executor'
)
DELETE FROM public.official_travel_followers
 WHERE id IN (SELECT id FROM ranked WHERE rn > allowed);
