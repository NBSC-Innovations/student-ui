-- ============================================
-- SECTIONS, COURSES, AND GROUP CHAT SYNC SCHEMA
-- ============================================
-- This schema defines the database structure for section-based group chats
-- where instructors create sections and students join by matching section codes
-- ============================================

-- ============================================
-- CLEANUP: Drop existing tables and triggers
-- ============================================

-- Drop triggers
DROP TRIGGER IF EXISTS create_course_and_group_chat_on_section ON public.sections;
DROP TRIGGER IF EXISTS add_student_to_chat_on_enrollment ON public.enrollments;

-- Drop functions
DROP FUNCTION IF EXISTS public.create_course_and_group_chat_for_section() CASCADE;
DROP FUNCTION IF EXISTS public.add_student_to_group_chat() CASCADE;

-- Drop tables in reverse order of creation (respecting foreign keys)
DROP TABLE IF EXISTS public.group_chat_members CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.group_chats CASCADE;
DROP TABLE IF EXISTS public.enrollments CASCADE;
DROP TABLE IF EXISTS public.sections CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================
-- PROFILES TABLE (User Information)
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    student_id TEXT UNIQUE, -- Student number
    role TEXT NOT NULL CHECK (role IN ('student', 'instructor', 'admin')),
    department TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- COURSES TABLE (Auto-created from Sections)
-- ============================================

CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE, -- e.g., "IT101", "CS 201" (from section code)
    title TEXT NOT NULL, -- e.g., "System Integration and Architecture" (from section description)
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
-- SECTIONS TABLE (Instructor-created Sections)
-- ============================================

CREATE TABLE IF NOT EXISTS public.sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., "BSIT-3A", "BSCS3B" (section code)
    description TEXT, -- e.g., "System Integration and Architecture" (subject description)
    instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    schedule JSONB,
    room TEXT,
    max_capacity INTEGER DEFAULT 40,
    current_enrollment INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- ENROLLMENTS TABLE (Student Course Enrollment)
-- ============================================

CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'completed', 'dropped')) DEFAULT 'pending',
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    final_grade TEXT,
    UNIQUE(student_id, course_id)
);

-- ============================================
-- GROUP CHATS TABLE (One per Course)
-- ============================================

CREATE TABLE IF NOT EXISTS public.group_chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL UNIQUE REFERENCES public.courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., "BSIT 3A - System Integration and Architecture"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- MESSAGES TABLE (Chat Messages)
-- ============================================

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_chat_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- GC_MESSAGES TABLE (Unified Message System)
-- ============================================

CREATE TABLE IF NOT EXISTS public.gc_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE NOT NULL,
    reply_to UUID REFERENCES public.gc_messages(id) ON DELETE SET NULL
);

-- Indexes for gc_messages
CREATE INDEX IF NOT EXISTS idx_gc_messages_course ON public.gc_messages(course_id);
CREATE INDEX IF NOT EXISTS idx_gc_messages_sender ON public.gc_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_gc_messages_created ON public.gc_messages(created_at);

-- ============================================
-- GROUP CHAT MEMBERS TABLE (Chat Membership)
-- ============================================

CREATE TABLE IF NOT EXISTS public.group_chat_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_chat_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(group_chat_id, user_id)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Courses indexes
CREATE INDEX IF NOT EXISTS idx_courses_instructor ON public.courses(instructor_id);
CREATE INDEX IF NOT EXISTS idx_courses_code ON public.courses(code);
CREATE INDEX IF NOT EXISTS idx_courses_active ON public.courses(is_active);

-- Sections indexes
CREATE INDEX IF NOT EXISTS idx_sections_instructor ON public.sections(instructor_id);
CREATE INDEX IF NOT EXISTS idx_sections_course ON public.sections(course_id);
CREATE INDEX IF NOT EXISTS idx_sections_name ON public.sections(name);

-- Enrollments indexes
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON public.enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON public.enrollments(status);

