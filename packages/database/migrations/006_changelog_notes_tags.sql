-- ============================================
-- CHANGE LOG (replaces simple audit_log)
-- ============================================

-- Drop the old audit_log and create a proper change_log
DROP TABLE IF EXISTS public.audit_log;

CREATE TABLE public.change_log (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  table_name  text NOT NULL,
  record_id   uuid NOT NULL,
  action      text NOT NULL,
  changed_by  uuid REFERENCES auth.users(id),
  old_values  jsonb,
  new_values  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'RESTORE'))
);

CREATE INDEX idx_change_log_table ON public.change_log(table_name);
CREATE INDEX idx_change_log_record ON public.change_log(table_name, record_id);
CREATE INDEX idx_change_log_created ON public.change_log(created_at DESC);
CREATE INDEX idx_change_log_user ON public.change_log(changed_by);

-- Automatic audit trigger function
-- Captures old/new values as JSONB for field-level diffing
CREATE OR REPLACE FUNCTION public.change_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
  _changed_by uuid;
BEGIN
  -- Try to get the current auth user, fall back to null for service role operations
  BEGIN
    _changed_by := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    _changed_by := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.change_log (table_name, record_id, action, changed_by, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', _changed_by, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log if something actually changed
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO public.change_log (table_name, record_id, action, changed_by, old_values, new_values)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', _changed_by, to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.change_log (table_name, record_id, action, changed_by, old_values)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', _changed_by, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply triggers to all domain tables
CREATE TRIGGER changelog_persons AFTER INSERT OR UPDATE OR DELETE ON public.persons FOR EACH ROW EXECUTE FUNCTION public.change_log_trigger();
CREATE TRIGGER changelog_organisations AFTER INSERT OR UPDATE OR DELETE ON public.organisations FOR EACH ROW EXECUTE FUNCTION public.change_log_trigger();
CREATE TRIGGER changelog_locations AFTER INSERT OR UPDATE OR DELETE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.change_log_trigger();
CREATE TRIGGER changelog_legal_entities AFTER INSERT OR UPDATE OR DELETE ON public.legal_entities FOR EACH ROW EXECUTE FUNCTION public.change_log_trigger();
CREATE TRIGGER changelog_roles AFTER INSERT OR UPDATE OR DELETE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.change_log_trigger();
CREATE TRIGGER changelog_permissions AFTER INSERT OR UPDATE OR DELETE ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.change_log_trigger();
CREATE TRIGGER changelog_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.change_log_trigger();

-- ============================================
-- NOTES (polymorphic, with @mentions)
-- ============================================
CREATE TABLE public.notes (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  content     text NOT NULL,
  mentions    uuid[] DEFAULT '{}',
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_entity ON public.notes(entity_type, entity_id);
CREATE INDEX idx_notes_created ON public.notes(created_at DESC);

-- ============================================
-- TAGS (polymorphic, reusable across entities)
-- ============================================
CREATE TABLE public.tags (
  id         uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  color      text NOT NULL DEFAULT '#2d6a35',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tags_name ON public.tags(name);

CREATE TABLE public.tag_assignments (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  tag_id      uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, tag_id)
);

CREATE INDEX idx_tag_assignments_entity ON public.tag_assignments(entity_type, entity_id);
CREATE INDEX idx_tag_assignments_tag ON public.tag_assignments(tag_id);

-- Apply changelog triggers to new tables too
CREATE TRIGGER changelog_notes AFTER INSERT OR UPDATE OR DELETE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.change_log_trigger();
CREATE TRIGGER changelog_tags AFTER INSERT OR UPDATE OR DELETE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.change_log_trigger();
CREATE TRIGGER changelog_tag_assignments AFTER INSERT OR UPDATE OR DELETE ON public.tag_assignments FOR EACH ROW EXECUTE FUNCTION public.change_log_trigger();
