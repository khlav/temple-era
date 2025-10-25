-- Enable unaccent extension
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Create IMMUTABLE wrapper function for efficient indexing
-- This allows PostgreSQL to create and use indexes on unaccented text
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
AS $$
  SELECT public.unaccent('public.unaccent', $1);
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- Create index using the wrapper function for fast accent-insensitive searches
CREATE INDEX IF NOT EXISTS idx_character_name_unaccent 
ON character (f_unaccent(name));