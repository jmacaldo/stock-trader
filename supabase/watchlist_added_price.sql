-- Run this in the Supabase SQL editor to add added_price and added_at to the watchlist table

ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS added_price NUMERIC;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ DEFAULT now();
