-- =============================================================
-- The Blues Collective — full database schema
-- Run this ONCE in Supabase: SQL Editor > New query > paste > Run.
-- It is safe to re-run: it uses "if not exists" and "or replace".
-- =============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- =============================================================
-- PROFILES  (one row per user; extends Supabase auth.users)
-- =============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique not null,
  is_admin    boolean not null default false,
  is_banned   boolean not null default false,
  joined_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- When a new user signs up, auto-create their profile row using the
-- username they provided at signup (passed as user metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'fan_' || substr(new.id::text, 1, 8))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- =============================================================
-- FIXTURES  (Premier League matches; filled by sync job later)
-- =============================================================
create table if not exists public.fixtures (
  id             bigint primary key,          -- football-data.org id (positive) or a manual/admin id (negative)
  season         text,
  matchday       int,
  competition    text,                        -- e.g. 'Premier League', 'Pre-season friendly'
  home_team      text not null,
  away_team      text not null,
  chelsea_home   boolean,                     -- true if Chelsea is home team
  opponent       text,                        -- convenience: who Chelsea play
  kickoff        timestamptz not null,
  status         text default 'SCHEDULED',    -- SCHEDULED / IN_PLAY / FINISHED
  home_score     int,
  away_score     int,
  is_manual      boolean not null default false, -- true = added by hand in /admin/fixtures
  updated_at     timestamptz not null default now()
);
-- If the table already exists from an earlier deploy, add the new columns:
alter table public.fixtures add column if not exists competition text;
alter table public.fixtures add column if not exists is_manual boolean not null default false;

alter table public.fixtures enable row level security;

drop policy if exists "Fixtures viewable by everyone" on public.fixtures;
create policy "Fixtures viewable by everyone"
  on public.fixtures for select using (true);

