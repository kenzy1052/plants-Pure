-- =============================================================================
-- DEVELOPMENT ONLY — UNVERIFIED SAMPLE DATA — DO NOT LOAD INTO PRODUCTION
-- =============================================================================
-- These zones and fees were carried over from the AI-generated demo
-- (src/lib/utils.ts, DELIVERY_ZONES). Plants & Pure never confirmed them, and the
-- original plantsandpure.com publishes no delivery fees. They exist only so a
-- developer can click through checkout locally.
--
-- The demo also advertised "free delivery over GH₵350"; that is NOT loaded
-- (free_over stays NULL) because it was never confirmed either.
--
-- In production the business enters its real zones (docs/DECISIONS.md, D-4).
-- =============================================================================
insert into public.delivery_zones (slug, name, fee, free_over, is_pickup, display_order, notes) values
  ('east-legon',   'East Legon / Adjiringanor',            30.00, null, false, 10, 'UNVERIFIED dev sample'),
  ('airport-cantonments', 'Airport Residential / Cantonments', 30.00, null, false, 20, 'UNVERIFIED dev sample'),
  ('osu-ridge',    'Osu / Ridge / Labone',                 30.00, null, false, 30, 'UNVERIFIED dev sample'),
  ('spintex',      'Spintex / Sakumono',                   35.00, null, false, 40, 'UNVERIFIED dev sample'),
  ('madina-adenta','Madina / Adenta',                      35.00, null, false, 50, 'UNVERIFIED dev sample'),
  ('tema',         'Tema (Community 1-25)',                45.00, null, false, 60, 'UNVERIFIED dev sample'),
  ('pickup',       'Pick up in Accra',                      0.00, null, true,  90, 'UNVERIFIED dev sample')
on conflict (slug) do nothing;
