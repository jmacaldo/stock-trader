-- Run this in the Supabase SQL editor

-- Caches the Momentum Scanner's latest hits (fresh RE-ENTRY / TACTICAL REBOUND
-- triggers) so they survive a page reload instead of resetting to "Not
-- scanned yet". Shared across users, like stock_prices — the scan is
-- objective/deterministic, not user-specific. Each scan replaces the full
-- row set (see MomentumScanner.jsx's saveScanResults).
CREATE TABLE IF NOT EXISTS momentum_scan_results (
  symbol        TEXT PRIMARY KEY,
  name          TEXT,
  action        TEXT NOT NULL,
  pillar_total  INTEGER NOT NULL,
  trend_score   INTEGER NOT NULL,
  momentum_score INTEGER NOT NULL,
  rebound_flag  TEXT,
  scanned_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE momentum_scan_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read momentum scan results"
  ON momentum_scan_results FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "write momentum scan results"
  ON momentum_scan_results FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
