-- User preferences: per-user UI defaults (pagination size, showTimes, theme,
-- sort defaults, etc.). Single jsonb blob per user, keyed by app-level
-- namespace strings like 'table.people.size' or 'global.showTimes'.
--
-- Rationale: simpler than a narrow (user_id, scope, key) schema; prefs are
-- typically read in bulk, written sparsely, and structure is app-defined.

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read their own prefs
CREATE POLICY "user_prefs_select_self"
  ON public.user_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own prefs row
CREATE POLICY "user_prefs_insert_self"
  ON public.user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own prefs
CREATE POLICY "user_prefs_update_self"
  ON public.user_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Trigger: bump updated_at on write
CREATE OR REPLACE FUNCTION public.touch_user_preferences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER touch_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_preferences_updated_at();
