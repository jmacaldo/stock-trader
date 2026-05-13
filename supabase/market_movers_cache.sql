-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS market_movers_cache (
  id         TEXT PRIMARY KEY,   -- 'gainers' | 'losers'
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE market_movers_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read market movers"
  ON market_movers_cache FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "upsert market movers"
  ON market_movers_cache FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Schedule the edge function every minute (pg_cron + pg_net must be enabled)
--
-- select cron.schedule(
--   'fetch-market-movers',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url     := 'https://czeluybjhridyhvtywka.supabase.co/functions/v1/fetch-market-movers',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZWx1eWJqaHJpZHlodnR5d2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjE2ODcsImV4cCI6MjA5Mzk5NzY4N30.yIjkwrhHHHwug5qyM9-t40jivtecq1MvRHT9eWyh1TQ',
--       'Content-Type',  'application/json'
--     ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );
