-- Create notifications table for homeroom teachers
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  student_id UUID NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'absence_alert',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_teacher FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_student FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy for homeroom teachers to view their notifications
CREATE POLICY "Teachers can view their own notifications"
ON public.notifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.teachers t
    WHERE t.id = notifications.teacher_id
    AND t.user_id = auth.uid()
  )
);

-- Policy for teachers to update their own notifications (mark as read)
CREATE POLICY "Teachers can update their own notifications"
ON public.notifications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.teachers t
    WHERE t.id = notifications.teacher_id
    AND t.user_id = auth.uid()
  )
);

-- Create index for better performance
CREATE INDEX idx_notifications_teacher_unread ON public.notifications(teacher_id, is_read, created_at DESC);

-- Function to check consecutive absences and create notification
CREATE OR REPLACE FUNCTION public.check_consecutive_absences()
RETURNS TRIGGER AS $$
DECLARE
  consecutive_count INTEGER;
  homeroom_teacher_id UUID;
  student_name TEXT;
  existing_notification_count INTEGER;
BEGIN
  -- Only check for absent statuses (sakit, izin, alpa)
  IF NEW.status IN ('sakit', 'izin', 'alpa') THEN
    -- Count consecutive absences for this student
    SELECT COUNT(*) INTO consecutive_count
    FROM public.attendance
    WHERE student_id = NEW.student_id
    AND status IN ('sakit', 'izin', 'alpa')
    AND date >= NEW.date - INTERVAL '2 days'
    AND date <= NEW.date
    ORDER BY date DESC;
    
    -- If 3 or more consecutive absences
    IF consecutive_count >= 3 THEN
      -- Get homeroom teacher and student name
      SELECT c.homeroom_teacher_id, s.full_name
      INTO homeroom_teacher_id, student_name
      FROM public.students s
      JOIN public.classes c ON s.class_id = c.id
      WHERE s.id = NEW.student_id;
      
      -- Check if notification already exists for today
      SELECT COUNT(*) INTO existing_notification_count
      FROM public.notifications
      WHERE teacher_id = homeroom_teacher_id
      AND student_id = NEW.student_id
      AND type = 'absence_alert'
      AND DATE(created_at) = CURRENT_DATE;
      
      -- Create notification if homeroom teacher exists and no notification today
      IF homeroom_teacher_id IS NOT NULL AND existing_notification_count = 0 THEN
        INSERT INTO public.notifications (teacher_id, student_id, message, type)
        VALUES (
          homeroom_teacher_id,
          NEW.student_id,
          student_name || ' telah tidak hadir selama 3 hari berturut-turut',
          'absence_alert'
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on attendance insert
DROP TRIGGER IF EXISTS trigger_check_consecutive_absences ON public.attendance;
CREATE TRIGGER trigger_check_consecutive_absences
AFTER INSERT ON public.attendance
FOR EACH ROW
EXECUTE FUNCTION public.check_consecutive_absences();

-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;