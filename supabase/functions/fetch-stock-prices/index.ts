import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STALE_MS = 15 * 60 * 1000

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // All distinct symbols across every user's portfolio
  const { data: positions, error: posErr } = await supabase
    .from('portfolio')
    .select('symbol')

  if (posErr) return json({ error: posErr.message }, 500)
  if (!positions?.length) return json({ message: 'No positions to update' })

  const symbols = [...new Set(positions.map((p: { symbol: string }) => p.symbol))]

  // Check which are stale
  const { data: stored } = await supabase
    .from('stock_prices')
    .select('symbol, fetched_at')
    .in('symbol', symbols)

  const storedMap = Object.fromEntries(
    (stored ?? []).map((r: { symbol: string; fetched_at: string }) => [r.symbol, r.fetched_at])
  )

  const now = Date.now()
  const stale = symbols.filter((sym) => {
    const t = storedMap[sym]
    return !t || now - new Date(t).getTime() > STALE_MS
  })

  if (!stale.length) return json({ message: 'All prices are fresh' })

  // Fetch from Yahoo Finance
  const res = await fetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${stale.join(',')}`
  )
  if (!res.ok) return json({ error: `Yahoo Finance HTTP ${res.status}` }, 502)

  const data = await res.json()
  const quotes: { symbol: string; regularMarketPrice?: number }[] =
    data.quoteResponse?.result ?? []

  const updates = quotes
    .filter((q) => q.regularMarketPrice != null)
    .map((q) => ({
      symbol: q.symbol,
      price: q.regularMarketPrice,
      fetched_at: new Date().toISOString(),
    }))

  if (updates.length) {
    const { error: upsertErr } = await supabase
      .from('stock_prices')
      .upsert(updates, { onConflict: 'symbol' })
    if (upsertErr) return json({ error: upsertErr.message }, 500)
  }

  return json({ updated: updates.length, symbols: updates.map((u) => u.symbol) })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
