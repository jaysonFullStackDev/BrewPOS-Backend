-- Migration 004: Add phone column to users table
-- Run in Supabase SQL Editor

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
