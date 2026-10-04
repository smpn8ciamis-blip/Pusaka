-- Fix critical security issues identified in security scan

-- 1. Drop existing public school_settings policies and create restricted view
DROP POLICY IF EXISTS "Public can view basic school info" ON public.school_settings;
DROP POLICY IF EXISTS "Admins can view all school settings" ON public.school_settings;
DROP POLICY IF EXISTS "Admins can manage school settings" ON public.school_settings;

-- Only admins can view and manage full school settings
CREATE POLICY "Admins can view all school settings"
ON public.school_settings
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage school settings"
ON public.school_settings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create/recreate public view with only safe fields (no contact info, no signatures)
DROP VIEW IF EXISTS public.school_settings_public CASCADE;

CREATE VIEW public.school_settings_public AS
SELECT 
  id,
  school_name,
  district_name,
  logo_url,
  right_logo_url,
  app_name,
  academic_year,
  active_semester,
  show_address,
  show_phone
FROM public.school_settings;

-- Anyone can view the safe public view
GRANT SELECT ON public.school_settings_public TO anon, authenticated;

-- 2. Fix verified_reports - require authentication for viewing
DROP POLICY IF EXISTS "Anyone can view reports for verification" ON public.verified_reports;
DROP POLICY IF EXISTS "Authenticated users can create reports" ON public.verified_reports;

-- Only authenticated users can view their own reports
CREATE POLICY "Users can view their own reports"
ON public.verified_reports
FOR SELECT
TO authenticated
USING (auth.uid() = created_by AND expires_at > now());

-- Admins can view all reports
CREATE POLICY "Admins can view all reports"
ON public.verified_reports
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can create reports
CREATE POLICY "Authenticated users can create reports"
ON public.verified_reports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- 3. Fix activity_permissions - require authentication
DROP POLICY IF EXISTS "Anyone can create permissions" ON public.activity_permissions;
DROP POLICY IF EXISTS "Anyone can update permissions" ON public.activity_permissions;
DROP POLICY IF EXISTS "Anyone can view permissions" ON public.activity_permissions;
DROP POLICY IF EXISTS "Admins can view all permissions" ON public.activity_permissions;

-- Only authenticated admins can view all permissions
CREATE POLICY "Admins can view all permissions"
ON public.activity_permissions
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can create permissions (for parent portal)
CREATE POLICY "Authenticated users can create permissions"
ON public.activity_permissions
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Authenticated users can update permissions (for parent responses)
CREATE POLICY "Authenticated users can update permissions"
ON public.activity_permissions
FOR UPDATE
TO authenticated
USING (true);

-- 4. Fix complaints - require proper authentication for viewing
DROP POLICY IF EXISTS "Anyone can view complaint with tracking number" ON public.complaints;
DROP POLICY IF EXISTS "Anyone can submit complaints" ON public.complaints;
DROP POLICY IF EXISTS "Admins can view all complaints" ON public.complaints;
DROP POLICY IF EXISTS "Admins can update complaints" ON public.complaints;
DROP POLICY IF EXISTS "Admins can delete complaints" ON public.complaints;

-- Anyone can submit complaints (public form)
CREATE POLICY "Anyone can submit complaints"
ON public.complaints
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can view all complaints
CREATE POLICY "Admins can view all complaints"
ON public.complaints
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update complaints
CREATE POLICY "Admins can update complaints"
ON public.complaints
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete complaints
CREATE POLICY "Admins can delete complaints"
ON public.complaints
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Fix announcements - hide created_by from public, recreate policies
DROP POLICY IF EXISTS "Everyone can view active announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;

-- Everyone can view active announcements (but we'll filter created_by in queries)
CREATE POLICY "Everyone can view active announcements"
ON public.announcements
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Admins can manage announcements
CREATE POLICY "Admins can manage announcements"
ON public.announcements
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));