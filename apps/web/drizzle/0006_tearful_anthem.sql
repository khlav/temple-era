ALTER TYPE "profession" ADD VALUE 'Cooking';

INSERT INTO recipes (recipe_spell_id, item_id, profession, recipe, is_common, notes, tags)
VALUES
    (25659, 21023, 'Cooking', 'Dirge''s Kickin'' Chimaerok Chops', FALSE, 'BiS food for endgame tanking', ARRAY['tank', 'aq40', 'naxx']),
    (8238, 6657, 'Cooking', 'Savory Deviate Delight', FALSE, 'Yarr or *silence*', ARRAY['pirate', 'ninja'])
ON CONFLICT (recipe_spell_id) DO NOTHING;
