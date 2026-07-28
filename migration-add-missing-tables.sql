-- ============================================
-- MIGRATION: Add missing gc_message_seen table and is_pinned column
-- Run this in Supabase SQL Editor
-- ============================================

-- Add is_pinned column to gc_messages if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'gc_messages' 
    AND column_name = 'is_pinned'
  ) THEN
    ALTER TABLE public.gc_messages ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE NOT NULL;
  END IF;
END $$;

-- Create gc_message_seen table
CREATE TABLE IF NOT EXISTS public.gc_message_seen (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.gc_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seen_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(message_id, user_id)
);

-- Create indexes for gc_message_seen
CREATE INDEX IF NOT EXISTS idx_gc_message_seen_message ON public.gc_message_seen(message_id);
CREATE INDEX IF NOT EXISTS idx_gc_message_seen_user ON public.gc_message_seen(user_id);

-- Enable RLS on gc_message_seen
ALTER TABLE public.gc_message_seen ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for gc_message_seen
DROP POLICY IF EXISTS "Users can view seen receipts for their messages" ON public.gc_message_seen;
DROP POLICY IF EXISTS "Users can create seen receipts" ON public.gc_message_seen;

CREATE POLICY "Users can view seen receipts for their messages"
    ON public.gc_message_seen FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.gc_messages
            WHERE id = public.gc_message_seen.message_id
            AND sender_id = auth.uid()
        )
    );

CREATE POLICY "Users can create seen receipts"
    ON public.gc_message_seen FOR INSERT
    WITH CHECK (user_id = auth.uid());
