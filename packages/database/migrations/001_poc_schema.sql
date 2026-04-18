-- POC Schema: 8 tables
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ROLES
CREATE TABLE public.roles (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text
);

INSERT INTO public.roles (name) VALUES
  ('super_admin'), ('admin'), ('finance'), ('member');

-- LEGAL ENTITIES
CREATE TABLE public.legal_entities (
  id           uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name         text NOT NULL,
  registration text,
  vat_number   text,
  country      text NOT NULL DEFAULT 'ZA'
);

-- LOCATIONS
CREATE TABLE public.locations (
  id                   uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  legal_entity_id      uuid REFERENCES public.legal_entities(id),
  name                 text NOT NULL,
  slug                 text NOT NULL UNIQUE,
  address              text,
  timezone             text NOT NULL DEFAULT 'Africa/Johannesburg',
  area_unit            text NOT NULL DEFAULT 'sqm',
  billing_date_pattern text NOT NULL DEFAULT 'advance_dated',
  status               text NOT NULL DEFAULT 'active',
  CHECK (billing_date_pattern IN ('advance_dated', 'current_dated')),
  CHECK (status IN ('active', 'inactive'))
);

-- ORGANISATIONS
CREATE TABLE public.organisations (
  id                uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  legal_entity_id   uuid REFERENCES public.legal_entities(id),
  name              text NOT NULL,
  slug              text NOT NULL UNIQUE,
  community_visible bool NOT NULL DEFAULT true,
  billing_currency  text NOT NULL DEFAULT 'ZAR',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- PERSONS
CREATE TABLE public.persons (
  id                                  uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                             uuid REFERENCES auth.users(id),
  first_name                          text NOT NULL,
  last_name                           text NOT NULL,
  email                               text NOT NULL UNIQUE,
  phone                               text,
  bio                                 text,
  job_title                           text,
  photo_url                           text,
  community_visible                   bool NOT NULL DEFAULT true,
  community_visible_overridden_by_org bool NOT NULL DEFAULT false,
  requires_impersonation_permission   bool NOT NULL DEFAULT false,
  created_at                          timestamptz NOT NULL DEFAULT now()
);

-- PERMISSIONS
CREATE TABLE public.permissions (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  role_id     uuid REFERENCES public.roles(id),
  resource    text NOT NULL,
  action      text NOT NULL,
  UNIQUE(role_id, resource, action)
);

-- AUDIT LOG
CREATE TABLE public.audit_log (
  id           uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  table_name   text NOT NULL,
  record_id    uuid NOT NULL,
  action       text NOT NULL,
  changed_by   uuid REFERENCES auth.users(id),
  old_values   jsonb,
  new_values   jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))
);
