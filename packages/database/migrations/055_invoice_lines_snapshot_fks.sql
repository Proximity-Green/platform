-- ──────────────────────────────────────────────────────────────────────
-- 055_invoice_lines_snapshot_fks.sql
--
-- Make invoice_lines a true snapshot. The line already carries description,
-- quantity, unit_price, tax_amount, total, currency, exchange_rate, and
-- accounting codes locally — the source FKs (subscription_line_id, item_id)
-- are back-references for traceability, NOT load-bearing.
--
-- Before: deleting a subscription_line or item that any invoice_line
-- referenced raised a 23503 FK violation, blocking the delete. That
-- contradicted the "invoices are snapshots" rule. Now: the source can be
-- deleted, the back-ref clears, and the snapshot stands.
--
-- Changes:
-- 1. invoice_lines.subscription_line_id FK → ON DELETE SET NULL
-- 2. invoice_lines.item_id              FK → ON DELETE SET NULL
-- 3. Drop the strict "exactly one source" CHECK. It was a creation-time
--    invariant (an invoice line must originate from one source) but not a
--    lifetime invariant (once snapshotted, both sources can disappear).
--    A new INSERT-time trigger keeps the original creation-time guard.
-- ──────────────────────────────────────────────────────────────────────

alter table public.invoice_lines
  drop constraint if exists invoice_lines_subscription_line_id_fkey,
  drop constraint if exists invoice_lines_item_id_fkey;

alter table public.invoice_lines
  add constraint invoice_lines_subscription_line_id_fkey
    foreign key (subscription_line_id) references public.subscription_lines(id) on delete set null,
  add constraint invoice_lines_item_id_fkey
    foreign key (item_id) references public.items(id) on delete set null;

-- Drop the strict CHECK. We can't query its name reliably across versions,
-- so iterate pg_constraint and drop any CHECK on invoice_lines whose
-- definition mentions both source columns.
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = 'invoice_lines'
       and t.relnamespace = 'public'::regnamespace
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%subscription_line_id%'
       and pg_get_constraintdef(c.oid) ilike '%item_id%'
  loop
    execute format('alter table public.invoice_lines drop constraint %I', v_name);
  end loop;
end$$;

-- Replace with an INSERT-only trigger so creation still requires exactly
-- one source — but UPDATEs (e.g. SET NULL on cascade) are allowed to leave
-- both null.
create or replace function public.invoice_lines_require_source_on_insert()
returns trigger
language plpgsql
as $$
begin
  if (new.subscription_line_id is null) = (new.item_id is null) then
    raise exception 'invoice_lines: exactly one of subscription_line_id or item_id must be set on insert';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_lines_require_source_on_insert on public.invoice_lines;
create trigger invoice_lines_require_source_on_insert
before insert on public.invoice_lines
for each row execute function public.invoice_lines_require_source_on_insert();

comment on constraint invoice_lines_subscription_line_id_fkey on public.invoice_lines is
  'ON DELETE SET NULL — invoice_lines is a snapshot, source can disappear.';
comment on constraint invoice_lines_item_id_fkey on public.invoice_lines is
  'ON DELETE SET NULL — invoice_lines is a snapshot, source can disappear.';
