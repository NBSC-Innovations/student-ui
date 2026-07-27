-- Simplified Database Schema for Student-Instructor Communication
-- Focus: Student COR scanning, subject enrollment, and group chat communication

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('student', 'instructor');
CREATE TYPE enrollment_status AS ENUM ('active', 'dropped');

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'student',
    student_id TEXT UNIQUE,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- COURSES TABLE (Subjects)
-- ============================================

CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- ENROLLMENTS TABLE (Student-Subject Links)
-- ============================================

CREATE TABLE public.enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    status enrollment_status NOT NULL DEFAULT 'active',
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(student_id, course_id)
);

-- ============================================
-- GROUP CHATS TABLE
-- ============================================

CREATE TABLE public.group_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(course_id)
);

-- ============================================
-- MESSAGES TABLE
-- ============================================

CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_chat_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- GROUP CHAT MEMBERS TABLE
-- ============================================

CREATE TABLE public.group_chat_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_chat_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(group_chat_id, user_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_student_id ON public.profiles(student_id);
CREATE INDEX idx_courses_instructor ON public.courses(instructor_id);
CREATE INDEX idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX idx_enrollments_course ON public.enrollments(course_id);
CREATE INDEX idx_messages_group_chat ON public.messages(group_chat_id);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_created ON public.messages(created_at);
CREATE INDEX idx_group_chat_members_group ON public.group_chat_members(group_chat_id);
CREATE INDEX idx_group_chat_members_user ON public.group_chat_members(user_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES RLS POLICIES
-- ============================================

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================
-- COURSES RLS POLICIES
-- ============================================

CREATE POLICY "Students can view enrolled courses"
    ON public.courses FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.enrollments
            WHERE student_id = auth.uid()
            AND course_id = public.courses.id
            AND status = 'active'
        )
    );

CREATE POLICY "Instructors can view own courses"
    ON public.courses FOR SELECT
    USING (instructor_id = auth.uid());

-- ============================================
-- ENROLLMENTS RLS POLICIES
-- ============================================

CREATE POLICY "Students can view own enrollments"
    ON public.enrollments FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "Students can create enrollments"
    ON public.enrollments FOR INSERT
    WITH CHECK (
        student_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'student'
        )
    );

-- ============================================
-- GROUP CHATS RLS POLICIES
-- ============================================

CREATE POLICY "Users can view chats they are members of"
    ON public.group_chats FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.group_chat_members
            WHERE group_chat_id = public.group_chats.id
            AND user_id = auth.uid()
        )
    );

-- ============================================
-- MESSAGES RLS POLICIES
-- ============================================

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

CREATE POLICY "Users can view their chat memberships"
    ON public.group_chat_members FOR SELECT
    USING (user_id = auth.uid());

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

-- Apply updated_at trigger
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses
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
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to auto-create group chat when course is created
CREATE OR REPLACE FUNCTION public.create_group_chat_for_course()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.group_chats (course_id, name)
    VALUES (NEW.id, NEW.code || ' - ' || NEW.title);
    
    -- Add instructor to the group chat
    IF NEW.instructor_id IS NOT NULL THEN
        INSERT INTO public.group_chat_members (group_chat_id, user_id)
        SELECT id, NEW.instructor_id FROM public.group_chats WHERE course_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create group chat on course creation
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
$$ LANGUAGE plpgsql;

-- Trigger to add student to group chat on enrollment
CREATE TRIGGER add_student_to_chat_on_enrollment
    AFTER INSERT OR UPDATE ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION public.add_student_to_group_chat();
