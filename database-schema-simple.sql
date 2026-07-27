-- Incremental Migration for Group Chat Functionality
-- Run this after database-schema-clean.sql to add group chat features

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
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_messages_group_chat ON public.messages(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_group ON public.group_chat_members(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_user ON public.group_chat_members(user_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;

-- ============================================
-- GROUP CHATS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view chats they are members of" ON public.group_chats;
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

DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.messages;
CREATE POLICY "Users can view messages in their chats"
    ON public.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.group_chat_members
            WHERE group_chat_id = public.messages.group_chat_id
            AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can create messages in their chats" ON public.messages;
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
CREATE POLICY "Users can view their chat memberships"
    ON public.group_chat_members FOR SELECT
    USING (user_id = auth.uid());

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to auto-create group chat when course is created
CREATE OR REPLACE FUNCTION public.create_group_chat_for_course()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.group_chats (course_id, name)
    VALUES (NEW.id, NEW.code || ' - ' || NEW.title)
    ON CONFLICT (course_id) DO NOTHING;
    
    -- Add instructor to the group chat
    IF NEW.instructor_id IS NOT NULL THEN
        INSERT INTO public.group_chat_members (group_chat_id, user_id)
        SELECT id, NEW.instructor_id FROM public.group_chats WHERE course_id = NEW.id
        ON CONFLICT (group_chat_id, user_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
$$ LANGUAGE plpgsql;

-- Trigger to add student to group chat on enrollment
DROP TRIGGER IF EXISTS add_student_to_chat_on_enrollment ON public.enrollments;
CREATE TRIGGER add_student_to_chat_on_enrollment
    AFTER INSERT OR UPDATE ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION public.add_student_to_group_chat();
