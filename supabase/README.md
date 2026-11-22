# CHRONUS — Supabase Database

This directory contains the versioned database definition for the CHRONUS portal in this repository.

## Migration order

Apply the migrations in this order to a **new, empty Supabase project**:

1. migrations/000_core_auth_and_characters.sql — core user profiles, character sheets, Auth triggers, RLS and private portrait storage.
2. migrations/001_portal_content.sql — editorial content, campaign sessions, NPCs, locations, documents, soundtrack, library, narrator secrets, relations and audited asset storage.
3. migrations/002_v11_security_hardening.sql — hardens trigger privileges and Storage configuration.
4. migrations/003_v12_rls_helper_hardening.sql — moves authorization helpers out of the exposed public schema.
5. migrations/004_v12_rls_initplan_optimization.sql — optimizes RLS policy evaluation.
6. migrations/005_v12_permissive_policy_consolidation.sql — consolidates permissive policies without broadening access.
7. migrations/20260904160729_add_session_current_objective.sql — adds the current objective field to campaign sessions.

The migrations already present in this repository remain incremental; migration 000 supplies the missing baseline they assume. The manual rollback script is stored separately at `rollback/001_portal_content_rollback.sql` and must never be copied into the migration queue.

## What this schema stores

- Supabase Auth (auth.users): managed identities and authentication credentials. This is a Supabase-managed table and is not recreated here.
- public.profiles: one profile per Auth user, with display_name, email and the controlled role player or narrator.
- public.characters: each player's character sheet, stored as JSONB in data.
- Storage portraits: private portrait storage, scoped by user ID; the Narrator can read player portraits.
- Editorial tables: chapters, sessions, NPCs, locations, documents, soundtrack, library, narrator-only secrets and their relationship tables. These are created by migration 001.

## Authentication and account provisioning

Create or invite users through Supabase Authentication. Do not insert passwords into SQL or public tables. When an Auth user is created, migration 000 automatically creates a profiles row with role player. Existing Auth users are backfilled when the migration runs.

The Narrator role is deliberately not self-service. Change a user's role only from a trusted administrative session (for example, the Supabase SQL Editor), after confirming the account identity. Never grant the frontend permission to update profiles.role.

The six player e-mail addresses are intentionally not embedded in migrations or source control. Account creation and password reset remain Auth operations, separate from schema creation.

## Safe deployment rules

- Migration 000 is a new-project baseline, not a repair script for an existing database. It aborts if public.profiles, public.characters or the portraits bucket already exists.
- Do not run it against ficha_MTG_Chronus, chronus-portal-MTG, or another existing project as a shortcut. Their schemas are different and may contain data that must be preserved.
- Inspect and back up any existing project before a migration. Apply each migration once, in order, and verify RLS, Storage policies and the Auth profile trigger afterward.
- Committing these files to GitHub does not execute them on Supabase. Deployment is a separate, deliberate step.
- Only publish the Supabase project URL and a publishable key in browser code. Never commit a database password, service-role key or Supabase secret key.
- CI builds a clean local Supabase instance, applies migrations 000–006 in order, then runs `tests/core_database_baseline.sql` and `tests/v12_local_supabase_e2e.sql`. The rollback directory is intentionally excluded.
