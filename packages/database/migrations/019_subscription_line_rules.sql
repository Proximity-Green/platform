-- 019_subscription_line_rules.sql
-- Unified rule engine: escalation, discount, surcharge, rebate.
-- Type-driven. Extensible without schema changes.
-- Companion table subscription_line_rate_history is the immutable application log.

CREATE TABLE IF NOT EXISTS public.subscription_line_rules (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  subscription_line_id     uuid NOT NULL REFERENCES public.subscription_lines(id) ON DELETE CASCADE,

  rule_type                text NOT NULL CHECK (rule_type IN ('escalation','discount','surcharge','rebate')),
  adjustment_type          text NOT NULL CHECK (adjustment_type IN ('percentage','fixed_amount','cpi')),
  adjustment_value         numeric NOT NULL,  -- always positive; direction derives from rule_type

  starts_at                timestamptz NOT NULL,
  ends_at                  timestamptz,  -- null = indefinite (typical for escalation)
  interval                 text CHECK (interval IN ('once','monthly','quarterly','annually','custom')),
  interval_months          int,
  next_application_at      timestamptz,

  cap_value                numeric,  -- null = uncapped (critical for CPI)

  status                   text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','cancelled')),

  notes                    text
);

CREATE INDEX IF NOT EXISTS subscription_line_rules_sub_idx      ON public.subscription_line_rules (subscription_line_id);
CREATE INDEX IF NOT EXISTS subscription_line_rules_next_apply   ON public.subscription_line_rules (next_application_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS subscription_line_rules_status_idx   ON public.subscription_line_rules (status);

-- Rate history — immutable log per billing event.
CREATE TABLE IF NOT EXISTS public.subscription_line_rate_history (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_line_id     uuid NOT NULL REFERENCES public.subscription_lines(id),
  subscription_line_rule_id uuid REFERENCES public.subscription_line_rules(id),

  event                    text NOT NULL CHECK (event IN (
    'initial_rate','escalation_applied','discount_applied','surcharge_applied','rebate_applied','rate_adjusted'
  )),

  before_base_rate         numeric(12,2),
  after_base_rate          numeric(12,2),
  before_net_rate          numeric(12,2),
  after_net_rate           numeric(12,2),
  adjustment_amount        numeric(12,2),

  applied_at               timestamptz NOT NULL DEFAULT now(),
  notes                    text
);

CREATE INDEX IF NOT EXISTS subscription_line_rate_history_sub_idx    ON public.subscription_line_rate_history (subscription_line_id);
CREATE INDEX IF NOT EXISTS subscription_line_rate_history_rule_idx   ON public.subscription_line_rate_history (subscription_line_rule_id);
CREATE INDEX IF NOT EXISTS subscription_line_rate_history_applied_idx ON public.subscription_line_rate_history (applied_at);

NOTIFY pgrst, 'reload schema';
