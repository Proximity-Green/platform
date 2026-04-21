-- 018_subscription_lines.sql
-- Mini-contracts. Every recurring billable thing has exactly one row.
-- Either item-backed (recurring coke) or licence-backed (dedicated desk) — never both.
-- Full lifecycle from option → pending → signed → ended, including quote revisions (version/supersedes).

CREATE TABLE IF NOT EXISTS public.subscription_option_groups (
  id                               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id                  uuid NOT NULL REFERENCES public.organisations(id),
  location_id                      uuid REFERENCES public.locations(id),
  presented_at                     timestamptz,
  chosen_subscription_line_id      uuid,  -- FK added below after subscription_lines is created
  notes                            text,
  created_at                       timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscription_lines (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  wsm_id                  text,

  -- Exactly one of these (XOR):
  item_id                 uuid REFERENCES public.items(id),
  license_id              uuid REFERENCES public.licenses(id),
  CHECK ((item_id IS NOT NULL) != (license_id IS NOT NULL)),

  -- Who + where (denormalised from licence when licence-backed for fast querying)
  organisation_id         uuid NOT NULL REFERENCES public.organisations(id),
  location_id             uuid NOT NULL REFERENCES public.locations(id),
  user_id                 uuid          REFERENCES public.persons(id),

  -- Commercial
  base_rate               numeric(12,2) NOT NULL,
  currency                text NOT NULL,                                   -- usually inherited from location
  quantity                numeric(10,2) NOT NULL DEFAULT 1,

  -- Cadence
  frequency               text CHECK (frequency IN ('monthly','quarterly','annually','custom')),
  interval_months         int NOT NULL DEFAULT 1,

  -- Lifecycle
  status                  text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','option','pending','signed','paused','ended','cancelled','expired','superseded')),
  started_at              timestamptz NOT NULL,
  ended_at                timestamptz,
  next_invoice_at         timestamptz,

  -- Proposal phase
  proposed_at             timestamptz,
  expires_at              timestamptz,
  accepted_at             timestamptz,
  rejected_at             timestamptz,
  cancelled_at            timestamptz,
  cancellation_reason     text,

  -- Revision chain
  supersedes_subscription_line_id  uuid REFERENCES public.subscription_lines(id),
  version                          int NOT NULL DEFAULT 1,

  -- Option groups
  option_group_id         uuid REFERENCES public.subscription_option_groups(id),

  notes                   text
);

-- 1:1 licence ↔ active sub (a licence can only be referenced by one non-superseded sub)
CREATE UNIQUE INDEX IF NOT EXISTS subscription_lines_license_id_active_key
  ON public.subscription_lines (license_id)
  WHERE license_id IS NOT NULL AND status NOT IN ('superseded','cancelled','expired');

CREATE UNIQUE INDEX IF NOT EXISTS subscription_lines_wsm_id_key
  ON public.subscription_lines (wsm_id) WHERE wsm_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscription_lines_org_idx        ON public.subscription_lines (organisation_id);
CREATE INDEX IF NOT EXISTS subscription_lines_location_idx   ON public.subscription_lines (location_id);
CREATE INDEX IF NOT EXISTS subscription_lines_status_idx     ON public.subscription_lines (status);
CREATE INDEX IF NOT EXISTS subscription_lines_next_invoice   ON public.subscription_lines (next_invoice_at)
  WHERE status = 'signed';
CREATE INDEX IF NOT EXISTS subscription_lines_supersedes_idx ON public.subscription_lines (supersedes_subscription_line_id);
CREATE INDEX IF NOT EXISTS subscription_lines_option_group   ON public.subscription_lines (option_group_id);

-- Now FK-ify the chosen_subscription_line_id on option_groups
ALTER TABLE public.subscription_option_groups
  ADD CONSTRAINT subscription_option_groups_chosen_fk
  FOREIGN KEY (chosen_subscription_line_id) REFERENCES public.subscription_lines(id);

-- Enforce: 'option' status requires option_group_id
ALTER TABLE public.subscription_lines
  ADD CONSTRAINT subscription_lines_option_requires_group
  CHECK (status <> 'option' OR option_group_id IS NOT NULL);

-- Trigger: enforce item sale rules via item_types policy
CREATE OR REPLACE FUNCTION public.enforce_subscription_line_item_rules()
RETURNS trigger AS $$
DECLARE
  v_type public.item_types%ROWTYPE;
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    SELECT it.* INTO v_type
    FROM public.items i
    JOIN public.item_types it ON it.id = i.item_type_id
    WHERE i.id = NEW.item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % has no item_type', NEW.item_id;
    END IF;

    IF v_type.requires_license THEN
      RAISE EXCEPTION 'Item type % requires a licence — use license_id, not item_id', v_type.slug;
    END IF;

    IF NOT v_type.sellable_recurring THEN
      RAISE EXCEPTION 'Item type % cannot be sold as a subscription', v_type.slug;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_subscription_line_item_rules_trg ON public.subscription_lines;
CREATE TRIGGER enforce_subscription_line_item_rules_trg
  BEFORE INSERT OR UPDATE OF item_id ON public.subscription_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_line_item_rules();

NOTIFY pgrst, 'reload schema';
