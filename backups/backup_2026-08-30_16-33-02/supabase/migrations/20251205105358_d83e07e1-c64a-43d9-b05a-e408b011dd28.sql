-- Add permissive SELECT policy for Bendahara on rkas_documents
CREATE POLICY "Bendahara can view rkas documents for statistics" 
ON public.rkas_documents 
FOR SELECT 
USING (has_role(auth.uid(), 'bendahara'::app_role));

-- Add permissive SELECT policy for Bendahara on rkas_items (if needed)
CREATE POLICY "Bendahara can view rkas items for statistics" 
ON public.rkas_items 
FOR SELECT 
USING (has_role(auth.uid(), 'bendahara'::app_role));