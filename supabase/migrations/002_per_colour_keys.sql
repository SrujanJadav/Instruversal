-- =============================================================================
-- Instruversal: Step 22B Database Migration
-- File: /supabase/migrations/002_per_colour_keys.sql
-- =============================================================================

-- 1. Update default schema_version to 2 for creations table.
-- Existing creations remain intact with their saved schema_version.
alter table public.creations
  alter column schema_version set default 2;

-- Note: The existing key_label text column constraint (char_length(key_label) <= 30)
-- and project jsonb constraint (octet_length(project::text) <= 500000) fully support
-- the new 'Mixed keys' label (10 chars) and per-colour key objects without any DDL changes.
