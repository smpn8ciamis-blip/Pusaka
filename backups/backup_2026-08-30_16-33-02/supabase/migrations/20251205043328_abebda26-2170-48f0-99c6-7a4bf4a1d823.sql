-- Step 1: Add 'bendahara' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bendahara';