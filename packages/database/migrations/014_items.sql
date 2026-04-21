-- 014_items.sql
-- Unified catalog — merges WSM products + memberships + adjustment categories.
-- One row per sellable thing. item_type_id drives the sellability policy via triggers.

CREATE TABLE IF NOT EXISTS public.items (
  id                              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  wsm_id                          text,  -- original Mongo ObjectId for migration audit

  item_type_id                    uuid NOT NULL REFERENCES public.item_types(id),
  location_id                     uuid REFERENCES public.locations(id),

  name                            text NOT NULL,
  description                     text,
  sku                             text,  -- short code e.g. "COKE-330"

  -- Commercial defaults
  base_price                      numeric(12,2),
  -- currency sits on locations.currency; derived via location_id

  -- Accounting (definitional — what goes to the accounting provider)
  accounting_gl_code              text,
  accounting_item_code            text,
  accounting_tax_code             text,
  accounting_tax_percentage       numeric(5,2),
  accounting_tracking_codes       text[],
  accounting_description          text,   -- override if the invoice line text differs from name

  -- Flags (source of truth is item_type; these allow per-item overrides if ever needed)
  active                          boolean NOT NULL DEFAULT true,

  metadata                        jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS items_wsm_id_key ON public.items (wsm_id) WHERE wsm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS items_type_idx     ON public.items (item_type_id);
CREATE INDEX IF NOT EXISTS items_location_idx ON public.items (location_id);
CREATE INDEX IF NOT EXISTS items_active_idx   ON public.items (active);
CREATE INDEX IF NOT EXISTS items_sku_idx      ON public.items (sku) WHERE sku IS NOT NULL;

NOTIFY pgrst, 'reload schema';
