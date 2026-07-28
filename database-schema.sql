-- ============================================================
-- STUDENT MANAGEMENT SYSTEM - Complete Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================
-- This schema includes:
-- - Core tables (profiles, courses, enrollments, etc.)
-- - Group chat functionality
-- - Email domain validation (@nbsc.edu.ph only)
-- - Comprehensive RLS policies
-- - Functions and triggers
-- - Helper views
-- ============================================================

-- ============================================
-- CLEANUP: Drop existing data and publications
-- ============================================

-- Drop views
DROP VIEW IF EXISTS public.gradebook_view CASCADE;
DROP VIEW IF EXISTS public.instructor_dashboard_view CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS public.update_course_student_count() CASCADE;

-- Drop tables in reverse order of creation (respecting foreign keys)
DROP TABLE IF EXISTS public.gc_message_seen CASCADE;
DROP TABLE IF EXISTS public.gc_messages CASCADE;
DROP TABLE IF EXISTS public.group_chat_members CASCADE;
DROP TABLE IF EXISTS public.group_chats CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
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

-- Drop enums
DROP TYPE IF EXISTS public.grade_scale CASCADE;
DROP TYPE IF EXISTS public.submission_status CASCADE;
DROP TYPE IF EXISTS public.assignment_status CASCADE;
DROP TYPE IF EXISTS public.enrollment_status CASCADE;
DROP TYPE IF EXISTS public.user_role CASCADE;

-- ============================================
-- Enable UUID extension
-- ============================================
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

DO $$ BEGIN
  CREATE TYPE assignment_status AS ENUM ('draft', 'published', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM ('draft', 'submitted', 'graded', 'late');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE grade_scale AS ENUM ('A', 'B', 'C', 'D', 'F', 'INC', 'DRP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'student',
    student_id TEXT UNIQUE, -- Official student ID from institution
    department TEXT,
    avatar_url TEXT,
    bio TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Email domain validation constraint
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_email_domain_check
  CHECK (email LIKE '%@nbsc.edu.ph');

-- ============================================
-- COURSES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE, -- e.g., "IT101", "CS 201"
    title TEXT NOT NULL,
    description TEXT,
    instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    department TEXT,
    credits INTEGER DEFAULT 3,
    max_students INTEGER,
    current_students INTEGER DEFAULT 0,
    semester TEXT, -- e.g., "Fall 2024", "1st Semester 2024-2025"
    academic_year TEXT,
    schedule JSONB, -- Store schedule as JSON: {"days": ["M", "W", "F"], "time": "08:00-09:00", "room": "Room 101"}
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
    final_grade grade_scale,
    UNIQUE(student_id, course_id)
);

-- ============================================
-- SECTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., "BSIT-3A", "BSCS3B"
    instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    schedule JSONB,
    room TEXT,
    max_capacity INTEGER DEFAULT 40,
    current_enrollment INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(course_id, name)
);

-- ============================================
-- SECTION ENROLLMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.section_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(enrollment_id, section_id)
);

-- ============================================
-- ASSIGNMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    max_points INTEGER DEFAULT 100,
    status assignment_status NOT NULL DEFAULT 'draft',
    attachment_urls TEXT[], -- Array of file URLs
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- SUBMISSIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT,
    attachment_urls TEXT[],
    status submission_status NOT NULL DEFAULT 'draft',
    points_earned INTEGER,
    feedback TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE,
    graded_at TIMESTAMP WITH TIME ZONE,
    graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(assignment_id, student_id)
);

-- ============================================
-- STUDENT PROGRESS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.student_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    total_assignments_completed INTEGER DEFAULT 0,
    total_assignments INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(student_id, course_id)
);

-- ============================================
-- ANNOUNCEMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- GRADES TABLE (detailed gradebook)
-- ============================================

