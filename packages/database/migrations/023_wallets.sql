-- 023_wallets.sql
-- Each org has one wallet per currency. wallet_transactions is the immutable ledger.
-- A wallet draw applied to an invoice = invoice_line(item_id=<wallet-draw adjustment>) + a wallet_transactions row.

CREATE TABLE IF NOT EXISTS public.wallets (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  organisation_id          uuid NOT NULL REFERENCES public.organisations(id),
  currency                 text NOT NULL,
  balance                  numeric(12,2) NOT NULL DEFAULT 0,
  UNIQUE (organisation_id, currency)
);

CREATE INDEX IF NOT EXISTS wallets_org_idx ON public.wallets (organisation_id);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at               timestamptz NOT NULL DEFAULT now(),

  wallet_id                uuid NOT NULL REFERENCES public.wallets(id),
  invoice_id               uuid REFERENCES public.invoices(id),

  kind                     text NOT NULL CHECK (kind IN ('topup','draw','refund','adjustment')),
  amount                   numeric(12,2) NOT NULL,     -- signed: positive = into wallet, negative = out
  balance_after            numeric(12,2) NOT NULL,

  notes                    text
);

CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_idx  ON public.wallet_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS wallet_transactions_invoice_idx ON public.wallet_transactions (invoice_id);
CREATE INDEX IF NOT EXISTS wallet_transactions_kind_idx    ON public.wallet_transactions (kind);

NOTIFY pgrst, 'reload schema';
