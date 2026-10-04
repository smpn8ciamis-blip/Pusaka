
-- Create a function to convert names to title case while preserving academic titles
CREATE OR REPLACE FUNCTION public.to_title_case(name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  result TEXT := '';
  word TEXT;
  words TEXT[];
  parts TEXT[];
  processed_parts TEXT[];
  part TEXT;
  lower_word TEXT;
  title_output TEXT;
BEGIN
  IF name IS NULL OR name = '' THEN
    RETURN '';
  END IF;

  -- Split by comma first
  parts := string_to_array(name, ',');
  processed_parts := ARRAY[]::TEXT[];

  FOREACH part IN ARRAY parts LOOP
    -- Trim the part
    part := trim(part);
    words := string_to_array(part, ' ');
    result := '';

    FOREACH word IN ARRAY words LOOP
      IF word = '' THEN
        CONTINUE;
      END IF;

      lower_word := lower(word);
      title_output := NULL;

      -- Check for academic titles (Indonesian)
      CASE lower_word
        -- Prefix titles
        WHEN 'prof', 'prof.' THEN title_output := 'Prof.';
        WHEN 'dr', 'dr.' THEN title_output := 'Dr.';
        WHEN 'drs', 'drs.' THEN title_output := 'Drs.';
        WHEN 'dra', 'dra.' THEN title_output := 'Dra.';
        WHEN 'ir', 'ir.' THEN title_output := 'Ir.';
        WHEN 'h', 'h.' THEN title_output := 'H.';
        WHEN 'hj', 'hj.' THEN title_output := 'Hj.';
        WHEN 'kh', 'kh.' THEN title_output := 'KH.';
        WHEN 'ns', 'ns.' THEN title_output := 'Ns.';
        WHEN 'apt', 'apt.' THEN title_output := 'Apt.';
        -- Bachelor degrees
        WHEN 's.pd', 's.pd.' THEN title_output := 'S.Pd.';
        WHEN 's.kom', 's.kom.' THEN title_output := 'S.Kom.';
        WHEN 's.e', 's.e.' THEN title_output := 'S.E.';
        WHEN 's.h', 's.h.' THEN title_output := 'S.H.';
        WHEN 's.t', 's.t.' THEN title_output := 'S.T.';
        WHEN 's.si', 's.si.' THEN title_output := 'S.Si.';
        WHEN 's.sos', 's.sos.' THEN title_output := 'S.Sos.';
        WHEN 's.ag', 's.ag.' THEN title_output := 'S.Ag.';
        WHEN 's.ip', 's.ip.' THEN title_output := 'S.IP.';
        WHEN 's.ked', 's.ked.' THEN title_output := 'S.Ked.';
        WHEN 's.kep', 's.kep.' THEN title_output := 'S.Kep.';
        WHEN 's.farm', 's.farm.' THEN title_output := 'S.Farm.';
        WHEN 's.psi', 's.psi.' THEN title_output := 'S.Psi.';
        WHEN 's.sn', 's.sn.' THEN title_output := 'S.Sn.';
        WHEN 's.hum', 's.hum.' THEN title_output := 'S.Hum.';
        WHEN 's.i.kom', 's.i.kom.' THEN title_output := 'S.I.Kom.';
        WHEN 'se', 'se.' THEN title_output := 'S.E.';
        WHEN 'sh', 'sh.' THEN title_output := 'S.H.';
        WHEN 'st', 'st.' THEN title_output := 'S.T.';
        -- Master degrees
        WHEN 'm.pd', 'm.pd.' THEN title_output := 'M.Pd.';
        WHEN 'm.kom', 'm.kom.' THEN title_output := 'M.Kom.';
        WHEN 'm.m', 'm.m.' THEN title_output := 'M.M.';
        WHEN 'm.si', 'm.si.' THEN title_output := 'M.Si.';
        WHEN 'm.h', 'm.h.' THEN title_output := 'M.H.';
        WHEN 'm.t', 'm.t.' THEN title_output := 'M.T.';
        WHEN 'm.sc', 'm.sc.' THEN title_output := 'M.Sc.';
        WHEN 'm.a', 'm.a.' THEN title_output := 'M.A.';
        WHEN 'm.kes', 'm.kes.' THEN title_output := 'M.Kes.';
        WHEN 'm.hum', 'm.hum.' THEN title_output := 'M.Hum.';
        WHEN 'm.ag', 'm.ag.' THEN title_output := 'M.Ag.';
        WHEN 'm.sn', 'm.sn.' THEN title_output := 'M.Sn.';
        WHEN 'm.psi', 'm.psi.' THEN title_output := 'M.Psi.';
        WHEN 'mm', 'mm.' THEN title_output := 'M.M.';
        WHEN 'mba', 'm.b.a', 'm.b.a.' THEN title_output := 'MBA';
        -- Doctoral
        WHEN 'ph.d', 'ph.d.', 'phd' THEN title_output := 'Ph.D.';
        WHEN 'b.sc', 'b.sc.' THEN title_output := 'B.Sc.';
        WHEN 'ners' THEN title_output := 'Ners';
        ELSE title_output := NULL;
      END CASE;

      IF title_output IS NOT NULL THEN
        IF result = '' THEN
          result := title_output;
        ELSE
          result := result || ' ' || title_output;
        END IF;
      ELSE
        -- Regular name word - convert to title case
        IF result = '' THEN
          result := initcap(word);
        ELSE
          result := result || ' ' || initcap(word);
        END IF;
      END IF;
    END LOOP;

    processed_parts := array_append(processed_parts, result);
  END LOOP;

  RETURN array_to_string(processed_parts, ', ');
END;
$$;

-- Update student names to title case
UPDATE public.students
SET full_name = public.to_title_case(full_name)
WHERE full_name IS NOT NULL AND full_name != '';

-- Update teacher/staff names in profiles table (for users linked to teachers)
UPDATE public.profiles
SET full_name = public.to_title_case(full_name)
WHERE full_name IS NOT NULL AND full_name != '';

-- Update extracurricular instructor names
UPDATE public.extracurricular_instructors
SET name = public.to_title_case(name)
WHERE name IS NOT NULL AND name != '';

-- Update manual executor names in assignment letters
UPDATE public.assignment_letter_manual_executors
SET full_name = public.to_title_case(full_name)
WHERE full_name IS NOT NULL AND full_name != '';

-- Update manual executor names in official travel followers
UPDATE public.official_travel_followers
SET manual_executor_name = public.to_title_case(manual_executor_name)
WHERE manual_executor_name IS NOT NULL AND manual_executor_name != '';
