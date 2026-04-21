-- 027_tracking_codes_drop_provider.sql
-- Drop the hardcoded `provider` column from tracking_codes. Provider is
-- implicit — each location has exactly one active accounting provider
-- (via locations.accounting_external_tenant_id → organisation_accounting_customers),
-- so tagging every tracking code with a provider name is redundant and
-- violates the provider-agnostic rule.
--
-- Uniqueness collapses from (location_id, provider, ...) → (location_id, ...).

-- Drop dependent indexes first
DROP INDEX IF EXISTS public.tracking_codes_primary_key;
DROP INDEX IF EXISTS public.tracking_codes_code_key;
DROP INDEX IF EXISTS public.tracking_codes_provider_idx;

ALTER TABLE public.tracking_codes
  DROP COLUMN IF EXISTS provider;

-- Recreate uniqueness without provider
CREATE UNIQUE INDEX IF NOT EXISTS tracking_codes_primary_key
  ON public.tracking_codes (location_id)
  WHERE is_primary = true;

CREATE UNIQUE INDEX IF NOT EXISTS tracking_codes_code_key
  ON public.tracking_codes (location_id, code);

NOTIFY pgrst, 'reload schema';
