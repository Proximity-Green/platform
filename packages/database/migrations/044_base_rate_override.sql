-- 044_base_rate_override.sql
-- Per-item escape hatch from the type's pricing formula.
-- When false (default): if item_types.pricing_params.expression is set, items.base_rate
-- is derived from the formula and the input field is read-only on the UI.
-- When true: the user has typed in a custom rate; base_rate is used as-is.

alter table public.items
  add column if not exists base_rate_override boolean not null default false;

NOTIFY pgrst, 'reload schema';
