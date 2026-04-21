-- 017_spaces_licenses.sql
-- Spaces are physical/logical bookable units inside a location (desk, office, room).
-- Licences are access-right instances granted to a person/organisation at a space for a period.
-- Every licence is 1:1 with a subscription_line (enforced when subscription_lines table is created).

CREATE TABLE IF NOT EXISTS public.spaces (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  wsm_id          text,

  location_id     uuid NOT NULL REFERENCES public.locations(id),
  name            text NOT NULL,
  code            text,                                 -- e.g. "4A", "DD-12"
  description     text,

  capacity        int,
  area_sqm        numeric(8,2),
  floor           text,

  active          boolean NOT NULL DEFAULT true,
  metadata        jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS spaces_wsm_id_key ON public.spaces (wsm_id) WHERE wsm_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS spaces_location_idx ON public.spaces (location_id);
CREATE INDEX        IF NOT EXISTS spaces_active_idx   ON public.spaces (active);

-- LICENCES

CREATE TABLE IF NOT EXISTS public.licenses (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  wsm_id              text,

  item_id             uuid NOT NULL REFERENCES public.items(id),          -- the membership/office being licenced
  organisation_id     uuid NOT NULL REFERENCES public.organisations(id),
  location_id         uuid NOT NULL REFERENCES public.locations(id),
  space_id            uuid          REFERENCES public.spaces(id),
  user_id             uuid          REFERENCES public.persons(id),         -- who holds the licence (80% populated in data)

  started_at          timestamptz NOT NULL,
  ended_at            timestamptz,                                        -- null = open-ended

  notes               text
);

CREATE UNIQUE INDEX IF NOT EXISTS licenses_wsm_id_key ON public.licenses (wsm_id) WHERE wsm_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS licenses_org_idx      ON public.licenses (organisation_id);
CREATE INDEX        IF NOT EXISTS licenses_location_idx ON public.licenses (location_id);
CREATE INDEX        IF NOT EXISTS licenses_user_idx     ON public.licenses (user_id);
CREATE INDEX        IF NOT EXISTS licenses_item_idx     ON public.licenses (item_id);
CREATE INDEX        IF NOT EXISTS licenses_active_idx   ON public.licenses (started_at, ended_at);

NOTIFY pgrst, 'reload schema';
