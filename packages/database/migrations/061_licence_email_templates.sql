-- ──────────────────────────────────────────────────────────────────────
-- 061_licence_email_templates.sql
--
-- Email templates for licence lifecycle events. Two templates:
--
--   licence-created   — fired when a member's first licence is created
--                       (or an additional product is added).
--   licence-changed   — fired when an existing licence is upgraded /
--                       downgraded / moved to a different product or
--                       location.
--
-- The notify-licence-change Trigger.dev task picks the template by slug
-- based on the event_kind passed to the task, fills the variables, and
-- ships via Mailgun.
--
-- Test-mode redirect: in non-prod or while admins are reviewing the
-- workflow, all licence emails go to testing@proximity.green with the
-- intended recipient + org annotated in the subject and a banner at the
-- top of the body. Toggle via env var (LICENCE_EMAIL_REDIRECT) handled
-- in the Trigger task itself, not here.
-- ──────────────────────────────────────────────────────────────────────

insert into public.message_templates (slug, name, channel, subject, html_body, variables, title, description)
values (
  'licence-created',
  'Licence created — member welcome',
  'email',
  'Welcome — your {{new_item_name}} membership at {{org_name}} is active',
  $html$
<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:640px;color:#222">
  {{redirect_banner}}
  <h2 style="margin:0 0 8px;color:#2d6a35">Welcome, {{member_first_name}}.</h2>
  <p style="margin:0 0 16px;color:#555;font-size:14px">
    Your {{new_item_name}} membership at <strong>{{org_name}}</strong> is now active.
  </p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px">
    <tr><td style="padding:6px 12px 6px 0;color:#888;width:140px">Membership</td><td style="padding:6px 0">{{new_item_name}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#888">Location</td><td style="padding:6px 0">{{location_name}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#888">Starts</td><td style="padding:6px 0">{{effective_at}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#888">Rate</td><td style="padding:6px 0;font-family:monospace">{{currency}} {{new_rate}} / month</td></tr>
  </table>

  <p style="margin:24px 0 0;font-size:14px">
    Any questions, reply to this email and we'll get back to you.
  </p>

  <p style="margin-top:32px;color:#aaa;font-size:11px">
    {{org_name}} via the Proximity Green platform.
  </p>
</div>
  $html$,
  array['member_first_name','new_item_name','org_name','location_name','effective_at','currency','new_rate','redirect_banner'],
  'Licence created',
  'Sent to a member when a licence is created (welcome). Variables: member_first_name, new_item_name, org_name, location_name, effective_at, currency, new_rate, redirect_banner.'
)
on conflict (slug) do update
  set subject = excluded.subject,
      html_body = excluded.html_body,
      variables = excluded.variables,
      updated_at = now();

insert into public.message_templates (slug, name, channel, subject, html_body, variables, title, description)
values (
  'licence-changed',
  'Licence changed — upgrade / downgrade confirmation',
  'email',
  'Your {{org_name}} membership is changing on {{effective_at}}',
  $html$
<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:640px;color:#222">
  {{redirect_banner}}
  <h2 style="margin:0 0 8px;color:#2d6a35">Hi {{member_first_name}},</h2>
  <p style="margin:0 0 16px;color:#555;font-size:14px">
    Your membership at <strong>{{org_name}}</strong> is changing on {{effective_at}}.
  </p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px">
    <tr><td style="padding:6px 12px 6px 0;color:#888;width:140px">Was</td><td style="padding:6px 0">{{old_item_name}} at {{old_location_name}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#888">Now</td><td style="padding:6px 0">{{new_item_name}} at {{location_name}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#888">Effective</td><td style="padding:6px 0">{{effective_at}}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#888">New rate</td><td style="padding:6px 0;font-family:monospace">{{currency}} {{new_rate}} / month</td></tr>
  </table>

  <p style="margin:24px 0 0;font-size:14px">
    Any questions, reply to this email and we'll get back to you.
  </p>

  <p style="margin-top:32px;color:#aaa;font-size:11px">
    {{org_name}} via the Proximity Green platform.
  </p>
</div>
  $html$,
  array['member_first_name','old_item_name','old_location_name','new_item_name','location_name','org_name','effective_at','currency','new_rate','redirect_banner'],
  'Licence changed',
  'Sent to a member when their existing licence is upgraded/downgraded. Variables: member_first_name, old_item_name, old_location_name, new_item_name, location_name, org_name, effective_at, currency, new_rate, redirect_banner.'
)
on conflict (slug) do update
  set subject = excluded.subject,
      html_body = excluded.html_body,
      variables = excluded.variables,
      updated_at = now();

notify pgrst, 'reload schema';
