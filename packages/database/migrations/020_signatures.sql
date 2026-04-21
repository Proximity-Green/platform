-- 020_signatures.sql
-- First-class e-signature capture with tamper-evident evidence.
-- Polymorphic-ish: signs EITHER a subscription_line OR a contract (XOR check).

CREATE TABLE IF NOT EXISTS public.signatures (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at                timestamptz NOT NULL DEFAULT now(),

  subscription_line_id      uuid REFERENCES public.subscription_lines(id),
  contract_id               uuid,  -- FK constraint added in 022 after contracts table exists
  CHECK ((subscription_line_id IS NOT NULL) != (contract_id IS NOT NULL)),

  -- Signer
  signer_person_id          uuid REFERENCES public.persons(id),
  signer_name               text NOT NULL,
  signer_email              text NOT NULL,
  signer_role               text,  -- "CFO", "Primary Member"

  -- Method & evidence
  method                    text NOT NULL CHECK (method IN (
    'click_accept','drawn','docusign','hellosign','pandadoc','wet_ink_scan'
  )),
  signed_at                 timestamptz NOT NULL,
  signer_ip                 inet,
  signer_user_agent         text,
  document_hash             text,
  document_url              text,
  provider_reference        text,
  evidence                  jsonb
);

CREATE INDEX IF NOT EXISTS signatures_sub_idx      ON public.signatures (subscription_line_id);
CREATE INDEX IF NOT EXISTS signatures_contract_idx ON public.signatures (contract_id);
CREATE INDEX IF NOT EXISTS signatures_signer_idx   ON public.signatures (signer_person_id);

-- Enforce: sub cannot move pending → signed without a signature row
CREATE OR REPLACE FUNCTION public.enforce_signature_on_activation()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed') THEN
    IF NOT EXISTS (SELECT 1 FROM public.signatures WHERE subscription_line_id = NEW.id) THEN
      RAISE EXCEPTION 'Cannot transition subscription_line to signed without a captured signature';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_signature_on_activation_trg ON public.subscription_lines;
CREATE TRIGGER enforce_signature_on_activation_trg
  BEFORE UPDATE OF status ON public.subscription_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signature_on_activation();

NOTIFY pgrst, 'reload schema';
