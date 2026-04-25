-- 049_table_friendly_labels.sql
--
-- DB-driven friendly labels for tier-1 tables. The smart-error sub-system
-- reads these via obj_description() at runtime so it can render messages
-- like "An item was deleted" / "A tracking code was deleted" without a
-- hardcoded TypeScript map. New tables → no app code change beyond adding
-- a COMMENT here.
--
-- Convention: plain English singular noun, lowercase. The matchers
-- pluralise / capitalise as needed.

comment on table public.items is 'item';
comment on table public.item_types is 'item type';
comment on table public.tracking_codes is 'tracking code';
comment on table public.tags is 'tag';
comment on table public.locations is 'location';
comment on table public.spaces is 'space';
comment on table public.persons is 'person';
comment on table public.organisations is 'organisation';
comment on table public.legal_entities is 'legal entity';
comment on table public.contracts is 'contract';
comment on table public.subscription_lines is 'subscription line';
comment on table public.subscription_option_groups is 'subscription option group';
comment on table public.licenses is 'licence';
comment on table public.notes is 'note';
comment on table public.feature_requests is 'feature request';
comment on table public.message_templates is 'message template';
comment on table public.approved_domains is 'approved domain';
comment on table public.wallets is 'wallet';

-- ─── Reader RPC ─────────────────────────────────────────────────────────
-- Returns (table_name, label) for every public table that has a COMMENT.
-- The smart-error sub-system bulk-loads this once on first use and caches.
-- Filtered to public schema only so we don't leak system internals.
create or replace function public.public_table_labels()
returns table (table_name text, label text)
language sql
security definer
set search_path = public
stable
as $$
  select c.relname::text as table_name,
         obj_description(c.oid, 'pg_class')::text as label
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and obj_description(c.oid, 'pg_class') is not null;
$$;

revoke all on function public.public_table_labels() from public, anon, authenticated;
grant execute on function public.public_table_labels() to service_role;

comment on function public.public_table_labels() is
  'Returns friendly singular nouns for public tables that carry a COMMENT. Used by the smart-error sub-system to render lay-friendly messages.';
