-- 036_feature_requests.sql
-- Feature requests: user-facing ideas & asks, seeded from admin AI chats.
-- Cards carry title, summary, full chat transcript, tags, status lifecycle,
-- and per-user upvotes.

create table if not exists public.feature_requests (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  summary text,
  transcript jsonb not null default '[]'::jsonb,
  status text not null default 'new'
    check (status in ('new', 'triaged', 'planned', 'in_progress', 'done')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_requests_status_idx on public.feature_requests (status);
create index if not exists feature_requests_created_at_idx on public.feature_requests (created_at desc);
create index if not exists feature_requests_created_by_idx on public.feature_requests (created_by);

create table if not exists public.feature_request_votes (
  id uuid primary key default uuid_generate_v4(),
  feature_request_id uuid not null references public.feature_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (feature_request_id, user_id)
);

create index if not exists feature_request_votes_request_idx on public.feature_request_votes (feature_request_id);
create index if not exists feature_request_votes_user_idx on public.feature_request_votes (user_id);

-- Auto-touch updated_at on feature_requests updates.
create or replace function public.touch_feature_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_feature_requests_updated_at on public.feature_requests;
create trigger touch_feature_requests_updated_at
  before update on public.feature_requests
  for each row
  execute function public.touch_feature_requests_updated_at();

-- Convenience view: feature requests with vote count baked in.
create or replace view public.feature_requests_with_votes as
select
  fr.*,
  coalesce(vc.vote_count, 0)::int as vote_count
from public.feature_requests fr
left join (
  select feature_request_id, count(*)::int as vote_count
  from public.feature_request_votes
  group by feature_request_id
) vc on vc.feature_request_id = fr.id;

-- Changelog triggers (per CONVENTIONS.md — every new table gets one).
drop trigger if exists changelog_feature_requests on public.feature_requests;
create trigger changelog_feature_requests
  after insert or update or delete on public.feature_requests
  for each row
  execute function public.change_log_trigger();

drop trigger if exists changelog_feature_request_votes on public.feature_request_votes;
create trigger changelog_feature_request_votes
  after insert or update or delete on public.feature_request_votes
  for each row
  execute function public.change_log_trigger();

-- Seed permissions: grant read/create/update/delete on feature_requests to every
-- existing role. Tighten later if needed.
insert into public.permissions (role_id, resource, action)
select r.id, 'feature_requests', a.action
from public.roles r
cross join (values ('read'), ('create'), ('update'), ('delete')) as a(action)
on conflict (role_id, resource, action) do nothing;

notify pgrst, 'reload schema';
