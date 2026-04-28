-- Custom SQL migration file, put your code below! --

-- Set database timezone to Eastern Time so CURRENT_DATE in views reflects ET midnight,
-- aligning lockout week boundaries with the WoW Classic reset (Tuesday midnight ET).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/New_York');
END;
$$;