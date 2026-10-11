-- =============================================================================
-- Instruversal: Step 22 Database Schema & Row Level Security (RLS)
-- File: /supabase/migrations/001_creations.sql
-- =============================================================================

-- 1. Create creations table
-- Stores musical sketches created by users, containing vector strokes, tracks, and audio settings.
create table if not exists public.creations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 80),
  project jsonb not null check (octet_length(project::text) <= 500000),
  preview jsonb check (preview is null or octet_length(preview::text) <= 15000),
  bpm int check (bpm is null or (bpm >= 30 and bpm <= 300)),
  key_label text check (key_label is null or char_length(key_label) <= 30),
  is_public boolean not null default false,
  public_slug text unique check (public_slug is null or char_length(public_slug) between 6 and 32),
  schema_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Indexes for efficient queries
-- Fast lookup of a user's library sorted by most recently modified
create index if not exists idx_creations_user_updated 
  on public.creations (user_id, updated_at desc);

-- Fast lookup for public shared links (route #/c/<slug>)
create index if not exists idx_creations_public_slug 
  on public.creations (public_slug) 
  where is_public = true;

-- 3. Trigger function: Automatically maintain updated_at timestamp
create or replace function public.set_creations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_creations_updated_at on public.creations;
create trigger trg_creations_updated_at
  before update on public.creations
  for each row execute function public.set_creations_updated_at();

-- 4. Trigger function: Anti-abuse quota limiting each user to maximum 100 creations
create or replace function public.check_user_creations_limit()
returns trigger as $$
declare
  creation_count int;
begin
  select count(*) into creation_count
  from public.creations
  where user_id = new.user_id;

  if creation_count >= 100 then
    raise exception 'Account limit reached: maximum 100 creations allowed per user.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_creations_limit on public.creations;
create trigger trg_check_creations_limit
  before insert on public.creations
  for each row execute function public.check_user_creations_limit();

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================
alter table public.creations enable row level security;

-- Policy 1: Authenticated users can read only their own creations
-- Explanation: Ensures that private creations remain completely confidential.
-- Security Check: Evaluates auth.uid() against row user_id. Users cannot query other users' private sketches.
create policy "Users can select own creations"
  on public.creations
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Policy 2: Anyone (including unauthenticated guests) can read public creations
-- Explanation: Enables public share links (route #/c/<slug>) to load read-only.
-- Security Check: Only rows with is_public = true are accessible. Private rows return no rows.
create policy "Anyone can select public creations"
  on public.creations
  for select
  to anon, authenticated
  using (is_public = true);

-- Policy 3: Authenticated users can insert their own creations
-- Explanation: Allows logged-in users to save new creations to their personal cloud library.
-- Security Check: "with check (auth.uid() = user_id)" strictly prevents a user from spoofing another
-- user's ID during insertion. Attempting to insert someone else's user_id will fail immediately.
create policy "Users can insert own creations"
  on public.creations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Policy 4: Authenticated users can update only their own creations
-- Explanation: Allows users to update titles, projects, previews, and sharing status for their creations.
-- Security Check: "using (auth.uid() = user_id)" ensures they only modify rows they own.
-- "with check (auth.uid() = user_id)" ensures they cannot transfer row ownership to another user.
create policy "Users can update own creations"
  on public.creations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policy 5: Authenticated users can delete only their own creations
-- Explanation: Allows users to delete creations from their cloud library.
-- Security Check: Evaluates auth.uid() = user_id. Users cannot delete rows belonging to others.
create policy "Users can delete own creations"
  on public.creations
  for delete
  to authenticated
  using (auth.uid() = user_id);
