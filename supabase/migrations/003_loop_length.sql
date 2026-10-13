-- =============================================================================
-- Instruversal: Step 24 Database Migration
-- File: /supabase/migrations/003_loop_length.sql
-- =============================================================================

-- 1. Update default schema_version to 3 for creations table.
-- Existing creations remain intact with their saved schema_version (1, 2, or 3).
alter table public.creations
  alter column schema_version set default 3;

-- Note: The existing project jsonb column constraint (octet_length(project::text) <= 500000)
-- fully supports loop length (bars: 1 | 2 | 4 | 8) without any DDL column changes.
