-- 041_pro_rata_on_item_type.sql
-- Pro-rata is a billing policy ("this kind of thing pro-rates") not a per-item override.
-- Move it up from product_details.pro_rata to item_types.apply_pro_rata.

begin;

alter table public.item_types
  add column if not exists apply_pro_rata boolean not null default false;

-- backfill: any product type with at least one product_details row marked pro_rata=true
-- becomes apply_pro_rata=true at the type level
update public.item_types it
set apply_pro_rata = true
where exists (
  select 1
  from public.product_details pd
  join public.items i on i.id = pd.item_id
  where i.item_type_id = it.id and pd.pro_rata = true
);

alter table public.product_details drop column if exists pro_rata;

commit;

NOTIFY pgrst, 'reload schema';
