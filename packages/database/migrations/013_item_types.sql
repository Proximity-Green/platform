-- 013_item_types.sql
-- First-class lookup for item sellability policy.
-- item_types drive WHICH paths an item can take: ad-hoc / recurring / licence-backed.
-- Triggers on invoice_lines and subscription_lines check these flags.

CREATE TABLE IF NOT EXISTS public.item_types (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                  text NOT NULL UNIQUE,
  name                  text NOT NULL,
  description           text,
  requires_license      boolean NOT NULL DEFAULT false,
  sellable_ad_hoc       boolean NOT NULL DEFAULT false,
  sellable_recurring    boolean NOT NULL DEFAULT false,
  metadata              jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.item_types (slug, name, description, requires_license, sellable_ad_hoc, sellable_recurring) VALUES
  ('sku',          'SKU',           'Physical/digital product — coke, tea, merchandise. Can sell ad-hoc or recurring.',  false, true,  true),
  ('office',       'Office',        'Dedicated office licence. Must go via proposal → licence → sub.',                      true,  false, true),
  ('membership',   'Membership',    'Hotdesk / dedicated desk / coworking plan. Licence-backed.',                            true,  false, true),
  ('hotel_room',   'Hotel Room',    'Short-stay accommodation. Licence-backed.',                                             true,  false, true),
  ('meeting_room', 'Meeting Room',  'Bookable meeting/event space. Usually ad-hoc, can recur.',                              false, true,  true),
  ('day_pass',     'Day Pass',      'Single-day office access. Ad-hoc only.',                                                false, true,  false),
  ('adjustment',   'Adjustment',    'Pro-rata, wallet draw, refund. Internal use on invoice_lines only.',                    false, true,  false),
  ('deposit',      'Deposit',       'Returnable deposit held against a licence. Ad-hoc only.',                               false, true,  false)
ON CONFLICT (slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS item_types_slug_idx ON public.item_types (slug);

NOTIFY pgrst, 'reload schema';
