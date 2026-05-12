-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS real_holdings (
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol        TEXT NOT NULL,
  shares        NUMERIC NOT NULL,
  cash_invested NUMERIC NOT NULL,
  PRIMARY KEY (user_id, symbol)
);

ALTER TABLE real_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own real holdings"
  ON real_holdings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
