-- Enable Supabase Realtime on log-style tables so dashboards can stream new
-- rows into the UI via websocket instead of polling. RLS still applies to
-- realtime payloads, so existing SELECT policies govern who sees what —
-- no authz change.
alter publication supabase_realtime add table public.system_logs;
alter publication supabase_realtime add table public.change_log;
