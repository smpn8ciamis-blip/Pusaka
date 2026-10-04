-- Add public SELECT policy for teachers table (for public NIP lookup)
CREATE POLICY "Public can view teachers for lookup" 
ON public.teachers 
FOR SELECT 
USING (true);

-- Add public SELECT policy for profiles table (for public lookup)
CREATE POLICY "Public can view profiles for lookup" 
ON public.profiles 
FOR SELECT 
USING (true);

-- Add public SELECT policy for file_upload_requirements (for public page)
CREATE POLICY "Public can view active file requirements" 
ON public.file_upload_requirements 
FOR SELECT 
USING (is_active = true);

-- Add public INSERT policy for teacher_file_submissions (for public upload)
CREATE POLICY "Public can submit files" 
ON public.teacher_file_submissions 
FOR INSERT 
WITH CHECK (true);

-- Add public SELECT policy for teacher_file_submissions (for checking own submissions by teacher_id)
CREATE POLICY "Public can view submissions by teacher" 
ON public.teacher_file_submissions 
FOR SELECT 
USING (true);

-- Add public UPDATE policy for teacher_file_submissions (for re-uploading)
CREATE POLICY "Public can update own submissions" 
ON public.teacher_file_submissions 
FOR UPDATE 
USING (true);