-- 043_drop_pricing_strategy.sql
-- One pricing path, no strategy slug.
-- pricing_params jsonb on item_types is enough — the engine reads
-- pricing_params.expression (formula) and pricing_params.round_to (optional)
-- and falls back to items.base_rate when no expression is set.

alter table public.item_types drop column if exists pricing_strategy;

NOTIFY pgrst, 'reload schema';