CREATE TABLE IF NOT EXISTS public.grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    score NUMERIC(5, 2),
    max_score NUMERIC(5, 2),
    percentage NUMERIC(5, 2),
    graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    graded_at TIMESTAMP WITH TIME ZONE,
    comments TEXT,
    UNIQUE(submission_id)
);

-- ============================================
-- ATTENDANCE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
    remarks TEXT,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(student_id, section_id, date)
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('assignment', 'grade', 'announcement', 'enrollment', 'system')),
    is_read BOOLEAN DEFAULT false,
    action_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- SYSTEM SETTINGS TABLE (for system admin)
-- ============================================

CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- AUDIT LOG TABLE (for system admin)
-- ============================================

CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- GROUP CHATS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.group_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(course_id)
);

-- ============================================
-- MESSAGES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_chat_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- GROUP CHAT MEMBERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.group_chat_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_chat_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(group_chat_id, user_id)
);

-- ============================================
-- GC MESSAGES TABLE (legacy/simple version)
-- ============================================

CREATE TABLE IF NOT EXISTS public.gc_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    reply_to UUID REFERENCES public.gc_messages(id) ON DELETE SET NULL
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
CREATE INDEX IF NOT EXISTS idx_sections_course ON public.sections(course_id);
CREATE INDEX IF NOT EXISTS idx_sections_instructor ON public.sections(instructor_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON public.assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON public.assignments(status);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions(status);
CREATE INDEX IF NOT EXISTS idx_student_progress_student ON public.student_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_course ON public.student_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_announcements_course ON public.announcements(course_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_course ON public.grades(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_section ON public.attendance(section_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON public.audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_group_chat ON public.messages(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_group ON public.group_chat_members(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_user ON public.group_chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_gc_messages_course ON public.gc_messages(course_id);
CREATE INDEX IF NOT EXISTS idx_gc_messages_created ON public.gc_messages(created_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gc_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "System admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "System admins can update any profile" ON public.profiles;

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
DROP POLICY IF EXISTS "Anyone can view active courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can upsert courses" ON public.courses;
DROP POLICY IF EXISTS "Authenticated users can update courses" ON public.courses;

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

CREATE POLICY "Authenticated users can upsert courses"
    ON public.courses FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update courses"
    ON public.courses FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

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
-- SECTIONS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Students can view enrolled sections" ON public.sections;
DROP POLICY IF EXISTS "Instructors can view own sections" ON public.sections;
DROP POLICY IF EXISTS "Instructors can create sections" ON public.sections;
DROP POLICY IF EXISTS "Instructors can update own sections" ON public.sections;

CREATE POLICY "Students can view enrolled sections"
    ON public.sections FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.enrollments e
            WHERE e.student_id = auth.uid()
            AND e.course_id = public.sections.course_id
        )
    );

CREATE POLICY "Instructors can view own sections"
    ON public.sections FOR SELECT
    USING (instructor_id = auth.uid());

CREATE POLICY "Instructors can create sections"
    ON public.sections FOR INSERT
    WITH CHECK (instructor_id = auth.uid());

CREATE POLICY "Instructors can update own sections"
    ON public.sections FOR UPDATE
    USING (instructor_id = auth.uid())
    WITH CHECK (instructor_id = auth.uid());

-- ============================================
-- ASSIGNMENTS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Students can view course assignments" ON public.assignments;
DROP POLICY IF EXISTS "Instructors can view course assignments" ON public.assignments;
DROP POLICY IF EXISTS "Instructors can create assignments" ON public.assignments;
DROP POLICY IF EXISTS "Instructors can update own assignments" ON public.assignments;

CREATE POLICY "Students can view course assignments"
    ON public.assignments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.enrollments
            WHERE student_id = auth.uid()
            AND course_id = public.assignments.course_id
            AND status = 'active'
        )
    );

CREATE POLICY "Instructors can view course assignments"
    ON public.assignments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.courses
            WHERE id = public.assignments.course_id
            AND instructor_id = auth.uid()
        )
    );

CREATE POLICY "Instructors can create assignments"
    ON public.assignments FOR INSERT
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Instructors can update own assignments"
    ON public.assignments FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- ============================================
-- SUBMISSIONS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Students can view own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Instructors can view course submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students can create submissions" ON public.submissions;
DROP POLICY IF EXISTS "Students can update own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Instructors can grade submissions" ON public.submissions;

CREATE POLICY "Students can view own submissions"
    ON public.submissions FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "Instructors can view course submissions"
    ON public.submissions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.assignments a
            JOIN public.courses c ON a.course_id = c.id
            WHERE a.id = public.submissions.assignment_id
            AND c.instructor_id = auth.uid()
        )
    );

