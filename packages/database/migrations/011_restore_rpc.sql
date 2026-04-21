-- ============================================
-- RESTORE RPC + audit-suppression flag
-- ============================================
-- Problem: when restoring a record, the table UPDATE fires the audit
-- trigger (logs an UPDATE row) AND the service writes a RESTORE row.
-- Result: two rows for one user action.
--
-- Fix: a single Postgres RPC does both in one transaction. It sets a
-- session-local flag the trigger checks; trigger early-returns when set;
-- the RPC then inserts the explicit RESTORE row itself.

-- 1) Patch the trigger to honour the suppression flag.
CREATE OR REPLACE FUNCTION public.change_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
  _changed_by uuid;
BEGIN
  -- Skip auto-logging if the caller has suppressed it for this transaction.
  -- Used by restore_record() so a restore writes a single RESTORE row,
  -- not RESTORE + auto-logged UPDATE.
  IF current_setting('app.suppress_audit', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  BEGIN
    _changed_by := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    _changed_by := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.change_log (table_name, record_id, action, changed_by, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', _changed_by, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO public.change_log (table_name, record_id, action, changed_by, old_values, new_values)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', _changed_by, to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.change_log (table_name, record_id, action, changed_by, old_values)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', _changed_by, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) Single-transaction restore: snapshot current → suppress → UPDATE
--    via jsonb_populate_record (handles per-column casting) → write the
--    explicit RESTORE row.
CREATE OR REPLACE FUNCTION public.restore_record(
  p_table_name text,
  p_record_id uuid,
  p_new_values jsonb,
  p_changed_by uuid
)
RETURNS void AS $$
DECLARE
  _current jsonb;
  _cols text;
  _vals text;
BEGIN
  PERFORM set_config('app.suppress_audit', 'true', true);

  EXECUTE format('SELECT to_jsonb(t.*) FROM public.%I t WHERE id = $1', p_table_name)
    INTO _current USING p_record_id;

  SELECT
    string_agg(quote_ident(k), ','),
    string_agg('r.' || quote_ident(k), ',')
  INTO _cols, _vals
  FROM jsonb_object_keys(p_new_values) k
  WHERE k NOT IN ('id', 'created_at');

  EXECUTE format(
    'UPDATE public.%I AS t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) AS r) WHERE t.id = $2',
    p_table_name, _cols, _vals, p_table_name
  ) USING p_new_values, p_record_id;

  PERFORM set_config('app.suppress_audit', 'false', true);

  INSERT INTO public.change_log (table_name, record_id, action, changed_by, old_values, new_values)
  VALUES (p_table_name, p_record_id, 'RESTORE', p_changed_by, _current, p_new_values);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
