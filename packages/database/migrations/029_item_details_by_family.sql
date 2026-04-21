-- 029_item_details_by_family.sql
-- Replace EAV (item_type_fields / item_field_values) with family-based detail tables.
-- Families: space, membership, product, service, art, asset
--
-- Each item_type belongs to exactly one family. Each family has a dedicated
-- 1:1 detail table keyed by items.id. A trigger enforces that a detail row
-- only exists for an item whose type maps to that family.
--
-- No backfill: no meaningful data exists yet. EAV tables are dropped.

begin;

-- ────────────────────────────────────────────────────────────────────────
-- 1. Drop legacy EAV
-- ────────────────────────────────────────────────────────────────────────

drop table if exists public.item_field_values;
drop table if exists public.item_type_fields;

-- ────────────────────────────────────────────────────────────────────────
-- 2. Rename sku slug → product (business-facing)
-- ────────────────────────────────────────────────────────────────────────

update public.item_types
set slug = 'product', name = 'Product'
where slug = 'sku';

-- ────────────────────────────────────────────────────────────────────────
-- 3. Family classifier on item_types
-- ────────────────────────────────────────────────────────────────────────

alter table public.item_types
  add column if not exists family text;

update public.item_types set family = case slug
  when 'office'       then 'space'
  when 'meeting_room' then 'space'
  when 'hotel_room'   then 'space'
  when 'membership'   then 'membership'
  when 'product'      then 'product'
  when 'day_pass'     then 'service'
  when 'adjustment'   then 'product'
  when 'deposit'      then 'product'
  else family
end
where family is null;

-- Seed service, art, asset kinds if absent
insert into public.item_types (slug, name, family, sellable_recurring, requires_license)
values
  ('service',   'Service',   'service', false, false),
  ('art',       'Art',       'art',     false, false),
  ('vehicle',   'Vehicle',   'asset',   false, false),
  ('equipment', 'Equipment', 'asset',   false, false)
on conflict (slug) do update set family = excluded.family;

-- Fail loudly if any item_type is still unclassified
do $$
declare rogue text;
begin
  select string_agg(slug, ', ') into rogue
  from public.item_types where family is null;
  if rogue is not null then
    raise exception 'item_types have no family mapping: %', rogue;
  end if;
end $$;

alter table public.item_types
  alter column family set not null;

alter table public.item_types
  drop constraint if exists item_types_family_check;
alter table public.item_types
  add constraint item_types_family_check
    check (family in ('space','membership','product','service','art','asset'));

-- ────────────────────────────────────────────────────────────────────────
-- 4. Detail tables, 1:1 with items.id
-- ────────────────────────────────────────────────────────────────────────

