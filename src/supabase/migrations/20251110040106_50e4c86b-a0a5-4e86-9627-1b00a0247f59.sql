-- Fix the check_consecutive_absences function
-- Remove ORDER BY clause from COUNT query as it's not needed and causes GROUP BY error
CREATE OR REPLACE FUNCTION public.check_consecutive_absences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  consecutive_count INTEGER;
  homeroom_teacher_id UUID;
  student_name TEXT;
  existing_notification_count INTEGER;
BEGIN
  -- Only check for absent statuses (sakit, izin, alpa)
  IF NEW.status IN ('sakit', 'izin', 'alpa') THEN
    -- Count consecutive absences for this student (removed ORDER BY that caused error)
    SELECT COUNT(*) INTO consecutive_count
    FROM public.attendance
    WHERE student_id = NEW.student_id
    AND status IN ('sakit', 'izin', 'alpa')
    AND date >= NEW.date - INTERVAL '2 days'
    AND date <= NEW.date;
    
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
$function$;