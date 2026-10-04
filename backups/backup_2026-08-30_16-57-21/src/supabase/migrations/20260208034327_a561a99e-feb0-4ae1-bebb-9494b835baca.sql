
-- =====================================================
-- MULTI-TENANCY INFRASTRUCTURE
-- =====================================================

-- Step 1: Add super_admin to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Step 2: Create schools table
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  npsn TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Step 3: Add school_id column to all data tables
DO $$
DECLARE
  tbl TEXT;
  tables_to_update TEXT[] := ARRAY[
    'user_roles', 'students', 'teachers', 'classes', 'schedules', 'attendance',
    'grades', 'academic_years', 'school_settings', 'announcements', 'violation_types',
    'student_violations', 'complaints', 'teaching_journals', 'repository',
    'attendance_day_settings', 'activities', 'activity_permissions', 'notifications',
    'assignment_letters', 'assignment_letter_teachers', 'assignment_letter_manual_executors',
    'official_travel_letters', 'official_travel_teachers', 'official_travel_followers',
    'surat_masuk', 'surat_keluar', 'disposisi_surat', 'cash_audits', 'cash_audit_sk_settings',
    'rkas_documents', 'rkas_items', 'spj_documents', 'spj_items', 'payment_receipts',
    'worker_payments', 'worker_payment_batches', 'worker_rates', 'gtt_ptt_honorariums',
    'extracurricular_types', 'extracurricular_instructors', 'extracurricular_honorariums',
    'tax_records', 'tax_types', 'polling_positions', 'polling_sessions', 'polling_candidates',
    'polling_votes', 'habit_journals', 'important_event_notes', 'student_achievements',
    'student_accounts', 'file_upload_requirements', 'kode_kegiatan_labels', 'kode_rekening_labels',
    'login_popup_notifications', 'travel_payment_rates', 'spd_pdf_settings',
    'sync_configurations', 'sync_logs', 'zapier_webhooks', 'verified_reports',
    'teacher_file_submissions', 'account_lock_settings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_update LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id)', tbl);
  END LOOP;
END $$;

-- Step 4: Create helper functions (using ::text cast to avoid enum commit issue)
CREATE OR REPLACE FUNCTION public.get_user_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role::text = 'super_admin'
  )
$$;

-- Step 5: Create auto-set school_id trigger function
CREATE OR REPLACE FUNCTION public.auto_set_school_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.school_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.school_id := public.get_user_school_id();
  END IF;
  RETURN NEW;
END;
$$;

