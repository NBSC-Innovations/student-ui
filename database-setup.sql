-- ============================================================
-- STUDENT UI - Full Database Setup
-- Run this in Supabase SQL Editor
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student', 'instructor', 'system_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE enrollment_status AS ENUM ('pending', 'active', 'completed', 'dropped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'student',
    student_id TEXT UNIQUE,
    department TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGN UP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- COURSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can upsert courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can update courses" ON public.courses;

-- Any authenticated user can read courses (needed to fetch enrolled courses)
CREATE POLICY "Anyone can view active courses"
  ON public.courses FOR SELECT
  USING (auth.role() = 'authenticated');

-- Any authenticated user can insert courses (students insert from OCR)
CREATE POLICY "Authenticated users can upsert courses"
  ON public.courses FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Any authenticated user can update courses
CREATE POLICY "Authenticated users can update courses"
  ON public.courses FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ============================================================
-- ENROLLMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    status enrollment_status NOT NULL DEFAULT 'active',
    enrolled_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(student_id, course_id)
);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Students can create enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Students can update own enrollments" ON public.enrollments;

CREATE POLICY "Students can view own enrollments"
  ON public.enrollments FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Students can create enrollments"
  ON public.enrollments FOR INSERT
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own enrollments"
  ON public.enrollments FOR UPDATE
  USING (student_id = auth.uid());

-- ============================================================
-- GC MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gc_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gc_messages_course   ON public.gc_messages(course_id);
CREATE INDEX IF NOT EXISTS idx_gc_messages_created  ON public.gc_messages(created_at);

ALTER TABLE public.gc_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enrolled students can read messages"  ON public.gc_messages;
DROP POLICY IF EXISTS "Enrolled students can send messages"  ON public.gc_messages;

CREATE POLICY "Enrolled students can read messages"
  ON public.gc_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE student_id = auth.uid()
        AND course_id = public.gc_messages.course_id
        AND status = 'active'
    )
  );

CREATE POLICY "Enrolled students can send messages"
  ON public.gc_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE student_id = auth.uid()
        AND course_id = public.gc_messages.course_id
        AND status = 'active'
    )
  );

-- ============================================================
-- Enable Realtime for gc_messages
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.gc_messages;
