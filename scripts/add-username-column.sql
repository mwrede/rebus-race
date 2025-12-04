-- Add username column to submissions table
-- Run this in your Supabase SQL editor

ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS username TEXT;