-- Step 6: Create triggers, restrictive policies, and indexes on all tables
DO $$
DECLARE
  tbl TEXT;
  tables_with_school TEXT[] := ARRAY[
    'user_roles', 'students', 'teachers', 'classes', 'schedules', 'attendance',
    'grades', 'academic_years', 'school_settings', 'announcements', 'violation_types',
    'student_violations', 'teaching_journals', 'repository',
    'attendance_day_settings', 'activities', 'activity_permissions', 'notifications',
    'assignment_letters', 'assignment_letter_teachers', 'assignment_letter_manual_executors',
    'official_travel_letters', 'official_travel_teachers', 'official_travel_followers',
    'surat_masuk', 'surat_keluar', 'disposisi_surat', 'cash_audits', 'cash_audit_sk_settings',
    'rkas_documents', 'rkas_items', 'spj_documents', 'spj_items', 'payment_receipts',
    'worker_payments', 'worker_payment_batches', 'worker_rates', 'gtt_ptt_honorariums',
    'extracurricular_types', 'extracurricular_instructors', 'extracurricular_honorariums',
    'tax_records', 'tax_types', 'polling_positions', 'polling_sessions', 'polling_candidates',
    'polling_votes', 'habit_journals', 'important_event_notes', 'student_achievements',
    'student_accounts', 'file_upload_requirements', 'kode_kegiatan_labels', 'kode_rekening_labels',
    'login_popup_notifications', 'travel_payment_rates', 'spd_pdf_settings',
    'sync_configurations', 'sync_logs', 'zapier_webhooks', 'verified_reports',
    'teacher_file_submissions', 'account_lock_settings', 'complaints'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_with_school LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS auto_set_school_id_%I ON public.%I', tbl, tbl);
    EXECUTE format('
      CREATE TRIGGER auto_set_school_id_%I
      BEFORE INSERT ON public.%I
      FOR EACH ROW
      EXECUTE FUNCTION public.auto_set_school_id()', tbl, tbl);
    
    EXECUTE format('DROP POLICY IF EXISTS "school_isolation_%s" ON public.%I', tbl, tbl);
    EXECUTE format('
      CREATE POLICY "school_isolation_%s" ON public.%I
      AS RESTRICTIVE
      FOR ALL
      TO authenticated
      USING (school_id IS NULL OR school_id = public.get_user_school_id() OR public.is_super_admin())', tbl, tbl);
    
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_school_id ON public.%I(school_id)', tbl, tbl);
  END LOOP;
END $$;

-- Step 7: Schools table RLS policies
CREATE POLICY "Anyone can view active schools"
  ON public.schools FOR SELECT
  USING (is_active = true OR public.is_super_admin());

CREATE POLICY "Super admins can manage schools"
  ON public.schools FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "School admins can update their school"
  ON public.schools FOR UPDATE
  TO authenticated
  USING (id = public.get_user_school_id())
  WITH CHECK (id = public.get_user_school_id());

CREATE POLICY "Anon can insert schools for registration"
  ON public.schools FOR INSERT
  TO anon
  WITH CHECK (true);

-- Step 8: Timestamp trigger for schools
CREATE TRIGGER update_schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Step 9: Migrate existing data to default school
DO $$
DECLARE
  default_school_id UUID;
  school_name_val TEXT;
  school_addr TEXT;
  school_ph TEXT;
  tbl TEXT;
  all_tables TEXT[] := ARRAY[
    'user_roles', 'students', 'teachers', 'classes', 'schedules', 'attendance',
    'grades', 'academic_years', 'school_settings', 'announcements', 'violation_types',
    'student_violations', 'complaints', 'teaching_journals', 'repository',
    'attendance_day_settings', 'activities', 'activity_permissions', 'notifications',
    'assignment_letters', 'assignment_letter_teachers', 'assignment_letter_manual_executors',
    'official_travel_letters', 'official_travel_teachers', 'official_travel_followers',
    'surat_masuk', 'surat_keluar', 'disposisi_surat', 'cash_audits', 'cash_audit_sk_settings',
    'rkas_documents', 'rkas_items', 'spj_documents', 'spj_items', 'payment_receipts',
    'worker_payments', 'worker_payment_batches', 'worker_rates', 'gtt_ptt_honorariums',
    'extracurricular_types', 'extracurricular_instructors', 'extracurricular_honorariums',
    'tax_records', 'tax_types', 'polling_positions', 'polling_sessions', 'polling_candidates',
    'polling_votes', 'habit_journals', 'important_event_notes', 'student_achievements',
    'student_accounts', 'file_upload_requirements', 'kode_kegiatan_labels', 'kode_rekening_labels',
    'login_popup_notifications', 'travel_payment_rates', 'spd_pdf_settings',
    'sync_configurations', 'sync_logs', 'zapier_webhooks', 'verified_reports',
    'teacher_file_submissions', 'account_lock_settings'
  ];
BEGIN
  SELECT school_name, school_address, school_phone 
  INTO school_name_val, school_addr, school_ph
  FROM public.school_settings LIMIT 1;
  
  INSERT INTO public.schools (name, address, phone)
  VALUES (COALESCE(school_name_val, 'Sekolah Default'), school_addr, school_ph)
  RETURNING id INTO default_school_id;
  
  FOREACH tbl IN ARRAY all_tables LOOP
    EXECUTE format('UPDATE public.%I SET school_id = $1 WHERE school_id IS NULL', tbl) USING default_school_id;
  END LOOP;
END $$;
