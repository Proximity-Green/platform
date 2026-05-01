-- ──────────────────────────────────────────────────────────────────────
-- 062_realtime_licences_subs.sql
--
-- Add public.licenses + public.subscription_lines to the
-- supabase_realtime publication so the org-page Licences tab can
-- auto-refresh when anyone (including the current user, on their own
-- writes) creates, edits, or ends a licence/sub.
--
-- Without these in the publication, postgres_changes events on these
-- tables don't reach the Realtime websocket and the UI relies on a
-- manual reload.
-- ──────────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.licenses;
alter publication supabase_realtime add table public.subscription_lines;
