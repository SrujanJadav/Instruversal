-- =============================================================================
-- Instruversal: Step 6 Database Schema & Row Level Security (RLS)
-- File: /supabase/migrations/004_songs.sql
-- (Sequential companion to /supabase/migrations/002_songs.sql)
-- =============================================================================

-- 1. Create songs table
-- Stores multi-lane arrangements, asset references, placements, mixer settings, and timeline markers.
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 80),
  song jsonb not null check (octet_length(song::text) <= 3000000),
  preview jsonb check (preview is null or octet_length(preview::text) <= 20480),
  bpm int not null check (bpm >= 50 and bpm <= 180),
  total_bars int not null check (total_bars >= 1 and total_bars <= 128),
  is_public boolean not null default false,
  public_slug text unique check (public_slug is null or char_length(public_slug) between 6 and 32),
  schema_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Indexes for efficient queries
-- Fast lookup of a user's song library sorted by most recently modified
create index if not exists idx_songs_user_updated 
  on public.songs (user_id, updated_at desc);

-- Fast lookup for public shared songs (route #/s/<slug>)
create index if not exists idx_songs_public_slug 
  on public.songs (public_slug) 
  where is_public = true;

-- 3. Trigger function: Automatically maintain updated_at timestamp
create or replace function public.set_songs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_songs_updated_at on public.songs;
create trigger trg_songs_updated_at
  before update on public.songs
  for each row execute function public.set_songs_updated_at();

-- 4. Trigger function: Anti-abuse quota limiting each user to maximum 20 songs
create or replace function public.check_user_songs_limit()
returns trigger as $$
declare
  song_count int;
begin
  select count(*) into song_count
  from public.songs
  where user_id = new.user_id;

  if song_count >= 20 then
    raise exception 'Account limit reached: maximum 20 songs allowed per user.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_songs_limit on public.songs;
create trigger trg_check_songs_limit
  before insert on public.songs
  for each row execute function public.check_user_songs_limit();

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================
alter table public.songs enable row level security;

-- Policy 1: Authenticated users can read only their own songs
-- Explanation: Ensures private songs remain completely inaccessible to other users.
-- Security Check: Evaluates auth.uid() against row user_id. Users cannot query other users' songs.
create policy "Users can select own songs"
  on public.songs
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Policy 2: Anyone (including unauthenticated guests) can read public songs
-- Explanation: Enables public song sharing links (route #/s/<slug>) to load read-only.
-- Security Check: Evaluates is_public = true. Private rows return 0 records to anon requests.
create policy "Anyone can select public songs"
  on public.songs
  for select
  to anon, authenticated
  using (is_public = true);

-- Policy 3: Authenticated users can insert their own songs
-- Explanation: Allows logged-in users to save new songs to their personal cloud library.
-- Security Check: "with check (auth.uid() = user_id)" strictly prevents a user from spoofing another
-- user's ID during insertion. Attempting to insert someone else's user_id will fail immediately.
create policy "Users can insert own songs"
  on public.songs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Policy 4: Authenticated users can update only their own songs
-- Explanation: Allows users to edit and autosave changes to their own songs.
-- Security Check: Ensures both existing row ownership (using) and incoming row ownership (with check)
-- match auth.uid(), preventing reassignment of songs across accounts.
create policy "Users can update own songs"
  on public.songs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policy 5: Authenticated users can delete only their own songs
-- Explanation: Allows users to remove songs from their library.
-- Security Check: Evaluates auth.uid() = user_id before deletion executes.
create policy "Users can delete own songs"
  on public.songs
  for delete
  to authenticated
  using (auth.uid() = user_id);