-- Group chat indexes
CREATE INDEX IF NOT EXISTS idx_group_chats_course ON public.group_chats(course_id);
CREATE INDEX IF NOT EXISTS idx_messages_group_chat ON public.messages(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_group ON public.group_chat_members(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_user ON public.group_chat_members(user_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gc_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES FOR PROFILES
-- ============================================

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "Users can view profiles of course members"
    ON public.profiles FOR SELECT
    USING (
        -- Allow viewing own profile
        id = auth.uid()
        OR
        -- Allow viewing instructor profiles of enrolled courses
        EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.courses c ON e.course_id = c.id
            WHERE e.student_id = auth.uid()
            AND e.status = 'active'
            AND c.instructor_id = public.profiles.id
        )
        OR
        -- Allow viewing student profiles in instructor's courses
        EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.courses c ON e.course_id = c.id
            WHERE c.instructor_id = auth.uid()
            AND e.student_id = public.profiles.id
            AND e.status = 'active'
        )
    );

-- ============================================
-- RLS POLICIES FOR COURSES
-- ============================================

CREATE POLICY "Instructors can view their courses"
    ON public.courses FOR SELECT
    USING (instructor_id = auth.uid());

CREATE POLICY "Students can view all courses"
    ON public.courses FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create courses"
    ON public.courses FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- RLS POLICIES FOR SECTIONS
-- ============================================

CREATE POLICY "Instructors can view their sections"
    ON public.sections FOR SELECT
    USING (instructor_id = auth.uid());

CREATE POLICY "Authenticated users can view sections"
    ON public.sections FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create sections"
    ON public.sections FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Instructors can update their sections"
    ON public.sections FOR UPDATE
    USING (instructor_id = auth.uid());

CREATE POLICY "Instructors can delete their sections"
    ON public.sections FOR DELETE
    USING (instructor_id = auth.uid());

-- ============================================
-- RLS POLICIES FOR ENROLLMENTS
-- ============================================

CREATE POLICY "Students can view own enrollments"
    ON public.enrollments FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "Instructors can view course enrollments"
    ON public.enrollments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.courses
            WHERE public.courses.id = public.enrollments.course_id
            AND public.courses.instructor_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can create enrollments"
    ON public.enrollments FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- RLS POLICIES FOR GROUP CHATS
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

CREATE POLICY "Authenticated users can create group chats"
    ON public.group_chats FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- RLS POLICIES FOR MESSAGES
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

CREATE POLICY "Users can send messages to their chats"
    ON public.messages FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.group_chat_members
            WHERE group_chat_id = public.messages.group_chat_id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Instructors can pin messages"
    ON public.messages FOR UPDATE
    USING (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'instructor'
        )
    );

-- ============================================
-- RLS POLICIES FOR GROUP CHAT MEMBERS
-- ============================================

CREATE POLICY "Users can view their chat memberships"
    ON public.group_chat_members FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can create chat memberships"
    ON public.group_chat_members FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Service role can create chat memberships"
    ON public.group_chat_members FOR INSERT
    WITH CHECK (true);

-- ============================================
-- FUNCTIONS AND TRIGGERS FOR SECTION-COURSE-GROUP CHAT SYNC
-- ============================================

-- Function to create course and group chat when section is created
CREATE OR REPLACE FUNCTION public.create_course_and_group_chat_for_section()
RETURNS TRIGGER AS $$
DECLARE
    new_course_id UUID;
    new_group_chat_id UUID;
BEGIN
    -- Check if course with this code already exists
    SELECT id INTO new_course_id FROM public.courses WHERE code = NEW.name;

    IF new_course_id IS NULL THEN
        -- Create a new course for the section
        INSERT INTO public.courses (code, title, description, instructor_id, is_active)
        VALUES (
            NEW.name, -- Section code becomes course code
            COALESCE(NEW.description, NEW.name), -- Description becomes course title
            NEW.description,
            NEW.instructor_id,
            true
        )
        RETURNING id INTO new_course_id;
    END IF;
    
    -- Update the section with the course_id
    UPDATE public.sections
    SET course_id = new_course_id
    WHERE id = NEW.id;
    
    -- Check if group chat for this course already exists
    SELECT id INTO new_group_chat_id FROM public.group_chats WHERE course_id = new_course_id;

    IF new_group_chat_id IS NULL THEN
        -- Create a group chat for the course
        INSERT INTO public.group_chats (course_id, name)
        VALUES (
            new_course_id,
            NEW.name || COALESCE(' - ' || NEW.description, '')
        )
        RETURNING id INTO new_group_chat_id;
    END IF;
    
    -- Add the instructor to the group chat
    IF NEW.instructor_id IS NOT NULL THEN
        INSERT INTO public.group_chat_members (group_chat_id, user_id)
        VALUES (new_group_chat_id, NEW.instructor_id)
        ON CONFLICT (group_chat_id, user_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create course and group chat on section creation
DROP TRIGGER IF EXISTS create_course_and_group_chat_on_section ON public.sections;
CREATE TRIGGER create_course_and_group_chat_on_section
    AFTER INSERT ON public.sections
    FOR EACH ROW EXECUTE FUNCTION public.create_course_and_group_chat_for_section();

-- Function to add student to group chat on enrollment
CREATE OR REPLACE FUNCTION public.add_student_to_group_chat()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' THEN
        -- Check if group chat exists for this course
        IF EXISTS (SELECT 1 FROM public.group_chats WHERE course_id = NEW.course_id) THEN
            INSERT INTO public.group_chat_members (group_chat_id, user_id)
            SELECT id, NEW.student_id FROM public.group_chats WHERE course_id = NEW.course_id
            ON CONFLICT (group_chat_id, user_id) DO NOTHING;
        END IF;
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
-- MESSAGE FUNCTIONS (RPC for Unified Messaging)
-- ============================================

-- Function to insert messages
DROP FUNCTION IF EXISTS public.insert_message(UUID, UUID, TEXT);

CREATE FUNCTION public.insert_message(
  p_course_id UUID,
  p_sender_id UUID,
  p_content TEXT
)
RETURNS SETOF public.gc_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_instructor_id UUID;
BEGIN
  -- Check if the sender is the instructor of the course
  SELECT instructor_id INTO v_course_instructor_id
  FROM public.courses
  WHERE id = p_course_id;
  
  -- Check if sender is either the instructor or an enrolled student
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments 
    WHERE course_id = p_course_id 
    AND student_id = p_sender_id 
    AND status = 'active'
  ) AND p_sender_id != v_course_instructor_id THEN
    RAISE EXCEPTION 'User is not authorized to send messages to this course';
  END IF;
  
  -- Insert the message and return the inserted row
  RETURN QUERY
  INSERT INTO public.gc_messages (course_id, sender_id, content, is_deleted, is_pinned)
  VALUES (p_course_id, p_sender_id, p_content, false, false)
  RETURNING *;
