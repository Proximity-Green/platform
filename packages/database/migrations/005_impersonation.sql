CREATE TABLE public.impersonation_sessions (
  id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  admin_user_id     uuid NOT NULL REFERENCES auth.users(id),
  target_user_id    uuid NOT NULL REFERENCES auth.users(id),
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  reason            text,
  status            text NOT NULL DEFAULT 'active',
  CHECK (status IN ('active', 'ended'))
);

CREATE TABLE public.impersonation_permissions (
  id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  person_id         uuid NOT NULL REFERENCES public.persons(id),
  granted_by        uuid REFERENCES auth.users(id),
  granted_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz
);
