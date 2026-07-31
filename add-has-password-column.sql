-- Add has_password column to profiles table
-- This column tracks whether a user has set a password for email authentication
-- Run this in Supabase SQL Editor

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS has_password BOOLEAN NOT NULL DEFAULT false;
