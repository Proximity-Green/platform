CREATE TABLE public.approved_domains (
  id     uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  domain text NOT NULL UNIQUE
);

INSERT INTO public.approved_domains (domain) VALUES
  ('proximity.green'), ('workshop17.com');
