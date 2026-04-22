-- Drop legacy tracking-code columns from locations + items.
-- Single source of truth for tracking codes is now:
--   tracking_codes       — one row per code, owned by a location
--   item_tracking_codes  — many-to-many join, item ↔ tracking_code
--
-- The invoice_lines.accounting_tracking_codes column is KEPT (immutable snapshot
-- captured at invoice time — do not wire back to the live join).
--
-- Dropping:
--   locations.accounting_tracking_code  — Xero-ish code string, e.g. "KL"
--   locations.accounting_tracking_name  — Xero-ish name string, e.g. "Kloof"
--   items.accounting_tracking_codes     — text[] duplicate of item_tracking_codes

ALTER TABLE locations
  DROP COLUMN IF EXISTS accounting_tracking_code,
  DROP COLUMN IF EXISTS accounting_tracking_name;

ALTER TABLE items
  DROP COLUMN IF EXISTS accounting_tracking_codes;
