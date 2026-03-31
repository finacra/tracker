-- Drop ALL foreign key constraints on companies.user_id
-- Passport JWT users have app_user_id that doesn't exist in auth.users
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'companies'::regclass
    AND con.contype = 'f'
    AND att.attname = 'user_id'
  ) LOOP
    EXECUTE 'ALTER TABLE companies DROP CONSTRAINT ' || quote_ident(r.conname);
    RAISE NOTICE 'Dropped constraint: %', r.conname;
  END LOOP;
END $$;
