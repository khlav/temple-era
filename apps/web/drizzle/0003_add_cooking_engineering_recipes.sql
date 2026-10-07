-- TEMPLE-141 / TEMPLE-142: four raid consumables requested for the rare-recipes catalog.
--
-- These live here rather than in 0001_custom_objects.sql's seed block because deployed databases
-- sit above 0001's `when` and would never see an edit to it. ON CONFLICT DO NOTHING keeps this a
-- no-op for any of the four already added through the admin catalog UI.
INSERT INTO recipes (recipe_spell_id, item_id, profession, recipe, is_common, notes, tags)
VALUES
    (24801, 20452, 'Cooking', 'Smoked Desert Dumplings', FALSE, 'BiS Strength food (+20 Str) for melee and tanks', ARRAY['melee', 'tank']),
    (15906, 12217, 'Cooking', 'Dragonbreath Chili', FALSE, 'Fire damage proc food, popular with tanks for extra threat', ARRAY['tank', 'melee']),
    (12760, 10646, 'Engineering', 'Goblin Sapper Charge', FALSE, 'AoE burst for engineers on trash and add-heavy fights', ARRAY['tank', 'melee', 'caster', 'ranged']),
    (22704, 18232, 'Engineering', 'Field Repair Bot 74A', FALSE, 'Repair and vendor mid-raid without a hearth', ARRAY['qol'])
ON CONFLICT (recipe_spell_id) DO NOTHING;
