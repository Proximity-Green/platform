-- 022_contracts.sql
-- Contracts are umbrella legal docs that wrap many subscription_lines (MSA pattern).
-- Subs are the mini-contracts; this table is the parent doc.

CREATE TABLE IF NOT EXISTS public.contracts (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  wsm_id                   text,

  organisation_id          uuid NOT NULL REFERENCES public.organisations(id),

  type                     text NOT NULL DEFAULT 'contract'
    CHECK (type IN ('contract','flexi_agreement','addendum','master_services_agreement')),
  reference                text,
  title                    text,
  filename                 text,
  document_url             text,

  signed_at                timestamptz,
  signed_by_person_id      uuid REFERENCES public.persons(id),

  started_at               timestamptz,
  ended_at                 timestamptz,

  status                   text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','expired','terminated')),

  notes                    text
);

CREATE UNIQUE INDEX IF NOT EXISTS contracts_wsm_id_key ON public.contracts (wsm_id) WHERE wsm_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS contracts_org_idx    ON public.contracts (organisation_id);
CREATE INDEX        IF NOT EXISTS contracts_status_idx ON public.contracts (status);

-- Junction (M:N contracts ↔ subscription_lines)
CREATE TABLE IF NOT EXISTS public.contract_subscription_lines (
  contract_id              uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  subscription_line_id     uuid NOT NULL REFERENCES public.subscription_lines(id) ON DELETE CASCADE,
  created_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_id, subscription_line_id)
);

CREATE INDEX IF NOT EXISTS contract_subscription_lines_sub_idx
  ON public.contract_subscription_lines (subscription_line_id);

-- Now that contracts exists, FK-ify signatures.contract_id
ALTER TABLE public.signatures
  ADD CONSTRAINT signatures_contract_fk
  FOREIGN KEY (contract_id) REFERENCES public.contracts(id);

NOTIFY pgrst, 'reload schema';
