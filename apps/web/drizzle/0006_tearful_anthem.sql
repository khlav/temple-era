-- 'Cooking' is now part of the CREATE TYPE in 0004, so on a from-scratch replay this is a no-op.
-- It has to be, because drizzle's migrator runs every pending migration in ONE transaction, and
-- PostgreSQL refuses to let a newly-added enum value be used by the INSERT below within the same
-- transaction that added it ("unsafe use of new value ... of enum type"). Kept (rather than
-- deleted) with IF NOT EXISTS so a database whose watermark predates 0004's edit still gets the
-- value; already-migrated databases skip this file entirely, since drizzle gates on the newest
-- created_at in drizzle.__drizzle_migrations and never re-checks historical hashes.
ALTER TYPE "profession" ADD VALUE IF NOT EXISTS 'Cooking';

INSERT INTO recipes (recipe_spell_id, item_id, profession, recipe, is_common, notes, tags)
VALUES
    (25659, 21023, 'Cooking', 'Dirge''s Kickin'' Chimaerok Chops', FALSE, 'BiS food for endgame tanking', ARRAY['tank', 'aq40', 'naxx']),
    (8238, 6657, 'Cooking', 'Savory Deviate Delight', FALSE, 'Yarr or *silence*', ARRAY['pirate', 'ninja'])
ON CONFLICT (recipe_spell_id) DO NOTHING;
