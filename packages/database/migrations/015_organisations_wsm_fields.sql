-- 015_organisations_wsm_fields.sql
-- Extend organisations with WSM-derived fields.
-- Identity fields are plain (legal_name, vat_number, company_registration_number).
-- accounting_* = billing/identity fields that go on invoices.
-- delivery_* = where couriers/people show up.
-- No commercial fields on org — those live in subscription_line_rules.
-- No currency on org — sits on locations.

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS wsm_id                           text,
  ADD COLUMN IF NOT EXISTS legal_name                       text,
  ADD COLUMN IF NOT EXISTS short_name                       text,
  ADD COLUMN IF NOT EXISTS company_registration_number      text,
  ADD COLUMN IF NOT EXISTS vat_number                       text,
  ADD COLUMN IF NOT EXISTS logo_url                         text,
  ADD COLUMN IF NOT EXISTS about                            text,
  ADD COLUMN IF NOT EXISTS industry                         text,
  ADD COLUMN IF NOT EXISTS type                             text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS parent_organisation_id           uuid REFERENCES public.organisations(id),

  -- Contact
  ADD COLUMN IF NOT EXISTS email                            text,
  ADD COLUMN IF NOT EXISTS phone                            text,
  ADD COLUMN IF NOT EXISTS mobile                           text,
  ADD COLUMN IF NOT EXISTS website                          text,

  -- Accounting (billing identity — goes on invoices)
  ADD COLUMN IF NOT EXISTS accounting_email                 text,
  ADD COLUMN IF NOT EXISTS accounting_address_line_1        text,
  ADD COLUMN IF NOT EXISTS accounting_address_line_2        text,
  ADD COLUMN IF NOT EXISTS accounting_city                  text,
  ADD COLUMN IF NOT EXISTS accounting_postal_code           text,
  ADD COLUMN IF NOT EXISTS accounting_country_code          text,

  -- Delivery (where couriers / people show up)
  ADD COLUMN IF NOT EXISTS delivery_address_line_1          text,
  ADD COLUMN IF NOT EXISTS delivery_address_line_2          text,
  ADD COLUMN IF NOT EXISTS delivery_city                    text,
  ADD COLUMN IF NOT EXISTS delivery_postal_code             text,
  ADD COLUMN IF NOT EXISTS delivery_country_code            text,

  -- Lifecycle
  ADD COLUMN IF NOT EXISTS status                           text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS started_at                       timestamptz,
  ADD COLUMN IF NOT EXISTS onboarded_at                     timestamptz,
  ADD COLUMN IF NOT EXISTS offboarded_at                    timestamptz,

  -- Stakeholders
  ADD COLUMN IF NOT EXISTS signatory_person_id              uuid REFERENCES public.persons(id),

  ADD COLUMN IF NOT EXISTS updated_at                       timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.organisations
  DROP CONSTRAINT IF EXISTS organisations_status_check;
ALTER TABLE public.organisations
  ADD  CONSTRAINT organisations_status_check
    CHECK (status IN ('prospect','active','paused','offboarded','inactive'));

ALTER TABLE public.organisations
  DROP CONSTRAINT IF EXISTS organisations_type_check;
ALTER TABLE public.organisations
  ADD  CONSTRAINT organisations_type_check
    CHECK (type IN ('member','prospect','supplier','partner','internal'));

CREATE UNIQUE INDEX IF NOT EXISTS organisations_short_name_key
  ON public.organisations (short_name) WHERE short_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organisations_wsm_id_key
  ON public.organisations (wsm_id) WHERE wsm_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS organisations_status_idx ON public.organisations (status);
CREATE INDEX IF NOT EXISTS organisations_type_idx   ON public.organisations (type);
CREATE INDEX IF NOT EXISTS organisations_parent_idx ON public.organisations (parent_organisation_id);

NOTIFY pgrst, 'reload schema';
