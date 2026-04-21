-- ============================================
-- WSM → PG migration: extend `persons` with the critical fields
-- agreed during the 2026-04-21 review. Naming follows the project
-- convention (snake_case, <verb>_at for all timestamps, no _date,
-- provider-agnostic external IDs).
-- ============================================

ALTER TABLE public.persons
  -- Identity
  ADD COLUMN IF NOT EXISTS id_number                          text,
  ADD COLUMN IF NOT EXISTS wsm_id                             text,

  -- Affiliation (lightweight — billing comes from licences)
  ADD COLUMN IF NOT EXISTS organisation_id                    uuid REFERENCES public.organisations(id),
  ADD COLUMN IF NOT EXISTS department                         text,

  -- Lifecycle
  ADD COLUMN IF NOT EXISTS status                             text NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS started_at                         timestamptz,
  ADD COLUMN IF NOT EXISTS onboarded_at                       timestamptz,
  ADD COLUMN IF NOT EXISTS offboarded_at                      timestamptz,

  -- Finance link (provider-agnostic)
  ADD COLUMN IF NOT EXISTS external_accounting_customer_id    text;

-- Constrain status values
ALTER TABLE public.persons
  DROP CONSTRAINT IF EXISTS persons_status_check;
ALTER TABLE public.persons
  ADD CONSTRAINT persons_status_check
  CHECK (status IN ('active', 'inactive', 'offboarded'));

-- Indexes for the lookup / filter columns
CREATE INDEX IF NOT EXISTS idx_persons_wsm_id          ON public.persons(wsm_id);
CREATE INDEX IF NOT EXISTS idx_persons_organisation_id ON public.persons(organisation_id);
CREATE INDEX IF NOT EXISTS idx_persons_status          ON public.persons(status);
CREATE INDEX IF NOT EXISTS idx_persons_external_accounting_customer_id
  ON public.persons(external_accounting_customer_id);
