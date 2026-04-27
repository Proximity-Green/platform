-- 053_reported_errors_screenshot.sql
--
-- Add a screenshot to reported_errors so triage can see what the user saw
-- without round-tripping for clarification. Stored as a data URL in a text
-- column — keeps the migration trivial and the row self-contained. If it
-- ever gets heavy on storage we can move to a separate table or to
-- Supabase Storage; for now in-row is fine because reports are user-
-- initiated (low volume).
--
-- Capture happens client-side via html2canvas-pro. The data URL is
-- typically PNG and capped at ~2MB by the API endpoint.

alter table public.reported_errors
  add column if not exists screenshot   text,
  add column if not exists viewport_w   smallint,
  add column if not exists viewport_h   smallint;

comment on column public.reported_errors.screenshot is
  'Data URL (data:image/png;base64,...) of the viewport at report time. Capped at ~2MB by the API.';

notify pgrst, 'reload schema';
