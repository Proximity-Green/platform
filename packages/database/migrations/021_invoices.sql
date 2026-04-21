-- 021_invoices.sql
-- AR + AP unified. kind covers invoice/credit_note/quote; direction covers customer/supplier.
-- No period dates on invoice or invoice_lines — derivable from subscription_line + issued_at.
-- invoice_lines carry either subscription_line_id OR item_id (XOR), never both.

CREATE TABLE IF NOT EXISTS public.invoices (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  wsm_id                    text,

  kind                      text NOT NULL DEFAULT 'invoice'
    CHECK (kind IN ('invoice','credit_note','quote')),
  direction                 text NOT NULL DEFAULT 'customer'
    CHECK (direction IN ('customer','supplier')),
  status                    text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('quote','draft','authorised','sent','paid','cancelled')),

  parent_invoice_id         uuid REFERENCES public.invoices(id),  -- for credit notes

  organisation_id           uuid NOT NULL REFERENCES public.organisations(id),
  location_id               uuid REFERENCES public.locations(id),

  reference                 text,       -- human-readable ref / number
  title                     text,
  summary                   text,

  issued_at                 timestamptz,
  due_at                    timestamptz,
  sent_at                   timestamptz,
  paid_at                   timestamptz,

  currency                  text NOT NULL,
  tax_mode                  text NOT NULL DEFAULT 'exclusive'
    CHECK (tax_mode IN ('inclusive','exclusive')),

  sub_total                 numeric(12,2) NOT NULL DEFAULT 0,
  tax_total                 numeric(12,2) NOT NULL DEFAULT 0,
  discount_total            numeric(12,2) NOT NULL DEFAULT 0,
  total                     numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid               numeric(12,2) NOT NULL DEFAULT 0,
  amount_due                numeric(12,2) NOT NULL DEFAULT 0,

  accounting_sync_status    text,  -- null | pending | synced | error
  accounting_sync_at        timestamptz,
  accounting_sync_error     text,
  accounting_external_id    text,  -- e.g. Xero invoice ID

  notes                     text
);

CREATE INDEX IF NOT EXISTS invoices_org_idx         ON public.invoices (organisation_id);
CREATE INDEX IF NOT EXISTS invoices_location_idx    ON public.invoices (location_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx      ON public.invoices (status);
CREATE INDEX IF NOT EXISTS invoices_kind_idx        ON public.invoices (kind);
CREATE INDEX IF NOT EXISTS invoices_direction_idx   ON public.invoices (direction);
CREATE INDEX IF NOT EXISTS invoices_parent_idx      ON public.invoices (parent_invoice_id);
CREATE INDEX IF NOT EXISTS invoices_issued_idx      ON public.invoices (issued_at);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_wsm_id_key ON public.invoices (wsm_id) WHERE wsm_id IS NOT NULL;

-- INVOICE LINES

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at                timestamptz NOT NULL DEFAULT now(),

  invoice_id                uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  -- Exactly one source:
  subscription_line_id      uuid REFERENCES public.subscription_lines(id),
  item_id                   uuid REFERENCES public.items(id),
  CHECK ((subscription_line_id IS NOT NULL) != (item_id IS NOT NULL)),

  description               text NOT NULL,
  quantity                  numeric(10,2) NOT NULL DEFAULT 1,
  unit_price                numeric(12,2) NOT NULL,
  tax_rate                  numeric(5,2),
  tax_amount                numeric(12,2) NOT NULL DEFAULT 0,
  discount                  numeric(12,2) NOT NULL DEFAULT 0,
  total                     numeric(12,2) NOT NULL,

  -- FX — rate locked at line creation
  currency                  text NOT NULL,
  exchange_rate             numeric(18,8),

  -- Accounting codes snapshot at invoice time (so historical invoices don't shift)
  accounting_gl_code        text,
  accounting_item_code      text,
  accounting_tax_code       text,
  accounting_tracking_codes text[]
);

CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx   ON public.invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_lines_sub_idx       ON public.invoice_lines (subscription_line_id);
CREATE INDEX IF NOT EXISTS invoice_lines_item_idx      ON public.invoice_lines (item_id);

-- Trigger: enforce item_types.sellable_ad_hoc when inserting an ad-hoc invoice_line
CREATE OR REPLACE FUNCTION public.enforce_invoice_line_item_rules()
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
      RAISE EXCEPTION 'Item type % cannot be sold directly on an invoice — licence required', v_type.slug;
    END IF;

    IF NOT v_type.sellable_ad_hoc THEN
      RAISE EXCEPTION 'Item type % is not sellable ad-hoc', v_type.slug;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_invoice_line_item_rules_trg ON public.invoice_lines;
CREATE TRIGGER enforce_invoice_line_item_rules_trg
  BEFORE INSERT OR UPDATE OF item_id ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_line_item_rules();

NOTIFY pgrst, 'reload schema';
