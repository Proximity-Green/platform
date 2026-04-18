-- Link auth users to roles
CREATE TABLE public.user_roles (
  id      uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id),
  UNIQUE(user_id, role_id)
);

-- Default: first user gets super_admin
-- Run manually: INSERT INTO public.user_roles (user_id, role_id)
-- SELECT 'your-user-id', id FROM public.roles WHERE name = 'super_admin';
