-- Reference data is inserted by the ordered migrations.
-- Clinical demo data and Supabase Auth users are intentionally seeded through
-- scripts/bootstrap-users.mjs and scripts/seed-demo.mjs because cloud Auth user IDs
-- must be created through the Supabase Admin API rather than by directly editing auth.users.
--
-- Run from the project root after applying migrations:
--   npm run bootstrap
--   npm run seed
select 'Run npm run bootstrap and npm run seed for the complete fictional dataset.' as school_emr_seed_instruction;
