-- ============================================================
-- GC FINDER — CLEAN SUPABASE SCHEMA (Instructor + Student sides)
-- Run this in Supabase SQL Editor.
-- After running: go to Authentication → Hooks → "Before User Created"
-- and select hook_restrict_to_nbsc_domain (Postgres Function) — this
-- step can't be done from SQL, it's a dashboard toggle.
-- ============================================================

-- Wrapping the whole thing in a transaction: if ANY statement below
-- fails partway through, Postgres rolls back everything, not just the
-- one statement — so a mid-script error can't leave the database in a
-- half-migrated state. This does NOT replace a real backup (a bad DROP
-- you actually intended still succeeds), it only protects against
-- accidental partial runs.
BEGIN;

-- ============================================
-- BACKUP — snapshot current data before dropping anything.
-- These are plain data copies (no indexes/constraints/triggers carried
-- over), just enough to inspect or manually restore from if needed.
-- Wrapped per-table so a table that doesn't exist yet in your project
-- doesn't stop the backup of the ones that do.
-- ============================================

DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.backup_20260730_profiles AS TABLE public.profiles';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.backup_20260730_courses AS TABLE public.courses';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.backup_20260730_sections AS TABLE public.sections';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.backup_20260730_enrollments AS TABLE public.enrollments';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.backup_20260730_section_enrollments AS TABLE public.section_enrollments';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.backup_20260730_gc_messages AS TABLE public.gc_messages';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.backup_20260730_group_chats AS TABLE public.group_chats';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.backup_20260730_group_chat_members AS TABLE public.group_chat_members';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- CLEANUP — drop everything from the old schema
-- ============================================

DROP VIEW IF EXISTS public.gradebook_view CASCADE;
DROP VIEW IF EXISTS public.instructor_dashboard_view CASCADE;