create table public.space_details (
  item_id                      uuid primary key references public.items(id) on delete cascade,
  meters_squared               numeric(10,2),
  capacity                     integer,
  aesthetic                    text,
  aesthetic_impact             numeric(10,2),
  safety_margin                numeric(10,2),
  start_price_per_square_meter numeric(12,2),
  number_available             integer,
  private                      boolean not null default false,
  business_case                text,
  -- meeting_room / hotel_room-specific
  layout                       text,
  price_per_day                numeric(12,2),
  price_per_user_per_day       numeric(12,2),
  half_day_discount            numeric(12,2),
  full_day_discount            numeric(12,2),
  off_peak_cost                numeric(12,2),
  external_ical                text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table public.membership_details (
  item_id                     uuid primary key references public.items(id) on delete cascade,
  occupancy_type              text check (occupancy_type in ('individual','team','corporate')),
  max_members                 integer,
  cost_extra_member           numeric(12,2),
  cost_period                 text check (cost_period in ('month','year')),
  space_credits_per_month     integer,
  space_credits_cost_full_day numeric(10,2),
  space_credits_cost_half_day numeric(10,2),
  stuff_credits_per_month     integer,
  print_credits_per_month     integer,
  marketing_description       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table public.product_details (
  item_id            uuid primary key references public.items(id) on delete cascade,
  volume             integer,
  member_discount    integer,
  price_customisable boolean not null default false,
  pro_rata           boolean not null default false,
  self_service       boolean not null default false,
  payment_options    text,
  supplier_name      text,
  supplier_sku       text,
  price_updated_at   date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.service_details (
  item_id            uuid primary key references public.items(id) on delete cascade,
  duration_minutes   integer,
  billable_unit      text check (billable_unit in ('hour','session','project','day')),
  provider_person_id uuid references public.persons(id) on delete set null,
  requires_booking   boolean not null default false,
  capacity           integer,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.art_details (
  item_id                        uuid primary key references public.items(id) on delete cascade,
  artist_name                    text,
  medium                         text,
  dimensions_height_cm           numeric(10,2),
  dimensions_width_cm            numeric(10,2),
  dimensions_depth_cm            numeric(10,2),
  year_created                   integer,
  edition_number                 integer,
  edition_size                   integer,
  framed                         boolean not null default false,
  provenance                     text,
  condition_notes                text,
  insurance_value                numeric(14,2),
  acquisition_cost               numeric(14,2),
  acquired_at                    date,
  consignment                    boolean not null default false,
  consignment_commission_percent numeric(5,2),
  consignor_person_id            uuid references public.persons(id) on delete set null,
  list_price                     numeric(14,2),
  status                         text check (status in ('in_storage','on_display','on_loan','sold','returned'))
                                 not null default 'in_storage',
  sold_at                        date,
  sold_price                     numeric(14,2),
  sold_to_person_id              uuid references public.persons(id) on delete set null,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

create table public.asset_details (
  item_id          uuid primary key references public.items(id) on delete cascade,
  kind             text not null check (kind in ('vehicle','equipment','bicycle','other')),
  make             text,
  model            text,
  serial_number    text,
  registration     text,
  acquired_at      date,
  acquisition_cost numeric(14,2),
  insurance_value  numeric(14,2),
  last_service_at  date,
  odometer_km      numeric(10,2),
  status           text check (status in ('available','rented','maintenance','retired'))
                   not null default 'available',
  rate_per_hour    numeric(12,2),
  rate_per_day     numeric(12,2),
  rate_per_week    numeric(12,2),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────
-- 5. Triggers: detail row must match the item's family
-- ────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_item_family(expected text, p_item_id uuid)
returns void language plpgsql as $$
declare actual text;
begin
  select it.family into actual
  from public.items i
  join public.item_types it on it.id = i.item_type_id
  where i.id = p_item_id;
  if actual is null then
    raise exception 'Item % not found', p_item_id;
  end if;
  if actual <> expected then
    raise exception 'Item % has family %, cannot live in %_details', p_item_id, actual, expected;
  end if;
end;
$$;

create or replace function public.check_space_family() returns trigger language plpgsql as $$
begin perform public.enforce_item_family('space', new.item_id); return new; end $$;
create trigger space_details_family_check
  before insert or update on public.space_details
  for each row execute function public.check_space_family();

create or replace function public.check_membership_family() returns trigger language plpgsql as $$
begin perform public.enforce_item_family('membership', new.item_id); return new; end $$;
create trigger membership_details_family_check
  before insert or update on public.membership_details
  for each row execute function public.check_membership_family();

create or replace function public.check_product_family() returns trigger language plpgsql as $$
begin perform public.enforce_item_family('product', new.item_id); return new; end $$;
create trigger product_details_family_check
  before insert or update on public.product_details
  for each row execute function public.check_product_family();

create or replace function public.check_service_family() returns trigger language plpgsql as $$
begin perform public.enforce_item_family('service', new.item_id); return new; end $$;
create trigger service_details_family_check
  before insert or update on public.service_details
  for each row execute function public.check_service_family();

create or replace function public.check_art_family() returns trigger language plpgsql as $$
begin perform public.enforce_item_family('art', new.item_id); return new; end $$;
create trigger art_details_family_check
  before insert or update on public.art_details
  for each row execute function public.check_art_family();

create or replace function public.check_asset_family() returns trigger language plpgsql as $$
begin perform public.enforce_item_family('asset', new.item_id); return new; end $$;
create trigger asset_details_family_check
  before insert or update on public.asset_details
  for each row execute function public.check_asset_family();

commit;
