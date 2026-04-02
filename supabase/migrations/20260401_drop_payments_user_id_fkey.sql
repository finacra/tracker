-- Drop FK constraints on payments.user_id (same issue as companies — Passport users not in auth.users)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'payments'::regclass
    AND con.contype = 'f'
    AND att.attname = 'user_id'
  ) LOOP
    EXECUTE 'ALTER TABLE payments DROP CONSTRAINT ' || quote_ident(r.conname);
    RAISE NOTICE 'Dropped constraint: %', r.conname;
  END LOOP;
END $$;
