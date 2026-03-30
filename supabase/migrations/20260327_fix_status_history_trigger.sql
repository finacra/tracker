-- Fix: log_status_change trigger fails with NOT NULL constraint on changed_by
-- when status is updated via app_updated_by (Passport auth) instead of updated_by (Supabase auth).
-- Make the trigger null-safe: skip history insert if no updated_by is set.

CREATE OR REPLACE FUNCTION public.log_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Only log history if we have a valid changed_by user
    -- Passport auth uses app_updated_by (not in auth.users), so updated_by may be null
    IF NEW.updated_by IS NOT NULL THEN
      INSERT INTO public.requirement_status_history (
        requirement_id,
        old_status,
        new_status,
        changed_by
      ) VALUES (
        NEW.id,
        OLD.status,
        NEW.status,
        NEW.updated_by
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
