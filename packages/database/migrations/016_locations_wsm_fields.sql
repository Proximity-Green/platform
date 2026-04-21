-- 016_locations_wsm_fields.sql
-- Extend locations with WSM-derived fields.
-- Currency lives here (NOT on orgs). accounting_external_tenant_id enables multi-tenant providers.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS wsm_id                             text,
  ADD COLUMN IF NOT EXISTS short_name                         text,
  ADD COLUMN IF NOT EXISTS description                        text,

  -- Address
  ADD COLUMN IF NOT EXISTS address_line_1                     text,
  ADD COLUMN IF NOT EXISTS address_line_2                     text,
  ADD COLUMN IF NOT EXISTS suburb                             text,
  ADD COLUMN IF NOT EXISTS city                               text,
  ADD COLUMN IF NOT EXISTS postal_code                        text,
  ADD COLUMN IF NOT EXISTS country_code                       text,

  -- Geo
  ADD COLUMN IF NOT EXISTS latitude                           numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude                          numeric(9,6),

  -- Contact
  ADD COLUMN IF NOT EXISTS email                              text,
  ADD COLUMN IF NOT EXISTS phone                              text,
  ADD COLUMN IF NOT EXISTS website                            text,

  -- Currency & commercial
  ADD COLUMN IF NOT EXISTS currency                           text NOT NULL DEFAULT 'ZAR',

  -- Branding
  ADD COLUMN IF NOT EXISTS logo_url                           text,
  ADD COLUMN IF NOT EXISTS hero_image_url                     text,
  ADD COLUMN IF NOT EXISTS map_image_url                      text,
  ADD COLUMN IF NOT EXISTS map_link                           text,
  ADD COLUMN IF NOT EXISTS background_colour                  text,

  -- Operations
  ADD COLUMN IF NOT EXISTS access_instructions                text,
  ADD COLUMN IF NOT EXISTS community_manager_person_id        uuid REFERENCES public.persons(id),
  ADD COLUMN IF NOT EXISTS banking_account_number             text,
  ADD COLUMN IF NOT EXISTS banking_bank_code                  text,

  -- Accounting (per-location tenant enables multi-tenant providers)
  ADD COLUMN IF NOT EXISTS accounting_external_tenant_id      text,
  ADD COLUMN IF NOT EXISTS accounting_gl_code                 text,
  ADD COLUMN IF NOT EXISTS accounting_item_code               text,
  ADD COLUMN IF NOT EXISTS accounting_tax_code                text,
  ADD COLUMN IF NOT EXISTS accounting_tracking_code           text,
  ADD COLUMN IF NOT EXISTS accounting_tracking_name           text,
  ADD COLUMN IF NOT EXISTS accounting_stationery_id           text,
  ADD COLUMN IF NOT EXISTS accounting_branding_theme          text,
  ADD COLUMN IF NOT EXISTS accounting_tax_type                text,

  -- Commercial
  ADD COLUMN IF NOT EXISTS commercial_tax_percentage          numeric(5,2),
  ADD COLUMN IF NOT EXISTS commercial_app_discount_percentage numeric(5,2),

  -- Lifecycle
  ADD COLUMN IF NOT EXISTS headquarters                       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS started_at                         timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at                          timestamptz,

  ADD COLUMN IF NOT EXISTS created_at                         timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at                         timestamptz NOT NULL DEFAULT now();

-- Extend existing status check to include lifecycle values
ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS locations_status_check;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_status_check
  CHECK (status IN ('active','paused','closed','planned','inactive'));

CREATE UNIQUE INDEX IF NOT EXISTS locations_wsm_id_key     ON public.locations (wsm_id) WHERE wsm_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS locations_short_name_key ON public.locations (short_name) WHERE short_name IS NOT NULL;
CREATE INDEX        IF NOT EXISTS locations_status_idx     ON public.locations (status);
CREATE INDEX        IF NOT EXISTS locations_headquarters_idx ON public.locations (headquarters);

NOTIFY pgrst, 'reload schema';
