
-- Allow public (anonymous) read access to Nedelcis Hub
GRANT SELECT ON public.nedelcis_hub_settings TO anon;
GRANT SELECT ON public.nedelcis_hub_buttons TO anon;

CREATE POLICY "Public can view hub settings"
ON public.nedelcis_hub_settings
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Public can view hub buttons"
ON public.nedelcis_hub_buttons
FOR SELECT
TO anon
USING (true);