DROP FUNCTION IF EXISTS public.update_course_student_count() CASCADE;
DROP FUNCTION IF EXISTS public.insert_message(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.fetch_course_messages(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.create_course_and_group_chat_for_section() CASCADE;
DROP FUNCTION IF EXISTS public.add_student_to_group_chat() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.hook_restrict_to_nbsc_domain(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.prevent_self_role_escalation() CASCADE;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TABLE IF EXISTS public.gc_message_seen CASCADE;
DROP TABLE IF EXISTS public.gc_messages CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.group_chat_members CASCADE;
DROP TABLE IF EXISTS public.group_chats CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.grades CASCADE;
DROP TABLE IF EXISTS public.announcements CASCADE;
DROP TABLE IF EXISTS public.student_progress CASCADE;
DROP TABLE IF EXISTS public.submissions CASCADE;
DROP TABLE IF EXISTS public.assignments CASCADE;
DROP TABLE IF EXISTS public.section_enrollments CASCADE;
DROP TABLE IF EXISTS public.sections CASCADE;
DROP TABLE IF EXISTS public.enrollments CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP TYPE IF EXISTS public.grade_scale CASCADE;
DROP TYPE IF EXISTS public.submission_status CASCADE;
DROP TYPE IF EXISTS public.assignment_status CASCADE;
DROP TYPE IF EXISTS public.enrollment_status CASCADE;
DROP TYPE IF EXISTS public.user_role CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE public.user_role AS ENUM ('student', 'instructor');
CREATE TYPE public.enrollment_status AS ENUM ('active', 'dropped');

-- ============================================
-- PROFILES — one row per user
-- ============================================

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role public.user_role NOT NULL DEFAULT 'student',
    verified BOOLEAN NOT NULL DEFAULT false,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    student_id TEXT UNIQUE,
    department TEXT, -- descriptive only, never used for section access
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- ============================================
-- COURSES — subject catalog (no instructor here; a subject
-- isn't taught by one person, its sections are)
-- ============================================

CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE, -- e.g. "ICS001", "IBM001", "ITE001"
    title TEXT NOT NULL,
    description TEXT,
    department TEXT, -- e.g. "Institute for Computer Studies (ICS)"
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- ============================================
-- SECTIONS — the actual teachable unit (instructor lives here)
-- ============================================

CREATE TABLE public.sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    room TEXT,
    max_capacity INTEGER DEFAULT 50,
    current_enrollment INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(course_id, name)
);

-- ============================================
-- SECTION ENROLLMENTS — single source of truth for
-- "who's in this class" (this is what OCR-confirmed COR data
-- writes into; a chat "existing" for a section just means this
-- table has at least one row for it)
-- ============================================

CREATE TABLE public.section_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    status public.enrollment_status NOT NULL DEFAULT 'active',
    enrolled_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(student_id, section_id)
);

-- ============================================
-- GC MESSAGES — chat lives directly on sections, no separate
-- group_chats / group_chat_members tables
-- ============================================

CREATE TABLE public.gc_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_courses_code ON public.courses(code);
CREATE INDEX idx_sections_instructor ON public.sections(instructor_id);
CREATE INDEX idx_sections_course ON public.sections(course_id);
CREATE INDEX idx_section_enrollments_student ON public.section_enrollments(student_id);
CREATE INDEX idx_section_enrollments_section ON public.section_enrollments(section_id);
CREATE INDEX idx_gc_messages_section ON public.gc_messages(section_id);
CREATE INDEX idx_gc_messages_created ON public.gc_messages(created_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gc_messages ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (id = auth.uid());
-- NOTE: RLS alone can't stop a user from setting their own role/verified/
-- is_admin in this UPDATE — see the trigger below (prevent_self_role_escalation)
-- which silently blocks that specific escalation.

-- COURSES (plain catalog — any authenticated user can browse it)
CREATE POLICY "courses_select_authenticated" ON public.courses
    FOR SELECT USING (auth.role() = 'authenticated');

-- SECTIONS
CREATE POLICY "sections_select_instructor_own" ON public.sections
    FOR SELECT USING (instructor_id = auth.uid());

CREATE POLICY "sections_select_enrolled_student" ON public.sections
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.section_enrollments se
            WHERE se.section_id = public.sections.id AND se.student_id = auth.uid()
        )
    );

CREATE POLICY "sections_insert_student" ON public.sections
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated'
    );

CREATE POLICY "sections_update_instructor_own" ON public.sections
    FOR UPDATE USING (instructor_id = auth.uid());

-- SECTION ENROLLMENTS
CREATE POLICY "section_enrollments_select_own" ON public.section_enrollments
    FOR SELECT USING (student_id = auth.uid());

-- Remove circular dependency: instructor access to enrollments via SECURITY DEFINER function
CREATE POLICY "section_enrollments_insert_own" ON public.section_enrollments
    FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "section_enrollments_delete_own" ON public.section_enrollments
    FOR DELETE USING (student_id = auth.uid());

-- GC MESSAGES
CREATE POLICY "gc_messages_select_student" ON public.gc_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.section_enrollments se
            WHERE se.section_id = public.gc_messages.section_id AND se.student_id = auth.uid()
        )
    );

CREATE POLICY "gc_messages_select_instructor" ON public.gc_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.sections s
            WHERE s.id = public.gc_messages.section_id AND s.instructor_id = auth.uid()
        )
    );

CREATE POLICY "gc_messages_insert_student" ON public.gc_messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.section_enrollments se
            WHERE se.section_id = public.gc_messages.section_id AND se.student_id = auth.uid()
        )
    );

CREATE POLICY "gc_messages_insert_instructor" ON public.gc_messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.sections s
            WHERE s.id = public.gc_messages.section_id AND s.instructor_id = auth.uid()
        )
    );

-- Pinning: only the instructor who teaches THAT specific section
CREATE POLICY "gc_messages_update_pin_instructor" ON public.gc_messages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.sections s
            WHERE s.id = public.gc_messages.section_id AND s.instructor_id = auth.uid()
        )
    );

