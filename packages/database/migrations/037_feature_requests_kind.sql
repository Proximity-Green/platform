-- 037_feature_requests_kind.sql
-- Split feature_requests into two kinds: actionable 'feature_request' vs
-- 'note' (a saved chat kept as a reference with no lifecycle expectation).
-- Default keeps existing rows as feature_requests.

alter table public.feature_requests
  add column if not exists kind text not null default 'feature_request';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'feature_requests_kind_check'
  ) then
    alter table public.feature_requests
      add constraint feature_requests_kind_check
      check (kind in ('feature_request', 'note'));
  end if;
end $$;

create index if not exists feature_requests_kind_idx on public.feature_requests (kind);

-- Rebuild the view to expose kind. Drop first: CREATE OR REPLACE VIEW forbids
-- changing column positions, and adding a column to the underlying table shifts
-- fr.* so vote_count moves — Postgres rejects that as a rename.
drop view if exists public.feature_requests_with_votes;
create view public.feature_requests_with_votes as
select
  fr.*,
  coalesce(vc.vote_count, 0)::int as vote_count
from public.feature_requests fr
left join (
  select feature_request_id, count(*)::int as vote_count
  from public.feature_request_votes
  group by feature_request_id
) vc on vc.feature_request_id = fr.id;

notify pgrst, 'reload schema';
