
-- Create attendance day settings table
-- Stores which days of the week are allowed for attendance entry
CREATE TABLE public.attendance_day_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  day_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(day_of_week)
);

-- Enable RLS
ALTER TABLE public.attendance_day_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read the settings
CREATE POLICY "Anyone authenticated can view attendance day settings"
  ON public.attendance_day_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admin and kesiswaan can modify
CREATE POLICY "Admin and kesiswaan can update attendance day settings"
  ON public.attendance_day_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'kesiswaan')
    )
  );

-- Insert default days (0=Sunday through 6=Saturday)
-- Monday-Friday active, Saturday-Sunday inactive
INSERT INTO public.attendance_day_settings (day_of_week, day_name, is_active) VALUES
  (0, 'Minggu', false),
  (1, 'Senin', true),
  (2, 'Selasa', true),
  (3, 'Rabu', true),
  (4, 'Kamis', true),
  (5, 'Jumat', true),
  (6, 'Sabtu', false);

-- Trigger for updated_at
CREATE TRIGGER update_attendance_day_settings_updated_at
  BEFORE UPDATE ON public.attendance_day_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
