-- 045_pricing_fraction_reset.sql
-- Pricing convention shift (Option A):
--   Percent fields are stored as a decimal fraction (0.2 == 20%) and the
--   formula references the raw fraction with a (1 + x) bump. The UI shows
--   the user-friendly percent ("20") and converts on the wire.
--
-- This migration:
--   1. Converts any factor-style values (e.g. 1.2) back to fractions (0.2).
--      A real fraction is always < 1, so any value >= 1 is a leftover factor.
--   2. Updates the office pricing expression to the (1 + x) form.
--   3. Wipes items.base_rate so prices re-derive from the formula on next view.

-- 1. office_details: factor → fraction
update public.office_details
   set aesthetic_impact = aesthetic_impact - 1
 where aesthetic_impact is not null and aesthetic_impact >= 1;

update public.office_details
   set safety_margin = safety_margin - 1
 where safety_margin is not null and safety_margin >= 1;

-- 2. office expression: x*y → (1 + x)*(1 + y)
update public.item_types
   set pricing_params = jsonb_set(
     coalesce(pricing_params, '{}'::jsonb),
     '{expression}',
     to_jsonb('area_sqm * start_price_per_m2 * (1 + aesthetic_impact) * (1 + safety_margin)'::text)
   )
 where slug = 'office';

-- 3. wipe base rates so the formula drives the value
update public.items
   set base_rate = null;

NOTIFY pgrst, 'reload schema';