END;
$$;

-- Function to fetch messages
DROP FUNCTION IF EXISTS public.fetch_course_messages(UUID);

CREATE FUNCTION public.fetch_course_messages(
  p_course_id UUID
)
RETURNS SETOF public.gc_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_instructor_id UUID;
  v_user_id UUID;
BEGIN
  -- Get the current user ID
  v_user_id := auth.uid();
  
  -- Check if the sender is the instructor of the course
  SELECT instructor_id INTO v_course_instructor_id
  FROM public.courses
  WHERE id = p_course_id;
  
  -- Check if user is either the instructor or an enrolled student
  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments 
    WHERE course_id = p_course_id 
    AND student_id = v_user_id 
    AND status = 'active'
  ) AND v_user_id != v_course_instructor_id THEN
    RAISE EXCEPTION 'User is not authorized to view messages for this course';
  END IF;
  
  -- Fetch and return all non-deleted messages for the course
  RETURN QUERY
  SELECT * FROM public.gc_messages
  WHERE course_id = p_course_id
  AND is_deleted = false
  ORDER BY created_at ASC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.insert_message TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_course_messages TO authenticated;

-- ============================================
-- RLS POLICIES FOR GC_MESSAGES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Students can read messages from enrolled courses" ON public.gc_messages;
DROP POLICY IF EXISTS "Students can send messages to enrolled courses" ON public.gc_messages;
DROP POLICY IF EXISTS "Instructors can read messages from their courses" ON public.gc_messages;
DROP POLICY IF EXISTS "Instructors can send messages to their courses" ON public.gc_messages;

-- Policy for students to read messages
CREATE POLICY "Students can read messages from enrolled courses"
    ON public.gc_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.enrollments
            WHERE student_id = auth.uid()
            AND course_id = public.gc_messages.course_id
            AND status = 'active'
        )
    );

-- Policy for instructors to read messages
CREATE POLICY "Instructors can read messages from their courses"
    ON public.gc_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.courses
            WHERE id = public.gc_messages.course_id
            AND instructor_id = auth.uid()
        )
    );

-- Policy for students to send messages
CREATE POLICY "Students can send messages to enrolled courses"
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

-- Policy for instructors to send messages
CREATE POLICY "Instructors can send messages to their courses"
    ON public.gc_messages FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.courses
            WHERE id = public.gc_messages.course_id
            AND instructor_id = auth.uid()
        )
    );

-- ============================================
-- SUMMARY OF SYNC FLOW
-- ============================================
-- 1. Instructor creates section with code (e.g., "BSIT 3A") and description
-- 2. Trigger creates a course with the same code and description
-- 3. Trigger creates a group chat linked to the course
-- 4. Instructor is automatically added to the group chat
-- 5. Student matches section code on student side
-- 6. Student is enrolled in the course (status='active')
-- 7. Trigger adds student to the group chat
-- 8. Both instructor and student can now communicate in the section's group chat
-- ============================================