CREATE POLICY "Students can create submissions"
    ON public.submissions FOR INSERT
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own submissions"
    ON public.submissions FOR UPDATE
    USING (student_id = auth.uid())
    WITH CHECK (student_id = auth.uid());

CREATE POLICY "Instructors can grade submissions"
    ON public.submissions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.assignments a
            JOIN public.courses c ON a.course_id = c.id
            WHERE a.id = public.submissions.assignment_id
            AND c.instructor_id = auth.uid()
        )
    );

-- ============================================
-- STUDENT PROGRESS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Students can view own progress" ON public.student_progress;
DROP POLICY IF EXISTS "Instructors can view course progress" ON public.student_progress;

CREATE POLICY "Students can view own progress"
    ON public.student_progress FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "Instructors can view course progress"
    ON public.student_progress FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.courses
            WHERE id = public.student_progress.course_id
            AND instructor_id = auth.uid()
        )
    );

-- ============================================
-- ANNOUNCEMENTS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Students can view course announcements" ON public.announcements;
DROP POLICY IF EXISTS "Instructors can view course announcements" ON public.announcements;
DROP POLICY IF EXISTS "Instructors can create announcements" ON public.announcements;
DROP POLICY IF EXISTS "Instructors can update own announcements" ON public.announcements;

CREATE POLICY "Students can view course announcements"
    ON public.announcements FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.enrollments
            WHERE student_id = auth.uid()
            AND course_id = public.announcements.course_id
            AND status = 'active'
        )
    );

CREATE POLICY "Instructors can view course announcements"
    ON public.announcements FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.courses
            WHERE id = public.announcements.course_id
            AND instructor_id = auth.uid()
        )
    );

CREATE POLICY "Instructors can create announcements"
    ON public.announcements FOR INSERT
    WITH CHECK (author_id = auth.uid());

CREATE POLICY "Instructors can update own announcements"
    ON public.announcements FOR UPDATE
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

-- ============================================
-- GRADES RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Students can view own grades" ON public.grades;
DROP POLICY IF EXISTS "Instructors can view course grades" ON public.grades;
DROP POLICY IF EXISTS "Instructors can manage course grades" ON public.grades;

CREATE POLICY "Students can view own grades"
    ON public.grades FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "Instructors can view course grades"
    ON public.grades FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.courses
            WHERE id = public.grades.course_id
            AND instructor_id = auth.uid()
        )
    );

CREATE POLICY "Instructors can manage course grades"
    ON public.grades FOR ALL
    USING (
        graded_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.courses
            WHERE id = public.grades.course_id
            AND instructor_id = auth.uid()
        )
    );

-- ============================================
-- ATTENDANCE RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Students can view own attendance" ON public.attendance;
DROP POLICY IF EXISTS "Instructors can view section attendance" ON public.attendance;
DROP POLICY IF EXISTS "Instructors can manage section attendance" ON public.attendance;

CREATE POLICY "Students can view own attendance"
    ON public.attendance FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "Instructors can view section attendance"
    ON public.attendance FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.sections
            WHERE id = public.attendance.section_id
            AND instructor_id = auth.uid()
        )
    );

