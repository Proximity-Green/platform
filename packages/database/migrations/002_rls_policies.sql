-- Enable RLS on all tables
ALTER TABLE public.persons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log     ENABLE ROW LEVEL SECURITY;

-- Persons: members see themselves, admins see all
CREATE POLICY "persons_self_read" ON public.persons
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "persons_admin_all" ON public.persons
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.name IN ('admin', 'super_admin')
    )
  );

-- Organisations: authenticated users can read
CREATE POLICY "orgs_read_authenticated" ON public.organisations
  FOR SELECT USING (auth.role() = 'authenticated');

-- Locations: authenticated users can read
CREATE POLICY "locations_read_authenticated" ON public.locations
  FOR SELECT USING (auth.role() = 'authenticated');

-- AuditLog: admins read only
CREATE POLICY "audit_admin_read" ON public.audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.name IN ('admin', 'super_admin', 'finance')
    )
  );
