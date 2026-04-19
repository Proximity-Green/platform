CREATE TABLE public.system_logs (
  id         uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  category   text NOT NULL,
  level      text NOT NULL DEFAULT 'info',
  message    text NOT NULL,
  details    jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (level IN ('info', 'warning', 'error', 'success')),
  CHECK (category IN ('email', 'auth', 'system', 'import', 'integration', 'billing'))
);

CREATE INDEX idx_system_logs_category ON public.system_logs(category);
CREATE INDEX idx_system_logs_level ON public.system_logs(level);
CREATE INDEX idx_system_logs_created ON public.system_logs(created_at DESC);