CREATE POLICY "Instructors can manage section attendance"
    ON public.attendance FOR ALL
    USING (
        recorded_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.sections
            WHERE id = public.attendance.section_id
            AND instructor_id = auth.uid()
        )
    );

-- ============================================
-- NOTIFICATIONS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can create notifications"
    ON public.notifications FOR INSERT
    WITH CHECK (true);

-- ============================================
-- SYSTEM SETTINGS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "System admins can view settings" ON public.system_settings;
DROP POLICY IF EXISTS "System admins can update settings" ON public.system_settings;

CREATE POLICY "System admins can view settings"
    ON public.system_settings FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "System admins can update settings"
    ON public.system_settings FOR ALL
    USING (auth.role() = 'authenticated');

-- ============================================
-- AUDIT LOG RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "System admins can view audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "System can create audit logs" ON public.audit_log;

CREATE POLICY "System admins can view audit logs"
    ON public.audit_log FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "System can create audit logs"
    ON public.audit_log FOR INSERT
    WITH CHECK (true);

-- ============================================
-- GROUP CHATS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view chats they are members of" ON public.group_chats;
DROP POLICY IF EXISTS "Authenticated users can create group chats" ON public.group_chats;

CREATE POLICY "Users can view chats they are members of"
    ON public.group_chats FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.group_chat_members
            WHERE group_chat_id = public.group_chats.id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can create group chats"
    ON public.group_chats FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- MESSAGES RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages in their chats" ON public.messages;

CREATE POLICY "Users can view messages in their chats"
    ON public.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.group_chat_members
            WHERE group_chat_id = public.messages.group_chat_id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create messages in their chats"
    ON public.messages FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.group_chat_members
            WHERE group_chat_id = public.messages.group_chat_id
            AND user_id = auth.uid()
        )
    );

-- ============================================
-- GROUP CHAT MEMBERS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view their chat memberships" ON public.group_chat_members;
DROP POLICY IF EXISTS "Authenticated users can create chat memberships" ON public.group_chat_members;

CREATE POLICY "Users can view their chat memberships"
    ON public.group_chat_members FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can create chat memberships"
    ON public.group_chat_members FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- GC MESSAGES RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Enrolled students can read messages" ON public.gc_messages;
DROP POLICY IF EXISTS "Enrolled students can send messages" ON public.gc_messages;

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

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_courses_updated_at ON public.courses;
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sections_updated_at ON public.sections;
CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON public.sections
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_assignments_updated_at ON public.assignments;
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_submissions_updated_at ON public.submissions;
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON public.submissions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_student_progress_updated_at ON public.student_progress;
CREATE TRIGGER update_student_progress_updated_at BEFORE UPDATE ON public.student_progress
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_announcements_updated_at ON public.announcements;
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON public.announcements
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to validate email domain and determine role
CREATE OR REPLACE FUNCTION public.validate_email_and_determine_role(p_email TEXT)
RETURNS user_role AS $$
DECLARE
    v_domain TEXT;
    v_local_part TEXT;
    v_role user_role;
BEGIN
    v_domain := split_part(p_email, '@', 2);
    v_local_part := split_part(p_email, '@', 1);

    IF v_domain != 'nbsc.edu.ph' THEN
        RAISE EXCEPTION 'Email domain must be @nbsc.edu.ph';
    END IF;

    IF v_local_part ~ '^\d+' THEN
        v_role := 'student';
    ELSE
        v_role := 'instructor';
    END IF;

    RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle new user creation from OAuth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role user_role;
    v_student_id TEXT;
