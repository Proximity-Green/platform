CREATE TABLE public.message_templates (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  channel     text NOT NULL DEFAULT 'email',
  subject     text NOT NULL,
  html_body   text,
  text_body   text,
  title       text,
  description text,
  variables   text[] DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (channel IN ('email', 'sms', 'whatsapp', 'push', 'in_app'))
);
