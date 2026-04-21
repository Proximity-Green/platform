-- 025_tracking_codes.sql
-- Provider-agnostic tracking codes (a.k.a. tracking categories/options in Xero,
-- dimensions in MS Dynamics, departments/cost centres in Sage).
--
-- tracking_codes       — one row per code, scoped to a location.
--                        One row per (location, provider) may be flagged primary.
-- item_tracking_codes  — M:N junction from items to tracking_codes.
--
-- Snapshot on invoice_lines.accounting_tracking_codes (text[]) stays as-is —
-- historical invoices must not shift if a code is renamed/retired.

CREATE TABLE IF NOT EXISTS public.tracking_codes (
  id                               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at                       timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now(),

  location_id                      uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,

  provider                         text NOT NULL
    CHECK (provider IN ('xero','sage','msd','quickbooks')),

  category                         text,        -- dimension/category name e.g. "Region", "Department"
  code                             text NOT NULL, -- short identifier e.g. "WC", "OPS"
  name                             text NOT NULL, -- display label e.g. "Western Cape"

  -- Provider foreign keys (so we can post the correct IDs via API)
  accounting_external_category_id  text,
  accounting_external_option_id    text,

  is_primary                       boolean NOT NULL DEFAULT false,
  active                           boolean NOT NULL DEFAULT true,

  notes                            text
);

-- One primary per (location, provider)
CREATE UNIQUE INDEX IF NOT EXISTS tracking_codes_primary_key
  ON public.tracking_codes (location_id, provider)
  WHERE is_primary = true;

-- Uniqueness on the short code per (location, provider) so you don't double-up
CREATE UNIQUE INDEX IF NOT EXISTS tracking_codes_code_key
  ON public.tracking_codes (location_id, provider, code);

CREATE INDEX IF NOT EXISTS tracking_codes_location_idx ON public.tracking_codes (location_id);
CREATE INDEX IF NOT EXISTS tracking_codes_provider_idx ON public.tracking_codes (provider);
CREATE INDEX IF NOT EXISTS tracking_codes_active_idx   ON public.tracking_codes (active);

-- ---------------------------------------------------------------
-- Junction: item ↔ tracking_code (M:N)
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.item_tracking_codes (
  item_id            uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  tracking_code_id   uuid NOT NULL REFERENCES public.tracking_codes(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, tracking_code_id)
);

CREATE INDEX IF NOT EXISTS item_tracking_codes_item_idx ON public.item_tracking_codes (item_id);
CREATE INDEX IF NOT EXISTS item_tracking_codes_code_idx ON public.item_tracking_codes (tracking_code_id);

-- ---------------------------------------------------------------
-- Integrity: item's tracking codes must live at the item's location
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_item_tracking_code_location()
RETURNS trigger AS $$
DECLARE
  v_item_loc uuid;
  v_code_loc uuid;
BEGIN
  SELECT location_id INTO v_item_loc FROM public.items          WHERE id = NEW.item_id;
  SELECT location_id INTO v_code_loc FROM public.tracking_codes WHERE id = NEW.tracking_code_id;

  IF v_item_loc IS NOT NULL AND v_code_loc IS NOT NULL AND v_item_loc <> v_code_loc THEN
    RAISE EXCEPTION 'Tracking code % belongs to a different location than item %', NEW.tracking_code_id, NEW.item_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_item_tracking_code_location_trg ON public.item_tracking_codes;
CREATE TRIGGER enforce_item_tracking_code_location_trg
  BEFORE INSERT OR UPDATE ON public.item_tracking_codes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_item_tracking_code_location();

-- ---------------------------------------------------------------
-- Deprecate the legacy text[] column on items — leave in place for
-- transition; new code should read from item_tracking_codes. Drop
-- later in a follow-up once UI + sync logic has switched over.
-- ---------------------------------------------------------------
-- ALTER TABLE public.items DROP COLUMN IF EXISTS accounting_tracking_codes;

NOTIFY pgrst, 'reload schema';
