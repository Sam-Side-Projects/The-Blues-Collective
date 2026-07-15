-- =============================================================
-- The Blues Collective — seed data (squad + placeholder fixtures)
-- Run this AFTER schema.sql, in Supabase SQL Editor.
-- Safe to re-run. Demo POSTS/ARTICLES/REBUILDS are seeded from the app
-- (they need a user), so this file only seeds squad + fixtures.
-- =============================================================

-- ---------- Chelsea squad (mirrors data/market-values.json) ----------
-- We clear and re-insert so this stays in sync if you re-run it.
delete from public.squad_players where api_id is null;

insert into public.squad_players (name, position, shirt_number, market_value) values
  ('Robert Sanchez',    'GK',  1,  18),
  ('Filip Jorgensen',   'GK',  12, 12),
  ('Wesley Fofana',     'DEF', 33, 35),
  ('Levi Colwill',      'DEF', 6,  55),
  ('Benoit Badiashile', 'DEF', 5,  28),
  ('Tosin Adarabioyo',  'DEF', 4,  25),
  ('Reece James',       'DEF', 24, 45),
  ('Malo Gusto',        'DEF', 27, 40),
  ('Marc Cucurella',    'DEF', 3,  45),
  ('Josh Acheampong',   'DEF', 34, 18),
  ('Moises Caicedo',    'MID', 25, 90),
  ('Enzo Fernandez',    'MID', 8,  75),
  ('Romeo Lavia',       'MID', 45, 40),
  ('Kiernan Dewsbury-Hall', 'MID', 22, 30),
  ('Cole Palmer',       'MID', 10, 130),
  ('Noni Madueke',      'FWD', 11, 50),
  ('Pedro Neto',        'FWD', 7,  55),
  ('Jadon Sancho',      'FWD', 19, 40),
  ('Christopher Nkunku','FWD', 18, 55),
  ('Nicolas Jackson',   'FWD', 15, 55),
  ('Marc Guiu',         'FWD', 38, 15);

-- ---------- Placeholder fixtures (until the sync job fills real ones) ----------
-- Negative ids so real football-data.org ids (positive) never clash.
insert into public.fixtures (id, season, matchday, home_team, away_team, chelsea_home, opponent, kickoff, status)
values
  (-1, '2025/26', 1, 'Chelsea', 'Crystal Palace', true,  'Crystal Palace', now() + interval '5 days',  'SCHEDULED'),
  (-2, '2025/26', 2, 'Arsenal', 'Chelsea',         false, 'Arsenal',        now() + interval '12 days', 'SCHEDULED'),
  (-3, '2025/26', 3, 'Chelsea', 'Liverpool',       true,  'Liverpool',      now() + interval '19 days', 'SCHEDULED')
on conflict (id) do update set
  kickoff = excluded.kickoff,
  status  = excluded.status;
