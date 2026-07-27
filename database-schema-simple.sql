-- ============================================================
-- STUDENT MANAGEMENT SYSTEM - Simplified Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================
-- This schema includes only the tables used in the application:
-- - profiles (user profiles)
-- - courses (course information)
-- - enrollments (student enrollments)
-- - gc_messages (group chat messages)
-- - gc_message_seen (message read receipts)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student', 'instructor', 'system_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE enrollment_status AS ENUM ('pending', 'active', 'completed', 'dropped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'student',
    student_id TEXT UNIQUE,
    department TEXT,
    avatar_url TEXT,
    bio TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Email domain validation constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_domain_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_email_domain_check
  CHECK (email LIKE '%@nbsc.edu.ph');

-- ============================================
-- COURSES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    department TEXT,
    credits INTEGER DEFAULT 3,
    max_students INTEGER,
    current_students INTEGER DEFAULT 0,
    semester TEXT,
    academic_year TEXT,
    schedule JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- ENROLLMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    status enrollment_status NOT NULL DEFAULT 'pending',
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    final_grade TEXT,
    UNIQUE(student_id, course_id)
);

-- ============================================
-- GC MESSAGES TABLE (Group Chat Messages)
-- ============================================

CREATE TABLE IF NOT EXISTS public.gc_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    edited_at TIMESTAMPTZ,
    reply_to UUID REFERENCES public.gc_messages(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT false
);

-- ============================================
-- GC MESSAGE SEEN TABLE (Read Receipts)
-- ============================================

CREATE TABLE IF NOT EXISTS public.gc_message_seen (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.gc_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(message_id, user_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_student_id ON public.profiles(student_id);
CREATE INDEX IF NOT EXISTS idx_courses_instructor ON public.courses(instructor_id);
CREATE INDEX IF NOT EXISTS idx_courses_department ON public.courses(department);
CREATE INDEX IF NOT EXISTS idx_courses_semester ON public.courses(semester);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON public.enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.enrollments(status);
CREATE INDEX IF NOT EXISTS idx_gc_messages_course ON public.gc_messages(course_id);
CREATE INDEX IF NOT EXISTS idx_gc_messages_created ON public.gc_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_gc_message_seen_message ON public.gc_message_seen(message_id);
CREATE INDEX IF NOT EXISTS idx_gc_message_seen_user ON public.gc_message_seen(user_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gc_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gc_message_seen ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ============================================
-- COURSES RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Students can view enrolled courses" ON public.courses;
DROP POLICY IF EXISTS "Instructors can view own courses" ON public.courses;
DROP POLICY IF EXISTS "Instructors can create courses" ON public.courses;
DROP POLICY IF EXISTS "Instructors can update own courses" ON public.courses;

CREATE POLICY "Students can view enrolled courses"
    ON public.courses FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Instructors can view own courses"
    ON public.courses FOR SELECT
    USING (instructor_id = auth.uid());

CREATE POLICY "Instructors can create courses"
    ON public.courses FOR INSERT
    WITH CHECK (instructor_id = auth.uid());

CREATE POLICY "Instructors can update own courses"
    ON public.courses FOR UPDATE
    USING (instructor_id = auth.uid())
    WITH CHECK (instructor_id = auth.uid());

-- ============================================
-- ENROLLMENTS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Students can view own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Students can create enrollment requests" ON public.enrollments;
DROP POLICY IF EXISTS "Students can update own enrollment" ON public.enrollments;
DROP POLICY IF EXISTS "Students can update own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Students can delete own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Students can create enrollments" ON public.enrollments;

CREATE POLICY "Students can view own enrollments"
    ON public.enrollments FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "Students can create enrollment requests"
    ON public.enrollments FOR INSERT
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can create enrollments"
    ON public.enrollments FOR INSERT
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own enrollments"
    ON public.enrollments FOR UPDATE
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can delete own enrollments"
    ON public.enrollments FOR DELETE
    USING (student_id = auth.uid());

-- ============================================
-- GC MESSAGES RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Students can view course messages" ON public.gc_messages;
DROP POLICY IF EXISTS "Students can create messages" ON public.gc_messages;
DROP POLICY IF EXISTS "Students can update own messages" ON public.gc_messages;

CREATE POLICY "Students can view course messages"
    ON public.gc_messages FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Students can create messages"
    ON public.gc_messages FOR INSERT
    WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Students can update own messages"
    ON public.gc_messages FOR UPDATE
    USING (sender_id = auth.uid())
    WITH CHECK (sender_id = auth.uid());

-- ============================================
-- GC MESSAGE SEEN RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view seen receipts" ON public.gc_message_seen;
DROP POLICY IF EXISTS "Users can create seen receipts" ON public.gc_message_seen;

CREATE POLICY "Users can view seen receipts"
    ON public.gc_message_seen FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create seen receipts"
    ON public.gc_message_seen FOR INSERT
    WITH CHECK (user_id = auth.uid());
