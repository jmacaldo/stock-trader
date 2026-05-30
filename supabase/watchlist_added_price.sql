-- Run this in the Supabase SQL editor to add added_price to the watchlist table

ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS added_price NUMERIC;