BEGIN
    v_role := public.validate_email_and_determine_role(NEW.email);

    IF v_role = 'student' THEN
        v_student_id := split_part(NEW.email, '@', 1);
    ELSE
        v_student_id := NULL;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role, student_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        v_role,
        v_student_id
    );
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        DELETE FROM auth.users WHERE id = NEW.id;
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update student progress
CREATE OR REPLACE FUNCTION public.update_student_progress()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'graded') THEN
        INSERT INTO public.student_progress (student_id, course_id, completion_percentage, total_assignments_completed, total_assignments)
        VALUES (
            NEW.student_id,
            (SELECT course_id FROM public.assignments WHERE id = NEW.assignment_id),
            0,
            0,
            0
        )
        ON CONFLICT (student_id, course_id) DO UPDATE SET
            completion_percentage = (
                SELECT ROUND(
                    (COUNT(*) FILTER (WHERE s.status = 'graded')::NUMERIC / COUNT(*)::NUMERIC) * 100
                )
                FROM public.submissions s
                JOIN public.assignments a ON s.assignment_id = a.id
                WHERE s.student_id = NEW.student_id
                AND a.course_id = (SELECT course_id FROM public.assignments WHERE id = NEW.assignment_id)
            ),
            total_assignments_completed = (
                SELECT COUNT(*) FILTER (WHERE s.status = 'graded')
                FROM public.submissions s
                JOIN public.assignments a ON s.assignment_id = a.id
                WHERE s.student_id = NEW.student_id
                AND a.course_id = (SELECT course_id FROM public.assignments WHERE id = NEW.assignment_id)
            ),
            total_assignments = (
                SELECT COUNT(*)
                FROM public.assignments a
                WHERE a.course_id = (SELECT course_id FROM public.assignments WHERE id = NEW.assignment_id)
                AND a.status = 'published'
            ),
            last_accessed_at = TIMEZONE('utc'::text, NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update progress on submission changes
DROP TRIGGER IF EXISTS update_progress_on_submission ON public.submissions;
CREATE TRIGGER update_progress_on_submission
    AFTER INSERT OR UPDATE ON public.submissions
    FOR EACH ROW EXECUTE FUNCTION public.update_student_progress();

-- Function to update course enrollment count
CREATE OR REPLACE FUNCTION public.update_course_enrollment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.courses SET current_students = current_students + 1 WHERE id = NEW.course_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.courses SET current_students = current_students - 1 WHERE id = OLD.course_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update enrollment count
DROP TRIGGER IF EXISTS update_enrollment_count ON public.enrollments;
CREATE TRIGGER update_enrollment_count
    AFTER INSERT OR DELETE ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION public.update_course_enrollment_count();

-- Function to create notification
CREATE OR REPLACE FUNCTION public.create_notification(
    p_user_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT,
    p_action_url TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, action_url)
    VALUES (p_user_id, p_title, p_message, p_type, p_action_url);
END;
$$ LANGUAGE plpgsql;

-- Function to auto-create group chat when course is created
CREATE OR REPLACE FUNCTION public.create_group_chat_for_course()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.group_chats (course_id, name)
    VALUES (NEW.id, NEW.code || ' - ' || NEW.title)
    ON CONFLICT (course_id) DO NOTHING;

    IF NEW.instructor_id IS NOT NULL THEN
        INSERT INTO public.group_chat_members (group_chat_id, user_id)
        SELECT id, NEW.instructor_id FROM public.group_chats WHERE course_id = NEW.id
        ON CONFLICT (group_chat_id, user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create group chat on course creation
DROP TRIGGER IF EXISTS create_group_chat_on_course ON public.courses;
CREATE TRIGGER create_group_chat_on_course
    AFTER INSERT ON public.courses
    FOR EACH ROW EXECUTE FUNCTION public.create_group_chat_for_course();

-- Function to add student to group chat on enrollment
CREATE OR REPLACE FUNCTION public.add_student_to_group_chat()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' THEN
        INSERT INTO public.group_chat_members (group_chat_id, user_id)
        SELECT id, NEW.student_id FROM public.group_chats WHERE course_id = NEW.course_id
        ON CONFLICT (group_chat_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to add student to group chat on enrollment
DROP TRIGGER IF EXISTS add_student_to_chat_on_enrollment ON public.enrollments;
CREATE TRIGGER add_student_to_chat_on_enrollment
    AFTER INSERT OR UPDATE ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION public.add_student_to_group_chat();

-- ============================================
-- INITIAL SYSTEM SETTINGS
-- ============================================

INSERT INTO public.system_settings (key, value, description) VALUES
('max_enrollment_per_student', '8', 'Maximum number of courses a student can enroll in per semester'),
('allow_late_enrollment', 'false', 'Allow students to enroll after semester starts'),
('grading_scale', '{"A": 90, "B": 80, "C": 70, "D": 60, "F": 0}', 'Default grading scale'),
('academic_year', '2024-2025', 'Current academic year'),
('current_semester', '1st Semester', 'Current semester')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- HELPER VIEWS
-- ============================================

-- View for student dashboard
CREATE OR REPLACE VIEW public.student_dashboard_view AS
SELECT
    p.id as student_id,
    p.full_name,
    p.student_id as student_number,
    c.id as course_id,
    c.code as course_code,
    c.title as course_title,
    e.status as enrollment_status,
    sp.completion_percentage,
    sp.total_assignments_completed,
    sp.total_assignments,
    COUNT(DISTINCT a.id) as pending_assignments
FROM public.profiles p
JOIN public.enrollments e ON p.id = e.student_id
JOIN public.courses c ON e.course_id = c.id
LEFT JOIN public.student_progress sp ON p.id = sp.student_id AND c.id = sp.course_id
LEFT JOIN public.assignments a ON c.id = a.course_id AND a.status = 'published'
    AND NOT EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.assignment_id = a.id AND s.student_id = p.id
    )
WHERE p.role = 'student' AND e.status = 'active'
GROUP BY p.id, p.full_name, p.student_id, c.id, c.code, c.title, e.status, sp.completion_percentage, sp.total_assignments_completed, sp.total_assignments;

-- View for instructor dashboard
CREATE OR REPLACE VIEW public.instructor_dashboard_view AS
SELECT
    p.id as instructor_id,
    p.full_name,
    c.id as course_id,
    c.code as course_code,
    c.title as course_title,
    c.current_students,
    c.max_students,
    COUNT(DISTINCT e.student_id) as total_enrolled,
    COUNT(DISTINCT CASE WHEN s.status = 'submitted' THEN s.id END) as pending_submissions
FROM public.profiles p
JOIN public.courses c ON p.id = c.instructor_id
LEFT JOIN public.enrollments e ON c.id = e.course_id AND e.status = 'active'
LEFT JOIN public.assignments a ON c.id = a.course_id
LEFT JOIN public.submissions s ON a.id = s.assignment_id AND s.status = 'submitted'
WHERE p.role = 'instructor'
GROUP BY p.id, p.full_name, c.id, c.code, c.title, c.current_students, c.max_students;

-- View for gradebook
CREATE OR REPLACE VIEW public.gradebook_view AS
SELECT
    c.id as course_id,
    c.code as course_code,
    c.title as course_title,
    p.id as student_id,
    p.full_name,
    p.student_id as student_number,
    a.id as assignment_id,
    a.title as assignment_title,
    a.max_points,
    s.id as submission_id,
    s.status as submission_status,
    g.score,
    g.percentage,
    g.graded_at
FROM public.courses c
JOIN public.enrollments e ON c.id = e.course_id
JOIN public.profiles p ON e.student_id = p.id
LEFT JOIN public.assignments a ON c.id = a.course_id AND a.status = 'published'
LEFT JOIN public.submissions s ON a.id = s.assignment_id AND p.id = s.student_id
LEFT JOIN public.grades g ON s.id = g.submission_id
WHERE e.status = 'active'
ORDER BY c.code, p.full_name, a.created_at;

-- ============================================
-- ENABLE REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.gc_messages;
