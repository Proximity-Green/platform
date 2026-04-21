-- 024_organisation_accounting_customers.sql
-- Per-tenant customer identity. A single org can exist in multiple accounting tenants
-- (Xero SA, Xero MU, Sage MU), each with its own customer ID + code.
-- Real data confirms 7 distinct xero_tenant_ids across 23 locations → multi-tenant is real.

CREATE TABLE IF NOT EXISTS public.organisation_accounting_customers (
  id                                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at                         timestamptz NOT NULL DEFAULT now(),
  updated_at                         timestamptz NOT NULL DEFAULT now(),

  organisation_id                    uuid NOT NULL REFERENCES public.organisations(id),
  provider                           text NOT NULL CHECK (provider IN ('xero','sage','msd','quickbooks')),
  accounting_external_tenant_id      text NOT NULL,    -- e.g. Xero tenant GUID

  accounting_external_customer_id    text NOT NULL,    -- the customer ID in that tenant
  accounting_external_customer_code  text,             -- human-readable ref (e.g. CUST-1234)

  is_primary                         boolean NOT NULL DEFAULT false,

  connected_at                       timestamptz NOT NULL DEFAULT now(),
  disconnected_at                    timestamptz,

  credentials                        jsonb,            -- encrypted OAuth tokens / API keys
  metadata                           jsonb,

  UNIQUE (organisation_id, provider, accounting_external_tenant_id)
);

CREATE INDEX IF NOT EXISTS org_accounting_customers_org_idx
  ON public.organisation_accounting_customers (organisation_id);

CREATE INDEX IF NOT EXISTS org_accounting_customers_tenant_idx
  ON public.organisation_accounting_customers (accounting_external_tenant_id);

-- Exactly one primary per org
CREATE UNIQUE INDEX IF NOT EXISTS org_accounting_customers_primary_key
  ON public.organisation_accounting_customers (organisation_id)
  WHERE is_primary = true;

NOTIFY pgrst, 'reload schema';
