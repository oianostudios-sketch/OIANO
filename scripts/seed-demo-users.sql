-- OIANO StudioOS — Demo User Seed (v4 — includes passport rows)
-- Paste into Neon SQL Editor and Run. Safe to re-run.

-- ── 1. ADMIN ─────────────────────────────────────────────────────────────────
INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
VALUES (gen_random_uuid(), 'admin@dreamzmusiclab.com',
  '$2a$10$aVoXF.CR7rz8qW4n4j77K.qeKJkP6KX3mh9V1yKJj4zccR.oTjdLa', 'STUDIO_ADMIN', now(), now())
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, updated_at = now();

-- ── 2. DEMO ARTIST ───────────────────────────────────────────────────────────
INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
VALUES (gen_random_uuid(), 'demo@artist.com',
  '$2a$10$CxeEWWfZTKjlqI6h28O7He/9.9ldtBE5XJh.J2JO2Z799ZQ0XQnoO', 'ARTIST', now(), now())
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, updated_at = now();

INSERT INTO artists (id, user_id, name, alias, bio, created_at)
SELECT gen_random_uuid(), u.id, 'Zara Nova', 'ZNOVA',
  'Afro-pop artist blending Lagos rhythms with New York production', now()
FROM users u WHERE u.email = 'demo@artist.com'
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, alias = EXCLUDED.alias, bio = EXCLUDED.bio;

INSERT INTO wallets (id, artist_id, balance_usd)
SELECT gen_random_uuid(), a.id, 500.00
FROM artists a JOIN users u ON u.id = a.user_id WHERE u.email = 'demo@artist.com'
ON CONFLICT (artist_id) DO UPDATE SET balance_usd = 500.00;

INSERT INTO artist_passports (id, artist_id, passport_code, creative_dna, profile_strength, issued_at, updated_at)
SELECT gen_random_uuid(), a.id, 'OIANO-Z001',
  '{"genres":["Afro-pop","R&B","Electronic"],"influences":["Burna Boy","Sza","Wizkid"],"vocal_type":"Mezzo-soprano","energy_profile":"high","key_themes":["Identity","Resilience","Love"]}'::jsonb,
  72, now(), now()
FROM artists a JOIN users u ON u.id = a.user_id WHERE u.email = 'demo@artist.com'
ON CONFLICT (artist_id) DO NOTHING;

-- ── 3. ENGINEER ──────────────────────────────────────────────────────────────
INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
VALUES (gen_random_uuid(), 'engineer@dreamzmusiclab.com',
  '$2a$10$APRXgF2HSkkjiMt5jdHY/u/Rhb99B5IdWJB7IErihmzETR4vE/dmS', 'ENGINEER', now(), now())
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, updated_at = now();

-- ── 4. PRODUCER ──────────────────────────────────────────────────────────────
INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
VALUES (gen_random_uuid(), 'producer@dreamzmusiclab.com',
  '$2a$10$vgsHbvAKDAeGjr3T0GD77ela8/bmCgqAbqpjjNRCPEerEdjn0Nd1S', 'PRODUCER', now(), now())
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, updated_at = now();

INSERT INTO producers (id, user_id, name, open_to_collabs, created_at)
SELECT gen_random_uuid(), u.id, 'Demo Producer', true, now()
FROM users u WHERE u.email = 'producer@dreamzmusiclab.com'
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

-- Producer passport (required for passport page + profile strength)
INSERT INTO producer_passports (id, producer_id, passport_code, genres_produced, signature_tags, profile_strength, issued_at, updated_at)
SELECT gen_random_uuid(), p.id, 'PROD-DM01',
  '["Hip-Hop","R&B","Afrobeats"]'::jsonb,
  '["boom-bap kick","vocal chops","cinematic strings"]'::jsonb,
  55, now(), now()
FROM producers p JOIN users u ON u.id = p.user_id WHERE u.email = 'producer@dreamzmusiclab.com'
ON CONFLICT (producer_id) DO UPDATE
  SET genres_produced = EXCLUDED.genres_produced,
      signature_tags  = EXCLUDED.signature_tags;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT u.email, u.role,
  CASE
    WHEN u.role = 'ARTIST'   THEN (SELECT passport_code FROM artist_passports ap JOIN artists a ON a.id = ap.artist_id WHERE a.user_id = u.id)
    WHEN u.role = 'PRODUCER' THEN (SELECT passport_code FROM producer_passports pp JOIN producers p ON p.id = pp.producer_id WHERE p.user_id = u.id)
    ELSE '—'
  END AS passport_code
FROM users u
WHERE u.email IN (
  'admin@dreamzmusiclab.com','demo@artist.com',
  'engineer@dreamzmusiclab.com','producer@dreamzmusiclab.com'
)
ORDER BY u.role;