-- =============================================================
-- LEAGUE TABLE  (standings snapshot; filled by sync job later)
-- =============================================================
create table if not exists public.league_table (
  position    int primary key,
  team        text not null,
  played      int not null default 0,
  won         int not null default 0,
  drawn       int not null default 0,
  lost        int not null default 0,
  goals_for   int not null default 0,
  goals_against int not null default 0,
  goal_diff   int not null default 0,
  points      int not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.league_table enable row level security;

drop policy if exists "League table viewable by everyone" on public.league_table;
create policy "League table viewable by everyone"
  on public.league_table for select using (true);

-- =============================================================
-- SQUAD PLAYERS  (current Chelsea squad; seeded from JSON, later synced)
-- =============================================================
create table if not exists public.squad_players (
  id            bigserial primary key,
  api_id        bigint unique,               -- id from API-Football (nullable while seeded)
  name          text not null,
  position      text not null,               -- GK / DEF / MID / FWD
  shirt_number  int,
  market_value  numeric,                     -- €m, from market-values.json
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now()
);

alter table public.squad_players enable row level security;

drop policy if exists "Squad viewable by everyone" on public.squad_players;
create policy "Squad viewable by everyone"
  on public.squad_players for select using (true);

-- =============================================================
-- LINEUPS  (a user's picked XI; may double as a prediction)
-- =============================================================
create table if not exists public.lineups (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references public.profiles (id) on delete cascade,
  title        text,
  formation    text not null,                -- e.g. '4-3-3'
  slots        jsonb not null,               -- 11 slots: [{slot, position, player_id, player_name}]
  fixture_id   bigint references public.fixtures (id) on delete set null,
  is_prediction boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.lineups enable row level security;

drop policy if exists "Lineups viewable by everyone" on public.lineups;
create policy "Lineups viewable by everyone"
  on public.lineups for select using (true);

drop policy if exists "Users insert own lineups" on public.lineups;
create policy "Users insert own lineups"
  on public.lineups for insert with check (auth.uid() = owner);

drop policy if exists "Users update own lineups" on public.lineups;
create policy "Users update own lineups"
  on public.lineups for update using (auth.uid() = owner);

drop policy if exists "Users delete own lineups (or admin)" on public.lineups;
create policy "Users delete own lineups (or admin)"
  on public.lineups for delete using (auth.uid() = owner or public.is_admin());

-- =============================================================
-- POSTS  (short-form feed — "The Shed")
-- =============================================================
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  author       uuid not null references public.profiles (id) on delete cascade,
  body         text not null,
  tag          text,                         -- Match / Transfers / Debate / Fans
  image_url    text,
  lineup_id    uuid references public.lineups (id) on delete set null,
  rebuild_id   uuid,                          -- FK added after rebuilds table
  is_demo      boolean not null default false,
  is_pinned    boolean not null default false,
  fixture_id   bigint references public.fixtures (id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.posts enable row level security;

drop policy if exists "Posts viewable by everyone" on public.posts;
create policy "Posts viewable by everyone"
  on public.posts for select using (true);

drop policy if exists "Users insert own posts" on public.posts;
create policy "Users insert own posts"
  on public.posts for insert with check (auth.uid() = author);

drop policy if exists "Users update own posts" on public.posts;
create policy "Users update own posts"
  on public.posts for update using (auth.uid() = author);

drop policy if exists "Users delete own posts (or admin)" on public.posts;
create policy "Users delete own posts (or admin)"
  on public.posts for delete using (auth.uid() = author or public.is_admin());

-- =============================================================
-- POST LIKES
-- =============================================================
create table if not exists public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;

drop policy if exists "Likes viewable by everyone" on public.post_likes;
create policy "Likes viewable by everyone"
  on public.post_likes for select using (true);

drop policy if exists "Users like as themselves" on public.post_likes;
create policy "Users like as themselves"
  on public.post_likes for insert with check (auth.uid() = user_id);

drop policy if exists "Users remove own likes" on public.post_likes;
create policy "Users remove own likes"
  on public.post_likes for delete using (auth.uid() = user_id);

-- =============================================================
-- COMMENTS  (one level of threading via parent_id)
-- =============================================================
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author     uuid not null references public.profiles (id) on delete cascade,
  parent_id  uuid references public.comments (id) on delete cascade,
  body       text not null,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

drop policy if exists "Comments viewable by everyone" on public.comments;
create policy "Comments viewable by everyone"
  on public.comments for select using (true);

drop policy if exists "Users insert own comments" on public.comments;
create policy "Users insert own comments"
  on public.comments for insert with check (auth.uid() = author);

drop policy if exists "Users delete own comments (or admin)" on public.comments;
create policy "Users delete own comments (or admin)"
  on public.comments for delete using (auth.uid() = author or public.is_admin());

-- =============================================================
-- ARTICLES  (long-form fan writing)
-- =============================================================
create table if not exists public.articles (
  id         uuid primary key default gen_random_uuid(),
  author     uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  body       text not null,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.articles enable row level security;

drop policy if exists "Articles viewable by everyone" on public.articles;
create policy "Articles viewable by everyone"
  on public.articles for select using (true);

drop policy if exists "Users insert own articles" on public.articles;
create policy "Users insert own articles"
  on public.articles for insert with check (auth.uid() = author);

drop policy if exists "Users update own articles" on public.articles;
create policy "Users update own articles"
  on public.articles for update using (auth.uid() = author);

drop policy if exists "Users delete own articles (or admin)" on public.articles;
create policy "Users delete own articles (or admin)"
  on public.articles for delete using (auth.uid() = author or public.is_admin());

-- =============================================================
-- ARTICLE CLAPS  (one per user per article)
-- =============================================================
create table if not exists public.article_claps (
  article_id uuid not null references public.articles (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (article_id, user_id)
);

alter table public.article_claps enable row level security;

drop policy if exists "Claps viewable by everyone" on public.article_claps;
create policy "Claps viewable by everyone"
  on public.article_claps for select using (true);

drop policy if exists "Users clap as themselves" on public.article_claps;
create policy "Users clap as themselves"
  on public.article_claps for insert with check (auth.uid() = user_id);

drop policy if exists "Users remove own claps" on public.article_claps;
create policy "Users remove own claps"
  on public.article_claps for delete using (auth.uid() = user_id);

-- =============================================================
-- REBUILDS  (transfer-window "GM mode" summaries)
-- =============================================================
create table if not exists public.rebuilds (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references public.profiles (id) on delete cascade,
  title      text,
  moves      jsonb not null,                 -- {sold:[], loaned_out:[], bought:[], loaned_in:[]}
  spend      numeric not null default 0,
  raised     numeric not null default 0,
  net        numeric not null default 0,
  note       text,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.rebuilds enable row level security;

drop policy if exists "Rebuilds viewable by everyone" on public.rebuilds;
create policy "Rebuilds viewable by everyone"
  on public.rebuilds for select using (true);

drop policy if exists "Users insert own rebuilds" on public.rebuilds;
create policy "Users insert own rebuilds"
  on public.rebuilds for insert with check (auth.uid() = owner);

drop policy if exists "Users update own rebuilds" on public.rebuilds;
create policy "Users update own rebuilds"
  on public.rebuilds for update using (auth.uid() = owner);

drop policy if exists "Users delete own rebuilds (or admin)" on public.rebuilds;
create policy "Users delete own rebuilds (or admin)"
  on public.rebuilds for delete using (auth.uid() = owner or public.is_admin());

-- Add the deferred FK from posts.rebuild_id -> rebuilds.id
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'posts_rebuild_id_fkey'
  ) then
    alter table public.posts
      add constraint posts_rebuild_id_fkey
      foreign key (rebuild_id) references public.rebuilds (id) on delete set null;
  end if;
end $$;

-- =============================================================
-- REBUILD VOTES  (one upvote per user per rebuild)
-- =============================================================
create table if not exists public.rebuild_votes (
  rebuild_id uuid not null references public.rebuilds (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rebuild_id, user_id)
);

alter table public.rebuild_votes enable row level security;

drop policy if exists "Rebuild votes viewable by everyone" on public.rebuild_votes;
create policy "Rebuild votes viewable by everyone"
  on public.rebuild_votes for select using (true);

drop policy if exists "Users vote as themselves" on public.rebuild_votes;
create policy "Users vote as themselves"
  on public.rebuild_votes for insert with check (auth.uid() = user_id);

drop policy if exists "Users remove own votes" on public.rebuild_votes;
create policy "Users remove own votes"
  on public.rebuild_votes for delete using (auth.uid() = user_id);

-- =============================================================
-- CONFIRMED LINEUPS  (official team sheet; filled by matchday sync)
-- =============================================================
create table if not exists public.confirmed_lineups (
  fixture_id uuid,                            -- kept flexible; usually links a fixture
  fixture_ref bigint references public.fixtures (id) on delete cascade,
  formation  text,
  starters   jsonb not null,                  -- [{player_id, player_name, position}]
  created_at timestamptz not null default now(),
  primary key (fixture_ref)
);

alter table public.confirmed_lineups enable row level security;

drop policy if exists "Confirmed lineups viewable by everyone" on public.confirmed_lineups;
create policy "Confirmed lineups viewable by everyone"
  on public.confirmed_lineups for select using (true);

-- =============================================================
-- PREDICTION SCORES  (points per user per fixture)
-- =============================================================
create table if not exists public.prediction_scores (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  fixture_ref  bigint not null references public.fixtures (id) on delete cascade,
  points       int not null default 0,
  correct_starters int not null default 0,
  formation_bonus  boolean not null default false,
  scored_at    timestamptz not null default now(),
  primary key (user_id, fixture_ref)
);

alter table public.prediction_scores enable row level security;

drop policy if exists "Scores viewable by everyone" on public.prediction_scores;
create policy "Scores viewable by everyone"
  on public.prediction_scores for select using (true);

-- =============================================================
-- TRANSFER NEWS  (admin-curated list)
-- =============================================================
create table if not exists public.transfer_news (
  id          uuid primary key default gen_random_uuid(),
  headline    text not null,
  source_url  text,
  news_date   date not null default current_date,
  created_at  timestamptz not null default now()
);

alter table public.transfer_news enable row level security;

drop policy if exists "Transfer news viewable by everyone" on public.transfer_news;
create policy "Transfer news viewable by everyone"
  on public.transfer_news for select using (true);

drop policy if exists "Only admin manages transfer news" on public.transfer_news;
create policy "Only admin manages transfer news"
  on public.transfer_news for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================
-- REPORTS  (user reports of posts/comments for moderation)
-- =============================================================
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid references public.profiles (id) on delete set null,
  target_type text not null,                  -- 'post' or 'comment'
  target_id   uuid not null,
  reason      text,
  created_at  timestamptz not null default now()
);

alter table public.reports enable row level security;

drop policy if exists "Users create reports" on public.reports;
create policy "Users create reports"
  on public.reports for insert with check (auth.uid() = reporter);

drop policy if exists "Only admin reads reports" on public.reports;
create policy "Only admin reads reports"
  on public.reports for select using (public.is_admin());

-- =============================================================
-- API CALL LOG  (track external API usage vs. free limits)
-- =============================================================
create table if not exists public.api_call_log (
  id          bigserial primary key,
  api_name    text not null,                  -- 'football-data' or 'api-football'
  endpoint    text,
  call_date   date not null default current_date,
  status      text,                           -- 'ok' / 'skipped' / 'error'
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.api_call_log enable row level security;

drop policy if exists "Only admin reads api log" on public.api_call_log;
create policy "Only admin reads api log"
  on public.api_call_log for select using (public.is_admin());

-- =============================================================
-- BLUES LEGENDS  (roster for the 95-Point Game)
-- Facts (name/seasons/slots) imported from Wikidata; game numbers
-- (price_m/attack/defence) are founder-invented balance values.
-- Public can read; only admin can edit (via /admin/legends).
-- =============================================================
create table if not exists public.blues_legends (
  id           bigserial primary key,
  wikidata_id  text unique,                    -- nullable for manually added players
  name         text not null,
  seasons      jsonb not null default '[]'::jsonb,  -- ["1996-97","1997-98", ...]
  slots        jsonb not null default '[]'::jsonb,  -- ["GK"] / ["CB","CM"] etc.
  price_m      numeric,                         -- £m, founder-set for balance
  attack       int,                             -- 0-100
  defence      int,                             -- 0-100
  excluded     boolean not null default false,  -- hide from the game if true
  note         text,                            -- e.g. 'PLACEHOLDER — founder to review'
  updated_at   timestamptz not null default now()
);

alter table public.blues_legends enable row level security;

drop policy if exists "Legends viewable by everyone" on public.blues_legends;
create policy "Legends viewable by everyone"
  on public.blues_legends for select using (true);

drop policy if exists "Only admin manages legends" on public.blues_legends;
create policy "Only admin manages legends"
  on public.blues_legends for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================
-- GAME SEASONS  (the pool of Chelsea seasons the wheel can land on)
-- Public read; admin write. Seeded from the seasons present in the roster.
-- =============================================================
create table if not exists public.game_seasons (
  season      text primary key,                -- e.g. '2004-05'
  is_active   boolean not null default true,   -- toggle a season off the wheel
  updated_at  timestamptz not null default now()
);

alter table public.game_seasons enable row level security;

drop policy if exists "Game seasons viewable by everyone" on public.game_seasons;
create policy "Game seasons viewable by everyone"
  on public.game_seasons for select using (true);

drop policy if exists "Only admin manages game seasons" on public.game_seasons;
create policy "Only admin manages game seasons"
  on public.game_seasons for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================
-- GAME RESULTS  (a user's 95-Point Game attempt)
-- Public read (for the weekly leaderboard); users write only their own.
-- week_key is null for free-practice attempts, set for the weekly challenge.
-- =============================================================
create table if not exists public.game_results (
  id                uuid primary key default gen_random_uuid(),
  owner             uuid not null references public.profiles (id) on delete cascade,
  week_key          text,                       -- e.g. '2026-W29'; null = practice
  is_practice       boolean not null default true,
  picks             jsonb not null,             -- 6 signings: [{slot,name,season,priceM,attack,defence}]
  spent             numeric not null default 0,
  respins           int not null default 0,
  projected_points  numeric not null default 0,
  projected_conceded numeric,
  best_points       numeric,                    -- regret reveal: best possible for the draw
  created_at        timestamptz not null default now()
);

alter table public.game_results enable row level security;

drop policy if exists "Game results viewable by everyone" on public.game_results;
create policy "Game results viewable by everyone"
  on public.game_results for select using (true);

drop policy if exists "Users insert own game results" on public.game_results;
create policy "Users insert own game results"
  on public.game_results for insert with check (auth.uid() = owner);

drop policy if exists "Users delete own game results (or admin)" on public.game_results;
create policy "Users delete own game results (or admin)"
  on public.game_results for delete using (auth.uid() = owner or public.is_admin());

-- One scored attempt per user per weekly challenge (practice rows exempt).
create unique index if not exists uniq_game_results_weekly
  on public.game_results (owner, week_key)
  where week_key is not null;

-- =============================================================
-- Helpful indexes
-- =============================================================
create index if not exists idx_posts_created_at on public.posts (created_at desc);
create index if not exists idx_comments_post on public.comments (post_id);
create index if not exists idx_lineups_owner on public.lineups (owner);
create index if not exists idx_fixtures_kickoff on public.fixtures (kickoff);
create index if not exists idx_game_results_week on public.game_results (week_key);
create index if not exists idx_legends_name on public.blues_legends (name);

-- =============================================================
-- Done. Next: run seed.sql (optional demo content) if you want the
-- site to look alive during testing.
-- =============================================================
