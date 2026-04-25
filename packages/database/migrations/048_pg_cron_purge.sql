-- 048_pg_cron_purge.sql
--
-- Wire nightly retention purge for tier-1 soft-deleted rows. After 90 days
-- in the recycle bin, rows are physically deleted via purge_soft_deleted.
-- One pg_cron job calls a wrapper function that loops every tier-1 table.
--
-- Notes:
--   * pg_cron must be installed at the database level. On Supabase it lives
--     in the `extensions` schema and is enabled by default for self-hosted
--     deployments.
--   * Job is idempotent — drops the existing job by name before scheduling,
--     so re-running this migration won't create duplicates.
--   * Default schedule: 03:00 UTC daily. Adjust by editing the cron expression
--     and re-running this migration.

create extension if not exists pg_cron with schema extensions;

-- ─── Wrapper function: purge every tier-1 table with default 90-day cutoff ──
create or replace function public.purge_all_tier1_soft_deleted(
  p_older_than interval default interval '90 days'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_count int;
  v_results jsonb := '{}'::jsonb;
  v_total int := 0;
begin
  foreach v_table in array array[
    'items','item_types','tracking_codes','tags',
    'locations','spaces',
    'persons','organisations','legal_entities',
    'contracts','subscription_lines','subscription_option_groups','licenses',
    'notes','feature_requests','message_templates','approved_domains','wallets'
  ] loop
    v_count := public.purge_soft_deleted(v_table, p_older_than);
    v_results := v_results || jsonb_build_object(v_table, v_count);
    v_total := v_total + v_count;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'total_purged', v_total,
    'older_than', p_older_than::text,
    'per_table', v_results,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.purge_all_tier1_soft_deleted(interval) from public, anon, authenticated;
grant execute on function public.purge_all_tier1_soft_deleted(interval) to service_role;

comment on function public.purge_all_tier1_soft_deleted(interval) is
  'Purge all tier-1 soft-deleted rows older than the cutoff. Wired to pg_cron nightly. Returns per-table counts.';

-- ─── Schedule the nightly job (idempotent) ──────────────────────────────
do $$
begin
  -- Drop any existing job with this name so re-running is safe.
  perform cron.unschedule(jobid)
    from cron.job
   where jobname = 'purge-tier1-nightly';

  perform cron.schedule(
    'purge-tier1-nightly',
    '0 3 * * *',
    $cmd$select public.purge_all_tier1_soft_deleted()$cmd$
  );
end$$;