-- ============================================
-- ROLE ASSIGNMENT — fires when a new auth user is created.
-- All-digits email local part -> student (auto-verified).
-- Anything else -> instructor (unverified, needs manual approval).
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    local_part TEXT;
    guessed_role public.user_role;
    user_metadata jsonb;
BEGIN
    local_part := split_part(NEW.email, '@', 1);

    IF local_part ~ '^[0-9]+$' THEN
        guessed_role := 'student';
    ELSE
        guessed_role := 'instructor';
    END IF;

    -- Get user metadata from auth.users (raw_user_meta_data column)
    user_metadata := NEW.raw_user_meta_data;

    INSERT INTO public.profiles (id, email, full_name, avatar_url, role, verified, student_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(user_metadata->>'full_name', user_metadata->>'name', local_part),
        user_metadata->>'avatar_url',
        guessed_role,
        guessed_role = 'student', -- students auto-verified; instructors pending
        CASE WHEN guessed_role = 'student' THEN local_part ELSE NULL END
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SECURITY: prevent a user from self-escalating their own role.
-- RLS's "profiles_update_own" policy allows updating any column of
-- your own row (RLS is row-level, not column-level) — this trigger
-- closes that gap by silently reverting role/verified/is_admin
-- changes unless the actor is already an admin.
-- ============================================

CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    acting_user_is_admin BOOLEAN;
BEGIN
    SELECT is_admin INTO acting_user_is_admin FROM public.profiles WHERE id = auth.uid();

    IF NOT COALESCE(acting_user_is_admin, false) THEN
        NEW.role := OLD.role;
        NEW.verified := OLD.verified;
        NEW.is_admin := OLD.is_admin;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_self_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

-- ============================================
-- DOMAIN RESTRICTION — Auth Hook function.
-- After running this script, go to Supabase Dashboard →
-- Authentication → Hooks → "Before User Created" → select this
-- function ("Postgres Function"). This is the real security
-- boundary (blocks signup before an account exists), not a
-- CHECK constraint, which fires too late.
-- ============================================

CREATE OR REPLACE FUNCTION public.hook_restrict_to_nbsc_domain(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    user_email TEXT;
BEGIN
    user_email := event->'user'->>'email';

    IF user_email !~ '^[^@]+@nbsc\.edu\.ph$' THEN
        RETURN jsonb_build_object(
            'error', jsonb_build_object(
                'http_code', 403,
                'message', 'Only @nbsc.edu.ph institutional accounts are allowed.'
            )
        );
    END IF;

    RETURN jsonb_build_object();
END;
$$;

-- ============================================
-- REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.gc_messages;

COMMIT;

-- ============================================
-- IF SOMETHING LOOKS WRONG AFTER RUNNING THIS:
-- Your old data is sitting in the backup_20260730_* tables untouched.
-- To look at it:   SELECT * FROM public.backup_20260730_profiles;
-- There's no one-command "undo" back into the new schema shape (the
-- table structures are different), but the data is there to manually
-- re-insert from if something important got lost.
--
-- ONCE YOU'VE CONFIRMED EVERYTHING WORKS (give it a few days), drop
-- the backup tables to stop them cluttering the schema:
--   DROP TABLE IF EXISTS public.backup_20260730_profiles;
--   DROP TABLE IF EXISTS public.backup_20260730_courses;
--   DROP TABLE IF EXISTS public.backup_20260730_sections;
--   DROP TABLE IF EXISTS public.backup_20260730_enrollments;
--   DROP TABLE IF EXISTS public.backup_20260730_section_enrollments;
--   DROP TABLE IF EXISTS public.backup_20260730_gc_messages;
--   DROP TABLE IF EXISTS public.backup_20260730_group_chats;
--   DROP TABLE IF EXISTS public.backup_20260730_group_chat_members;
-- ============================================