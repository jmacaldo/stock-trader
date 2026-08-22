-- Run this in the Supabase SQL editor

-- Logs every scoring signal the app actually emits (ticker, date, flat/held
-- path, flags, verdict) plus forward returns filled in later by the
-- fill-forward-returns edge function (see supabase/functions/). This is the
-- real population the tool surfaces — no survivorship bias (every symbol a
-- user actually looked at gets logged, delisted or not) and no screen-
-- reconstruction guesswork, unlike backtesting against a hand-assembled
-- historical universe. Same shape as the analysis used to validate/revert the
-- exhaustion pillar, so it can be evaluated with the same ticker-block
-- bootstrap once enough data accumulates (target: 200+ distinct tickers).
--
-- Shared/objective, not user-scoped — same pattern as stock_prices and
-- momentum_scan_results (the signal a symbol produces doesn't depend on which
-- user is looking at it, only on the flat/held path).
CREATE TABLE IF NOT EXISTS signal_log (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL,
  signal_date     DATE NOT NULL,
  path            TEXT NOT NULL CHECK (path IN ('flat', 'held')),
  action          TEXT NOT NULL,
  trend_score     INTEGER NOT NULL,
  momentum_score  INTEGER NOT NULL,
  n_exh           INTEGER NOT NULL,
  n_bear          INTEGER NOT NULL,
  n_reb           INTEGER NOT NULL,
  death_cross     BOOLEAN NOT NULL,
  rsi_turn        BOOLEAN NOT NULL,
  macd_shrink     BOOLEAN NOT NULL,
  at_band         BOOLEAN NOT NULL,
  stretched       BOOLEAN NOT NULL,
  price_at_signal NUMERIC NOT NULL,
  ret3            NUMERIC,
  ret5            NUMERIC,
  ret10           NUMERIC,
  ret20           NUMERIC,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol, signal_date, path)
);

CREATE INDEX IF NOT EXISTS signal_log_pending_idx ON signal_log (signal_date) WHERE ret20 IS NULL;

ALTER TABLE signal_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read signal log"
  ON signal_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "write signal log"
  ON signal_log FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Schedule the backfill job daily (requires pg_cron + pg_net extensions,
-- same as the fetch-stock-prices example in stock_prices.sql):
--
-- select cron.schedule(
--   'fill-forward-returns',
--   '30 21 * * 1-5', -- 9:30pm UTC, weekdays (after US market close)
--   $$
--   select net.http_post(
--     url     := '<YOUR_PROJECT_URL>/functions/v1/fill-forward-returns',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <YOUR_ANON_KEY>',
--       'Content-Type',  'application/json'
--     ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );
