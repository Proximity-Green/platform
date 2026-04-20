-- Fix: admin RLS policies checked if ANY admin role existed in the roles
-- table, not whether the current user actually had that role. Any
-- authenticated user could read/write every persons row.
--
-- Also enables RLS + admin-read policy on change_log (the audit_log
-- replacement introduced in migration 006 was left without RLS).

CREATE OR REPLACE FUNCTION public.has_role(role_names text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name = ANY(role_names)
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(text[]) TO authenticated;

DROP POLICY IF EXISTS "persons_admin_all" ON public.persons;

CREATE POLICY "persons_admin_all" ON public.persons
  FOR ALL USING (public.has_role(ARRAY['admin', 'super_admin']));

ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "change_log_admin_read" ON public.change_log;

CREATE POLICY "change_log_admin_read" ON public.change_log
  FOR SELECT USING (public.has_role(ARRAY['admin', 'super_admin', 'finance']));
