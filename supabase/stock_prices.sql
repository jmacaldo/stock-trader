-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS stock_prices (
  symbol     TEXT PRIMARY KEY,
  price      NUMERIC NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stock_prices ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all prices
CREATE POLICY "read stock prices"
  ON stock_prices FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can upsert prices (client-side caching)
CREATE POLICY "upsert stock prices"
  ON stock_prices FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Schedule the edge function every 15 minutes (requires pg_cron + pg_net extensions)
-- Enable both extensions first in Supabase dashboard → Database → Extensions
--
-- select cron.schedule(
--   'fetch-stock-prices',
--   '*/15 * * * *',
--   $$
--   select net.http_post(
--     url     := '<YOUR_PROJECT_URL>/functions/v1/fetch-stock-prices',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <YOUR_ANON_KEY>',
--       'Content-Type',  'application/json'
--     ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );
