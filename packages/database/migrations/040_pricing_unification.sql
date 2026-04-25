-- 036_pricing_unification.sql
-- Unify pricing on items + item_types. Drop families. Per-type detail tables.
-- Spaces become saved queries. Licences drop space_id (each physical thing is its own item).
--
-- Reverses 029's family-grouped detail tables (office + meeting_room had wildly different
-- metadata, the shared space_details was mostly-null either way). Each type that has its
-- own metadata now owns its own *_details table.

begin;

-- ────────────────────────────────────────────────────────────────────────
-- 1. Pricing on item_types
-- ────────────────────────────────────────────────────────────────────────

alter table public.item_types
  add column if not exists pricing_strategy text,
  add column if not exists pricing_params   jsonb;

-- family is dead weight now — type slug locates the detail table
alter table public.item_types drop constraint if exists item_types_family_check;
alter table public.item_types drop column      if exists family;

-- ────────────────────────────────────────────────────────────────────────
-- 2. Universal pricing on items: rate_unit + rate_unit_count + base_rate
-- ────────────────────────────────────────────────────────────────────────

alter table public.items rename column base_price to base_rate;

alter table public.items
  add column if not exists rate_unit       text
    check (rate_unit in ('minute','hour','day','week','month','each')),
  add column if not exists rate_unit_count integer not null default 1;

-- ────────────────────────────────────────────────────────────────────────
-- 3. Drop family detail tables (029)
-- ────────────────────────────────────────────────────────────────────────

drop table if exists public.space_details      cascade;
drop table if exists public.membership_details cascade;
drop table if exists public.product_details    cascade;
drop table if exists public.service_details    cascade;
drop table if exists public.art_details        cascade;
drop table if exists public.asset_details      cascade;

-- ────────────────────────────────────────────────────────────────────────
-- 4. Per-type detail tables + family-check triggers (per-type, not per-family)
-- ────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_item_type_slug(expected_slug text, p_item_id uuid)
returns void language plpgsql as $$
declare actual_slug text;
begin
  select it.slug into actual_slug
  from public.items i
  join public.item_types it on it.id = i.item_type_id
  where i.id = p_item_id;
  if actual_slug is null then
    raise exception 'Item % not found', p_item_id;
  end if;
  if actual_slug <> expected_slug then
    raise exception 'Item % has type %, cannot live in %_details', p_item_id, actual_slug, expected_slug;
  end if;
end;
$$;

create table public.office_details (
  item_id              uuid primary key references public.items(id) on delete cascade,
  area_sqm             numeric(10,2),
  capacity             integer,
  aesthetic            text,
  aesthetic_impact     numeric(5,4),
  safety_margin        numeric(5,4),
  start_price_per_m2   numeric(12,2),
  layout               text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create or replace function public.check_office_type() returns trigger language plpgsql as $$
begin perform public.enforce_item_type_slug('office', new.item_id); return new; end $$;
create trigger office_details_type_check
  before insert or update on public.office_details
  for each row execute function public.check_office_type();

create table public.meeting_room_details (
  item_id                  uuid primary key references public.items(id) on delete cascade,
  capacity                 integer,
  price_per_user_per_day   numeric(12,2),
  off_peak_factor          numeric(5,4),
  layout                   text,
  slots_per_day            integer,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create or replace function public.check_meeting_room_type() returns trigger language plpgsql as $$
begin perform public.enforce_item_type_slug('meeting_room', new.item_id); return new; end $$;
create trigger meeting_room_details_type_check
  before insert or update on public.meeting_room_details
  for each row execute function public.check_meeting_room_type();

create table public.hotel_room_details (
  item_id              uuid primary key references public.items(id) on delete cascade,
  capacity             integer,
  price_per_day        numeric(12,2),
  layout               text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create or replace function public.check_hotel_room_type() returns trigger language plpgsql as $$
begin perform public.enforce_item_type_slug('hotel_room', new.item_id); return new; end $$;
create trigger hotel_room_details_type_check
  before insert or update on public.hotel_room_details
  for each row execute function public.check_hotel_room_type();

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
create or replace function public.check_membership_type() returns trigger language plpgsql as $$
begin perform public.enforce_item_type_slug('membership', new.item_id); return new; end $$;
create trigger membership_details_type_check
  before insert or update on public.membership_details
  for each row execute function public.check_membership_type();

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
create or replace function public.check_product_type() returns trigger language plpgsql as $$
begin perform public.enforce_item_type_slug('product', new.item_id); return new; end $$;
create trigger product_details_type_check
  before insert or update on public.product_details
  for each row execute function public.check_product_type();

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
create or replace function public.check_service_type() returns trigger language plpgsql as $$
begin perform public.enforce_item_type_slug('service', new.item_id); return new; end $$;
create trigger service_details_type_check
  before insert or update on public.service_details
  for each row execute function public.check_service_type();

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
create or replace function public.check_art_type() returns trigger language plpgsql as $$
begin perform public.enforce_item_type_slug('art', new.item_id); return new; end $$;
create trigger art_details_type_check
  before insert or update on public.art_details
  for each row execute function public.check_art_type();

create table public.asset_details (
  item_id          uuid primary key references public.items(id) on delete cascade,
  kind             text check (kind in ('vehicle','equipment','bicycle','other')),
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
create or replace function public.check_asset_type() returns trigger language plpgsql as $$
begin perform public.enforce_item_type_slug('asset', new.item_id); return new; end $$;
create trigger asset_details_type_check
  before insert or update on public.asset_details
  for each row execute function public.check_asset_type();

-- vehicle / equipment slugs (added in 029) point at asset_details
create or replace function public.check_asset_kindred_type() returns trigger language plpgsql as $$
declare actual_slug text;
begin
  select it.slug into actual_slug
  from public.items i join public.item_types it on it.id = i.item_type_id
  where i.id = new.item_id;
  if actual_slug not in ('asset','vehicle','equipment') then
    raise exception 'Item % has type %, cannot live in asset_details', new.item_id, actual_slug;
  end if;
  return new;
end $$;
drop trigger if exists asset_details_type_check on public.asset_details;
create trigger asset_details_type_check
  before insert or update on public.asset_details
  for each row execute function public.check_asset_kindred_type();

-- ────────────────────────────────────────────────────────────────────────
-- 5. Drop licenses.space_id — each physical thing is its own item
-- ────────────────────────────────────────────────────────────────────────

alter table public.licenses drop column if exists space_id;

-- ────────────────────────────────────────────────────────────────────────
-- 6. Spaces become saved queries
-- ────────────────────────────────────────────────────────────────────────

drop table if exists public.spaces cascade;

create table public.spaces (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  description     text,
  filter          jsonb not null default '{}'::jsonb,
  manual_item_ids uuid[],
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index spaces_active_idx on public.spaces (active);

drop trigger if exists changelog_spaces on public.spaces;
create trigger changelog_spaces
  after insert or update or delete on public.spaces
  for each row execute function public.change_log_trigger();

-- ────────────────────────────────────────────────────────────────────────
-- 7. Seed pricing strategies on item_types
-- ────────────────────────────────────────────────────────────────────────

update public.item_types set
  pricing_strategy = 'office_per_m2',
  pricing_params   = '{"round_to": 10}'::jsonb
where slug = 'office';

update public.item_types set
  pricing_strategy = 'meeting_room_daily',
  pricing_params   = '{"slots_per_day": 16, "peak_markup": 0.25, "off_peak_factor": 0.8}'::jsonb
where slug = 'meeting_room';

update public.item_types set
  pricing_strategy = 'flat'
where slug in ('product','day_pass','adjustment','deposit','service','art','asset','membership','hotel_room','vehicle','equipment');

commit;

NOTIFY pgrst, 'reload schema';
