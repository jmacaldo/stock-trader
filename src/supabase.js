import { createClient } from '@supabase/supabase-js'

// Both values are public (anon key is designed for browser use; RLS enforces security)
const SUPABASE_URL = 'https://czeluybjhridyhvtywka.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZWx1eWJqaHJpZHlodnR5d2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjE2ODcsImV4cCI6MjA5Mzk5NzY4N30.yIjkwrhHHHwug5qyM9-t40jivtecq1MvRHT9eWyh1TQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
